# Library Merger Toolbox

A responsive, browser-based toolbox. Its first tool combines JW Library backup files locally in the browser.

Current development version: **0.3.0**.

## JW Library Merger

### Use the current Simple Mode flow

1. Choose two `.jwlibrary` backup files.
2. Select **Vergelijk en maak merge**. Review the summary and, for each publication with an eligible conflict, choose whether version A or B should be kept. Open the detail sections to inspect other changes or uncertain records.
3. If the plan is ready, select **Maak mergebestand** and download the POC file.

The files stay on your device and the source backups are not changed. Advanced Mode is temporarily unavailable in the interface; its code remains in the project.

### What the download means

The browser checks the input archives and supported database schema. For a ready plan, it builds a SQLite database, checks database and foreign-key integrity, writes the archive, then reopens the ZIP and checks its CRC and contents. The current interface can offer a **POC `.jwlibrary` download** when those checks pass.

This is an experimental JW Library backup. The POC copies a source hash without claiming to verify its formula; confirming that formula is not a prerequisite for making the first candidate file. No generated file has yet been accepted and restored in JW Library. If JW Library rejects the candidate, manifest behavior can be investigated from that result.

Some comparisons remain unresolved when record identity, timestamps, or relationships are ambiguous. Simple Mode intentionally does not guess. It withholds the download and shows the open items; the review interface that could resolve them is not currently exposed.

### What remains before dependable use

See [MERGE_READINESS.md](src/tools/jw-library-merger/MERGE_READINESS.md) for the evidence and next work needed. The main remaining steps are:

- verify the manifest hash rule against controlled JW Library-generated backups and keep the production export gate closed until then;
- exercise representative populated merges with synthetic notes, marks, tags, relationships, and media, including conflict and unsupported-data cases;
- decide how users should handle unresolved Simple Mode choices while Advanced Mode is unavailable;
- restore a generated populated backup in a disposable JW Library profile and confirm the app accepts it and the expected data survives;
- refresh the browser workflow checks to match the Simple-only interface and verify narrow, tablet, and wide layouts.

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

The e2e suite was written for the previous interface and includes Advanced Mode interactions. Update those workflow checks before treating the suite as current verification for version 0.3.0.

## Technology and deployment

- React and TypeScript with Vite
- JSZip for `.jwlibrary` ZIP processing
- sql.js for browser-local SQLite processing
- No backend, account system, or database; selected backup contents are not uploaded
- Vite's `/toolbox/` base path and the GitHub Actions workflow support a GitHub Pages project site

The app can be built for GitHub Pages with `npm run build`; publish the generated `dist/` directory through the configured Actions workflow, not the repository root.

See [CHANGELOG.md](CHANGELOG.md), [Simple Mode rules](src/tools/jw-library-merger/SIMPLE_MODE_RULES.md), and [data model and archive limits](src/tools/jw-library-merger/DATA_MODEL.md) for implementation details.
