import type { SqlValue } from "sql.js";
import type { UserDataRow, UserDataSnapshot } from "../database/readUserData";
import { identifyRecord } from "./recordIdentity";
import { compareLibraries, type ComparedRecord, type LibraryComparison } from "./compareLibraries";
import { normalizeTimestamp } from "./normalizeTimestamp";
import type {
  MergeDecision,
  MergeDecisionAction,
  MergeDecisionDifference,
  MergeDecisionOverlap,
  MergeDecisionSource,
  MergeDecisionValue,
  MergeDecisionTimestamp,
} from "../types";

export type ThreeWayOutcome =
  | "unchanged"
  | "changed-in-a"
  | "changed-in-b"
  | "same-change"
  | "non-overlapping"
  | "conflict"
  | "uncertain";

export type ThreeWayRecordDecision = MergeDecision & { readonly outcome: ThreeWayOutcome };

export interface ThreeWayComparison {
  /** The base is comparison context only and is never one of the output sources. */
  readonly baseFileName: string | null;
  readonly sourceAFileName: string;
  readonly sourceBFileName: string;
  readonly records: readonly ThreeWayRecordDecision[];
  readonly summary: Readonly<Record<ThreeWayOutcome, number>>;
}

interface IndexedRecord {
  readonly tableName: string;
  readonly identityKey: string;
  readonly strategy: string;
  readonly row: UserDataRow;
}

type RecordGroups = Map<string, IndexedRecord[]>;

const timestampFields = new Set(["Created", "LastModified"]);
const tableLabels: Readonly<Record<string, string>> = {
  BlockRange: "Markeerbereik",
  Bookmark: "Bladwijzer",
  InputField: "Invoerveld",
  LastModified: "Databasetijd",
  Location: "Publicatie- of mediaplek",
  Note: "Aantekening",
  Tag: "Label",
  TagMap: "Labelkoppeling",
  UserMark: "Markering",
};

function recordKey(tableName: string, identityKey: string): string {
  return `${tableName}\u0000${identityKey}`;
}

function indexStableRecords(snapshot: UserDataSnapshot): RecordGroups {
  const groups: RecordGroups = new Map();
  for (const [tableName, table] of Object.entries(snapshot.tables)) {
    table.rows.forEach((row, index) => {
      const identity = identifyRecord(snapshot, tableName, row, index);
      if (identity.status !== "stable" || identity.key === null) return;
      const key = recordKey(tableName, identity.key);
      const group = groups.get(key) ?? [];
      group.push({ tableName, identityKey: identity.key, strategy: identity.strategy, row });
      groups.set(key, group);
    });
  }
  return groups;
}

function pairIndex(comparison: LibraryComparison): Map<string, ComparedRecord[]> {
  const index = new Map<string, ComparedRecord[]>();
  for (const record of comparison.records) {
    if (!record.identityKey) continue;
    const key = recordKey(record.tableName, record.identityKey);
    const group = index.get(key) ?? [];
    group.push(record);
    index.set(key, group);
  }
  return index;
}

function pairRecord(index: Map<string, ComparedRecord[]>, key: string): ComparedRecord | null {
  const matches = index.get(key) ?? [];
  return matches.length === 1 ? matches[0]! : null;
}

function mergeValue(value: SqlValue | undefined): MergeDecisionValue {
  return value === undefined ? { presence: "missing" } : { presence: "present", value };
}

function valuesEqual(a: SqlValue | undefined, b: SqlValue | undefined): boolean {
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }
  return a === b;
}

function safeLabel(tableName: string, row: UserDataRow | null): string {
  if (!row) return `Record ontbreekt in deze back-up`;
  const primary = row.Title ?? row.Label ?? row.Name;
  if (typeof primary === "string" && primary.trim()) return `${tableLabels[tableName] ?? "Gegeven"}: ${primary}`;
  return tableLabels[tableName] ?? "Gegeven";
}

function source(label: "A" | "B" | "basis", fileName: string, tableName: string, row: UserDataRow | null): MergeDecisionSource {
  return { label, fileName, recordLabel: safeLabel(tableName, row) };
}

function timestampEvidence(
  label: "A" | "B" | "basis",
  snapshot: UserDataSnapshot,
  row: UserDataRow | null,
  tableName: string,
): MergeDecisionTimestamp[] {
  const timestamps: MergeDecisionTimestamp[] = [
    { source: label, kind: "archive", field: "creationDate", value: normalizeTimestamp(snapshot.modificationTimes.archiveCreatedAt) },
    { source: label, kind: "manifest", field: "lastModifiedDate", value: normalizeTimestamp(snapshot.modificationTimes.manifestDatabaseLastModified) },
    { source: label, kind: "database", field: "LastModified", value: normalizeTimestamp(snapshot.modificationTimes.databaseLastModified) },
  ];
  if (tableName === "Note" && row) {
    timestamps.push(
      { source: label, kind: "record", field: "Created", value: normalizeTimestamp(row.Created) },
      { source: label, kind: "record", field: "LastModified", value: normalizeTimestamp(row.LastModified) },
    );
  }
  return timestamps;
}

