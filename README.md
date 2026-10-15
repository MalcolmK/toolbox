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

Open implementation, test-coverage, and release-readiness items are tracked in [IMPLEMENTATION_TODO.md](IMPLEMENTATION_TODO.md). The project evidence and the distinction between technical ZIP/database checks and JW Library acceptance are in [MERGE_READINESS.md](src/tools/jw-library-merger/MERGE_READINESS.md).

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

## Technology and deployment

- React and TypeScript with Vite
- JSZip for `.jwlibrary` ZIP processing
- sql.js for browser-local SQLite processing
- No backend, account system, or database; selected backup contents are not uploaded
- Vite's `/toolbox/` base path and the GitHub Actions workflow support a GitHub Pages project site

The app can be built for GitHub Pages with `npm run build`; publish the generated `dist/` directory through the configured Actions workflow, not the repository root.

See [CHANGELOG.md](CHANGELOG.md), [Simple Mode rules](src/tools/jw-library-merger/SIMPLE_MODE_RULES.md), and [data model and archive limits](src/tools/jw-library-merger/DATA_MODEL.md) for implementation details.
