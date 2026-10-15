# Library Merger Toolbox

A responsive, browser-based toolbox for small utilities. The first tool is JW Library Merger. The app is built with React, TypeScript, and Vite and can be hosted as a static site on GitHub Pages.

Current development version: **0.2.1**.

## JW Library Merger

The merger reads selected `.jwlibrary` backups in the browser. File contents are not uploaded to a server. It validates supported schema-version-16 backups, compares their contents, and prepares a merge review.

### Use the merger

1. Open **JW Library Merger** and choose **Simple** or **Advanced** mode.
2. Select backup A and backup B. In Advanced mode, you may also select an older backup as the comparison base.
3. Start the comparison and review the timestamps, differences, uncertainty, and any information-loss details.
4. Resolve the decisions required by the selected mode. Advanced mode lets you inspect record conflicts and review note text by block or line.
5. In either mode, continue to **Naar bestand maken** and create the POC archive. Before downloading, the app identifies the output as a POC, states that the copied source hash is unverified, and labels the action **Download POC-bestand**. Advanced mode uses only reviewed A/B decisions; an optional base is comparison-only.

The selected files are processed locally. The merger does not alter the source backups.

### Modes

- **Simple** prepares a plan that aims to retain as much information as possible and prefer newer data when reliable timestamps establish which source is newer. Uncertain choices remain unresolved for review.
- **Advanced** compares A and B, optionally against a base, and distinguishes one-sided, shared, independent, conflicting, and uncertain changes. Note text can be reviewed by block or line; unresolved overlaps require a choice.

For larger backups, the comparison reuses local lookup indexes for relationships and candidate identities instead of repeatedly scanning full tables. This improves comparison speed without changing which records are considered safe matches; uncertain identities remain unresolved and continue to block unsafe output.

### Current limitations

- Only schema version 16 is currently accepted.
- Advanced review decisions are converted to a source-attributed database plan, including field provenance and explicit loss reporting. A resolved plan can proceed through the same checked database, manifest, media, and archive stages as Simple mode.
- A resolved Simple mode plan can be turned into checked SQLite database bytes. The local build flow then checks the manifest, required media, and archive before offering a download. The guarded writer creates a ZIP-based `.jwlibrary` file only when these checks pass.
- The verified production manifest route remains fail-closed because the JW Library manifest hash rule has not been verified. It does not guess or copy a hash. Both modes offer a separate POC download with a copied, explicitly unverified source hash. Neither output has been opened in JW Library; the user will check POC acceptance.
- No merged archive has yet been opened and restored in JW Library. App acceptance and retention of notes, marks, ranges, tags, and their relationships remain unverified.
- The download flow uses the browser's download API. Temporary object URLs and build state are released when the result is closed or a new comparison begins. Backup contents are not stored in `localStorage` or uploaded to a server.

### POC scope and completion criteria

The implementation now provides a download path in **both Simple and Advanced mode** when a plan is fully resolved and all row identities and relationships are safe. In Advanced mode, **Naar bestand maken** is hidden until the review is confirmed and the planner returns `ready`; the information-loss overview is available in the review before that point. Automated tests cover the hidden-before/visible-after gate, while unit tests verify that unconfirmed or unsafe plans stay blocked. The successful-download browser scenario uses an empty synthetic library; the non-empty identical fixture currently remains blocked in Advanced mode because several rows lack identities the merger can safely reconcile. Therefore, the current Advanced download test does not prove that a non-empty library can be merged. The POC file is available for the user's JW Library acceptance check only for inputs that pass these gates; this does not establish that the app accepts or restores it.

- Simple mode uses its existing merge plan. Advanced mode must pass its reviewed A/B decisions to the database builder; an optional base is comparison-only and is never an output source.
- The POC uses only merge decisions and actions that the current review interface already exposes. It does not add a new whole-record “keep both” action; where the existing note-text review permits both non-overlapping fragments, that choice remains available and its omissions must be disclosed.
- The POC may copy the manifest hash from a selected source manifest. That hash remains explicitly unverified; the POC must not label it `hashVerified` or claim JW Library compatibility.
- Database integrity, foreign-key, media, safe-path, archive round-trip, and CRC checks remain required. Unresolved choices or unsafe relationships block the download.
- The interface identifies the download as a POC, discloses the unverified hash before download, and shows known choices and omitted information.
- The user will check whether JW Library accepts the downloaded file. A successful restore and complete data-retention proof are outside this POC's completion criteria.
- Broad memory-limit work, hash-rule research, cross-browser certification, and production release checks are not required to complete this POC.
- Supplied personal backups are for local analysis or the user's own later acceptance check only; never add them to the repository or test fixtures. The optional Advanced base is comparison-only, and only A/B can contribute output data.

Keep the existing production hash-verification route separate from the explicitly provisional POC route. All work remains under version **0.2.1**.

### Download validation status

