# JW Library data model notes

This document records the database structure observed in the two supplied
`.jwlibrary` backups. It is an implementation guide, not a complete
specification of every JW Library schema version. Recheck it whenever a new
schema version is supported.

## 1. Container and database

A `.jwlibrary` backup is a ZIP archive. The inspected archives contain:

- `manifest.json` with archive metadata and a reference to the database;
- `userData.db`, a SQLite database;
- a default thumbnail and media files where present.

The manifest reports `schemaVersion: 16` for both inspected backups. The
database passes SQLite's integrity check. Preserve archive entries that the
merger does not interpret; do not assume the database is the only meaningful
archive content.

Observed manifest fields include `type`, `name`, `creationDate`,
`userDataBackup.schemaVersion`, `lastModifiedDate`, `deviceName`,
`databaseName`, `hash`, and `version`. The meaning and validation rule for
`hash` are not established. In the inspected pair, its value is the same even
though the database bytes differ. Do not recompute, copy, or claim to validate
this field until its format has been established against JW Library behavior.

## 2. Tables and meaning

The schema contains the following tables. Integer primary keys identify rows
inside a database; they are not assumed to identify the same logical record
across independently created databases.

| Table | Observed purpose and notable fields |
| --- | --- |
| `Note` | User notes. `Guid` is unique; `Title`, `Content`, `Created`, and `LastModified` are stored with optional `UserMarkId` and `LocationId`. `BlockType` and `BlockIdentifier` identify an optional publication block. |
| `UserMark` | User highlights/marks. Has unique `UserMarkGuid`, `ColorIndex`, `StyleIndex`, `Version`, and required `LocationId`. |
| `BlockRange` | One or more ranges belonging to a `UserMark`, with `BlockType`, `Identifier`, `StartToken`, and `EndToken`. |
| `Bookmark` | Bookmarks with `Title`, optional `Snippet`, `Slot`, `LocationId`, `PublicationLocationId`, and optional block reference. |
| `Tag` | Tags. The database enforces uniqueness of `(Type, Name)`. |
| `TagMap` | Associates a tag with exactly one of a note, location, or playlist item. `Position` and uniqueness rules affect ordering and duplicates. |
| `Location` | Publication or media location metadata, including document, book, chapter, track, language, key symbol, issue tag number, type, title, specialty, and edition. |
| `InputField` | Text values associated with a location, keyed by `(LocationId, TextTag)`. |
| `LastModified` | Database-level modification timestamp. The inspected database has one row. |
| `IndependentMedia` | Media metadata: original filename, archive path, MIME type, and hash. `FilePath` is unique. The media bytes are archive entries, not table text. |
| `PlaylistItem` | Playlist item and playback settings, including label, trim offsets, accuracy, end action, and optional thumbnail path. |
| `PlaylistItemAccuracy` | Accuracy value/description referenced by playlist items. |
| `PlaylistItemIndependentMediaMap` | Join table between playlist items and independent media, with duration. |
| `PlaylistItemLocationMap` | Join table between playlist items and locations, with multimedia type and optional duration. |
| `PlaylistItemMarker` | Timed markers within a playlist item. |
| `PlaylistItemMarkerBibleVerseMap` | Associates a playlist marker with verse IDs. |
| `PlaylistItemMarkerParagraphMap` | Associates a playlist marker with document, paragraph, and marker positions. |
| `grdb_migrations` | Database migration identifiers. Preserve these unless schema migration behavior is deliberately implemented. |

`Note.Content` is text and the inspected examples contain line breaks, heading-like
text, and special glyphs. Treat it as opaque Unicode text until the content
format is fully understood. Do not normalize line endings, strip characters,
or rebuild the content from rendered UI text during a merge.

## 3. Relationships and database constraints

The inspected schema declares these foreign-key relationships:

