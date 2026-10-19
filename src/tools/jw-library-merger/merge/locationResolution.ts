import type { SqlValue } from "sql.js";
import { describeLocation, type LocationDescriptor } from "../compare/locationDescriptor";
import { identifyRecord } from "../compare/recordIdentity";
import type { UserDataRow, UserDataSnapshot } from "../database/readUserData";

export type LocationSource = "A" | "B";

export interface LocationSourceReference {
  readonly source: LocationSource;
  readonly localKey: string;
  readonly sessionId: string;
  readonly sourcePairId: string;
}

export interface LocationProposal {
  readonly id: string;
  readonly comparisonKey: string;
  readonly sourceA: LocationSourceReference;
  readonly sourceB: LocationSourceReference;
  readonly description: LocationDescriptor["description"];
}

export interface ConfirmedLocationGroup {
  readonly id: string;
  readonly proposalId: string;
  readonly logicalIdentity: string;
  readonly members: readonly [LocationSourceReference, LocationSourceReference];
  readonly comparisonKey: string;
  readonly description: NonNullable<LocationDescriptor["description"]>;
  readonly displayMetadataSource: LocationSource;
  readonly titleA: SqlValue | undefined;
  readonly titleB: SqlValue | undefined;
  readonly omittedTitle: SqlValue | undefined;
}

export interface LocationUnresolvedItem {
  readonly source: LocationSource;
  readonly localKey: string | null;
  readonly reason: string;
  readonly comparisonKey: string | null;
}

export interface LocationDifferentDecision {
  readonly proposalId: string;
  readonly sourceA: LocationSourceReference;
  readonly sourceB: LocationSourceReference;
  readonly canKeepSeparate: boolean;
  readonly blockingReason: string | null;
}

export interface LocationResolutionContext {
  readonly sessionId: string;
  readonly revision: number;
  readonly sourcePairId: string;
  readonly sourceSnapshots: Readonly<{ A: UserDataSnapshot; B: UserDataSnapshot }>;
  readonly proposals: readonly LocationProposal[];
  readonly confirmedGroups: readonly ConfirmedLocationGroup[];
  readonly differentDecisions: readonly LocationDifferentDecision[];
  readonly unresolved: readonly LocationUnresolvedItem[];
}

export type LocationResolutionFailureCode =
  | "stale-context"
  | "unknown-proposal"
  | "changed-source-row"
  | "already-grouped"
  | "invalid-display-source"
  | "unique-key-collision";

export type LocationResolutionResult =
  | { readonly ok: true; readonly context: LocationResolutionContext }
  | { readonly ok: false; readonly code: LocationResolutionFailureCode; readonly reason: string };

function freezeContext(context: LocationResolutionContext): LocationResolutionContext {
  for (const ref of [...context.proposals.flatMap((proposal) => [proposal.sourceA, proposal.sourceB]),
    ...context.confirmedGroups.flatMap((group) => [...group.members])]) Object.freeze(ref);
  for (const proposal of context.proposals) {
    if (proposal.description) Object.freeze(proposal.description);
    Object.freeze(proposal);
  }
  for (const group of context.confirmedGroups) {
    Object.freeze(group.members);
    Object.freeze(group.description);
    Object.freeze(group);
  }
  for (const item of context.unresolved) Object.freeze(item);
  for (const item of context.differentDecisions) Object.freeze(item);
  Object.freeze(context.sourceSnapshots);
  Object.freeze(context.proposals);
  Object.freeze(context.confirmedGroups);
  Object.freeze(context.differentDecisions);
  Object.freeze(context.unresolved);
  return Object.freeze(context);
}

function localKey(snapshot: UserDataSnapshot, row: UserDataRow, index: number): string | null {
  return identifyRecord(snapshot, "Location", row, index).localKey;
}

function ref(source: LocationSource, key: string, sessionId: string, sourcePairId: string): LocationSourceReference {
  return Object.freeze({ source, localKey: key, sessionId, sourcePairId });
}

