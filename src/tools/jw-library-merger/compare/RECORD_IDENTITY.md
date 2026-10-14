# Record identity policy — schema version 16

Identity answers only “are these rows likely the same logical record across
two backups?” It does not choose which contents to keep or approve a merge.
Integer primary keys are always source-local unless a row has a separately
documented cross-backup key. `stable` keys can pair rows; `candidate` keys may
be used to display a possible match but must remain visibly uncertain in a
comparison; `uncertain` rows must not be paired automatically.

| Table | Cross-backup identity | Status and limits |
| --- | --- | --- |
| `Note` | `Guid` | Stable unique logical identifier. `NoteId` is local only. |
| `UserMark` | `UserMarkGuid` | Stable unique logical identifier. `UserMarkId` is local only. |
| `BlockRange` | Parent `UserMarkGuid` + block type, identifier, start, end | Candidate. Duplicate coordinates under one mark make the row uncertain. |
| `Location` | `BookNumber` + `ChapterNumber` + `KeySymbol` + `MepsLanguage` + `Type` | Candidate only when all key parts exist and the tuple is unique in that source. Otherwise uncertain. |
| `InputField` | Logical `Location` + `TextTag` | Candidate only when the referenced location has a complete candidate key. |
| `Bookmark` | Logical `PublicationLocation` + `Slot` | Candidate only when the referenced location has a complete candidate key. |
| `Tag` | `Type` + `Name` | Candidate based on the declared unique constraint; semantic stability is not independently verified. |
| `TagMap` | Logical target + logical `Tag` | Candidate for note/location targets with resolvable identities. Playlist targets remain uncertain. Position is not part of note/location identity. |
| `IndependentMedia` | `FilePath` | Candidate; paths may change between backups. |
| `PlaylistItemAccuracy` | `Description` | Candidate based on the declared unique constraint. |
| `LastModified` | Singleton row | Stable metadata identity only when the source has exactly one row; timestamps are values, not identity. |
| `grdb_migrations` | `identifier` | Stable declared primary key. |
| `PlaylistItem` | None established | Uncertain; `PlaylistItemId` is source-local and other fields are not a verified identity. |
| `PlaylistItemIndependentMediaMap` | Parent playlist item + media | Uncertain because the playlist item identity is not established. |
| `PlaylistItemLocationMap` | Parent playlist item + location | Uncertain because the playlist item identity is not established. |
| `PlaylistItemMarker` | Parent playlist item + start time | Uncertain because the playlist item identity is not established. |
| `PlaylistItemMarkerBibleVerseMap` | Parent marker + verse | Uncertain because the parent marker identity is not established. |
| `PlaylistItemMarkerParagraphMap` | Parent marker + paragraph coordinates | Uncertain because the parent marker identity is not established. |

## Interpretation and safeguards

- A stable identity pairs rows for comparison; it does not select a winner.
- Candidate identities retain a key and the reason for the candidate, but
  `canMatchAcrossBackups` stays false. Step 10 must report them for review or
  explicitly carry their uncertainty into the difference result.
- `localKey` exists only to follow references inside the same source database.
  It must never be compared across backups.
- If a required identity field is null, empty, binary, duplicated, or cannot be
  resolved through its parent, return `uncertain` with no cross-backup key.
- `Note.Guid` and `UserMark.UserMarkGuid` are treated as strong identifiers
  because they are unique logical GUID fields and match the inspected records.
  Their behavior across all JW Library versions, restore paths, and devices is
  not proven; extend validation before claiming a universal guarantee.

`compare/recordIdentity.ts` implements these rules. A table-coverage test fails
if a supported schema table has no explicit policy.
