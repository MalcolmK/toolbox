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
| `Location` | Current merge planner: `BookNumber` + `ChapterNumber` + `KeySymbol` + `MepsLanguage` + `Type`; pure descriptor: all ten fields below | The planner still labels the current tuple as a candidate. The descriptor produces a full key but does not confirm cross-backup identity. Explicit session confirmation is still required before dependent rows can use a proposed link. |
| `InputField` | Logical `Location` + `TextTag` | Candidate only when the referenced location has a complete candidate key. |
| `Bookmark` | Logical `PublicationLocation` + `Slot` | Candidate only when the referenced location has a complete candidate key. |
| `Tag` | `Type` + `Name` | Candidate based on the declared unique constraint; semantic stability is not independently verified. |
| `TagMap` | Confirmed owner + logical `Tag` | Stable only when its owner is resolved; playlist maps require a confirmed/separate playlist identity. Position remains content. |
| `IndependentMedia` | Playlist-reference media path + metadata + actual bytes | Stable only for uniquely referenced playlist media with matching metadata and byte-identical payload; otherwise uncertain/candidate. |
| `PlaylistItemAccuracy` | `Description` | Stable when the description is unique in each source. |
| `LastModified` | Singleton row | Stable metadata identity only when the source has exactly one row; timestamps are values, not identity. |
| `grdb_migrations` | `identifier` | Stable declared primary key. |
| `PlaylistItem` | Full confirmed playlist structure | Uncertain until explicit session choice; a different decision or safe separate choice gives source-specific identities. |
| `PlaylistItemIndependentMediaMap` | Confirmed playlist + byte-confirmed media | Stable only when both parent identities are stable; duration remains content. |
| `PlaylistItemLocationMap` | Confirmed playlist + confirmed logical location + media type | Stable only when both parent identities are stable; duration remains content. |
| `PlaylistItemMarker` | Confirmed playlist + `StartTimeTicks` | Stable only under a confirmed playlist; marker label/duration remain content. |
| `PlaylistItemMarkerBibleVerseMap` | Confirmed playlist marker + `VerseId` | Stable only under a confirmed parent marker. |
| `PlaylistItemMarkerParagraphMap` | Confirmed playlist marker + paragraph coordinates | Stable only under a confirmed parent marker. |

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

`compare/recordIdentity.ts` and `compare/logicalRecordIdentity.ts` implement these rules. A table-coverage test fails
if a supported schema table has no explicit policy.

## 0.4.0 location and playlist confirmation scope

`compare/locationDescriptor.ts` implements the pure schema-16 description and is covered by `tests/unit/jw-library-merger/locationDescriptor.test.ts`. It describes a `Location` using `Type`, `KeySymbol`, `MepsLanguage`, `BookNumber`, `ChapterNumber`, `DocumentId`, `IssueTagNumber`, `Track`, `Specialty`, and `Edition`, in that order. It returns the recognized form, all ten original values, a JSON-array comparison key, and a reason for unsupported or invalid rows. Numeric values must be safe integers; nullable values remain nullable. Null, zero, empty text, case, whitespace, and Unicode sequences are not normalized. `LocationId` is omitted from the content key, and `Title` is treated as display metadata.

The recognized forms are Type 0 document places, Type 0 Bible chapters, Type 1 publication roots, and Type 3 media places with either a publication symbol or a document number alongside a track. Type 2 and mixed or otherwise unrecognized forms remain unsupported. `countLocationDescriptorKeys` must be called separately for each source; a full key repeated within one source is not unique. A proposed match remains unconfirmed until explicit source-row and session confirmation. Unknown forms, duplicate keys, stale confirmations, or a source row assigned to conflicting groups remain unresolved and block dependent output.

Playlist identity requires an explicit active-session choice based on the full structure, including accuracy, dependent mappings, confirmed locations, markers, media metadata, and actual bytes. Labels alone are not identity. Choices are revision-checked and separate from content A/B decisions; they are not universal identity keys across JW Library backups.

Playlist identity requires an explicit session decision based on the full playlist structure, including accuracy, dependent mappings, confirmed locations, markers, media metadata, and actual media bytes. Labels alone are not identity. A/B content choices remain separate from both location and playlist identity decisions. These confirmations are limited to the active source pair and place-resolution revision; they do not establish a universal JW Library key.

Per-snapshot lookup indexes are used for source-local foreign-key targets,
location candidate counts, and mark-range candidate counts. They avoid
re-scanning large target tables for every relationship. The indexes only
change lookup cost; they do not promote a candidate identity to a stable one
or alter merge decisions.
