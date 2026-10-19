import type { LoadedJwLibrary } from "../archive/readJwLibrary";
import { identifyRecord } from "../compare/recordIdentity";
import type { UserDataRow, UserDataSnapshot } from "../database/readUserData";
import {
  confirmedLocationIdentity,
  isLocationResolutionContextCurrent,
  type LocationResolutionContext,
  type LocationSource,
} from "./locationResolution";

export interface PlaylistSourceReference {
  readonly source: LocationSource;
  readonly localKey: string;
  readonly playlistItemId: number;
  readonly sessionId: string;
  readonly sourcePairId: string;
}

export interface PlaylistStructureSummary {
  readonly label: string;
  readonly fields: readonly { readonly label: string; readonly value: string }[];
  readonly accuracy: string;
  readonly media: readonly { readonly fileName: string; readonly path: string; readonly mimeType: string; readonly bytes: number }[];
  readonly locations: readonly string[];
  readonly markers: readonly string[];
  readonly tags: readonly string[];
}

export interface PlaylistProposal {
  readonly id: string;
  readonly structuralKey: string;
  readonly sourceA: PlaylistSourceReference;
  readonly sourceB: PlaylistSourceReference;
  readonly summaryA: PlaylistStructureSummary;
  readonly summaryB: PlaylistStructureSummary;
  readonly canKeepSeparate: boolean;
  readonly blockingReason: string | null;
}

export interface ConfirmedPlaylistGroup {
  readonly id: string;
  readonly proposalId: string;
  readonly logicalIdentity: string;
  readonly members: readonly [PlaylistSourceReference, PlaylistSourceReference];
}

export interface DifferentPlaylistDecision {
  readonly proposalId: string;
  readonly sourceA: PlaylistSourceReference;
  readonly sourceB: PlaylistSourceReference;
  readonly canKeepSeparate: boolean;
  readonly blockingReason: string | null;
}

export interface PlaylistUnresolvedItem {
  readonly source: LocationSource;
  readonly localKey: string | null;
  readonly label: string;
  readonly reason: string;
  readonly summary: PlaylistStructureSummary | null;
  readonly canKeepSeparate?: boolean;
}

export interface PlaylistMediaIdentity {
  readonly source: LocationSource;
  readonly localKey: string;
  readonly identity: string;
  readonly stable: boolean;
}

export interface PlaylistResolutionContext {
  readonly sessionId: string;
  readonly sourcePairId: string;
  readonly revision: number;
  readonly locationRevision: number;
  readonly sourceSnapshots: Readonly<{ A: UserDataSnapshot; B: UserDataSnapshot }>;
  readonly sourceLibraries: Readonly<{ A: LoadedJwLibrary; B: LoadedJwLibrary }>;
  readonly locationResolution: LocationResolutionContext;
  readonly proposals: readonly PlaylistProposal[];
  readonly items: readonly PlaylistSourceReference[];
  readonly confirmedGroups: readonly ConfirmedPlaylistGroup[];
  readonly differentDecisions: readonly DifferentPlaylistDecision[];
  readonly keptSeparate: readonly PlaylistSourceReference[];
  readonly mediaIdentities: readonly PlaylistMediaIdentity[];
  readonly unresolved: readonly PlaylistUnresolvedItem[];
}

const playlistContextValidation = new WeakMap<PlaylistResolutionContext, boolean>();

export type PlaylistResolutionResult =
  | { readonly ok: true; readonly context: PlaylistResolutionContext }
  | { readonly ok: false; readonly code: "stale-context" | "unknown-proposal" | "changed-source" | "cannot-keep-separate"; readonly reason: string };

interface MediaEvidence {
  readonly row: UserDataRow;
  readonly localKey: string;
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly signature: string;
}

interface PlaylistEvidence {
  readonly reference: PlaylistSourceReference;
  readonly summary: PlaylistStructureSummary;
  readonly structuralKey: string;
  readonly payloads: readonly Uint8Array[];
  readonly media: readonly MediaEvidence[];
}

function freezeContext(context: PlaylistResolutionContext): PlaylistResolutionContext {
  for (const proposal of context.proposals) {
    Object.freeze(proposal.sourceA);
    Object.freeze(proposal.sourceB);
    Object.freeze(proposal.summaryA.fields);
    Object.freeze(proposal.summaryA.media);
    Object.freeze(proposal.summaryA.locations);
    Object.freeze(proposal.summaryA.markers);
    Object.freeze(proposal.summaryA.tags);
    Object.freeze(proposal.summaryA);
    Object.freeze(proposal.summaryB.fields);
    Object.freeze(proposal.summaryB.media);
    Object.freeze(proposal.summaryB.locations);
    Object.freeze(proposal.summaryB.markers);
    Object.freeze(proposal.summaryB.tags);
    Object.freeze(proposal.summaryB);
    Object.freeze(proposal);
  }
  for (const group of context.confirmedGroups) {
    Object.freeze(group.members);
    Object.freeze(group);
  }
  for (const decision of context.differentDecisions) Object.freeze(decision);
  for (const item of context.keptSeparate) Object.freeze(item);
  for (const identity of context.mediaIdentities) Object.freeze(identity);
  for (const item of context.unresolved) Object.freeze(item);
  Object.freeze(context.sourceSnapshots);
  Object.freeze(context.sourceLibraries);
  Object.freeze(context.proposals);
  Object.freeze(context.items);
  Object.freeze(context.confirmedGroups);
  Object.freeze(context.differentDecisions);
  Object.freeze(context.keptSeparate);
  Object.freeze(context.mediaIdentities);
  Object.freeze(context.unresolved);
  playlistContextValidation.set(context, true);
  return Object.freeze(context);
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return "niet opgegeven";
  if (value instanceof Uint8Array) return `binaire waarde (${value.byteLength} bytes)`;
  return String(value);
}

