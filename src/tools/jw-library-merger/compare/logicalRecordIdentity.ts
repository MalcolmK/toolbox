import type { SqlValue } from "sql.js";
import { confirmedLocationIdentity, separateLocationIdentity, type LocationResolutionContext, type LocationSource } from "../merge/locationResolution";
import type { UserDataRow, UserDataSnapshot } from "../database/readUserData";
import { blockRangeIdentityCount, findSnapshotRowByLocalId, identifyRecord, type RecordIdentity } from "./recordIdentity";
import { playlistItemIdentity, playlistMediaIdentity, type PlaylistResolutionContext } from "../merge/playlistResolution";

function tuple(table: string, strategy: string, values: readonly (SqlValue | undefined)[]): string | null {
  if (values.some((value) => value === undefined || value instanceof Uint8Array)) return null;
  return JSON.stringify([table, strategy, ...values]);
}

function idLookup(snapshot: UserDataSnapshot, table: string, idField: string, value: SqlValue | undefined): UserDataRow | null {
  return findSnapshotRowByLocalId(snapshot, table, idField, value) ?? null;
}

const locationIndexes = new WeakMap<UserDataSnapshot, WeakMap<UserDataRow, number>>();

function locationRowIndex(snapshot: UserDataSnapshot, row: UserDataRow): number {
  let rows = locationIndexes.get(snapshot);
  if (!rows) {
    rows = new WeakMap<UserDataRow, number>();
    snapshot.tables.Location?.rows.forEach((location, index) => rows!.set(location, index));
    locationIndexes.set(snapshot, rows);
  }
  return rows.get(row) ?? -1;
}

function locationIdentity(
  snapshot: UserDataSnapshot,
  source: LocationSource,
  row: UserDataRow | null,
  context?: LocationResolutionContext,
): RecordIdentity | null {
  if (!row) return null;
  const index = locationRowIndex(snapshot, row);
  if (index < 0) return null;
  const base = identifyRecord(snapshot, "Location", row, index);
  const confirmed = confirmedLocationIdentity(context, snapshot, source, row, index);
  if (confirmed) return { ...base, key: confirmed, status: "stable", strategy: "session-confirmed Location link", canMatchAcrossBackups: true };
  const separate = separateLocationIdentity(context, snapshot, source, row, index);
  if (separate) return { ...base, key: separate, status: "stable", strategy: "session-confirmed separate Location", canMatchAcrossBackups: false };
  return base;
}

function tagContentEqual(a: UserDataSnapshot, rowA: UserDataRow, rowB: UserDataRow): boolean {
  const columns = a.tables.Tag?.columns ?? [];
  return columns.filter((column) => !a.tables.Tag?.primaryKey.includes(column.name))
    .every(({ name }) => {
      const left = rowA[name];
      const right = rowB[name];
      return left instanceof Uint8Array && right instanceof Uint8Array
        ? left.length === right.length && left.every((value, index) => value === right[index])
        : left === right;
    });
}

function tagIdentity(
  snapshot: UserDataSnapshot,
  otherSnapshot: UserDataSnapshot,
  row: UserDataRow,
): RecordIdentity {
  const base = identifyRecord(snapshot, "Tag", row);
  if (!base.key) return base;
  const sameIn = (candidateSnapshot: UserDataSnapshot) => (candidateSnapshot.tables.Tag?.rows ?? [])
    .filter((candidate) => identifyRecord(candidateSnapshot, "Tag", candidate).key === base.key);
  const own = sameIn(snapshot);
  const other = sameIn(otherSnapshot);
  if (own.length !== 1 || other.length > 1) return {
    ...base, key: null, status: "uncertain", canMatchAcrossBackups: false,
    reason: "De labelsleutel Type + Name komt dubbel voor; er wordt niets gededupliceerd.",
  };
  if (other.length === 1 && !tagContentEqual(snapshot, row, other[0]!)) return {
    ...base, status: "candidate", canMatchAcrossBackups: false,
    reason: "Type en Name komen overeen, maar overige labelvelden verschillen.",
  };
  return { ...base, status: "stable", canMatchAcrossBackups: true,
    reason: "Type en Name zijn uniek en alle labelvelden zijn gelijk." };
}

