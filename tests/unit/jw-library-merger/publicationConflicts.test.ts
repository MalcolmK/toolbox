import { readFile } from "node:fs/promises";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { describe, expect, it } from "vitest";
import { getPublicationConflictGroups } from "../../../src/tools/jw-library-merger/merge/publicationConflicts";
import { prepareSimpleMerge } from "../../../src/tools/jw-library-merger/merge/prepareSimpleMerge";
import { simpleMerge } from "../../../src/tools/jw-library-merger/merge/simpleMerge";

const fixtureUrl = (name: string) => new URL(`../../fixtures/jw-library/${name}`, import.meta.url);
const sqliteWasm = new URL("../../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url);
const SQLPromise = readFile(sqliteWasm).then((wasmBinary) => initSqlJs({ wasmBinary: new Uint8Array(wasmBinary) }));
const sqliteLoader = (): Promise<SqlJsStatic> => SQLPromise;

async function fixtureFile(name: string): Promise<File> {
  const bytes = await readFile(fixtureUrl(name));
  return new File([new Uint8Array(bytes)], name);
}

describe("getPublicationConflictGroups", () => {
  it("groups all eligible conflicts under their matching publication and keeps uncertain identities unresolved", async () => {
    const preview = await prepareSimpleMerge(
      await fixtureFile("publication-conflicts-a.jwlibrary"),
      await fixtureFile("publication-conflicts-b.jwlibrary"),
      sqliteLoader,
    );

    const groups = getPublicationConflictGroups(preview);
    expect(groups.map((group) => group.records.length).sort()).toEqual([1, 2]);
    expect(groups.map((group) => group.label).sort()).toEqual(["Publication Alpha", "Publication Beta"]);

    const locationGroups = (await import("../../../src/tools/jw-library-merger/merge/locationProposalGroups"))
      .getLocationProposalGroups(preview);
    const alphaPlaces = locationGroups.find((group) => group.label.startsWith("SYNTHETIC · taal 1"));
    expect(locationGroups).toHaveLength(2);
    expect(alphaPlaces?.pairs).toHaveLength(2);
    expect(alphaPlaces?.hasTitleDifference).toBe(true);
    expect(locationGroups.some((group) => group.label.startsWith("SYNTHETIC-OTHER · taal 1"))).toBe(true);

    const samePublication = groups.find((group) => group.records.length === 2)!;
    const otherPublication = groups.find((group) => group.records.length === 1)!;
    expect(samePublication.differences.map((difference) => difference.label)).toEqual([
      "Aantekening: First publication note",
      "Aantekening: Second publication note",
    ]);

    const partialChoice = getPublicationConflictGroups(preview, new Map([[samePublication.recordKeys[0]!, "A" as const]]));
    expect(partialChoice.find((group) => group.key === samePublication.key)?.selectedSource).toBeNull();

    const choices = new Map<string, "A" | "B">();
    for (const recordKey of samePublication.recordKeys) choices.set(recordKey, "A");
    for (const recordKey of otherPublication.recordKeys) choices.set(recordKey, "B");

    const resolvedGroups = getPublicationConflictGroups(preview, choices);
    expect(resolvedGroups.find((group) => group.key === samePublication.key)?.selectedSource).toBe("A");
    expect(resolvedGroups.find((group) => group.key === otherPublication.key)?.selectedSource).toBe("B");

    const playlistUncertainty = preview.comparison.records.filter((record) => record.tableName === "PlaylistItem");
    expect(playlistUncertainty.length).toBeGreaterThan(0);
    expect(groups.flatMap((group) => group.records).some((record) => record.tableName === "PlaylistItem")).toBe(false);

    const planAfterPublicationChoices = simpleMerge(
      preview.sources[0].snapshot,
      preview.sources[1].snapshot,
      choices,
    );
    for (const [recordKey, source] of choices) {
      const selectedRecord = planAfterPublicationChoices.records.find((record) =>
        `${record.tableName}:${record.identityKey}` === recordKey,
      );
      expect(selectedRecord?.selected?.source).toBe(source);
    }
    expect(planAfterPublicationChoices.status).toBe("needs-review");
    expect(planAfterPublicationChoices.report.unresolved.some((record) => record.tableName === "PlaylistItem")).toBe(true);
  });
});