function safeArchivePath(path: string): boolean {
  return Boolean(path) && path === path.trim() && !path.startsWith("/") && !path.includes("\\")
    && !/[\u0000-\u001f]/.test(path)
    && path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".." && !segment.includes(":"));
}

function exactBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function localRowKey(snapshot: UserDataSnapshot, tableName: string, row: UserDataRow): string | null {
  return identifyRecord(snapshot, tableName, row).localKey;
}

const rowsByIdCache = new WeakMap<UserDataSnapshot, Map<string, Map<unknown, UserDataRow>>>();

function byId(snapshot: UserDataSnapshot, tableName: string, idField: string, id: unknown): UserDataRow | null {
  if (id === null || id === undefined) return null;
  let tableIndexes = rowsByIdCache.get(snapshot);
  if (!tableIndexes) { tableIndexes = new Map(); rowsByIdCache.set(snapshot, tableIndexes); }
  const key = `${tableName}\u0000${idField}`;
  let rows = tableIndexes.get(key);
  if (!rows) {
    rows = new Map();
    for (const row of snapshot.tables[tableName]?.rows ?? []) {
      const value = row[idField];
      if (value !== null && value !== undefined && !rows.has(value)) rows.set(value, row);
    }
    tableIndexes.set(key, rows);
  }
  return rows.get(id) ?? null;
}

function groupRowsBy(rows: readonly UserDataRow[], field: string): Map<unknown, UserDataRow[]> {
  const grouped = new Map<unknown, UserDataRow[]>();
  for (const row of rows) {
    const key = row[field];
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }
  return grouped;
}

function indexRowsBy(snapshot: UserDataSnapshot, tableName: string, field: string): void {
  const tableIndexes = rowsByIdCache.get(snapshot);
  if (!tableIndexes) return;
  const key = `${tableName}\u0000${field}`;
  if (tableIndexes.has(key)) return;
  const rows = new Map<unknown, UserDataRow>();
  for (const row of snapshot.tables[tableName]?.rows ?? []) {
    const value = row[field];
    if (value !== null && value !== undefined && !rows.has(value)) rows.set(value, row);
  }
  tableIndexes.set(key, rows);
}

function confirmedPlace(
  snapshot: UserDataSnapshot,
  source: LocationSource,
  locationId: unknown,
  resolution: LocationResolutionContext,
): string | null {
  const table = snapshot.tables.Location;
  const row = byId(snapshot, "Location", "LocationId", locationId);
  if (!table || !row) return null;
  const index = table.rows.indexOf(row);
  if (index < 0) return null;
  return confirmedLocationIdentity(resolution, snapshot, source, row, index);
}

async function readMedia(
  snapshot: UserDataSnapshot,
  library: LoadedJwLibrary,
  row: UserDataRow,
): Promise<MediaEvidence> {
  const filePath = row.FilePath;
  if (typeof filePath !== "string" || !safeArchivePath(filePath)) throw new Error("Het mediapad ontbreekt of is onveilig.");
  const key = localRowKey(snapshot, "IndependentMedia", row);
  if (!key) throw new Error(`Mediabestand ${filePath} heeft geen brongebonden sleutel.`);
  const entry = library.archive.file(filePath);
  if (!entry || entry.dir) throw new Error(`Mediabestand ${filePath} ontbreekt in het back-uparchief.`);
  const bytes = await entry.async("uint8array");
  const signature = JSON.stringify([
    row.OriginalFilename, row.FilePath, row.MimeType, row.Hash, bytes.byteLength,
  ]);
  return { row, localKey: key, path: filePath, bytes, signature };
}

function contentColumns(snapshot: UserDataSnapshot, tableName: string, row: UserDataRow): readonly unknown[] {
  const table = snapshot.tables[tableName];
  if (!table) return [];
  return table.columns.filter((column) => !table.primaryKey.includes(column.name)
    && !table.foreignKeys.some((key) => key.fromColumn === column.name))
    .map((column) => row[column.name] ?? null);
}

