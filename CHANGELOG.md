# Changelog

## 0.4.0 — 2026-10-15

- Fixed the three shared Playwright failures from the attached CI logs: horizontal overflow at 768px in the playlist evidence, populated comparison, and keyboard/conflict layouts. The compact single-column breakpoint now applies through 800px, and viewport expectations reflect the tablet layout. Verification on the local Windows runner: 174 unit tests passed, all 36 Playwright runs passed across Chromium, Microsoft Edge, and WebKit, and the production build passed (with the existing >500 kB bundle advisory). Kept version 0.4.0.
- Added the requested GitHub Actions sequencing change to the follow-up list: smoke tests, full e2e, then deployment, with deployment gated on e2e success for the same `main` revision.
- Moved open implementation and verification items out of the README into `IMPLEMENTATION_TODO.md`, linked the checklist from the README, and added concise explanations of identity certainty and the role of smoke tests. Kept version 0.4.0; documentation-only update.
- Completed Step 8's populated browser-to-archive proof. Added a synthetic A/B fixture pair with distinct source-local IDs, two conflicts in one publication, a separate publication conflict, one-sided note/mark/ranges/input field, and a confirmable playlist with available media. A frozen expected result checks table counts, selected note content and logical place targets, chosen title metadata, input values, mark ranges, and playlist structure. The end-to-end test follows normal file selection, place confirmation, publication choices, playlist confirmation (including revoke/reconfirm), ready-plan build, browser download, CRC-checked ZIP reopen, and SQLite integrity/foreign-key/content checks; source digests stay unchanged and request bodies remain absent. The populated route passes in Chromium, Microsoft Edge, and Playwright WebKit. Updated README scope and evidence. Kept version 0.4.0. Synthetic fixtures do not establish JW Library restore acceptance.
- Completed Step 7's controlled SQLite build boundary. The builder now creates source/table/local-key aliases only from explicit plan aliases, confirmed place/playlist groups, selected rows, and recorded omissions; every source row and alias must have one declared destination. It uses indexed row and relationship lookups, honors each chosen row's source and `fieldSources`, checks primary-key collisions, enables deferred foreign keys in a transaction, verifies row counts and SQLite constraints, and reopens the exported bytes for a second integrity/foreign-key/content-count check. Added regressions for uncovered rows, conflicting aliases, missing source parents, foreign-key provenance, unique-key collisions, unchanged sources, stale context, and exported-byte validation. Updated database-build documentation. Kept version 0.4.0. Verification: all 174 unit tests, all 33 Playwright runs across Chromium, Microsoft Edge, and WebKit using three workers, and the production build passed. The restricted runner still returns `spawn EPERM` when Playwright forks a worker, including with an existing development server; this host permission cannot be corrected in repository code. No JW Library restore acceptance is claimed.
- Completed Step 6's playlist-link confirmation. Exact proposals compare playlist content, accuracy descriptions, referenced media metadata and actual ZIP bytes, durations, confirmed place links, markers, verse/paragraph references, and tags while excluding local IDs and treating labels as display-only. Added unselected same/different controls, safe separate-retention choices, revocation, source-pair/revision checks, and dependent-row/media ID remapping. Missing payloads, duplicate structures, byte/path conflicts, and unique tag-position collisions remain blocked. Added synthetic positive/negative fixtures, SQLite output assertions, and a browser download flow that reopens the ZIP and verifies media bytes at phone, tablet, and desktop widths. Kept version 0.4.0. Verification: 169 unit tests, 33 Playwright runs across Chromium, Microsoft Edge, and WebKit, and the production build passed. No JW Library restore acceptance is claimed.
- Completed Step 1 for the confirmed-link and populated Simple Mode POC scope. Recorded the approved separation between place/playlist identity confirmation and publication A/B content choices, the schema-16 boundary, the unverified-hash POC rule, and the rule that unresolved required links block output. These are scoped requirements; the confirmation flow and populated merge are not implemented yet. Read-only checks of the two local source backups confirmed 18 tables, schema version 16, clean SQLite integrity and foreign-key checks, and the expected aggregate differences; no personal note text or media payload was added to the repository.
- Set the active work-round version to 0.4.0 in the package metadata. Verification with Node.js 22.23.3: all 115 unit tests passed, all 27 end-to-end runs passed across Chromium, Microsoft Edge, and Playwright WebKit, and the production build passed. The restricted-process `spawn EPERM` was a runner policy: Playwright must start a web server and browser subprocess, so a repository code change cannot remove that OS restriction safely. On this host, running the suite with process access is the working operational route.
- Implemented `compare/locationDescriptor.ts` as a pure schema-16 location description. It preserves all ten key-field values in an ordered JSON-array comparison key, recognizes only the observed document, Bible chapter, publication-root, and two media-track forms, rejects malformed values and unsupported forms with a reason, and counts repeated keys separately within each source. Added isolated unit coverage and documented that a comparison key is not confirmation of identity. Final verification: all 147 unit tests passed, all 27 end-to-end runs passed across Chromium, Microsoft Edge, and Playwright WebKit, and the production build passed.
- Implemented `merge/locationResolution.ts` for exact unique A/B proposals, explicit row references, immutable revisioned confirmation/revocation, full source-snapshot checks, session-only logical identities, and unique-key checks for “these are different” decisions. Passed the context explicitly into Simple Mode comparison, planning and database building. Confirmed source rows map to one output Location ID, and the live build guard rejects a session change during its SQLite wait. Unsupported, duplicate and one-to-many descriptions remain unresolved. UI controls, playlist-link resolution and full populated-flow verification remain subsequent work. Final verification: all 155 unit tests passed, all 27 end-to-end runs passed across Chromium, Microsoft Edge, and Playwright WebKit, and the production build passed.
- Completed Step 4's Simple Mode place-confirmation UI. Added place cards grouped by publication/media family, symbol, language, edition and specialty, with every pair and all ten key fields, explicit same/different decisions, revocation, and explicit A/B choice plus loss reporting when `Location.Title` differs. The live summary separates pending place groups, publication content choices and other blockers; file creation stays gated until all required items are resolved. Expanded synthetic fixtures and browser checks for multiple places per publication, multiple publications, identity-only confirmation, identity plus content conflict, title metadata, revocation, separate-place selection, keyboard/focus, and responsive layouts. Kept the work at 0.4.0. Final verification: all 155 unit tests, all 30 end-to-end runs across Chromium, Microsoft Edge, and Playwright WebKit, and the production build passed. Populated conflict fixtures remain blocked by unresolved synthetic playlist/relationship records; no JW Library restore acceptance is claimed.
- Completed Step 5's dependent-record handling. Notes, marks, bookmarks, input fields and location-owned tag maps now use confirmed logical place identities across different source-local IDs. Notes and marks retain their GUID identities; ranges are compared as complete mark-GUID-and-coordinate sets, with explicit A/B handling for set conflicts and duplicate blocking. InputField values, bookmark publication/slot plus precise-target relationships, unique full-content tags, and TagMap owner/tag/position conflicts are covered. The SQLite builder now records composite source keys and remaps a selected A note's A mark while retaining a B-only note and its distinct B location. Added regressions for different local IDs, changed/missing targets, missing mark parents, duplicate and conflicting ranges, InputField values, bookmark slot collisions, TagMap positions, and playlist-location maps whose parent is unresolved. Kept version 0.4.0. Final verification: all 164 unit tests, all 30 end-to-end runs across Chromium, Microsoft Edge, and Playwright WebKit, and the production build passed. This synthetic evidence does not claim JW Library restore acceptance.

