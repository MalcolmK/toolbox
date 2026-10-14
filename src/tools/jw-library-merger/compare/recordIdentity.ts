import type { SqlValue } from "sql.js";
import type { UserDataRow, UserDataSnapshot } from "../database/readUserData";

export type RecordIdentityStatus = "stable" | "candidate" | "uncertain";

export interface RecordIdentity {
  readonly tableName: string;
  /** Canonical cross-backup key when a stable or candidate key can be built. */
  readonly key: string | null;
  readonly status: RecordIdentityStatus;
  readonly strategy: string;
  /** Source-local key for following relationships; never compare this across backups. */
  readonly localKey: string | null;
  /** True only when the row has a strong cross-backup identity key. */
  readonly canMatchAcrossBackups: boolean;
  readonly reason: string;
}

export interface TableIdentityRule {
  readonly strategy: string;
  readonly status: RecordIdentityStatus;
  readonly rationale: string;
}

/**
 * Cross-backup identity policy for every table in reviewed schema version 16.
 * Candidate keys are useful for review but are not safe for automatic merging.
 */
export const TABLE_IDENTITY_RULES: Readonly<Record<string, TableIdentityRule>> = {
  Note: {
    strategy: "Guid",
    status: "stable",
    rationale: "Unique logical note identifier; NoteId remains source-local.",
  },
  UserMark: {
    strategy: "UserMarkGuid",
    status: "stable",
    rationale: "Unique logical mark identifier; UserMarkId remains source-local.",
  },
  grdb_migrations: {
    strategy: "identifier",
    status: "stable",
    rationale: "Migration identifier is the declared primary key.",
  },
  LastModified: {
    strategy: "single-row metadata",
    status: "stable",
    rationale: "Match the singleton metadata row, not its changing timestamp value.",
  },
  Location: {
    strategy: "BookNumber + ChapterNumber + KeySymbol + MepsLanguage + Type",
    status: "candidate",
    rationale: "Declared composite unique key; incomplete nullable keys are uncertain.",
  },
  Tag: {
    strategy: "Type + Name",
    status: "candidate",
    rationale: "Declared unique natural key; semantics across versions need review.",
  },
  PlaylistItemAccuracy: {
    strategy: "Description",
    status: "candidate",
    rationale: "Declared unique description; only a candidate until cross-backup behavior is verified.",
  },
  IndependentMedia: {
    strategy: "FilePath",
    status: "candidate",
    rationale: "Declared unique archive path; paths may be rewritten between backups.",
  },
  InputField: {
    strategy: "logical Location + TextTag",
    status: "candidate",
    rationale: "Uses a resolved Location identity plus the declared local composite key.",
  },
  Bookmark: {
    strategy: "logical PublicationLocation + Slot",
    status: "candidate",
    rationale: "Uses the declared unique slot with its resolved publication location.",
  },
  BlockRange: {
    strategy: "UserMarkGuid + BlockType + Identifier + StartToken + EndToken",
    status: "candidate",
    rationale: "Range coordinates are scoped to a stable mark; duplicate coordinates are uncertain.",
  },
  TagMap: {
    strategy: "logical target + logical Tag + Position where required",
    status: "candidate",
    rationale: "Depends on resolvable owner and tag identities; playlist targets remain uncertain.",
  },
  PlaylistItem: {
    strategy: "no cross-backup key established",
    status: "uncertain",
    rationale: "Integer PlaylistItemId is source-local and available fields are not a verified identity.",
  },
  PlaylistItemIndependentMediaMap: {
    strategy: "PlaylistItem + IndependentMedia relation",
    status: "uncertain",
    rationale: "PlaylistItem identity is not established; row IDs cannot be compared across backups.",
  },
  PlaylistItemLocationMap: {
    strategy: "PlaylistItem + Location relation",
    status: "uncertain",
    rationale: "PlaylistItem identity is not established; retain as an unresolved relation.",
  },
  PlaylistItemMarker: {
    strategy: "PlaylistItem + StartTimeTicks",
    status: "uncertain",
    rationale: "The parent playlist item has no verified cross-backup identity.",
  },
  PlaylistItemMarkerBibleVerseMap: {
    strategy: "PlaylistItemMarker + VerseId",
    status: "uncertain",
    rationale: "The parent marker identity is not independently stable across backups.",
  },
  PlaylistItemMarkerParagraphMap: {
    strategy: "PlaylistItemMarker + paragraph coordinates",
    status: "uncertain",
    rationale: "The parent marker identity is not independently stable across backups.",
  },
};

