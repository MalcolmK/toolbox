import { readFile } from "node:fs/promises";
import type { Database as SqlDatabase } from "sql.js";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { readJwLibrary } from "../../../src/tools/jw-library-merger/archive/readJwLibrary";
import { readUserData } from "../../../src/tools/jw-library-merger/database/readUserData";
import { validateUserData } from "../../../src/tools/jw-library-merger/database/validateUserData";

const fixtureUrl = (name: string) =>
  new URL(`../../fixtures/jw-library/${name}`, import.meta.url);
const sqliteWasm = new URL("../../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url);
const SQLPromise = readFile(sqliteWasm).then((wasmBinary) =>
  initSqlJs({ wasmBinary: new Uint8Array(wasmBinary) }),
);

async function readValidatedFixture(name: string, transform?: (database: SqlDatabase) => void) {
  const bytes = await readFile(fixtureUrl(name));
  const source = await readJwLibrary(new File([new Uint8Array(bytes)], name));
  const SQL = await SQLPromise;
  let transformedSource = source;

  if (transform) {
    const database = new SQL.Database(source.databaseBytes);
    transform(database);
    transformedSource = { ...source, databaseBytes: database.export() };
    database.close();
  }

  return validateUserData(transformedSource, () => Promise.resolve(SQL));
}

const baseFixtureCounts = {
  BlockRange: 1,
  Bookmark: 1,
  IndependentMedia: 0,
  InputField: 1,
  LastModified: 1,
  Location: 1,
  Note: 1,
  PlaylistItem: 0,
  PlaylistItemAccuracy: 0,
  PlaylistItemIndependentMediaMap: 0,
  PlaylistItemLocationMap: 0,
  PlaylistItemMarker: 0,
  PlaylistItemMarkerBibleVerseMap: 0,
  PlaylistItemMarkerParagraphMap: 0,
  Tag: 1,
  TagMap: 1,
  UserMark: 1,
  grdb_migrations: 1,
};

const expectedFixtureCounts = {
  "base.jwlibrary": baseFixtureCounts,
  "identical-a.jwlibrary": baseFixtureCounts,
  "identical-b.jwlibrary": baseFixtureCounts,
  "modified-note-newer.jwlibrary": baseFixtureCounts,
  "conflict-source-a.jwlibrary": baseFixtureCounts,
  "conflict-source-b.jwlibrary": baseFixtureCounts,
  "new-note.jwlibrary": { ...baseFixtureCounts, Note: 2 },
  "mark-and-ranges-added.jwlibrary": {
    ...baseFixtureCounts,
    BlockRange: 4,
    InputField: 2,
    UserMark: 2,
  },
} satisfies Readonly<Record<string, Readonly<Record<string, number>>>>;

describe("readUserData", () => {
  it("reads every table with columns, keys, relationships, and rows", async () => {
    const validated = await readValidatedFixture("base.jwlibrary");

    try {
      const snapshot = readUserData(validated);
      const note = snapshot.tables.Note;

      expect(snapshot.sourceFileName).toBe("base.jwlibrary");
      expect(snapshot.schemaVersion).toBe(16);
      expect(snapshot.modificationTimes).toEqual({
        archiveCreatedAt: "2026-10-14T12:00:00+0000",
        manifestDatabaseLastModified: "2026-10-10T10:00:00Z",
        databaseLastModified: "2026-10-10T10:00:00Z",
        databaseLastModifiedValues: ["2026-10-10T10:00:00Z"],
      });
      expect(Object.keys(snapshot.tables).sort()).toEqual([...validated.tables].sort());
      expect(snapshot.recordCounts).toEqual(baseFixtureCounts);
      expect(note?.rowCount).toBe(1);
      expect(note?.primaryKey).toEqual(["NoteId"]);
      expect(note?.rows[0]?.Guid).toBe("00000000-0000-4000-8000-000000000001");
      expect(note?.rows[0]?.Content).toContain("Synthetic note");
      expect(note?.foreignKeys).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fromColumn: "LocationId",
            referencedTable: "Location",
            toColumn: "LocationId",
          }),
        ]),
      );
      expect(snapshot.schemaObjects.some((object) => object.type === "trigger")).toBe(true);
    } finally {
      validated.database.close();
    }
  });

  it.each(Object.entries(expectedFixtureCounts))(
    "matches the fixture catalog counts for %s",
    async (fixtureName, expectedCounts) => {
      const validated = await readValidatedFixture(fixtureName);
      try {
        expect(readUserData(validated).recordCounts).toEqual(expectedCounts);
      } finally {
        validated.database.close();
      }
    },
  );

  it("includes unknown user tables and does not change the validated database", async () => {
    const validated = await readValidatedFixture("base.jwlibrary", (database) => {
      database.run("CREATE TABLE FutureFeature (Id INTEGER PRIMARY KEY, Payload BLOB)");
      database.run("INSERT INTO FutureFeature VALUES (1, x'0102ff')");
    });

    try {
      const before = validated.database.exec("SELECT * FROM FutureFeature");
      const snapshot = readUserData(validated);
      const extraTable = snapshot.tables.FutureFeature;

      expect(extraTable?.rowCount).toBe(1);
      expect(extraTable?.rows[0]?.Payload).toEqual(new Uint8Array([1, 2, 255]));
      expect(validated.database.exec("SELECT * FROM FutureFeature")).toEqual(before);
    } finally {
      validated.database.close();
    }
  });

  it("produces stable row order using primary keys", async () => {
    const validated = await readValidatedFixture("base.jwlibrary", (database) => {
      database.run("INSERT INTO Tag (TagId, Type, Name) VALUES (10, 1, 'Later id')");
      database.run("INSERT INTO Tag (TagId, Type, Name) VALUES (2, 1, 'Earlier id')");
    });

    try {
      const snapshot = readUserData(validated);
      const tag = snapshot.tables.Tag;
      expect(tag?.ordering).toBe("primary-key");
      expect(tag?.rows.map((row) => row.TagId)).toEqual([1, 2, 10]);
    } finally {
      validated.database.close();
    }
  });
});
