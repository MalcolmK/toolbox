import type { SqlValue } from "sql.js";
import type {
  UserDataRow,
  UserDataSnapshot,
  UserDataTable,
} from "../database/readUserData";
import type { RecordIdentity, RecordIdentityStatus } from "./recordIdentity";
import { blockRangeSet, identifyLogicalRecord } from "./logicalRecordIdentity";
import {
  normalizeTimestamp,
  normalizeUserDataTimestamps,
  type UserDataTimestampSummary,
} from "./normalizeTimestamp";
import { isLocationResolutionContextCurrent, type LocationResolutionContext, type LocationSource } from "../merge/locationResolution";
import { isPlaylistResolutionContextCurrent, type PlaylistResolutionContext } from "../merge/playlistResolution";

export type ComparisonStatus =
  | "equal"
  | "only-in-a"
  | "only-in-b"
  | "changed"
  | "possible-conflict"
  | "uncertain-linked";

export type RelationshipStatus = "same" | "changed" | "uncertain";

export interface FieldDifference {
  readonly field: string;
  /** Original database values are preserved for display and review. */
  readonly valueA: SqlValue | undefined;
  readonly valueB: SqlValue | undefined;
}

export interface RelationshipDifference {
  readonly field: string;
  readonly targetTable: string;
  readonly status: RelationshipStatus;
  readonly identityKeyA: string | null;
  readonly identityKeyB: string | null;
  readonly identityStatusA: RecordIdentityStatus | null;
  readonly identityStatusB: RecordIdentityStatus | null;
  /** Source-local foreign-key values are shown only as provenance, never matched across sources. */
  readonly sourceLocalValueA: SqlValue | undefined;
  readonly sourceLocalValueB: SqlValue | undefined;
  readonly reason: string | null;
  readonly rangeCountA?: number;
  readonly rangeCountB?: number;
}

export interface ComparedSourceRecord {
  readonly identity: RecordIdentity;
  readonly row: UserDataRow;
}

export interface ComparedRecord {
  readonly tableName: string;
  readonly status: ComparisonStatus;
  readonly identityKey: string | null;
  readonly identityStatus: RecordIdentityStatus;
  readonly identityStrategy: string;
  readonly sourceA: ComparedSourceRecord | null;
  readonly sourceB: ComparedSourceRecord | null;
  readonly fieldDifferences: readonly FieldDifference[];
  readonly relationshipDifferences: readonly RelationshipDifference[];
  readonly uncertaintyReasons: readonly string[];
  /** A one-sided row is not evidence that a user deliberately deleted it. */
  readonly absenceInterpretation: "unknown" | null;
}

export interface ComparisonSourceSummary {
  readonly fileName: string;
  readonly schemaVersion: number;
  readonly recordCounts: Readonly<Record<string, number>>;
  readonly timestamps: UserDataTimestampSummary;
}

export interface LibraryComparison {
  readonly sourceA: ComparisonSourceSummary;
  readonly sourceB: ComparisonSourceSummary;
  readonly records: readonly ComparedRecord[];
  readonly summary: {
    readonly countsByStatus: Readonly<Record<ComparisonStatus, number>>;
    /** Includes both `changed` and `possible-conflict`; it does not imply a merge choice. */
    readonly changedRecordCount: number;
    readonly perTable: Readonly<Record<string, Readonly<Record<ComparisonStatus, number>>>>;
  };
}

interface IndexedRow {
  readonly row: UserDataRow;
  readonly identity: RecordIdentity;
}

interface RelationshipTarget {
  readonly identityKey: string | null;
  readonly identityStatus: RecordIdentityStatus | null;
  readonly presence: "none" | "linked" | "unresolved";
  readonly reason: string | null;
}

interface IndexedTargetRow {
  readonly row: UserDataRow;
  readonly index: number;
}

type RelationshipIndexes = WeakMap<UserDataSnapshot, Map<string, Map<string, Map<SqlValue, IndexedTargetRow>>>>;

