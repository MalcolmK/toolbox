import { readFile } from "node:fs/promises";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { describe, expect, it } from "vitest";
import { buildAdvancedPocJwLibrary, selectAdvancedPocHashSource } from "../../../src/tools/jw-library-merger/archive/buildAdvancedPocJwLibrary";
import { readJwLibrary } from "../../../src/tools/jw-library-merger/archive/readJwLibrary";
import { buildAdvancedMergePlan } from "../../../src/tools/jw-library-merger/merge/advancedMerge";
import { prepareAdvancedMerge } from "../../../src/tools/jw-library-merger/merge/prepareSimpleMerge";

const fixtureUrl = (name: string) => new URL(`../../fixtures/jw-library/${name}`, import.meta.url);
const sqliteWasm = new URL("../../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url);
const SQLPromise = readFile(sqliteWasm).then((wasmBinary) => initSqlJs({ wasmBinary: new Uint8Array(wasmBinary) }));
const sqliteLoader = (): Promise<SqlJsStatic> => SQLPromise;

async function fixtureFile(name: string): Promise<File> {
  return new File([new Uint8Array(await readFile(fixtureUrl(name)))], name);
}

describe("buildAdvancedPocJwLibrary", () => {
  it("builds a checked Advanced-mode POC archive and retains hash provenance", async () => {
    const preview = await prepareAdvancedMerge(
      await fixtureFile("empty-a.jwlibrary"),
      await fixtureFile("empty-b.jwlibrary"),
      null,
      sqliteLoader,
    );
    const plan = buildAdvancedMergePlan(preview, { choices: {}, noteTextStates: {}, reviewConfirmed: true });
    expect(plan.status, JSON.stringify(plan.report.unresolved)).toBe("ready");

    const result = await buildAdvancedPocJwLibrary(preview, plan, new Date("2026-10-14T12:00:00Z"));
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
      expect(output.databaseName).toBe(preview.sources[0].archive.databaseName);
    }
  });

  it("selects the newer source database timestamp for the provisional hash", async () => {
    const preview = await prepareAdvancedMerge(
      await fixtureFile("empty-a.jwlibrary"),
      await fixtureFile("empty-b.jwlibrary"),
      null,
      sqliteLoader,
    );
    const newerPreview = {
      ...preview,
      sources: [
        { ...preview.sources[0], snapshot: { ...preview.sources[0].snapshot, modificationTimes: { ...preview.sources[0].snapshot.modificationTimes, databaseLastModified: "2026-10-10T10:00:00Z" } } },
        { ...preview.sources[1], snapshot: { ...preview.sources[1].snapshot, modificationTimes: { ...preview.sources[1].snapshot.modificationTimes, databaseLastModified: "2026-10-11T10:00:00Z" } } },
      ] as const,
    };
    expect(selectAdvancedPocHashSource(newerPreview)).toBe("B");
  });

  it("keeps the comparison base out of both the output database and POC hash selection", async () => {
    const preview = await prepareAdvancedMerge(
      await fixtureFile("empty-a.jwlibrary"),
      await fixtureFile("empty-b.jwlibrary"),
      await fixtureFile("base.jwlibrary"),
      sqliteLoader,
    );
    expect(preview.baseSource?.fileName).toBe("base.jwlibrary");
    const [sourceA, sourceB] = preview.sources;
    const previewWithDistinctHashes = {
      ...preview,
      sources: [
        { ...sourceA, archive: { ...sourceA.archive, manifest: { ...sourceA.archive.manifest, userDataBackup: { ...sourceA.archive.manifest.userDataBackup, hash: "hash-from-A" } } } },
        { ...sourceB, archive: { ...sourceB.archive, manifest: { ...sourceB.archive.manifest, userDataBackup: { ...sourceB.archive.manifest.userDataBackup, hash: "hash-from-B" } } } },
      ] as const,
    };
    const plan = buildAdvancedMergePlan(previewWithDistinctHashes, { choices: {}, noteTextStates: {}, reviewConfirmed: true });
    expect(plan.status, JSON.stringify(plan.report.unresolved)).toBe("ready");

    const result = await buildAdvancedPocJwLibrary(previewWithDistinctHashes, plan, new Date("2026-10-14T12:00:00Z"));
    expect(result).toMatchObject({ status: "ready", verification: "poc-unverified", hashSource: "A" });
    if (result.status !== "ready") return;
    const output = await readJwLibrary(new File([result.bytes], result.fileName));
    expect(output.manifest.userDataBackup.hash).toBe("hash-from-A");
    const SQL = await SQLPromise;
    const outputDatabase = new SQL.Database(output.databaseBytes);
    try {
      expect(outputDatabase.exec("SELECT COUNT(*) AS count FROM Note")[0]?.values[0]?.[0]).toBe(0);
    } finally {
      outputDatabase.close();
    }
  });

  it("blocks non-empty Advanced sources when their rows cannot be safely identified", async () => {
    const preview = await prepareAdvancedMerge(
      await fixtureFile("identical-a.jwlibrary"),
      await fixtureFile("identical-b.jwlibrary"),
      null,
      sqliteLoader,
    );
    const plan = buildAdvancedMergePlan(preview, { choices: {}, noteTextStates: {}, reviewConfirmed: true });
    expect(plan.status).toBe("needs-review");
    expect(plan.report.unresolved.length).toBeGreaterThan(0);
    await expect(buildAdvancedPocJwLibrary(preview, plan)).rejects.toThrow(/Advanced-keuzes openstaan/i);
  });

  it("refuses a plan that has not been confirmed", async () => {
    const preview = await prepareAdvancedMerge(
      await fixtureFile("empty-a.jwlibrary"),
      await fixtureFile("empty-b.jwlibrary"),
      null,
      sqliteLoader,
    );
    const plan = buildAdvancedMergePlan(preview, { choices: {}, noteTextStates: {}, reviewConfirmed: false });
    await expect(buildAdvancedPocJwLibrary(preview, plan)).rejects.toThrow(/Advanced-keuzes openstaan/i);
  });
});
