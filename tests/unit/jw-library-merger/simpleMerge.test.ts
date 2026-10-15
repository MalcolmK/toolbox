import { readFile } from "node:fs/promises";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { readJwLibrary } from "../../../src/tools/jw-library-merger/archive/readJwLibrary";
import { readUserData, type UserDataSnapshot } from "../../../src/tools/jw-library-merger/database/readUserData";
import { validateUserData } from "../../../src/tools/jw-library-merger/database/validateUserData";
import { simpleMerge } from "../../../src/tools/jw-library-merger/merge/simpleMerge";
import { simpleMergeReviewKey } from "../../../src/tools/jw-library-merger/merge/publicationConflicts";
import { confirmLocationProposal, createLocationResolutionContext } from "../../../src/tools/jw-library-merger/merge/locationResolution";

const fixtureUrl = (name: string) => new URL(`../../fixtures/jw-library/${name}`, import.meta.url);
const sqliteWasm = new URL("../../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url);
const SQLPromise = readFile(sqliteWasm).then((wasmBinary) =>
  initSqlJs({ wasmBinary: new Uint8Array(wasmBinary) }),
);

async function readSnapshot(name: string) {
  const bytes = await readFile(fixtureUrl(name));
  const source = await readJwLibrary(new File([new Uint8Array(bytes)], name));
  const SQL = await SQLPromise;
  const validated = await validateUserData(source, () => Promise.resolve(SQL));
  return { snapshot: readUserData(validated), close: () => validated.database.close() };
}

function replaceNote(snapshot: UserDataSnapshot, patch: Readonly<Record<string, unknown>>): UserDataSnapshot {
  const table = snapshot.tables.Note!;
  return {
    ...snapshot,
    tables: {
      ...snapshot.tables,
      Note: {
        ...table,
        rows: [{ ...table.rows[0]!, ...patch }],
      },
    },
  };
}

function replaceTableRow(
  snapshot: UserDataSnapshot,
  tableName: string,
  rowIndex: number,
  patch: Readonly<Record<string, unknown>>,
): UserDataSnapshot {
  const table = snapshot.tables[tableName]!;
  return {
    ...snapshot,
    tables: {
      ...snapshot.tables,
      [tableName]: {
        ...table,
        rows: table.rows.map((row, index) => index === rowIndex ? { ...row, ...patch } : row),
      },
    },
  };
}

function replaceDatabaseTimestamp(snapshot: UserDataSnapshot, timestamp: string | null): UserDataSnapshot {
  const table = snapshot.tables.LastModified!;
  return {
    ...snapshot,
    modificationTimes: {
      ...snapshot.modificationTimes,
      databaseLastModified: timestamp,
      databaseLastModifiedValues: [timestamp],
    },
    tables: {
      ...snapshot.tables,
      LastModified: {
        ...table,
        rows: [{ ...table.rows[0]!, LastModified: timestamp }],
      },
    },
  };
}

function appendTableRow(snapshot: UserDataSnapshot, tableName: string, row: Readonly<Record<string, unknown>>): UserDataSnapshot {
  const table = snapshot.tables[tableName]!;
  return { ...snapshot, tables: { ...snapshot.tables,
    [tableName]: { ...table, rows: [...table.rows, row], rowCount: table.rowCount + 1 } } };
}

function confirmSharedPlace(snapshotA: UserDataSnapshot, snapshotB: UserDataSnapshot) {
  const context = createLocationResolutionContext("step-five", "place-pair", snapshotA, snapshotB);
  const proposal = context.proposals[0];
  if (!proposal) throw new Error("Expected one explicit shared-place proposal.");
  const result = confirmLocationProposal(context, proposal.id, "step-five", 0, snapshotA, snapshotB, "A");
  if (!result.ok) throw new Error(result.reason);
  return result.context;
}

function replaceManifestTimestamp(snapshot: UserDataSnapshot, timestamp: string | null): UserDataSnapshot {
  return {
    ...snapshot,
    modificationTimes: { ...snapshot.modificationTimes, manifestDatabaseLastModified: timestamp },
  };
}

describe("simpleMerge", () => {
  it("uses confirmed logical places for dependent rows with different local IDs", async () => {
    const a = await readSnapshot("identical-a.jwlibrary");
    const b = await readSnapshot("identical-b.jwlibrary");
    try {
      const snapshotA = appendTableRow(a.snapshot, "TagMap", {
        TagMapId: 2, PlaylistItemId: null, LocationId: 1, NoteId: null, TagId: 1, Position: 0,
      });
      const snapshotB = appendTableRow(b.snapshot, "TagMap", {
        TagMapId: 2, PlaylistItemId: null, LocationId: 99, NoteId: null, TagId: 1, Position: 0,
      });
      const context = confirmSharedPlace(snapshotA, snapshotB);
      const result = simpleMerge(snapshotA, snapshotB, new Map(), context);
      expect(result.records.filter((record) => ["Note", "UserMark", "BlockRange", "Bookmark", "InputField", "TagMap"]
        .includes(record.tableName)).every((record) => record.action === "keep-one")).toBe(true);
      expect(result.report.unresolved.filter((item) => ["Note", "UserMark", "BlockRange", "Bookmark", "InputField", "TagMap"]
        .includes(item.tableName))).toEqual([]);
      expect(result.records.filter((record) => record.tableName === "TagMap")).toHaveLength(2);
    } finally {
      a.close();
      b.close();
    }
  });

  it("does not release a playlist-location map when only its Location parent is confirmed", async () => {
    const a = await readSnapshot("identical-a.jwlibrary");
    const b = await readSnapshot("identical-b.jwlibrary");
    try {
      const snapshotA = appendTableRow(a.snapshot, "PlaylistItemLocationMap", {
        PlaylistItemId: 1, LocationId: 1, MajorMultimediaType: 0,
      });
      const snapshotB = appendTableRow(b.snapshot, "PlaylistItemLocationMap", {
        PlaylistItemId: 1, LocationId: 99, MajorMultimediaType: 0,
      });
      const context = confirmSharedPlace(snapshotA, snapshotB);
      const result = simpleMerge(snapshotA, snapshotB, new Map(), context);
      const maps = result.records.filter((record) => record.tableName === "PlaylistItemLocationMap");
      expect(maps.length).toBeGreaterThan(0);
      expect(maps.every((record) => record.action === "needs-review"
        && record.identityStatus === "uncertain")).toBe(true);
      expect(result.report.unresolved.some((item) => item.tableName === "PlaylistItemLocationMap")).toBe(true);
    } finally {
      a.close();
      b.close();
    }
  });

  it("requires a source choice for an InputField Value conflict under a confirmed place", async () => {
    const a = await readSnapshot("identical-a.jwlibrary");
    const b = await readSnapshot("identical-b.jwlibrary");
    try {
      const snapshotB = replaceTableRow(b.snapshot, "InputField", 0, { Value: "Value from B" });
      const context = confirmSharedPlace(a.snapshot, snapshotB);
      const pending = simpleMerge(a.snapshot, snapshotB, new Map(), context);
      const field = pending.records.find((record) => record.tableName === "InputField");
      expect(field?.action).toBe("needs-review");
      expect(field?.retainedAlternatives.map((candidate) => candidate.source).sort()).toEqual(["A", "B"]);
      const resolved = simpleMerge(a.snapshot, snapshotB,
        new Map([[simpleMergeReviewKey("InputField", field!.identityKey!), "A"]]), context);
      expect(resolved.records.find((record) => record.tableName === "InputField"))
        .toMatchObject({ action: "keep-one", selected: { source: "A", row: { Value: "Synthetic value" } } });
      expect(resolved.report.informationLoss).toEqual(expect.arrayContaining([
        expect.objectContaining({ tableName: "InputField", field: "Value", omittedFrom: "B", valueNotRetained: "Value from B" }),
      ]));
    } finally {
      a.close();
      b.close();
    }
  });

  it("blocks a bookmark whose precise target no longer resolves", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("base.jwlibrary");
    try {
      const snapshotB = replaceTableRow(b.snapshot, "Bookmark", 0, { LocationId: 999 });
      const result = simpleMerge(a.snapshot, snapshotB);
      expect(result.report.unresolved.some((item) => item.tableName === "Bookmark")).toBe(true);
    } finally {
      a.close();
      b.close();
    }
  });

  it("blocks same-slot bookmarks when their precise targets differ", async () => {
    const a = await readSnapshot("identical-a.jwlibrary");
    const b = await readSnapshot("identical-b.jwlibrary");
    try {
      const location = b.snapshot.tables.Location!.rows[0]!;
      const withSecondTarget = appendTableRow(b.snapshot, "Location", {
        ...location, LocationId: 100, DocumentId: 900100, KeySymbol: "SYNTHETIC-OTHER",
      });
      const snapshotB = replaceTableRow(withSecondTarget, "Bookmark", 0, { LocationId: 100 });
      const context = confirmSharedPlace(a.snapshot, snapshotB);
      const result = simpleMerge(a.snapshot, snapshotB, new Map(), context);
      const bookmark = result.records.find((record) => record.tableName === "Bookmark");
      expect(bookmark?.action).toBe("keep-both-pending-review");
      expect(bookmark?.retainedAlternatives.map((candidate) => candidate.source).sort()).toEqual(["A", "B"]);
      expect(result.report.unresolved.some((item) => item.tableName === "Bookmark")).toBe(true);
    } finally {
      a.close();
      b.close();
    }
  });

  it("treats changed mark range sets as one A/B decision and reports omitted coordinates", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("base.jwlibrary");
    try {
      const snapshotB = replaceTableRow(b.snapshot, "BlockRange", 0, { EndToken: 5 });
      const pending = simpleMerge(a.snapshot, snapshotB);
      const mark = pending.records.find((record) => record.tableName === "UserMark");
      expect(mark?.action).toBe("needs-review");
      expect(mark?.retainedAlternatives.map((candidate) => candidate.source).sort()).toEqual(["A", "B"]);
      const resolved = simpleMerge(a.snapshot, snapshotB,
        new Map([[simpleMergeReviewKey("UserMark", mark!.identityKey!), "A"]]));
      expect(resolved.records.find((record) => record.tableName === "UserMark"))
        .toMatchObject({ action: "keep-one", selected: { source: "A" } });
      expect(resolved.records.some((record) => record.tableName === "BlockRange" && record.action === "omit")).toBe(true);
      expect(resolved.report.informationLoss).toEqual(expect.arrayContaining([
        expect.objectContaining({ tableName: "BlockRange", field: "Range", omittedFrom: "B", valueNotRetained: "[1,10,0,5]" }),
      ]));
    } finally {
      a.close();
      b.close();
    }
  });

  it("blocks duplicate ranges and ranges whose parent mark is missing", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("base.jwlibrary");
    try {
      const table = b.snapshot.tables.BlockRange!;
      const duplicate = { ...table.rows[0]!, BlockRangeId: 99 };
      const duplicateSnapshot = appendTableRow(b.snapshot, "BlockRange", duplicate);
      const duplicatePlan = simpleMerge(a.snapshot, duplicateSnapshot);
      expect(duplicatePlan.report.unresolved.some((item) => item.tableName === "UserMark"
        || item.tableName === "BlockRange")).toBe(true);

      const orphan = replaceTableRow(b.snapshot, "BlockRange", 0, { UserMarkId: 999 });
      const orphanPlan = simpleMerge(a.snapshot, orphan);
      expect(orphanPlan.report.unresolved.some((item) => item.tableName === "BlockRange")).toBe(true);
    } finally {
      a.close();
      b.close();
    }
  });

  it("requires an explicit A/B choice for conflicting note content and reports the chosen source", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("modified-note-newer.jwlibrary");
    try {
      const pending = simpleMerge(a.snapshot, b.snapshot);
      const pendingNote = pending.records.find((record) => record.tableName === "Note");

      expect(pendingNote).toMatchObject({
        comparisonStatus: "possible-conflict",
        action: "needs-review",
        selected: null,
        confidence: "unresolved",
      });
      expect(pendingNote?.retainedAlternatives.map((alternative) => alternative.source)).toEqual(["A", "B"]);

      const reviewChoices = new Map([[simpleMergeReviewKey("Note", pendingNote!.identityKey!), "B" as const]]);
      const result = simpleMerge(a.snapshot, b.snapshot, reviewChoices);
      const note = result.records.find((record) => record.tableName === "Note");

      expect(result.status).toBe("needs-review"); // The separate Location uncertainty remains fail-closed.
      expect(note).toMatchObject({
        comparisonStatus: "possible-conflict",
        action: "keep-one",
        selected: { source: "B", row: { Content: expect.stringContaining("Updated text") } },
        confidence: "manual-choice",
      });
      expect(result.report.informationLoss).toEqual(expect.arrayContaining([
        expect.objectContaining({
          tableName: "Note",
          field: "Content",
          omittedFrom: "A",
          retainedFrom: "B",
          valueNotRetained: expect.stringContaining("Base text"),
          retainedValue: expect.stringContaining("Updated text"),
        }),
      ]));
      expect(result.report.unresolved.some((item) => item.tableName === "Location")).toBe(true);
      expect(a.snapshot.tables.Note?.rows[0]?.Content).toContain("Base text");
      expect(b.snapshot.tables.Note?.rows[0]?.Content).toContain("Updated text");
    } finally {
      a.close();
      b.close();
    }
  });

  it("keeps one-sided stable records and does not interpret absence as deletion", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("new-note.jwlibrary");
    try {
      const result = simpleMerge(a.snapshot, b.snapshot);
      const added = result.records.find((record) =>
        record.tableName === "Note" && record.selected?.row.Title === "Added synthetic note",
      );

      expect(added).toMatchObject({
        comparisonStatus: "only-in-b",
        action: "keep-one",
        selected: { source: "B" },
      });
      expect(result.report.choices).toEqual(expect.arrayContaining([
        expect.objectContaining({ tableName: "Note", selectedSource: "B", reason: expect.stringContaining("bewuste verwijdering is niet bewezen") }),
      ]));
    } finally {
      a.close();
      b.close();
    }
  });

  it("uses database recency when note timestamps cannot order the two versions", async () => {
    const a = await readSnapshot("conflict-source-a.jwlibrary");
    const b = await readSnapshot("conflict-source-b.jwlibrary");
    try {
      const snapshotA = replaceNote(a.snapshot, { Content: "Same content", LastModified: null });
      const snapshotB = replaceNote(b.snapshot, { Content: "Same content", LastModified: "not-a-time" });
      const result = simpleMerge(snapshotA, snapshotB);
      const note = result.records.find((record) => record.tableName === "Note");

      expect(note).toMatchObject({
        selected: { source: "B", row: { Content: "Same content" } },
        confidence: "database-timestamp",
      });
      expect(result.report.warnings.some((warning) => warning.includes("Note")
        && warning.includes("bronniveau-tijd"))).toBe(true);
      expect(result.report.unresolved.some((item) => item.tableName === "Note")).toBe(false);
      expect(result.status).toBe("needs-review");
    } finally {
      a.close();
      b.close();
    }
  });

  it("compares note timestamps by instant across timezone offsets", async () => {
    const a = await readSnapshot("conflict-source-a.jwlibrary");
    const b = await readSnapshot("conflict-source-b.jwlibrary");
    try {
      const snapshotA = replaceNote(a.snapshot, { Content: "Same content", LastModified: "2026-10-11T14:00:00+0200" });
      const snapshotB = replaceNote(b.snapshot, { Content: "Same content", LastModified: "2026-10-11T12:30:00Z" });
      const result = simpleMerge(snapshotA, snapshotB);
      const note = result.records.find((record) => record.tableName === "Note");

      expect(note).toMatchObject({
        selected: { source: "B", row: { Content: "Same content" } },
        confidence: "record-timestamp",
      });
      expect(note?.rule).toContain("12:30:00.000Z");
    } finally {
      a.close();
      b.close();
    }
  });

  it("falls back to database time when the two valid note timestamps represent the same instant", async () => {
    const a = await readSnapshot("conflict-source-a.jwlibrary");
    const b = await readSnapshot("conflict-source-b.jwlibrary");
    try {
      const snapshotA = replaceNote(a.snapshot, { Content: "Same content", BlockType: 0, LastModified: "2026-10-11T14:00:00+0200" });
      const snapshotB = replaceNote(b.snapshot, { Content: "Same content", BlockType: 1, LastModified: "2026-10-11T12:00:00Z" });
      const result = simpleMerge(snapshotA, snapshotB);
      const note = result.records.find((record) => record.tableName === "Note");

      expect(note).toMatchObject({ selected: { source: "B" }, confidence: "database-timestamp" });
    } finally {
      a.close();
      b.close();
    }
  });

  it("uses manifest database time only when database times are unavailable", async () => {
    const a = await readSnapshot("conflict-source-a.jwlibrary");
    const b = await readSnapshot("conflict-source-b.jwlibrary");
    try {
      const snapshotA = replaceManifestTimestamp(
        replaceNote(replaceDatabaseTimestamp(a.snapshot, null), { Content: "Same content", BlockType: 0, LastModified: "2026-10-11T12:00:00Z" }),
        "2026-10-11T11:00:00Z",
      );
      const snapshotB = replaceManifestTimestamp(
        replaceNote(replaceDatabaseTimestamp(b.snapshot, null), { Content: "Same content", BlockType: 1, LastModified: "2026-10-11T12:00:00Z" }),
        "2026-10-11T12:00:00Z",
      );
      const result = simpleMerge(snapshotA, snapshotB);
      const note = result.records.find((record) => record.tableName === "Note");

      expect(note).toMatchObject({ selected: { source: "B" }, confidence: "manifest-timestamp" });
      expect(result.report.warnings.some((warning) => warning.includes("manifesttijd"))).toBe(true);
    } finally {
      a.close();
      b.close();
    }
  });

  it("preserves the earliest valid Created value and reports the other value's omission", async () => {
    const a = await readSnapshot("conflict-source-a.jwlibrary");
    const b = await readSnapshot("conflict-source-b.jwlibrary");
    try {
      const snapshotA = replaceNote(a.snapshot, { Content: "Content A", Created: "2026-10-01T09:00:00Z" });
      const snapshotB = replaceNote(b.snapshot, { Content: "Content B", Created: "2026-10-02T09:00:00Z" });
      const noteIdentity = simpleMerge(snapshotA, snapshotB).records.find((record) => record.tableName === "Note")!.identityKey!;
      const result = simpleMerge(snapshotA, snapshotB, new Map([[simpleMergeReviewKey("Note", noteIdentity), "B" as const]]));
      const note = result.records.find((record) => record.tableName === "Note");

      expect(note?.selected?.source).toBe("B");
      expect(note?.selected?.row.Created).toBe("2026-10-01T09:00:00Z");
      expect(note?.selected?.fieldSources).toEqual({ Created: "A" });
      expect(result.report.informationLoss).toEqual(expect.arrayContaining([
        expect.objectContaining({
          field: "Created",
          valueNotRetained: "2026-10-02T09:00:00Z",
          omittedFrom: "B",
          retainedValue: "2026-10-01T09:00:00Z",
          retainedFrom: "A",
        }),
      ]));
    } finally {
      a.close();
      b.close();
    }
  });

  it("reports a relationship that is replaced by the selected record version", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("modified-note-newer.jwlibrary");
    try {
      const snapshotB = replaceNote(b.snapshot, { UserMarkId: 1 });
      const noteIdentity = simpleMerge(a.snapshot, snapshotB).records.find((record) => record.tableName === "Note")!.identityKey!;
      const result = simpleMerge(a.snapshot, snapshotB, new Map([[simpleMergeReviewKey("Note", noteIdentity), "B" as const]]));

      expect(result.report.informationLoss).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: "relationship",
          tableName: "Note",
          field: "UserMarkId",
          relationshipTargetTable: "UserMark",
          retainedFrom: "B",
          relationshipIdentityRetained: expect.stringContaining("UserMarkGuid"),
        }),
      ]));
    } finally {
      a.close();
      b.close();
    }
  });

  it("retains both alternatives and blocks the choice when all recency evidence is unknown", async () => {
    const a = await readSnapshot("conflict-source-a.jwlibrary");
    const b = await readSnapshot("conflict-source-b.jwlibrary");
    try {
      const clearTime = (snapshot: UserDataSnapshot): UserDataSnapshot => {
        const changed = replaceNote(snapshot, { LastModified: null });
        return {
          ...changed,
          modificationTimes: {
            ...changed.modificationTimes,
            manifestDatabaseLastModified: null,
            databaseLastModified: null,
            databaseLastModifiedValues: [],
          },
        };
      };
      const result = simpleMerge(clearTime(a.snapshot), clearTime(b.snapshot));
      const note = result.records.find((record) => record.tableName === "Note");

      expect(result.status).toBe("needs-review");
      expect(note).toMatchObject({
        action: "needs-review",
        selected: null,
        retainedAlternatives: [
          { source: "A", row: { Content: expect.stringContaining("source A") } },
          { source: "B", row: { Content: expect.stringContaining("source B") } },
        ],
      });
      expect(result.report.informationLoss).toEqual([]);
      expect(result.report.unresolved.some((item) => item.tableName === "Note")).toBe(true);
    } finally {
      a.close();
      b.close();
    }
  });

  it("keeps stable equal records once while retaining uncertain rows with their source provenance", async () => {
    const a = await readSnapshot("identical-a.jwlibrary");
    const b = await readSnapshot("identical-b.jwlibrary");
    try {
      const result = simpleMerge(a.snapshot, b.snapshot);
      const migrations = result.records.filter((record) => record.tableName === "grdb_migrations");
      const locations = result.records.filter((record) => record.tableName === "Location");

      expect(migrations).toHaveLength(1);
      expect(migrations[0]).toMatchObject({ action: "keep-one", confidence: "identical", selected: { source: "A" } });
      expect(locations).toHaveLength(2);
      expect(locations.every((record) => record.action === "needs-review"
        && record.selected === null && record.retainedAlternatives.length === 1
        && record.confidence === "unresolved")).toBe(true);
      expect(locations.map((record) => record.retainedAlternatives[0]?.source).sort()).toEqual(["A", "B"]);
      expect(result.report.unresolved.some((item) => item.tableName === "Location")).toBe(true);
    } finally {
      a.close();
      b.close();
    }
  });

  it("retains the added mark and keeps each candidate range linked to its original source mark", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("mark-and-ranges-added.jwlibrary");
    try {
      const result = simpleMerge(a.snapshot, b.snapshot);
      const addedMark = result.records.find((record) => record.tableName === "UserMark"
        && record.selected?.row.UserMarkGuid === "00000000-0000-4000-8000-000000001002");
      const ranges = result.records.filter((record) => record.tableName === "BlockRange");
      const addedRanges = ranges.flatMap((record) => [
        ...(record.selected ? [record.selected] : []),
        ...record.retainedAlternatives,
      ]).filter((candidate) => candidate.row.UserMarkId === 2);

      expect(addedMark).toMatchObject({ action: "keep-one", selected: { source: "B" } });
      expect(addedRanges).toHaveLength(3);
      expect(addedRanges.every((candidate) => candidate.source === "B"
        && candidate.row.UserMarkId === 2
        && b.snapshot.tables.UserMark?.rows.some((mark) => mark.UserMarkId === candidate.row.UserMarkId
          && mark.UserMarkGuid === "00000000-0000-4000-8000-000000001002"))).toBe(true);
      expect(addedRanges.every((candidate) => candidate.source === "B")).toBe(true);
    } finally {
      a.close();
      b.close();
    }
  });

  it("retains both tag-map alternatives when the same candidate mapping has conflicting positions", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("base.jwlibrary");
    try {
      const snapshotB = replaceTableRow(b.snapshot, "TagMap", 0, { Position: 1 });
      const result = simpleMerge(a.snapshot, snapshotB);
      const tagMap = result.records.find((record) => record.tableName === "TagMap");

      expect(tagMap).toMatchObject({
        action: "needs-review",
        selected: null,
        retainedAlternatives: [
          { source: "A", row: { Position: 0 } },
          { source: "B", row: { Position: 1 } },
        ],
      });
      expect(result.report.unresolved.some((item) => item.tableName === "TagMap")).toBe(true);
      expect(result.report.informationLoss.some((item) => item.tableName === "TagMap")).toBe(false);
    } finally {
      a.close();
      b.close();
    }
  });

  it("deduplicates a unique tag only when its natural key and every content field match", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("base.jwlibrary");
    try {
      const result = simpleMerge(a.snapshot, b.snapshot);
      const tag = result.records.find((record) => record.tableName === "Tag");

      expect(tag).toMatchObject({
        comparisonStatus: "equal",
        action: "keep-one",
        selected: { source: "A", row: { Type: 1, Name: "Synthetic tag" } },
        retainedAlternatives: [],
      });
      expect(result.report.unresolved.some((item) => item.tableName === "Tag")).toBe(false);
    } finally {
      a.close();
      b.close();
    }
  });

  it("withholds every duplicate stable identity row instead of picking one", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("base.jwlibrary");
    try {
      const noteTable = a.snapshot.tables.Note!;
      const duplicate = { ...noteTable.rows[0]!, NoteId: 2, Title: "Duplicate synthetic row" };
      const snapshotA: UserDataSnapshot = {
        ...a.snapshot,
        tables: {
          ...a.snapshot.tables,
          Note: { ...noteTable, rows: [...noteTable.rows, duplicate], rowCount: noteTable.rowCount + 1 },
        },
      };
      const result = simpleMerge(snapshotA, b.snapshot);
      const notes = result.records.filter((record) => record.tableName === "Note");

      expect(notes).toHaveLength(3);
      expect(notes.every((record) => record.selected === null && record.action === "needs-review"
        && record.retainedAlternatives.length === 1)).toBe(true);
      expect(result.report.unresolved.filter((item) => item.tableName === "Note")).toHaveLength(3);
      expect(result.status).toBe("needs-review");
    } finally {
      a.close();
      b.close();
    }
  });

  it("retains a malformed relationship row as an unresolved alternative instead of dropping it", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("base.jwlibrary");
    try {
      const snapshotB = replaceTableRow(b.snapshot, "Note", 0, { LocationId: 999 });
      const result = simpleMerge(a.snapshot, snapshotB);
      const note = result.records.find((record) => record.tableName === "Note");

      expect(note).toMatchObject({
        action: "keep-both-pending-review",
        selected: null,
        retainedAlternatives: [
          { source: "A", row: { LocationId: 1 } },
          { source: "B", row: { LocationId: 999 } },
        ],
      });
      expect(result.report.unresolved.some((item) => item.tableName === "Note"
        && item.reason.length > 0 && item.sourceA?.row.LocationId === 1
        && item.sourceB?.row.LocationId === 999)).toBe(true);
      expect(result.status).toBe("needs-review");
    } finally {
      a.close();
      b.close();
    }
  });
});
