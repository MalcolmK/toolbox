# Library Merger Toolbox

A responsive, browser-based toolbox for small utilities. The first tool is JW Library Merger. The app is built with React, TypeScript, and Vite and can be hosted as a static site on GitHub Pages.

Current development version: **0.2.0**.

## JW Library Merger

The merger reads selected `.jwlibrary` backups in the browser. File contents are not uploaded to a server. It validates supported schema-version-16 backups, compares their contents, and prepares a merge review.

### Use the merger

1. Open **JW Library Merger** and choose **Simple** or **Advanced** mode.
2. Select backup A and backup B. In Advanced mode, you may also select an older backup as the comparison base.
3. Start the comparison and review the timestamps, differences, uncertainty, and any information-loss details.
4. Resolve the decisions required by the selected mode. Advanced mode lets you inspect record conflicts and review note text by block or line.
5. In Simple mode, continue to **Build and validate backup**. The app enables the download only if database, manifest, and archive validation all succeed. The download control is implemented, but it is currently blocked by the unverified manifest hash rule described below. If validation succeeds in a future version, the app will offer the file and show a summary of counts, choices, uncertainties, and information that was not included.

The selected files are processed locally. The merger does not alter the source backups.

### Modes

- **Simple** prepares a plan that aims to retain as much information as possible and prefer newer data when reliable timestamps establish which source is newer. Uncertain choices remain unresolved for review.
- **Advanced** compares A and B, optionally against a base, and distinguishes one-sided, shared, independent, conflicting, and uncertain changes. Note text can be reviewed by block or line; unresolved overlaps require a choice.

### Current limitations

- Only schema version 16 is currently accepted.
- Advanced review decisions are not yet connected to the database builder.
- A resolved Simple mode plan can be turned into checked SQLite database bytes. The local build flow then checks the manifest and archive before offering a download.
- The JW Library manifest hash rule has not been verified. The app therefore blocks archive creation and keeps the download button disabled; it will not guess the hash or copy one from a source backup. This is the intended fail-safe behavior, not a failure of the download control. The post-download summary is consequently not currently reachable.
- No merged archive has yet been opened and restored in JW Library. App acceptance and retention of notes, marks, ranges, tags, and their relationships remain unverified.
- The download flow uses the browser's download API. Temporary object URLs and build state are released when the result is closed or a new comparison begins. Backup contents are not stored in `localStorage` or uploaded to a server.

### Next required verification

The manifest hash rule is the current critical-path item. Establish it from reliable JW Library evidence or repeatable comparisons of backups produced by JW Library; do not infer it from a single source backup or synthetic fixtures. Keep the export gate closed until the rule is covered by tests. Then create a merged file from synthetic content and verify acceptance and retained notes, marks, ranges, tags, and relationships in a disposable JW Library test library before enabling production downloads.

### Download validation status

The unit tests check ZIP round-tripping with CRC validation and block invalid manifests, unchecked database bytes, missing media, unsafe paths, conflicting archive entries, unresolved merge choices, and unverified hashes. The six Playwright workflow tests passed in Chromium and Microsoft Edge; they cover both merge modes, conflict review and revision, invalid-file feedback, responsive layouts, and the blocked download stage. Playwright WebKit was not installed and actual Safari was not tested. Successful production downloads remain unverified because the manifest hash rule is still unknown. A synthetic manifest used to exercise ZIP creation in a unit test does not establish that JW Library will accept the archive.

The merger is therefore a local comparison, review, and guarded build tool at this stage; it does not yet produce a merged backup to restore into JW Library.

See [the data model and archive limitations](src/tools/jw-library-merger/DATA_MODEL.md), [Simple mode rules](src/tools/jw-library-merger/SIMPLE_MODE_RULES.md), [Advanced mode decisions](src/tools/jw-library-merger/MERGE_DECISIONS.md), and [three-way comparison details](src/tools/jw-library-merger/THREE_WAY_COMPARISON.md).

## Other tools

Two **New Tool** cards are placeholders for future tools.

## Requirements

- Node.js `^20.19.0` or `>=22.12.0` (also recorded in `.nvmrc`).
- npm, included with Node.js.

## Run locally

```sh
npm install
npm run dev
```

Vite prints the local address. Press `Ctrl+C` to stop the development server.

## Available scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the development server with hot reload. |
| `npm run build` | Check TypeScript types and create the production build in `dist/`. |
| `npm run preview` | Serve the production build locally; run `npm run build` first. |
| `npm test` | Run the Vitest unit tests. |
| `npm run test:e2e` | Run the Playwright end-to-end tests. |

## Technology and privacy

- React and TypeScript
- Vite
- JSZip for browser-local archive processing
- sql.js for browser-local SQLite processing
- CSS Modules and shared CSS design tokens

The project has no backend, account system, or database. User-selected backup contents remain in the browser.

## GitHub Pages

Vite uses `/toolbox/` as its base path in `vite.config.ts`, matching the repository name for the GitHub Pages project site. The GitHub Actions workflow builds the app and deploys `dist/`. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. Do not publish the repository root directly: its `index.html` is the Vite source entry and points to uncompiled TypeScript.

## Project structure

```text
src/
  data/tools.ts                         # Toolbox entries
  App.tsx                                # App shell and navigation
  tools/jw-library-merger/
    archive/                             # .jwlibrary reading and manifest gate
    compare/                             # Two-way and three-way comparison
    database/                            # Validation, snapshots, and DB building
    merge/                               # Simple and Advanced merge planning
    components/                          # Merger screens and review UI
tests/
  fixtures/jw-library/                  # Synthetic backup fixtures
  unit/jw-library-merger/                # Merger unit tests
  e2e/                                   # Browser workflow tests
```

See [CHANGELOG.md](CHANGELOG.md) for changes by version, [DESIGN.md](DESIGN.md) for the design brief, and [DESIGN_IMPLEMENTATION_PLAN.md](DESIGN_IMPLEMENTATION_PLAN.md) for the implementation and verification plan.
