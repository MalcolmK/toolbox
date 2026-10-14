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
though the bytes at the manifest-referenced database path differ. Standard
SHA-256 and SHA-256 formatted as unpadded per-byte hexadecimal do not match
that value for either file. This weighs against a direct digest of the exported
database bytes with those encodings, but does not rule out hashing normalized
SQLite content, a pre-export representation, or another input. Do not
recompute, copy, or claim to validate this field until its format has been
established against JW Library behavior.

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

- Exact validation and generation rules for the manifest `hash` field remain
  unresolved after investigation; see section 10. The manifest builder blocks
  output until this rule is verified.
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

## 9. Database build boundary (implementation step 22)

`database/buildMergedDatabase.ts` accepts two validated, read-only source
connections, their snapshots, and a fully resolved Simple mode merge plan. It
returns SQLite bytes only after a transaction succeeds. It starts from a byte
copy of source A's database so the table definitions, constraints, indexes,
triggers, views, migration table, and other SQLite metadata remain in place.
The two sources must have the same reviewed schema version and matching table,
column, foreign-key, and explicit schema-object descriptions.

Before opening the output copy, the builder checks that each source row is
represented by a selected plan row or by the same explicit logical identity.
It preallocates output primary keys, records source-local-to-output mappings,
and rewrites declared foreign keys through those mappings. Duplicate logical
identities, absent plan decisions, missing references, SQLite constraint
errors, foreign-key violations, and failed integrity checks block output.
The original connections and archive bytes are not changed. The selected
`LastModified` row is updated in place because the observed schema forbids
deleting or reinserting that singleton.

This builder produces database bytes only. It does not rewrite the manifest or
validate/calculate its hash. Archive packaging is handled separately in
section 11. Advanced review currently does not pass its in-page decisions to
this builder. A plan that still has unresolved identity or record choices is
deliberately rejected.

## 10. Manifest/hash gate (implementation step 23)

`archive/buildManifest.ts` is the manifest-output gate. It currently returns a
structured `blocked` result and no manifest object or JSON. The block is
intentional: the exact rule for `manifest.userDataBackup.hash` is not verified.
In the two inspected archives, this value stayed the same while the
manifest-referenced database bytes differed. Standard SHA-256 and its
unpadded-per-byte-hex encoding did not match either value. This is evidence
against those direct raw-database digest hypotheses, not proof that the field
is unrelated to database content: it could depend on normalized SQLite data,
a pre-export representation, or another input. Neither copying a source value
nor choosing a standard digest is safe without establishing what JW Library
computes and when.