- `Note.UserMarkId` → `UserMark.UserMarkId` and `Note.LocationId` → `Location.LocationId`;
- `UserMark.LocationId` → `Location.LocationId`;
- `BlockRange.UserMarkId` → `UserMark.UserMarkId`;
- both `Bookmark.LocationId` and `Bookmark.PublicationLocationId` → `Location.LocationId`;
- `InputField.LocationId` → `Location.LocationId`;
- `TagMap` → exactly one of `Note`, `Location`, or `PlaylistItem`, and always → `Tag`;
- playlist tables → their referenced playlist, location, accuracy, marker, and media rows;
- `PlaylistItem.ThumbnailFilePath` → `IndependentMedia.FilePath`.

The database also declares important unique constraints. Examples include
`Note.Guid`, `UserMark.UserMarkGuid`, `Location`'s publication identity,
`Bookmark(PublicationLocationId, Slot)`, `Tag(Type, Name)`,
`InputField(LocationId, TextTag)`, and several composite playlist-map keys.
Read the actual constraints from each supported schema rather than relying on
this summary as an exhaustive list.

The inspected schema also has triggers that update the singleton
`LastModified` row when notes, marks, ranges, bookmarks, tags, tag mappings, or
media are inserted, updated, or deleted. Separate triggers reject inserting or
deleting the `LastModified` row itself. Fixture generators and future database
writers must account for those triggers; they must not assume this table can
be seeded after all schema triggers are active.

The selected browser SQLite package is documented in `DEPENDENCIES.md`. Its
selection proves only that SQLite bytes can be opened and queried in the
browser; it does not prove that rewriting a JW Library database preserves all
schema objects or metadata.

`database/validateUserData.ts` currently accepts only manifest schema version
16. Before comparison or merging, it opens the database without exporting it,
checks SQLite integrity and foreign-key consistency, checks the expected
version-16 tables and columns, and verifies that the manifest agrees with that
known structure. Unknown extra tables are not rejected or removed. Validation
failures close the database and return structured issues; accepted databases
are placed in SQLite query-only mode. This is a guard against accidental
mutation, not a claim that sql.js can safely rewrite every database object.
Support for another JW Library schema version requires inspection of a real or
otherwise authoritative schema, a reviewed expected structure, and fixtures
before that version is added to the allowlist.

`database/readUserData.ts` copies every table from an accepted database into a
typed in-memory snapshot. It records column declarations, primary keys,
foreign-key mappings, row values, and explicit indexes/triggers/views. Rows are
returned in primary-key order where a key exists, otherwise in SQLite `rowid`
order; those orders are for stable review and are not cross-database record
identities. Unknown tables and BLOB values are retained. Reading does not
modify or export the SQLite database, and the caller remains responsible for
closing its validated database connection. The snapshot can use substantial
additional memory for large libraries; size and mobile-memory limits have not
yet been measured. It also records per-table row counts and keeps the archive
creation time, manifest database-modification time, and database
`LastModified` value as separate original strings. Timestamp parsing and
comparison are intentionally deferred to the next step.

The merge implementation must therefore:

1. Identify logical records before allocating output row IDs.
2. Build an old-ID-to-output-ID map for each source database.
3. Insert referenced parent rows before dependent rows, or use a transaction
   with foreign-key checking enabled and a verified insertion order.
4. Rewrite every dependent reference through the corresponding ID map.
5. Check unique constraints, `CHECK` constraints, and foreign keys before
   export.
6. Treat a connected group such as `UserMark` + `BlockRange` + `Location` as a
   unit when deciding whether it can be kept or omitted.

Do not resolve a uniqueness collision by dropping a row silently. Report the
collision and its affected links.

## 4. Identity and matching rules still to validate

Candidate stable identities in the observed schema are `Note.Guid` and
`UserMark.UserMarkGuid`. These should be checked across more backups before
they are treated as guaranteed cross-backup identities. Natural keys and
composite uniqueness rules can help match `Tag`, `InputField`, and `Location`,
but their semantics must be verified before merging records by them.