function relationshipIndex(
  indexes: RelationshipIndexes,
  snapshot: UserDataSnapshot,
  tableName: string,
  columnName: string,
): Map<SqlValue, IndexedTargetRow> {
  let snapshotIndexes = indexes.get(snapshot);
  if (!snapshotIndexes) {
    snapshotIndexes = new Map();
    indexes.set(snapshot, snapshotIndexes);
  }
  let tableIndexes = snapshotIndexes.get(tableName);
  if (!tableIndexes) {
    tableIndexes = new Map();
    snapshotIndexes.set(tableName, tableIndexes);
  }
  let columnIndex = tableIndexes.get(columnName);
  if (!columnIndex) {
    columnIndex = new Map();
    const rows = snapshot.tables[tableName]?.rows ?? [];
    rows.forEach((row, index) => {
      const value = row[columnName];
      if (value !== null && value !== undefined && !columnIndex!.has(value)) {
        columnIndex!.set(value, { row, index });
      }
    });
    tableIndexes.set(columnName, columnIndex);
  }
  return columnIndex;
}

const primaryConflictFields: Readonly<Record<string, readonly string[]>> = {
  Note: ["Title", "Content", "Created"],
  UserMark: ["ColorIndex", "StyleIndex", "Version"],
  Bookmark: ["Title", "Snippet", "BlockType", "BlockIdentifier"],
  InputField: ["Value"],
  TagMap: ["Position"],
  PlaylistItem: ["Label", "StartTrimOffsetTicks", "EndTrimOffsetTicks", "Accuracy", "EndAction"],
};

function identityRows(snapshot: UserDataSnapshot, otherSnapshot: UserDataSnapshot, tableName: string, source: LocationSource, context?: LocationResolutionContext, playlistContext?: PlaylistResolutionContext): IndexedRow[] {
  const table = snapshot.tables[tableName];
  if (!table) return [];
  return table.rows.map((row, index) => ({
    row,
    identity: (() => {
      return identifyLogicalRecord(snapshot, otherSnapshot, tableName, row, index, source, context, playlistContext);
    })(),
  }));
}