export function createLocationResolutionContext(
  sessionId: string,
  sourcePairId: string,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
): LocationResolutionContext {
  if (!sessionId || !sourcePairId) throw new Error("Een sessie-ID en bronpaar-ID zijn verplicht.");
  const indexed = [["A", snapshotA], ["B", snapshotB]] as const;
  const sourceRows = indexed.map(([source, snapshot]) => (snapshot.tables.Location?.rows ?? []).map((row, index) => ({
    source,
    snapshot,
    row,
    localKey: localKey(snapshot, row, index),
    descriptor: describeLocation(row),
  })));
  const counts = sourceRows.map((rows) => {
    const map = new Map<string, number>();
    for (const entry of rows) if (entry.descriptor.recordForm && entry.descriptor.comparisonKey) {
      const key = entry.descriptor.comparisonKey;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  });
  const rowsByComparisonKey = sourceRows.map((rows) => {
    const map = new Map<string, typeof rows[number]>();
    for (const entry of rows) {
      const key = entry.descriptor.comparisonKey;
      if (key && !map.has(key)) map.set(key, entry);
    }
    return map;
  });
  const proposals: LocationProposal[] = [];
  const unresolved: LocationUnresolvedItem[] = [];
  for (let side = 0; side < 2; side += 1) {
    for (const entry of sourceRows[side]!) {
      const source = entry.source;
      const otherSide = side === 0 ? 1 : 0;
      const otherSource = source === "A" ? "B" : "A";
      const key = entry.descriptor.comparisonKey;
      if (!entry.descriptor.recordForm || !key) {
        unresolved.push({ source, localKey: entry.localKey, comparisonKey: key,
          reason: entry.descriptor.reason ?? "De plaatsvorm kan niet veilig worden beschreven." });
      } else if (counts[side]!.get(key) !== 1) {
        unresolved.push({ source, localKey: entry.localKey, comparisonKey: key,
          reason: "De volledige plaatsbeschrijving komt meer dan eenmaal voor in deze bron." });
      } else if (counts[otherSide]!.get(key) === 1 && source === "A") {
        const other = rowsByComparisonKey[otherSide]!.get(key);
        const keyA = entry.localKey;
        const keyB = other?.localKey;
        if (keyA && keyB && other?.descriptor.recordForm) proposals.push({
          id: JSON.stringify([keyA, keyB, key]), comparisonKey: key,
          sourceA: ref("A", keyA, sessionId, sourcePairId),
          sourceB: ref("B", keyB, sessionId, sourcePairId),
          description: entry.descriptor.description,
        });
      } else if (counts[otherSide]!.get(key) !== 1) {
        unresolved.push({ source, localKey: entry.localKey, comparisonKey: key,
          reason: counts[otherSide]!.has(key)
            ? `De volledige plaatsbeschrijving komt meer dan eenmaal voor in bron ${otherSource}.`
            : "Er is geen exact overeenkomstige ondersteunde plaats in de andere bron." });
      }
    }
  }
  return freezeContext({
    sessionId, revision: 0, sourcePairId,
    sourceSnapshots: { A: snapshotA, B: snapshotB },
    proposals, confirmedGroups: [], differentDecisions: [], unresolved,
  });
}

function validateCurrentContext(
  context: LocationResolutionContext,
  sessionId: string,
  expectedRevision: number,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
): string | null {
  if (context.sessionId !== sessionId || context.revision !== expectedRevision
    || !isLocationResolutionContextCurrent(context, snapshotA, snapshotB)) {
    return "De sessie, revisie of bronbestanden zijn gewijzigd; deze bevestiging is verouderd.";
  }
  return null;
}

export function isLocationResolutionContextCurrent(
  context: LocationResolutionContext,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
): boolean {
  if (context.sourceSnapshots.A !== snapshotA || context.sourceSnapshots.B !== snapshotB) return false;
  return context.confirmedGroups.every((group) => {
    const rowA = lookup(snapshotA, group.members[0].localKey);
    const rowB = lookup(snapshotB, group.members[1].localKey);
    const descA = rowA ? describeLocation(rowA.row) : null;
    const descB = rowB ? describeLocation(rowB.row) : null;
    return group.members[0].source === "A" && group.members[1].source === "B"
      && group.members.every((member) => member.sessionId === context.sessionId
        && member.sourcePairId === context.sourcePairId)
      && Boolean(descA?.recordForm && descB?.recordForm
        && descA.comparisonKey === group.comparisonKey && descB.comparisonKey === group.comparisonKey);
  }) && context.differentDecisions.every((decision) => {
    const rowA = lookup(snapshotA, decision.sourceA.localKey);
    const rowB = lookup(snapshotB, decision.sourceB.localKey);
    const descA = rowA ? describeLocation(rowA.row) : null;
    const descB = rowB ? describeLocation(rowB.row) : null;
    const canKeepSeparate = Boolean(descA?.comparisonKey && descB?.comparisonKey
      && descA.comparisonKey === descB.comparisonKey
      && !uniqueCollision(rowA!.row, rowB!.row));
    return decision.sourceA.source === "A" && decision.sourceB.source === "B"
      && decision.sourceA.sessionId === context.sessionId && decision.sourceB.sessionId === context.sessionId
      && decision.sourceA.sourcePairId === context.sourcePairId && decision.sourceB.sourcePairId === context.sourcePairId
      && descA?.comparisonKey === descB?.comparisonKey
      && decision.canKeepSeparate === canKeepSeparate;
  });
}

function lookup(snapshot: UserDataSnapshot, key: string): { row: UserDataRow; index: number } | null {
  const rows = snapshot.tables.Location?.rows ?? [];
  for (let index = 0; index < rows.length; index += 1) {
    if (localKey(snapshot, rows[index]!, index) === key) return { row: rows[index]!, index };
  }
  return null;
}

function proposalStillValid(
  proposal: LocationProposal,
  context: LocationResolutionContext,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
): boolean {
  const rowA = lookup(snapshotA, proposal.sourceA.localKey);
  const rowB = lookup(snapshotB, proposal.sourceB.localKey);
  const descA = rowA && describeLocation(rowA.row);
  const descB = rowB && describeLocation(rowB.row);
  return Boolean(rowA && rowB && descA?.recordForm && descB?.recordForm
    && descA.comparisonKey === proposal.comparisonKey
    && descB.comparisonKey === proposal.comparisonKey
    && proposal.sourceA.sessionId === context.sessionId
    && proposal.sourceB.sessionId === context.sessionId
    && proposal.sourceA.sourcePairId === context.sourcePairId
    && proposal.sourceB.sourcePairId === context.sourcePairId);
}

export function confirmLocationProposal(
  context: LocationResolutionContext,
  proposalId: string,
  sessionId: string,
  expectedRevision: number,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
  displayMetadataSource: LocationSource,
): LocationResolutionResult {
  const stale = validateCurrentContext(context, sessionId, expectedRevision, snapshotA, snapshotB);
  if (stale) return { ok: false, code: "stale-context", reason: stale };
  if (displayMetadataSource !== "A" && displayMetadataSource !== "B") return {
    ok: false, code: "invalid-display-source", reason: "Kies bron A of B voor de weergavemetadata.",
  };
  const proposal = context.proposals.find((item) => item.id === proposalId);
  if (!proposal) return { ok: false, code: "unknown-proposal", reason: "Dit koppelingsvoorstel bestaat niet in deze sessie." };
  if (!proposalStillValid(proposal, context, snapshotA, snapshotB)) return {
    ok: false, code: "changed-source-row", reason: "Een bronrij ontbreekt of de volledige plaatsbeschrijving is veranderd.",
  };
  const occupied = new Set(context.confirmedGroups.flatMap((group) => group.members.map((member) => `${member.source}:${member.localKey}`)));
  if (occupied.has(`A:${proposal.sourceA.localKey}`) || occupied.has(`B:${proposal.sourceB.localKey}`)) return {
    ok: false, code: "already-grouped", reason: "Een van deze bronrijen is al aan een andere bevestigde groep gekoppeld.",
  };
  const id = `${context.sessionId}:location:${context.revision + 1}:${proposal.id}`;
  const rowA = lookup(snapshotA, proposal.sourceA.localKey)!;
  const rowB = lookup(snapshotB, proposal.sourceB.localKey)!;
  const group: ConfirmedLocationGroup = {
    id, proposalId, logicalIdentity: id, members: [proposal.sourceA, proposal.sourceB],
    comparisonKey: proposal.comparisonKey,
    description: proposal.description as NonNullable<LocationDescriptor["description"]>,
    displayMetadataSource,
    titleA: rowA.row.Title,
    titleB: rowB.row.Title,
    omittedTitle: displayMetadataSource === "A" ? rowB.row.Title : rowA.row.Title,
  };
  return { ok: true, context: freezeContext({ ...context, revision: context.revision + 1,
    confirmedGroups: [...context.confirmedGroups, group],
    differentDecisions: context.differentDecisions.filter((item) => item.proposalId !== proposalId) }) };
}

export function revokeLocationConfirmation(
  context: LocationResolutionContext,
  groupId: string,
  sessionId: string,
  expectedRevision: number,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
): LocationResolutionResult {
  const stale = validateCurrentContext(context, sessionId, expectedRevision, snapshotA, snapshotB);
  if (stale) return { ok: false, code: "stale-context", reason: stale };
  if (!context.confirmedGroups.some((group) => group.id === groupId)) return {
    ok: false, code: "unknown-proposal", reason: "Deze bevestigde groep bestaat niet in de huidige sessie.",
  };
  return { ok: true, context: freezeContext({ ...context, revision: context.revision + 1,
    confirmedGroups: context.confirmedGroups.filter((group) => group.id !== groupId) }) };
}

function equalNonNull(left: unknown, right: unknown): boolean {
  return left !== null && left !== undefined && right !== null && right !== undefined && left === right;
}

function uniqueCollision(rowA: UserDataRow, rowB: UserDataRow): boolean {
  const primaryUnique = ["BookNumber", "ChapterNumber", "KeySymbol", "MepsLanguage", "Type"];
  if (primaryUnique.every((field) => equalNonNull(rowA[field], rowB[field]))) return true;
  const mediaUnique = ["KeySymbol", "IssueTagNumber", "MepsLanguage", "DocumentId", "Track", "Type"];
  return mediaUnique.every((field) => equalNonNull(rowA[field], rowB[field]))
    && (rowA.Specialty ?? "") === (rowB.Specialty ?? "")
    && (rowA.Edition ?? "") === (rowB.Edition ?? "");
}

export function markLocationDifferent(
  context: LocationResolutionContext,
  proposalId: string,
  sessionId: string,
  expectedRevision: number,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
): LocationResolutionResult {
  const stale = validateCurrentContext(context, sessionId, expectedRevision, snapshotA, snapshotB);
  if (stale) return { ok: false, code: "stale-context", reason: stale };
  const proposal = context.proposals.find((item) => item.id === proposalId);
  if (!proposal || !proposalStillValid(proposal, context, snapshotA, snapshotB)) return {
    ok: false, code: "changed-source-row", reason: "Het voorstel ontbreekt of een bronbeschrijving is veranderd.",
  };
  const rowA = lookup(snapshotA, proposal.sourceA.localKey)!;
  const rowB = lookup(snapshotB, proposal.sourceB.localKey)!;
  const canKeepSeparate = !uniqueCollision(rowA.row, rowB.row);
  const decision: LocationDifferentDecision = {
    proposalId, sourceA: proposal.sourceA, sourceB: proposal.sourceB, canKeepSeparate,
    blockingReason: canKeepSeparate ? null : "De afzonderlijke Location-rijen botsen op een unieke databasesleutel.",
  };
  return { ok: true, context: freezeContext({ ...context, revision: context.revision + 1,
    confirmedGroups: context.confirmedGroups.filter((group) => group.members[0].localKey !== proposal.sourceA.localKey
      && group.members[1].localKey !== proposal.sourceB.localKey),
    differentDecisions: [...context.differentDecisions.filter((item) => item.proposalId !== proposalId), decision] }) };
}

/** Return a session-scoped logical identity only for a validated confirmed source row. */
export function confirmedLocationIdentity(
  context: LocationResolutionContext | undefined,
  snapshot: UserDataSnapshot,
  source: LocationSource,
  row: UserDataRow,
  rowIndex: number,
): string | null {
  if (!context) return null;
  const key = localKey(snapshot, row, rowIndex);
  if (!key) return null;
  const refSource = source;
  return context.confirmedGroups.find((group) => group.members.some((member) =>
    member.source === refSource && member.localKey === key
    && member.sessionId === context.sessionId && member.sourcePairId === context.sourcePairId))?.logicalIdentity ?? null;
}

export function separateLocationIdentity(
  context: LocationResolutionContext | undefined,
  snapshot: UserDataSnapshot,
  source: LocationSource,
  row: UserDataRow,
  rowIndex: number,
): string | null {
  if (!context) return null;
  const key = localKey(snapshot, row, rowIndex);
  if (!key) return null;
  return context.differentDecisions.some((decision) => decision.canKeepSeparate
    && decision.sourceA.sessionId === context.sessionId
    && decision.sourceB.sessionId === context.sessionId
    && decision.sourceA.sourcePairId === context.sourcePairId
    && decision.sourceB.sourcePairId === context.sourcePairId
    && (source === "A" ? decision.sourceA.localKey === key : decision.sourceB.localKey === key))
    ? `${context.sessionId}:location-separate:${source}:${key}` : null;
}