## 0.3.0 — 2026-10-15

- Assessed Step 7: a safe populated conflict download cannot yet be produced because `Location` composite keys remain candidate identities. Documented that synthetic key equality is not proof of cross-backup equivalence, retained the e2e fail-closed check, and made a validated location-resolution decision the prerequisite for populated output and JW Library restore testing. Rechecked 115 unit tests, the production build, and all 27 browser runs; all passed. Kept the release at 0.3.0.

- Updated the Simple Mode policy and unit expectations: `possible-conflict` content always requires an explicit per-publication A/B choice, while timestamp fallback tests now cover only automatically resolvable `changed` rows. Fixed the mobile navigation close button position found by WebKit. Documented that a publication choice cannot resolve uncertain `Location` identities or relationships. Verified 115 unit tests, the production build, and all 27 browser runs across Chromium, Microsoft Edge, and WebKit; kept the release at 0.3.0.
- Audited the seven previously failing Simple Mode scenarios against fixture identities and merge rules. Kept conflicting note content on explicit review and kept uncertain `Location` identities blocked. Recorded the source of a separately preserved `Created` field after a manual A/B choice and added a regression assertion for that provenance.
- Re-ran the complete checks after the audit: 115 unit tests passed, the production build passed, and all 27 Playwright runs passed across Chromium, Microsoft Edge, and WebKit. No version bump; the work remains under 0.3.0.

