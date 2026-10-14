import { readFile } from "node:fs/promises";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { readJwLibrary } from "../../../src/tools/jw-library-merger/archive/readJwLibrary";
import {
  identifyRecord,
  TABLE_IDENTITY_RULES,
} from "../../../src/tools/jw-library-merger/compare/recordIdentity";
import { readUserData } from "../../../src/tools/jw-library-merger/database/readUserData";
import { validateUserData } from "../../../src/tools/jw-library-merger/database/validateUserData";
import type { UserDataSnapshot } from "../../../src/tools/jw-library-merger/database/readUserData";

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

function fullLocationKey(snapshot: UserDataSnapshot, id: number): UserDataSnapshot {
  const locationTable = snapshot.tables.Location!;
  const rows = locationTable.rows.map((row) => row.LocationId === id
    ? {
      ...row,
      BookNumber: 1,
      ChapterNumber: 1,
      KeySymbol: "NWT",
      MepsLanguage: 1,
      Type: 0,
    }
    : row);
  return {
    ...snapshot,
    tables: {
      ...snapshot.tables,
      Location: { ...locationTable, rows },
    },
  };
}

describe("identifyRecord", () => {
  it("matches notes by Guid and never by a coincidentally equal NoteId", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("modified-note-newer.jwlibrary");
    try {
      const rowA = a.snapshot.tables.Note!.rows[0]!;
      const rowB = b.snapshot.tables.Note!.rows[0]!;
      const identityA = identifyRecord(a.snapshot, "Note", rowA);
      const identityB = identifyRecord(b.snapshot, "Note", rowB);
      const differentGuid = identifyRecord(b.snapshot, "Note", {
        ...rowB,
        Guid: "00000000-0000-4000-8000-000000000099",
      });

      expect(identityA.status).toBe("stable");
      expect(identityA.canMatchAcrossBackups).toBe(true);
      expect(identityA.key).toBe(identityB.key);
      expect(identityA.key).not.toBe(differentGuid.key);
      expect(identityA.localKey).toBe(identityB.localKey);
    } finally {
      a.close();
      b.close();
    }
  });

  it("matches user marks by UserMarkGuid and ranges through their parent mark", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("mark-and-ranges-added.jwlibrary");
    try {
      const markA = identifyRecord(a.snapshot, "UserMark", a.snapshot.tables.UserMark!.rows[0]!);
      const markB = identifyRecord(b.snapshot, "UserMark", b.snapshot.tables.UserMark!.rows[0]!);
      const rangeA = identifyRecord(a.snapshot, "BlockRange", a.snapshot.tables.BlockRange!.rows[0]!, 0);
      const rangeB = identifyRecord(b.snapshot, "BlockRange", b.snapshot.tables.BlockRange!.rows[0]!, 0);

      expect(markA.key).toBe(markB.key);
      expect(markA.status).toBe("stable");
      expect(rangeA.key).toBe(rangeB.key);
      expect(rangeA.status).toBe("candidate");
      expect(rangeA.canMatchAcrossBackups).toBe(false);
    } finally {
      a.close();
      b.close();
    }
  });

  it("resolves natural relationship keys without carrying source-local IDs across backups", async () => {
    const a = await readSnapshot("base.jwlibrary");
    const b = await readSnapshot("base.jwlibrary");
    try {
      const snapshotA = fullLocationKey(a.snapshot, 1);
      const snapshotB = fullLocationKey(b.snapshot, 1);
      const inputA = identifyRecord(snapshotA, "InputField", snapshotA.tables.InputField!.rows[0]!);
      const inputB = identifyRecord(snapshotB, "InputField", snapshotB.tables.InputField!.rows[0]!);
      const bookmarkA = identifyRecord(snapshotA, "Bookmark", snapshotA.tables.Bookmark!.rows[0]!);
      const bookmarkB = identifyRecord(snapshotB, "Bookmark", snapshotB.tables.Bookmark!.rows[0]!);

      expect(inputA.status).toBe("candidate");
      expect(inputA.key).toBe(inputB.key);
      expect(bookmarkA.status).toBe("candidate");
      expect(bookmarkA.key).toBe(bookmarkB.key);
    } finally {
      a.close();
      b.close();
    }
  });

  it("marks incomplete natural keys as uncertain even when local integer IDs match", async () => {
    const { snapshot, close } = await readSnapshot("base.jwlibrary");
    try {
      const location = snapshot.tables.Location!.rows[0]!;
      const locationIdentity = identifyRecord(snapshot, "Location", location);
      const input = identifyRecord(snapshot, "InputField", snapshot.tables.InputField!.rows[0]!);

      expect(location.LocationId).toBe(1);
      expect(locationIdentity.status).toBe("uncertain");
      expect(locationIdentity.key).toBeNull();
      expect(input.status).toBe("uncertain");
      expect(input.key).toBeNull();
    } finally {
      close();
    }
  });

  it("does not use playlist integer IDs as cross-backup identities", async () => {
    const { snapshot, close } = await readSnapshot("base.jwlibrary");
    try {
      const playlistA = identifyRecord(snapshot, "PlaylistItem", {
        PlaylistItemId: 1,
        Label: "First source item",
      });
      const playlistB = identifyRecord(snapshot, "PlaylistItem", {
        PlaylistItemId: 1,
        Label: "Different source item",
      });

      expect(playlistA.status).toBe("uncertain");
      expect(playlistA.key).toBeNull();
      expect(playlistA.localKey).toBe(playlistB.localKey);
    } finally {
      close();
    }
  });

  it("has an explicit identity policy for every supported schema table", async () => {
    const { snapshot, close } = await readSnapshot("base.jwlibrary");
    try {
      expect(Object.keys(TABLE_IDENTITY_RULES).sort()).toEqual(
        Object.keys(snapshot.tables).sort(),
      );
      const tagA = identifyRecord(snapshot, "Tag", snapshot.tables.Tag!.rows[0]!);
      const tagB = identifyRecord(snapshot, "Tag", {
        ...snapshot.tables.Tag!.rows[0]!,
        TagId: 999,
      });

      expect(tagA.status).toBe("candidate");
      expect(tagA.key).toBe(tagB.key);
      expect(tagA.canMatchAcrossBackups).toBe(false);
    } finally {
      close();
    }
  });
});