function comparisonsHaveUncertainRelationships(...records: (ComparedRecord | null)[]): boolean {
  return records.some((record) => record?.relationshipDifferences.some((difference) =>
    difference.status === "uncertain" && difference.identityKeyA !== difference.identityKeyB,
  ));
}

function changedRelationshipPaths(...records: (ComparedRecord | null)[]): string[] {
  return [...new Set(records.flatMap((record) => record?.relationshipDifferences
    .filter((difference) => difference.status === "changed")
    .map((difference) => `relationship.${difference.field}`) ?? []))];
}

function actionsFor(outcome: ThreeWayOutcome, hasBase: boolean): readonly MergeDecisionAction[] {
  if (outcome === "changed-in-a") return ["take-a", "take-b", "keep-both"];
  if (outcome === "changed-in-b") return ["take-a", "take-b", "keep-both"];
  if (outcome === "non-overlapping") return ["combine-non-overlapping", "take-a", "take-b", "edit-manually"];
  if (outcome === "same-change" || outcome === "unchanged") return ["combine-non-overlapping", "take-a", "take-b"];
  return hasBase
    ? ["take-a", "take-b", "edit-manually", "keep-both"]
    : ["take-a", "take-b", "combine-non-overlapping", "edit-manually", "keep-both"];
}

function proposedAction(outcome: ThreeWayOutcome): MergeDecisionAction | null {
  if (outcome === "changed-in-a") return "take-a";
  if (outcome === "changed-in-b") return "take-b";
  if (outcome === "non-overlapping" || outcome === "same-change") return "combine-non-overlapping";
  return null;
}

function emptySummary(): Record<ThreeWayOutcome, number> {
  return {
    unchanged: 0,
    "changed-in-a": 0,
    "changed-in-b": 0,
    "same-change": 0,
    "non-overlapping": 0,
    conflict: 0,
    uncertain: 0,
  };
}