- Simplified the visible merger into a three-step Simple Mode flow, added A/B choices for eligible conflicts grouped by publication, hid Advanced Mode from the interface while retaining its implementation, and moved technical comparison details behind optional disclosures.
- Clarified when an unresolved plan cannot produce a file and kept the POC download visibly separate from a JW Library-verified backup.
- Added a current merger-readiness assessment: the POC can be tried without first proving a hash formula, while populated merge coverage, data preservation, and JW Library restore compatibility still need acceptance evidence.
- Added two visual directions for the simplified workflow. No merge rules or POC verification claims were expanded in this round.
- Tightened the comparison screen to show a compact outcome and publication choices first, with detailed counts behind a disclosure. The POC acceptance notice now appears immediately after comparison; the README makes clear that hash verification is not required before creating a first candidate.
- Added synthetic coverage with multiple eligible conflicts in one publication, an independent conflict in another publication, and an unresolved playlist identity. Publication choices are now considered complete only when every eligible record in that group has the same explicit source selection.
- Replaced outdated Advanced Mode e2e steps with Simple Mode coverage for invalid inputs, replacing files, restarting, reversible publication choices, download gating, local POC generation, archive entries, unchanged source files, and no request bodies. All 24 browser runs passed across Chromium, Microsoft Edge, and WebKit. Documented that populated conflict fixtures still block on uncertain `Location` identities; successful download coverage uses empty schema-valid libraries.
- Added a polite live status for the comparison summary so assistive technology can receive updates when the remaining publication choices change. Expanded e2e checks for keyboard navigation and activation, visible focus, A/B `aria-pressed` state, populated conflict-card layouts at 375/768/1440 pixels, overflow and control fit, and calculated text/focus contrast in light and dark themes. The full suite passes all 27 browser runs across Chromium, Microsoft Edge, and Playwright WebKit. Real screen-reader and Apple Safari checks remain outside this automated evidence; kept version 0.3.0.
- Confirmed that Simple Mode opens from the toolbox card and that neither the merger screen nor mobile tool navigation exposes an Advanced Mode or three-way base entry. Reconciled the readiness checklist with completed UI coverage and the remaining populated-output, JW Library restore, schema, and memory evidence. README, readiness notes, package version, and changelog all remain on 0.3.0.

## 0.2.0 — 2026-10-14