async function describePlaylist(
  snapshot: UserDataSnapshot,
  library: LoadedJwLibrary,
  source: LocationSource,
  item: UserDataRow,
  locationResolution: LocationResolutionContext,
  sessionId: string,
  sourcePairId: string,
  relationships: ReturnType<typeof playlistRelationshipIndexes>,
): Promise<PlaylistEvidence> {
  const itemId = item.PlaylistItemId;
  const localKey = localRowKey(snapshot, "PlaylistItem", item);
  if (!localKey || typeof itemId !== "number") throw new Error("Afspeellijstitem heeft geen unieke lokale sleutel.");
  const reference: PlaylistSourceReference = { source, localKey, playlistItemId: itemId, sessionId, sourcePairId };
  const accuracy = byId(snapshot, "PlaylistItemAccuracy", "PlaylistItemAccuracyId", item.Accuracy);
  if (!accuracy || typeof accuracy.Description !== "string") throw new Error("De nauwkeurigheidsinstelling van het afspeellijstitem ontbreekt.");

  const mediaById = new Map<unknown, MediaEvidence>();
  const payloads: Uint8Array[] = [];
  const referencedMedia: MediaEvidence[] = [];
  const useMedia = async (media: UserDataRow) => {
    const mediaId = media.IndependentMediaId;
    let evidence = mediaById.get(mediaId);
    if (!evidence) {
      evidence = await readMedia(snapshot, library, media);
      mediaById.set(mediaId, evidence);
    }
    referencedMedia.push(evidence);
    payloads.push(evidence.bytes);
    return evidence;
  };

  if (item.ThumbnailFilePath !== null && item.ThumbnailFilePath !== undefined) {
    const thumbnail = byId(snapshot, "IndependentMedia", "FilePath", item.ThumbnailFilePath);
    if (!thumbnail) throw new Error(`Miniatuurmedia ${String(item.ThumbnailFilePath)} ontbreekt in IndependentMedia.`);
    await useMedia(thumbnail);
  }

  const mediaMaps = await Promise.all((relationships.mediaByItem.get(itemId) ?? [])
    .map(async (row) => {
      const media = byId(snapshot, "IndependentMedia", "IndependentMediaId", row.IndependentMediaId);
      if (!media) throw new Error("Een mediarelatie verwijst naar een ontbrekend IndependentMedia-record.");
      const evidence = await useMedia(media);
      return [evidence.signature, contentColumns(snapshot, "IndependentMedia", media), row.DurationTicks];
    }));

  const locationMaps = (relationships.locationsByItem.get(itemId) ?? [])
    .map((row) => {
      const place = confirmedPlace(snapshot, source, row.LocationId, locationResolution);
      if (!place) throw new Error("Een plaatskoppeling is niet door een bevestigde plaatsgroep gedekt.");
      return [place, row.MajorMultimediaType, row.BaseDurationTicks ?? null];
    }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  const markerRows = relationships.markersByItem.get(itemId) ?? [];
  const markerSummaries: string[] = [];
  const markerStructures = markerRows.map((marker) => {
    const markerId = marker.PlaylistItemMarkerId;
    const verseMaps = (relationships.versesByMarker.get(markerId) ?? [])
      .map((row) => row.VerseId).sort((a, b) => String(a).localeCompare(String(b)));
    const paragraphMaps = (relationships.paragraphsByMarker.get(markerId) ?? [])
      .map((row) => [row.MepsDocumentId, row.ParagraphIndex, row.MarkerIndexWithinParagraph])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    markerSummaries.push(`${scalar(marker.Label)} · ${scalar(marker.StartTimeTicks)} ticks · ${verseMaps.length} verskoppeling(en) · ${paragraphMaps.length} alineakoppeling(en)`);
    return [contentColumns(snapshot, "PlaylistItemMarker", marker), verseMaps, paragraphMaps];
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  const tagRows = relationships.tagsByItem.get(itemId) ?? [];
  const tags = tagRows.map((mapping) => {
    const tag = byId(snapshot, "Tag", "TagId", mapping.TagId);
    if (!tag) throw new Error("Een afspeellijstlabel verwijst naar een ontbrekend label.");
    return { structure: [contentColumns(snapshot, "Tag", tag), mapping.Position], label: `${scalar(tag.Name)} · positie ${scalar(mapping.Position)}` };
  }).sort((a, b) => JSON.stringify(a.structure).localeCompare(JSON.stringify(b.structure)));

  const knownPlaylistChildren = new Set([
    "PlaylistItemIndependentMediaMap", "PlaylistItemLocationMap", "PlaylistItemMarker",
    "PlaylistItemMarkerBibleVerseMap", "PlaylistItemMarkerParagraphMap", "TagMap",
  ]);
  const unknownChild = Object.values(snapshot.tables).find((table) =>
    !knownPlaylistChildren.has(table.name)
      && table.foreignKeys.some((key) => key.referencedTable === "PlaylistItem" || key.referencedTable === "PlaylistItemMarker"));
  if (unknownChild) throw new Error(`De afhankelijke tabel ${unknownChild.name} is niet opgenomen in de playlistcontrole.`);

  const fields = [
    { label: "Label", value: scalar(item.Label) },
    { label: "Starttrim", value: scalar(item.StartTrimOffsetTicks) },
    { label: "Eindtrim", value: scalar(item.EndTrimOffsetTicks) },
    { label: "Nauwkeurigheid", value: scalar(accuracy.Description) },
    { label: "Eindactie", value: scalar(item.EndAction) },
    { label: "Miniatuur", value: scalar(item.ThumbnailFilePath) },
  ];
  const mediaSummary = referencedMedia.map((media) => ({
    fileName: String(media.row.OriginalFilename), path: media.path,
    mimeType: String(media.row.MimeType), bytes: media.bytes.byteLength,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const mediaStructure = referencedMedia.map((media) => media.signature)
    .sort((a, b) => a.localeCompare(b));
  const tagStructures = tags.map((tag) => tag.structure);
  const summary: PlaylistStructureSummary = {
    label: typeof item.Label === "string" ? item.Label : "Afspeellijst zonder label",
    fields,
    accuracy: String(accuracy.Description),
    media: mediaSummary,
    locations: locationMaps.map(([place]) => String(place)),
    markers: markerSummaries,
    tags: tags.map((tag) => tag.label),
  };
  const structuralKey = JSON.stringify([
    snapshot.tables.PlaylistItem?.columns
      .filter((column) => !snapshot.tables.PlaylistItem?.primaryKey.includes(column.name) && column.name !== "Accuracy")
      .map((column) => item[column.name] ?? null),
    accuracy.Description,
    item.ThumbnailFilePath ?? null,
    mediaStructure,
    mediaMaps.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    locationMaps,
    markerStructures,
    tagStructures,
  ]);
  return { reference, summary, structuralKey, payloads, media: referencedMedia };
}

function itemKey(reference: PlaylistSourceReference): string {
  return `${reference.source}:${reference.localKey}`;
}

function mediaPathIndex(items: readonly PlaylistEvidence[]): Map<string, PlaylistEvidence[]> {
  const byPath = new Map<string, PlaylistEvidence[]>();
  for (const item of items) for (const media of item.media) {
    const entries = byPath.get(media.path) ?? [];
    entries.push(item);
    byPath.set(media.path, entries);
  }
  return byPath;
}

function payloadsEqual(a: PlaylistEvidence, b: PlaylistEvidence): boolean {
  return a.payloads.length === b.payloads.length
    && a.payloads.every((payload, index) => exactBytesEqual(payload, b.payloads[index]!));
}

function sameMediaMetadata(a: MediaEvidence, b: MediaEvidence): boolean {
  return a.signature === b.signature && exactBytesEqual(a.bytes, b.bytes);
}

function duplicateUniqueTagMapPosition(snapshotA: UserDataSnapshot, a: PlaylistEvidence, snapshotB: UserDataSnapshot, b: PlaylistEvidence): boolean {
  const tagKeys = (snapshot: UserDataSnapshot, id: number) => (groupRowsBy(snapshot.tables.TagMap?.rows ?? [], "PlaylistItemId").get(id) ?? [])
    .flatMap((mapping) => {
      const tag = byId(snapshot, "Tag", "TagId", mapping.TagId);
      return tag ? [`${JSON.stringify(contentColumns(snapshot, "Tag", tag))}:${String(mapping.Position)}`] : [];
    });
  return tagKeys(snapshotA, a.reference.playlistItemId).some((key) => tagKeys(snapshotB, b.reference.playlistItemId).includes(key));
}

function hasMediaPathByteCollision(a: PlaylistEvidence, b: PlaylistEvidence): boolean {
  const right = new Map(b.media.map((media) => [media.path, media]));
  return a.media.some((media) => {
    const other = right.get(media.path);
    return other !== undefined && !exactBytesEqual(media.bytes, other.bytes);
  });
}

function lookupReference(context: PlaylistResolutionContext, snapshot: UserDataSnapshot, source: LocationSource, itemId: unknown): PlaylistSourceReference | null {
  const row = byId(snapshot, "PlaylistItem", "PlaylistItemId", itemId);
  const key = row && localRowKey(snapshot, "PlaylistItem", row);
  if (!key) return null;
  return context.items.find((item) => item.source === source && item.localKey === key) ?? null;
}

function withContext(context: PlaylistResolutionContext, patch: Partial<PlaylistResolutionContext>): PlaylistResolutionContext {
  return freezeContext({ ...context, ...patch, revision: context.revision + 1 });
}

export async function createPlaylistResolutionContext(
  sessionId: string,
  sourcePairId: string,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
  libraryA: LoadedJwLibrary,
  libraryB: LoadedJwLibrary,
  locationResolution: LocationResolutionContext,
): Promise<PlaylistResolutionContext> {
  const [structuresA, structuresB] = await Promise.all([
    buildStructures(snapshotA, libraryA, "A", locationResolution, sessionId, sourcePairId),
    buildStructures(snapshotB, libraryB, "B", locationResolution, sessionId, sourcePairId),
  ]);
  const unresolved = [...structuresA.issues, ...structuresB.issues];
  const byKeyA = new Map<string, PlaylistEvidence[]>();
  const byKeyB = new Map<string, PlaylistEvidence[]>();
  for (const item of structuresA.items) byKeyA.set(item.structuralKey, [...(byKeyA.get(item.structuralKey) ?? []), item]);
  for (const item of structuresB.items) byKeyB.set(item.structuralKey, [...(byKeyB.get(item.structuralKey) ?? []), item]);
  const proposals: PlaylistProposal[] = [];
  const paired = new Set<string>();
  for (const key of new Set([...byKeyA.keys(), ...byKeyB.keys()])) {
    const left = byKeyA.get(key) ?? [];
    const right = byKeyB.get(key) ?? [];
    if (left.length > 1 || right.length > 1) {
      for (const evidence of [...left, ...right]) unresolved.push({ source: evidence.reference.source,
        localKey: evidence.reference.localKey, label: evidence.summary.label,
        reason: "Deze volledige afspeellijststructuur komt meer dan eenmaal voor; er wordt geen koppeling voorgesteld.",
        summary: evidence.summary });
      continue;
    }
    if (left.length === 1 && right.length === 1) {
      const a = left[0]!;
      const b = right[0]!;
      paired.add(itemKey(a.reference)); paired.add(itemKey(b.reference));
      if (!payloadsEqual(a, b)) {
        const pathCollision = hasMediaPathByteCollision(a, b);
        const reason = pathCollision
          ? "Hetzelfde ZIP-mediapad bevat verschillende bytes; geen van beide playlistsets kan veilig afzonderlijk in één archief worden geplaatst."
          : "De media-inhoud wijkt byte voor byte af; gelijke metadata of hashes zijn geen bewijs van dezelfde inhoud.";
        unresolved.push({ source: "A", localKey: a.reference.localKey, label: a.summary.label,
          reason, summary: a.summary, canKeepSeparate: !pathCollision });
        unresolved.push({ source: "B", localKey: b.reference.localKey, label: b.summary.label,
          reason, summary: b.summary, canKeepSeparate: !pathCollision });
        continue;
      }
      const pathCollision = hasMediaPathByteCollision(a, b);
      const tagCollision = duplicateUniqueTagMapPosition(snapshotA, a, snapshotB, b);
      const blockingReason = pathCollision
        ? "Dezelfde ZIP-mediapaden bevatten verschillende bytes; afzonderlijk behoud botst met het unieke archiefpad."
        : tagCollision ? "De afspeellijstlabels botsen op de unieke TagId + Position-sleutel." : null;
      proposals.push({ id: JSON.stringify([sourcePairId, a.reference.localKey, b.reference.localKey, key]),
        structuralKey: key, sourceA: a.reference, sourceB: b.reference,
        summaryA: a.summary, summaryB: b.summary, canKeepSeparate: !pathCollision && !tagCollision,
        blockingReason });
    }
  }
  const allItems = [...structuresA.items, ...structuresB.items];
  const unresolvedKeys = new Set(unresolved.map((item) => `${item.source}:${item.localKey}`));
  for (const evidence of allItems) {
    if (paired.has(itemKey(evidence.reference))) continue;
    if (unresolvedKeys.has(itemKey(evidence.reference))) continue;
    unresolved.push({ source: evidence.reference.source, localKey: evidence.reference.localKey,
      label: evidence.summary.label,
      reason: "Er is geen unieke volledige overeenkomst in de andere bron. Vergelijk de hele structuur; automatische koppeling is niet beschikbaar.",
      summary: evidence.summary });
    unresolvedKeys.add(itemKey(evidence.reference));
  }

  const itemsByLocalKey = new Map(allItems.map((item) => [`${item.reference.source}:${item.reference.localKey}`, item]));
  const mediaPathsA = mediaPathIndex(structuresA.items);
  const mediaPathsB = mediaPathIndex(structuresB.items);
  for (let index = 0; index < unresolved.length; index++) {
    const issue = unresolved[index]!;
    const own = itemsByLocalKey.get(`${issue.source}:${issue.localKey}`);
    if (!own) continue;
    const otherByPath = issue.source === "A" ? mediaPathsB : mediaPathsA;
    const pathConflict = own.media.some((media) => (otherByPath.get(media.path) ?? [])
      .some((candidate) => candidate.media.some((otherMedia) =>
        otherMedia.path === media.path && !sameMediaMetadata(media, otherMedia))));
    if (pathConflict) unresolved[index] = { ...issue, canKeepSeparate: false,
      reason: "Hetzelfde ZIP-mediapad wordt met afwijkende media-inhoud of metadata gebruikt; afzonderlijke uitvoerrijen zouden het unieke mediapad laten botsen." };
  }

  const mediaIdentities = createMediaIdentities(structuresA.items, structuresB.items, sourcePairId);
  return freezeContext({
    sessionId, sourcePairId, revision: 0, locationRevision: locationResolution.revision,
    sourceSnapshots: { A: snapshotA, B: snapshotB },
    sourceLibraries: { A: libraryA, B: libraryB }, locationResolution,
    proposals,
    items: [
      ...structuresA.items.map((item) => item.reference),
      ...structuresB.items.map((item) => item.reference),
      ...structuresA.issues.flatMap((item) => item.localKey ? [{ source: "A" as const, localKey: item.localKey,
        playlistItemId: Number(snapshotA.tables.PlaylistItem?.rows.find((row) => localRowKey(snapshotA, "PlaylistItem", row) === item.localKey)?.PlaylistItemId), sessionId, sourcePairId }] : []),
      ...structuresB.issues.flatMap((item) => item.localKey ? [{ source: "B" as const, localKey: item.localKey,
        playlistItemId: Number(snapshotB.tables.PlaylistItem?.rows.find((row) => localRowKey(snapshotB, "PlaylistItem", row) === item.localKey)?.PlaylistItemId), sessionId, sourcePairId }] : []),
    ],
    confirmedGroups: [], differentDecisions: [], keptSeparate: [], mediaIdentities, unresolved,
  });
}

async function buildStructures(
  snapshot: UserDataSnapshot,
  library: LoadedJwLibrary,
  source: LocationSource,
  locationResolution: LocationResolutionContext,
  sessionId: string,
  sourcePairId: string,
): Promise<{ items: PlaylistEvidence[]; issues: PlaylistUnresolvedItem[] }> {
  for (const [tableName, field] of [
    ["PlaylistItemAccuracy", "PlaylistItemAccuracyId"], ["IndependentMedia", "IndependentMediaId"],
    ["IndependentMedia", "FilePath"], ["PlaylistItem", "PlaylistItemId"], ["Location", "LocationId"], ["Tag", "TagId"],
  ] as const) indexRowsBy(snapshot, tableName, field);
  const relationships = playlistRelationshipIndexes(snapshot);
  const items: PlaylistEvidence[] = [];
  const issues: PlaylistUnresolvedItem[] = [];
  for (const row of snapshot.tables.PlaylistItem?.rows ?? []) {
    const localKey = localRowKey(snapshot, "PlaylistItem", row);
    try {
      items.push(await describePlaylist(snapshot, library, source, row, locationResolution, sessionId, sourcePairId, relationships));
    } catch (cause) {
      issues.push({ source, localKey, label: typeof row.Label === "string" ? row.Label : "Afspeellijst zonder label",
        reason: cause instanceof Error ? cause.message : "De volledige afspeellijststructuur kon niet worden gecontroleerd.", summary: null });
    }
  }
  return { items, issues };
}

function playlistRelationshipIndexes(snapshot: UserDataSnapshot) {
  return {
    mediaByItem: groupRowsBy(snapshot.tables.PlaylistItemIndependentMediaMap?.rows ?? [], "PlaylistItemId"),
    locationsByItem: groupRowsBy(snapshot.tables.PlaylistItemLocationMap?.rows ?? [], "PlaylistItemId"),
    markersByItem: groupRowsBy(snapshot.tables.PlaylistItemMarker?.rows ?? [], "PlaylistItemId"),
    versesByMarker: groupRowsBy(snapshot.tables.PlaylistItemMarkerBibleVerseMap?.rows ?? [], "PlaylistItemMarkerId"),
    paragraphsByMarker: groupRowsBy(snapshot.tables.PlaylistItemMarkerParagraphMap?.rows ?? [], "PlaylistItemMarkerId"),
    tagsByItem: groupRowsBy(snapshot.tables.TagMap?.rows ?? [], "PlaylistItemId"),
  };
}

function createMediaIdentities(itemsA: readonly PlaylistEvidence[], itemsB: readonly PlaylistEvidence[], sourcePairId: string): PlaylistMediaIdentity[] {
  const mediaA = [...new Map(itemsA.flatMap((item) => item.media).map((media) => [media.localKey, media])).values()];
  const mediaB = [...new Map(itemsB.flatMap((item) => item.media).map((media) => [media.localKey, media])).values()];
  const usedB = new Set<string>();
  const identities: PlaylistMediaIdentity[] = [];
  for (const media of mediaA) {
    const matches = mediaB.filter((candidate) => candidate.path === media.path && sameMediaMetadata(media, candidate));
    const isUnique = matches.length === 1 && mediaA.filter((candidate) => candidate.path === media.path).length === 1;
    const match = isUnique ? matches[0] : undefined;
    const identity = match ? `${sourcePairId}:media:${media.path}` : `${sourcePairId}:media:A:${media.localKey}`;
    identities.push({ source: "A", localKey: media.localKey, identity, stable: Boolean(match) });
    if (match) {
      usedB.add(match.localKey);
      identities.push({ source: "B", localKey: match.localKey, identity, stable: true });
    }
  }
  for (const media of mediaB) if (!usedB.has(media.localKey)) {
    identities.push({ source: "B", localKey: media.localKey,
      identity: `${sourcePairId}:media:B:${media.localKey}`, stable: false });
  }
  return identities;
}

export function isPlaylistResolutionContextCurrent(
  context: PlaylistResolutionContext,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
  libraryA: LoadedJwLibrary,
  libraryB: LoadedJwLibrary,
  locationResolution: LocationResolutionContext,
): boolean {
  if (playlistContextValidation.get(context) && context.sourceSnapshots.A === snapshotA
    && context.sourceSnapshots.B === snapshotB && context.sourceLibraries.A === libraryA
    && context.sourceLibraries.B === libraryB && context.locationRevision === locationResolution.revision
    && context.locationResolution === locationResolution) return true;
  return context.sourceSnapshots.A === snapshotA && context.sourceSnapshots.B === snapshotB
    && context.sourceLibraries.A === libraryA && context.sourceLibraries.B === libraryB
    && context.locationRevision === locationResolution.revision
    && context.locationResolution === locationResolution
    && context.items.every((reference) => reference.sessionId === context.sessionId
      && reference.sourcePairId === context.sourcePairId
      && byId(reference.source === "A" ? snapshotA : snapshotB, "PlaylistItem", "PlaylistItemId", reference.playlistItemId)
        && localRowKey(reference.source === "A" ? snapshotA : snapshotB, "PlaylistItem",
          byId(reference.source === "A" ? snapshotA : snapshotB, "PlaylistItem", "PlaylistItemId", reference.playlistItemId)!) === reference.localKey)
    && isLocationResolutionContextCurrent(locationResolution, snapshotA, snapshotB);
}

function current(
  context: PlaylistResolutionContext,
  sessionId: string,
  expectedRevision: number,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
): boolean {
  return context.sessionId === sessionId && context.revision === expectedRevision
    && context.sourceSnapshots.A === snapshotA && context.sourceSnapshots.B === snapshotB
    && context.items.every((reference) => reference.sessionId === context.sessionId
      && reference.sourcePairId === context.sourcePairId
      && Boolean(byId(reference.source === "A" ? snapshotA : snapshotB, "PlaylistItem", "PlaylistItemId", reference.playlistItemId)))
    && context.locationRevision === context.locationResolution.revision
    && isLocationResolutionContextCurrent(context.locationResolution, snapshotA, snapshotB);
}

export function confirmPlaylistProposal(
  context: PlaylistResolutionContext,
  proposalId: string,
  sessionId: string,
  expectedRevision: number,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
): PlaylistResolutionResult {
  if (!current(context, sessionId, expectedRevision, snapshotA, snapshotB)) return { ok: false,
    code: "stale-context", reason: "De bronbestanden, plaatsbevestigingen of afspeellijstsessie zijn gewijzigd." };
  const proposal = context.proposals.find((item) => item.id === proposalId);
  if (!proposal) return { ok: false, code: "unknown-proposal", reason: "Dit afspeellijstvoorstel bestaat niet in deze sessie." };
  if (context.confirmedGroups.some((group) => group.members.some((member) =>
    member.localKey === proposal.sourceA.localKey && member.source === "A"
    || member.localKey === proposal.sourceB.localKey && member.source === "B"))) return { ok: false,
    code: "changed-source", reason: "Een van de afspeellijstitems is al aan een andere groep gekoppeld." };
  const group: ConfirmedPlaylistGroup = { id: `${sessionId}:playlist:${context.revision + 1}:${proposal.id}`,
    proposalId, logicalIdentity: `${sessionId}:playlist:${context.revision + 1}:${proposal.id}`,
    members: [proposal.sourceA, proposal.sourceB] };
  return { ok: true, context: withContext(context, {
    confirmedGroups: [...context.confirmedGroups, group],
    differentDecisions: context.differentDecisions.filter((item) => item.proposalId !== proposalId),
  }) };
}

export function markPlaylistsDifferent(
  context: PlaylistResolutionContext,
  proposalId: string,
  sessionId: string,
  expectedRevision: number,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
): PlaylistResolutionResult {
  if (!current(context, sessionId, expectedRevision, snapshotA, snapshotB)) return { ok: false,
    code: "stale-context", reason: "De bronbestanden, plaatsbevestigingen of afspeellijstsessie zijn gewijzigd." };
  const proposal = context.proposals.find((item) => item.id === proposalId);
  if (!proposal) return { ok: false, code: "unknown-proposal", reason: "Dit afspeellijstvoorstel bestaat niet in deze sessie." };
  if (!proposal.canKeepSeparate) return { ok: false, code: "cannot-keep-separate",
    reason: proposal.blockingReason ?? "De afspeellijststructuren kunnen niet veilig afzonderlijk worden behouden." };
  const decision: DifferentPlaylistDecision = { proposalId, sourceA: proposal.sourceA, sourceB: proposal.sourceB,
    canKeepSeparate: true, blockingReason: null };
  return { ok: true, context: withContext(context, {
    differentDecisions: [...context.differentDecisions.filter((item) => item.proposalId !== proposalId), decision],
    confirmedGroups: context.confirmedGroups.filter((group) => group.proposalId !== proposalId),
  }) };
}

export function revokePlaylistConfirmation(
  context: PlaylistResolutionContext,
  groupId: string,
  sessionId: string,
  expectedRevision: number,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
): PlaylistResolutionResult {
  if (!current(context, sessionId, expectedRevision, snapshotA, snapshotB)) return { ok: false,
    code: "stale-context", reason: "De bronbestanden, plaatsbevestigingen of afspeellijstsessie zijn gewijzigd." };
  if (!context.confirmedGroups.some((group) => group.id === groupId)) return { ok: false,
    code: "unknown-proposal", reason: "Deze bevestigde afspeellijstgroep bestaat niet meer." };
  return { ok: true, context: withContext(context, {
    confirmedGroups: context.confirmedGroups.filter((group) => group.id !== groupId),
  }) };
}

export function revokePlaylistDifferentDecision(
  context: PlaylistResolutionContext,
  proposalId: string,
  sessionId: string,
  expectedRevision: number,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
): PlaylistResolutionResult {
  if (!current(context, sessionId, expectedRevision, snapshotA, snapshotB)) return { ok: false,
    code: "stale-context", reason: "De bronbestanden, plaatsbevestigingen of afspeellijstsessie zijn gewijzigd." };
  if (!context.differentDecisions.some((decision) => decision.proposalId === proposalId)) return { ok: false,
    code: "unknown-proposal", reason: "Deze keuze bestaat niet meer." };
  return { ok: true, context: withContext(context, {
    differentDecisions: context.differentDecisions.filter((decision) => decision.proposalId !== proposalId),
  }) };
}

export function keepPlaylistSeparate(
  context: PlaylistResolutionContext,
  source: LocationSource,
  localKey: string,
  sessionId: string,
  expectedRevision: number,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
): PlaylistResolutionResult {
  if (!current(context, sessionId, expectedRevision, snapshotA, snapshotB)) return { ok: false,
    code: "stale-context", reason: "De bronbestanden, plaatsbevestigingen of afspeellijstsessie zijn gewijzigd." };
  const item = context.unresolved.find((candidate) => candidate.source === source && candidate.localKey === localKey);
  if (!item || !item.summary) return { ok: false, code: "unknown-proposal", reason: "Deze volledige afspeellijststructuur kan niet afzonderlijk worden behouden." };
  if (item.canKeepSeparate === false) return { ok: false, code: "cannot-keep-separate", reason: item.reason };
  const ref = context.items.find((candidate) => candidate.source === source && candidate.localKey === localKey);
  if (!ref) return { ok: false, code: "unknown-proposal", reason: "De brongebonden afspeellijstsleutel ontbreekt." };
  return { ok: true, context: withContext(context, {
    keptSeparate: [...context.keptSeparate.filter((entry) => itemKey(entry) !== itemKey(ref)), ref],
    unresolved: context.unresolved.filter((candidate) => !(candidate.source === source && candidate.localKey === localKey)),
  }) };
}

export function playlistItemIdentity(
  context: PlaylistResolutionContext | undefined,
  snapshot: UserDataSnapshot,
  source: LocationSource,
  itemId: unknown,
): { readonly key: string | null; readonly status: "stable" | "uncertain"; readonly reason: string } {
  if (!context) return { key: null, status: "uncertain", reason: "Afspeellijstidentiteit is niet bevestigd." };
  const reference = lookupReference(context, snapshot, source, itemId);
  if (!reference) return { key: null, status: "uncertain", reason: "Dit afspeellijstitem heeft geen gecontroleerde bronbeschrijving." };
  const confirmed = context.confirmedGroups.find((group) => group.members.some((member) => itemKey(member) === itemKey(reference)));
  if (confirmed) return { key: confirmed.logicalIdentity, status: "stable", reason: "De volledige afspeellijststructuur is expliciet bevestigd." };
  const different = context.differentDecisions.find((decision) =>
    itemKey(source === "A" ? decision.sourceA : decision.sourceB) === itemKey(reference));
  if (different) return { key: `${context.sessionId}:playlist-separate:${source}:${reference.localKey}`,
    status: "stable", reason: "De gebruiker heeft deze afspeellijsten expliciet als verschillend behouden." };
  const separate = context.keptSeparate.find((candidate) => itemKey(candidate) === itemKey(reference));
  if (separate) return { key: `${context.sessionId}:playlist-separate:${source}:${reference.localKey}`,
    status: "stable", reason: "De gebruiker heeft deze bronstructuur afzonderlijk behouden." };
  return { key: null, status: "uncertain", reason: "Bevestig dezelfde of afzonderlijke afspeellijststructuur." };
}

export function playlistMediaIdentity(
  context: PlaylistResolutionContext | undefined,
  snapshot: UserDataSnapshot,
  source: LocationSource,
  row: UserDataRow,
): { readonly key: string | null; readonly status: "stable" | "candidate" | "uncertain" } {
  if (!context) return { key: null, status: "uncertain" };
  const localKey = localRowKey(snapshot, "IndependentMedia", row);
  const entry = localKey ? context.mediaIdentities.find((item) => item.source === source && item.localKey === localKey) : null;
  return entry ? { key: entry.identity, status: entry.stable ? "stable" : "candidate" }
    : { key: null, status: "uncertain" };
}

export function playlistMediaContentEqual(
  context: PlaylistResolutionContext | undefined,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
  rowA: UserDataRow,
  rowB: UserDataRow,
): boolean {
  if (!context) return false;
  const keyA = localRowKey(snapshotA, "IndependentMedia", rowA);
  const keyB = localRowKey(snapshotB, "IndependentMedia", rowB);
  const identityA = context.mediaIdentities.find((item) => item.source === "A" && item.localKey === keyA);
  const identityB = context.mediaIdentities.find((item) => item.source === "B" && item.localKey === keyB);
  return Boolean(identityA && identityB && identityA.stable && identityB.stable && identityA.identity === identityB.identity);
}

export function playlistLogicalKeyForOwner(
  context: PlaylistResolutionContext | undefined,
  snapshot: UserDataSnapshot,
  source: LocationSource,
  playlistItemId: unknown,
): string | null {
  return playlistItemIdentity(context, snapshot, source, playlistItemId).key;
}

export function playlistSummaryFields(summary: PlaylistStructureSummary): readonly { readonly label: string; readonly value: string }[] {
  return summary.fields;
}

// Keep this imported type useful at call sites while avoiding duplicate source enums.
export type PlaylistSource = LocationSource;
