import { readFile } from "node:fs/promises";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { describe, expect, it } from "vitest";
import { prepareAdvancedMerge, prepareSimpleMerge } from "../../../src/tools/jw-library-merger/merge/prepareSimpleMerge";

const fixtureUrl = (name: string) => new URL(`../../fixtures/jw-library/${name}`, import.meta.url);
const sqliteWasm = new URL("../../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url);
const SQLPromise = readFile(sqliteWasm).then((wasmBinary) =>
  initSqlJs({ wasmBinary: new Uint8Array(wasmBinary) }),
);
const sqliteLoader = (): Promise<SqlJsStatic> => SQLPromise;

async function fixtureFile(name: string): Promise<File> {
  const bytes = await readFile(fixtureUrl(name));
  return new File([new Uint8Array(bytes)], name);
}

describe("prepareSimpleMerge", () => {
  it("validates two synthetic archives and returns comparison and Simple mode results", async () => {
    const fileA = await fixtureFile("base.jwlibrary");
    const fileB = await fixtureFile("new-note.jwlibrary");

    const result = await prepareSimpleMerge(fileA, fileB, sqliteLoader);

    expect(result.sources.map((source) => source.fileName)).toEqual(["base.jwlibrary", "new-note.jwlibrary"]);
    expect(result.sources.map((source) => source.schemaVersion)).toEqual([16, 16]);
    expect(result.differenceReport.summary.onlyInB).toBeGreaterThan(0);
    expect(result.mergePlan.records.some((record) => record.tableName === "Note"
      && record.selected?.row.Title === "Added synthetic note")).toBe(true);
  });

  it("processes two approximately 3,000 kB synthetic archives and retains their shared large entry", async () => {
    const [bytesA, bytesB] = await Promise.all([
      readFile(fixtureUrl("large-merge-a.jwlibrary")),
      readFile(fixtureUrl("large-merge-b.jwlibrary")),
    ]);
    expect(bytesA.byteLength).toBeGreaterThan(2_900_000);
    expect(bytesA.byteLength).toBeLessThan(3_100_000);
    expect(bytesB.byteLength).toBeGreaterThan(2_900_000);
    expect(bytesB.byteLength).toBeLessThan(3_100_000);
    const [fileA, fileB] = await Promise.all([
      fixtureFile("large-merge-a.jwlibrary"),
      fixtureFile("large-merge-b.jwlibrary"),
    ]);
    const result = await prepareSimpleMerge(fileA, fileB, sqliteLoader);

    expect(result.sources.map((source) => source.schemaVersion)).toEqual([16, 16]);
    expect(result.sources.map((source) => source.archive.entryNames)).toEqual([
      expect.arrayContaining(["synthetic-load.bin"]),
      expect.arrayContaining(["synthetic-load.bin"]),
    ]);
    const [payloadA, payloadB] = await Promise.all(result.sources.map(async (source) =>
      source.archive.archive.file("synthetic-load.bin")?.async("uint8array")));
    expect(payloadA?.byteLength).toBe(2_990_000);
    expect(payloadB).toEqual(payloadA);
    expect(result.locationResolution.proposals).toHaveLength(1);
    expect(result.mergePlan.status).toBe("needs-review");
  });

  it("returns source-specific validation failures and does not attempt a merge", async () => {
    const fileA = await fixtureFile("base.jwlibrary");
    const fileB = await fixtureFile("missing-manifest.jwlibrary");

    await expect(prepareSimpleMerge(fileA, fileB, sqliteLoader)).rejects.toMatchObject({
      checks: [
        { source: "A", valid: true, schemaVersion: 16, error: null },
        { source: "B", valid: false, schemaVersion: null, error: expect.stringContaining("manifest.json") },
      ],
    });
  });
});

describe("prepareAdvancedMerge", () => {
  it("uses an optional base for comparison while keeping A and B as the only merge sources", async () => {
    const base = await fixtureFile("base.jwlibrary");
    const fileA = await fixtureFile("modified-note-newer.jwlibrary");
    const fileB = await fixtureFile("base.jwlibrary");

    const result = await prepareAdvancedMerge(fileA, fileB, base, sqliteLoader);

    expect(result.baseSource?.fileName).toBe("base.jwlibrary");
    expect(result.sources.map((source) => source.fileName)).toEqual([
      "modified-note-newer.jwlibrary",
      "base.jwlibrary",
    ]);
    expect(result.comparison.baseFileName).toBe("base.jwlibrary");
    expect(result.comparison.records.find((record) => record.tableName === "Note")?.outcome)
      .toBe("changed-in-a");
  });

  it("supports two-way advanced comparison when no base file is selected", async () => {
    const fileA = await fixtureFile("conflict-source-a.jwlibrary");
    const fileB = await fixtureFile("conflict-source-b.jwlibrary");

    const result = await prepareAdvancedMerge(fileA, fileB, null, sqliteLoader);

    expect(result.baseSource).toBeNull();
    expect(result.comparison.baseFileName).toBeNull();
    expect(result.comparison.records.find((record) => record.tableName === "Note")?.conflictStatus)
      .toBe("possible");
  });

  it("reports an invalid optional base separately from sources A and B", async () => {
    const base = await fixtureFile("missing-manifest.jwlibrary");
    const fileA = await fixtureFile("base.jwlibrary");
    const fileB = await fixtureFile("base.jwlibrary");

    await expect(prepareAdvancedMerge(fileA, fileB, base, sqliteLoader)).rejects.toMatchObject({
      checks: [
        { source: "basis", valid: false, error: expect.stringContaining("manifest.json") },
        { source: "A", valid: true },
        { source: "B", valid: true },
      ],
    });
  });
});
