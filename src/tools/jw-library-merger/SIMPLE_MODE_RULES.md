# Simple mode merge rules

This document defines the automatic policy implemented by `merge/simpleMerge.ts`. The planner and its browser workflow compare validated snapshots and prepare source-attributed choices; they do not mutate or rewrite either input. A separate database builder turns a fully resolved Simple mode plan into SQLite bytes after integrity checks, and the local archive/download flow is connected. The production flow currently stops at the fail-closed manifest gate because JW Library's hash rule is unverified. The goal is to retain as much information as possible while choosing the newest version when recency can be established. Every choice that omits a distinct value must be described in the result report.

## 1. Preconditions and source order

1. Both archives must pass archive and database validation, use a supported schema, and be readable as complete snapshots. If these preconditions fail, do not create a merged archive.
2. Label the selected input files **Back-up A** and **Back-up B** in the order the user selects them. These labels identify provenance only; they do not mean older and newer.
3. Never infer recency from filenames, filesystem modification times, integer row IDs, archive entry order, or row order.
4. Compare timestamp instants after normalization. Keep each original timestamp string for provenance and reporting. Missing, invalid, or timezone-free values are unknown.

## 2. Record identity and baseline decisions

Apply the record-identity policy in `compare/RECORD_IDENTITY.md` before merging any rows.

| Comparison result | Simple mode action | Report wording |
| --- | --- | --- |
| Equal with a stable identity | Copy one logical record into the result. | “Ongewijzigd; één keer behouden.” |
| Stable record only in A | Retain it. Do not treat its absence in B as deletion. | “Alleen in back-up A; behouden. Verwijdering is niet vast te stellen.” |
| Stable record only in B | Retain it. Do not treat its absence in A as deletion. | “Alleen in back-up B; behouden. Verwijdering is niet vast te stellen.” |
| Candidate or uncertain identity | Do not collapse it with another record on the strength of matching local IDs or an unverified key. Retain distinguishable source data where schema constraints permit; otherwise stop that merge group for review. | Identify the records and explain which identity or relationship could not be confirmed. |
| Duplicate supposedly stable identity in either input | Do not arbitrarily select one duplicate. Stop the affected group and report all rows involved. | “Dubbele identiteit; automatische samenvoeging overgeslagen.” |

A record found on only one side is not evidence of deliberate deletion. With two backups and no common ancestor, Simple mode retains it. This can restore a record that a user intentionally deleted from the other backup; the comparison cannot distinguish that deletion from an older or incomplete backup.

## 3. Determine which source is newer

Use this order only when two versions of a record differ and the record itself has no decisive timestamp, or when the record's timestamps tie or are unknown:

1. Use the singleton `LastModified.LastModified` value as the database recency signal if it is valid in both sources. Because this is a database-level time rather than a per-record edit time, label the winner as an uncertain source-recency tie-break and show the evidence.
2. If either database timestamp is missing or invalid, use the manifest `userDataBackup.lastModifiedDate` values if both are valid.
3. Do not use `manifest.creationDate` to claim that database contents are newer. It records archive creation, which can happen without a content change.
4. If the database timestamp and manifest timestamp disagree in ordering, prefer the database table value for the tie-break, and add a warning naming both values. If the database timestamp cannot be used, apply the manifest fallback and report that fallback.
5. If the selected source-level times are equal, or neither side has a valid comparable time, recency is unresolved. Do not silently claim either source is newer. For a conflict with a safely matched publication and record identity, ask the user to choose version A or B for that publication. Keep the group unresolved and withhold the download if its identity or publication relationship cannot be established safely. The report must retain both values and explain why no automatic winner was selected.

This fail-closed rule is necessary because choosing A or B by screen order would discard information without evidence that the selected value is newer. It also preserves the requirement that Simple mode prioritizes the newest information whenever “newest” can be established.

## 4. Resolve a changed record

