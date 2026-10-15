# Library Merger Toolbox

A responsive, browser-based toolbox. Its first tool combines JW Library backup files locally in the browser.

Current development version: **0.4.0**.

## JW Library Merger

### Use the current Simple Mode flow

1. Choose two `.jwlibrary` backup files.
2. Select **Vergelijk back-ups**. Review and explicitly resolve proposed place and playlist links, then choose whether version A or B should be kept for each publication conflict. Open the detail sections to inspect the complete playlist structures and other uncertain records.
3. If the plan is ready, select **Maak mergebestand** and download the POC file.

The files stay on your device and the source backups are not changed. Each A/B choice applies only to the eligible conflicts shown under that publication. Records with uncertain identities or relationships remain unresolved and continue to block file creation. The result shows pending place, playlist, publication, and other decisions. A POC notice appears as soon as the comparison finishes: ZIP and database checks do not prove that JW Library accepts the generated backup. Advanced Mode is temporarily unavailable in the interface; its code remains in the project.

### Scope of the 0.4.0 work

The 0.4.0 work is scoped to schema version 16 and to the record forms observed in the two locally inspected backups. Place confirmation uses the exact ten-field schema description and remains separate from content choices. Playlist proposals compare item content, accuracy descriptions, media metadata and actual archive bytes, duration, confirmed place links, markers, verse/paragraph references, and playlist labels. Local IDs are excluded, labels are display-only, and both same/different decisions start unselected. All dependent rows and media references are rebuilt from confirmed logical identities; unknown, ambiguous, duplicate, missing, or conflicting structures block output unless safe separate retention is available. One-sided additions remain eligible when their identities and relationships can be resolved.

The two inspected backups each contain 2,073 `Location` rows and 4,268 `Note` rows. Backup B contains one additional `UserMark`, three additional `BlockRange` rows, and one additional `InputField`. Both report schema version 16, contain 18 tables, and pass SQLite integrity and foreign-key checks. These aggregates are a source-pair baseline, not proof that the merger currently preserves the records or that JW Library accepts a generated file.

### What the download means

The browser checks the input archives and supported database schema. For a ready plan, it builds a SQLite database, checks database and foreign-key integrity, writes the archive, then reopens the ZIP and checks its CRC and contents. The current interface can offer a **POC `.jwlibrary` download** when those checks pass.

This is an experimental JW Library backup. The POC uses a source hash without claiming to verify its formula; confirming that formula is not a prerequisite for making the first candidate file. No generated file has yet been accepted and restored in JW Library. If JW Library rejects the candidate, investigate the manifest and hash behavior using that result. Do not treat a successful ZIP check as proof of JW Library acceptance.

For each safely identified publication with a `possible-conflict`, Simple Mode asks whether to keep version A or B; timestamps do not choose between conflicting content. Place and playlist identity decisions are separate from content choices. Some comparisons remain unresolved when record identities or relationships are ambiguous. A publication choice cannot resolve those uncertainties, so Simple Mode withholds the download while any such blockers remain. Step 8 adds a synthetic populated route with distinct source-local IDs, two conflicts in one publication, a conflict in another, one-sided note/mark/ranges/input field, and a confirmed playlist with media. The test checks the downloaded ZIP CRC and compares its reopened SQLite database against a frozen expected result. This synthetic evidence does not establish JW Library restore acceptance.

### What remains before dependable use

See [MERGE_READINESS.md](src/tools/jw-library-merger/MERGE_READINESS.md) for the evidence and next work needed. The main remaining steps are:

- broaden populated-merge fixtures and negative browser cases for unsupported or unresolved data;
- restore the generated populated candidate in a disposable JW Library profile and confirm the app accepts it and the expected data survives;
- restore a generated populated backup in a disposable JW Library profile and confirm the app accepts it and the expected data survives;
- review unsupported schema/data cases and file-size or memory limits before dependable use.

The interface explains unresolved choices and blocks file creation when a record cannot be safely matched. Browser tests verify those user-facing gates; they do not establish acceptance by JW Library or by a real screen reader.

If JW Library rejects a generated POC, investigate the relevant manifest fields, including the hash behavior, as a follow-up to that observed result. Hash verification is not a prerequisite for making the first candidate file.

## Local development

Requirements: Node.js `^20.19.0` or `>=22.12.0` and npm.

```sh
npm install
npm run dev
```

Available scripts:

