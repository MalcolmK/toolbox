# Changelog

## 0.1.22 — 2026-10-14

- Changed Preview Merge to a semantic route link for native keyboard and browser navigation behavior.

## 0.1.21 — 2026-10-14

- Moved the subpage return link to the upper-left area below the navigation toggle.

## 0.1.20 — 2026-10-14

- Removed the title bar from merger subpages and adjusted their top spacing.

## 0.1.19 — 2026-10-14

- Replaced the Toolbox title bar with a live app search, clear control, and accessible empty-results message.

## 0.1.18 — 2026-10-14

- Focused the active page heading after route changes, including the visible workflow headings on subpages.

## 0.1.17 — 2026-10-14

- Animated the navigation icon between hamburger and close states, respecting reduced-motion preferences.

## 0.1.16 — 2026-10-14

- Moved the shared navigation toggle to the upper-left corner and into the open drawer, removing the separate drawer close button.

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