1. For a stable record with two valid, unequal record-level `LastModified` instants, retain the complete row from the later instant. Do not combine fields from two versions of that row unless a later, separately reviewed rule proves those fields can safely coexist.
2. If record-level timestamps are equal, missing, invalid, or unavailable, use the source recency order from section 3.
3. A newer valid timestamp on one side and an unknown timestamp on the other is not by itself proof that the known-timestamp value is newer. Use the source recency order; if that is unresolved, leave the group unresolved.
4. For `Note`, retain the `Created` value from the selected content version when both values represent the same instant. If both valid `Created` values differ, preserve the earliest valid instant as the likely original creation time, keep its exact source text, and report the other value as not retained. If only one `Created` value is valid, retain it and report the unknown counterpart. If neither is valid, retain the raw `Created` value from the selected content version and mark creation time unknown.
5. For `Note`, the selected content version's `LastModified` value travels with its `Title` and `Content`; do not replace it with the merge time or the database-wide timestamp.
6. For a non-Note row without a record-level change timestamp, select the whole row from the newer source when one can be established. Do not present database recency as a precise edit time for that row.

Every distinct field value omitted by these rules is a reportable information loss, even if the winning row remains otherwise intact. The report must identify the record, field, kept value/source, omitted value/source, and the rule that selected it. Binary values must be described by source and size until their safe comparison and display rules are established.

## 5. Retain additions and combine independent records

1. Retain stable-identity records that exist in only one input, subject to valid parent relationships and schema constraints.
2. Keep separate logical records from both sources when they can coexist, such as independently identified notes, marks, tags, or media items.
3. Keep associated rows as connected groups. Examples include a `UserMark` with its `BlockRange` rows, and a `Tag` with its `TagMap` rows. Do not keep a dependent row if its parent was not retained or its relationship cannot be rebuilt safely.
4. Rebuild all source-local row IDs and foreign-key links from per-source old-ID-to-output-ID maps. Never copy an A-side or B-side integer ID as though it were globally meaningful.
5. Respect unique constraints and ordering fields. A collision in `Tag(Type, Name)`, a bookmark slot, an input-field key, or a map position is not permission to silently discard or renumber a value. Merge the records only where the exact unique constraint and relationship semantics allow it; otherwise stop that group and report the collision.
6. Unknown tables, unknown columns, schema objects, and archive entries are preservation concerns. Do not claim a complete information-preserving merge until their copy/union behavior and constraints have been tested. Preserve archive entries that do not need rewriting; report any entry or database object that cannot safely be carried forward.

At this stage, independent fields inside the same row are not declared safe for automatic field-by-field combination. A two-source diff cannot tell which side changed each value from a shared base. Such a combination requires a base snapshot or an explicit future policy.

## 6. Connected data, tags, and relationships

- Treat `UserMark` and its ranges as a connected group. Match marks by `UserMarkGuid`; treat range composite identities as candidates until independently validated. If a range cannot be linked confidently, retain its source details for review rather than attaching it to a coincidentally matching local `UserMarkId`.
- Treat tags and tag mappings as separate records. Reuse a tag only when its reviewed natural key matches and schema uniqueness agrees. Retain each mapping only when its target owner and tag resolve to the output identities.
- Preserve bookmarks, input fields, media, and playlist-related rows only after their logical identity and all required target relationships can be resolved. Playlist identities currently lack a safe cross-backup key, so those conflicting or ambiguous groups cannot be automatically collapsed.
- Never export a dangling foreign key to preserve a child row. If preserving a connected group safely is impossible, report the affected parent and dependent rows and withhold the final result for that group.

## 7. What the merge report must say

For every non-equal record or unresolved group, include:

- the source file and user-facing record name;
- the classification and exact rule applied;
- the kept value and its source, if a value was selected;
- every distinct value that was not retained, its source, and the reason;
- original and normalized timestamps used in the decision, with an explicit unknown marker where parsing failed or a time was absent;
- relationship and identity uncertainty, including affected dependents;
- whether the result can be downloaded or is withheld pending review.

Equal records copied once and one-sided records retained are not information loss. A conflicting value omitted from the output, an unresolved group excluded from the output, or an archive/schema object not preserved is information loss or incomplete output and must be called out explicitly. The report must not claim “no data loss” merely because SQLite constraints pass.

