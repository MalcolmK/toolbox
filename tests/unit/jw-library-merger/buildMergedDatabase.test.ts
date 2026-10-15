import { readFile } from "node:fs/promises";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { readJwLibrary } from "../../../src/tools/jw-library-merger/archive/readJwLibrary";
import { buildMergedDatabase, MergeDatabaseBuildError } from "../../../src/tools/jw-library-merger/database/buildMergedDatabase";
import { readUserData } from "../../../src/tools/jw-library-merger/database/readUserData";
import { validateUserData } from "../../../src/tools/jw-library-merger/database/validateUserData";
import { simpleMerge } from "../../../src/tools/jw-library-merger/merge/simpleMerge";
import { simpleMergeReviewKey } from "../../../src/tools/jw-library-merger/merge/publicationConflicts";
import { confirmLocationProposal, createLocationResolutionContext } from "../../../src/tools/jw-library-merger/merge/locationResolution";
import type { UserDataRow, UserDataSnapshot } from "../../../src/tools/jw-library-merger/database/readUserData";

const fixtureUrl = (name: string) => new URL(`../../fixtures/jw-library/${name}`, import.meta.url);
const sqliteWasm = new URL("../../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url);
const SQLPromise = readFile(sqliteWasm).then((wasmBinary) => initSqlJs({ wasmBinary: new Uint8Array(wasmBinary) }));

async function open(name: string) {
  const bytes = await readFile(fixtureUrl(name));
  const archive = await readJwLibrary(new File([new Uint8Array(bytes)], name));
  const SQL = await SQLPromise;
  const validated = await validateUserData(archive, () => Promise.resolve(SQL));
  return { validated, snapshot: readUserData(validated) };
}

function withLinkedRecords(snapshot: UserDataSnapshot, ids: { location: number; mark: number; range: number; note: number }): UserDataSnapshot {
  const rows: Record<string, UserDataRow> = {
      Location: {
      LocationId: ids.location, BookNumber: 1, ChapterNumber: 1, DocumentId: null,
      Track: null, IssueTagNumber: 0, KeySymbol: "SYNTHETIC", MepsLanguage: 1, Type: 0,
      Title: null, Specialty: null, Edition: null,
    },
    UserMark: {
      UserMarkId: ids.mark, ColorIndex: 1, LocationId: ids.location, StyleIndex: 1,
      UserMarkGuid: "stable-test-mark-guid", Version: 1,
    },
    BlockRange: {
      BlockRangeId: ids.range, BlockType: 1, Identifier: 10, StartToken: 0, EndToken: 4, UserMarkId: ids.mark,
    },
    Note: {
      NoteId: ids.note, Guid: "stable-test-note-guid", UserMarkId: ids.mark, LocationId: ids.location,
      Title: "Test note", Content: "Body", LastModified: "2026-10-10T10:00:00Z",
      Created: "2026-10-01T09:00:00Z", BlockType: 0, BlockIdentifier: null,
    },
  } as const;
  const tables = { ...snapshot.tables };
  for (const [name, row] of Object.entries(rows)) {
    const table = tables[name]!;
    tables[name] = { ...table, rows: [row], rowCount: 1 };
  }
  return {
    ...snapshot,
    tables,
    recordCounts: { ...snapshot.recordCounts, Location: 1, UserMark: 1, BlockRange: 1, Note: 1 },
  };
}

function makeReady(plan: ReturnType<typeof simpleMerge>) {
  return {
    ...plan,
    status: "ready" as const,
    records: plan.records.map((record) => {
      if (record.action === "keep-one" && record.selected) return record;
      const selected = record.retainedAlternatives.find((candidate) => candidate.source === "A")
        ?? record.retainedAlternatives[0];
      if (!selected) throw new Error(`Test could not explicitly resolve ${record.tableName}.`);
      return { ...record, action: "keep-one" as const, selected,
        sourceAliases: [...(record.sourceAliases ?? []), ...record.retainedAlternatives.filter((candidate) => candidate !== selected)],
        retainedAlternatives: [] };
    }),
    report: { ...plan.report, unresolved: [] },
  };
}

describe("buildMergedDatabase", () => {
  it("builds a fresh SQLite result from a resolved plan and checks its integrity", async () => {
    const a = await open("empty-a.jwlibrary");
    const b = await open("empty-b.jwlibrary");
    try {
      const snapshotA = withLinkedRecords(a.snapshot, { location: 21, mark: 31, range: 41, note: 51 });
      const snapshotB = withLinkedRecords(b.snapshot, { location: 22, mark: 32, range: 42, note: 52 });
      const plan = simpleMerge(snapshotA, snapshotB);
      const resolvedPlan = {
        ...plan,
        status: "ready" as const,
        records: plan.records.map((record) => {
          if (record.action === "keep-one" && record.selected) return record;
          const selected = record.retainedAlternatives.find((candidate) => candidate.source === "A")
            ?? record.retainedAlternatives[0];
          if (!selected) throw new Error(`Test could not explicitly resolve ${record.tableName}.`);
          return { ...record, action: "keep-one" as const, selected,
            sourceAliases: [...(record.sourceAliases ?? []), ...record.retainedAlternatives.filter((candidate) => candidate !== selected)],
            retainedAlternatives: [] };
        }),
        report: { ...plan.report, unresolved: [] },
      };
      const built = await buildMergedDatabase(a.validated, snapshotA, b.validated, snapshotB, resolvedPlan,
        () => SQLPromise);
      expect(built.integrity).toBe("ok");
      expect(built.tableCounts.Note).toBe(1);
      expect(built.tableCounts.UserMark).toBe(1);
      expect(built.tableCounts.BlockRange).toBe(1);
      expect(built.outputIds.length).toBeGreaterThan(0);
      const SQL = await SQLPromise;
      const output = new SQL.Database(built.bytes);
      expect(output.exec("PRAGMA integrity_check")[0]?.values).toEqual([["ok"]]);
      expect(output.exec("PRAGMA foreign_key_check")[0]?.values).toBeUndefined();
      expect(output.exec("SELECT NoteId, Guid, Content, UserMarkId, LocationId FROM Note")[0]?.values).toEqual([[1, "stable-test-note-guid", "Body", 1, 1]]);
      expect(output.exec("SELECT BlockRangeId, UserMarkId FROM BlockRange")[0]?.values).toEqual([[1, 1]]);
      expect(output.exec("SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger'")[0]?.values[0]?.[0]).toBeGreaterThan(0);
      expect(a.validated.database.exec("SELECT COUNT(*) FROM Note")[0]?.values[0]?.[0]).toBe(0);
      output.close();
    } finally {
      a.validated.database.close();
      b.validated.database.close();
    }
  });

  it("blocks unresolved plans before producing database bytes", async () => {
    const a = await open("base.jwlibrary");
    const b = await open("modified-note-newer.jwlibrary");
    try {
      const plan = simpleMerge(a.snapshot, b.snapshot);
      expect(plan.status).toBe("needs-review");
      await expect(buildMergedDatabase(a.validated, a.snapshot, b.validated, b.snapshot, plan,
        () => SQLPromise)).rejects.toBeInstanceOf(MergeDatabaseBuildError);
    } finally {
      a.validated.database.close();
      b.validated.database.close();
    }
  });

  it("rejects a resolution context that changes while the database build is waiting to start", async () => {
    const a = await open("empty-a.jwlibrary");
    const b = await open("empty-b.jwlibrary");
    try {
      const plan = simpleMerge(a.snapshot, b.snapshot);
      let contextCurrent = true;
      const delayedLoader = () => new Promise<Awaited<typeof SQLPromise>>((resolve) => {
        setTimeout(() => resolve(SQLPromise), 25);
      });
      const build = buildMergedDatabase(a.validated, a.snapshot, b.validated, b.snapshot, plan,
        delayedLoader, undefined, () => contextCurrent);
      setTimeout(() => { contextCurrent = false; }, 1);
      await expect(build).rejects.toMatchObject({
        issues: [expect.objectContaining({ code: "unresolved-plan", message: expect.stringContaining("gewijzigd") })],
      });
    } finally {
      a.validated.database.close();
      b.validated.database.close();
    }
  });

  it("maps both confirmed source Location rows to the same output identity", async () => {
    const a = await open("empty-a.jwlibrary");
    const b = await open("empty-b.jwlibrary");
    try {
      const snapshotA = withLinkedRecords(a.snapshot, { location: 21, mark: 31, range: 41, note: 51 });
      const snapshotB = withLinkedRecords(b.snapshot, { location: 22, mark: 32, range: 42, note: 52 });
      const context = createLocationResolutionContext("build-session", "build-pair", snapshotA, snapshotB);
      const accepted = confirmLocationProposal(context, context.proposals[0]!.id, "build-session", 0,
        snapshotA, snapshotB, "A");
      if (!accepted.ok) throw new Error(accepted.reason);
      const pending = simpleMerge(snapshotA, snapshotB, new Map(), accepted.context);
      const resolved = {
        ...pending,
        status: "ready" as const,
        records: pending.records.map((record) => {
          if (record.action === "keep-one" && record.selected) return record;
          const selected = record.retainedAlternatives.find((candidate) => candidate.source === "A")
            ?? record.retainedAlternatives[0];
          if (!selected) throw new Error(`Test could not explicitly resolve ${record.tableName}.`);
          return { ...record, action: "keep-one" as const, selected,
            sourceAliases: [...(record.sourceAliases ?? []), ...record.retainedAlternatives.filter((candidate) => candidate !== selected)],
            retainedAlternatives: [] };
        }),
        report: { ...pending.report, unresolved: [] },
      };
      const built = await buildMergedDatabase(a.validated, snapshotA, b.validated, snapshotB, resolved,
        () => SQLPromise, accepted.context);
      const locations = built.outputIds.filter((mapping) => mapping.tableName === "Location");
      expect(locations).toEqual(expect.arrayContaining([
        expect.objectContaining({ source: "A", outputKey: "number:1" }),
        expect.objectContaining({ source: "B", outputKey: "number:1" }),
      ]));
      expect(built.integrity).toBe("ok");
    } finally {
      a.validated.database.close();
      b.validated.database.close();
    }
  });

  it("keeps the A note choice and a B-only note while remapping B's different local LocationId", async () => {
    const a = await open("base.jwlibrary");
    const b = await open("new-note.jwlibrary");
    try {
      const noteTableB = b.snapshot.tables.Note!;
      const markTableB = b.snapshot.tables.UserMark!;
      const rangeTableB = b.snapshot.tables.BlockRange!;
      const snapshotA: UserDataSnapshot = { ...a.snapshot, tables: { ...a.snapshot.tables,
        Note: { ...a.snapshot.tables.Note!, rows: a.snapshot.tables.Note!.rows.map((row, index) => index === 0
          ? { ...row, UserMarkId: 1 } : row) } } };
      const snapshotB: UserDataSnapshot = { ...b.snapshot, tables: { ...b.snapshot.tables,
        Note: { ...noteTableB, rows: noteTableB.rows.map((row, index) => index === 0
          ? { ...row, UserMarkId: 22, Content: "Conflicting edit from B", LastModified: "2026-10-11T08:00:00Z" }
          : row) },
        UserMark: { ...markTableB, rows: markTableB.rows.map((row) => ({ ...row, UserMarkId: 22 })) },
        BlockRange: { ...rangeTableB, rows: rangeTableB.rows.map((row) => ({ ...row, UserMarkId: 22 })) },
      } };
      const context = createLocationResolutionContext("additions", "different-location-ids", snapshotA, snapshotB);
      const confirmation = confirmLocationProposal(context, context.proposals[0]!.id, "additions", 0,
        snapshotA, snapshotB, "A");
      if (!confirmation.ok) throw new Error(confirmation.reason);
      const pending = simpleMerge(snapshotA, snapshotB, new Map(), confirmation.context);
      const note = pending.records.find((record) => record.tableName === "Note"
        && record.retainedAlternatives.some((candidate) => candidate.row.Title === "Synthetic note"));
      expect(note?.action).toBe("needs-review");
      const plan = simpleMerge(snapshotA, snapshotB,
        new Map([[simpleMergeReviewKey("Note", note!.identityKey!), "A"]]), confirmation.context);
      expect(plan.status).toBe("ready");
      const built = await buildMergedDatabase(a.validated, snapshotA, b.validated, snapshotB, plan,
        () => SQLPromise, confirmation.context);
      const SQL = await SQLPromise;
      const output = new SQL.Database(built.bytes);
      try {
        const notes = output.exec("SELECT Guid, Title, Content, LocationId, UserMarkId FROM Note ORDER BY Guid")[0]?.values;
        expect(notes).toEqual([
          ["00000000-0000-4000-8000-000000000001", "Synthetic note", expect.stringContaining("Base text"), 1, 1],
          ["00000000-0000-4000-8000-000000000002", "Added synthetic note", "This note exists only in the added-note fixture.", 1, null],
        ]);
        expect(output.exec("SELECT UserMarkId, UserMarkGuid FROM UserMark")[0]?.values)
          .toEqual([[1, "00000000-0000-4000-8000-000000001001"]]);
        expect(output.exec("PRAGMA foreign_key_check")[0]?.values).toBeUndefined();
      } finally {
        output.close();
      }
    } finally {
      a.validated.database.close();
      b.validated.database.close();
    }
  });

  it("blocks a source row that has no declared plan destination", async () => {
    const a = await open("empty-a.jwlibrary");
    const b = await open("empty-b.jwlibrary");
    try {
      const snapshotA = withLinkedRecords(a.snapshot, { location: 21, mark: 31, range: 41, note: 51 });
      const snapshotB = withLinkedRecords(b.snapshot, { location: 22, mark: 32, range: 42, note: 52 });
      const ready = makeReady(simpleMerge(snapshotA, snapshotB));
      const uncovered = { ...ready, records: ready.records.filter((record) => record.tableName !== "Note") };
      await expect(buildMergedDatabase(a.validated, snapshotA, b.validated, snapshotB, uncovered, () => SQLPromise))
        .rejects.toMatchObject({ issues: [expect.objectContaining({ code: "unknown-table", tableName: "Note" })] });
    } finally {
      a.validated.database.close();
      b.validated.database.close();
    }
  });

  it("rejects one source alias assigned to two output rows", async () => {
    const a = await open("empty-a.jwlibrary");
    const b = await open("empty-b.jwlibrary");
    try {
      const snapshotA = withLinkedRecords(a.snapshot, { location: 21, mark: 31, range: 41, note: 51 });
      const snapshotB = withLinkedRecords(b.snapshot, { location: 22, mark: 32, range: 42, note: 52 });
      const ready = makeReady(simpleMerge(snapshotA, snapshotB));
      const note = ready.records.find((record) => record.tableName === "Note")!;
      const duplicate = { ...note, identityKey: `${note.identityKey}:duplicate` };
      const conflicted = { ...ready, records: [...ready.records, duplicate] };
      await expect(buildMergedDatabase(a.validated, snapshotA, b.validated, snapshotB, conflicted, () => SQLPromise))
        .rejects.toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ code: "identity-collision", tableName: "Note" })]) });
    } finally {
      a.validated.database.close();
      b.validated.database.close();
    }
  });

  it("rejects an alias whose parent row has disappeared from its source snapshot", async () => {
    const a = await open("empty-a.jwlibrary");
    const b = await open("empty-b.jwlibrary");
    try {
      const snapshotA = withLinkedRecords(a.snapshot, { location: 21, mark: 31, range: 41, note: 51 });
      const snapshotB = withLinkedRecords(b.snapshot, { location: 22, mark: 32, range: 42, note: 52 });
      const ready = makeReady(simpleMerge(snapshotA, snapshotB));
      const missingParentB: UserDataSnapshot = { ...snapshotB, tables: { ...snapshotB.tables,
        UserMark: { ...snapshotB.tables.UserMark!, rows: [], rowCount: 0 } },
        recordCounts: { ...snapshotB.recordCounts, UserMark: 0 } };
      await expect(buildMergedDatabase(a.validated, snapshotA, b.validated, missingParentB, ready, () => SQLPromise))
        .rejects.toMatchObject({ issues: [expect.objectContaining({ code: "unknown-table", tableName: "UserMark" })] });
    } finally {
      a.validated.database.close();
      b.validated.database.close();
    }
  });

  it("rolls back a distinct output ID that collides with a schema unique key", async () => {
    const a = await open("empty-a.jwlibrary");
    const b = await open("empty-b.jwlibrary");
    try {
      const baseA = withLinkedRecords(a.snapshot, { location: 21, mark: 31, range: 41, note: 51 });
      const snapshotB = withLinkedRecords(b.snapshot, { location: 22, mark: 32, range: 42, note: 52 });
      const originalPlan = makeReady(simpleMerge(baseA, snapshotB));
      const noteRecord = originalPlan.records.find((record) => record.tableName === "Note")!;
      const clonedRow = { ...noteRecord.selected!.row, NoteId: 53 };
      const selected = { ...noteRecord.selected!, row: clonedRow };
      const collidingPlan = { ...originalPlan, records: [...originalPlan.records, {
        ...noteRecord, identityKey: "synthetic-independent-row-with-duplicate-guid", selected,
        sourceAliases: [], retainedAlternatives: [],
      }] };
      const snapshotA: UserDataSnapshot = { ...baseA, tables: { ...baseA.tables,
        Note: { ...baseA.tables.Note!, rows: [...baseA.tables.Note!.rows, clonedRow], rowCount: 2 } },
        recordCounts: { ...baseA.recordCounts, Note: 2 } };
      await expect(buildMergedDatabase(a.validated, snapshotA, b.validated, snapshotB, collidingPlan, () => SQLPromise))
        .rejects.toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ code: "sqlite-write-failed" })]) });
      expect(a.validated.database.exec("SELECT COUNT(*) FROM Note")[0]?.values[0]?.[0]).toBe(0);
      expect(b.validated.database.exec("SELECT COUNT(*) FROM Note")[0]?.values[0]?.[0]).toBe(0);
    } finally {
      a.validated.database.close();
      b.validated.database.close();
    }
  });

  it("uses the selected record's explicit field source for a foreign key", async () => {
    const a = await open("empty-a.jwlibrary");
    const b = await open("empty-b.jwlibrary");
    try {
      const snapshotA = withLinkedRecords(a.snapshot, { location: 21, mark: 31, range: 41, note: 51 });
      const linkedB = withLinkedRecords(b.snapshot, { location: 22, mark: 32, range: 42, note: 52 });
      const snapshotB: UserDataSnapshot = { ...linkedB, tables: { ...linkedB.tables,
        UserMark: { ...linkedB.tables.UserMark!, rows: linkedB.tables.UserMark!.rows.map((row) => ({ ...row, UserMarkGuid: "unique-b-mark-guid" })) } } };
      const ready = makeReady(simpleMerge(snapshotA, snapshotB));
      const records = ready.records.map((record) => record.tableName === "Note" && record.selected
        ? { ...record, selected: { ...record.selected, source: "A" as const,
          row: { ...snapshotA.tables.Note!.rows[0], UserMarkId: 32 }, fieldSources: { UserMarkId: "B" as const } },
          sourceAliases: [{ ...record.selected, source: "B" as const, row: snapshotB.tables.Note!.rows[0]! }] }
        : record);
      const built = await buildMergedDatabase(a.validated, snapshotA, b.validated, snapshotB, { ...ready, records }, () => SQLPromise);
      const SQL = await SQLPromise;
      const output = new SQL.Database(built.bytes);
      try {
        expect(output.exec("SELECT UserMark.UserMarkGuid FROM Note JOIN UserMark ON Note.UserMarkId = UserMark.UserMarkId")[0]?.values)
          .toEqual([["unique-b-mark-guid"]]);
      } finally { output.close(); }
    } finally {
      a.validated.database.close();
      b.validated.database.close();
    }
  });
});
