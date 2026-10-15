import { readFile } from "node:fs/promises";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { readJwLibrary } from "../../../src/tools/jw-library-merger/archive/readJwLibrary";
import { readUserData } from "../../../src/tools/jw-library-merger/database/readUserData";
import { validateUserData } from "../../../src/tools/jw-library-merger/database/validateUserData";
import { compareLibraries } from "../../../src/tools/jw-library-merger/compare/compareLibraries";
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

describe("compareLibraries", () => {
  it("reports equal stable records without choosing merge winners", async () => {
    const a = await readSnapshot("identical-a.jwlibrary");
    const b = await readSnapshot("identical-b.jwlibrary");
    try {
      const comparison = compareLibraries(a.snapshot, b.snapshot);
      const note = comparison.records.find((record) => record.tableName === "Note");

      expect(note?.status).toBe("uncertain-linked");
      expect(note?.fieldDifferences).toEqual([]);
      expect(note?.relationshipDifferences).toEqual([
        expect.objectContaining({ field: "LocationId", status: "uncertain", targetTable: "Location" }),
      ]);
      expect(comparison.records.find((record) => record.tableName === "UserMark")?.status)
        .toBe("uncertain-linked");
      expect(comparison.summary.changedRecordCount).toBe(0);
      expect(comparison.sourceA.timestamps.notes[0]?.lastModified.sourceText)
        .toBe("2026-10-10T10:00:00Z");
    } finally {
      a.close();
      b.close();
    }
  });

  it("uses confirmed locations to match dependent rows across different local IDs", async () => {
    const a = await readSnapshot("identical-a.jwlibrary");
    const b = await readSnapshot("identical-b.jwlibrary");
    try {
      const context = createLocationResolutionContext("logical-identity", "different-local-ids",
        a.snapshot, b.snapshot);
      expect(context.proposals).toHaveLength(1);
      const result = confirmLocationProposal(context, context.proposals[0]!.id, "logical-identity", 0,
        a.snapshot, b.snapshot, "A");
      if (!result.ok) throw new Error(result.reason);
      const comparison = compareLibraries(a.snapshot, b.snapshot, result.context);
      for (const tableName of ["Note", "UserMark", "BlockRange", "Bookmark", "InputField", "TagMap"]) {
        expect(comparison.records.find((record) => record.tableName === tableName)?.status)
          .toBe("equal");
      }
      expect(comparison.records.find((record) => record.tableName === "Note")?.relationshipDifferences)
        .toEqual([]);
    } finally {
      a.close();
      b.close();
    }
  });

  it("identifies a changed note and preserves both original timestamp and text values", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("modified-note-newer.jwlibrary");
    try {
      const comparison = compareLibraries(a.snapshot, b.snapshot);
      const note = comparison.records.find((record) => record.tableName === "Note");

      expect(note?.status).toBe("possible-conflict");
      expect(note?.fieldDifferences).toEqual(expect.arrayContaining([
        expect.objectContaining({
          field: "Content",
          valueA: expect.stringContaining("Base text"),
          valueB: expect.stringContaining("Updated text"),
        }),
        expect.objectContaining({
          field: "LastModified",
          valueA: "2026-10-10T10:00:00Z",
          valueB: "2026-10-11T12:00:00Z",
        }),
      ]));
      expect(comparison.sourceB.timestamps.notes[0]?.lastModified.utc)
        .toBe("2026-10-11T12:00:00.000Z");
    } finally {
      a.close();
      b.close();
    }
  });

  it("reports one-sided stable notes and candidate-linked additions separately", async () => {
    const base = await readSnapshot("base.jwlibrary");
    const notes = await readSnapshot("new-note.jwlibrary");
    const marks = await readSnapshot("mark-and-ranges-added.jwlibrary");
    try {
      const noteComparison = compareLibraries(base.snapshot, notes.snapshot);
      const addedNote = noteComparison.records.find((record) =>
        record.tableName === "Note" && record.sourceB?.row.Title === "Added synthetic note",
      );
      expect(addedNote?.status).toBe("only-in-b");
      expect(addedNote?.absenceInterpretation).toBe("unknown");

      const markComparison = compareLibraries(base.snapshot, marks.snapshot);
      expect(markComparison.records.filter((record) => record.tableName === "UserMark"))
        .toEqual(expect.arrayContaining([
          expect.objectContaining({ status: "only-in-b" }),
        ]));
      expect(markComparison.records.filter((record) => record.tableName === "BlockRange"))
        .toHaveLength(4);
      expect(markComparison.records.filter((record) => record.tableName === "BlockRange"
        && record.status === "only-in-b")).toHaveLength(3);
      expect(markComparison.records.filter((record) => record.tableName === "InputField"
        && record.status === "uncertain-linked")).toHaveLength(3);
    } finally {
      base.close();
      notes.close();
      marks.close();
    }
  });

  it("does not compare source-local primary keys as record content", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("base.jwlibrary");
    try {
      const noteA = a.snapshot.tables.Note!.rows[0]!;
      const noteTableB = b.snapshot.tables.Note!;
      const snapshotB = {
        ...b.snapshot,
        tables: {
          ...b.snapshot.tables,
          Note: {
            ...noteTableB,
            rows: [{ ...noteTableB.rows[0]!, NoteId: 999 }],
          },
        },
      };
      const comparison = compareLibraries(a.snapshot, snapshotB);
      const note = comparison.records.find((record) => record.tableName === "Note");

      expect(note?.status).toBe("uncertain-linked");
      expect(note?.fieldDifferences).toEqual([]);
      expect(note?.sourceA?.row.NoteId).toBe(noteA.NoteId);
      expect(note?.sourceB?.row.NoteId).toBe(999);
    } finally {
      a.close();
      b.close();
    }
  });
});
