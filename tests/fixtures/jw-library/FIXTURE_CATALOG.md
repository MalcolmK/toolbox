# Synthetic JW Library fixtures

Every record and text in this folder is synthetic. These fixtures do not
contain records copied from personal backups. The schema-only SQL file contains
table, index, and constraint declarations, but no user rows.

Regenerate the archives from the repository root with:

```sh
npm run fixtures:jw-library
```

The generated `.jwlibrary` files are small ZIP containers intended for parser,
comparison, and merger development. Their manifest hash is a placeholder, so
the fixtures are not claimed to be importable by JW Library.

| Fixture | Intended scenario |
| --- | --- |
| `identical-a.jwlibrary` + `identical-b.jwlibrary` | Byte-identical pair; no changes expected. |
| `base.jwlibrary` | Common synthetic starting state. |
| `new-note.jwlibrary` | One new note relative to the base. |
| `modified-note-newer.jwlibrary` | Existing note content changed with a later note and database timestamp. |
| `conflict-source-a.jwlibrary` + `conflict-source-b.jwlibrary` | Same note independently represented with different contents and timestamps. |
| `mark-and-ranges-added.jwlibrary` | One additional mark, three related block ranges, and one extra input field. |
| `missing-manifest.jwlibrary` | ZIP without `manifest.json`. |
| `invalid-manifest.jwlibrary` | ZIP with malformed manifest JSON. |
| `missing-database.jwlibrary` | ZIP with manifest but no database entry. |
| `unsupported-schema-version.jwlibrary` | Valid synthetic archive declaring an unsupported schema version. |
| `corrupt-database.jwlibrary` | Valid ZIP and manifest with non-SQLite database bytes. |
| `manifest-valid-v16.json` + `manifest-invalid.json` | Standalone valid and malformed JSON inputs. |

## Expected row counts for readable schema-version-16 fixtures

The baseline counts apply to `base`, `identical-a`, `identical-b`,
`modified-note-newer`, and both `conflict-source` fixtures. The changed counts
below override the baseline for the named fixture. Counts for every table,
including empty playlist/media tables and `grdb_migrations`, are asserted by
`tests/unit/jw-library-merger/readUserData.test.ts`.

| Table | Baseline | `new-note` | `mark-and-ranges-added` |
| --- | ---: | ---: | ---: |
| `BlockRange` | 1 | 1 | 4 |
| `Bookmark` | 1 | 1 | 1 |
| `IndependentMedia` | 0 | 0 | 0 |
| `InputField` | 1 | 1 | 2 |
| `LastModified` | 1 | 1 | 1 |
| `Location` | 1 | 1 | 1 |
| `Note` | 1 | 2 | 1 |
| `PlaylistItem` | 0 | 0 | 0 |
| `PlaylistItemAccuracy` | 0 | 0 | 0 |
| `PlaylistItemIndependentMediaMap` | 0 | 0 | 0 |
| `PlaylistItemLocationMap` | 0 | 0 | 0 |
| `PlaylistItemMarker` | 0 | 0 | 0 |
| `PlaylistItemMarkerBibleVerseMap` | 0 | 0 | 0 |
| `PlaylistItemMarkerParagraphMap` | 0 | 0 | 0 |
| `Tag` | 1 | 1 | 1 |
| `TagMap` | 1 | 1 | 1 |
| `UserMark` | 1 | 1 | 2 |
| `grdb_migrations` | 1 | 1 | 1 |

`generate-fixtures.mjs` is the source of truth for synthetic records and
archive contents. It uses the dependency packages already installed by the
app and overwrites only files in this fixture directory when explicitly run.