function markIdentity(snapshot: UserDataSnapshot, row: UserDataRow): string | null {
  const mark = idLookup(snapshot, "UserMark", "UserMarkId", row.UserMarkId);
  if (!mark) return null;
  const identity = identifyRecord(snapshot, "UserMark", mark);
  return identity.status === "stable" ? identity.key : null;
}

function blockRangeIdentity(snapshot: UserDataSnapshot, row: UserDataRow): RecordIdentity {
  const base = identifyRecord(snapshot, "BlockRange", row);
  const markGuid = markIdentity(snapshot, row);
  if (!markGuid || !base.key) return { ...base, key: null, status: "uncertain", canMatchAcrossBackups: false,
    reason: "Het bereik heeft geen stabiele bovenliggende UserMarkGuid." };
  const duplicates = blockRangeIdentityCount(snapshot, base.key);
  if (duplicates !== 1) return { ...base, key: null, status: "uncertain", canMatchAcrossBackups: false,
    reason: "De bereikcoördinaten komen meer dan eenmaal onder dezelfde markering voor." };
  return { ...base, status: "stable", canMatchAcrossBackups: true,
    reason: "De bereikcoördinaten zijn uniek onder een stabiel geïdentificeerde markering." };
}

const blockRangesByMark = new WeakMap<UserDataSnapshot, Map<SqlValue, readonly UserDataRow[]>>();

function blockRangeRowsByMark(snapshot: UserDataSnapshot): Map<SqlValue, readonly UserDataRow[]> {
  const cached = blockRangesByMark.get(snapshot);
  if (cached) return cached;
  const rowsByMark = new Map<SqlValue, UserDataRow[]>();
  for (const row of snapshot.tables.BlockRange?.rows ?? []) {
    const markId = row.UserMarkId;
    if (markId === null || markId === undefined) continue;
    const rows = rowsByMark.get(markId) ?? [];
    rows.push(row);
    rowsByMark.set(markId, rows);
  }
  blockRangesByMark.set(snapshot, rowsByMark);
  return rowsByMark;
}

export function blockRangeSet(snapshot: UserDataSnapshot, userMarkId: SqlValue | undefined): {
  readonly key: string;
  readonly duplicate: boolean;
  readonly count: number;
} | null {
  const mark = idLookup(snapshot, "UserMark", "UserMarkId", userMarkId);
  const guid = typeof mark?.UserMarkGuid === "string" ? mark.UserMarkGuid : null;
  if (guid === null || userMarkId === null || userMarkId === undefined) return null;
  const keys = (blockRangeRowsByMark(snapshot).get(userMarkId) ?? [])
    .map((row) => JSON.stringify([guid, row.BlockType, row.Identifier, row.StartToken, row.EndToken]));
  const duplicate = new Set(keys).size !== keys.length;
  return { key: JSON.stringify(keys.sort()), duplicate, count: keys.length };
}

