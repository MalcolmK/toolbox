import { readFile } from "node:fs/promises";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { readJwLibrary } from "../../../src/tools/jw-library-merger/archive/readJwLibrary";
import { buildMergedDatabase, MergeDatabaseBuildError } from "../../../src/tools/jw-library-merger/database/buildMergedDatabase";
import { readUserData } from "../../../src/tools/jw-library-merger/database/readUserData";
import { validateUserData } from "../../../src/tools/jw-library-merger/database/validateUserData";
import { simpleMerge } from "../../../src/tools/jw-library-merger/merge/simpleMerge";
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
      LocationId: ids.location, BookNumber: 1, ChapterNumber: 1, DocumentId: 900001,
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
          return { ...record, action: "keep-one" as const, selected, retainedAlternatives: [] };
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
});
