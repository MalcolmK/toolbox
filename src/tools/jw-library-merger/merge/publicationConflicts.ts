import { identifyRecord } from "../compare/recordIdentity";
import type { FieldDifference } from "../compare/compareLibraries";
import type { UserDataRow, UserDataSnapshot } from "../database/readUserData";
import type { MergeSource, SimpleMergeRecord } from "./simpleMerge";
import type { SimpleMergePreview } from "./prepareSimpleMerge";

export interface PublicationConflictGroup {
  readonly key: string;
  readonly label: string;
  readonly records: readonly SimpleMergeRecord[];
  readonly recordKeys: readonly string[];
  readonly differences: readonly {
    readonly tableName: string;
    readonly recordKey: string;
    readonly label: string;
    readonly fields: readonly FieldDifference[];
  }[];
  readonly selectedSource: MergeSource | null;
}

export function simpleMergeReviewKey(tableName: string, identityKey: string): string {
  return `${tableName}:${identityKey}`;
}

function locationFor(snapshot: UserDataSnapshot, row: UserDataRow): UserDataRow | null {
  const table = snapshot.tables.Location;
  const localId = row.LocationId ?? row.PublicationLocationId;
  if (!table || (typeof localId !== "number" && typeof localId !== "string")) return null;
  return table.rows.find((location) => location.LocationId === localId) ?? null;
}

function publicationKey(
  snapshot: UserDataSnapshot,
  record: SimpleMergeRecord,
  row: UserDataRow,
): string | null {
  if (record.tableName === "Location") {
    return identifyRecord(snapshot, "Location", row).key;
  }
  const location = locationFor(snapshot, row);
  return location ? identifyRecord(snapshot, "Location", location).key : null;
}

function publicationLabel(snapshot: UserDataSnapshot, locationKey: string): string {
  const locationTable = snapshot.tables.Location;
  const location = locationTable?.rows.find((row) => identifyRecord(snapshot, "Location", row).key === locationKey);
  if (!location) return "Publicatie met conflict";
  if (typeof location.Title === "string" && location.Title.trim()) return location.Title.trim();
  const symbol = typeof location.KeySymbol === "string" && location.KeySymbol.trim() ? location.KeySymbol.trim() : null;
  const chapter = typeof location.ChapterNumber === "number" ? ` · hoofdstuk ${location.ChapterNumber}` : "";
  const book = typeof location.BookNumber === "number" ? `Bijbelboek ${location.BookNumber}` : null;
  return `${symbol ?? book ?? "Publicatie"}${chapter}`;
}

/**
 * Exposes only two-sided changed records with a usable logical identity and a
 * confidently shared publication parent. Duplicate or uncertain identities
 * remain blocked for review instead of being resolved by a broad A/B choice.
 */
export function getPublicationConflictGroups(
  preview: SimpleMergePreview,
  selections: ReadonlyMap<string, MergeSource> = new Map(),
): PublicationConflictGroup[] {
  const groups = new Map<string, {
    records: SimpleMergeRecord[];
    recordKeys: string[];
    differences: PublicationConflictGroup["differences"][number][];
  }>();
  const [sourceA, sourceB] = preview.sources;

  for (const compared of preview.comparison.records) {
    const record = preview.mergePlan.records.find((item) => item.tableName === compared.tableName
      && item.identityKey === compared.identityKey
      && item.comparisonStatus === compared.status);
    const isReviewableConflict = compared.status === "possible-conflict"
      || (compared.status === "changed"
        && (record?.action === "needs-review" || record?.confidence === "manual-choice"));
    if (!isReviewableConflict
      || compared.identityStatus === "uncertain"
      || !compared.identityKey
      || !compared.sourceA
      || !compared.sourceB) continue;
    if (!record) continue;
    const keyA = publicationKey(sourceA.snapshot, record, compared.sourceA.row);
    const keyB = publicationKey(sourceB.snapshot, record, compared.sourceB.row);
    if (!keyA || keyA !== keyB) continue;
    const group = groups.get(keyA) ?? { records: [], recordKeys: [], differences: [] };
    group.records.push(record);
    const recordKey = simpleMergeReviewKey(record.tableName, record.identityKey!);
    group.recordKeys.push(recordKey);
    const title = compared.sourceA.row.Title ?? compared.sourceB.row.Title;
    group.differences.push({
      tableName: record.tableName,
      recordKey,
      label: record.tableName === "Note" && typeof title === "string" && title.trim()
        ? `Aantekening: ${title.trim()}`
        : record.tableName === "Location" ? "Publicatiegegevens" : record.tableName,
      fields: compared.fieldDifferences,
    });
    groups.set(keyA, group);
  }

  return [...groups.entries()].map(([key, group]) => {
    const chosenSources = group.recordKeys.map((reviewKey) => selections.get(reviewKey));
    const selectedSource: MergeSource | null = chosenSources.length > 0 && chosenSources.every((source) => source === "A")
      ? "A"
      : chosenSources.length > 0 && chosenSources.every((source) => source === "B")
        ? "B"
        : null;
    return {
      key,
      label: publicationLabel(sourceA.snapshot, key),
      records: group.records,
      recordKeys: group.recordKeys,
      differences: group.differences,
      selectedSource,
    };
  }).sort((left, right) => left.label.localeCompare(right.label, "nl"));
}