function groupByIdentity(rows: readonly IndexedRow[]): Map<string, IndexedRow[]> {
  const groups = new Map<string, IndexedRow[]>();
  for (const entry of rows) {
    const key = entry.identity.key;
    if (key === null) continue;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  return groups;
}

function valuesEqual(left: SqlValue | undefined, right: SqlValue | undefined): boolean {
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return left === right;
}

function timestampField(tableName: string, field: string): boolean {
  return (tableName === "Note" && (field === "Created" || field === "LastModified"))
    || (tableName === "LastModified" && field === "LastModified");
}

function timestampValuesEqual(left: SqlValue | undefined, right: SqlValue | undefined): boolean {
  const a = normalizeTimestamp(left);
  const b = normalizeTimestamp(right);
  if (a.status === "valid" && b.status === "valid") {
    return a.epochMilliseconds === b.epochMilliseconds;
  }
  return a.status === b.status && a.sourceText === b.sourceText;
}

function localPrimaryKeys(table: UserDataTable | undefined): Set<string> {
  return new Set(table?.primaryKey ?? []);
}

function relationColumns(table: UserDataTable | undefined): Set<string> {
  return new Set(table?.foreignKeys.map((foreignKey) => foreignKey.fromColumn) ?? []);
}

function compareFields(
  tableName: string,
  tableA: UserDataTable | undefined,
  tableB: UserDataTable | undefined,
  rowA: UserDataRow,
  rowB: UserDataRow,
): FieldDifference[] {
  const primaryKeys = new Set([
    ...localPrimaryKeys(tableA),
    ...localPrimaryKeys(tableB),
  ]);
  const relationships = new Set([
    ...relationColumns(tableA),
    ...relationColumns(tableB),
  ]);
  const fields = new Set([...Object.keys(rowA), ...Object.keys(rowB)]);
  const differences: FieldDifference[] = [];

  for (const field of [...fields].sort()) {
    if (primaryKeys.has(field) || relationships.has(field)) continue;
    const valueA = rowA[field];
    const valueB = rowB[field];
    const equal = timestampField(tableName, field)
      ? timestampValuesEqual(valueA, valueB)
      : valuesEqual(valueA, valueB);
    if (!equal) differences.push({ field, valueA, valueB });
  }

  return differences;
}

function resolveRelationship(
  indexes: RelationshipIndexes,
  snapshot: UserDataSnapshot,
  otherSnapshot: UserDataSnapshot,
  tableName: string,
  row: UserDataRow | null,
  fromColumn: string,
  targetTable: string,
  targetColumn: string | null,
  source: LocationSource,
  context?: LocationResolutionContext,
  playlistContext?: PlaylistResolutionContext,
): RelationshipTarget {
  if (!row) return { presence: "none", identityKey: null, identityStatus: null, reason: null };
  const sourceValue = row[fromColumn];
  if (sourceValue === null || sourceValue === undefined) {
    return { presence: "none", identityKey: null, identityStatus: null, reason: null };
  }

  const target = snapshot.tables[targetTable];
  if (!target) {
    return {
      presence: "unresolved",
      identityKey: null,
      identityStatus: null,
      reason: `${tableName}.${fromColumn} verwijst naar ontbrekende tabel ${targetTable}.`,
    };
  }
  const resolvedColumn = targetColumn ?? target.primaryKey[0];
  if (!resolvedColumn) {
    return {
      presence: "unresolved",
      identityKey: null,
      identityStatus: null,
      reason: `De doelkolom van ${tableName}.${fromColumn} → ${targetTable} is niet bekend.`,
    };
  }
  const targetRecord = relationshipIndex(indexes, snapshot, targetTable, resolvedColumn).get(sourceValue);
  if (!targetRecord) {
    return {
      presence: "unresolved",
      identityKey: null,
      identityStatus: null,
      reason: `${tableName}.${fromColumn} kon niet naar een rij in ${targetTable} worden gevolgd.`,
    };
  }

  const targetIdentity = identifyLogicalRecord(snapshot, otherSnapshot, targetTable, targetRecord.row,
    targetRecord.index, source, context, playlistContext);
  if (targetIdentity.key === null || targetIdentity.status === "uncertain") {
    return {
      presence: "unresolved",
      identityKey: null,
      identityStatus: targetIdentity.status,
      reason: `${targetTable} heeft geen bruikbare identiteit voor de koppeling vanaf ${tableName}.${fromColumn}.`,
    };
  }

  return {
    presence: "linked",
    identityKey: targetIdentity.key,
    identityStatus: targetIdentity.status,
    reason: null,
  };
}

function compareRelationships(
  indexes: RelationshipIndexes,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
  tableName: string,
  tableA: UserDataTable | undefined,
  tableB: UserDataTable | undefined,
  rowA: UserDataRow | null,
  rowB: UserDataRow | null,
  context?: LocationResolutionContext,
  playlistContext?: PlaylistResolutionContext,
): RelationshipDifference[] {
  const references = new Map<string, { tableName: string; fromColumn: string; toColumn: string | null }>();
  for (const foreignKey of [...(tableA?.foreignKeys ?? []), ...(tableB?.foreignKeys ?? [])]) {
    references.set(`${foreignKey.fromColumn}\u0000${foreignKey.referencedTable}`, {
      tableName: foreignKey.referencedTable,
      fromColumn: foreignKey.fromColumn,
      toColumn: foreignKey.toColumn,
    });
  }

  const differences: RelationshipDifference[] = [];
  for (const reference of references.values()) {
    const targetA = resolveRelationship(
      indexes, snapshotA, snapshotB, tableName, rowA, reference.fromColumn, reference.tableName, reference.toColumn, "A", context, playlistContext,
    );
    const targetB = resolveRelationship(
    indexes, snapshotB, snapshotA, tableName, rowB, reference.fromColumn, reference.tableName, reference.toColumn, "B", context, playlistContext,
    );
    let status: RelationshipStatus;
    let reason: string | null = null;

    if (targetA.presence === "unresolved" || targetB.presence === "unresolved") {
      status = "uncertain";
      reason = targetA.reason ?? targetB.reason;
    } else if (targetA.presence !== targetB.presence) {
      status = "changed";
    } else if (targetA.presence === "none") {
      status = "same";
    } else if (targetA.identityKey !== targetB.identityKey) {
      if (targetA.identityStatus === "stable" && targetB.identityStatus === "stable") {
        status = "changed";
      } else {
        status = "uncertain";
        reason = "De relatie-identiteiten verschillen, maar minstens één kant gebruikt een kandidaat-sleutel.";
      }
    } else if (targetA.identityStatus === "stable" && targetB.identityStatus === "stable") {
      status = "same";
    } else {
      status = "uncertain";
      reason = "De relatie heeft aan beide kanten dezelfde kandidaat-identiteit, maar is nog niet betrouwbaar bevestigd.";
    }

    if (status !== "same") {
      differences.push({
        field: reference.fromColumn,
        targetTable: reference.tableName,
        status,
        identityKeyA: targetA.identityKey,
        identityKeyB: targetB.identityKey,
        identityStatusA: targetA.identityStatus,
        identityStatusB: targetB.identityStatus,
        sourceLocalValueA: rowA?.[reference.fromColumn],
        sourceLocalValueB: rowB?.[reference.fromColumn],
        reason,
      });
    }
  }
  return differences;
}

function sourceRecord(entry: IndexedRow | null): ComparedSourceRecord | null {
  return entry ? { identity: entry.identity, row: entry.row } : null;
}

function emptyFieldDifferences(): FieldDifference[] {
  return [];
}

function makeOneSided(
  tableName: string,
  entry: IndexedRow,
  side: "A" | "B",
): ComparedRecord {
  const isStable = entry.identity.status === "stable" && entry.identity.key !== null;
  return {
    tableName,
    status: isStable ? (side === "A" ? "only-in-a" : "only-in-b") : "uncertain-linked",
    identityKey: entry.identity.key,
    identityStatus: entry.identity.status,
    identityStrategy: entry.identity.strategy,
    sourceA: side === "A" ? sourceRecord(entry) : null,
    sourceB: side === "B" ? sourceRecord(entry) : null,
    fieldDifferences: emptyFieldDifferences(),
    relationshipDifferences: [],
    uncertaintyReasons: isStable ? [] : [entry.identity.reason],
    absenceInterpretation: isStable ? "unknown" : null,
  };
}

function makeUncertain(
  tableName: string,
  entryA: IndexedRow | null,
  entryB: IndexedRow | null,
  reason: string,
  identityKey = entryA?.identity.key ?? entryB?.identity.key ?? null,
): ComparedRecord {
  const identitySource = entryA ?? entryB;
  return {
    tableName,
    status: "uncertain-linked",
    identityKey,
    identityStatus: identitySource?.identity.status ?? "uncertain",
    identityStrategy: identitySource?.identity.strategy ?? "unknown",
    sourceA: sourceRecord(entryA),
    sourceB: sourceRecord(entryB),
    // Ambiguous rows are not a confirmed pair. In particular, do not surface
    // source-local primary or foreign keys as if their values were comparable.
    fieldDifferences: [],
    relationshipDifferences: [],
    uncertaintyReasons: [reason],
    absenceInterpretation: null,
  };
}

function makePaired(
  indexes: RelationshipIndexes,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
  tableName: string,
  entryA: IndexedRow,
  entryB: IndexedRow,
  context?: LocationResolutionContext,
  playlistContext?: PlaylistResolutionContext,
): ComparedRecord {
  const tableA = snapshotA.tables[tableName];
  const tableB = snapshotB.tables[tableName];
  const fieldDifferences = compareFields(tableName, tableA, tableB, entryA.row, entryB.row);
  const relationshipDifferences = compareRelationships(
    indexes, snapshotA, snapshotB, tableName, tableA, tableB, entryA.row, entryB.row, context, playlistContext,
  );
  if (tableName === "UserMark") {
    const rangesA = blockRangeSet(snapshotA, entryA.row.UserMarkId);
    const rangesB = blockRangeSet(snapshotB, entryB.row.UserMarkId);
    if (!rangesA || !rangesB || rangesA.duplicate || rangesB.duplicate) {
      relationshipDifferences.push({
        field: "BlockRanges", targetTable: "BlockRange", status: "uncertain",
        identityKeyA: rangesA?.key ?? null, identityKeyB: rangesB?.key ?? null,
        identityStatusA: rangesA && !rangesA.duplicate ? "stable" : "uncertain",
        identityStatusB: rangesB && !rangesB.duplicate ? "stable" : "uncertain",
        sourceLocalValueA: entryA.row.UserMarkId, sourceLocalValueB: entryB.row.UserMarkId,
        reason: "De bereikset is niet volledig of bevat dubbele coördinaten; behoud wordt geblokkeerd.",
        rangeCountA: rangesA?.count, rangeCountB: rangesB?.count,
      });
    } else if (rangesA.key !== rangesB.key) {
      relationshipDifferences.push({
        field: "BlockRanges", targetTable: "BlockRange", status: "changed",
        identityKeyA: rangesA.key, identityKeyB: rangesB.key,
        identityStatusA: "stable", identityStatusB: "stable",
        sourceLocalValueA: entryA.row.UserMarkId, sourceLocalValueB: entryB.row.UserMarkId,
        reason: "De volledige bereikset van deze markering verschilt; kies één bron voor de markering en haar bereiken.",
        rangeCountA: rangesA.count, rangeCountB: rangesB.count,
      });
    }
  }
  const uncertaintyReasons = relationshipDifferences
    .filter((difference) => difference.status === "uncertain")
    .map((difference) => difference.reason ?? `Relatie ${difference.field} is onzeker.`);

  let status: ComparisonStatus;
  const hasUncertainRelationship = relationshipDifferences.some((item) => item.status === "uncertain");
  const hasChangedRelationship = relationshipDifferences.some((item) => item.status === "changed");
  if (entryA.identity.status === "candidate" || entryB.identity.status === "candidate") {
    status = "uncertain-linked";
    uncertaintyReasons.unshift("De rijen delen alleen een kandidaat-identiteit; er wordt geen definitieve match aangenomen.");
  } else if (fieldDifferences.length === 0 && !hasChangedRelationship) {
    status = "equal";
    if (hasUncertainRelationship) {
      status = "uncertain-linked";
    }
  } else {
    const conflicts = new Set(primaryConflictFields[tableName] ?? []);
    const hasPotentialContentConflict = fieldDifferences.some((difference) => conflicts.has(difference.field))
      || hasChangedRelationship;
    status = hasPotentialContentConflict ? "possible-conflict" : "changed";
  }

  if (status === "equal" && uncertaintyReasons.length > 0) status = "uncertain-linked";
  return {
    tableName,
    status,
    identityKey: entryA.identity.key,
    identityStatus: entryA.identity.status,
    identityStrategy: entryA.identity.strategy,
    sourceA: sourceRecord(entryA),
    sourceB: sourceRecord(entryB),
    fieldDifferences,
    relationshipDifferences,
    uncertaintyReasons,
    absenceInterpretation: null,
  };
}

function compareTable(
  indexes: RelationshipIndexes,
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
  tableName: string,
  context?: LocationResolutionContext,
  playlistContext?: PlaylistResolutionContext,
): ComparedRecord[] {
  const rowsA = identityRows(snapshotA, snapshotB, tableName, "A", context, playlistContext);
  const rowsB = identityRows(snapshotB, snapshotA, tableName, "B", context, playlistContext);
  const stableA = rowsA.filter((row) => row.identity.status === "stable" && row.identity.key !== null);
  const stableB = rowsB.filter((row) => row.identity.status === "stable" && row.identity.key !== null);
  const candidateA = rowsA.filter((row) => row.identity.status === "candidate" && row.identity.key !== null);
  const candidateB = rowsB.filter((row) => row.identity.status === "candidate" && row.identity.key !== null);
  const uncertainA = rowsA.filter((row) => row.identity.status === "uncertain" || row.identity.key === null);
  const uncertainB = rowsB.filter((row) => row.identity.status === "uncertain" || row.identity.key === null);
  const result: ComparedRecord[] = [];

  const stableGroupsA = groupByIdentity(stableA);
  const stableGroupsB = groupByIdentity(stableB);
  for (const key of [...new Set([...stableGroupsA.keys(), ...stableGroupsB.keys()])].sort()) {
    const groupA = stableGroupsA.get(key) ?? [];
    const groupB = stableGroupsB.get(key) ?? [];
    if (groupA.length === 1 && groupB.length === 1) {
      result.push(makePaired(indexes, snapshotA, snapshotB, tableName, groupA[0]!, groupB[0]!, context, playlistContext));
    } else if (groupA.length === 1 && groupB.length === 0) {
      result.push(makeOneSided(tableName, groupA[0]!, "A"));
    } else if (groupB.length === 1 && groupA.length === 0) {
      result.push(makeOneSided(tableName, groupB[0]!, "B"));
    } else {
      for (const entry of groupA) result.push(makeUncertain(tableName, entry, null,
        "Dezelfde sterke identiteit komt meer dan één keer voor in bron A.", key));
      for (const entry of groupB) result.push(makeUncertain(tableName, null, entry,
        "Dezelfde sterke identiteit komt meer dan één keer voor in bron B.", key));
    }
  }

  const candidateGroupsA = groupByIdentity(candidateA);
  const candidateGroupsB = groupByIdentity(candidateB);
  for (const key of [...new Set([...candidateGroupsA.keys(), ...candidateGroupsB.keys()])].sort()) {
    const groupA = candidateGroupsA.get(key) ?? [];
    const groupB = candidateGroupsB.get(key) ?? [];
    if (groupA.length === 1 && groupB.length === 1) {
      result.push(makePaired(indexes, snapshotA, snapshotB, tableName, groupA[0]!, groupB[0]!, context));
    } else {
      const duplicate = groupA.length > 1 || groupB.length > 1;
      for (const entry of groupA) result.push(makeUncertain(tableName, entry, null,
        duplicate ? "De kandidaat-identiteit komt dubbel voor in bron A of B." : "Deze kandidaat-identiteit komt alleen voor in bron A.", key));
      for (const entry of groupB) result.push(makeUncertain(tableName, null, entry,
        duplicate ? "De kandidaat-identiteit komt dubbel voor in bron A of B." : "Deze kandidaat-identiteit komt alleen voor in bron B.", key));
    }
  }

  for (const entry of uncertainA) result.push(makeUncertain(
    tableName, entry, null, entry.identity.reason,
  ));
  for (const entry of uncertainB) result.push(makeUncertain(
    tableName, null, entry, entry.identity.reason,
  ));
  return result;
}

function emptyCounts(): Record<ComparisonStatus, number> {
  return {
    equal: 0,
    "only-in-a": 0,
    "only-in-b": 0,
    changed: 0,
    "possible-conflict": 0,
    "uncertain-linked": 0,
  };
}

function sourceSummary(snapshot: UserDataSnapshot): ComparisonSourceSummary {
  return {
    fileName: snapshot.sourceFileName,
    schemaVersion: snapshot.schemaVersion,
    recordCounts: snapshot.recordCounts,
    timestamps: normalizeUserDataTimestamps(snapshot),
  };
}

/** Compare two already-read backups. This function reports differences only; it does not merge or choose winners. */
export function compareLibraries(
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
  locationResolution?: LocationResolutionContext,
  playlistResolution?: PlaylistResolutionContext,
): LibraryComparison {
  const activeLocationResolution = locationResolution
    && isLocationResolutionContextCurrent(locationResolution, snapshotA, snapshotB)
    ? locationResolution : undefined;
  const activePlaylistResolution = playlistResolution && activeLocationResolution
    && isPlaylistResolutionContextCurrent(playlistResolution, snapshotA, snapshotB,
      playlistResolution.sourceLibraries.A, playlistResolution.sourceLibraries.B, activeLocationResolution)
    ? playlistResolution : undefined;
  const tableNames = [...new Set([
    ...Object.keys(snapshotA.tables),
    ...Object.keys(snapshotB.tables),
  ])].sort();
  const relationshipIndexes: RelationshipIndexes = new WeakMap();
  const records = tableNames.flatMap((tableName) =>
    compareTable(relationshipIndexes, snapshotA, snapshotB, tableName, activeLocationResolution, activePlaylistResolution),
  );
  const countsByStatus = emptyCounts();
  const perTable: Record<string, Record<ComparisonStatus, number>> = {};

  for (const record of records) {
    countsByStatus[record.status] += 1;
    const counts = perTable[record.tableName] ?? emptyCounts();
    counts[record.status] += 1;
    perTable[record.tableName] = counts;
  }

  return {
    sourceA: sourceSummary(snapshotA),
    sourceB: sourceSummary(snapshotB),
    records,
    summary: {
      countsByStatus,
      changedRecordCount: countsByStatus.changed + countsByStatus["possible-conflict"],
      perTable,
    },
  };
}