- Completed the POC documentation pass: aligned the README's test-coverage summary with the downloaded-archive ZIP/CRC reread and source-file digest checks, restated the supported Simple/Advanced POC scope and verification boundaries, and kept personal backup content out of project files. Confirmed the app version remains 0.2.0.
- Extended both Simple and Advanced browser download flows to reopen the actual downloaded `.jwlibrary` as a ZIP with CRC checks, verify the manifest and its named database entry, and compare selected-source SHA-256 digests before and after the merge. Recorded that the archive writer verifies the packaged database bytes against the checked builder output. Build, 114 unit tests, and all 21 browser runs passed; successful-download fixtures remain empty synthetic libraries, and JW Library acceptance remains the user's manual check. Kept version 0.2.0.
- Added safety tests proving that the production writer rejects explicitly unverified POC manifests and the POC writer rejects verified-only manifests. Added an Advanced build test proving the comparison base contributes neither database records nor the provisional hash. Refreshed the README's current totals after full regression verification. Kept version 0.2.0.
- Labeled the provisional download action **Download POC-bestand** in both modes so the button itself distinguishes an unverified POC archive from a verified export. Extended both browser download flows to assert the label; the warning, error gating, and `.jwlibrary` filename remain visible. Kept version 0.2.0.
- Verified the Advanced output gate in the browser: the file-building action stays hidden before review confirmation and appears only for a ready plan; the information-loss overview is visible before the user proceeds. Documented that unsafe or unconfirmed plans remain blocked. Kept version 0.2.0.
- Indexed per-snapshot relationship and candidate-identity lookups after local testing showed repeated full-table scans made populated libraries slow to compare. The optimization keeps identity confidence and merge decisions unchanged. Kept version 0.2.0.
- Ran the final POC regression check with Node.js 22.23.3: production build passed, all 112 unit tests passed, and all 21 browser runs passed across Chromium, Microsoft Edge, and WebKit. Updated README validation evidence and retained the documented limits around empty download fixtures, the unverified POC hash, populated Advanced identity gaps, and manual JW Library acceptance. Kept version 0.2.0.
- Reconciled the detailed data-model and Simple-mode documentation with the POC download route: production hash generation remains blocked, POC downloads use an explicitly unverified copied hash, and browser download coverage does not prove JW Library acceptance or populated Advanced merge support. Kept version 0.2.0.
- Verified the Advanced POC download safety boundary with a non-empty synthetic input: rows lacking safely reconcilable cross-source identities keep the plan unresolved and block archive creation. Clarified that current successful browser download fixtures are empty libraries, so they do not prove non-empty Advanced merge coverage. Kept version 0.2.0.
- Connected resolved Advanced-mode reviews to checked SQLite construction, provisional-manifest creation, ZIP validation, and `.jwlibrary` download; the optional comparison base remains excluded from output. Added unit and browser download coverage for Advanced mode and synchronized README/data-model/three-way-comparison documentation. The copied source hash remains explicitly unverified, and JW Library acceptance remains for the user's manual check.