The public third-party reports located during this step conflict. The
[`braid` project](https://github.com/drg2121/braid) says the field is not a hash
of the exported database bytes and describes a JW-specific encoding. The
[`jw-notes-sync` project](https://github.com/DipandaAser/jw-notes-sync) instead
claims it is SHA-256 of the raw database bytes. Neither is an authoritative JW
Library specification, and these claims do not establish which behavior
matches the app versions and platforms this toolbox must support. The hash
rule remains unresolved until verified against authoritative implementation
evidence or reproducible exports/restores on supported JW Library versions.

Tests require the gate to return no JSON even when source hashes are present,
equal, different, or the output database is empty. The archive writer calls
this gate and stops when its status is `blocked`; it must not write a guessed
hash or fall back to copying a source hash. The gate does not prove that a
generated manifest is consistent, so production archive download remains
blocked until the hash rule is verified.

## 11. Archive writer (implementation step 24)

`archive/writeJwLibrary.ts` creates a new ZIP from checked database bytes, a
manifest result, the two original archives, and the selected database's
`IndependentMedia.FilePath` references. The database builder supplies those
paths together with the source selected for each media row. The writer excludes
both original manifests and database entries, copies the selected required
media payloads, and retains other file entries from both source archives.

The writer deduplicates same-path entries only when their bytes are identical.
If required media at the same path differs between sources, if unrelated
entries with the same path differ, or if a required file is missing, it blocks
the package and reports the path. It does not rename media or rewrite database
references to resolve a collision. Unsafe paths are rejected, including
original ZIP names that JSZip has normalized while reading. The output uses a
new UTC-dated name (`JWLibrary-Merged-YYYY-MM-DD.jwlibrary`) and never replaces
either source.

Before returning bytes, the writer reopens the ZIP with CRC checking and
compares the embedded manifest and database bytes with the supplied values. It
also checks every database-referenced media path is present. The ZIP structure
is tested with synthetic fixtures only; this does not establish that JW
Library accepts the archive. The current `buildManifest` still always returns
`blocked` because the hash rule in section 10 remains unverified, so the
application cannot currently get a hash-verified manifest or produce this
archive. The ready-manifest case in writer unit tests is synthetic plumbing to
exercise ZIP assembly, not evidence that its test hash matches JW Library.

## 12. Download gate (implementation step 25)

`archive/buildSimpleJwLibrary.ts` reconnects the resolved Simple mode plan to
the output pipeline: it revalidates both retained source archives, builds the
SQLite database, asks the manifest builder for a verified manifest, and passes
that result to the archive writer. It closes both temporary SQLite connections
in a `finally` block. The Advanced mode review is not connected to this output
pipeline because its in-page decisions do not yet produce a resolved database
plan.

`components/ArchiveDownload.tsx` enables the standard browser download only
when the archive writer returns `ready`, which requires database, manifest,
media, ZIP generation, and round-trip checks to have passed. It creates a Blob
and temporary object URL on the user's click, names the new file from the
writer result, and displays merge counts, choices, uncertainties, and omitted
information after starting the download. Object URLs are revoked after the
download window or when the component unmounts. A new comparison or cleared
result drops the previous result state; no user data is stored in
`localStorage`.

The current manifest builder remains fail-closed, so the UI's output step
builds and checks the database, then displays the manifest-hash reason and a
disabled download button. Browser tests verify this blocked state and that no
download link is created. They cannot verify a successful browser download
until the hash rule is resolved. The browser UI flows are exercised in
Chromium and Microsoft Edge, but the successful download path remains
unreachable. Actual Safari checks and JW Library restore acceptance remain
later platform checks.

## 13. Download and failure-case tests (implementation step 26)

The automated checks are split by responsibility:

- `readJwLibrary.test.ts` covers malformed ZIPs and manifests, plus missing
  required archive entries; `validateUserData.test.ts` covers corrupt SQLite,
  unsupported schema versions, incomplete schema, and broken foreign keys.
- `simpleMerge.test.ts` checks duplicate stable identities remain unresolved;
  `buildMergedDatabase.test.ts` verifies unresolved plans cannot produce
  database bytes. These are the duplicate-identity and unresolved-decision
  safeguards before archive writing.
- `writeJwLibrary.test.ts` reopens generated output with CRC checking, compares
  the manifest/database/media bytes, and checks blocked outcomes for an
  unverified hash, malformed or inconsistent manifest, empty or unchecked
  database, missing media, conflicting media payloads, duplicate-path
  payload conflicts, and unsafe paths. A ready result is possible in this
  isolated writer test only with a clearly synthetic manifest marked verified;
  it is not evidence that the production JW hash rule is verified.
- `simple-merge-workflow.e2e.ts` runs the browser build stage and checks that
  the production hash block leaves the download button disabled, creates no
  download link, and sends no request body.

The current manifest builder always fails closed, so malformed-manifest and
valid-output writer branches that require a verified manifest are tested with
synthetic writer inputs. No production download can pass until the actual hash
rule is established. The Playwright UI flows have been run in Chromium and
Microsoft Edge. Playwright WebKit is not installed in this environment, and
actual Safari and successful download behavior remain unverified platform
checks, along with JW Library restore acceptance.

## 14. Full browser workflow (implementation step 27)

`tests/e2e/simple-merge-workflow.e2e.ts` covers synthetic file selection,
Simple mode comparison, Advanced two- and three-way review, timestamp and
conflict display, changing a choice after navigating back, block/line text
decisions, invalid-file feedback, the guarded build/download stage, keyboard
file selection, theme controls, and responsive layouts at 375, 768, and 1440
pixels. The suite has six end-to-end tests and passed in both installed
Chromium and Microsoft Edge.

The build/download flow test verifies the current expected stop: the
unverified production hash keeps the download disabled, creates no download
link, and sends no request body. It cannot verify an actual successful
download. Playwright WebKit and Apple Safari were unavailable for this run;
real Safari behavior and JW Library restore acceptance remain unverified.
## 15. JW Library restore acceptance (implementation step 28)

This step remains a required release gate. It cannot be run yet: the
production manifest builder in step 23 returns `blocked` for every candidate
because the JW Library hash rule has not been established. The browser can
therefore produce no production-valid merged `.jwlibrary` file to open in the
app. A synthetic writer test manifest with `hashVerified: true` is deliberately
isolated test plumbing and must not be passed off as a valid JW Library test
backup.

The current Windows environment also has no detected JW Library AppX package
or Android Debug Bridge, and no iOS/iPadOS device is connected through this
workspace. No personal backup was used for this step. No claim is made that a
merged archive has been accepted by JW Library or that all data survives a
restore.

Once step 23 is verified and a disposable test environment is available, run
this acceptance sequence using only synthetic content:

1. Create and keep a separate original synthetic `.jwlibrary` fixture with a
   note, a mark, a range, and a tag/tag-map relationship. Record the expected
   rows and values before merging.
2. Make two synthetic candidate backups with known, distinct changes, merge
   them through the production flow, and require all database, manifest, ZIP,
   CRC, and referenced-media checks to pass. Confirm the downloaded filename
   ends in `.jwlibrary`.
3. Open the merged file in a disposable JW Library test profile or device,
   without replacing a personal library. Record whether the app accepts it and
   whether the expected note, mark, range, and tag relationship are present.
4. Close and reopen the test library, check the same content again, and compare
   the resulting data with the recorded expectation. Record any rejection,
   missing value, changed relationship, or unopenable backup as a failed gate.
5. Preserve the synthetic input fixtures, expected-value record, app/platform
   version, observed outcome, and any safely redacted diagnostics as test
   evidence. Do not place personal `.jwlibrary` files in the repository.

**Current outcome:** blocked before archive creation by the unresolved hash
rule; app acceptance and round-trip data retention are not verified. Do not
enable a production download or mark step 28 complete until this sequence
passes.
