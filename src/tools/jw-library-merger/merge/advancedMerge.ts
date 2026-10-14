import type { SqlValue } from "sql.js";
import { canKeepBothTextFragments, mergeNoteText, type TextGranularity } from "../compare/mergeNoteText";
import { identifyRecord } from "../compare/recordIdentity";
import { normalizeTimestamp } from "../compare/normalizeTimestamp";
import type { AdvancedMergePreview } from "./prepareSimpleMerge";
import type {
  MergeConfidence,
  MergeRowCandidate,
  SimpleMergeChoice,
  SimpleMergeInformationLoss,
  SimpleMergeRecord,
  SimpleMergeResult,
} from "./simpleMerge";
import type { MergeDecisionAction } from "../types";

export type NoteTextResolution = { readonly choice: "a" | "b" | "both" | "manual"; readonly manualText?: string };
export interface NoteTextReviewState {
  readonly granularity: TextGranularity;
  readonly resolutions: Readonly<Record<string, NoteTextResolution>>;
}
export const emptyNoteTextReviewState: NoteTextReviewState = { granularity: "block", resolutions: {} };

export interface AdvancedMergeReviewState {
  readonly choices: Readonly<Record<string, MergeDecisionAction>>;
  readonly noteTextStates: Readonly<Record<string, NoteTextReviewState>>;
  readonly reviewConfirmed: boolean;
}

export function advancedDecisionKey(tableName: string, identityKey: string | null, comparisonIndex: number): string {
  return `${tableName}:${identityKey ?? "onbekend"}:${comparisonIndex}`;
}

function equalValue(a: SqlValue | undefined, b: SqlValue | undefined): boolean {
  if (a instanceof Uint8Array && b instanceof Uint8Array) return a.length === b.length && a.every((value, index) => value === b[index]);
  return a === b;
}

function rowFor(preview: AdvancedMergePreview, recordIndex: number, side: "A" | "B"): Record<string, SqlValue> | null {
  return preview.comparison.rowReferences[recordIndex]?.[side === "A" ? "sourceA" : "sourceB"] ?? null;
}

function sourceCandidate(preview: AdvancedMergePreview, decisionIndex: number, side: "A" | "B", row: Record<string, SqlValue>): MergeRowCandidate {
  const source = preview.sources[side === "A" ? 0 : 1];
  const tableName = preview.comparison.records[decisionIndex]!.tableName;
  const identity = identifyRecord(source.snapshot, tableName, row);
  const localKey = identity.localKey ?? (tableName === "LastModified" && source.snapshot.tables.LastModified?.rowCount === 1
    ? '["LastModified","singleton"]'
    : null);
  return { source: side, fileName: source.fileName, localKey, row };
}

function textInputs(record: AdvancedMergePreview["comparison"]["records"][number]) {
  if (record.tableName !== "Note" || record.logicalIdentity.confidence !== "stable") return null;
  const difference = record.differences.find((entry) => entry.path === "Content");
  const base = difference?.baseValue;
  const a = difference?.valueA;
  const b = difference?.valueB;
  if (!base || base.presence !== "present" || typeof base.value !== "string"
    || !a || a.presence !== "present" || typeof a.value !== "string"
    || !b || b.presence !== "present" || typeof b.value !== "string") return null;
  return { base: base.value, a: a.value, b: b.value };
}

function resolveNoteText(
  record: AdvancedMergePreview["comparison"]["records"][number],
  state: NoteTextReviewState | undefined,
): { readonly text: string; readonly usedSources: readonly ("A" | "B")[] } | null {
  const inputs = textInputs(record);
  if (!inputs) return null;
  const granularity = state?.granularity ?? "block";
  const plan = mergeNoteText(inputs.base, inputs.a, inputs.b, granularity);
  let text = "";
  const usedSources = new Set<"A" | "B">();
  for (const segment of plan.segments) {
    if (segment.kind === "unchanged") {
      text += segment.baseText;
      continue;
    }
    if (segment.kind === "automatic") {
      text += segment.textA;
      if (segment.source === "A" || segment.source === "both") usedSources.add("A");
      if (segment.source === "B" || segment.source === "both") usedSources.add("B");
      continue;
    }
    const resolution = state?.resolutions[`${granularity}:${segment.id}`];
    if (!resolution) return null;
    if (resolution.choice === "a") { text += segment.textA; usedSources.add("A"); }
    else if (resolution.choice === "b") { text += segment.textB; usedSources.add("B"); }
    else if (resolution.choice === "both") {
      if (!canKeepBothTextFragments(segment.textA, segment.textB)) return null;
      text += segment.textA + segment.textB;
      usedSources.add("A");
      usedSources.add("B");
    } else {
      if (resolution.manualText === undefined) return null;
      text += resolution.manualText;
      usedSources.add("A");
      usedSources.add("B");
    }
  }
  return { text, usedSources: [...usedSources] };
}