interface SnapshotIdentityIndexes {
  readonly localRows: Map<string, Map<SqlValue, UserDataRow>>;
  readonly locationCounts: Map<string, number>;
  readonly blockRangeCounts: Map<string, number>;
}

const snapshotIdentityIndexes = new WeakMap<UserDataSnapshot, SnapshotIdentityIndexes>();

const localPrimaryKeyColumns: Readonly<Record<string, readonly string[]>> = {
  BlockRange: ["BlockRangeId"],
  Bookmark: ["BookmarkId"],
  IndependentMedia: ["IndependentMediaId"],
  LastModified: [],
  Location: ["LocationId"],
  Note: ["NoteId"],
  PlaylistItem: ["PlaylistItemId"],
  PlaylistItemAccuracy: ["PlaylistItemAccuracyId"],
  PlaylistItemIndependentMediaMap: ["PlaylistItemId", "IndependentMediaId"],
  PlaylistItemLocationMap: ["PlaylistItemId", "LocationId"],
  PlaylistItemMarker: ["PlaylistItemMarkerId"],
  PlaylistItemMarkerBibleVerseMap: ["PlaylistItemMarkerId", "VerseId"],
  PlaylistItemMarkerParagraphMap: [
    "PlaylistItemMarkerId",
    "MepsDocumentId",
    "ParagraphIndex",
    "MarkerIndexWithinParagraph",
  ],
  Tag: ["TagId"],
  TagMap: ["TagMapId"],
  UserMark: ["UserMarkId"],
  grdb_migrations: ["identifier"],
};

function scalar(value: SqlValue | undefined): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function tupleKey(
  tableName: string,
  strategy: string,
  values: readonly (SqlValue | undefined)[],
  allowNull = false,
): string | null {
  if (values.some((value) =>
    value === undefined || (!allowNull && value === null) || value instanceof Uint8Array,
  )) {
    return null;
  }
  return JSON.stringify([tableName, strategy, ...values]);
}

function localKey(tableName: string, row: UserDataRow): string | null {
  const columns = localPrimaryKeyColumns[tableName];
  if (!columns || columns.length === 0) return null;
  const values = columns.map((column) => row[column]);
  if (values.some((value) => value === null || value === undefined)) return null;
  return tupleKey(tableName, "source-local", values);
}

function findByLocalId(
  snapshot: UserDataSnapshot,
  tableName: string,
  idColumn: string,
  id: SqlValue | undefined,
): UserDataRow | undefined {
  if (id === null || id === undefined) return undefined;
  return getSnapshotIdentityIndexes(snapshot).localRows.get(`${tableName}\u0000${idColumn}`)?.get(id);
}

function locationCandidate(row: UserDataRow | undefined): string | null {
  if (!row) return null;
  return tupleKey("Location", "natural", [
    row.BookNumber ?? null,
    row.ChapterNumber ?? null,
    row.KeySymbol ?? null,
    row.MepsLanguage ?? null,
    row.Type ?? null,
  ]);
}

function getSnapshotIdentityIndexes(snapshot: UserDataSnapshot): SnapshotIdentityIndexes {
  const cached = snapshotIdentityIndexes.get(snapshot);
  if (cached) return cached;

  const localRows = new Map<string, Map<SqlValue, UserDataRow>>();
  const indexLocalRows = (tableName: string, columnName: string) => {
    const rows = new Map<SqlValue, UserDataRow>();
    for (const row of snapshot.tables[tableName]?.rows ?? []) {
      const value = row[columnName];
      if (value !== null && value !== undefined && !rows.has(value)) rows.set(value, row);
    }
    localRows.set(`${tableName}\u0000${columnName}`, rows);
  };
  indexLocalRows("Location", "LocationId");
  indexLocalRows("UserMark", "UserMarkId");
  indexLocalRows("Tag", "TagId");
  indexLocalRows("Note", "NoteId");

  const locationCounts = new Map<string, number>();
  for (const row of snapshot.tables.Location?.rows ?? []) {
    const key = locationCandidate(row);
    if (key !== null) locationCounts.set(key, (locationCounts.get(key) ?? 0) + 1);
  }

  const blockRangeCounts = new Map<string, number>();
  const marksById = localRows.get("UserMark\u0000UserMarkId")!;
  for (const row of snapshot.tables.BlockRange?.rows ?? []) {
    const mark = row.UserMarkId === null || row.UserMarkId === undefined ? undefined : marksById.get(row.UserMarkId);
    const markGuid = typeof mark?.UserMarkGuid === "string" ? mark.UserMarkGuid : null;
    if (markGuid === null) continue;
    const key = tupleKey("BlockRange", TABLE_IDENTITY_RULES.BlockRange!.strategy, [
      markGuid, row.BlockType, row.Identifier, row.StartToken, row.EndToken,
    ], true);
    if (key !== null) blockRangeCounts.set(key, (blockRangeCounts.get(key) ?? 0) + 1);
  }

  const indexes = { localRows, locationCounts, blockRangeCounts };
  snapshotIdentityIndexes.set(snapshot, indexes);
  return indexes;
}

