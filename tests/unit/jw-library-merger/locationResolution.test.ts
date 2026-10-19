import { readFile } from "node:fs/promises";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { readJwLibrary } from "../../../src/tools/jw-library-merger/archive/readJwLibrary";
import { readUserData, type UserDataSnapshot } from "../../../src/tools/jw-library-merger/database/readUserData";
import { validateUserData } from "../../../src/tools/jw-library-merger/database/validateUserData";
import { compareLibraries } from "../../../src/tools/jw-library-merger/compare/compareLibraries";
import { identifyRecord } from "../../../src/tools/jw-library-merger/compare/recordIdentity";
import {
  confirmLocationProposal,
  createLocationResolutionContext,
  isLocationResolutionContextCurrent,
  markLocationDifferent,
  revokeLocationConfirmation,
} from "../../../src/tools/jw-library-merger/merge/locationResolution";

const fixture = (name: string) => new URL(`../../fixtures/jw-library/${name}`, import.meta.url);
const wasm = new URL("../../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url);
const SQLPromise = readFile(wasm).then((bytes) => initSqlJs({ wasmBinary: new Uint8Array(bytes) }));

async function snapshot(name: string) {
  const bytes = await readFile(fixture(name));
  const archive = await readJwLibrary(new File([new Uint8Array(bytes)], name));
  const SQL = await SQLPromise;
  const validated = await validateUserData(archive, () => Promise.resolve(SQL));
  return { value: readUserData(validated), close: () => validated.database.close() };
}

function documentPlace(LocationId: number, overrides: Record<string, unknown> = {}) {
  return { LocationId, Type: 0, KeySymbol: "PUB-A", MepsLanguage: 1, BookNumber: null,
    ChapterNumber: null, DocumentId: 1001, IssueTagNumber: 0, Track: null,
    Specialty: null, Edition: null, Title: "Titel", ...overrides };
}

function bibleChapter(LocationId: number) {
  return { LocationId, Type: 0, KeySymbol: "nwt", MepsLanguage: 1, BookNumber: 1,
    ChapterNumber: 2, DocumentId: null, IssueTagNumber: 0, Track: null,
    Specialty: null, Edition: null, Title: "Genesis 1:2" };
}

function withLocations(base: UserDataSnapshot, fileName: string, rows: readonly Record<string, unknown>[]): UserDataSnapshot {
  const table = base.tables.Location!;
  return { ...base, sourceFileName: fileName,
    tables: { ...base.tables, Location: { ...table, rows, rowCount: rows.length } },
    recordCounts: { ...base.recordCounts, Location: rows.length } };
}

function manyDistinctPlaces(base: UserDataSnapshot, source: "A" | "B", count: number): UserDataSnapshot {
  const offset = source === "A" ? 0 : 100_000;
  const rows = Array.from({ length: count }, (_, index) => documentPlace(offset + index + 1, {
    KeySymbol: `fixture-${index + 1}`,
    DocumentId: index + 1,
  }));
  return withLocations(base, `location-fixture-${source}`, rows);
}

describe("session-scoped Location resolution", () => {
  it("indexes large exact-place sets instead of rescanning every location pair", async () => {
    const a = await snapshot("identical-a.jwlibrary");
    const b = await snapshot("identical-b.jwlibrary");
    try {
      const sourceA = manyDistinctPlaces(a.value, "A", 8_000);
      const sourceB = manyDistinctPlaces(b.value, "B", 8_000);
      const started = performance.now();
      const context = createLocationResolutionContext("large-location-session", "large-location-pair", sourceA, sourceB);
      const elapsedMs = performance.now() - started;

      expect(context.proposals).toHaveLength(8_000);
      expect(context.unresolved).toHaveLength(0);
      expect(elapsedMs).toBeLessThan(5_000);
    } finally {
      a.close();
      b.close();
    }
  }, 30_000);

  it("proposes only an exact unique supported pair and makes a confirmation affect comparison", async () => {
    const a = await snapshot("identical-a.jwlibrary");
    const b = await snapshot("identical-b.jwlibrary");
    try {
      const sourceA = withLocations(a.value, "a", [documentPlace(100)]);
      const sourceB = withLocations(b.value, "b", [documentPlace(900)]);
      const context = createLocationResolutionContext("session-1", "pair-1", sourceA, sourceB);
      expect(context.proposals).toHaveLength(1);
      expect(context.proposals[0]).toMatchObject({ sourceA: { source: "A", localKey: '["Location","source-local",100]' },
        sourceB: { source: "B", localKey: '["Location","source-local",900]' } });
      const result = confirmLocationProposal(context, context.proposals[0]!.id, "session-1", 0, sourceA, sourceB, "B");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Object.isFrozen(result.context)).toBe(true);
      expect(result.context.confirmedGroups[0]?.displayMetadataSource).toBe("B");
      const compared = compareLibraries(sourceA, sourceB, result.context).records
        .find((record) => record.tableName === "Location");
      expect(compared?.identityStatus).toBe("stable");
      expect(compared?.identityKey).toContain("session-1:location:");
    } finally { a.close(); b.close(); }
  });

  it("revokes and permits reconfirmation only at the current revision", async () => {
    const a = await snapshot("identical-a.jwlibrary");
    const b = await snapshot("identical-b.jwlibrary");
    try {
      const sourceA = withLocations(a.value, "a", [documentPlace(100)]);
      const sourceB = withLocations(b.value, "b", [documentPlace(900)]);
      const initial = createLocationResolutionContext("s", "p", sourceA, sourceB);
      const confirmed = confirmLocationProposal(initial, initial.proposals[0]!.id, "s", 0, sourceA, sourceB, "A");
      if (!confirmed.ok) throw new Error(confirmed.reason);
      const revoked = revokeLocationConfirmation(confirmed.context, confirmed.context.confirmedGroups[0]!.id,
        "s", 1, sourceA, sourceB);
      if (!revoked.ok) throw new Error(revoked.reason);
      expect(revoked.context.confirmedGroups).toHaveLength(0);
      expect(confirmLocationProposal(revoked.context, initial.proposals[0]!.id, "s", 1, sourceA, sourceB, "A"))
        .toMatchObject({ ok: false, code: "stale-context" });
      expect(confirmLocationProposal(revoked.context, initial.proposals[0]!.id, "s", 2, sourceA, sourceB, "A"))
        .toMatchObject({ ok: true });
    } finally { a.close(); b.close(); }
  });

  it("rejects an old source pair, a replaced file, changed descriptions and a second group for the same row", async () => {
    const a = await snapshot("identical-a.jwlibrary");
    const b = await snapshot("identical-b.jwlibrary");
    try {
      const sourceA = withLocations(a.value, "a", [documentPlace(100)]);
      const sourceB = withLocations(b.value, "b", [documentPlace(900)]);
      const context = createLocationResolutionContext("old-session", "old-pair", sourceA, sourceB);
      const changed = withLocations(b.value, "replacement", [documentPlace(900)]);
      expect(confirmLocationProposal(context, context.proposals[0]!.id, "new-session", 0, sourceA, sourceB, "A"))
        .toMatchObject({ ok: false, code: "stale-context" });
      expect(confirmLocationProposal(context, context.proposals[0]!.id, "old-session", 0, sourceA, changed, "A"))
        .toMatchObject({ ok: false, code: "stale-context" });
      const altered = withLocations(b.value, "b", [documentPlace(900, { Edition: "changed" })]);
      expect(confirmLocationProposal(context, context.proposals[0]!.id, "old-session", 0, sourceA, altered, "A"))
        .toMatchObject({ ok: false, code: "stale-context" });
      (sourceB.tables.Location!.rows[0] as Record<string, unknown>).Edition = "changed-in-place";
      expect(confirmLocationProposal(context, context.proposals[0]!.id, "old-session", 0, sourceA, sourceB, "A"))
        .toMatchObject({ ok: false, code: "changed-source-row" });
      (sourceB.tables.Location!.rows[0] as Record<string, unknown>).Edition = null;
      const first = confirmLocationProposal(context, context.proposals[0]!.id, "old-session", 0, sourceA, sourceB, "A");
      if (!first.ok) throw new Error(first.reason);
      const duplicateProposal = { ...first.context.proposals[0]!, id: "duplicate-row-pair" };
      const forged = { ...first.context, proposals: [...first.context.proposals, duplicateProposal] };
      expect(confirmLocationProposal(forged, duplicateProposal.id, "old-session", 1, sourceA, sourceB, "B"))
        .toMatchObject({ ok: false, code: "already-grouped" });
    } finally { a.close(); b.close(); }
  });

  it("does not propose one-to-many or unsupported pairs and invalidates a context after source changes", async () => {
    const a = await snapshot("identical-a.jwlibrary");
    const b = await snapshot("identical-b.jwlibrary");
    try {
      const sourceA = withLocations(a.value, "a", [documentPlace(100)]);
      const oneToMany = withLocations(b.value, "b", [documentPlace(900), documentPlace(901)]);
      expect(createLocationResolutionContext("s", "p", sourceA, oneToMany).proposals).toHaveLength(0);
      const unsupported = withLocations(b.value, "b", [documentPlace(900, { Type: 2 })]);
      expect(createLocationResolutionContext("s", "p", sourceA, unsupported).proposals).toHaveLength(0);
      const context = createLocationResolutionContext("s", "p", sourceA, withLocations(b.value, "b", [documentPlace(900)]));
      expect(isLocationResolutionContextCurrent(context, sourceA, withLocations(b.value, "replacement", [documentPlace(900)])))
        .toBe(false);
    } finally { a.close(); b.close(); }
  });

  it("blocks a different decision when the separate Bible chapter rows collide on a unique key", async () => {
    const a = await snapshot("identical-a.jwlibrary");
    const b = await snapshot("identical-b.jwlibrary");
    try {
      const sourceA = withLocations(a.value, "a", [bibleChapter(100)]);
      const sourceB = withLocations(b.value, "b", [bibleChapter(900)]);
      const context = createLocationResolutionContext("s", "p", sourceA, sourceB);
      const result = markLocationDifferent(context, context.proposals[0]!.id, "s", 0, sourceA, sourceB);
      expect(result).toMatchObject({ ok: true, context: { differentDecisions: [
        { canKeepSeparate: false, blockingReason: expect.stringContaining("unieke") },
      ] } });
    } finally { a.close(); b.close(); }
  });

  it("uses a confirmed session identity to compare rows that reference the paired Location", async () => {
    const a = await snapshot("identical-a.jwlibrary");
    const b = await snapshot("identical-b.jwlibrary");
    try {
      const noteA = a.value.tables.UserMark!.rows.find((row) => row.LocationId !== null)!;
      const noteB = b.value.tables.UserMark!.rows.find((row) => row.UserMarkGuid === noteA.UserMarkGuid)!;
      const idA = Number(noteA.LocationId);
      const idB = Number(noteB.LocationId);
      const sourceA = withLocations(a.value, "a", [documentPlace(idA)]);
      const sourceB = withLocations(b.value, "b", [documentPlace(idB)]);
      const context = createLocationResolutionContext("s", "p", sourceA, sourceB);
      const confirmed = confirmLocationProposal(context, context.proposals[0]!.id, "s", 0, sourceA, sourceB, "A");
      if (!confirmed.ok) throw new Error(confirmed.reason);
      const noteIdentity = identifyRecord(sourceA, "UserMark", noteA).key;
      const linked = compareLibraries(sourceA, sourceB, confirmed.context).records
        .find((record) => record.tableName === "UserMark" && record.identityKey === noteIdentity);
      expect(linked?.relationshipDifferences.find((item) => item.field === "LocationId")).toBeUndefined();
      expect(linked?.status).toBe("equal");
      expect(compareLibraries(sourceA, sourceB).records
        .find((record) => record.tableName === "UserMark" && record.identityKey === noteIdentity)
        ?.relationshipDifferences.find((item) => item.field === "LocationId")?.status).toBe("uncertain");
    } finally { a.close(); b.close(); }
  });
});