function addLoss(
  losses: SimpleMergeInformationLoss[],
  tableName: string,
  identityKey: string | null,
  field: string,
  valueNotRetained: SqlValue | undefined,
  omittedFrom: "A" | "B",
  retainedValue: SqlValue | undefined,
  retainedFrom: "A" | "B" | null,
  reason: string,
): void {
  if (equalValue(valueNotRetained, retainedValue)) return;
  losses.push({ kind: "field", tableName, identityKey, field, valueNotRetained, omittedFrom, retainedValue, retainedFrom, reason });
}

/**
 * Converts the current Advanced review state into the database builder's
 * source-attributed plan. It fails closed for open decisions, ambiguous
 * identities, unsupported actions, or field combinations that cannot be
 * resolved without guessing. The base snapshot is never an output source.
 */
export function buildAdvancedMergePlan(
  preview: AdvancedMergePreview,
  state: AdvancedMergeReviewState,
): SimpleMergeResult {
  const records: SimpleMergeRecord[] = [];
  const choices: SimpleMergeChoice[] = [];
  const informationLoss: SimpleMergeInformationLoss[] = [];
  const unresolved: SimpleMergeResult["report"]["unresolved"][number][] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  const addUnresolved = (tableName: string, identityKey: string | null, reason: string, sourceA: MergeRowCandidate | null, sourceB: MergeRowCandidate | null) => {
    unresolved.push({ tableName, identityKey, reason, sourceA, sourceB });
    records.push({ tableName, identityKey, identityStatus: "uncertain", comparisonStatus: "uncertain-linked", action: "needs-review", selected: null, retainedAlternatives: [sourceA, sourceB].filter((item): item is MergeRowCandidate => item !== null), confidence: "unresolved", rule: reason });
  };

  if (!state.reviewConfirmed) {
    warnings.push("Geavanceerde beslissingen zijn nog niet definitief afgerond.");
    return makeResult("needs-review", records, choices, informationLoss, warnings, unresolved, preview);
  }

  for (const [index, decision] of preview.comparison.records.entries()) {
    const identityKey = decision.logicalIdentity.key;
    const uniqueKey = `${decision.tableName}\u0000${identityKey ?? `unknown:${index}`}`;
    if (seen.has(uniqueKey)) {
      addUnresolved(decision.tableName, identityKey, "Meerdere reviewrecords delen dezelfde identiteit; bronrijen zijn niet eenduidig te koppelen.", null, null);
      continue;
    }
    seen.add(uniqueKey);

    const candidateA = rowFor(preview, index, "A");
    const candidateB = rowFor(preview, index, "B");
    const sourceA = candidateA ? sourceCandidate(preview, index, "A", candidateA) : null;
    const sourceB = candidateB ? sourceCandidate(preview, index, "B", candidateB) : null;
    const reviewKey = advancedDecisionKey(decision.tableName, identityKey, index);
    const action = state.choices[reviewKey];
    if (!identityKey || (decision.sourceA && !sourceA) || (decision.sourceB && !sourceB)) {
      addUnresolved(decision.tableName, identityKey, "Een bronrecord heeft geen unieke, herleidbare identiteit; de databasebouwer kan de rij en koppelingen niet veilig toewijzen.", sourceA, sourceB);
      continue;
    }

    if (action && action !== "take-a" && action !== "take-b" && action !== "combine-non-overlapping") {
      addUnresolved(decision.tableName, identityKey, `De gekozen actie ${action} heeft geen veilige uitvoerregel in deze POC.`, sourceA, sourceB);
      continue;
    }
    let selected: MergeRowCandidate | null = null;
    let omit = false;
    let confidence: MergeConfidence = "identical";
    let reason = decision.reason;

    if (action === "take-a" || action === "take-b") {
      selected = action === "take-a" ? sourceA : sourceB;
      if (!selected) omit = true;
      confidence = "unresolved";
      reason = `Gebruiker koos expliciet bron ${action === "take-a" ? "A" : "B"}.`;
    } else if (decision.outcome === "conflict" || decision.outcome === "uncertain") {
      const resolvedText = decision.conflictStatus === "confirmed"
        && decision.overlappingChanges.every((change) => change.path === "Content")
        ? resolveNoteText(decision, state.noteTextStates[reviewKey])
        : null;
      if (!resolvedText) {
        addUnresolved(decision.tableName, identityKey, "Voor dit conflict ontbreekt een uitvoerbare A/B-keuze of volledig opgeloste notitietekst.", sourceA, sourceB);
        continue;
      }
      if (!sourceA || !sourceB || decision.tableName !== "Note") {
        addUnresolved(decision.tableName, identityKey, "De opgeloste notitietekst kan niet aan twee stabiele bronrijen worden gekoppeld.", sourceA, sourceB);
        continue;
      }
      const merged = { ...sourceA.row, Content: resolvedText.text };
      selected = { ...sourceA, row: merged, fieldSources: { Content: "A" } };
      confidence = "unresolved";
      reason = "Notitietekst opgebouwd uit automatische, gekozen en handmatige blok-/regelbesluiten.";
      const originalA = sourceA.row.Content;
      const originalB = sourceB.row.Content;
      addLoss(informationLoss, decision.tableName, identityKey, "Content", originalA, "A", resolvedText.text, null, "Notitietekst is op blok-/regelniveau samengesteld.");
      addLoss(informationLoss, decision.tableName, identityKey, "Content", originalB, "B", resolvedText.text, null, "Notitietekst is op blok-/regelniveau samengesteld.");
    } else if (decision.outcome === "non-overlapping" || action === "combine-non-overlapping") {
      if (!sourceA || !sourceB || decision.logicalIdentity.confidence !== "stable") {
        addUnresolved(decision.tableName, identityKey, "Niet-overlappende wijzigingen kunnen alleen worden gecombineerd voor één stabiele rij die in beide bronnen aanwezig is.", sourceA, sourceB);
        continue;
      }
      const mergedRow: Record<string, SqlValue> = { ...sourceA.row };
      const fieldSources: Record<string, "A" | "B"> = {};
      let canCombine = true;
      for (const difference of decision.differences) {
        if (equalValue(sourceA.row[difference.path], sourceB.row[difference.path])) continue;
        const changeA = difference.changedFromBase.A;
        const changeB = difference.changedFromBase.B;
        let chosen: "A" | "B" | null = changeA === true && changeB !== true ? "A"
          : changeB === true && changeA !== true ? "B"
            : changeA === true && changeB === true && equalValue(sourceA.row[difference.path], sourceB.row[difference.path]) ? "A"
              : null;
        if (difference.path === "Content" && decision.tableName === "Note") {
          const resolved = resolveNoteText(decision, state.noteTextStates[reviewKey]);
          if (resolved) {
            mergedRow.Content = resolved.text;
            const exactSource = resolved.usedSources.length === 1 ? resolved.usedSources[0] : null;
            // The database builder only needs a single source for foreign-key
            // fields. Note.Content has no such relation; use A as deterministic
            // row provenance when both sources contributed to composed text.
            fieldSources.Content = exactSource ?? "A";
            addLoss(informationLoss, decision.tableName, identityKey, "Content", sourceA.row.Content, "A", resolved.text,
              resolved.text === sourceA.row.Content ? "A" : resolved.text === sourceB.row.Content ? "B" : null,
              "Notitietekst is samengesteld uit de automatische, gekozen of handmatige blok-/regelbesluiten.");
            addLoss(informationLoss, decision.tableName, identityKey, "Content", sourceB.row.Content, "B", resolved.text,
              resolved.text === sourceA.row.Content ? "A" : resolved.text === sourceB.row.Content ? "B" : null,
              "Notitietekst is samengesteld uit de automatische, gekozen of handmatige blok-/regelbesluiten.");
            continue;
          }
        }
        if (!chosen) { canCombine = false; break; }
        mergedRow[difference.path] = (chosen === "A" ? sourceA.row[difference.path] : sourceB.row[difference.path]) ?? null;
        fieldSources[difference.path] = chosen;
        addLoss(informationLoss, decision.tableName, identityKey, difference.path,
          chosen === "A" ? sourceB.row[difference.path] : sourceA.row[difference.path],
          chosen === "A" ? "B" : "A", mergedRow[difference.path], chosen,
          "De andere bronwaarde is niet gekozen voor dit veld.");
      }
      if (!canCombine) {
        addUnresolved(decision.tableName, identityKey, "De veldwijzigingen zijn niet aantoonbaar onafhankelijk; automatisch combineren is geblokkeerd.", sourceA, sourceB);
        continue;
      }
      selected = { ...sourceA, row: mergedRow, fieldSources };
      confidence = "unresolved";
      reason = "Verschillende veldwijzigingen zijn gecombineerd; relaties volgen per veld de gekozen bron.";
    } else {
      const preferred = decision.outcome === "changed-in-a" ? sourceA
        : decision.outcome === "changed-in-b" ? sourceB
          : sourceA ?? sourceB;
      // A one-sided deletion is not applied implicitly; keep the surviving A/B row.
      selected = preferred ?? sourceA ?? sourceB;
      if (!selected) {
        warnings.push(`${decision.tableName} (${identityKey}): record ontbreekt in A en B en wordt niet uit de vergelijkingsbasis overgenomen.`);
        continue;
      }
      if ((decision.outcome === "changed-in-a" && !sourceA && sourceB)
        || (decision.outcome === "changed-in-b" && !sourceB && sourceA)) {
        warnings.push(`${decision.tableName} (${identityKey}): een eenzijdige verwijdering is niet expliciet gekozen; de beschikbare bronrij blijft behouden.`);
      }
      if (decision.outcome === "changed-in-a" || decision.outcome === "changed-in-b") confidence = "unresolved";
    }

    const selectedSide = selected?.source ?? null;
    if (omit && !identityKey) {
      addUnresolved(decision.tableName, identityKey, "De ontbrekende keuze kan niet veilig aan een unieke cross-backupidentiteit worden gekoppeld.", sourceA, sourceB);
      continue;
    }
    if (selected && !selected.localKey) {
      addUnresolved(decision.tableName, identityKey, "De gekozen bronrij heeft geen bruikbare lokale sleutel voor database- en relatieherstel.", sourceA, sourceB);
      continue;
    }
    choices.push({ tableName: decision.tableName, identityKey, selectedSource: selectedSide, confidence, reason });
    if (omit) {
      const values = [sourceA, sourceB].filter((item): item is MergeRowCandidate => item !== null);
      for (const candidate of values) {
        for (const [field, value] of Object.entries(candidate.row)) {
          addLoss(informationLoss, decision.tableName, identityKey, field, value, candidate.source, undefined, null, `Record bewust weggelaten door keuze voor de ontbrekende waarde in bron ${selectedSide === null ? (action === "take-a" ? "A" : "B") : selectedSide}.`);
        }
      }
      records.push({ tableName: decision.tableName, identityKey, identityStatus: decision.logicalIdentity.confidence, comparisonStatus: candidateA && candidateB ? "changed" : candidateA ? "only-in-a" : "only-in-b", action: "omit", selected: null, retainedAlternatives: values, confidence: "unresolved", rule: reason });
    } else if (selected) {
      const presenceStatus = candidateA && candidateB ? decision.outcome === "unchanged" || decision.outcome === "same-change" ? "equal" : "changed"
        : candidateA ? "only-in-a" : "only-in-b";
      records.push({ tableName: decision.tableName, identityKey, identityStatus: decision.logicalIdentity.confidence, comparisonStatus: presenceStatus, action: "keep-one", selected, retainedAlternatives: [], confidence, rule: reason });
      for (const difference of decision.differences) {
        const output = selected.row[difference.path];
        if (candidateA) addLoss(informationLoss, decision.tableName, identityKey, difference.path, candidateA[difference.path], "A", output, selected.fieldSources?.[difference.path] ?? selected.source, reason);
        if (candidateB) addLoss(informationLoss, decision.tableName, identityKey, difference.path, candidateB[difference.path], "B", output, selected.fieldSources?.[difference.path] ?? selected.source, reason);
      }
    }
  }

  if (!state.reviewConfirmed && unresolved.length === 0) unresolved.push({ tableName: "Review", identityKey: null, reason: "Geavanceerde beslissingen zijn nog niet afgerond.", sourceA: null, sourceB: null });
  return makeResult(unresolved.length ? "needs-review" : "ready", records, choices, informationLoss, warnings, unresolved, preview);
}

function makeResult(
  status: "ready" | "needs-review",
  records: readonly SimpleMergeRecord[],
  choices: readonly SimpleMergeChoice[],
  informationLoss: readonly SimpleMergeInformationLoss[],
  warnings: readonly string[],
  unresolved: SimpleMergeResult["report"]["unresolved"],
  preview: AdvancedMergePreview,
): SimpleMergeResult {
  const normalize = (sourceIndex: 0 | 1) => {
    const snapshot = preview.sources[sourceIndex].snapshot;
    return {
      fileName: snapshot.sourceFileName,
      databaseTimestamp: normalizeTimestamp(snapshot.modificationTimes.databaseLastModified),
      manifestTimestamp: normalizeTimestamp(snapshot.modificationTimes.manifestDatabaseLastModified),
    };
  };
  // The display layer already has timestamp evidence on each decision. The
  // adapter keeps raw source strings here and does not reclassify timestamps.
  return { status, records, report: { sourceA: normalize(0), sourceB: normalize(1), choices, informationLoss, warnings, unresolved } };
}
