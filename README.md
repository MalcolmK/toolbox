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
5. In Simple mode, continue to **Build and validate backup**. The app enables the download only if database, manifest, media, and archive validation all succeed. The download control is implemented, but it is currently blocked by the unverified manifest hash rule described below. When the gate can pass, the archive writer names the ZIP-based output with a `.jwlibrary` extension and the app shows a summary of counts, choices, uncertainties, and information that was not included. The extension alone does not establish that JW Library accepts the file; restore acceptance still needs to be verified.

The selected files are processed locally. The merger does not alter the source backups.

### Modes

- **Simple** prepares a plan that aims to retain as much information as possible and prefer newer data when reliable timestamps establish which source is newer. Uncertain choices remain unresolved for review.
- **Advanced** compares A and B, optionally against a base, and distinguishes one-sided, shared, independent, conflicting, and uncertain changes. Note text can be reviewed by block or line; unresolved overlaps require a choice.

### Current limitations

- Only schema version 16 is currently accepted.
- Advanced review decisions are not yet connected to the database builder.
- A resolved Simple mode plan can be turned into checked SQLite database bytes. The local build flow then checks the manifest, required media, and archive before offering a download. The guarded writer creates a ZIP-based `.jwlibrary` file only when these checks pass.
- The JW Library manifest hash rule has not been verified. The app therefore blocks archive creation and keeps the download button disabled; it will not guess the hash or copy one from a source backup. This is the intended fail-safe behavior, not a failure of the download control. The post-download summary is consequently not currently reachable.
- No merged archive has yet been opened and restored in JW Library. App acceptance and retention of notes, marks, ranges, tags, and their relationships remain unverified.
- The download flow uses the browser's download API. Temporary object URLs and build state are released when the result is closed or a new comparison begins. Backup contents are not stored in `localStorage` or uploaded to a server.

### Next work instructions

These are planned verification and implementation steps; they have not been completed. Keep the production export gate closed throughout this work. The release version remains **0.2.0** until a separately agreed change round.

1. **Use the supplied JW Library backups as read-only evidence.** Compare the two previously supplied `.jwlibrary` backups without changing or repackaging them. Record each archive's size and entries, manifest fields and timestamps, database path and size, and a cryptographic digest of the raw database bytes. Keep the original files on the user's device; do not add them, their notes, or other personal contents to the repository. In the supplied pair, the manifest hash value is the same while the bytes at the manifest-referenced database path differ. Standard SHA-256 and SHA-256 encoded as unpadded per-byte hexadecimal both fail to match the manifest value for these files. This is evidence against a direct digest of the exported database bytes using those encodings; it does not rule out a hash over normalized SQLite content, a pre-export representation, or another input, and it does not establish the rule.
2. **Collect independent evidence for the hash rule.** Look for an authoritative JW Library specification or implementation. If none is available, obtain several controlled backups created by JW Library, including repeated exports with no library change and exports after a known, isolated change. Record the JW Library version, platform, export time, manifest value, and database digest for each. Do not infer the rule from one pair, one unchanged hash, or synthetic fixtures.
3. **Compare explicit hash hypotheses.** First confirm the exact `userDataBackup.databaseName` path and hash field used in each manifest. Then compare raw database bytes with logical SQLite content: distinguish file-level changes (such as page layout or serialization) from changed rows and values, without copying personal content into reports or tests. For every candidate input and encoding, calculate the result independently and compare it with the manifest value across all controlled backups. Include raw database bytes and candidates supported by authoritative evidence; document casing, byte order, text encoding, and whether compression, a pre-export representation, or selected database fields are involved. Accept a rule only when it explains both unchanged and changed exports reproducibly. If evidence is incomplete or contradictory, document the uncertainty and leave the gate blocked.
4. **Implement the proven rule behind the existing gate.** Keep manifest creation fail-closed until the evidence is reviewed. Add tests for known-good and known-bad hash cases, changed database bytes, malformed inputs, and each relevant encoding or boundary condition. Tests based on synthetic data can verify the implementation mechanics, but must not be described as proof of JW Library compatibility.
5. **Validate a synthetic merged backup before any production release.** Build a `.jwlibrary` file from synthetic library data, verify the manifest, database, ZIP entries, CRCs, required media, and output extension, then try restoring it in a disposable JW Library test library. Check that JW Library accepts it and that notes, highlights/marks, ranges, tags, media, and their relationships remain correct. Never use a personal library as the first restore test. Keep downloads blocked if a compatible test app/device is unavailable or any check fails.
6. **Add memory preflight before processing user files.** Read `File.size` immediately after selection and show each backup's size and the combined size before loading their contents. Choose conservative archive and database limits from repeatable tests on the least-capable supported devices; do not present a device-memory API value as a guaranteed safe limit. If a file exceeds a tested limit, explain why and stop before processing.
7. **Check ZIP expansion and workload bounds.** Before database processing, validate archive entry count, declared uncompressed sizes, total expanded size, database size, compression ratios, and integer bounds. Reject malformed or unreasonable metadata, including ZIP-bomb-like expansion. Treat ZIP metadata as untrusted input and as an estimate until actual decompression confirms it. Keep the limits and messages understandable to the user.
8. **Make resource failures fail safely.** Account for the fact that ZIP and SQLite processing can hold multiple in-memory copies. On any read, decompression, allocation, database, manifest, or archive error, stop the operation, release temporary resources where possible, explain that no output was produced, and never enable a partial download. The original selected backups must remain untouched. A browser tab can still be terminated before JavaScript can show an error, so validate on supported desktop and mobile browsers and keep tested size limits conservative.
9. **Connect Advanced mode to the guarded build.** After the Simple mode output rules have a verified implementation, translate resolved Advanced mode record and text decisions into database-builder inputs. Preserve the review's source/base choices, keep-both/manual-text outcomes where allowed, unresolved-conflict blocking, provenance, and explicit information-loss reporting. Add tests that compare the reviewed decisions with the built database; do not let a completed review screen imply that an export is available until this handoff is implemented and validated.
10. **Verify and document the completed work.** Add synthetic tests for file-size boundaries, expanded-size limits, malformed ZIP metadata, extreme compression ratios, and errors at each processing stage. Exercise the relevant browser flows at phone, tablet, and desktop sizes in Chromium, Edge, and WebKit where available; verify important Safari file workflows in actual Safari when a Mac is available. Update this README and the technical data-model notes with the evidence, limits, test results, and any remaining blockers. Do not enable production download until the hash rule, Advanced mode handoff, and JW Library restore acceptance are verified.

### Download validation status

The unit tests check ZIP round-tripping with CRC validation and block invalid manifests, unchecked database bytes, missing media, unsafe paths, conflicting archive entries, unresolved merge choices, and unverified hashes. The six Playwright workflow tests passed in Chromium and Microsoft Edge; they cover both merge modes, conflict review and revision, invalid-file feedback, responsive layouts, and the blocked download stage. Playwright WebKit was not installed and actual Safari was not tested. File-size and expanded-ZIP memory preflight are planned work and are not yet implemented. Successful production downloads remain unverified because the manifest hash rule is still unknown. A synthetic manifest used to exercise ZIP creation in a unit test does not establish that JW Library will accept the archive.

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
