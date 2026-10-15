# Merge readiness

Status checked from the version 0.3.0 source on 2026-10-15. This describes what the app can do now and what still needs evidence before relying on a restored library.

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

1. **Resolve `Location` identity before attempting a populated A/B output.** The current policy labels `Location` composite keys as candidates, not confirmed cross-backup identities. Making a synthetic fixture with identical key fields does not validate that those locations are equivalent in real backups. Do not promote the key or bypass the unresolved plan just to obtain a download. Define and validate a user-visible location-mapping decision or a stronger evidenced identity rule first. Then create a populated fixture with conflicts in separate publications and linked records; verify selected rows, ID remapping, foreign keys, retained/omitted values, ZIP contents, unchanged source files, and no uploads in the actual downloaded database. Existing browser checks verify that A/B publication choices leave uncertain location records blocked; successful download tests currently use empty libraries.
2. **Try a populated candidate in JW Library.** This depends on completing item 1 and producing a safely linked populated candidate. Then use a disposable test profile and confirm whether JW Library accepts and reopens it; compare the expected notes, marks, ranges, tags, bookmarks, and relationships. No populated candidate is currently available for this restore test, and the automated successful-download fixture is empty, so populated retention and JW Library acceptance remain unverified.
3. **Expand supported cases from evidence.** The validator currently accepts schema version 16 only. Review any other app schema versions and any rows, media paths, or database objects that cannot safely be matched or retained before enabling them.
4. **Check file-size and memory handling.** ZIP and SQLite operations can use substantially more memory than the compressed file size. Add conservative preflight limits and clear stop behavior after selecting representative backups and devices. Never offer a result after an interrupted or failed check.

## Interface and automated test status

Advanced Mode is not reachable from the toolbox card, merger screen, or tool navigation. Its implementation remains in the source tree. The Simple-only interface has e2e coverage for its toolbox entry and the absence of Advanced Mode or base-version controls. The complete suite passes 27 browser runs across nine workflows in Chromium, Microsoft Edge, and Playwright WebKit. It includes responsive checks at 375, 768, and 1440 pixels plus keyboard focus, live status, pressed states, and computed light/dark contrast. This is not a manual screen-reader or Apple Safari acceptance test.

## Current stop conditions

- The archive/database input is invalid or the schema is unsupported.
- A record identity, conflict, or parent relationship cannot be safely established.
- A required media file is missing or conflicting, a path is unsafe, or the database/archive integrity check fails.
- A comparison or build operation fails or is interrupted.

In these cases Simple Mode should explain the specific reason and withhold the download. A successful ZIP check alone does not prove that JW Library accepts the archive or preserves all user data.
