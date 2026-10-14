import { readFile } from "node:fs/promises";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { readJwLibrary } from "../../../src/tools/jw-library-merger/archive/readJwLibrary";
import { compareLibraries } from "../../../src/tools/jw-library-merger/compare/compareLibraries";
import { readUserData } from "../../../src/tools/jw-library-merger/database/readUserData";
import { validateUserData } from "../../../src/tools/jw-library-merger/database/validateUserData";
import { buildMergeReport } from "../../../src/tools/jw-library-merger/report/buildMergeReport";
import type { UserDataSnapshot } from "../../../src/tools/jw-library-merger/database/readUserData";

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

describe("buildMergeReport", () => {
  it("turns changed notes into a readable report and keeps both timestamp sources", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("modified-note-newer.jwlibrary");
    try {
      const report = buildMergeReport(compareLibraries(a.snapshot, b.snapshot));
      const note = report.records.find((record) => record.tableLabel === "Aantekening");

      expect(report.title).toContain("Verschillen");
      expect(report.sources.map((source) => source.label)).toEqual(["Back-up A", "Back-up B"]);
      expect(report.summary.possibleConflicts).toBe(1);
      expect(report.summary.listedDifferences).toBe(report.records.length);
      expect(note).toMatchObject({
        headline: "Aantekening: Synthetic note",
        statusLabel: "Mogelijk inhoudelijk conflict",
        sourceA: { details: expect.arrayContaining([
          { label: "Inhoud", value: expect.stringContaining("Base text") },
        ]) },
        sourceB: { details: expect.arrayContaining([
          { label: "Inhoud", value: expect.stringContaining("Updated text") },
        ]) },
      });
      expect(note?.noteTimestamps[1]).toMatchObject({
        field: "Laatst gewijzigd",
        valueA: { originalValue: "2026-10-10T10:00:00Z", utcValue: "2026-10-10T10:00:00.000Z" },
        valueB: { originalValue: "2026-10-11T12:00:00Z", utcValue: "2026-10-11T12:00:00.000Z" },
      });
      expect(report.introduction).toContain("voert geen samenvoeging uit");
      expect(report.records.some((record) => record.status === "equal")).toBe(false);
    } finally {
      a.close();
      b.close();
    }
  });

  it("clearly states that a record found on one side is not proven deleted on the other", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("new-note.jwlibrary");
    try {
      const report = buildMergeReport(compareLibraries(a.snapshot, b.snapshot));
      const added = report.records.find((record) => record.headline === "Aantekening: Added synthetic note");

      expect(added?.statusLabel).toBe("Komt alleen voor in back-up B");
      expect(added?.absenceWarning).toContain("niet vast te stellen");
      expect(report.limitations.join(" ")).toContain("zonder basisback-up niet bewezen");
    } finally {
      a.close();
      b.close();
    }
  });

  it("flags missing or invalid timestamps without treating them as older or newer", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("modified-note-newer.jwlibrary");
    try {
      const noteTable = a.snapshot.tables.Note!;
      const alteredSnapshot: UserDataSnapshot = {
        ...a.snapshot,
        tables: {
          ...a.snapshot.tables,
          Note: {
            ...noteTable,
            rows: [{ ...noteTable.rows[0]!, Created: "2026-10-14T09:00:00" , LastModified: null }],
          },
        },
      };
      const report = buildMergeReport(compareLibraries(alteredSnapshot, b.snapshot));
      const unknowns = report.timestampWarnings.filter((warning) =>
        warning.recordLabel === "Aantekening: Synthetic note",
      );

      expect(unknowns).toEqual(expect.arrayContaining([
        expect.objectContaining({ label: "Aantekening aangemaakt", status: "invalid" }),
        expect.objectContaining({ label: "Aantekening laatst gewijzigd", status: "missing" }),
      ]));
      expect(unknowns.every((warning) => warning.utcValue === null
        && warning.message.includes("niet worden afgeleid"))).toBe(true);
    } finally {
      a.close();
      b.close();
    }
  });

  it("uses readable labels for unresolved relations and hides source-local integer IDs", async () => {
    const a = await readSnapshot("identical-a.jwlibrary");
    const b = await readSnapshot("identical-b.jwlibrary");
    try {
      const report = buildMergeReport(compareLibraries(a.snapshot, b.snapshot));
      const note = report.records.find((record) => record.tableLabel === "Aantekening");

      expect(note?.relationships).toEqual(expect.arrayContaining([
        expect.objectContaining({
          label: "Gekoppelde publicatie- of mediaplek",
          status: "uncertain",
        }),
      ]));
      expect(JSON.stringify(report)).not.toContain('"NoteId"');
      expect(JSON.stringify(report)).not.toContain('"UserMarkId"');
      expect(report.records.length).toBeGreaterThan(0);
      expect(report.summary.equal).toBeGreaterThan(0);
    } finally {
      a.close();
      b.close();
    }
  });
});