- Added a dedicated JW Library Merger source structure with documented module boundaries.
- Documented the observed JW Library database tables, relationships, timestamp semantics, and unresolved format questions.
- Added JSZip and sql.js for browser-local ZIP and SQLite processing, plus a synthetic local-WASM smoke check.
- Added reproducible, fully synthetic `.jwlibrary` fixtures for comparison, linked mark/range, and invalid-input scenarios.
- Added a typed browser-local `.jwlibrary` archive reader with specific input errors, preservation of unknown ZIP entries, and Vitest coverage.
- Added read-only SQLite validation for schema version 16, including schema shape, integrity, and foreign-key checks with structured failure details.
- Added a complete typed database snapshot reader that retains unknown tables, binary values, relationships, and explicit schema objects for later comparisons.
- Added timestamp normalization for explicit timezone formats while preserving source text and keeping archive, database, and note timestamp sources separate.
- Added per-table record identity rules that separate stable keys, review-only candidates, and source-local integer IDs.
- Added a read-only two-backup comparison report with equal, one-sided, changed, possible-conflict, and uncertain-linked classifications, relationship tracking, and per-source timestamp summaries.
- Documented comparison confidence limits and added synthetic fixture coverage for note edits, one-sided records, connected marks and ranges, timestamp retention, and source-local ID handling.
- Added a Dutch human-readable difference report with understandable statuses, record and field labels, change summaries, timestamp evidence and warnings, uncertain relationships, and cautious wording for records found on only one side.
- Added synthetic report tests for changed notes, possible deletion wording, missing or invalid timestamps, readable relationship labels, and hiding source-local IDs.
- Documented Simple mode's identity, timestamp precedence, information-preserving union, conflict handling, relationship safety, unresolved-time behavior, and required loss-report details in a synthetic acceptance matrix.
- Implemented a pure Simple mode merge planner that returns source-attributed logical records, per-record and database-time decisions, explicit omitted field and relationship values, unresolved alternatives, and a review-required status without file or database side effects.
- Expanded the synthetic Simple mode acceptance tests with timezone-instant ordering, equal-time and manifest fallbacks, candidate tag and tag-map conflicts, duplicate identities, linked mark/range retention, malformed relationship retention, information-loss reporting, provenance, and source immutability.
- Replaced the sample merger screen with a browser-local two-file workflow that validates each source, runs the comparison and Simple mode planner, presents timestamp/loss/uncertainty details, and gates the next file stage on resolved choices; added Playwright coverage for conflict and ready states at phone, tablet, and desktop widths.
- Added an empty schema-valid synthetic archive pair for the no-unresolved-choice workflow and documented the added fixtures; kept all changes in version 0.2.0.
- Added a typed advanced-mode merge-decision model that carries logical identity, source and timestamp provenance, field/block differences, suggested and available actions, and makes confirmed conflicts require a base plus an explicitly overlapping change.
- Documented the certainty rules and UI-facing contract for merge decisions in `MERGE_DECISIONS.md`.
- Enabled Advanced mode with an optional comparison-only base backup, three-way field classification, source-specific validation, and a review summary that distinguishes one-sided, shared, non-overlapping, confirmed-conflict, and uncertain changes.
- Kept A and B as the only merge candidates; documented the three-way comparison limits and added synthetic coverage for one-sided edits, shared edits, divergent edits, and two-way possible conflicts.
- Added a keyboard-operable, one-conflict-at-a-time review with previous/next navigation, A/B/base values and timestamps, explicit conflict reasons, and reversible in-page A/B choices. Unsafe combine and keep-both choices are withheld, and choices do not create or export a file.
- Added block-first and optional line-level three-way note-text comparison. Independent edits are proposed together, overlapping blocks require a choice, both fragments or explicit manual text can be selected, and the preview discloses source/base text omitted by a choice while retaining original line endings and Unicode.
- Added a session-wide decision count, a list of outstanding required choices, a completion gate, and a provisional information-loss report for source, base, automatic text, both-fragment, and manual-text decisions. All decisions remain editable until the comparison session is cleared or replaced.
- Added a fail-closed SQLite database builder for fully resolved Simple mode plans. It copies the reviewed source schema, preallocates output IDs, remaps selected logical identities and foreign keys, preserves the source databases, and requires SQLite integrity and foreign-key checks before returning database bytes; added tests for linked notes/marks/ranges and unresolved-plan blocking.
- Documented the database build boundary and the remaining Advanced mode decision handoff, manifest/hash, media packaging, and downloadable archive work; retained version 0.2.0 as requested.
- Investigated the JW Library manifest hash rule and documented conflicting third-party claims; added a tested fail-closed manifest gate that returns no manifest JSON until the rule is verified. Kept version 0.2.0 as requested.
- Reconciled the README and merger guidance with the implemented local comparison, Advanced mode text review, database-build boundary, and current export block; kept all work under 0.2.0.
- Added a gated JW Library ZIP writer that packages the checked database, hash-verified manifest, selected required media, and non-conflicting source entries; verifies the generated archive by reopening it and blocks missing media, unsafe paths, and differing same-path payloads. Added synthetic writer tests; the current manifest hash gate still prevents production archive output. Kept version 0.2.0.
- Connected resolved Simple mode plans to the local build, manifest, and archive checks; added a download control that stays disabled unless the writer returns a fully verified archive, shows merge/loss details after download, and releases temporary object URLs and build state. The unresolved manifest hash still blocks actual downloads; kept version 0.2.0.
- Expanded archive failure-case tests for empty or unchecked SQLite output and malformed or inconsistent manifest JSON; documented existing ZIP, schema, duplicate-identity, conflict, media, hash-gate, and browser download-block coverage. Kept version 0.2.0.
- Completed the Playwright workflow coverage for navigating back to change a conflict choice; verified all six browser flows in Chromium and Microsoft Edge. Documented that the current hash gate prevents successful download testing and that WebKit/Safari coverage remains unavailable. Kept version 0.2.0.
- Assessed the JW Library restore-acceptance gate: it remains blocked by the unverified manifest hash and unavailable test app/device. Documented a synthetic-only acceptance sequence and made clear that restore compatibility and retained content are not yet verified. Kept version 0.2.0.
- Corrected technical documentation to reflect that archive packaging is implemented but production `.jwlibrary` download remains blocked by the unverified manifest hash rule; marked the original design brief as historical. Kept version 0.2.0.
- Updated the README to describe the guarded ZIP writer, its `.jwlibrary` output extension, and the distinction between file packaging and verified JW Library restore acceptance. Kept version 0.2.0.
- Expanded README's pending work instructions with read-only analysis of the supplied JW Library backups, controlled manifest-hash verification, synthetic restore acceptance, and memory/ZIP-expansion safeguards. The real backups remain local and are not included in the repository; kept version 0.2.0.
- Refined the manifest-hash evidence: verified the referenced database path and tested standard SHA-256 plus unpadded per-byte hexadecimal against both supplied backups. Documented that this rejects only those direct raw-byte hypotheses and leaves normalized-content or pre-export inputs unresolved; kept version 0.2.0.
- Defined the 0.2.0 POC completion criteria in the README: downloadable `.jwlibrary` output from both modes with an explicitly unverified source hash, existing integrity and archive checks retained, and JW Library acceptance left for the user to verify.
- Clarified POC boundaries in the README: separate the fail-closed production hash route from the provisional POC route, limit Advanced decisions to existing UI actions, keep the comparison base out of output, and keep personal backups out of the repository. Version remains 0.2.0.
- Compared the POC criteria with the current implementation and tests in the README: documented that Simple is connected but hash-blocked, Advanced has no database/download handoff yet, and neither mode has successful-download coverage. Version remains 0.2.0.
- Added an isolated POC manifest builder that copies a chosen source hash, preserves other source fields, updates the output database path and timestamps, and returns an explicit `ready-unverified` result without changing the production hash gate. Added unit cases for provenance, unknown-field retention, missing hashes, unsafe paths, and invalid dates; documented that archive/UI wiring is still pending. Version remains 0.2.0.
- Added a separate `writePocJwLibrary` archive entry point for explicitly unverified POC manifests. It retains the existing database, media, path, collision, CRC, and archive-reopen checks, labels successful output `poc-unverified`, and leaves the production writer restricted to verified manifests. Added synthetic writer cases; mode UI wiring remains pending. Version remains 0.2.0.
- Connected a new Simple-mode POC build function to checked SQLite building, database-first source timestamp selection with manifest-time fallback, provisional manifest creation, and POC archive writing. It refuses unresolved plans, reports the chosen hash source, and leaves the current UI on the production route for a later connection step. Added synthetic pipeline tests. Version remains 0.2.0.
- Connected the Simple-mode build action to the POC archive pipeline and added a visible pre-download warning naming the source of the unverified hash and stating that JW Library acceptance is unknown. Updated the browser flow to assert the `.jwlibrary` download and warning. Advanced mode remains pending; version remains 0.2.0.
- Corrected the Simple POC integration test fixtures and rejection-message expectation. Verified all 103 unit tests and all six Playwright Chromium flows, including the downloadable `.jwlibrary` POC and pre-download warning. Version remains 0.2.0.
- Added the Advanced review-to-database-plan adapter. It maps reviewed A/B choices through internal source-row references, preserves per-field provenance for relationship remapping, records omitted/composed values, and blocks unresolved or unsafe identities. Added synthetic tests for choice mapping, supported text resolution, independent field combination, and database construction. Verified all 108 unit tests and six Playwright Chromium flows; Advanced POC archive/download UI wiring remains a later step. Version remains 0.2.0.
- Configured Playwright projects for Chromium, Microsoft Edge, and WebKit; added focused Edge/WebKit scripts and a GitHub Actions workflow that runs each browser project on pushes and pull requests. Verified all 18 flows locally: six each in Chromium, Edge, and WebKit. WebKit provides Safari-engine coverage, while actual Safari still requires macOS testing. Version remains 0.2.0.
- Pinned local and browser-workflow test runs to Node.js 22.23.3 in `.node-version`, avoiding the older Node 20.15 runtime that triggered Vite's minimum-version warning. Re-ran type, unit, and cross-browser tests under the supported runtime. Version remains 0.2.0.
- Removed the Windows `spawn EPERM` dependency from normal Vite config loading by using Vite's native (currently experimental) config loader, and switched Vitest to its thread pool. Build and all 108 unit tests now pass inside the restricted shell; browser tests still launch actual browser processes and are run outside that restriction. Version remains 0.2.0.

