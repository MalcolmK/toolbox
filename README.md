# Library Merger Toolbox

A responsive, browser-based toolbox. Its first tool combines JW Library backup files locally in the browser.

Current development version: **0.3.0**.

## JW Library Merger

### Use the current Simple Mode flow

1. Choose two `.jwlibrary` backup files.
2. Select **Vergelijk back-ups**. Review the short result summary and, for each publication with an eligible conflict, choose whether version A or B should be kept. Open the detail sections to inspect other changes or uncertain records.
3. If the plan is ready, select **Maak mergebestand** and download the POC file.

The files stay on your device and the source backups are not changed. Each A/B choice applies only to the eligible conflicts shown under that publication. Records with uncertain identities or relationships remain unresolved and continue to block file creation. The result shows how many publication choices remain. A POC notice appears as soon as the comparison finishes: ZIP and database checks do not prove that JW Library accepts the generated backup. Advanced Mode is temporarily unavailable in the interface; its code remains in the project.

### What the download means

The browser checks the input archives and supported database schema. For a ready plan, it builds a SQLite database, checks database and foreign-key integrity, writes the archive, then reopens the ZIP and checks its CRC and contents. The current interface can offer a **POC `.jwlibrary` download** when those checks pass.

This is an experimental JW Library backup. The POC uses a source hash without claiming to verify its formula; confirming that formula is not a prerequisite for making the first candidate file. No generated file has yet been accepted and restored in JW Library. If JW Library rejects the candidate, investigate the manifest and hash behavior using that result. Do not treat a successful ZIP check as proof of JW Library acceptance.

For each safely identified publication with a `possible-conflict`, Simple Mode asks whether to keep version A or B; timestamps do not choose between conflicting content. Some comparisons remain unresolved when record identity or relationships are ambiguous. A publication choice cannot resolve uncertain identities or relationships, so Simple Mode withholds the download while any such blockers remain. The synthetic populated conflict fixtures still block file creation because their `Location` identities are only candidates; the current successful download fixture uses empty, schema-valid libraries.

### What remains before dependable use

See [MERGE_READINESS.md](src/tools/jw-library-merger/MERGE_READINESS.md) for the evidence and next work needed. The main remaining steps are:

- exercise representative populated merges with synthetic notes, marks, tags, relationships, and media, including conflict and unsupported-data cases;
- confirm that publication choices in a safely resolvable populated fixture produce the expected database and archive contents;
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

The complete Simple Mode e2e suite now passes: 27 browser runs across nine workflows in Chromium, Microsoft Edge, and Playwright WebKit. It covers valid and invalid input, file replacement and restart, per-publication choices, blocking on uncertain identities, local POC generation and download, expected archive entries, unchanged source-file digests, and the absence of request bodies. Responsive checks at 375, 768, and 1440 pixels cover source selection and populated conflict cards; they check horizontal overflow, one-column versus two-column layouts, and whether both A/B controls fit inside each card. Keyboard checks cover reaching and activating an A/B choice, visible focus, `aria-pressed`, and the polite live status after a choice changes. Automated theme checks calculate text and focus-ring contrast for the conflict heading and selected choice against the card/canvas surfaces in light and dark themes; these are browser-rendered color checks, not manual testing with a real screen reader or Apple Safari. The populated conflict fixture intentionally remains blocked by uncertain `Location` identities, so successful download coverage currently uses empty, schema-valid libraries. A passing ZIP check does not demonstrate JW Library restore compatibility.

## Technology and deployment

- React and TypeScript with Vite
- JSZip for `.jwlibrary` ZIP processing
- sql.js for browser-local SQLite processing
- No backend, account system, or database; selected backup contents are not uploaded
- Vite's `/toolbox/` base path and the GitHub Actions workflow support a GitHub Pages project site

The app can be built for GitHub Pages with `npm run build`; publish the generated `dist/` directory through the configured Actions workflow, not the repository root.

See [CHANGELOG.md](CHANGELOG.md), [Simple Mode rules](src/tools/jw-library-merger/SIMPLE_MODE_RULES.md), and [data model and archive limits](src/tools/jw-library-merger/DATA_MODEL.md) for implementation details.
