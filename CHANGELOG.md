# Changelog

## 0.2.0 — 2026-10-14

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
