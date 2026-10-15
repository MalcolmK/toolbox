# Merge readiness

Status checked from the version 0.3.0 source. This describes what the app can do now and what still needs evidence before relying on a restored library.

## What works in the current flow

- Two selected `.jwlibrary` files are processed locally and checked against the supported schema.
- Simple Mode compares records and prepares a source-attributed merge plan.
- Conflicts with a safely matched publication and record can be shown together by publication. The user chooses version A or B for each publication; the choice applies to its eligible conflicting records. The database builder still checks record coverage, ID remapping, foreign keys, and SQLite integrity.
- A ready plan can produce a new `.jwlibrary` POC download. The archive is reopened and checked as a ZIP, including CRC and the expected database and media entries.
- Source files are not changed or uploaded.

Advanced Mode is hidden from the interface. Its implementation remains in the source tree but is not part of the user flow.

## Manifest hash decision for the POC

The earlier project decision was to avoid making hash research a prerequisite for a bounded restore experiment. The current POC copies a source manifest's non-empty hash and explicitly marks it unverified. This lets the user try a candidate archive in a disposable JW Library profile now.

That candidate is not represented as a verified production backup. If JW Library rejects it, investigate the manifest fields from the observed result. A verified production export would require separate evidence; proving a hash formula is not needed to compare, merge, or create the current POC candidate.

## Remaining work, in priority order

1. **Exercise the version A/B publication choices.** Build synthetic cases with one and multiple conflicts under a publication, plus more than one publication. Confirm each choice selects the intended source rows and their linked records, reports omitted values, and blocks ambiguous identities or mismatched publication links.
2. **Refresh and run the UI checks.** Existing browser workflow checks still expect the old Simple/Advanced mode picker. Update them for the current Simple-only interface, verify choosing A/B and downloading a ready POC, and check phone, tablet, and desktop layouts.
3. **Try a populated candidate in JW Library.** Use a disposable test profile and a synthetic populated merge. Confirm whether JW Library accepts and reopens it, then compare the expected notes, marks, ranges, tags, bookmarks, and relationships. The current automated successful-download fixture is empty, so it does not establish populated data retention.
4. **Expand supported cases from evidence.** The validator currently accepts schema version 16 only. Review any other app schema versions and any rows, media paths, or database objects that cannot safely be matched or retained before enabling them.
5. **Check file-size and memory handling.** ZIP and SQLite operations can use substantially more memory than the compressed file size. Add conservative preflight limits and clear stop behavior after selecting representative backups and devices. Never offer a result after an interrupted or failed check.

## Current stop conditions

- The archive/database input is invalid or the schema is unsupported.
- A record identity, conflict, or parent relationship cannot be safely established.
- A required media file is missing or conflicting, a path is unsafe, or the database/archive integrity check fails.
- A comparison or build operation fails or is interrupted.

In these cases Simple Mode should explain the specific reason and withhold the download. A successful ZIP check alone does not prove that JW Library accepts the archive or preserves all user data.
