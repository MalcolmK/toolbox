# Library comparison policy

`compareLibraries` compares two validated, in-memory snapshots and produces a review report. It does not modify either source, merge rows, or choose a winner. It assumes snapshots were validated before reading and does not attempt to infer which backup is newer from filenames.

## Result categories

- `equal`: the record has a confirmed stable identity and no compared content or relationship changes.
- `only-in-a` / `only-in-b`: a record with stable identity is present on one side only. Absence is reported as `unknown`; it is not interpreted as a deliberate deletion.
- `changed`: a matched record has a non-conflicting field change.
- `possible-conflict`: a matched record has changes in fields whose concurrent edits can conflict, or a confirmed relationship change. Without a common ancestor this is not a proven concurrent conflict.
- `uncertain-linked`: a match or linked relationship depends on a candidate identity, an unresolved relationship, duplicate keys, or a record with no safe cross-backup identity.

The report retains source rows and raw differing values. Source-local integer primary keys and foreign-key values are not compared as content. Relationships are followed inside each snapshot and compared by target logical identities. Ambiguous rows do not get fabricated field-by-field pairings.

## Timestamp handling

The comparison includes the normalized timestamp summary for each source, preserving source text and exposing normalized UTC values where timezone interpretation is safe. Note `Created` and `LastModified` values are compared as instants when both parse successfully; the original source values remain in the row and difference report. Archive creation, manifest database modification, database `LastModified`, and note timestamps remain separate sources of information.

## Related records

`UserMark` records are matched by `UserMarkGuid`. `BlockRange` candidate identities include the parent mark GUID and range coordinates; ranges are still labeled uncertain because the composite has not been validated as a globally unique JW Library identity. `Tag` records use a review-only natural key, and `TagMap` records are compared separately from their tags and owners. Input fields and bookmarks with incomplete location keys remain uncertain-linked rather than being matched through coincidentally equal local IDs.

## Known limitation

The current schema snapshot does not establish safe identities for playlist records, and some natural keys depend on incomplete location data. These records are intentionally reported as uncertain. A later three-way comparison with an explicit base can distinguish one-sided changes from independently edited conflicts; this two-source comparison cannot make that claim.

## Human-readable report

`report/buildMergeReport.ts` turns the comparison into a Dutch presentation model. It gives source labels, readable record and field names, status explanations, counts, changed values, relationship warnings, and timestamp evidence. It lists non-equal records and keeps the total equal count in the summary. Missing or invalid times are warnings, never inferred as old or new. Records present on only one side are described as possibly absent from the other source; the report does not declare them deleted. Database row IDs and GUIDs are not shown as user-facing identity. Rendering and downloading the report are separate UI/output steps.
