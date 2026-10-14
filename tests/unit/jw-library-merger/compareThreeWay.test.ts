import { readFile } from "node:fs/promises";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { readJwLibrary } from "../../../src/tools/jw-library-merger/archive/readJwLibrary";
import { readUserData } from "../../../src/tools/jw-library-merger/database/readUserData";
import { validateUserData } from "../../../src/tools/jw-library-merger/database/validateUserData";
import { compareThreeWay } from "../../../src/tools/jw-library-merger/compare/compareThreeWay";

const fixtureUrl = (name: string) => new URL(`../../fixtures/jw-library/${name}`, import.meta.url);
const sqliteWasm = new URL("../../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url);
const SQLPromise = readFile(sqliteWasm).then((wasmBinary) =>
  initSqlJs({ wasmBinary: new Uint8Array(wasmBinary) }),
);

async function readSnapshot(name: string) {
  const bytes = await readFile(fixtureUrl(name));
  const archive = await readJwLibrary(new File([new Uint8Array(bytes)], name));
  const SQL = await SQLPromise;
  const validated = await validateUserData(archive, () => Promise.resolve(SQL));
  return { snapshot: readUserData(validated), close: () => validated.database.close() };
}

describe("compareThreeWay", () => {
  it("detects a change made only in A relative to the base", async () => {
    const base = await readSnapshot("base.jwlibrary");
    const a = await readSnapshot("modified-note-newer.jwlibrary");
    const b = await readSnapshot("base.jwlibrary");
    try {
      const result = compareThreeWay(a.snapshot, b.snapshot, base.snapshot);
      const note = result.records.find((record) => record.tableName === "Note");
      expect(note?.outcome).toBe("changed-in-a");
      expect(note?.proposedAction).toBe("take-a");
      expect(note?.conflictStatus).toBe("none");
      expect(note?.baseVersion?.fileName).toBe("base.jwlibrary");
      expect(result.baseFileName).toBe("base.jwlibrary");
      expect(result.sourceAFileName).toBe("modified-note-newer.jwlibrary");
      expect(result.sourceBFileName).toBe("base.jwlibrary");
    } finally {
      base.close();
      a.close();
      b.close();
    }
  });

  it("recognizes the same content change on both sides as one shared change", async () => {
    const base = await readSnapshot("base.jwlibrary");
    const a = await readSnapshot("modified-note-newer.jwlibrary");
    const b = await readSnapshot("modified-note-newer.jwlibrary");
    try {
      const result = compareThreeWay(a.snapshot, b.snapshot, base.snapshot);
      const note = result.records.find((record) => record.tableName === "Note");
      expect(note?.outcome).toBe("same-change");
      expect(note?.conflictStatus).toBe("none");
      expect(note?.proposedAction).toBe("combine-non-overlapping");
    } finally {
      base.close();
      a.close();
      b.close();
    }
  });

  it("confirms a conflict only when both sides changed the same field differently", async () => {
    const base = await readSnapshot("base.jwlibrary");
    const a = await readSnapshot("conflict-source-a.jwlibrary");
    const b = await readSnapshot("conflict-source-b.jwlibrary");
    try {
      const result = compareThreeWay(a.snapshot, b.snapshot, base.snapshot);
      const note = result.records.find((record) => record.tableName === "Note");
      expect(note?.outcome).toBe("conflict");
      expect(note?.conflictStatus).toBe("confirmed");
      expect(note?.overlappingChanges).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "Content", granularity: "field" }),
      ]));
      expect(note?.timestamps.some((timestamp) => timestamp.source === "basis")).toBe(true);
    } finally {
      base.close();
      a.close();
      b.close();
    }
  });

  it("keeps divergent two-way edits possible rather than confirmed without a base", async () => {
    const a = await readSnapshot("conflict-source-a.jwlibrary");
    const b = await readSnapshot("conflict-source-b.jwlibrary");
    try {
      const result = compareThreeWay(a.snapshot, b.snapshot, null);
      const note = result.records.find((record) => record.tableName === "Note");
      expect(note?.outcome).toBe("conflict");
      expect(note?.conflictStatus).toBe("possible");
      expect(note?.baseVersion).toBeNull();
      expect(note?.reason).toContain("Zonder basisversie");
    } finally {
      a.close();
      b.close();
    }
  });

  it("keeps candidate-linked records visible as uncertain instead of treating them as safe matches", async () => {
    const base = await readSnapshot("base.jwlibrary");
    const a = await readSnapshot("mark-and-ranges-added.jwlibrary");
    const b = await readSnapshot("base.jwlibrary");
    try {
      const result = compareThreeWay(a.snapshot, b.snapshot, base.snapshot);
      const ranges = result.records.filter((record) => record.tableName === "BlockRange");
      expect(ranges.length).toBeGreaterThan(0);
      expect(ranges.every((record) => record.outcome === "uncertain"
        && record.conflictStatus === "uncertain")).toBe(true);
    } finally {
      base.close();
      a.close();
      b.close();
    }
  });
});