## 0.1.17 — 2026-10-14

- Aligned the shared toggle's close state with the drawer navigation's right edge and kept it clear of the first navigation item.

## 0.1.16 — 2026-10-14

- Moved the shared navigation toggle to the upper-left corner and into the open drawer, removing the separate drawer close button; animated its icon into a close symbol while respecting reduced-motion preferences.
- Focused the active page heading after route changes and replaced the Toolbox title bar with live app search, a clear control, and an accessible empty-results message.
- Removed the title bar from merger subpages and moved the return link to the upper-left area below the navigation toggle.
- Changed Preview Merge to a semantic route link for native keyboard and browser navigation behavior.

## 0.1.15 — 2026-10-14

- Updated the implementation plan to use the confirmed `/toolbox/` Pages path and clarified that GitHub Actions publishes a fresh build from `dist/`.

## 0.1.14 — 2026-10-14

- Added a GitHub Actions workflow that builds the Vite app and deploys the production output to GitHub Pages.

## 0.1.13 — 2026-10-14

- Corrected the GitHub Pages base path to match the `toolbox` repository.

## 0.1.12 — 2026-10-13

- Prevented the open navigation drawer from overlapping main content near the desktop breakpoint.

## 0.1.11 — 2026-10-13

- Added system-aware theme initialization, remembered explicit theme selection, and graceful storage failure handling.

