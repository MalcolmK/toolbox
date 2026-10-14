import { readFile } from "node:fs/promises";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { describe, expect, it } from "vitest";
import { buildSimplePocJwLibrary, selectSimplePocHashSource } from "../../../src/tools/jw-library-merger/archive/buildSimplePocJwLibrary";
import { normalizeTimestamp } from "../../../src/tools/jw-library-merger/compare/normalizeTimestamp";
import { prepareSimpleMerge } from "../../../src/tools/jw-library-merger/merge/prepareSimpleMerge";

const fixtureUrl = (name: string) => new URL(`../../fixtures/jw-library/${name}`, import.meta.url);
const sqliteWasm = new URL("../../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url);
const SQLPromise = readFile(sqliteWasm).then((wasmBinary) => initSqlJs({ wasmBinary: new Uint8Array(wasmBinary) }));
const sqliteLoader = (): Promise<SqlJsStatic> => SQLPromise;

async function fixtureFile(name: string): Promise<File> {
  const bytes = await readFile(fixtureUrl(name));
  return new File([new Uint8Array(bytes)], name);
}

describe("buildSimplePocJwLibrary", () => {
  it("builds a checked .jwlibrary POC from a resolved Simple plan", async () => {
    const preview = await prepareSimpleMerge(
      await fixtureFile("empty-a.jwlibrary"),
      await fixtureFile("empty-b.jwlibrary"),
      sqliteLoader,
    );
    expect(preview.mergePlan.status).toBe("ready");
    expect(selectSimplePocHashSource(preview)).toBe("A");

    const result = await buildSimplePocJwLibrary(preview, new Date("2026-10-14T12:00:00Z"));
    expect(result).toMatchObject({
      status: "ready",
      fileName: "JWLibrary-Merged-2026-10-14.jwlibrary",
      verification: "poc-unverified",
      hashSource: "A",
    });
    if (result.status === "ready") {
      const { readJwLibrary } = await import("../../../src/tools/jw-library-merger/archive/readJwLibrary");
      const output = await readJwLibrary(new File([result.bytes], result.fileName));
      expect(output.manifest.userDataBackup.hash).toBe(preview.sources[0].archive.manifest.userDataBackup.hash);
    }
  });

  it("selects B when its database timestamp is newer", async () => {
    const preview = await prepareSimpleMerge(
      await fixtureFile("empty-a.jwlibrary"),
      await fixtureFile("empty-b.jwlibrary"),
      sqliteLoader,
    );
    const newerPreview = {
      ...preview,
      mergePlan: {
        ...preview.mergePlan,
        report: {
          ...preview.mergePlan.report,
          sourceA: { ...preview.mergePlan.report.sourceA, databaseTimestamp: normalizeTimestamp("2026-10-10T10:00:00Z") },
          sourceB: { ...preview.mergePlan.report.sourceB, databaseTimestamp: normalizeTimestamp("2026-10-11T10:00:00Z") },
        },
      },
    };
    expect(selectSimplePocHashSource(newerPreview)).toBe("B");
  });

  it("does not create an archive for a plan with unresolved choices", async () => {
    const preview = await prepareSimpleMerge(
      await fixtureFile("conflict-source-a.jwlibrary"),
      await fixtureFile("conflict-source-b.jwlibrary"),
      sqliteLoader,
    );
    expect(preview.mergePlan.status).toBe("needs-review");
    await expect(buildSimplePocJwLibrary(preview)).rejects.toThrow(/mergekeuzes openstaan/i);
  });
});
