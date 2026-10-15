import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import initSqlJs from "sql.js";

const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
const schema = await readFile(join(fixtureDirectory, "schema-v16.sql"), "utf8");
const triggerSectionStart = schema.indexOf("\n-- trigger:");
if (triggerSectionStart < 0) {
  throw new Error("The synthetic schema is missing its trigger section.");
}
const tablesAndIndexes = schema.slice(0, triggerSectionStart);
const triggers = schema.slice(triggerSectionStart);
const SQL = await initSqlJs();
const archiveDate = new Date("2026-10-14T00:00:00.000Z");
const thumbnail = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S+UAAAAASUVORK5CYII=",
    "base64",
  ),
);

const ids = {
  baseNote: "00000000-0000-4000-8000-000000000001",
  addedNote: "00000000-0000-4000-8000-000000000002",
  secondConflictNote: "00000000-0000-4000-8000-000000000003",
  otherPublicationNote: "00000000-0000-4000-8000-000000000004",
  firstMark: "00000000-0000-4000-8000-000000001001",
  addedMark: "00000000-0000-4000-8000-000000001002",
};

function makeManifest(lastModifiedDate, schemaVersion = 16) {
  return {
    type: 0,
    name: "synthetic-jw-library-fixture.jwlibrary",
    creationDate: "2026-10-14T12:00:00+0000",
    userDataBackup: {
      schemaVersion,
      lastModifiedDate,
      deviceName: "Synthetic fixture device",
      databaseName: "userData.db",
      // Placeholder only; this is not asserted to be a JW Library-valid hash.
      hash: "0".repeat(64),
    },
    version: 1,
  };
}

function insertNote(database, { noteId, guid, title, content, created, lastModified, locationId = 1 }) {
  database.run(
    `INSERT INTO Note
      (NoteId, Guid, UserMarkId, LocationId, Title, Content, LastModified, Created, BlockType, BlockIdentifier)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 0, NULL)`,
    [noteId, guid, locationId, title, content, lastModified, created],
  );
}