| Script | Purpose |
| --- | --- |
| `npm run build` | Check TypeScript types and create the production build in `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm test` | Run the Vitest unit tests. |
| `npm run test:e2e` | Run the Playwright end-to-end suite. |

Step 6 adds the playlist decision and successful synthetic playlist-download workflow. All 169 unit tests pass, all 33 browser runs pass across Chromium, Microsoft Edge, and Playwright WebKit, and the production build succeeds. Browser coverage includes valid and invalid input, file replacement and restart, separate place and playlist confirmations, per-publication content choices, playlist revocation and safe separate-retention decisions, byte/path/duration/missing-media/duplicate blockers, archive media-byte preservation, unchanged source-file digests, and the absence of request bodies. Responsive checks at 375, 768, and 1440 pixels cover place, conflict, and playlist layouts. Keyboard checks cover identity confirmation and A/B choice, visible focus, `aria-pressed`, and the polite live status after decisions change. Automated theme checks calculate text and focus-ring contrast in light and dark themes; these are not manual screen-reader or Apple Safari tests. A passing ZIP check does not demonstrate JW Library restore compatibility.

The seven previously failing Simple Mode scenarios were reviewed against the merge rules: content conflicts require a manual A/B choice; database and manifest timestamps are tested only on non-conflicting `changed` rows; timestamp offsets compare by instant; ties use the documented fallback; and the tests cover `Created` preservation and relationship reporting. The timestamp cases still leave uncertain `Location` rows unresolved, so they do not claim that a populated archive can be built. Manual `Created` preservation also records which backup supplied that field.

A populated conflict download built from the inspected real backups is still unverified. Place and playlist cards make user-confirmed links explicit for the current session; they do not prove that one identity rule applies to every real backup. Synthetic playlist-only output and media retention are verified; a broader populated conflict fixture with linked additions, per-source relationship accounting, and a JW Library restore test remain future work in this 0.4.0 round.

Step 7 tightens the SQLite build boundary: every source row must have an explicit selected, confirmed-alias, or omission destination. Foreign keys use indexed source lookups and the selected record's field provenance; missing mappings fail closed. The builder checks the transaction and then reopens and checks the exported database bytes, including foreign keys, integrity, and row counts. Verification after Step 7: 174 unit tests, 33 Playwright runs, and the production build passed.

Step 8 adds two populated synthetic source archives with different local IDs, two note conflicts in one publication, one conflict in another, a one-sided note, a mark with three linked ranges, a one-sided input field, and a playlist whose media bytes are available. A browser test runs the ordinary review flow, changes and confirms choices, revokes and restores the playlist confirmation, downloads the archive, verifies ZIP CRC, and compares table counts, selected note text, chosen title metadata, logical note targets, input fields, mark ranges, playlist structure, media bytes, SQLite integrity, and foreign keys with `tests/fixtures/jw-library/populated-flow-expected.json`. The route passes in Chromium, Microsoft Edge, and Playwright WebKit. Existing e2e cases retain the missing/invalid archive, missing-media, duplicate, unresolved-identity, source-replacement, restart, and choice-revocation blockers. Layout/theme and keyboard checks continue in the same suite. These fixtures are synthetic and do not prove JW Library acceptance; real-device restore remains outstanding.

Step 5 applies confirmed place links to notes, marks, bookmarks, input fields, and location-owned tag maps. Step 6 adds full playlist identity review and remapping of playlist items, media maps, place maps, markers, verse/paragraph references, and playlist-owned tags. A byte-identical synthetic playlist merges to one output item with its complete dependency graph and media; an explicit safe “different” decision builds two items. Unsafe path collisions, missing media, duplicates, and other unresolved structures block output. This is synthetic database/archive evidence; it does not establish JW Library restore compatibility.

## Technology and deployment

- React and TypeScript with Vite
- JSZip for `.jwlibrary` ZIP processing
- sql.js for browser-local SQLite processing
- No backend, account system, or database; selected backup contents are not uploaded
- Vite's `/toolbox/` base path and the GitHub Actions workflow support a GitHub Pages project site

The app can be built for GitHub Pages with `npm run build`; publish the generated `dist/` directory through the configured Actions workflow, not the repository root.

See [CHANGELOG.md](CHANGELOG.md), [Simple Mode rules](src/tools/jw-library-merger/SIMPLE_MODE_RULES.md), and [data model and archive limits](src/tools/jw-library-merger/DATA_MODEL.md) for implementation details.