The unit tests check ZIP round-tripping with CRC validation and block invalid manifests, unchecked database bytes, missing media, unsafe paths, conflicting archive entries, unresolved merge choices, unsafe Advanced identities, and unverified hashes. They also verify that production and POC writers reject each other's manifest status, and that an Advanced comparison base cannot contribute output records or the provisional hash. The writer reopens each generated archive, compares the stored database bytes exactly with the checked bytes supplied by the database builder, and requires all selected media entries to be present. Playwright reads back the actual downloaded `.jwlibrary` in both modes, reopens it with ZIP CRC checking, and verifies that the manifest and its named database are present. It also compares SHA-256 digests of the selected source files before and after each download flow. The successful-download fixtures are empty schema-valid libraries. On 2026-10-15, the production build passed, all 114 unit tests passed, and all 21 browser runs passed (seven each in Chromium, Microsoft Edge, and WebKit). WebKit is automated Safari-engine coverage, not a substitute for testing in Apple's Safari. Successful production downloads remain unavailable by design, and JW Library acceptance/restore has not been verified.

Run `npm run test:e2e` to execute all browser projects. Use `npm run test:e2e:edge` or `npm run test:e2e:webkit` to rerun one project. Install required local browsers with `npx playwright install chromium webkit`; the Edge project also requires Microsoft Edge Stable to be installed. On CI, the workflow installs Chromium, Edge, and WebKit before running each project.

Use Node.js **22.23.3**, recorded in `.node-version`, for local development and tests. With fnm, run `fnm use` in the repository and confirm `node --version` reports `v22.23.3` before starting the app or tests. The GitHub Actions browser workflow uses the same version.

Vite uses its native config loader (currently marked experimental by Vite) and Vitest uses worker threads so builds and unit tests do not need the blocked child-process path that caused Windows `spawn EPERM` in restricted shells. Playwright still has to launch real browser processes, so run its browser suite in a normal local shell or a CI runner that permits process creation.

The merger can now produce a POC `.jwlibrary` download in Simple and Advanced modes after its local database and archive checks. This does not establish that JW Library accepts or restores the file.

### POC implementation gap assessment

This assessment is based on the current source and test files, not on an assumed future implementation:

- **Already available:** local `.jwlibrary` reading and schema-16 validation; Simple mode planning and information-loss reporting; Advanced mode comparison and in-page conflict/text review; checked SQLite building for resolved Simple and Advanced plans; a ZIP writer with path, media, collision, CRC, and archive-reopen checks; and a browser download component that accepts only a ready writer result.
- **POC manifest and archive route:** `buildManifest` still returns `blocked`, and the production writer only accepts a manifest explicitly marked `hashVerified`. `buildPocManifest` separately copies the chosen source's non-empty hash and returns `ready-unverified` with `hashVerified: false`; it preserves unknown source metadata and updates the output database path and timestamps. `writePocJwLibrary` accepts only that explicitly unverified result, applies the same database/media/path/collision/ZIP integrity checks, and marks successful output `poc-unverified`.
- **Simple mode connection:** `buildSimplePocJwLibrary` runs the resolved Simple plan through checked SQLite building, chooses the newer source hash using Simple mode's database-first timestamp ordering (then manifest time when database ordering is unavailable), builds a clearly unverified POC manifest, and invokes the POC archive writer. If no reliable order exists, A is the deterministic hash-source fallback and the result records that provenance. The UI now offers this route and shows the POC/hash warning before the download action.
- **Advanced mode connection:** `buildAdvancedMergePlan` converts reviewed A/B choices into the database builder's plan shape. It carries per-field source provenance for safe foreign-key remapping, reports discarded values, supports resolved note-text composition, and blocks unresolved decisions, unstable identities, and unsupported actions. `buildAdvancedPocJwLibrary` sends only A/B through checked SQLite construction, chooses the provisional manifest hash source from timestamps, and runs the same POC archive checks. The optional base never contributes output data.
- **Test coverage boundary:** unit tests cover merge planning, database safeguards, manifest blocking, archive construction mechanics and failure cases, and both POC build paths. Playwright checks the `.jwlibrary` download in both modes, reopens its ZIP with CRC checking, verifies the manifest and named database entry, compares source-file SHA-256 digests before and after, and confirms that backup contents are not uploaded. JW Library acceptance and restoration remain the user's manual check.
- **Completion evidence so far:** both modes download `.jwlibrary` files from the empty synthetic pair. Automated browser tests reopen the downloaded files as ZIPs with CRC checking and verify the manifest and named database entries; source-file SHA-256 digests remain the same across both download flows. The archive writer also checks that the database entry exactly matches the checked database bytes supplied to it. Unresolved or unsafe Advanced plans are blocked. Non-empty Advanced output is not yet demonstrated because the current synthetic populated pair has rows with identities that cannot be safely reconciled. These checks establish archive construction and byte preservation through the download flow, not that JW Library accepts or restores the file. JW Library acceptance remains the user's separate manual check.

This gap assessment does not add a requirement to verify the hash algorithm, restore the file in JW Library, or run a full browser/platform matrix for this POC.

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
    archive/                             # .jwlibrary reading, manifest gate, and guarded ZIP writer
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