function tagCandidate(snapshot: UserDataSnapshot, tagId: SqlValue | undefined): string | null {
  const tag = findByLocalId(snapshot, "Tag", "TagId", tagId);
  if (!tag) return null;
  const type = scalar(tag.Type);
  const name = scalar(tag.Name);
  if (type === null || name === null) return null;
  return tupleKey("Tag", "natural", [type, name]);
}

function identity(
  snapshot: UserDataSnapshot,
  tableName: string,
  row: UserDataRow,
  status: RecordIdentityStatus,
  strategy: string,
  key: string | null,
  reason: string,
): RecordIdentity {
  const sourceTableExists = Object.hasOwn(snapshot.tables, tableName);
  const actualStatus = key === null || !sourceTableExists ? "uncertain" : status;
  const crossBackupKey = sourceTableExists ? key : null;
  return {
    tableName,
    key: crossBackupKey,
    status: actualStatus,
    strategy,
    localKey: localKey(tableName, row),
    canMatchAcrossBackups: actualStatus === "stable",
    reason: !sourceTableExists
      ? "De tabel komt niet voor in deze bron-snapshot."
      : crossBackupKey === null
      ? `${reason} De benodigde identiteitsvelden ontbreken of zijn ongeldig.`
      : reason,
  };
}

/** Resolve one row's cross-backup identity without treating local IDs as global IDs. */
export function identifyRecord(
  snapshot: UserDataSnapshot,
  tableName: string,
  row: UserDataRow,
  rowIndex?: number,
): RecordIdentity {
  const rule = TABLE_IDENTITY_RULES[tableName];
  const local = localKey(tableName, row);
  if (!rule) {
    return identity(snapshot, tableName, row, "uncertain", "unknown table", null,
      "Voor deze tabel is geen identiteitsregel vastgelegd.");
  }

  switch (tableName) {
    case "Note":
      return identity(snapshot, tableName, row, rule.status, rule.strategy,
        typeof row.Guid === "string" && row.Guid.length > 0
          ? tupleKey(tableName, rule.strategy, [row.Guid])
          : null,
        rule.rationale);
    case "UserMark":
      return identity(snapshot, tableName, row, rule.status, rule.strategy,
        typeof row.UserMarkGuid === "string" && row.UserMarkGuid.length > 0
          ? tupleKey(tableName, rule.strategy, [row.UserMarkGuid])
          : null,
        rule.rationale);
    case "grdb_migrations":
      return identity(snapshot, tableName, row, rule.status, rule.strategy,
        typeof row.identifier === "string" && row.identifier.length > 0
          ? tupleKey(tableName, rule.strategy, [row.identifier])
          : null,
        rule.rationale);
    case "LastModified":
      return identity(snapshot, tableName, row, rule.status, rule.strategy,
        snapshot.tables.LastModified?.rowCount === 1
          ? tupleKey(tableName, rule.strategy, ["singleton"])
          : null,
        rule.rationale);
    case "Location": {
      const key = locationCandidate(row);
      const duplicates = key === null ? 0 : getSnapshotIdentityIndexes(snapshot).locationCounts.get(key) ?? 0;
      return identity(snapshot, tableName, row,
        duplicates === 1 ? rule.status : "uncertain", rule.strategy, key,
        duplicates === 1 ? rule.rationale : "De natuurlijke locatiesleutel is onvolledig of dubbel.");
    }
    case "Tag": {
      const type = scalar(row.Type);
      const name = scalar(row.Name);
      const key = type === null || name === null
        ? null
        : tupleKey(tableName, rule.strategy, [type, name]);
      return identity(snapshot, tableName, row, rule.status, rule.strategy, key, rule.rationale);
    }
    case "PlaylistItemAccuracy": {
      const description = scalar(row.Description);
      const key = description === null
        ? null
        : tupleKey(tableName, rule.strategy, [description]);
      return identity(snapshot, tableName, row, rule.status, rule.strategy, key, rule.rationale);
    }
    case "IndependentMedia": {
      const filePath = scalar(row.FilePath);
      const key = filePath === null
        ? null
        : tupleKey(tableName, rule.strategy, [filePath]);
      return identity(snapshot, tableName, row, rule.status, rule.strategy, key, rule.rationale);
    }
    case "InputField": {
      const location = findByLocalId(snapshot, "Location", "LocationId", row.LocationId);
      const locationKey = locationCandidate(location);
      const textTag = scalar(row.TextTag);
      const key = locationKey === null || textTag === null
        ? null
        : tupleKey(tableName, rule.strategy, [locationKey, textTag]);
      return identity(snapshot, tableName, row, rule.status, rule.strategy, key, rule.rationale);
    }
    case "Bookmark": {
      const publicationLocation = findByLocalId(
        snapshot, "Location", "LocationId", row.PublicationLocationId,
      );
      const publicationLocationKey = locationCandidate(publicationLocation);
      const slot = scalar(row.Slot);
      const key = publicationLocationKey === null || slot === null
        ? null
        : tupleKey(tableName, rule.strategy, [publicationLocationKey, slot]);
      return identity(snapshot, tableName, row, rule.status, rule.strategy, key, rule.rationale);
    }
    case "BlockRange": {
      const mark = findByLocalId(snapshot, "UserMark", "UserMarkId", row.UserMarkId);
      const markGuid = typeof mark?.UserMarkGuid === "string" ? mark.UserMarkGuid : null;
      const fields = [row.BlockType, row.Identifier, row.StartToken, row.EndToken];
      const key = markGuid === null
        ? null
        : tupleKey(tableName, rule.strategy, [markGuid, ...fields], true);
      const duplicates = key === null ? 0 : getSnapshotIdentityIndexes(snapshot).blockRangeCounts.get(key) ?? 0;
      return identity(snapshot, tableName, row,
        duplicates === 1 ? rule.status : "uncertain", rule.strategy, key,
        duplicates === 1 ? rule.rationale : "Het bereik is dubbel of de bovenliggende markering heeft geen stabiele identiteit.");
    }
    case "TagMap": {
      const tagKey = tagCandidate(snapshot, row.TagId);
      let ownerKey: string | null = null;
      let ownerType: string | null = null;
      if (row.NoteId !== null && row.NoteId !== undefined) {
        const note = findByLocalId(snapshot, "Note", "NoteId", row.NoteId);
        ownerType = "Note";
        ownerKey = typeof note?.Guid === "string"
          ? tupleKey("Note", "Guid", [note.Guid])
          : null;
      } else if (row.LocationId !== null && row.LocationId !== undefined) {
        const location = findByLocalId(snapshot, "Location", "LocationId", row.LocationId);
        ownerType = "Location";
        ownerKey = locationCandidate(location);
      } else if (row.PlaylistItemId !== null && row.PlaylistItemId !== undefined) {
        ownerType = "PlaylistItem";
      }
      const tagMapIdentity = ownerType === "PlaylistItem"
        ? [ownerType, ownerKey, tagKey, row.Position ?? null]
        : [ownerType, ownerKey, tagKey];
      const key = ownerKey === null || ownerType === null || tagKey === null
        ? null
        : tupleKey(tableName, rule.strategy, tagMapIdentity as SqlValue[]);
      const status = ownerType === "Note" && key !== null ? "candidate" : rule.status;
      return identity(snapshot, tableName, row, status, rule.strategy, key,
        ownerType === "PlaylistItem"
          ? "De koppeling verwijst naar een playlistitem zonder stabiele cross-backup identiteit."
          : rule.rationale);
    }
    default:
      return identity(snapshot, tableName, row, "uncertain", rule.strategy, null,
        `${rule.rationale} Alleen de bron-lokale sleutel ${local ?? String(rowIndex ?? "?")} is beschikbaar.`);
  }
}
