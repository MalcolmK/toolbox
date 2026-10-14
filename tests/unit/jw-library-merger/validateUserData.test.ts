import { readFile } from "node:fs/promises";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { readJwLibrary } from "../../../src/tools/jw-library-merger/archive/readJwLibrary";
import {
  UserDataValidationError,
  validateUserData,
} from "../../../src/tools/jw-library-merger/database/validateUserData";

const fixtureUrl = (name: string) =>
  new URL(`../../fixtures/jw-library/${name}`, import.meta.url);
const sqliteWasm = new URL("../../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url);
const SQLPromise = readFile(sqliteWasm).then((wasmBinary) =>
  initSqlJs({ wasmBinary: new Uint8Array(wasmBinary) }),
);

async function readFixture(name: string) {
  const bytes = await readFile(fixtureUrl(name));
  return readJwLibrary(new File([new Uint8Array(bytes)], name));
}

describe("validateUserData", () => {
  it("opens a supported database and reports successful integrity checks", async () => {
    const source = await readFixture("base.jwlibrary");
    const SQL = await SQLPromise;
    const validated = await validateUserData(source, () => Promise.resolve(SQL));

    expect(validated.schemaVersion).toBe(16);
    expect(validated.integrity).toBe("ok");
    expect(validated.foreignKeys).toBe("ok");
    expect(validated.tables).toContain("Note");
    expect(validated.tables).toContain("grdb_migrations");
    expect(validated.database.exec("SELECT count(*) FROM Note")[0]?.values[0]?.[0]).toBe(1);
    expect(() => validated.database.run("DELETE FROM Note")).toThrow();
    validated.database.close();
  });

  it("rejects bytes that cannot be opened as SQLite", async () => {
    const source = await readFixture("corrupt-database.jwlibrary");

    const SQL = await SQLPromise;
    await expect(validateUserData(source, () => Promise.resolve(SQL))).rejects.toMatchObject({
      name: "UserDataValidationError",
      issues: [expect.objectContaining({ code: "invalid-database" })],
    });
  });

  it("rejects a manifest schema version that has not been reviewed", async () => {
    const source = await readFixture("unsupported-schema-version.jwlibrary");

    const SQL = await SQLPromise;
    await expect(validateUserData(source, () => Promise.resolve(SQL))).rejects.toMatchObject({
      name: "UserDataValidationError",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "unsupported-schema-version" }),
      ]),
    });
  });

  it("rejects a database whose required JW Library structure is incomplete", async () => {
    const source = await readFixture("base.jwlibrary");
    const SQL = await SQLPromise;
    const database = new SQL.Database(source.databaseBytes);
    database.run("DROP TABLE Bookmark");
    const malformedSource = { ...source, databaseBytes: database.export() };
    database.close();

    await expect(
      validateUserData(malformedSource, () => Promise.resolve(SQL)),
    ).rejects.toMatchObject({
      name: "UserDataValidationError",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "missing-table", table: "Bookmark" }),
        expect.objectContaining({ code: "schema-version-mismatch" }),
      ]),
    });
  });

  it("reports foreign-key violations separately from SQLite file integrity", async () => {
    const source = await readFixture("base.jwlibrary");
    const SQL = await SQLPromise;
    const database = new SQL.Database(source.databaseBytes);
    database.run("PRAGMA foreign_keys = OFF");
    database.run(
      `INSERT INTO Note
        (NoteId, Guid, LocationId, Title, Content, LastModified, Created, BlockType, BlockIdentifier)
        VALUES (99, 'synthetic-orphan-note', 999, 'Orphan', '', '2026-10-12T00:00:00Z', '2026-10-12T00:00:00Z', 0, NULL)`,
    );
    const invalidReferences = { ...source, databaseBytes: database.export() };
    database.close();

    await expect(
      validateUserData(invalidReferences, () => Promise.resolve(SQL)),
    ).rejects.toMatchObject({
      name: "UserDataValidationError",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "foreign-key-check-failed" }),
      ]),
    });
  });

  it("returns structured issues callers can use to explain validation loss risks", async () => {
    const source = await readFixture("unsupported-schema-version.jwlibrary");

    try {
      const SQL = await SQLPromise;
      await validateUserData(source, () => Promise.resolve(SQL));
      throw new Error("Expected unsupported schema validation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(UserDataValidationError);
      expect((error as UserDataValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "unsupported-schema-version",
            message: expect.stringContaining("wordt niet ondersteund"),
          }),
        ]),
      );
    }
  });
});
