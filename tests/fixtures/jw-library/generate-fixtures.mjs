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
  baseLocationId = 1,
  idOffset = 0,
  publicationConflictSet = false,
  includeUncertainPlaylist = publicationConflictSet,
  conflictSource = "A",
  playlist = null,
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
        VALUES (?, 900001, 0, 'SYNTHETIC', 1, 0)`, [baseLocationId],
    );
    if (publicationConflictSet) {
      const betaLocationId = baseLocationId + 1;
      const appendixLocationId = baseLocationId + 2;
      database.run("UPDATE Location SET Title = 'Publication Alpha' WHERE LocationId = ?", [baseLocationId]);
      database.run(
        `INSERT INTO Location
          (LocationId, DocumentId, IssueTagNumber, KeySymbol, MepsLanguage, Type, Title)
          VALUES (?, 900002, 0, 'SYNTHETIC-OTHER', 1, 0, 'Publication Beta')`, [betaLocationId],
      );
      database.run(
        `INSERT INTO Location
          (LocationId, DocumentId, IssueTagNumber, KeySymbol, MepsLanguage, Type, Title)
          VALUES (?, 900003, 0, 'SYNTHETIC', 1, 0, ?)`,
        [appendixLocationId, `Alpha appendix ${conflictSource}`],
      );
    }

    if (playlist) {
      const ids = { item: playlist.itemId ?? 10 + idOffset, media: playlist.mediaId ?? 10 + idOffset,
        marker: playlist.markerId ?? 10 + idOffset, accuracy: playlist.accuracyId ?? 1 + idOffset };
      database.run("INSERT INTO PlaylistItemAccuracy (PlaylistItemAccuracyId, Description) VALUES (?, 'Default')", [ids.accuracy]);
      database.run("INSERT INTO IndependentMedia (IndependentMediaId, OriginalFilename, FilePath, MimeType, Hash) VALUES (?, 'clip.mp4', ?, 'video/mp4', 'synthetic-sha256')",
        [ids.media, playlist.mediaPath ?? "playlist-media.bin"]);
      database.run(`INSERT INTO PlaylistItem (PlaylistItemId, Label, StartTrimOffsetTicks, EndTrimOffsetTicks, Accuracy, EndAction, ThumbnailFilePath)
        VALUES (?, 'Shared label', 10, 20, ?, 0, NULL)`, [ids.item, ids.accuracy]);
      database.run("INSERT INTO PlaylistItemIndependentMediaMap (PlaylistItemId, IndependentMediaId, DurationTicks) VALUES (?, ?, ?)",
        [ids.item, ids.media, playlist.durationTicks ?? 1000]);
      database.run("INSERT INTO PlaylistItemLocationMap (PlaylistItemId, LocationId, MajorMultimediaType, BaseDurationTicks) VALUES (?, ?, 0, 1000)",
        [ids.item, baseLocationId]);
      database.run("INSERT INTO PlaylistItemMarker (PlaylistItemMarkerId, PlaylistItemId, Label, StartTimeTicks, DurationTicks, EndTransitionDurationTicks) VALUES (?, ?, 'Marker one', 100, 50, 5)",
        [ids.marker, ids.item]);
      database.run("INSERT INTO PlaylistItemMarkerBibleVerseMap (PlaylistItemMarkerId, VerseId) VALUES (?, 1001001)", [ids.marker]);
      database.run("INSERT INTO PlaylistItemMarkerParagraphMap (PlaylistItemMarkerId, MepsDocumentId, ParagraphIndex, MarkerIndexWithinParagraph) VALUES (?, 900001, 2, 1)", [ids.marker]);
      if (!playlist.omitTag) {
        database.run("INSERT INTO Tag (TagId, Type, Name) VALUES (?, 2, 'Playlist tag')", [2 + idOffset]);
        database.run("INSERT INTO TagMap (TagMapId, PlaylistItemId, LocationId, NoteId, TagId, Position) VALUES (?, ?, NULL, NULL, ?, 4)", [ids.item + 10, ids.item, 2 + idOffset]);
      }
      if (playlist.duplicate) {
        database.run(`INSERT INTO PlaylistItem (PlaylistItemId, Label, StartTrimOffsetTicks, EndTrimOffsetTicks, Accuracy, EndAction, ThumbnailFilePath)
          VALUES (?, 'Shared label', 10, 20, ?, 0, NULL)`, [ids.item + 1, ids.accuracy]);
        database.run("INSERT INTO PlaylistItemIndependentMediaMap (PlaylistItemId, IndependentMediaId, DurationTicks) VALUES (?, ?, ?)",
          [ids.item + 1, ids.media, playlist.durationTicks ?? 1000]);
        database.run("INSERT INTO PlaylistItemLocationMap (PlaylistItemId, LocationId, MajorMultimediaType, BaseDurationTicks) VALUES (?, ?, 0, 1000)",
          [ids.item + 1, baseLocationId]);
        database.run("INSERT INTO PlaylistItemMarker (PlaylistItemMarkerId, PlaylistItemId, Label, StartTimeTicks, DurationTicks, EndTransitionDurationTicks) VALUES (?, ?, 'Marker one', 100, 50, 5)",
          [ids.marker + 1, ids.item + 1]);
        database.run("INSERT INTO PlaylistItemMarkerBibleVerseMap (PlaylistItemMarkerId, VerseId) VALUES (?, 1001001)", [ids.marker + 1]);
        database.run("INSERT INTO PlaylistItemMarkerParagraphMap (PlaylistItemMarkerId, MepsDocumentId, ParagraphIndex, MarkerIndexWithinParagraph) VALUES (?, 900001, 2, 1)", [ids.marker + 1]);
      }
    }

    insertNote(database, {
      noteId: 1 + idOffset,
      guid: ids.baseNote,
      title: publicationConflictSet ? "First publication note" : "Synthetic note",
      content: publicationConflictSet ? `First publication edit from source ${conflictSource}.` : noteContent,
      created: "2026-10-01T09:00:00Z",
      lastModified: noteLastModified,
      locationId: baseLocationId,
    });

    if (publicationConflictSet) {
      insertNote(database, {
        noteId: 2 + idOffset,
        guid: ids.secondConflictNote,
        title: "Second publication note",
        content: `Second publication edit from source ${conflictSource}.`,
        created: "2026-10-02T09:00:00Z",
        lastModified: noteLastModified,
        locationId: baseLocationId + 2,
      });
      insertNote(database, {
        noteId: 3 + idOffset,
        guid: ids.otherPublicationNote,
        title: "Other publication note",
        content: `Other publication edit from source ${conflictSource}.`,
        created: "2026-10-03T09:00:00Z",
        lastModified: noteLastModified,
        locationId: baseLocationId + 1,
      });
    }

    database.run(
      `INSERT INTO UserMark
        (UserMarkId, ColorIndex, LocationId, StyleIndex, UserMarkGuid, Version)
        VALUES (?, 1, ?, 1, ?, 1)`,
      [1 + idOffset, baseLocationId, ids.firstMark],
    );
    database.run(
      `INSERT INTO BlockRange
        (BlockRangeId, BlockType, Identifier, StartToken, EndToken, UserMarkId)
        VALUES (?, 1, 10, 0, 4, ?)`, [1 + idOffset, 1 + idOffset],
    );

    database.run("INSERT INTO Tag (TagId, Type, Name) VALUES (?, 1, 'Synthetic tag')", [1 + idOffset]);
    database.run(
      `INSERT INTO TagMap
        (TagMapId, PlaylistItemId, LocationId, NoteId, TagId, Position)
        VALUES (?, NULL, NULL, ?, ?, 0)`, [1 + idOffset, 1 + idOffset, 1 + idOffset],
    );
    database.run(
      `INSERT INTO Bookmark
        (BookmarkId, LocationId, PublicationLocationId, Slot, Title, Snippet, BlockType, BlockIdentifier)
        VALUES (?, ?, ?, 0, 'Synthetic bookmark', 'Generated fixture', 0, NULL)`,
      [1 + idOffset, baseLocationId, baseLocationId],
    );
    database.run(
      "INSERT INTO InputField (LocationId, TextTag, Value) VALUES (?, 'tt20', 'Synthetic value')",
      [baseLocationId],
    );

    if (addNote) {
      insertNote(database, {
        noteId: (publicationConflictSet ? 4 : 2) + idOffset,
        guid: ids.addedNote,
        title: "Added synthetic note",
        content: "This note exists only in the added-note fixture.",
        created: "2026-10-11T08:00:00Z",
        lastModified: "2026-10-11T08:00:00Z",
        locationId: baseLocationId,
      });
    }

    if (addMarkAndRanges) {
      database.run(
        `INSERT INTO UserMark
          (UserMarkId, ColorIndex, LocationId, StyleIndex, UserMarkGuid, Version)
          VALUES (?, 2, ?, 1, ?, 1)`,
        [2 + idOffset, baseLocationId, ids.addedMark],
      );
      database.run(
        `INSERT INTO BlockRange
          (BlockRangeId, BlockType, Identifier, StartToken, EndToken, UserMarkId)
          VALUES (?, 1, 20, 0, 2, ?), (?, 1, 20, 3, 5, ?), (?, 2, 21, 0, 1, ?)`,
        [2 + idOffset, 2 + idOffset, 3 + idOffset, 2 + idOffset, 4 + idOffset, 2 + idOffset],
      );
      database.run(
        "INSERT INTO InputField (LocationId, TextTag, Value) VALUES (?, 'tt21', 'Additional synthetic value')",
        [baseLocationId],
      );
    }

    if (includeUncertainPlaylist) {
      database.run("INSERT INTO PlaylistItemAccuracy (PlaylistItemAccuracyId, Description) VALUES (?, 'Default')", [1 + idOffset]);
      database.run(
        `INSERT INTO PlaylistItem (PlaylistItemId, Label, Accuracy, EndAction)
          VALUES (?, ?, ?, 0)`,
        [1 + idOffset, `Uncertain playlist identity from source ${conflictSource}`, 1 + idOffset],
      );
      database.run("INSERT INTO PlaylistItemLocationMap (PlaylistItemId, LocationId, MajorMultimediaType) VALUES (?, ?, 0)", [1 + idOffset, baseLocationId]);
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
  extraFiles = {},
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
  for (const [path, contents] of Object.entries(extraFiles)) archive.file(path, contents, options);

  const bytes = await archive.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  await writeFile(join(fixtureDirectory, filename), bytes);
}

const baseDatabase = createDatabase();
const differentLocalIdsDatabase = createDatabase({ baseLocationId: 99 });
const addedNoteDatabase = createDatabase({ addNote: true, baseLocationId: 99 });
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
const playlistDatabaseA = createDatabase({ playlist: { itemId: 10, mediaId: 10, markerId: 10 } });
const playlistDatabaseB = createDatabase({ playlist: { itemId: 80, mediaId: 80, markerId: 80, accuracyId: 91 } });
const playlistDifferentMediaA = createDatabase({ playlist: { itemId: 10, mediaId: 10, markerId: 10, mediaPath: "media-a.bin" } });
const playlistDifferentMediaB = createDatabase({ playlist: { itemId: 80, mediaId: 80, markerId: 80, accuracyId: 91, mediaPath: "media-b.bin" } });
const playlistDifferentDuration = createDatabase({ playlist: { itemId: 80, mediaId: 80, markerId: 80, accuracyId: 91, durationTicks: 2000 } });
const playlistDuplicate = createDatabase({ playlist: { itemId: 10, mediaId: 10, markerId: 10, omitTag: true, duplicate: true } });
const playlistSingle = createDatabase({ playlist: { itemId: 80, mediaId: 80, markerId: 80, accuracyId: 91, omitTag: true } });
const playlistDifferentChoice = createDatabase({ playlist: { itemId: 10, mediaId: 10, markerId: 10, omitTag: true } });
const playlistMedia = new TextEncoder().encode("synthetic media bytes; not playable content");
function createSyntheticLoadPayload(byteLength) {
  const bytes = new Uint8Array(byteLength);
  let state = 0x6d2b79f5;
  for (let index = 0; index < bytes.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
}
const syntheticLoadPayload = createSyntheticLoadPayload(2_990_000);
const populatedFlowA = createDatabase({
  publicationConflictSet: true,
  includeUncertainPlaylist: false,
  playlist: { itemId: 10, mediaId: 10, markerId: 10 },
  conflictSource: "A",
  databaseLastModified: "2026-10-11T11:00:00Z",
  noteLastModified: "2026-10-11T11:00:00Z",
});
const populatedFlowB = createDatabase({
  publicationConflictSet: true,
  includeUncertainPlaylist: false,
  baseLocationId: 101,
  idOffset: 100,
  playlist: { itemId: 80, mediaId: 80, markerId: 80, accuracyId: 91 },
  addNote: true,
  addMarkAndRanges: true,
  conflictSource: "B",
  databaseLastModified: "2026-10-11T12:00:00Z",
  noteLastModified: "2026-10-11T12:00:00Z",
});

await writeArchive("identical-a.jwlibrary", { databaseBytes: baseDatabase });
await writeArchive("identical-b.jwlibrary", { databaseBytes: differentLocalIdsDatabase });
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
await writeArchive("playlist-a.jwlibrary", { databaseBytes: playlistDatabaseA, extraFiles: { "playlist-media.bin": playlistMedia } });
await writeArchive("playlist-b.jwlibrary", { databaseBytes: playlistDatabaseB, extraFiles: { "playlist-media.bin": playlistMedia } });
await writeArchive("playlist-different-media-a.jwlibrary", { databaseBytes: playlistDifferentMediaA, extraFiles: { "media-a.bin": playlistMedia } });
await writeArchive("playlist-different-media-b.jwlibrary", { databaseBytes: playlistDifferentMediaB, extraFiles: { "media-b.bin": playlistMedia } });
await writeArchive("playlist-different-duration.jwlibrary", { databaseBytes: playlistDifferentDuration, extraFiles: { "playlist-media.bin": playlistMedia } });
await writeArchive("playlist-different-bytes.jwlibrary", { databaseBytes: playlistDatabaseB, extraFiles: { "playlist-media.bin": new TextEncoder().encode("different bytes with same synthetic hash") } });
await writeArchive("playlist-missing-media.jwlibrary", { databaseBytes: playlistDatabaseB });
await writeArchive("playlist-duplicate-a.jwlibrary", { databaseBytes: playlistDuplicate, extraFiles: { "playlist-media.bin": playlistMedia } });
await writeArchive("playlist-single-b.jwlibrary", { databaseBytes: playlistSingle, extraFiles: { "playlist-media.bin": playlistMedia } });
await writeArchive("playlist-different-choice-a.jwlibrary", { databaseBytes: playlistDifferentChoice, extraFiles: { "playlist-media.bin": playlistMedia } });
await writeArchive("populated-flow-a.jwlibrary", { databaseBytes: populatedFlowA, manifest: makeManifest("2026-10-11T11:00:00Z"), extraFiles: { "playlist-media.bin": playlistMedia } });
await writeArchive("populated-flow-b.jwlibrary", { databaseBytes: populatedFlowB, manifest: makeManifest("2026-10-11T12:00:00Z"), extraFiles: { "playlist-media.bin": playlistMedia } });
await writeArchive("large-merge-a.jwlibrary", { databaseBytes: baseDatabase, extraFiles: { "synthetic-load.bin": syntheticLoadPayload } });
await writeArchive("large-merge-b.jwlibrary", { databaseBytes: differentLocalIdsDatabase, extraFiles: { "synthetic-load.bin": syntheticLoadPayload } });
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