/** Cross-backup identity that can use confirmed session links for dependent rows. */
export function identifyLogicalRecord(
  snapshot: UserDataSnapshot,
  otherSnapshot: UserDataSnapshot,
  tableName: string,
  row: UserDataRow,
  rowIndex: number,
  source: LocationSource,
  resolution?: LocationResolutionContext,
  playlistResolution?: PlaylistResolutionContext,
): RecordIdentity {
  const base = identifyRecord(snapshot, tableName, row, rowIndex);
  const stable = (key: string | null, strategy: string, reason: string): RecordIdentity => ({
    ...base, key, status: key ? "stable" : "uncertain", strategy,
    canMatchAcrossBackups: Boolean(key), reason: key ? reason : `${reason} Afspeellijstidentiteit ontbreekt of is niet bevestigd.`,
  });
  if (tableName === "PlaylistItem") {
    const identity = playlistItemIdentity(playlistResolution, snapshot, source, row.PlaylistItemId);
    return { ...base, key: identity.key, status: identity.status, strategy: "confirmed playlist structure",
      canMatchAcrossBackups: identity.status === "stable" && identity.key !== null, reason: identity.reason };
  }
  if (tableName === "PlaylistItemAccuracy") {
    const description = row.Description;
    const own = (snapshot.tables.PlaylistItemAccuracy?.rows ?? []).filter((item) => item.Description === description);
    const other = (otherSnapshot.tables.PlaylistItemAccuracy?.rows ?? []).filter((item) => item.Description === description);
    const key = typeof description === "string" && own.length === 1 && other.length <= 1
      ? tuple(tableName, "Description", [description]) : null;
    return stable(key, "unique accuracy description", "Unieke nauwkeurigheidsbeschrijving.");
  }
  if (tableName === "IndependentMedia") {
    const identity = playlistMediaIdentity(playlistResolution, snapshot, source, row);
    if (identity.status !== "uncertain") return { ...base, key: identity.key, status: identity.status,
      strategy: "playlist media metadata and bytes", canMatchAcrossBackups: identity.status === "stable",
      reason: identity.status === "stable" ? "Mediapad, metadata en werkelijke bytes komen overeen." : "Media is kandidaat; er is geen bytegelijke koppeling bevestigd." };
  }
  const parent = (playlistItemId: SqlValue | undefined) => playlistItemIdentity(playlistResolution, snapshot, source, playlistItemId);
  if (tableName === "PlaylistItemIndependentMediaMap") {
    const owner = parent(row.PlaylistItemId);
    const mediaRow = idLookup(snapshot, "IndependentMedia", "IndependentMediaId", row.IndependentMediaId);
    const media = mediaRow ? playlistMediaIdentity(playlistResolution, snapshot, source, mediaRow) : null;
    const key = owner.key && media?.key ? tuple(tableName, "playlist + byte-confirmed media", [owner.key, media.key]) : null;
    return stable(owner.status === "stable" && media?.status === "stable" ? key : null,
      "playlist + media map", "Afspeellijst, media en mediadatum zijn vastgesteld.");
  }
  if (tableName === "PlaylistItemLocationMap") {
    const owner = parent(row.PlaylistItemId);
    const location = locationIdentity(snapshot, source, idLookup(snapshot, "Location", "LocationId", row.LocationId), resolution);
    const key = owner.key && location?.key ? tuple(tableName, "playlist + confirmed location + media type", [owner.key, location.key, row.MajorMultimediaType]) : null;
    return stable(owner.status === "stable" && location?.status === "stable" ? key : null,
      "playlist + location map", "Afspeellijst en bevestigde plaatskoppeling.");
  }
  if (tableName === "PlaylistItemMarker") {
    const owner = parent(row.PlaylistItemId);
    const key = owner.key && row.StartTimeTicks !== null && row.StartTimeTicks !== undefined
      ? tuple(tableName, "playlist + marker time", [owner.key, row.StartTimeTicks]) : null;
    return stable(owner.status === "stable" ? key : null, "playlist + marker time", "Afspeellijstmarkering binnen een bevestigde afspeellijst.");
  }
  if (tableName === "PlaylistItemMarkerBibleVerseMap" || tableName === "PlaylistItemMarkerParagraphMap") {
    const marker = idLookup(snapshot, "PlaylistItemMarker", "PlaylistItemMarkerId", row.PlaylistItemMarkerId);
    const owner = marker ? parent(marker.PlaylistItemId) : null;
    const markerKey = marker && owner?.key && marker.StartTimeTicks !== null && marker.StartTimeTicks !== undefined
      ? tuple("PlaylistItemMarker", "playlist + marker time", [owner.key, marker.StartTimeTicks]) : null;
    const coordinates = tableName === "PlaylistItemMarkerBibleVerseMap"
      ? [row.VerseId] : [row.MepsDocumentId, row.ParagraphIndex, row.MarkerIndexWithinParagraph];
    const key = markerKey ? tuple(tableName, "marker + child reference", [markerKey, ...coordinates]) : null;
    return stable(owner?.status === "stable" ? key : null, "marker child mapping", "Kindkoppeling binnen een bevestigde afspeellijstmarkering.");
  }
  if (tableName === "Location") return locationIdentity(snapshot, source, row, resolution) ?? base;
  if (tableName === "Tag") return tagIdentity(snapshot, otherSnapshot, row);
  if (tableName === "BlockRange") return blockRangeIdentity(snapshot, row);
  if (tableName === "InputField") {
    const location = locationIdentity(snapshot, source, idLookup(snapshot, "Location", "LocationId", row.LocationId), resolution);
    const key = location?.key && row.TextTag !== null && row.TextTag !== undefined
      ? tuple(tableName, "logical Location + TextTag", [location.key, row.TextTag]) : null;
    return { ...base, key, status: key ? location!.status : "uncertain",
      canMatchAcrossBackups: Boolean(key && location?.status === "stable"),
      reason: key ? "Sleutel bestaat uit de logische plaats en TextTag." : "De invoerveldplaats is niet betrouwbaar opgelost." };
  }
  if (tableName === "Bookmark") {
    const place = locationIdentity(snapshot, source, idLookup(snapshot, "Location", "LocationId", row.LocationId), resolution);
    const publication = locationIdentity(snapshot, source, idLookup(snapshot, "Location", "LocationId", row.PublicationLocationId), resolution);
    const slot = row.Slot;
    const key = place && publication?.key && slot !== null && slot !== undefined
      ? tuple(tableName, "logical publication + Slot", [publication.key, slot]) : null;
    const stable = place !== null && publication?.status === "stable";
    return { ...base, key, status: key ? stable ? "stable" : "candidate" : "uncertain",
      canMatchAcrossBackups: Boolean(key && stable),
      reason: key ? "Sleutel bevat de bevestigde publicatieplaats en Slot; de precieze doelplaats wordt apart als relatie gecontroleerd." : "De bladwijzerplaats of publicatieplaats is niet betrouwbaar opgelost." };
  }
  if (tableName === "TagMap") {
    const tagRow = idLookup(snapshot, "Tag", "TagId", row.TagId);
    const tag = tagRow ? tagIdentity(snapshot, otherSnapshot, tagRow) : null;
    let ownerKey: string | null = null;
    let ownerStatus: RecordIdentity["status"] = "uncertain";
    let ownerKind: string | null = null;
    if (row.NoteId !== null && row.NoteId !== undefined) {
      const note = idLookup(snapshot, "Note", "NoteId", row.NoteId);
      const identity = note ? identifyRecord(snapshot, "Note", note) : null;
      ownerKind = "Note"; ownerKey = identity?.key ?? null; ownerStatus = identity?.status ?? "uncertain";
    } else if (row.LocationId !== null && row.LocationId !== undefined) {
      const location = locationIdentity(snapshot, source, idLookup(snapshot, "Location", "LocationId", row.LocationId), resolution);
      ownerKind = "Location"; ownerKey = location?.key ?? null; ownerStatus = location?.status ?? "uncertain";
    } else if (row.PlaylistItemId !== null && row.PlaylistItemId !== undefined) {
      const owner = playlistItemIdentity(playlistResolution, snapshot, source, row.PlaylistItemId);
      ownerKind = "PlaylistItem"; ownerKey = owner.key; ownerStatus = owner.status;
    }
    const key = ownerKey && tag?.key ? tuple(tableName, "logical owner + Tag", [ownerKind, ownerKey, tag.key]) : null;
    const stable = ownerStatus === "stable" && tag?.status === "stable";
    return { ...base, key, status: key ? stable ? "stable" : "candidate" : "uncertain",
      canMatchAcrossBackups: Boolean(key && stable),
      reason: key ? "Sleutel bevat de opgeloste eigenaar en unieke labelidentiteit; Position blijft inhoud." : "Eigenaar of labelidentiteit is niet eenduidig opgelost." };
  }
  return base;
}
