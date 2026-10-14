import { readFile } from "node:fs/promises";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { readJwLibrary } from "../../../src/tools/jw-library-merger/archive/readJwLibrary";
import { readUserData } from "../../../src/tools/jw-library-merger/database/readUserData";
import {
  normalizeTimestamp,
  normalizeUserDataTimestamps,
} from "../../../src/tools/jw-library-merger/compare/normalizeTimestamp";
import { validateUserData } from "../../../src/tools/jw-library-merger/database/validateUserData";

const fixtureUrl = (name: string) =>
  new URL(`../../fixtures/jw-library/${name}`, import.meta.url);
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

describe("normalizeTimestamp", () => {
  it("compares compact offsets and UTC Z timestamps as the same instant", () => {
    const localOffset = normalizeTimestamp("2026-10-14T11:33:03+0200");
    const utc = normalizeTimestamp("2026-10-14T09:33:03Z");

    expect(localOffset.status).toBe("valid");
    expect(localOffset.sourceText).toBe("2026-10-14T11:33:03+0200");
    expect(localOffset.epochMilliseconds).toBe(utc.epochMilliseconds);
    expect(localOffset.utc).toBe("2026-10-14T09:33:03.000Z");
  });

  it("accepts colon-separated offsets and fractional seconds", () => {
    const timestamp = normalizeTimestamp("2026-10-14T11:33:03.250+02:00");

    expect(timestamp.status).toBe("valid");
    expect(timestamp.utc).toBe("2026-10-14T09:33:03.250Z");
    expect(timestamp.sourceText).toBe("2026-10-14T11:33:03.250+02:00");
  });

  it.each([null, undefined, "", "   "])("keeps an absent value unknown (%s)", (value) => {
    const timestamp = normalizeTimestamp(value);

    expect(timestamp.status).toBe("missing");
    expect(timestamp.epochMilliseconds).toBeNull();
    expect(timestamp.utc).toBeNull();
  });

  it.each([
    "not a timestamp",
    "2026-10-14T09:33:03", // no timezone: local interpretation is unsafe
    "2026-02-30T09:33:03Z",
    "2026-10-14T25:33:03Z",
    "2026-10-14T09:33:03+2500",
    123456,
  ])("marks malformed or non-text values unknown (%s)", (value) => {
    const timestamp = normalizeTimestamp(value);

    expect(timestamp.status).toBe("invalid");
    expect(timestamp.epochMilliseconds).toBeNull();
    expect(timestamp.utc).toBeNull();
  });

  it("normalizes database, manifest, and note times without conflating their sources", async () => {
    const { snapshot, close } = await readSnapshot("modified-note-newer.jwlibrary");
    try {
      const summary = normalizeUserDataTimestamps(snapshot);

      expect(summary.archiveCreatedAt.sourceText).toBe("2026-10-14T12:00:00+0000");
      expect(summary.manifestDatabaseLastModified.sourceText).toBe("2026-10-11T12:00:00Z");
      expect(summary.databaseLastModified.sourceText).toBe("2026-10-11T12:00:00Z");
      expect(summary.notes).toHaveLength(1);
      expect(summary.notes[0]).toMatchObject({
        guid: "00000000-0000-4000-8000-000000000001",
        created: { sourceText: "2026-10-01T09:00:00Z", status: "valid" },
        lastModified: { sourceText: "2026-10-11T12:00:00Z", status: "valid" },
      });
      expect(snapshot.tables.Note?.rows[0]?.LastModified).toBe("2026-10-11T12:00:00Z");
    } finally {
      close();
    }
  });

  it("does not invent a database timestamp when the singleton has multiple rows", async () => {
    const { snapshot, close } = await readSnapshot("base.jwlibrary");
    try {
      const malformedSnapshot = {
        ...snapshot,
        modificationTimes: {
          ...snapshot.modificationTimes,
          databaseLastModified: null,
          databaseLastModifiedValues: ["2026-10-10T10:00:00Z", "2026-10-11T10:00:00Z"],
        },
      };
      const summary = normalizeUserDataTimestamps(malformedSnapshot);

      expect(summary.databaseLastModified.status).toBe("invalid");
      expect(summary.databaseLastModified.epochMilliseconds).toBeNull();
    } finally {
      close();
    }
  });
});
