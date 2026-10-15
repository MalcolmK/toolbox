# Merge readiness

Current implementation status checked on 2026-10-15: package version 0.4.0 is the active work round; the existing interface and merger behavior originate from version 0.3.0. This document separates implemented behavior from the 0.4.0 target and from evidence needed before relying on a restored library.

## What works in the current flow

- Two selected `.jwlibrary` files are processed locally and checked against the supported schema.
- Simple Mode compares records and prepares a source-attributed merge plan.
- Conflicts with a safely matched publication and record can be shown together by publication. The user chooses version A or B for each publication; the choice applies to its eligible conflicting records. The database builder still checks record coverage, ID remapping, foreign keys, and SQLite integrity.
- A ready plan can produce a new `.jwlibrary` POC download. The archive is reopened and checked as a ZIP, including CRC and the expected database and media entries.
- Source files are not changed or uploaded.

Advanced Mode is hidden from the interface. Its implementation remains in the source tree but is not part of the user flow.

## 0.4.0 scope and source-pair baseline

The two selected local backups remain available in Downloads and both report schema version 16. Read-only inspection found 18 tables in each database; SQLite `integrity_check` returns `ok` and `foreign_key_check` returns no violations for both. Each has 2,073 `Location` rows and 4,268 `Note` rows. Their location-type counts are 2,018 of type 0, 35 of type 1, and 20 of type 3. Backup B has 18,961 `UserMark` rows, 19,044 `BlockRange` rows, and 579 `InputField` rows; backup A has 18,960, 19,041, and 578 respectively. Each archive contains the default thumbnail and one referenced media file, and that media reference resolves in the archive. No note text, media payload, or detailed content report is included here.

The 0.4.0 target is to let the user explicitly confirm proposed location and playlist links within the active merge session, then build a populated POC only when all required decisions and data checks are resolved. Identity confirmation remains separate from A/B conflict choices. A/B choices apply only to conflicts; one-sided additions must remain eligible for preservation. This flow is not implemented yet. The existing app still treats location keys as candidates and playlist identities as uncertain, so the current populated merge remains blocked.

## Manifest hash decision for the POC

The earlier project decision was to avoid making hash research a prerequisite for a bounded restore experiment. The current POC copies a source manifest's non-empty hash and explicitly marks it unverified. This lets the user try a candidate archive in a disposable JW Library profile now.

That candidate is not represented as a verified production backup. If JW Library rejects it, investigate the manifest fields from the observed result. A verified production export would require separate evidence; proving a hash formula is not needed to compare, merge, or create the current POC candidate.

## Remaining work, in priority order

1. **Implement confirmed location and playlist links before a populated output.** The user must see and confirm explicit location proposals and playlist matches; identity decisions must remain separate from content A/B choices. Confirmations must be tied to the active source pair and invalidated when it changes. Unknown forms, duplicates, stale decisions, and conflicting mappings remain blocking. A synthetic fixture with matching keys is not enough evidence by itself. Then create a populated fixture with conflicts in separate publications and linked additions; verify selected rows, ID remapping, foreign keys, retained/omitted values, ZIP contents, unchanged source files, and no uploads in the actual downloaded database. Existing browser checks verify that A/B publication choices leave uncertain location records blocked; successful download tests currently use empty libraries.
2. **Separate technical delivery from JW Library acceptance.** This depends on completing item 1 and producing and checking a populated candidate for the selected backups. Before proposing a restore, state the candidate's concrete losses and checks, ask for explicit confirmation to restore into the user's existing JW Library, record any changes made to that library since the source backups, and obtain a fresh backup of the current library. The user performs the restore and reports the app result; compare a new post-restore export against the candidate. Never imply that implementation permission authorizes a restore. No populated candidate is currently available, so populated retention and JW Library acceptance remain unverified.
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