## 0.1.10 — 2026-10-13

- Added hash-routed JW Library Merger and sample preview screens with responsive, prototype-only interactions.

## 0.1.9 — 2026-10-13

- Added the responsive, clickable Toolbox cards and accessible prototype-only notice for placeholder tools.

## 0.1.8 — 2026-10-13

- Keep the navigation drawer open by default on wide screens and closed by default on compact screens, so a modal drawer does not block the initial mobile view.

## 0.1.7 — 2026-10-13

- Added opaque light/dark surface fallbacks for browsers without backdrop filtering.

## 0.1.6 — 2026-10-13

- Added shared reduced-motion support for token-based interface transitions.

## 0.1.5 — 2026-10-13

- Audited light/dark design tokens and removed values without a current consumer.

## 0.1.4 — 2026-10-13

- Moved shared app-frame, background, and responsive main-layout rules into the global layout stylesheet.

## 0.1.3 — 2026-10-13

- Added the named Available tools region and rendered its accessible list from the typed toolbox entries.

## 0.1.2 — 2026-10-13

- Added a typed, centralized list for the JW Library Merger launcher entry and two New Tool placeholders.

## 0.1.1 — 2026-10-13

- Completed the navigation drawer with light/dark theme controls, responsive modal behavior, keyboard focus management, and reachable utility/version sections.

## 0.1.0 — 2026-10-13

- Added the initial React, TypeScript, and Vite app shell with a responsive layered background, header, and operable navigation drawer shell.
- Added centralized light and dark design tokens and a theme-aware global CSS foundation.
- Added the initial GitHub Pages base-path configuration and visible app version.
