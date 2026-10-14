import { readFile } from "node:fs/promises";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { describe, expect, it } from "vitest";
import { advancedDecisionKey, buildAdvancedMergePlan, type AdvancedMergeReviewState } from "../../../src/tools/jw-library-merger/merge/advancedMerge";
import { mergeNoteText } from "../../../src/tools/jw-library-merger/compare/mergeNoteText";
import { compareThreeWay } from "../../../src/tools/jw-library-merger/compare/compareThreeWay";
import { validateUserData } from "../../../src/tools/jw-library-merger/database/validateUserData";
import { buildMergedDatabase } from "../../../src/tools/jw-library-merger/database/buildMergedDatabase";
import { prepareAdvancedMerge } from "../../../src/tools/jw-library-merger/merge/prepareSimpleMerge";

const fixtureUrl = (name: string) => new URL(`../../fixtures/jw-library/${name}`, import.meta.url);
const sqliteWasm = new URL("../../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url);
const SQLPromise = readFile(sqliteWasm).then((wasmBinary) => initSqlJs({ wasmBinary: new Uint8Array(wasmBinary) }));
const sqliteLoader = (): Promise<SqlJsStatic> => SQLPromise;

async function fixtureFile(name: string): Promise<File> {
  return new File([new Uint8Array(await readFile(fixtureUrl(name)))], name);
}

function chooseAForRequiredConflicts(preview: Awaited<ReturnType<typeof prepareAdvancedMerge>>): AdvancedMergeReviewState {
  const choices: Record<string, "take-a" | "take-b"> = {};
  preview.comparison.records.forEach((record, index) => {
    if (record.outcome !== "conflict" && record.outcome !== "uncertain") return;
    choices[advancedDecisionKey(record.tableName, record.logicalIdentity.key, index)] = record.sourceA ? "take-a" : "take-b";
  });
  return { choices, noteTextStates: {}, reviewConfirmed: true };
}

describe("buildAdvancedMergePlan", () => {
  it("translates reviewed A/B choices and blocks source rows the database builder cannot key safely", async () => {
    const preview = await prepareAdvancedMerge(
      await fixtureFile("conflict-source-a.jwlibrary"),
      await fixtureFile("conflict-source-b.jwlibrary"),
      await fixtureFile("base.jwlibrary"),
      sqliteLoader,
    );
    const plan = buildAdvancedMergePlan(preview, chooseAForRequiredConflicts(preview));
    expect(plan.status).toBe("needs-review");
    expect(plan.report.unresolved.some((item) => item.tableName === "InputField")).toBe(true);
    const noteDecisionIndex = preview.comparison.records.findIndex((record) => record.tableName === "Note");
    const noteDecision = preview.comparison.records[noteDecisionIndex]!;
    const notePlan = plan.records.find((record) => record.tableName === "Note" && record.identityKey === noteDecision.logicalIdentity.key);
    expect(notePlan?.selected?.source).toBe("A");
    expect(notePlan?.selected?.row.Content).toContain("Conflicting edit from source A");
    expect(plan.report.informationLoss.some((loss) => loss.tableName === "Note" && loss.omittedFrom === "B")).toBe(true);

  });

  it("builds a database from a fully resolved Advanced plan when source rows have safe keys", async () => {
    const preview = await prepareAdvancedMerge(
      await fixtureFile("empty-a.jwlibrary"),
      await fixtureFile("empty-b.jwlibrary"),
      null,
      sqliteLoader,
    );
    const plan = buildAdvancedMergePlan(preview, chooseAForRequiredConflicts(preview));
    expect(plan.status, JSON.stringify(plan.report.unresolved)).toBe("ready");
    const [validatedA, validatedB] = await Promise.all([
      validateUserData(preview.sources[0].archive, sqliteLoader),
      validateUserData(preview.sources[1].archive, sqliteLoader),
    ]);
    try {
      const built = await buildMergedDatabase(validatedA, preview.sources[0].snapshot, validatedB, preview.sources[1].snapshot, plan, sqliteLoader);
      expect(built.integrity).toBe("ok");
      expect(built.bytes.byteLength).toBeGreaterThan(0);
    } finally {
      validatedA.database.close();
      validatedB.database.close();
    }
  });

  it("applies resolved block-level note text and retains both-fragment choices only when safe", async () => {
    const preview = await prepareAdvancedMerge(
      await fixtureFile("conflict-source-a.jwlibrary"),
      await fixtureFile("conflict-source-b.jwlibrary"),
      await fixtureFile("base.jwlibrary"),
      sqliteLoader,
    );
    const noteIndex = preview.comparison.records.findIndex((record) => record.tableName === "Note" && record.outcome === "conflict");
    const note = preview.comparison.records[noteIndex]!;
    const key = advancedDecisionKey(note.tableName, note.logicalIdentity.key, noteIndex);
    const content = note.differences.find((difference) => difference.path === "Content")!;
    const base = content.baseValue!.presence === "present" ? String(content.baseValue!.value) : "";
    const a = content.valueA.presence === "present" ? String(content.valueA.value) : "";
    const b = content.valueB.presence === "present" ? String(content.valueB.value) : "";
    const textPlan = mergeNoteText(base, a, b, "block");
    const resolutions = Object.fromEntries(textPlan.segments
      .filter((segment) => segment.kind === "conflict")
      .map((segment) => [`block:${segment.id}`, { choice: "a" as const }]));
    const state = chooseAForRequiredConflicts(preview);
    const choices = { ...state.choices };
    delete choices[key];
    const plan = buildAdvancedMergePlan(preview, {
      ...state,
      choices,
      noteTextStates: { [key]: { granularity: "block", resolutions } },
    });
    expect(plan.status).toBe("needs-review");
    expect(plan.report.unresolved.some((item) => item.tableName === "InputField")).toBe(true);
    const selectedNote = plan.records.find((record) => record.tableName === "Note" && record.identityKey === note.logicalIdentity.key)?.selected;
    expect(selectedNote?.row.Content).toContain("Conflicting edit from source A");
  });

  it("combines independent fields from A and B while keeping their source provenance", async () => {
    const original = await prepareAdvancedMerge(
      await fixtureFile("base.jwlibrary"),
      await fixtureFile("base.jwlibrary"),
      await fixtureFile("base.jwlibrary"),
      sqliteLoader,
    );
    const updateNote = (snapshot: typeof original.sources[number]["snapshot"], changes: { Title?: string; Content?: string }) => {
      const noteTable = snapshot.tables.Note!;
      const tables = {
        ...snapshot.tables,
        Note: { ...noteTable, rows: noteTable.rows.map((row, index) => index === 0 ? { ...row, ...changes } : row) },
      };
      return { ...snapshot, tables };
    };
    const snapshotA = updateNote(original.sources[0].snapshot, { Title: "A title edit" });
    const snapshotB = updateNote(original.sources[1].snapshot, { Content: "B content edit" });
    const base = original.baseSource!.snapshot;
    const comparison = compareThreeWay(snapshotA, snapshotB, base);
    const preview = {
      ...original,
      sources: [
        { ...original.sources[0], snapshot: snapshotA },
        { ...original.sources[1], snapshot: snapshotB },
      ] as const,
      comparison,
    };
    const plan = buildAdvancedMergePlan(preview, chooseAForRequiredConflicts(preview));
    const note = comparison.records.find((record) => record.tableName === "Note");
    expect(note?.outcome).toBe("non-overlapping");
    const selected = plan.records.find((record) => record.tableName === "Note" && record.identityKey === note?.logicalIdentity.key)?.selected;
    expect(selected?.row.Title).toBe("A title edit");
    expect(selected?.row.Content).toBe("B content edit");
    expect(selected?.fieldSources).toMatchObject({ Title: "A", Content: "B" });
  });

  it("keeps an unconfirmed or unresolved plan blocked", async () => {
    const preview = await prepareAdvancedMerge(
      await fixtureFile("base.jwlibrary"),
      await fixtureFile("conflict-source-b.jwlibrary"),
      await fixtureFile("base.jwlibrary"),
      sqliteLoader,
    );
    const result = buildAdvancedMergePlan(preview, { choices: {}, noteTextStates: {}, reviewConfirmed: false });
    expect(result.status).toBe("needs-review");
  });
});