The implemented per-table policy and confidence meanings are recorded in
`compare/RECORD_IDENTITY.md`. Strong GUID identities can pair records for
comparison; candidate natural keys are not authorized to pair automatically;
integer primary keys remain source-local. Records whose key is missing,
ambiguous, or dependent on an unresolved playlist parent stay uncertain.

Primary keys such as `NoteId`, `UserMarkId`, and `LocationId` are database row
identifiers. They are useful for following relationships within a source
database; never equate records across unrelated databases solely because these
integers match. If no reliable identity can be established, classify the
records as uncertain and require review rather than joining them.

## 5. Timestamp meanings and observed formats

Keep the following timestamps distinct:

- manifest `creationDate`: when the backup archive was created;
- manifest `userDataBackup.lastModifiedDate`: database-level modification
  metadata;
- table `LastModified.LastModified`: database-level timestamp;
- `Note.Created`: note creation time;
- `Note.LastModified`: note modification time.

Observed timestamp strings include ISO-like values with offsets, for example
`2026-10-14T11:33:03+0200`, and UTC values ending in `Z`, for example
`2026-10-14T09:33:08Z`. Parse these as instants for comparison, preserve the
original string for display and provenance, and do not compare timestamp text
lexically. An absent or invalid timestamp is unknown, not the earliest or
latest possible time.

`compare/normalizeTimestamp.ts` implements this rule for explicit `Z`,
`+HHMM`, and `+HH:MM` offsets, including fractional seconds. It returns the
original text, a validity status, comparable UTC epoch milliseconds, and a
canonical UTC display string. It does not assign the browser's local timezone
to offset-free values or normalize malformed dates. The timestamp summary
keeps archive creation, both database-level times, and each note's `Created`
and `LastModified` separate. Raw snapshot values are never overwritten.

The inspected schema does not provide equivalent per-record modification
timestamps on `Bookmark`, `UserMark`, `BlockRange`, `Tag`, or most other tables.
Do not invent them. For such records, use content comparison, linked-record
context, database-level timestamps as a clearly labelled tie-breaker, and
report uncertainty where the source cannot be determined.

## 6. Observed pair snapshot (not a format guarantee)

In the supplied schema-version-16 pair, the second backup has a later manifest
and database modification time. Comparing the databases found:

- one existing note with changed content and a later `Note.LastModified`;
- one additional `UserMark`;
- three additional `BlockRange` rows;
- one additional `InputField` row;
- no row-count differences in `Bookmark`, `Tag`, `TagMap`, or `Location`.

This is a useful comparison fixture description, not a rule that all later
backups are additive. These two files do not establish deletion behavior,
independent concurrent edits, or the meaning of every schema field.

## 7. Deletion and information-loss policy

The inspected schema exposes no general tombstone or deletion-history table.
If a logical record exists in one backup and not the other, the merger cannot
conclude from absence alone that a user deliberately deleted it. Simple mode
should favor retaining the record and report that it may have been deleted on
the other side. Advanced mode may let the user omit it, but must list that
omission in the merge report.

Every merge result must distinguish:

- included from A;
- included from B;
- combined;
- omitted by an explicit choice;
- unresolved or uncertain;
- source data that could not be retained because of an invalid or unsupported
  relationship.

No successful-result message may imply that no information was lost unless
the report supports that claim.

## 8. Unknowns to resolve before writing output

- Exact validation and generation rules for the manifest `hash` field.
- Whether every supported JW Library schema has the same tables, constraints,
  and content encodings.
- Whether `Guid` and `UserMarkGuid` remain stable through real backup/restore
  and across devices.
- How JW Library treats intentionally deleted notes, marks, tags, and media.
- Whether sql.js can preserve all database objects and archive entries needed
  for JW Library to accept a rewritten SQLite database.
- Whether merged media paths can collide and how references should be updated.

Until these are verified, unknown schema or archive conditions must fail
closed: explain the limitation and do not offer a potentially lossy output.