/** Compare three snapshots without creating a merged snapshot or exporting a file. */
export function compareThreeWay(
  sourceA: UserDataSnapshot,
  sourceB: UserDataSnapshot,
  base: UserDataSnapshot | null,
): ThreeWayComparison {
  const comparisonAB = compareLibraries(sourceA, sourceB);
  const abIndex = pairIndex(comparisonAB);
  const aGroups = indexStableRecords(sourceA);
  const bGroups = indexStableRecords(sourceB);
  const baseGroups = base ? indexStableRecords(base) : new Map<string, IndexedRecord[]>();
  const baseAIndex = base ? pairIndex(compareLibraries(base, sourceA)) : new Map<string, ComparedRecord[]>();
  const baseBIndex = base ? pairIndex(compareLibraries(base, sourceB)) : new Map<string, ComparedRecord[]>();
  const records: ThreeWayRecordDecision[] = [];
  const allKeys = new Set([...aGroups.keys(), ...bGroups.keys(), ...baseGroups.keys()]);

  for (const key of [...allKeys].sort()) {
    const groupA = aGroups.get(key) ?? [];
    const groupB = bGroups.get(key) ?? [];
    const groupBase = baseGroups.get(key) ?? [];
    const entryA = groupA.length === 1 ? groupA[0]! : null;
    const entryB = groupB.length === 1 ? groupB[0]! : null;
    const entryBase = groupBase.length === 1 ? groupBase[0]! : null;
    const identitySource = entryA ?? entryB ?? entryBase;
    if (!identitySource) continue;

    const tableName = identitySource.tableName;
    const identityKey = identitySource.identityKey;
    const tableKey = recordKey(tableName, identityKey);
    const rowA = entryA?.row ?? null;
    const rowB = entryB?.row ?? null;
    const rowBase = entryBase?.row ?? null;
    const ab = pairRecord(abIndex, tableKey);
    const baseA = base ? pairRecord(baseAIndex, tableKey) : null;
    const baseB = base ? pairRecord(baseBIndex, tableKey) : null;
    const duplicate = groupA.length > 1 || groupB.length > 1 || groupBase.length > 1;
    const identityUncertain = !entryA && !entryB && !entryBase;
    const uncertainRelationships = comparisonsHaveUncertainRelationships(ab, baseA, baseB);

    const changedFieldsA = new Set(base
      ? (baseA?.fieldDifferences ?? []).map((difference) => difference.field)
      : (ab?.fieldDifferences ?? []).map((difference) => difference.field));
    const changedFieldsB = new Set(base
      ? (baseB?.fieldDifferences ?? []).map((difference) => difference.field)
      : (ab?.fieldDifferences ?? []).map((difference) => difference.field));
    const fieldNames = new Set([
      ...(ab?.fieldDifferences ?? []).map((difference) => difference.field),
      ...(baseA?.fieldDifferences ?? []).map((difference) => difference.field),
      ...(baseB?.fieldDifferences ?? []).map((difference) => difference.field),
    ]);
    const differences: MergeDecisionDifference[] = [...fieldNames].sort().map((field) => {
      const changedA = changedFieldsA.has(field);
      const changedB = changedFieldsB.has(field);
      return {
        granularity: "field",
        path: field,
        label: field,
        valueA: mergeValue(rowA?.[field]),
        valueB: mergeValue(rowB?.[field]),
        baseValue: base ? mergeValue(rowBase?.[field]) : null,
        changedFromBase: base
          ? { A: changedA, B: changedB }
          : { A: changedA ? null : null, B: changedB ? null : null },
      };
    });

    const overlappingChanges: MergeDecisionOverlap[] = [];
    if (base && rowBase && rowA && rowB) {
      for (const field of fieldNames) {
        if (!changedFieldsA.has(field) || !changedFieldsB.has(field) || timestampFields.has(field)) continue;
        if (!valuesEqual(rowA[field], rowB[field])) {
          overlappingChanges.push({
            // Note.Content stays opaque field text here; Step 20 adds actual block parsing.
            granularity: "field",
            path: field,
            reason: `Bron A en bron B hebben ${field} allebei aangepast ten opzichte van de basis en de nieuwe waarden verschillen.`,
          });
        }
      }
    }

    const changedA = base
      ? Boolean(rowA !== null && (changedFieldsA.size > 0 || changedRelationshipPaths(baseA).length > 0)
        || rowBase && !rowA)
      : Boolean(ab && ab.status !== "equal" && ab.status !== "uncertain-linked");
    const changedB = base
      ? Boolean(rowB !== null && (changedFieldsB.size > 0 || changedRelationshipPaths(baseB).length > 0)
        || rowBase && !rowB)
      : Boolean(ab && ab.status !== "equal" && ab.status !== "uncertain-linked");

    let outcome: ThreeWayOutcome;
    if (duplicate || uncertainRelationships || identityUncertain) {
      outcome = "uncertain";
    } else if (!base) {
      outcome = ab?.status === "equal" ? "unchanged" : ab?.status === "uncertain-linked" ? "uncertain" : "conflict";
    } else if (overlappingChanges.length > 0) {
      outcome = "conflict";
    } else if (rowBase && !rowA && !rowB) {
      outcome = "same-change";
    } else if (rowBase && !rowA && rowB && changedFieldsB.size === 0 && changedRelationshipPaths(baseB).length === 0) {
      outcome = "changed-in-a";
    } else if (rowBase && rowA && !rowB && changedFieldsA.size === 0 && changedRelationshipPaths(baseA).length === 0) {
      outcome = "changed-in-b";
    } else if (rowBase && !rowA && rowB || rowBase && rowA && !rowB) {
      outcome = "conflict";
      overlappingChanges.push({
        granularity: "field",
        path: "$record-presence",
        reason: "De ene bron verwijdert het record en de andere wijzigt het sinds de basis.",
      });
    } else if (!rowBase && rowA && !rowB) {
      outcome = "changed-in-a";
    } else if (!rowBase && !rowA && rowB) {
      outcome = "changed-in-b";
    } else if (!rowBase && rowA && rowB) {
      outcome = ab?.fieldDifferences.length ? "uncertain" : "same-change";
    } else if (differences.length === 0 && !changedA && !changedB) {
      outcome = "unchanged";
    } else if (changedA && changedB) {
      const aOnlyField = [...changedFieldsA].some((field) => !changedFieldsB.has(field));
      const bOnlyField = [...changedFieldsB].some((field) => !changedFieldsA.has(field));
      outcome = aOnlyField || bOnlyField ? "non-overlapping" : "same-change";
    } else if (changedA) {
      outcome = "changed-in-a";
    } else if (changedB) {
      outcome = "changed-in-b";
    } else {
      outcome = "uncertain";
    }

    const hasBase = base !== null;
    const conflictStatus = outcome === "uncertain"
      ? "uncertain" as const
      : outcome === "conflict"
        ? hasBase && overlappingChanges.length > 0 ? "confirmed" as const : "possible" as const
        : !hasBase && outcome !== "unchanged" ? "possible" as const : "none" as const;
    const reason = outcome === "changed-in-a"
      ? "Alleen bron A wijkt sinds de basis af; de wijziging uit A kan worden toegepast."
      : outcome === "changed-in-b"
        ? "Alleen bron B wijkt sinds de basis af; de wijziging uit B kan worden toegepast."
        : outcome === "same-change"
          ? "Beide bronnen bevatten dezelfde wijziging; die hoeft maar één keer te worden behouden."
          : outcome === "non-overlapping"
            ? "De bronnen hebben verschillende velden aangepast; die wijzigingen kunnen naast elkaar bestaan."
            : outcome === "conflict"
              ? hasBase
                ? "Beide bronnen hebben hetzelfde veld of blok sinds de basis verschillend aangepast."
                : "Zonder basisversie is niet vast te stellen of een verschil een gelijktijdig conflict is."
              : outcome === "unchanged"
                ? "Er is geen inhoudelijke wijziging vastgesteld."
                : "De identiteit of relaties zijn niet betrouwbaar genoeg om automatisch te classificeren.";

    const common = {
      tableName,
      logicalIdentity: {
        key: identityKey,
        confidence: duplicate ? "uncertain" as const : "stable" as const,
        strategy: identitySource.strategy,
      },
      sourceA: rowA ? source("A", sourceA.sourceFileName, tableName, rowA) : null,
      sourceB: rowB ? source("B", sourceB.sourceFileName, tableName, rowB) : null,
      differences,
      timestamps: [
        ...timestampEvidence("A", sourceA, rowA, tableName),
        ...timestampEvidence("B", sourceB, rowB, tableName),
        ...(base ? timestampEvidence("basis", base, rowBase, tableName) : []),
      ],
      proposedAction: proposedAction(outcome),
      availableActions: actionsFor(outcome, hasBase),
      reason,
      outcome,
    };

    if (conflictStatus === "confirmed") {
      records.push({
        ...common,
        conflictStatus,
        baseVersion: source("basis", base!.sourceFileName, tableName, rowBase),
        conflictReason: reason,
        overlappingChanges: overlappingChanges as [MergeDecisionOverlap, ...MergeDecisionOverlap[]],
      });
    } else if (conflictStatus === "possible") {
      records.push({
        ...common,
        conflictStatus,
        baseVersion: null,
        conflictReason: reason,
        overlappingChanges,
      });
    } else if (conflictStatus === "uncertain") {
      records.push({
        ...common,
        conflictStatus,
        baseVersion: base ? source("basis", base.sourceFileName, tableName, rowBase) : null,
        conflictReason: reason,
        overlappingChanges,
      });
    } else {
      records.push({
        ...common,
        conflictStatus,
        baseVersion: base ? source("basis", base.sourceFileName, tableName, rowBase) : null,
        conflictReason: null,
        overlappingChanges: [],
      });
    }
  }

  // Candidate and unidentifiable rows are still surfaced for review. Their
  // provisional keys may help a person recognize them, but never authorize a
  // three-way automatic match.
  comparisonAB.records
    .filter((record) => record.identityStatus !== "stable")
    .forEach((record) => {
      const rowA = record.sourceA?.row ?? null;
      const rowB = record.sourceB?.row ?? null;
      const reason = record.uncertaintyReasons.join(" ")
        || "De recordidentiteit is niet stabiel genoeg voor een automatische driewegvergelijking.";
      records.push({
        tableName: record.tableName,
        logicalIdentity: {
          key: record.identityKey,
          confidence: record.identityStatus,
          strategy: record.identityStrategy,
        },
        sourceA: rowA ? source("A", sourceA.sourceFileName, record.tableName, rowA) : null,
        sourceB: rowB ? source("B", sourceB.sourceFileName, record.tableName, rowB) : null,
        differences: record.fieldDifferences.map((difference) => ({
          granularity: "field",
          path: difference.field,
          label: difference.field,
          valueA: mergeValue(difference.valueA),
          valueB: mergeValue(difference.valueB),
          baseValue: null,
          changedFromBase: { A: null, B: null },
        })),
        timestamps: [
          ...timestampEvidence("A", sourceA, rowA, record.tableName),
          ...timestampEvidence("B", sourceB, rowB, record.tableName),
          ...(base ? timestampEvidence("basis", base, null, record.tableName) : []),
        ],
        proposedAction: null,
        availableActions: ["take-a", "take-b", "edit-manually"] as const,
        reason,
        conflictStatus: "uncertain",
        baseVersion: base ? source("basis", base.sourceFileName, record.tableName, null) : null,
        conflictReason: reason,
        overlappingChanges: [],
        outcome: "uncertain",
      });
    });

  const summary = emptySummary();
  for (const record of records) summary[record.outcome] += 1;
  return {
    baseFileName: base?.sourceFileName ?? null,
    sourceAFileName: sourceA.sourceFileName,
    sourceBFileName: sourceB.sourceFileName,
    records,
    summary,
  };
}