function createDatabase({
  noteContent = "# Synthetic note\nBase text for merger fixtures.\n- First item",
  noteLastModified = "2026-10-10T10:00:00Z",
  databaseLastModified = "2026-10-10T10:00:00Z",
  addNote = false,
  addMarkAndRanges = false,
  emptyRecords = false,
  publicationConflictSet = false,
  conflictSource = "A",
} = {}) {
  const database = new SQL.Database();
  database.run("PRAGMA foreign_keys = ON;");
  database.run(tablesAndIndexes);

  database.run("INSERT INTO grdb_migrations (identifier) VALUES (?)", ["synthetic-schema-v16"]);
  database.run("INSERT INTO LastModified (LastModified) VALUES (?)", [databaseLastModified]);
  // JW Library's schema blocks later inserts/deletes from this singleton table.
  database.run(triggers);
  if (!emptyRecords) {
    database.run(
      `INSERT INTO Location
        (LocationId, DocumentId, IssueTagNumber, KeySymbol, MepsLanguage, Type)
        VALUES (1, 900001, 0, 'SYNTHETIC', 1, 0)`,
    );
    if (publicationConflictSet) {
      database.run("UPDATE Location SET BookNumber = 1, ChapterNumber = 1, Title = 'Publication Alpha' WHERE LocationId = 1");
      database.run(
        `INSERT INTO Location
          (LocationId, DocumentId, IssueTagNumber, KeySymbol, MepsLanguage, Type)
          VALUES (2, 900002, 0, 'SYNTHETIC-OTHER', 1, 0)`,
      );
      database.run("UPDATE Location SET BookNumber = 2, ChapterNumber = 1, Title = 'Publication Beta' WHERE LocationId = 2");
    }

    insertNote(database, {
      noteId: 1,
      guid: ids.baseNote,
      title: publicationConflictSet ? "First publication note" : "Synthetic note",
      content: publicationConflictSet ? `First publication edit from source ${conflictSource}.` : noteContent,
      created: "2026-10-01T09:00:00Z",
      lastModified: noteLastModified,
    });

    if (publicationConflictSet) {
      insertNote(database, {
        noteId: 2,
        guid: ids.secondConflictNote,
        title: "Second publication note",
        content: `Second publication edit from source ${conflictSource}.`,
        created: "2026-10-02T09:00:00Z",
        lastModified: noteLastModified,
      });
      insertNote(database, {
        noteId: 3,
        guid: ids.otherPublicationNote,
        title: "Other publication note",
        content: `Other publication edit from source ${conflictSource}.`,
        created: "2026-10-03T09:00:00Z",
        lastModified: noteLastModified,
        locationId: 2,
      });
    }

    database.run(
      `INSERT INTO UserMark
        (UserMarkId, ColorIndex, LocationId, StyleIndex, UserMarkGuid, Version)
        VALUES (1, 1, 1, 1, ?, 1)`,
      [ids.firstMark],
    );
    database.run(
      `INSERT INTO BlockRange
        (BlockRangeId, BlockType, Identifier, StartToken, EndToken, UserMarkId)
        VALUES (1, 1, 10, 0, 4, 1)`,
    );

    database.run("INSERT INTO Tag (TagId, Type, Name) VALUES (1, 1, 'Synthetic tag')");
    database.run(
      `INSERT INTO TagMap
        (TagMapId, PlaylistItemId, LocationId, NoteId, TagId, Position)
        VALUES (1, NULL, NULL, 1, 1, 0)`,
    );
    database.run(
      `INSERT INTO Bookmark
        (BookmarkId, LocationId, PublicationLocationId, Slot, Title, Snippet, BlockType, BlockIdentifier)
        VALUES (1, 1, 1, 0, 'Synthetic bookmark', 'Generated fixture', 0, NULL)`,
    );
    database.run(
      "INSERT INTO InputField (LocationId, TextTag, Value) VALUES (1, 'tt20', 'Synthetic value')",
    );

    if (addNote) {
      insertNote(database, {
        noteId: 2,
        guid: ids.addedNote,
        title: "Added synthetic note",
        content: "This note exists only in the added-note fixture.",
        created: "2026-10-11T08:00:00Z",
        lastModified: "2026-10-11T08:00:00Z",
      });
    }

    if (addMarkAndRanges) {
      database.run(
        `INSERT INTO UserMark
          (UserMarkId, ColorIndex, LocationId, StyleIndex, UserMarkGuid, Version)
          VALUES (2, 2, 1, 1, ?, 1)`,
        [ids.addedMark],
      );
      database.run(
        `INSERT INTO BlockRange
          (BlockRangeId, BlockType, Identifier, StartToken, EndToken, UserMarkId)
          VALUES (2, 1, 20, 0, 2, 2), (3, 1, 20, 3, 5, 2), (4, 2, 21, 0, 1, 2)`,
      );
      database.run(
        "INSERT INTO InputField (LocationId, TextTag, Value) VALUES (1, 'tt21', 'Additional synthetic value')",
      );
    }

    if (publicationConflictSet) {
      database.run("INSERT INTO PlaylistItemAccuracy (PlaylistItemAccuracyId, Description) VALUES (1, 'Default')");
      database.run(
        `INSERT INTO PlaylistItem (PlaylistItemId, Label, Accuracy, EndAction)
          VALUES (1, ?, 1, 0)`,
        [`Uncertain playlist identity from source ${conflictSource}`],
      );
      database.run("INSERT INTO PlaylistItemLocationMap (PlaylistItemId, LocationId, MajorMultimediaType) VALUES (1, 1, 0)");
    }
  }

  // Data-change triggers set this to wall-clock time; fixtures reset it to the
  // deterministic timestamp selected for the scenario.
  database.run("UPDATE LastModified SET LastModified = ?", [databaseLastModified]);

  const foreignKeyProblems = database.exec("PRAGMA foreign_key_check");
  if (foreignKeyProblems.length > 0) {
    database.close();
    throw new Error("A generated synthetic fixture has an invalid foreign-key relationship.");
  }

  const bytes = database.export();
  database.close();
  return bytes;
}

async function writeArchive(filename, {
  databaseBytes,
  manifest = makeManifest("2026-10-10T10:00:00Z"),
  includeManifest = true,
  includeDatabase = true,
  rawManifest,
} = {}) {
  const archive = new JSZip();
  const options = { date: archiveDate, createFolders: false };

  if (includeManifest) {
    archive.file("manifest.json", rawManifest ?? JSON.stringify(manifest, null, 2), options);
  }
  if (includeDatabase && databaseBytes) {
    archive.file("userData.db", databaseBytes, options);
  }
  archive.file("default_thumbnail.png", thumbnail, options);

  const bytes = await archive.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  await writeFile(join(fixtureDirectory, filename), bytes);
}