## 8. Synthetic acceptance matrix for Step 14

Each case below maps to the numbered rules above. These cases use only the repository's synthetic fixture generator and fixtures.

| Test case | Expected Simple mode result | Rule |
| --- | --- | --- |
| `identical-a.jwlibrary` + `identical-b.jwlibrary` | Copy stable equal records once; report candidate/uncertain records without pretending they are confirmed matches. | 2, 5 |
| `base.jwlibrary` + `new-note.jwlibrary` | Retain the existing note and the one-sided added note. | 2, 5.1 |
| `base.jwlibrary` + `modified-note-newer.jwlibrary` | Keep the later valid note version as a whole; retain the chosen version's `Created` and `LastModified` provenance. | 3, 4.1, 4.4–4.5 |
| `conflict-source-a.jwlibrary` + `conflict-source-b.jwlibrary` | Use valid per-note modification times to choose the later content; report the other content value as omitted and identify the time evidence. | 4.1, 7 |
| Differing note content with equal or unavailable note times but clearly ordered database `LastModified` values | Use the newer database as the fallback; explicitly label the choice as an uncertain source-recency tie-break, not a note edit time. | 3.1–3.2, 4.2, 4.6 |
| Different note timestamp strings representing instants in different timezone offsets | Compare normalized instants, select the later instant even if its written local clock appears earlier, and retain the original chosen timestamp. | 1.4, 4.1 |
| Equal note timestamp instants with ordered database `LastModified` values | Fall back to database recency and label its lower confidence. | 3.1, 4.2 |
| Unusable database times with ordered manifest `userDataBackup.lastModifiedDate` values | Use manifest database time, identify the fallback in the warning and report. | 3.2, 3.4 |
| Differing note content with unresolved note and database recency | Ask the user to choose A or B for that publication; keep both values visible during review and withhold download until every eligible publication conflict is resolved. | 3.5, 7 |
| `base.jwlibrary` + `mark-and-ranges-added.jwlibrary` | Keep the new stable mark; retain or withhold each range/input field only with its required links; flag candidate identities and any omitted dependent row. | 2, 5.1–5.5, 6 |
| Matching natural-key tags that still have candidate identity, or a tag mapping with different positions | Retain source alternatives, do not collapse the candidate or drop either mapping, and require review. | 2, 5.5, 6 |
| Malformed foreign key in an in-memory planner input | Retain the affected source rows for review and prevent a final result; normal validated archive input should be rejected before reaching this planner case. | 2, 5.3, 6 |
| Duplicate stable identity, unique-key collision, missing parent, or unsupported unknown-table behavior | Do not silently choose or drop rows; withhold the affected output group and report the collision/uncertainty. | 2, 5.3–5.6, 6, 7 |

The `simpleMerge.test.ts` suite covers the timezone, equal-time fallback, manifest fallback, candidate tag, tag-map, duplicate stable identity, linked mark/range, and malformed-link cases above. The malformed-link case directly exercises the pure planner with a deliberately altered in-memory snapshot; it does not bypass archive validation in the product flow. `database/buildMergedDatabase.ts` checks schema agreement, plan coverage, ID/reference remapping, SQLite constraints, integrity, and foreign keys before returning database bytes. The ZIP writer and browser download gate are implemented and covered with synthetic tests. The separate POC path allows a `.jwlibrary` download for a ready plan with a copied, explicitly unverified hash; the production manifest/hash route remains disabled. Synthetic writer acceptance does not prove that JW Library accepts the output.

## 9. In-memory result contract

`merge/simpleMerge.ts` is a pure planning operation over two already-read snapshots. It returns source-attributed logical rows, per-field source provenance for preserved `Created` values, unresolved alternatives, timestamp evidence, choice reasons, and omitted field values. Source-local row IDs are retained only inside their source-tagged candidate rows so later database construction can remap them correctly. `ready` means record-level decisions are resolved; it does not mean a SQLite database or `.jwlibrary` archive exists. `needs-review` keeps unresolved source alternatives in memory but prevents them from being presented as a final merged dataset. The function performs no file I/O, database mutation, UI work, or download.
