import { readFile } from "node:fs/promises";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { describe, expect, it } from "vitest";
import { prepareSimpleMerge } from "../../../src/tools/jw-library-merger/merge/prepareSimpleMerge";

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