const baseDatabase = createDatabase();
const addedNoteDatabase = createDatabase({ addNote: true });
const modifiedNoteDatabase = createDatabase({
  noteContent: "# Synthetic note\nUpdated text from the newer fixture.\n- First item\n- Added item",
  noteLastModified: "2026-10-11T12:00:00Z",
  databaseLastModified: "2026-10-11T12:00:00Z",
});
const conflictADatabase = createDatabase({
  noteContent: "# Synthetic note\nConflicting edit from source A.",
  noteLastModified: "2026-10-11T11:00:00Z",
  databaseLastModified: "2026-10-11T11:00:00Z",
});
const conflictBDatabase = createDatabase({
  noteContent: "# Synthetic note\nConflicting edit from source B.",
  noteLastModified: "2026-10-11T12:00:00Z",
  databaseLastModified: "2026-10-11T12:00:00Z",
});
const publicationConflictADatabase = createDatabase({
  databaseLastModified: "2026-10-11T11:00:00Z",
  noteLastModified: "2026-10-11T11:00:00Z",
  publicationConflictSet: true,
  conflictSource: "A",
});
const publicationConflictBDatabase = createDatabase({
  databaseLastModified: "2026-10-11T12:00:00Z",
  noteLastModified: "2026-10-11T12:00:00Z",
  publicationConflictSet: true,
  conflictSource: "B",
});
const marksDatabase = createDatabase({
  databaseLastModified: "2026-10-11T13:00:00Z",
  addMarkAndRanges: true,
});
const emptyDatabase = createDatabase({ emptyRecords: true });

await writeArchive("identical-a.jwlibrary", { databaseBytes: baseDatabase });
await writeArchive("identical-b.jwlibrary", { databaseBytes: baseDatabase });
await writeArchive("base.jwlibrary", { databaseBytes: baseDatabase });
await writeArchive("new-note.jwlibrary", {
  databaseBytes: addedNoteDatabase,
  manifest: makeManifest("2026-10-11T08:00:00Z"),
});
await writeArchive("modified-note-newer.jwlibrary", {
  databaseBytes: modifiedNoteDatabase,
  manifest: makeManifest("2026-10-11T12:00:00Z"),
});
await writeArchive("conflict-source-a.jwlibrary", {
  databaseBytes: conflictADatabase,
  manifest: makeManifest("2026-10-11T11:00:00Z"),
});
await writeArchive("conflict-source-b.jwlibrary", {
  databaseBytes: conflictBDatabase,
  manifest: makeManifest("2026-10-11T12:00:00Z"),
});
await writeArchive("publication-conflicts-a.jwlibrary", {
  databaseBytes: publicationConflictADatabase,
  manifest: makeManifest("2026-10-11T11:00:00Z"),
});
await writeArchive("publication-conflicts-b.jwlibrary", {
  databaseBytes: publicationConflictBDatabase,
  manifest: makeManifest("2026-10-11T12:00:00Z"),
});
await writeArchive("mark-and-ranges-added.jwlibrary", {
  databaseBytes: marksDatabase,
  manifest: makeManifest("2026-10-11T13:00:00Z"),
});
await writeArchive("empty-a.jwlibrary", { databaseBytes: emptyDatabase });
await writeArchive("empty-b.jwlibrary", { databaseBytes: emptyDatabase });
await writeArchive("missing-manifest.jwlibrary", {
  databaseBytes: baseDatabase,
  includeManifest: false,
});
await writeArchive("invalid-manifest.jwlibrary", {
  databaseBytes: baseDatabase,
  rawManifest: '{ "schemaVersion": 16, ',
});
await writeArchive("missing-database.jwlibrary", {
  includeDatabase: false,
});
await writeArchive("unsupported-schema-version.jwlibrary", {
  databaseBytes: baseDatabase,
  manifest: makeManifest("2026-10-10T10:00:00Z", 999),
});
await writeArchive("corrupt-database.jwlibrary", {
  databaseBytes: new TextEncoder().encode("synthetic invalid SQLite bytes"),
});

await writeFile(
  join(fixtureDirectory, "manifest-valid-v16.json"),
  `${JSON.stringify(makeManifest("2026-10-10T10:00:00Z"), null, 2)}\n`,
);
await writeFile(join(fixtureDirectory, "manifest-invalid.json"), '{ "schemaVersion": 16, \n');

console.log("Generated synthetic JW Library fixtures in", fixtureDirectory);
