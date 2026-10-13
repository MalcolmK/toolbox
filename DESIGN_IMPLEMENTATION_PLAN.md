# Design Prototype Implementation Plan

## 1. Purpose of this document

This is a step-by-step implementation guide for a junior developer building the first **clickable visual prototype** of the toolbox. Follow the project's `AGENTS.md` and the current screenshots as requirements. Read `DESIGN.md` for the shorter design brief and this document for the implementation sequence, decisions, and completion checks.

The deliverable is a responsive, accessible design prototype in which a reviewer can move between the toolbox home screen and a representative JW Library Merger screen, open and close navigation, and change themes. It must look credible at phone, tablet, and desktop sizes.

This phase does **not** build the actual library-merging tool. A control may navigate, open a modal, reveal a menu, or display a representative mock state, but it must not read files, parse JSON, inspect/create ZIP archives, merge data, or download output.

## 2. Read these sources in this order

1. `AGENTS.md` — project constraints, stack, browser support, accessibility, testing, versioning, and GitHub workflow.
2. `DESIGN.md` — current visual intent and decisions still open.
3. `Dark theme.png` and `Light theme.png` — current composition references. Their visible Dutch placeholder labels are replaced with English product copy.
4. This plan — execution steps and acceptance criteria for this design-only round.

If a detail conflicts, use this priority: explicit project constraints in `AGENTS.md`; concrete composition shown in the latest screenshots; clarified design intent in `DESIGN.md`; implementation suggestions in this plan. Raise a concise question only if a genuine design decision blocks a coherent implementation. Otherwise use the defaults below and record any reversible choice in the pull request or handoff.

## 3. What the reference images specify

Use the 1586 × 992 images as proportion and hierarchy references, not as fixed-pixel canvases.

### 3.1 Shared composition

- An abstract full-window background with large curved/orbital shapes, diffuse light spots, and luminous edges.
- A left-side translucent navigation drawer, shown open in both references.
- A close (X) control at the top of the drawer.
- A selected JW Library Merger navigation row with an open-book icon.
- A divider below navigation.
- A lower theme section with sun and moon choices, separated from navigation and version information.
- Version `v0.1.0` near the bottom of the drawer.
- In the remaining main area, a long rounded header containing a hamburger control, vertical divider, and **Toolbox** title.
- A centered, rounded, outlined glass surface containing three cards in one row on the desktop reference.
- The first card is **JW Library Merger** with the open-book mark; the following two cards are plus-icon **New Tool** placeholders.
- A thin cyan/teal accent and glow identify the active tool and selected theme.

### 3.2 Dark theme

Use a deep navy/graphite base, layered blue glass, cool fine borders, light text, and a restrained cyan highlight. Preserve enough contrast that text and control boundaries remain legible without relying on glow.

### 3.3 Light theme

Keep the composition, size relationships, and hierarchy aligned with dark mode. Use pale blue/white illuminated surfaces, dark blue-gray text, subtle borders, and the same cyan highlight. Do not create a separate light-mode layout.

### 3.4 Content language

The screenshots include “Nieuwe tool”. The repository is an English-language open-source project, so render **New Tool** in the prototype. Keep visible UI copy, comments, component names, and documentation added in this round in English. Preserve proper product names such as **JW Library Merger**.

## 4. Phase outcome and scope boundary

### Build in this round

- The React/Vite visual shell using the agreed TypeScript stack.
- Toolbox home page with the reference's three-card desktop composition.
- A responsive left drawer that opens and closes.
- Theme controls that change the interface between light and dark appearance. Save the selected theme locally, because theme selection and remembered preference are part of the project's stated design requirements.
- Clickable navigation from the tool launcher to a designed JW Library Merger screen and back.
- A representative merger screen with realistic layout and labelled controls, using mock content only.
- Prototype-only interactions (for example, a mock dialog, selected option, or simulated status) where they make the visual flow reviewable.
- Responsive and keyboard-accessible behavior, graceful visual fallbacks, and documentation of what is intentionally simulated.

### Do not build in this round

- File selection or file-system access.
- JSON parsing, schema checking, or validation.
- ZIP reading or writing; do not add JSZip yet.
- Library merge algorithms or actual data transformation.
- Real output generation, download, upload, network calls, backend, account, or database behavior.
- Production promises for the two New Tool cards.
- Analytics, telemetry, or remote fonts/images.

If a file-related control is shown for design review, make it a clearly simulated control that opens a mock selection/status panel. Do not attach a file input or call a browser file API in this phase.

## 5. Technical decisions

- **Language:** TypeScript for application code; English for all new project-facing copy and comments.
- **UI:** React.
- **Markup:** semantic HTML elements written in React TSX (`.tsx`); do not build page structure from generic clickable elements.
- **Stylesheet language:** standard CSS, including CSS custom properties and CSS Modules (`.module.css`). No Sass/SCSS or Less is needed for this phase.
- **Tooling runtime:** use the Node.js version and package manager already indicated by the repository and lockfile. If none exists, record a supported Node.js version and select one package manager before setup; do not maintain multiple lockfiles.
- **Configuration/data formats:** keep Vite/package configuration in its existing format and keep small static tool-card data typed in TypeScript rather than introducing JSON that duplicates UI definitions.
- **Build and local development:** Vite.
- **Deployment shape:** static site compatible with GitHub Pages; no server runtime.
- **Routing:** use a small in-app view/state or a hash-based route so direct refresh on GitHub Pages does not require server rewrite configuration. Avoid introducing a routing dependency unless the existing project already has one or the need is demonstrated.
- **Styling:** CSS custom properties for the shared design system and CSS Modules for component-local styles. Use plain global CSS only for resets, typography, theme tokens, and app-wide layout rules. Do not add a CSS framework, utility-class framework, CSS-in-JS library, or preprocessor for this prototype.
- **Icons:** prefer a small, consistent inline SVG set or an already-installed icon library. Do not bring in a large icon dependency for the few symbols in the reference.
- **Background art:** use a local, optimized asset or CSS/SVG. Never load it from a remote URL at runtime. Keep a fallback background if blur is unsupported.
- **Theme storage:** browser `localStorage` for the explicit light/dark choice, with system preference as the initial value before a choice is stored. Guard storage access if it throws.
- **Design tokens:** CSS custom properties for semantic colors, accent, surfaces, typography, spacing, radii, shadows, and motion values. Theme and brand values must be centralized; component styles must consume semantic tokens rather than hard-coded colors.

Before adding or changing dependencies, explain the practical benefit in the implementation notes and keep the addition minimal, as required by `AGENTS.md`.

## 6. Suggested component and file boundaries

First inspect the repository. Reuse an existing suitable structure instead of moving files to match this example. If the project is still empty, a simple structure like this is sufficient:

```text
src/
  app/
    App.tsx
    viewState.ts
  components/
    AppShell/
      AppShell.tsx
      AppShell.module.css
    AppHeader/
      AppHeader.tsx
      AppHeader.module.css
    NavigationDrawer/
      NavigationDrawer.tsx
      NavigationDrawer.module.css
    ThemeControl/
      ThemeControl.tsx
      ThemeControl.module.css
    ToolCard/
      ToolCard.tsx
      ToolCard.module.css
    GlassPanel/
      GlassPanel.tsx
      GlassPanel.module.css
    PrototypeDialog/
      PrototypeDialog.tsx
      PrototypeDialog.module.css
  pages/
    ToolboxPage.tsx
    LibraryMergerPrototypePage.tsx
  data/
    tools.ts
  styles/
    tokens.css
    base.css
    layout.css
  main.tsx
public/
  ... locally bundled decorative assets, if used
```

Keep component roles narrow:

- `AppShell` owns the page frame, theme class/attribute, and shared header/drawer placement.
- `AppHeader` owns the menu toggle and current page title.
- `NavigationDrawer` owns the drawer surface, close behavior, tool navigation, theme section, and version display.
- `ThemeControl` displays and changes theme; it does not own unrelated navigation.
- `ToolCard` renders a full-card navigation target from a tool descriptor.
- `ToolboxPage` lays out available tool cards, but does not implement each tool.
- `LibraryMergerPrototypePage` is a visual mock screen, separate from future merge logic.
- `tools.ts` is the single small list of displayed tool entries, including placeholders, so card content is not duplicated across components.
- Keep version display sourced from the project's existing central version location if one exists. Do not create multiple hard-coded version strings. If there is no central version setup, keep the prototype at `v0.1.0` and document the chosen source.

These are boundaries, not a requirement to create a file for every component. Avoid unnecessary abstraction for a small prototype. Keep the theme token files global and predictable; use CSS Modules only where styles belong to a specific React component.

### 6.1 CSS organization and theme contract

Use this styling organization unless the repository already has a compatible convention that satisfies every rule below:

```text
src/styles/
  tokens.css       /* brand primitives and semantic light/dark tokens */
  base.css         /* reset, font stack, document defaults, global focus */
  layout.css       /* app frame, shared page layout, responsive shell rules */
src/components/
  AppHeader/
    AppHeader.tsx
    AppHeader.module.css
  ToolCard/
    ToolCard.tsx
    ToolCard.module.css
```

Import global styles through one stylesheet entry, `src/styles/index.css`, which imports `tokens.css`, `base.css`, and `layout.css` in that order. The Vite application entry point must import `index.css` exactly once. Import each `.module.css` only from its owning component. Do not duplicate theme definitions in component files. If the repository has no app entry point yet, create the stylesheet entry now and connect it when the Vite scaffold is created; do not add an empty placeholder `main.tsx` just to satisfy the import.

Organize `tokens.css` in three layers:

1. **Brand primitives:** a small set of source values that express the adjustable brand choice, especially the accent. For example, define light- and dark-theme accent values (and, if needed for effects, their soft/glow variants) together in a clearly labelled block. A future accent refresh should require editing only this small block.
2. **Semantic theme tokens:** names based on purpose, such as `--color-accent`, `--text-primary`, `--text-muted`, `--surface-page`, `--surface-panel`, `--surface-card`, `--border-subtle`, `--focus-ring`, and `--shadow-panel`. Define the light and dark values in one place each under `:root, [data-theme="dark"]` and `[data-theme="light"]` (or an equivalent explicit scheme).
3. **Component styling:** CSS Modules refer only to semantic tokens, for example `color: var(--text-primary)` and `border-color: var(--border-subtle)`. Component styles must not contain palette literals such as `#54e8f2`, `navy`, or `rgb(...)` for theme-dependent colors.

Example contract (illustrative values only; not a final brand palette):

```css
/* tokens.css */
:root {
  --brand-accent-light: #12bfd4;
  --brand-accent-dark: #54e8f2;
  --brand-accent-soft-light: rgb(18 191 212 / 12%);
  --brand-accent-soft-dark: rgb(84 232 242 / 14%);
}

:root,
[data-theme="dark"] {
  color-scheme: dark;
  --color-accent: var(--brand-accent-dark);
  --color-accent-soft: var(--brand-accent-soft-dark);
  --text-primary: #f4f8fc;
  --text-muted: #b7c8d8;
  --surface-page: #071522;
  --surface-panel: rgb(23 43 61 / 76%);
  --surface-card: rgb(35 58 77 / 72%);
  --border-subtle: rgb(190 220 245 / 24%);
  --focus-ring: var(--color-accent);
}

[data-theme="light"] {
  color-scheme: light;
  --color-accent: var(--brand-accent-light);
  --color-accent-soft: var(--brand-accent-soft-light);
  --text-primary: #19314d;
  --text-muted: #49627c;
  --surface-page: #eaf3fc;
  --surface-panel: rgb(255 255 255 / 74%);
  --surface-card: rgb(255 255 255 / 62%);
  --border-subtle: rgb(50 90 130 / 18%);
  --focus-ring: #007f96;
}
```

When the accent changes, update the brand accent values in this file, then check contrast and visibility in both themes. Keep the focus ring independently adjustable if the new accent does not meet focus contrast requirements. Do not use color alone to signal state. Decorative glow may use the soft accent token, but content readability and control boundaries must remain intact when glow is removed.

### 6.2 CSS rules for maintainability

- Use semantic token names, not names tied to a temporary hue (prefer `--color-accent` to `--cyan`).
- Keep light/dark values adjacent in `tokens.css`; do not create separate, scattered theme stylesheets that slowly diverge.
- Keep structure and layout identical between themes. Theme selectors change token values, not duplicate whole component rules.
- Component modules own their component's layout and state selectors; shared shell layout stays in `layout.css`.
- Use explicit state classes/attributes or semantic selectors for selected, disabled, open, and current states. Ensure each state is styled in both themes.
- Use a shared spacing scale, radius scale, and motion duration tokens. Avoid one-off values when a token already expresses the need.
- Keep breakpoints in the relevant layout/component stylesheet, but document the chosen breakpoint values in one short comment or section so responsive behavior is easy to tune.
- Avoid `!important`, deeply nested selectors, and selectors that reach into another component's internals.
- Prefer CSS features supported by current stable Safari, Chrome, and Edge. Decorative blur and glow require a readable fallback.
- Do not use inline style values for theme colors. Inline custom properties are acceptable only for genuine per-instance data, not to bypass the shared token system.

**Theme review rule:** after any shared surface, text, border, accent, or state style changes, inspect the affected screen in both light and dark themes. A change is not complete if one theme has weaker contrast, missing boundaries, or an invisible focus/selected state.

## 7. Ordered implementation steps

### Step 1 — Inspect the repository before coding

This step remains relevant as a repository-baseline check, but its original “before coding” point-in-time has passed: the initial inventory was completed before the app scaffold was created. The old findings below had become stale as implementation proceeded, so this execution refreshes them without changing application code or setup.

#### Substeps

1. **Inventory tracked-looking project files.** List top-level and nested files, including hidden configuration files, while excluding large image contents from text inspection. Identify documentation, source folders, public assets, generated folders, and repository configuration if present. Do not delete, rename, or move anything during this step.
2. **Determine whether an application scaffold exists.** Look specifically for `package.json`, `src/`, `index.html`, `vite.config.*`, `tsconfig*.json`, and existing React/TypeScript entry points. If files are absent, record that as a finding; do not create them yet.
3. **Read the existing app setup when present.** Inspect the package scripts, dependencies, Vite `base`, TypeScript options, app entry point, and imported styles. Record the actual development and build commands. Do not infer commands from convention when `package.json` can be checked.
4. **Identify the package manager from the lockfile.** Check for `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, or another existing lockfile. Use the matching manager in future steps. If there is no manifest or lockfile, mark the package manager and Node.js version as undecided implementation setup choices; choose one of each once, before scaffold creation, and document them. Never create multiple lockfiles.
5. **Inspect current styling and assets.** Identify any CSS strategy, design token files, icon assets, fonts, and background art already in use. Confirm whether the theme values are centralized and whether component styling follows the CSS contract in Section 6.1. Do not duplicate a suitable existing system.
6. **Reconcile project documentation.** Compare `AGENTS.md`, `DESIGN.md`, this plan, and both supplied screenshots. Record conflicts or newly resolved choices, especially the English UI labels, drawer/header arrangement, three-card desktop composition, and light/dark parity. Project constraints in `AGENTS.md` remain binding.
7. **Check version and release notes without changing them.** Look for the app's central version source and `CHANGELOG.md`. Distinguish a version shown only in a design reference or example from an implemented app version. Do not bump a version for this inspection or for planning edits. At implementation completion, follow the patch sequence and update the central version, visible version, and changelog together.
8. **Record deployment and contribution constraints.** Confirm whether GitHub Pages configuration, repository name/base path, contribution notes, or ignore rules already exist. Do not use Git command-line tools; the project convention prefers review/upload through GitHub.com and the **Commit changes** action.
9. **Write a short baseline report.** Record: existing app/scaffold (yes/no and location), start/build commands (or “not available”), package manager/Node version (or “not selected”), existing CSS/theme approach (or “none”), version/changelog state, applicable project constraints, and any decisions deferred to later steps.
10. **Refresh prior findings when the project has changed.** Label the original no-scaffold inventory as historical, then replace the “current repository” findings with what exists now. Explicitly distinguish source/configuration from ignored generated folders such as `node_modules/` and `dist/`; do not recreate or reset anything during a refresh.

#### Current repository findings — refreshed 2026-10-13

- The project now has a React + TypeScript + Vite scaffold. Root project files include `AGENTS.md`, `DESIGN.md`, `DESIGN_IMPLEMENTATION_PLAN.md`, `CHANGELOG.md`, both theme reference images, `index.html`, `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `.nvmrc`, and `.gitignore`.
- Application source is under `src/`: `App.tsx`, `App.module.css`, `main.tsx`, `data/tools.ts`, and `styles/{tokens.css,base.css,layout.css,index.css}`. There is no `public/` directory or separate test setup yet. The current app has the shell, drawer/theme controls, and the beginnings of the Toolbox list; remaining cards and prototype screens are future steps.
- `package-lock.json` is the single lockfile, so continue using npm. `package.json` scripts are `npm run dev`, `npm run build` (`tsc --noEmit && vite build`), and `npm run preview`. `.nvmrc` selects Node 22; the verified runtime is Node `v22.23.3` with npm `10.9.9`. The engine range is `^20.19.0 || >=22.12.0`.
- Vite is configured with the GitHub Pages project base `/LibraryMerger/`. The actual GitHub repository slug has not been verified in this inspection, so confirm that it matches before deployment. No Git command-line or Git client was used; continue with the documented GitHub.com workflow.
- Global CSS is imported once by `src/main.tsx` through `src/styles/index.css`. Shared spacing, typography, accent primitives, semantic light/dark colors, and other design tokens live in `tokens.css`; component-specific styling uses `App.module.css`. The displayed version is sourced from `package.json`; the current version is `0.1.3`, and `CHANGELOG.md` contains the implementation rounds through that version.
- `node_modules/` and `dist/` currently exist as generated/installed directories and are excluded by `.gitignore`; treat them as build/runtime output, not project source. The source inventory found no additional application, deployment workflow, or test configuration.
- The supplied screenshots remain the composition reference. Keep all project-facing copy in English, including **New Tool**. Continue to honor the user-provided `AGENTS.md`: static GitHub Pages, responsive and keyboard-operable UI, current Safari/Chrome/Edge support, client-side-only file handling in the later functional phase, and no backend/account/database unless requested.
- Open follow-ups: verify the actual GitHub Pages repository slug before deployment; complete the remaining visual-prototype steps; add persistence/system preference in the planned theme step. This inspection did not install dependencies, alter app code, or bump the version.

**Checkpoint:** the baseline now reflects the scaffold and current implementation rather than the former empty-repository state. The developer can identify the actual npm/Node commands, source and generated folders, CSS/token arrangement, current version, GitHub Pages base assumption, and remaining deployment/design decisions.

#### Step 1 refresh execution record

- Confirmed Step 1 remains useful as an inventory and consistency check; its original pre-scaffold execution is complete, while the old findings had become stale.
- Refreshed the findings from the current filesystem and configuration. No application source, dependencies, version, or changelog were changed; only this plan’s inventory report and refresh substep were updated.

### Step 2 — Confirm a clean visual baseline

This step remains relevant. The screenshots are the primary composition references, but they do not specify mobile layouts, exact CSS values, or all interaction states. Comparing and recording what they do and do not define gives the developer a stable visual target without turning a single desktop image into a fixed-pixel mockup.

#### Substeps

1. **Confirm the source images.** Use the supplied `Dark theme.png` and `Light theme.png`. Both are 1586 × 992 pixels. Treat them as reference artwork, not necessarily as assets to ship in the application.
2. **Separate shared layout from theme differences.** Compare positions, sizes, hierarchy, and card order first. Record background, panel material, text contrast, and selected accents as theme-specific values. Do not create separate screen layouts for light and dark.
3. **Record desktop geometry as approximate anchors.** Note the drawer width, header/work-surface proportions, card count, card arrangement, gaps, and margins as ratios or approximate reference measurements. State explicitly that responsive CSS must adapt these values to available space.
4. **Inventory visible elements and copy.** Record the background, drawer controls and sections, header, work surface, cards, icons, page title, theme choices, and version label. Convert Dutch placeholder copy to the agreed English UI copy.
5. **Identify visual states without confusing them.** Record which tool and theme appear selected. Keep selected/current styling distinct from hover and keyboard focus, even though the screenshot's cyan treatment could be read as a general emphasis.
6. **List interactions implied by the composition.** The drawer has a close control; the header has a menu control; tool cards are intended navigation targets; theme options change the appearance. The New Tool plus cards are placeholders, not controls for creating tools.
7. **Record what the references do not decide.** They show only a wide viewport and an open drawer. They do not establish mobile/tablet breakpoints, the drawer's closed-state composition, exact typeface, final accent palette, whether placeholders are disabled or open a notice, or the detailed JW Library Merger screen. Carry those as responsive requirements or open choices for later steps; do not invent them as screenshot facts.
8. **Check consistency with written requirements.** Confirm that `AGENTS.md` governs responsive behavior, keyboard support, browser scope, and static hosting, while `DESIGN.md` captures the newer screenshot details. Record any discrepancy instead of silently selecting one source.
9. **Write a compact visual baseline** in the findings below. Use it during implementation and revisit it at phone, tablet, and desktop widths.
10. **Separate reference facts from implementation status.** Record what is visible in the screenshots independently from what the current app already implements. Call out reference-only details such as screenshot version text and desktop-only geometry so later implementation reviews do not mistake them for current behavior or responsive requirements.
11. **Refresh the baseline after a material design or app change.** Re-open the supplied reference images and compare them with the current screen when card layout, shell geometry, theme tokens, or version presentation changes. Record only confirmed visual differences and remaining gaps; do not change implementation code as part of this baseline review.

#### Findings from the current screenshots

- Both references have identical 1586 × 992 composition and card ordering. The drawer is open at the left and occupies about 22% of the canvas (roughly 344 px in these images); use this as a desktop proportion reference only.
- The visible drawer has a close X at the top; one selected JW Library Merger row and a divider below it; a Theme section near the bottom with sun/light and moon/dark controls; another divider; and `v0.1.0` at the bottom.
- The main area retains a long rounded header with a hamburger icon, separator, and **Toolbox** title. The centered glass work surface below it contains three cards in a single row: JW Library Merger, New Tool, New Tool. Cards have consistent sizing and spacing, with the first highlighted as the current/featured tool.
- The primary tool uses an outlined open-book icon; placeholders use plus icons. The cards display icon and short name only. Use English **New Tool** in the application, even though the supplied images contain “Nieuwe tool”.
- The background is a full-canvas abstract scene with large overlapping curved/orbital forms, soft blurred light spots, and luminous edges. It is decorative. The drawer, header, outer work surface, and cards each read as separate rounded translucent layers.
- The light and dark references preserve the same layout. Dark uses deep navy/graphite surfaces and cool blue light; light uses pale blue/white surfaces and brighter illumination. Both use cyan on the active card and selected theme control. The exact accent remains provisional.
- The menu icon remains visible in the header while the drawer is open. The implementation must support both drawer states; the screenshots do not determine whether the drawer overlays or reserves layout space at every viewport.
- The screenshots do not show focus, hover, pressed, disabled, phone, or tablet states. Those must be designed from the accessibility and responsive requirements in `AGENTS.md`, not inferred from the still images.
- The displayed `v0.1.0` is reference content only; the implemented version is now centrally sourced from `package.json` and is `0.1.3`.

#### Baseline refresh record — 2026-10-13

- Re-opened both supplied reference images. They still show the same 1586 × 992 composition, a roughly 344 px left drawer, Toolbox header, centered glass panel, and three horizontally aligned cards. The drawer is open in both; light/dark changes the surfaces and illumination while preserving layout.
- Confirmed selected states separately: JW Library Merger is the highlighted tool card, and the light or dark theme button has its own cyan ring in the matching image. The first card's highlight is not evidence for hover or keyboard focus styling.
- The images remain desktop-only references and do not specify phone/tablet layouts, closed-drawer placement, focus/pressed/disabled states, exact final accent, or the merger destination screen. Those remain implementation decisions governed by `AGENTS.md` and the later plan steps.
- The text `v0.1.0` belongs to the design image; the current app version is `0.1.3` from `package.json`. Keep the implemented version sourced centrally and do not copy the screenshot version literally.
- Current implementation status is distinct from the reference: the app has the shell and theme controls, and the work surface now contains a semantic list of the three data entries; fully styled cards, their navigation/placeholder actions, and the detailed tool screen remain later implementation steps.
- The written requirements and screenshots remain consistent on the three-card launcher, English **New Tool** copy, paired light/dark structure, responsive behavior, and a provisional accent. No design conflict blocks implementation.
- No app code or assets changed during this visual baseline refresh.

**Checkpoint:** before CSS tuning, the developer can describe the shared composition, theme-specific visual changes, English copy, selected state, responsive constraints, and open decisions. No exact desktop pixel coordinate is treated as a required breakpoint or fixed component size.

#### Step 2 execution record

- Confirmed Step 2 remains relevant as the visual source-of-truth check; its previous screenshot findings remain accurate and were refreshed against the supplied image files and current app status.
- Added explicit substeps to keep screenshot facts separate from implementation status and to refresh the comparison after material design changes.
- No implementation, dependency, version, or changelog changes were needed for this inspection.

### Step 3 — Establish tokens and global foundations

#### 3.1 Create the stylesheet layers and central import

This step remains relevant. The stylesheet files and central import were created earlier, but the shared frame and responsive main-area rules were still inside `App.module.css`, while `layout.css` contained only an ownership comment. This substep completes the agreed separation without moving component-specific drawer, header, theme-control, or work-surface rules into the global layer.

##### Substeps

1. **Keep the three ownership layers.** `tokens.css` owns shared design values; `base.css` owns document-wide defaults and focus behavior; `layout.css` owns the shared app frame, decorative page background, main content placement, and shell-level responsive breakpoints.
2. **Keep one ordered aggregator.** `index.css` imports tokens, base, and layout in that order. The Vite entry imports `index.css` once; no component imports a global layer directly.
3. **Separate shared frame from local components.** Move only app-root stacking/background/orbit rules and main-area placement/responsive rules to `layout.css`. Keep drawer, header, theme control, and Toolbox work-surface styling in `App.module.css` until they have their own component modules.
4. **Use a clear global naming convention.** Since CSS Modules do not scope selectors in `layout.css`, use explicit kebab-case class names for its frame selectors and update the owning TSX markup. Avoid broad element selectors for app-specific layout.
5. **Preserve visual behavior.** Carry declarations and breakpoint values over unchanged so this organizational step does not redesign the shell. Ensure global layout selectors do not collide with component-module class names.
6. **Update the setup note for the current repository state.** The app scaffold and entry point now exist. Do not create another `main.tsx`; verify the existing entry is wired to the aggregator. Retain the defer-until-entry-exists guidance only as a historical condition for an actually absent scaffold.
7. **Verify ownership and imports.** Search the source for global stylesheet imports and app-frame selectors. Confirm the aggregator appears once in `main.tsx`, the three layer imports are unique, and component-only rules remain module-scoped.
8. **Record completion and build status.** Update the execution note, version, and changelog for the completed implementation round; mention if a rendered-browser comparison remains outstanding.

**Execution status:** `index.css` imports the three stylesheet layers in the required order; `src/main.tsx` imports `index.css` exactly once; shared app-frame and responsive main-layout rules now live in `layout.css`.

#### 3.1 execution record

- Confirmed the step remains relevant. The stylesheet layers and single import already existed, but `layout.css` was only a comment and shared frame rules still lived in the app module.
- Moved the app root, token-driven background/orbits, main content frame, drawer-open/closed placement, and 960px/640px shell breakpoints into `src/styles/layout.css` using explicit global kebab-case class names.
- Kept drawer, header, theme controls, and Toolbox work-surface styles in `App.module.css`. The original declarations and breakpoint values were preserved.
- Confirmed `src/main.tsx` imports `styles/index.css` once; `index.css` imports each global layer once in the required order. Updated TSX to use the global app-frame selectors.
- Bumped the app version to `0.1.4` and added the matching changelog entry for this completed implementation round.
- Production build passed with Node.js 22.23.3 (`tsc --noEmit` and Vite 8.3.4). Rendered browser comparison remains outstanding; the CSS declarations were relocated without intentionally changing their values.

#### 3.2 Define semantic tokens for both themes

This step remains relevant and is the core safeguard against light/dark styles diverging. The two-theme token set is already implemented; this execution audits it against the current component styles, removes unused tokens, and makes the future token-addition rule explicit.

##### Substeps

1. **Create a small brand-value block at the top.** Store the light-theme and dark-theme accent source values there as RGB triplets. Derive soft accent and glow values from those sources with opacity tokens so components do not repeat the color. A color refresh should normally require changing only the two accent source values; only change a focus token separately if contrast checks show it is needed.
2. **Define semantic color tokens for each theme.** Use names for purpose rather than hue: page/canvas, background glow layers, primary and muted text, drawer/header/workspace/card surfaces, subtle and strong borders, accent, soft accent, accent glow, focus ring, hover/selected/disabled states, and shadows.
3. **Keep the same semantic token names in both theme blocks.** Put the blocks adjacent in `tokens.css`, with one default/dark block and one explicit light block. A component should not need theme-specific selectors for ordinary colors.
4. **Define shared non-color tokens once.** Add typography family/sizes/line heights, spacing steps, radii, shadow shape as applicable, and motion durations/easing in a shared section outside the theme blocks unless a value genuinely needs to differ by theme.
5. **Use semantic values throughout future CSS.** Theme-dependent colors and surfaces in component CSS must be referenced through `var(--...)`. Palette literals belong in `tokens.css` only. Keep the decorative background's gradients and glows token-driven as well.
6. **Keep screenshot values provisional.** The initial values should express the supplied navy/graphite and pale blue/white directions, but must be labelled as adjustable explorations. Do not present them as final brand colors.
7. **Add a consistency checklist.** The light and dark blocks must expose the same semantic color and shadow names. Every token used in component/global styles must resolve in both themes; component styles must not use palette literals or low-level brand values. Do not retain an unreferenced token “just in case”: add it together with the component/state that consumes it in the relevant later step.
8. **Record contrast verification as a visual check.** The current shell is rendered by the app, but no browser comparison has yet been recorded for all states and viewports. Inspect text, border, focus, and selected-state contrast in both themes when the affected components are visually reviewed in Step 3.7 and the later UI steps.
9. **Audit definitions against actual consumers.** Search styles for every `var(--...)` reference, confirm it is defined, compare the light/dark semantic token names, and identify defined tokens with no consumer. Remove orphan tokens or introduce them only with the implementation step that needs them.

**Execution status:** both theme token sets and the shared scales used by the current shell are defined in `tokens.css`. Two centralized accent source values drive semantic accent, soft accent, and glow tokens. Light/dark semantic names match, current CSS consumers resolve to tokens, and no component stylesheet contains palette literals. Final visual contrast review remains pending.

#### 3.2 execution record

- Confirmed the step remains relevant and audited current token definitions and references. All semantic color names match between light and dark themes.
- Confirmed the accent can be changed centrally by editing the light/dark accent source values; component styles use semantic tokens and contain no theme palette literals.
- Removed six currently unreferenced tokens: `--space-6`, `--space-8`, `--motion-duration-standard`, `--color-surface-card-hover`, `--color-state-disabled`, and `--shadow-card`. Add any of these later only alongside a real consumer.
- Kept visual contrast review open until the rendered shell and interactive states are checked side by side in both themes.
- Bumped the app version to `0.1.5` and added the matching changelog entry for this completed token cleanup.
- Production build passed with Node.js 22.23.3 (`tsc --noEmit` and Vite 8.3.4). Static token audit found no undefined references, unreferenced definitions, light/dark semantic-name differences, or palette literals in component/global layout styles.

#### 3.3 Set and apply the active theme

This step remains relevant and is implemented in the current shell. Its original pre-scaffold wording is stale: `index.html`, the React root, and the Vite entry now exist. This execution verifies the existing single-root contract and records the boundary between active theme application here and preference initialization/storage in Step 8.

##### Substeps

1. **Keep one stable theme root.** Store the active value only as `data-theme="light"` or `data-theme="dark"` on `document.documentElement` (`<html>`). Do not put independent theme attributes on pages or components.
2. **Set a deterministic first-render fallback.** Keep a valid initial `data-theme` in `index.html` so the first paint uses a complete palette before React starts. The current fallback is dark to match the reference; choosing system preference or a saved explicit choice is handled later in Step 8.
3. **Initialize app state from the root.** When the React app mounts, read the existing root attribute rather than maintaining a contradictory hard-coded theme state. Treat only the supported `light` and `dark` values as valid; use the documented fallback for anything else.
4. **Apply changes back to the same root.** When a user selects a theme in the drawer, update React state and the root attribute so every global and component style updates together without a page reload.
5. **Keep theme selection separate from preference storage.** Do not add `localStorage`, system preference selection, storage error handling, or first-paint preference logic in this substep; those belong to Step 8.
6. **Keep components theme-agnostic.** Components consume semantic CSS custom properties. Do not add scattered light/dark component selectors or duplicate the component layout for each theme.
7. **Verify the source contract.** Confirm the initial HTML and runtime updates target the same `<html>` element, the CSS theme selectors use that root, and there are no per-component theme roots or literal palette overrides.
8. **Record visual propagation separately.** Source inspection can confirm that the root attribute drives both token sets. A rendered review must still inspect the background, drawer, header, work surface, text, and active control in both themes; do not claim contrast validation from source inspection alone.

**Execution status:** `index.html` starts with `data-theme="dark"` on `<html>`. `App.tsx` initializes theme state from that root attribute and updates the same attribute when Light or Dark is selected. `tokens.css` resolves both theme palettes from the root. Preference persistence and system preference remain in Step 8; visual theme/contrast review remains pending.

#### 3.3 execution record

- Confirmed the step remains relevant and already functions in the current app shell; corrected the plan's stale pre-scaffold assumptions and expanded verification criteria.
- Verified one initial root value in `index.html`, state initialization from that value, and runtime updates to `document.documentElement.dataset.theme`. CSS selectors and semantic token definitions use the same root.
- No application code change was needed. Persistent preference and system theme selection were deliberately left for Step 8; no version bump was made for this plan/status update.
- Rendered browser comparison of both themes remains outstanding.

#### 3.4 Set global typography and document foundations

This step remains relevant and its global CSS is already implemented. The original “before the scaffold exists” framing is historical; this execution audits the current base layer and makes the remaining rendered-review criteria specific. Keep the stylesheet limited to browser-wide defaults; page-specific type scales and layout belong to components and `layout.css`.

##### Substeps

1. **Use the shared typography tokens.** Apply `--font-family-ui`, `--font-size-body`, and `--line-height-body` to the document body. Keep the system font stack local; do not add a remote font request.
2. **Apply a small, predictable baseline.** Set `box-sizing: border-box` for elements and pseudo-elements, remove the browser's default body margin, and give the document/app root a viewport-aware minimum height.
3. **Apply theme-aware document colors.** Set the body text and canvas from `--color-text-primary` and `--color-canvas`. Do not insert theme-specific hex values into `base.css`.
4. **Normalize native control typography.** Make buttons and form controls inherit the app font and text color, without globally removing native focus indicators or locking control dimensions.
5. **Set a visible keyboard focus baseline.** Use `:focus-visible` with the shared `--color-focus-ring`, width, and offset tokens. Component styles may refine shape or spacing but must not remove visible keyboard focus.
6. **Prevent avoidable overflow without hiding layout defects.** Make media responsive and avoid a global fixed minimum width or `overflow-x: hidden/clip` workaround. Components and layouts must wrap/reflow rather than relying on clipped content.
7. **Keep responsibilities separated.** Do not add app-shell dimensions, drawer positioning, card spacing, hover transitions, reduced-motion overrides, or glass fallbacks here; those belong to `layout.css`, component CSS, or Steps 3.5–3.6.
8. **Review the rendered foundation at representative widths.** Once a browser preview is available, inspect system-font rendering, focus visibility, and viewport-height behavior at a narrow phone width (about 320–375 px), tablet width (about 768 px), and wide desktop width (about 1440 px or wider). Confirm body/root backgrounds and text remain theme-driven in both themes.
9. **Keep visual and source checks distinct.** Source inspection can confirm there is no global fixed minimum width or overflow clipping workaround; it cannot establish that every page avoids overflow at runtime. Record any remaining rendered review separately rather than claiming it passed based on the stylesheet alone.

**Execution status:** `base.css` applies the shared typography and theme tokens, a minimal global reset, viewport-aware document/app-root height, inherited native-control typography, responsive media defaults, and a token-driven `:focus-visible` outline. It contains no fixed page-width or overflow-hiding workaround. Rendered font/focus/viewport review remains pending.

#### 3.4 execution record

- Confirmed the step remains relevant and the current `base.css` satisfies its source-level requirements: local system font stack, semantic body colors, border-box reset, viewport-aware `html`/`body`/`#root` heights, inherited control typography, responsive media, and visible token-based keyboard focus.
- Confirmed app-frame sizing remains in `layout.css` and component sizing/state rules remain in CSS Modules; no theme palette values or page-specific layout were added to `base.css`.
- Expanded the plan's browser review to include narrow phone, tablet, and wide desktop sizes and both themes. This rendered review has not yet been performed.
- No implementation change was needed after inspection; no version bump was made for this plan/status update.

#### 3.5 Respect reduced-motion preferences

This step remains relevant. The app already has a short theme-control transition, so the reduced-motion rule should be established now and applied through the shared motion token before additional card or drawer transitions are added.

##### Substeps

1. **Inventory motion sources.** Search global and component CSS for `transition`, `animation`, transforms used as motion, and smooth scrolling. Distinguish state layout changes from animated movement; the current drawer translates when closed but has no transition, so it changes state instantly.
2. **Centralize reduced-motion behavior.** Under `@media (prefers-reduced-motion: reduce)`, override the shared fast-motion duration to `0ms`. Keep this override in the shared token layer so all components that use the token inherit it.
3. **Require token-based durations.** All future transitions and animations must use a shared motion-duration token; do not introduce component-local millisecond literals. Add new motion tokens only with a current consumer.
4. **Preserve state and feedback without movement.** Reduced motion must not hide content, remove focus/selected states, delay theme changes, or make drawer state ambiguous. A state change should remain immediate and understandable when its transition duration is zero.
5. **Verify both preferences.** With normal motion, confirm the existing theme-control transition remains brief. With reduced motion enabled in the operating system or browser emulation, confirm it becomes immediate; check drawer open/closed, keyboard focus, and selected theme remain clear.
6. **Record coverage and limits.** Source inspection can confirm the media query and token usage. Record manual preference emulation as pending if a browser preview is not available; do not claim it was visually verified from a build alone.

**Execution status:** the shared reduced-motion override is implemented in `tokens.css`; the theme control uses the shared fast-duration token. Drawer state changes remain immediate. Browser preference-emulation review remains pending.

#### 3.5 execution record

- Confirmed the step remains relevant: the existing theme controls had a short CSS transition, while the drawer itself changes state without an animation.
- Added a centralized `prefers-reduced-motion: reduce` override that sets `--motion-duration-fast` to `0ms`; this removes the existing transition without changing theme state or control feedback.
- The plan now requires future motion to use shared duration tokens and records browser preference emulation as a separate visual check.
- Bumped the app version to `0.1.6` and added the matching changelog entry for this completed implementation round.
- Production build passed with Node.js 22.23.3 (`tsc --noEmit` and Vite 8.3.4). Browser reduced-motion emulation remains outstanding.

#### 3.6 Provide a glass-effect fallback

This step remains relevant: the drawer, header, and work surface currently use translucent surfaces with `backdrop-filter`. Their content boundaries must stay clear when blur is unavailable or disabled.

##### Substeps

1. **Inventory glass surfaces.** Find each use of `backdrop-filter` and its `-webkit-` form. Record the owning selector and ensure the component already has a readable border and semantic surface token.
2. **Define solid fallback tokens per surface and theme.** Add opaque dark and light fallback values for each current blurred surface in `tokens.css`. Keep those values adjacent to their matching semantic surface tokens and use purpose-based names; do not hard-code fallback palette values in a component module.
3. **Apply a feature-support fallback.** In the owning component styles, use `@supports` to select the opaque surface tokens only when neither the standard nor prefixed backdrop filter is supported. Preserve the normal translucent surface and blur path in supporting browsers.
4. **Keep boundaries without blur.** Preserve the existing semantic border and shadow on each panel. Text and control readability must not depend on the blur, glow, or orbit art behind the panel.
5. **Cover future components when they are introduced.** If cards or dialogs later use `backdrop-filter`, add their fallback token/rule with that component step rather than relying on this current three-surface rule to cover them implicitly.
6. **Verify both themes and both capability states.** Inspect dark and light surfaces with blur enabled and with backdrop filtering disabled/emulated. Confirm drawer, header, work surface, text, controls, and boundaries remain distinguishable. Record browser/emulation review as pending if only a build was available.

**Execution status:** opaque semantic fallbacks are defined for the current drawer, header, and work surface. An `@supports` rule applies them when neither standard nor prefixed backdrop filtering is available. Visual capability/theme comparison remains pending.

#### 3.6 execution record

- Confirmed the step remains relevant: all three current glass panels had translucent surfaces and backdrop blur without an explicit unsupported-browser fallback.
- Added separate opaque fallback surface tokens for drawer, header, and work surface in both theme blocks, plus an `@supports` fallback in `App.module.css` that preserves the normal blur path where available.
- Kept borders and shadows on all three surfaces. Future card/dialog glass effects are assigned a fallback review in their own implementation step.
- Bumped the app version to `0.1.7` and added the matching changelog entry for this completed implementation round.
- Production build passed with Node.js 22.23.3 (`tsc --noEmit` and Vite 8.3.4); static inspection confirms all three current blur surfaces have fallback rules and corresponding light/dark tokens. Browser fallback emulation remains outstanding.

#### 3.7 Verify accent editability across themes

This step remains relevant and can now be exercised against the rendered shell. The visual card grid is not implemented yet, so card-selected and card-hover checks must be repeated when Step 6 is complete.

##### Substeps

1. **Record the original brand values.** Before the trial, note the light/dark accent source values and keep the existing soft/glow opacity values unchanged.
2. **Change only the accent sources temporarily.** Use one clearly different trial hue for the light and dark source values in `tokens.css`; do not edit semantic component rules, surfaces, focus tokens, or opacity values to make the trial appear successful.
3. **Inspect both themes at the same viewport.** Render the shell in light and dark with the trial values. Confirm existing accent-bearing elements (tool icon, selected theme control, hover/focus rules where observable, and glow) follow the new source values while neutral text and panel surfaces remain governed by their semantic tokens.
4. **Evaluate contrast before keeping an accent.** Check accent against both text/surface themes. Only adjust `--color-focus-ring` independently if an observed contrast failure requires it; record why that exception exists so a later accent change remains predictable.
5. **Separate implemented from future consumers.** Do not claim selected-card, card-hover, or placeholder states passed while those cards are not implemented. Re-run those checks after Step 6 adds the card visuals and interactions.
6. **Restore the original values exactly.** Return both accent sources to their recorded values, keep opacity values untouched, and remove temporary theme/probe changes and preview artifacts. Do not commit the trial palette as a brand decision.
7. **Verify restoration and build.** Confirm only the intended source values remain, confirm component styles still reference semantic accent tokens, and run the production build on the restored palette.
8. **Record visual limits.** State which current states were actually rendered and inspected and which still need a later browser review. Source inspection alone is not a focus/hover contrast pass.

**Execution status:** a temporary violet accent was rendered at the same desktop size in both themes, and the original teal values were restored. The existing book icon and selected theme control followed the centralized accent; selected-card styling is not implemented yet. Rendered focus/hover and final contrast review remain pending.

#### 3.7 execution record

- Confirmed the step remains relevant and expanded it to require value capture, a temporary-only accent edit, paired theme review, exact restoration, final build, and clear handling of future card states.
- Temporarily changed only the two RGB brand accent sources to a violet test hue. Edge rendered dark and light previews at 1586 × 992; the JW Library Merger book icon and active theme control changed hue in both themes while the surrounding panel palette stayed theme-specific.
- Restored the original light (`0 126 151`) and dark (`76 224 235`) source values and the initial dark theme. Temporary preview screenshots and Edge profiles were removed.
- The existing navigation/theme focus and hover rules reference semantic accent tokens, but the focus-visible appearance was not separately forced in the screenshot. Card selected/hover states do not exist yet; repeat those reviews after Step 6.
- No persistent palette change was made, so no version bump was made for the trial. The production build passed on the restored palette with Node.js 22.23.3: TypeScript `tsc --noEmit` completed and Vite 8.3.4 generated the production bundle successfully.

**Checkpoint:** both themes can be previewed by changing one root theme attribute; a trial accent refresh is limited to a small, clearly labelled set of brand values; component CSS contains no hard-coded theme palette colors; readable text and visible boundaries work without decorative polish.

### Step 4 — Build the abstract background and app frame

This step remains relevant and can now be implemented because the global token and base stylesheet layers are in place. Since repository inspection found no app scaffold, this step also needs to create the minimum React/TypeScript/Vite shell needed to render and view the frame. React and React DOM render the UI; Vite supplies local development and static production builds; the official React Vite plugin enables the React transform and refresh; TypeScript and React type packages provide type checking. Add only those core dependencies; do not add a UI kit, CSS framework, animation package, or background-image service.

At the start of this step the environment had Node.js 20.15.0 and npm 10.7.0. The current [Vite Getting Started guide](https://vite.dev/guide/) requires Node.js 20.19+ or 22.12+. Node.js 22.23.3 has now been installed side-by-side through fnm; `.nvmrc` selects the Node 22 line and `package.json` declares the engine range. The pre-existing default remains Node 20.15.0, so use fnm to select Node 22 before running Vite. npm was selected because it was installed and no lockfile existed; `package-lock.json` is now the project's single lockfile.

#### Substeps

1. **Create the minimal app scaffold.** Add the Vite HTML entry, React/TypeScript entry point, app component, Vite React plugin configuration, package scripts, TypeScript configuration, npm lockfile, and `.gitignore`. Use npm consistently. Add only React, React DOM, Vite, the React Vite plugin, TypeScript, and React type packages required by this setup.
2. **Set project runtime and deployment assumptions.** Declare the minimum supported Node version in `package.json` and a Node 22 version file. Configure Vite's static `base` for the repository project path (`/LibraryMerger/` based on this workspace name) and leave a clear note that it must track the GitHub repository name if that name changes.
3. **Connect the CSS entry once.** Import `src/styles/index.css` exactly once from `src/main.tsx`. Do not import `tokens.css`, `base.css`, or `layout.css` separately from the app or components.
4. **Create a semantic app frame.** Use one app root, a main content area, the shared header, a decorative background layer, and the reserved work-surface area. Give the page an English document title and `lang="en"`.
5. **Apply the theme root contract.** Start in dark theme to match the primary reference and set `data-theme` on `<html>`. Keep theme persistence and system preference selection for Step 8.
6. **Create the abstract background locally.** Reproduce the broad orbital curves and diffuse light with CSS gradients/shapes and theme tokens. Do not use the screenshot itself as a full-page background, and do not load remote assets.
7. **Keep background decoration non-interactive.** Mark decorative markup `aria-hidden="true"`, set `pointer-events: none`, and layer it behind content. Any intentional clipping must be limited to the decorative background layer, not used to conceal overflowing content.
8. **Build the header.** Add a real button for the hamburger, a decorative separator, and the **Toolbox** heading. Include an accessible name, `aria-controls`, and an accurate `aria-expanded` state. Provide a visible keyboard focus state using the global focus baseline.
9. **Keep the drawer boundary explicit.** The header's menu button should open/close an accessible drawer shell with a close control so it is not a dead control. Keep this shell minimal in Step 4; Step 5 adds its full navigation, theme controls, version, and complete focus behavior.
10. **Make the frame responsive.** Match the wide reference's proportions at desktop, but use content-based widths and reflow at tablet/phone sizes. Do not let the drawer offset push the header offscreen on narrow viewports.
11. **Do not advance into tool behavior.** The work surface may be an empty visual container in this step. Tool cards and merger workflow are implemented in later steps; no file processing or fake progress is added here.
12. **Review the rendered shell at explicit CSS viewport sizes.** Use phone (390 × 844), tablet (768 × 1024), and wide desktop (1586 × 992) viewports, inspecting the drawer open and closed where each mode supports it and both light and dark themes. Set the browser viewport itself; do not rely on the outer window size or accept a cropped screenshot as proof of responsive layout.
13. **Check frame geometry and controls in every capture.** Confirm `document.documentElement.scrollWidth` does not exceed `document.documentElement.clientWidth`; inspect the full header and work-surface boundaries, drawer/backdrop layering, focus visibility, and whether decorative layers block pointer interaction. Record the actual states and any browser-preview limitations. Keep unfinished cards and tool behavior assigned to later steps.

**Checkpoint:** the app starts and builds on a supported Node version; the desktop shell echoes the references before cards are added; the header and minimal drawer can open/close with keyboard and pointer; the frame remains legible and on-screen at phone and tablet widths; the background is decorative, local, and theme-aware.

#### Current setup note

During implementation, confirm the repository's actual GitHub Pages project path before publishing. The scaffold uses `/LibraryMerger/` from the current workspace name as the initial Vite `base`; if the repository slug differs, correct that single value before deployment.

#### Step 4 execution record

- Created the minimal npm-based React/TypeScript/Vite scaffold and connected the global stylesheet entry exactly once.
- Set the initial root theme to dark and added the token-driven orbital background, glass header, empty work-surface frame, and responsive navigation drawer shell with an open-book navigation item and close/open controls.
- At the end of Step 4, the drawer shell closed with its X control, the header button, Escape, and the mobile/tablet backdrop; Step 5 subsequently completed its theme controls, utility grouping, and focus management.
- Added the package version `0.1.0`, displayed it in the drawer, and created the first changelog entry dated 2026-10-13.
- Installed Node.js 22.23.3 through fnm alongside the prior Node 20 installations; `.nvmrc` selects the Node 22 line. npm resolved Vite 8.3.4 and the production build completed successfully.
- Re-read Step 4: the shell implementation was already present, but the previously outstanding visual review meant the step still needed a concrete validation pass. Expanded the review substeps with exact CSS viewport sizes, explicit device viewport emulation, and an objective horizontal-overflow check.
- Rendered the drawer open and closed in both themes at phone (390 × 844), tablet (768 × 1024), and wide desktop (1586 × 992). The measured document width equalled the viewport width in every capture; no horizontal page overflow was present. Drawer and backdrop boundaries remained visible, and the decorative background stayed behind the controls.
- The wide desktop frame follows the reference proportions. The current work surface visibly includes the tool-name list from later implementation work; its card styling and tool behavior remain outside Step 4.
- Removed the temporary screenshots, browser profiles, and inspection scripts after review. Source files were restored to their original runtime state.
- Production build passed with Node.js 22.23.3 (`tsc --noEmit` and Vite 8.3.4). No app source change was needed in this review, so the version remains 0.1.7.

### Step 5 — Build the navigation drawer

This step remains relevant for a final interaction and responsive audit. The drawer, theme controls, version, modal/rail behavior, and focus handling are already implemented. The audit must verify the initial mobile state as well as pointer, keyboard, breakpoint, and short-screen behavior; the drawer should start open on wide desktop to match the reference and closed on compact screens so it does not block the page at first load. Theme persistence remains in Step 8.

#### Substeps

1. **Define the two drawer modes.** Above the existing 960px breakpoint, treat the open drawer as a non-modal navigation rail: the page stays available and no scrim or focus trap is used. At 960px and below, treat it as a modal side panel with a dismissible backdrop. Keep the same content and theme in both modes.
2. **Complete the panel structure.** Keep the close X at the top, the selected JW Library Merger row with open-book icon beneath it, a divider after navigation, then a lower utility group. The utility group contains a “Theme” heading, Light and Dark icon buttons, a divider, and the current app version. Use semantic `nav`, labelled buttons, and a footer/version element.
3. **Implement theme selection as presentation state.** Selecting Light or Dark updates the root `data-theme` attribute immediately, updates the selected button’s `aria-pressed` value, and keeps the choice visibly selected through a ring/border and icon treatment as well as its accessible name. Do not add persistence in this step; persistence belongs to the app-wide theme step, where system preference and guarded `localStorage` behavior are handled consistently.
4. **Keep theme styling token-driven.** Add drawer-specific structural/state rules to `App.module.css`; use semantic values from `tokens.css` for text, surfaces, borders, accent, focus, and glow. Do not hard-code theme palette values in the module. Keep light/dark layouts identical.
5. **Make the panel fit short screens.** Use a viewport-bounded height, internal vertical scrolling, and contained overscroll. Let the utility group sit near the bottom when space permits, but never overlap navigation or become unreachable when the viewport is short or zoom is high.
6. **Support pointer dismissal.** The X, header toggle, Escape, and compact-mode backdrop close the drawer. A click inside the panel must not dismiss it. Keep the backdrop behind the panel and above the page.
7. **Manage focus by mode.** When a previously closed drawer opens, move focus to its close control; when it closes, return focus to the menu trigger. On compact/modal mode, keep Tab and Shift+Tab within the open panel, mark the background main region inert while the drawer is open, and expose dialog/modal semantics. On wide/rail mode, do not trap focus or mark the main region inert.
8. **Preserve keyboard and assistive-technology clarity.** The menu trigger exposes `aria-expanded` and `aria-controls`; the close and theme buttons have clear English names; theme buttons expose their pressed state; the current tool link uses `aria-current`; hidden drawer controls cannot receive focus.
9. **Review responsive states.** At phone and tablet widths, confirm the panel fits, the backdrop dismisses, and close/navigation/theme/version remain reachable by scrolling. At desktop width, confirm the panel remains a non-modal rail and does not dim the reference composition.
10. **Record completion.** Update the implementation notes below with files changed, the modal/rail decision, build result, and any visual-review limitation.
11. **Choose an appropriate initial drawer state.** Start with the drawer open above 960px to match the supplied desktop reference, but closed at 960px and below so the modal does not block a compact screen on first load. Do not move focus into a closed drawer. Preserve the user's explicit open/closed state when crossing the breakpoint during the current visit.
12. **Review exact viewport and breakpoint states.** Inspect both themes at phone (390 × 844), short phone (320 × 320), tablet (768 × 1024), the 960px/961px mode boundary, and wide desktop (1586 × 992). Review compact drawer open/closed and desktop rail open/closed. Confirm no horizontal overflow and, on short screens, that the drawer itself scrolls and its theme controls and version remain reachable.
13. **Exercise the interaction contract in the browser.** Verify close-X, header toggle, Escape, compact backdrop dismissal, and that clicking inside the drawer does not dismiss it. Verify initial/open focus, Tab and Shift+Tab containment only in compact modal mode, focus return to the trigger, `aria-expanded`, `aria-hidden`, `inert`, modal semantics, theme `aria-pressed`, and that the desktop rail leaves the main region available.

**Checkpoint:** the drawer works with pointer and keyboard in both modes; the theme changes immediately; modal focus is contained only on compact screens; and all drawer content remains reachable at short and narrow viewport sizes.

#### Step 5 execution record

- Kept Step 5 and expanded it into ten implementation substeps covering drawer modes, panel structure, theme state, token use, short-screen scrolling, dismissal, focus management, accessibility, responsive review, and execution notes.
- Added the Theme section with Light and Dark icon buttons, visible selected rings, English labels, and `aria-pressed`; clicking either changes the root theme immediately. Persistence and system preference remain assigned to Step 8.
- Added the navigation divider and separated theme controls and version with a second divider. The theme/version utility stays near the bottom when space allows and the drawer scrolls internally on short screens.
- Implemented the wide drawer as a non-modal rail and the <=960px drawer as a modal overlay with backdrop, inert main content, dialog semantics, Tab/Shift+Tab containment, Escape dismissal, and focus return to the menu trigger.
- Bumped the app version to `0.1.1` and added the matching changelog entry for this completed implementation round.
- Production build passed with Node.js 22.23.3 (`tsc --noEmit` and Vite 8.3.4); the first sandboxed Vite attempt was blocked by Windows `spawn EPERM`, and the same build succeeded when rerun with process-spawn permission.
- Initial implementation review at phone, tablet, and desktop widths was still outstanding at this point; the follow-up audit and any resulting correction are recorded below.
- Confirmed browser coverage is part of this step's completion, not inferred from source inspection alone.
- The audit found that the drawer initially opened as a modal at compact widths, making the main region inert on first load while focus remained on the document body. Changed initialization so the desktop reference still starts with its rail open, while compact screens start with the drawer closed. User-triggered open/closed state is retained when crossing the responsive breakpoint during the visit.
- Expanded Step 5 with short-viewport, exact breakpoint, initial-state, keyboard-loop, and modal/rail interaction checks. Browser review used phone (390 × 844), short phone (320 × 320), tablet (768 × 1024), the 960px/961px boundary, and desktop (1586 × 992), in both themes where relevant.
- Verified the compact drawer opens with focus on Close navigation, contains Tab and Shift+Tab, and returns focus to the menu trigger after the close X, Escape, and backdrop. Clicking a theme control inside the panel changes the theme and leaves the panel open. At 960px the page becomes inert behind a modal scrim; at 961px the rail has no scrim or modal semantics and the main region remains available.
- At 320 × 320, the drawer scrolls internally (318px client height, 364px content height); after scrolling, both theme buttons and the version footer fit within the panel. The document width matched each tested viewport, with no horizontal overflow.
- Corrected the compact initial state in `src/App.tsx`; updated `package.json`, the root package-lock version, and `CHANGELOG.md` to `0.1.8`. The visible drawer version reads the package version directly.
- Final production build passed with Node.js 22.23.3 (`tsc --noEmit` and Vite 8.3.4). The first sandboxed attempt hit Windows `spawn EPERM`; the rerun with process-spawn permission completed successfully. Confirmed the drawer displays `v0.1.8` from the package version.

### Step 6 — Build the Toolbox home page and cards

This step remains relevant. Substeps 6.1 and 6.2 have already been completed: `src/data/tools.ts` is the source of truth for the three typed entries, and the named “Available tools” region renders them in a semantic list. The remaining work is to turn those list items into the reference's interactive cards, add the placeholder notice, finish responsive styling, and review the rendered states. The actual JW Library Merger destination screen remains Step 7; Step 6 must not add merger or file-processing behavior.

#### Substeps

1. **6.1 Define a small typed tool list.** Add one JW Library Merger entry and two placeholder entries labelled **New Tool**. Keep the displayed content in English. Use a discriminated TypeScript union so a navigable tool must have a stable id, name, book icon key, and hash destination, while a placeholder has its own stable id, name, and plus icon key but no destination. Keep the data serializable and separate from React rendering; do not put SVG/JSX components in the data module, introduce a database, or duplicate card content in JSX. This substep creates only the typed list and its data module; rendering and interactions are handled by later substeps.
2. **6.2 Replace the empty work surface with a meaningful tool region.** Retain the centered glass panel from the reference, remove its `aria-hidden` status, and populate it from `toolboxEntries` rather than repeating names in JSX. Name the region “Available tools” for assistive technology, use a real unordered list with one keyed list item per entry, and keep any decorative icon markup added by 6.3 hidden from assistive technology. Keep this substep focused on accessible content structure and data mapping; card appearance and link/button semantics are added in later substeps. Confirm all three labels appear in the accessibility tree and can wrap without clipping at narrow widths.
3. **Build consistent card structure.** Render one full-size card inside each existing list item. Each card has the same overall dimensions, an icon area, and a short name. Use the open-book icon for JW Library Merger and a plus icon for each New Tool placeholder. Keep icon stroke weight, alignment, padding, and label placement consistent. Mark each SVG decorative with `aria-hidden="true"` and `focusable="false"`; the visible card name supplies its accessible name.
4. **Implement the real tool's navigation target.** Make the entire JW Library Merger card a semantic link to `#library-merger`, the prototype destination Step 7 will add. Keep this as a stable hash target so GitHub Pages refresh does not depend on server rewrites. The card must not trigger file selection or tool processing. Do not make up an interim merger screen in this step.
5. **Give placeholders a clear prototype behavior.** Keep each card face limited to its plus icon and **New Tool** label. Make each placeholder a native button that opens one shared, small, dismissible **Coming soon** notice. Use a native `<dialog>` opened with `showModal()` so modal semantics, focus containment, and Escape dismissal come from the browser; label the dialog from its heading, provide a clearly named close button, and verify focus returns to the button that opened it. The notice copy must say only that the entry is a placeholder, must not imply a delivery date or promise, and must not create a real tool. Step 10 is a completion checklist rather than a shared-dialog implementation step, so no shared custom dialog exists to reuse here.
6. **Style interaction states in both themes.** Add a restrained pointer hover treatment, visible pressed feedback, and a high-visibility `:focus-visible` outline. Keep every theme-dependent card/dialog color on the shared semantic CSS tokens; do not add one-off light/dark palettes to component rules. Match the reference's highlighted JW Library Merger card and use `aria-current="page"` to expose the current tool state. Ensure hover is not required to understand or use a card, including on touch screens.
7. **Keep card text minimal.** Do not add explanatory paragraphs, badges, marketing copy, or descriptions to the cards. The notice is separate transient prototype UI and does not alter the card content.
8. **Make the grid responsive by available width.** Use three equal columns at the wide reference size, two columns when three cards would become cramped, and one column on narrow phones. Base reflow on the work surface's available inline size (for example, container queries) rather than assuming viewport width equals card-grid width. Use `minmax(0, 1fr)` or equivalent, allow labels to wrap, keep controls touch-friendly, and prevent horizontal page scrolling.
9. **Preserve shell and theme behavior.** Reuse the existing header, drawer, backdrop, and shared theme tokens. Verify card surfaces, selected state, focus ring, and icon contrast in both light and dark themes; do not duplicate the screen layout for each theme.
10. **Review the rendered home screen.** Compare the desktop panel/card proportions to both references, then inspect a narrow phone, tablet, a constrained desktop content area, and the wide reference size in both themes. Check that cards and their labels do not clip, there is no page-level horizontal scrolling, and the dialog remains within the viewport. Verify the tool link and placeholder notice with pointer and keyboard: Tab focus, Enter/Space activation, Escape dismissal, labelled close action, and focus restoration to the activating placeholder. Confirm the page contains no file input or merge/processing behavior.

**Checkpoint:** the desktop toolbox shows the screenshot's centered three-card row; the tool card navigates to Step 7's visual destination; New Tool cards have an accessible prototype-only response; and the collection stays usable without clipping or horizontal scrolling at phone and tablet sizes.

**Execution boundary:** 6.1 and 6.2 are complete. The current implementation round covers 6.3–6.10 only; it must not be treated as completion of Step 7 or as delivery of merger functionality.

#### Step 6.1 execution record

- Added `src/data/tools.ts` with a discriminated TypeScript union and three entries: one navigable JW Library Merger tool and two New Tool placeholders.
- Kept the list serializable and independent of React rendering. The tool entry has the planned stable hash destination; placeholder entries intentionally have no destination.
- Bumped the app version to `0.1.2` and added the matching changelog entry for this completed implementation substep.
- Production build passed with Node.js 22.23.3 (`tsc --noEmit` and Vite 8.3.4).

#### Step 6.2 execution record

- Confirmed substep 6.2 remains relevant: the home screen previously contained an empty `aria-hidden` work surface.
- Replaced it with a named “Available tools” section and an unordered list generated from `toolboxEntries`; all three labels now come from the shared typed data module.
- Kept icon rendering, card styling, navigation, and placeholder interactions for their later substeps.
- Bumped the app version to `0.1.3` and added the matching changelog entry for this completed implementation substep.
- Production build passed with Node.js 22.23.3 (`tsc --noEmit` and Vite 8.3.4).

#### Step 6.3–6.10 execution record

- Reassessed Step 6 against the current source and references. Confirmed 6.1 and 6.2 were already complete; corrected the stale status text and clarified the remaining implementation boundary before proceeding.
- Rendered each typed toolbox entry as a full-card semantic control: a current JW Library Merger hash link with the open-book icon, and two New Tool buttons with plus icons. The shared data module remains the only source for card labels and destinations.
- Added a native modal `dialog` shared by both placeholder buttons. It contains only “Coming soon” and “This entry is a placeholder.”, has a labelled heading and close action, supports Escape, and lets the browser restore focus to the activating button.
- Added card, icon, selected, hover, pressed, focus-visible, dialog, and backdrop styles using the existing semantic theme tokens. No theme-specific color literals or new dependencies were added.
- Made the card grid reflow by work-surface width: three columns when wide, two columns when constrained, and one column on narrow surfaces. Added wrapping and a non-backdrop-filter dialog fallback.
- Kept the JW Library Merger destination at `#library-merger` for Step 7. This round adds no destination screen, file inputs, processing, or merge logic.
- Bumped the app version to `0.1.9` and added its changelog entry. Browser and production-build review results are recorded after the implementation audit.
- Reviewed the rendered screen in Edge at 1586 × 992 (three columns), 768 × 1024 (two columns), 390 × 844 (one column), and 320 × 320 (one column), including light and dark themes. Document width matched each viewport; labels and cards remained visible.
- The first desktop review exposed an overly high two-column threshold; adjusted the container-query threshold so the 848px reference work surface renders all three cards in one row. The link's Enter activation changed the fragment to `#library-merger`.
- Verified the New Tool button with Space and pointer activation. The native dialog exposed its heading and placeholder-only copy, fit at 320px viewport width (282px dialog), closed with Escape and its close button, and restored focus to the activating card.
- Production build passed with Node.js 22.23.3 (`tsc --noEmit` and Vite 8.3.4). No browser automation dependency or project test framework was added.

### Step 7 — Build the JW Library Merger visual prototype screen

This step remains relevant. Step 6 added the launcher link to `#library-merger`, but no screen currently handles that route. Implement this as a static, clickable design prototype only. Do not add any file inputs, file APIs, data processing, merge logic, export, or download behavior.

#### Substeps

1. **7.1 Add lightweight hash-based screen state.** Reuse the existing Vite/React app and browser history; do not add a router dependency. Treat an empty hash and `#toolbox` as the launcher, `#library-merger` as the source screen, and `#merge-preview` as a fixed mock preview. Listen for hash changes so links, back/forward, and direct hash entry update the rendered screen. Keep GitHub Pages refresh behavior static-hosting-safe.
2. **7.2 Reuse and update the app shell.** Keep the existing background, drawer, theme controls, responsive menu, and version. Make the header title **JW Library Merger** on both merger states. Point the drawer's JW Library Merger link to `#library-merger`; add a **Toolbox** link to the drawer while inside the merger prototype. Close the compact modal drawer after a navigation choice. Move keyboard focus to the new page heading when the route changes.
3. **7.3 Build two clearly identified source panels.** Show **Library A** and **Library B** with book-related visual markers and explicit sample/placeholder labels. Keep the content illustrative and static. Do not style a panel as an enabled drop target or include a file picker, fake file count, or selectable file rows.
4. **7.4 Show the relationship and primary action.** Connect the two source panels with a clear merge-direction graphic that reflows on narrow screens. Add an operable **Preview Merge** button that changes the hash to `#merge-preview`; it must not perform calculations or imply that it read user data. Include concise copy that makes the prototype/sample nature clear.
5. **7.5 Design a fixed mock preview state.** Show an illustrative combined-library result and identify it visibly as a prototype/sample preview. State that no files were processed. Use no invented record totals or file metadata. Provide **Back to edit** (`#library-merger`) and **Return to Toolbox** (`#toolbox`) links.
6. **7.6 Provide a route back to Toolbox from the source screen.** Include an in-screen **Back to Toolbox** link and the drawer link. Preserve conventional link semantics for navigation and button semantics for the preview state change.
7. **7.7 Apply shared visual and accessibility rules.** Use the existing surface, border, spacing, typography, accent, focus, and motion tokens in both themes. Use semantic headings/regions, hide decorative SVGs from assistive technology, maintain visible focus and comfortable touch targets, and keep the source/preview content readable without glass blur.
8. **7.8 Review route flow and responsive states.** Verify Toolbox → source screen → mock preview → Back to edit → Toolbox by keyboard and pointer, plus browser back/forward and direct hash entry. Review wide desktop, tablet, phone, and narrow phone in light/dark themes. Confirm no horizontal overflow and verify that no file-processing controls or behavior were introduced.

**Checkpoint:** a reviewer can go Toolbox → JW Library Merger source screen → mock preview → back to edit → Toolbox without a reload or dead end. Each visual action has an understandable outcome, and no user files are read or processed.

#### Step 7 execution record

- Reassessed Step 7 against the existing app: the launcher link to `#library-merger` existed, but no source or preview route had been implemented. Expanded the step into eight substages before building the routes and screens.
- Added lightweight hash-based route state for the Toolbox, JW Library Merger source screen, and `#merge-preview`, including direct hash entry, hash changes, and browser back/forward. No router or other dependency was added.
- Reused the app shell and changed the header title by route. The drawer now points to the merger screen and includes a Toolbox return link while on the merger or preview screen; compact drawer navigation closes the modal and focuses the new page heading.
- Added two static, clearly marked sample source panels and a merge-direction indicator. The screen has no file inputs, drop targets, selectable files, file APIs, or processing behavior.
- Added the **Preview Merge** action and fixed combined-library preview. Both screens identify their illustrative/sample content and state that files have not been processed. Added Back to edit and Return to Toolbox paths.
- Applied existing semantic colors, surfaces, spacing, focus, and motion tokens. Added container-width reflow for the source and preview compositions, with readable light/dark styles.
- Verified keyboard navigation through the tool card, Preview Merge, Back to edit, and Toolbox paths; verified pointer activation of Preview Merge and Return to Toolbox. Direct preview entry, browser back/forward, compact drawer return navigation, route heading focus, and zero file inputs were also checked.
- Reviewed both routes in Edge at 1586 × 992, 768 × 1024, 390 × 844, and 320 × 320 in both themes. Every checked document width matched its viewport; the source and preview layouts remained within the viewport.
- Bumped the app version to `0.1.10` and added the matching changelog entry. The final production build passed with Node.js 22.23.3 (`tsc --noEmit` and Vite 8.3.4).

**Checkpoint:** a reviewer can go Toolbox → JW Library Merger prototype → mock preview → back to the merger screen → Toolbox without a reload or dead end.

### Step 8 — Add theme switching and remembered preference

This step remains relevant. The theme controls and both token palettes already exist, but the current app always initializes to dark and does not retain the user's choice. The controls update React state, while the HTML currently carries a dark fallback. Complete the missing initialization and persistence behavior without adding a dependency or any file-processing functionality.

#### Substeps

1. **Define the preference contract.** Use the stable key `library-merger-theme` and accept only `light` or `dark` as explicit saved values. A missing, malformed, or inaccessible value is not an explicit preference. Keep the app's existing `data-theme` root attribute as the single theme selector consumed by CSS tokens.
2. **Choose the initial theme in a documented order.** On startup, use a valid saved choice first. If there is none, use `prefers-color-scheme`; if that API is unavailable or throws, use dark as the deterministic fallback. A later system preference change does not override a choice made in the app.
3. **Prevent the wrong-theme first paint.** Add a small synchronous initializer in `index.html`'s `<head>`, before the Vite module entry point can load, to apply the saved/system/fallback choice to `<html data-theme>`. Guard storage and media-query access independently so a storage exception does not prevent system preference detection. Keep the static HTML value as a valid dark fallback.
4. **Initialize React from the already-selected root.** The first React render must read the initializer's `data-theme` value. Keep the existing state and root attribute synchronized when a theme button is activated; do not reload the page.
5. **Persist only an explicit user action.** Save the selected value when Light or Dark is chosen. Do not turn a system-derived first-load theme into a saved explicit preference merely because the app mounted. Update UI state and the root theme even if writing storage fails.
6. **Preserve accessible selection feedback.** Keep both controls keyboard operable, maintain the correct mutually exclusive `aria-pressed` values, and retain a visible selected/focus state in both themes. Ensure native `color-scheme` remains aligned through the existing theme tokens.
7. **Review every existing screen and state in both themes.** Check the drawer, header, toolbox cards, merger sample screen, preview, placeholder dialog, text, selected controls, focus rings, disabled states (if present), and compact drawer treatment. Theme changes must alter tokens rather than duplicate screen styles.
8. **Verify preference and failure scenarios.** Check first load with system light and system dark, valid stored light/dark overriding the system, persistence after refresh, malformed stored data, unavailable/throwing storage reads, and failed storage writes. Confirm each hash route starts with the same chosen theme and no file input or processing was added.
9. **Complete the implementation round.** Run the production build and record the results. Increment the patch version and changelog together only after the behavior is implemented and reviewed; add the execution notes and checkpoint below.

**Checkpoint:** the selected theme is visibly represented in the controls and is consistent after refresh, without requiring an account.

#### Execution record — 2026-10-13

- Confirmed the step remained relevant: theme state and token-based palettes existed, but first load was always dark and user choice was not persisted.
- Added the `library-merger-theme` preference contract. `index.html` now applies a valid saved theme, otherwise the system preference, otherwise dark before the React entry point runs. Storage and media-query access are guarded separately.
- Updated `src/App.tsx` so theme button activation updates the root immediately and stores only an explicit selection; a storage write failure does not block switching. Existing `aria-pressed` states and theme-token focus/selected states remain in use.
- No new dependencies, file inputs, file processing, network calls, or business behavior were introduced.
- `npm run build` passed with Node.js 22.23.3, TypeScript, and Vite 8.3.4. The active shell's Node 20.15.0 is below the declared project minimum, so the verification used the already-installed Node 22 runtime. The in-sandbox Vite invocation hit Windows `spawn EPERM`; the same build passed when run with the authorized unsandboxed build check.
- Automated interactive browser checks were unavailable in this project environment because no Playwright/browser test setup is installed. Preference fallback, refresh persistence, and throwing-storage cases therefore remain manual browser walkthrough items.
- Bumped the app version to `0.1.11` and added the matching changelog entry.

**Checkpoint:** implemented and production build passes. Theme choices now follow saved preference → system preference → dark fallback on startup, and explicit selection remains applied after refresh when browser storage permits.

### Step 9 — Add click-through prototype behavior

This step remains relevant, but the core click-through prototype already exists. Re-audit the implemented paths for dead ends, misleading behavior, and semantic keyboard support, then make only the necessary fixes. Keep all behavior as navigation or local interface state; no merger logic or file behavior belongs here.

#### Substeps

1. **Inventory controls and outcomes.** Record each visible interactive element and classify it as navigation, open, close, select, dismiss, or visibly disabled. Treat decorative icons and connectors as non-interactive and hide them from assistive technology.
2. **Check semantic elements.** Use anchors for route changes, buttons for state changes, and native dialog semantics for the placeholder notice. Avoid click handlers on generic containers. Every icon-only control needs an accessible name; controls with changing state need accurate state attributes.
3. **Check the complete route journey.** Verify Toolbox → JW Library Merger → mock preview → back to edit → Toolbox through both page actions and the drawer. Confirm browser back/forward and direct hash entry remain coherent, and route changes close the compact drawer where appropriate.
4. **Check reversible shell interactions.** Verify hamburger and X both open/close the drawer, Escape closes it, the mobile scrim dismisses it, and focus returns to the relevant control. Confirm drawer focus is contained only when it behaves as a compact-screen modal.
5. **Check theme and placeholder interactions.** Light/Dark choices are keyboard-operable and visibly selected. New Tool placeholders open a dismissible Coming soon dialog; closing via its button or Escape returns the user to the same context. No placeholder suggests a real tool was created.
6. **Make prototype status explicit.** The merger source screen and preview must identify sample/prototype content. The Preview Merge action may navigate to the illustrative screen but must not show fake progress, process data, or imply a completed real merge.
7. **Verify keyboard and focus behavior.** Exercise Tab and Shift+Tab through visible controls, Enter/Space on buttons and links, and Escape for the drawer/dialog. Confirm visible focus indication and that focus does not remain inside hidden drawer content.
8. **Fix only confirmed gaps.** Keep visual styling token-based and use existing conventions. Do not add dependencies or actual file inputs, parsing, merging, uploads, or downloads.
9. **Record verification and release the round.** Run the available build and browser checks, report any environment-limited checks explicitly, and update the patch version and changelog for implementation changes.

#### Interaction inventory

| Control | Outcome | Semantics/state |
|---|---|---|
| Drawer close X / header hamburger | Close or open the drawer | Named buttons, `aria-expanded`, `aria-controls` |
| Drawer Toolbox / JW Library Merger links | Navigate between hash routes | Anchors; current tool exposes `aria-current` |
| Light / Dark controls | Change and remember theme | Buttons with mutually exclusive `aria-pressed` |
| JW Library Merger tool card | Navigate to merger sample screen | Anchor |
| New Tool cards | Open prototype-only notice | Buttons; no creation behavior |
| Preview Merge | Open illustrative preview route | Button; no data processing |
| Back to edit / Return to Toolbox | Navigate back through prototype | Anchors |
| Coming soon dialog Close / Escape | Dismiss the notice | Native dialog and button |
| Compact-screen scrim | Close the drawer | Decorative dismissal surface, hidden from accessibility tree |

**Checkpoint:** no visible control is a dead end, interaction behavior is available to keyboard users, and all merger-related output is clearly illustrative rather than real processing.

#### Execution record — 2026-10-13

- Confirmed the step remains relevant as an interaction audit; the route flow, drawer controls, theme switches, placeholder notice, and prototype preview were already implemented.
- Added the detailed substeps and a control-by-control interaction inventory above so future changes can be reviewed against clear outcomes.
- Reviewed `src/App.tsx`: route changes use anchors/hash routes; state changes use buttons; icons and layout connectors are decorative; icon-only controls have accessible names; the placeholder uses a native labelled `<dialog>`; Escape closes both the drawer and dialog; route headings receive focus after navigation; compact drawer focus is constrained while open and returns to the hamburger when closed; merger screens identify sample/prototype content.
- Confirmed the mock preview is navigation to illustrative sample content and no file input or merge behavior is present.
- No application code gap was identified, so this audit required no app-code change. No version bump was made because project instructions reserve version increments for implementation change rounds, not planning or audit documentation alone.
- Automated browser interaction verification was attempted in Edge, but the temporary control harness did not reliably target CSS Module controls. Treat the pointer/keyboard walkthrough in Step 9 and Step 10 as still requiring a manual browser pass; no browser behavior is claimed as tested here.

**Checkpoint:** code review finds no dead visible controls or false claims of real processing. The interaction contract is documented; manual browser verification remains outstanding.

**Checkpoint:** there are no visible dead controls and no interaction falsely claims to have processed user data.

### Step 10 — Responsive and accessibility review

This step remains relevant and uncovered a real layout defect: just above the 960 px compact-drawer breakpoint, the open drawer can extend over the main header. Extend the original broad-screen checklist to cover breakpoint edges, short viewport heights, each prototype route, and the controls' accessibility state—not only the home screen.

#### Substeps

1. **Choose representative widths and heights.** Review 320 and 360 px phone widths, 768 px tablet, 960/961 px around the drawer breakpoint, 1024 px small desktop, and 1440 px wide desktop. Include a short 320 px high viewport for drawer scrolling. These are sampling points, not additional CSS breakpoints.
2. **Review every route and theme.** Check Toolbox, source-library mock, and preview in light and dark themes. Confirm the same token-driven hierarchy remains usable, all route content fits its surface, and theme contrast/boundaries remain visible.
3. **Measure overflow and overlap.** Check `document.documentElement.scrollWidth` against the viewport width. Measure the open drawer's right edge against the main content's left edge at widths above 960 px. Confirm the header, work surface, cards, and action buttons remain within the viewport; below 961 px the drawer overlays as a modal and the main page is inert while it is open.
4. **Check card and workflow reflow.** At phone/tablet widths, inspect the three tool cards, source pair, preview flow, and wrapped actions. Ensure no card label or button text clips, controls remain comfortably targetable, and no decorative background element captures input or causes scrolling.
5. **Check drawer reachability.** Open and close the drawer at compact widths; verify the X, theme controls, and version footer remain reachable on short screens by internal drawer scrolling. Confirm scrim click, Escape, focus containment, and focus return to the hamburger.
6. **Review keyboard order and focus appearance.** Tab and Shift+Tab through each route, activate links/buttons with Enter or Space, and dismiss the drawer/dialog with Escape. Confirm focus follows visual reading order, remains visible in both themes, and never sits inside hidden or inert content.
7. **Audit semantics and accessible names.** Use the browser accessibility tree or a screen reader where available. Check landmark/heading order, link and button names, `aria-current`, `aria-expanded`, `aria-pressed`, dialog naming, decorative icon hiding, and prototype-only notices. State clearly when a control is intentionally disabled; do not imply disabled behavior where the control instead opens a prototype notice.
8. **Check motion and browser fallbacks.** Emulate `prefers-reduced-motion: reduce` and verify token-controlled transitions are removed or minimized. Check the no-backdrop-filter surface fallback if practical. Avoid using color/glow alone to communicate selected, focus, sample, or disabled state.
9. **Fix confirmed defects without changing unrelated visual direction.** Prefer correcting shared layout rules or semantic tokens over viewport-specific hacks. Add a new breakpoint only where content evidence requires it.
10. **Record tested coverage and remaining limits.** Distinguish measured browser checks from source inspection and disclose unavailable screen-reader/device checks. Bump version and changelog together only if the review requires an implementation change; documentation-only checklist clarification does not create a release round.

#### Execution record — 2026-10-13

- Edge confirmed there was no page-level horizontal overflow on the tested prototype routes and themes at 360, 768, 1024, and 1440 px. The initial measurement exposed that main/drawer geometry needed a dedicated overlap check at 961 and 1024 px.
- At 961 px, the main content began 26 px before the open drawer's right edge; at 1024 px it began 10 px before. Added a minimum drawer-plus-gap offset in `src/styles/layout.css` for the desktop open-drawer layout.
- Post-fix Edge geometry checks at 961, 1024, 1064, and 1440 px confirmed a 16 px minimum drawer/content gap (56 px at 1440 px), no content extending beyond the viewport, and no horizontal document overflow.
- Checked all three prototype routes in both themes at 320, 360, 768, 960, 961, 1024, and 1440 px. No horizontal document overflow or work-surface clipping was measured. A 320 px-high drawer check confirmed the theme controls and version footer are reachable by scrolling the drawer.
- Audited interactive control names and found names on the exposed buttons and links; the one empty-text link in the raw DOM belonged to the hidden/inert drawer state. Reduced-motion emulation resolved `--motion-duration-fast` to `0ms`.
- Source review confirmed focus-visible styling, drawer focus management, `aria-expanded`/`aria-pressed`/`aria-current`, named modal dialog, and decorative icon hiding. A screen reader and actual mobile devices were not available for this check.
- `npm run build` passed with Node.js 22.23.3, TypeScript, and Vite 8.3.4.
- Updated `package.json`, `package-lock.json`, and `CHANGELOG.md` to version `0.1.12` for the responsive layout fix.

**Checkpoint:** responsive geometry was measured in Edge across the listed routes, themes, and viewport widths; the discovered desktop overlap is fixed, short-height drawer utilities remain reachable, and the production build passes. Screen-reader and physical-device checks remain outside this environment's verification.

### Step 11 — Verify browser and build behavior

This step remains relevant as the integration and release-readiness check. Expand it into discrete checks for repository scripts/runtime, available test coverage, the built static artifact, browser journeys, GitHub Pages subpath loading, and explicit limits of the local environment. Do not add a test framework just to claim coverage, and do not add file-processing tests during this design phase.

#### Substeps

1. **Confirm the supported runtime and available commands.** Read `package.json`, `.nvmrc`, and the existing package lock. Use the project's declared Node requirement and package manager; do not alter versions or lockfiles for verification.
2. **Inspect existing test coverage before running it.** Check scripts and installed dependencies for an existing unit/e2e setup. Run only configured checks that apply. If none exists, record that fact; do not add Vitest, Playwright, browser binaries, or fixtures solely for this design-only round.
3. **Run a fresh production build.** Execute the repository's build script and record Node/Vite versions and success/failure. Distinguish environment permission errors from source/build failures and retry through the authorized local environment when sandbox process creation prevents Vite on Windows.
4. **Run browser checks in the available browser.** Verify the app loads, direct hash entry works, route navigation and back/forward work, drawer/theme/dialog actions are usable, and the theme persists after refresh. Check the representative responsive widths from Step 10. Do not claim Chromium/WebKit/Safari coverage if only Edge was available.
5. **Verify the static project-site path.** Confirm `vite.config.ts` uses the intended repository subpath. Inspect built `dist/index.html` and request each referenced JS/CSS asset under that same prefix; expect successful responses. Confirm hash-route refresh serves the built app from the same base path.
6. **Review deployment assumptions.** Compare the configured base with the actual GitHub repository slug only when repository metadata or an authoritative GitHub page is available. Record an unverified slug as an open deployment check rather than treating the local folder name as proof.
7. **Check browser/platform coverage honestly.** Use actual Safari only on Apple Safari. Treat Playwright WebKit as useful but incomplete Safari coverage. Record unavailable browser/OS/device checks and whether a screen reader was used.
8. **Keep the prototype boundary intact.** Confirm this phase still has no file input, JSON/ZIP processing, uploads, downloads, backend, or account behavior. Do not introduce such behavior while exercising visual controls.
9. **Record results and release state.** Put exact tested versions, routes, base-path outcomes, and limitations in the execution record. Update version and changelog only if verification requires an implementation fix; plan-only clarifications do not create a new release.

#### Execution record — 2026-10-13

- Confirmed Node.js 22.23.3 is supported by `package.json` and `.nvmrc` selects Node 22. The active default Node 20.15.0 is below the Vite minimum, so commands were run using the installed Node 22 runtime.
- Confirmed the project has no configured test script and no installed Vitest/Playwright packages. No testing dependency or test-only code was added.
- `npm run build` passed: TypeScript `tsc --noEmit` and Vite 8.3.4 production build completed successfully.
- Microsoft Edge 155 production-preview checks passed for direct `#merge-preview` entry and refresh, Preview Merge/back navigation, Light theme selection and persistence after refresh, placeholder dialog opening, and Escape dismissal.
- The static preview at `/LibraryMerger/` returned HTTP 200. The generated JS and CSS references both used `/LibraryMerger/assets/` and returned HTTP 200. Refreshing `#merge-preview` kept the hash and rendered the illustrative sample notice.
- Step 10 recorded responsive Edge measurements at 320/360/768/960/961/1024/1440 px in both themes across all three routes, plus drawer reachability at 320 px height and reduced-motion behavior.
- No Chromium/Chrome installation, Playwright/WebKit setup, Apple Safari, Mac, or screen reader was available. The local checkout has no `.git/config`, so the remote GitHub repository slug could not be confirmed; `/LibraryMerger/` remains based on the workspace/project name and must be compared with the repository slug before publishing.
- Confirmed the checked-in source still contains no file input or real file-processing workflow. No implementation change was needed for Step 11, so no version bump was made.

**Checkpoint:** production build and available Edge/static-base-path checks pass. Coverage and deployment items that require other browsers, devices, assistive technology, or repository metadata are explicitly recorded for follow-up.

### Step 12 — Finish the change round and hand it off

This step remains relevant as the final cleanup and handoff gate. Add explicit checks for generated browser artifacts, public/private content boundaries, version consistency, implemented versus illustrative behavior, open verification limitations, and the exact files to upload. Do not claim the work has been committed or published when no GitHub repository connection is available.

#### Substeps

1. **Remove accidental language and dead UI.** Search user-visible source copy for unintended Dutch strings and inspect controls for missing outcomes. Keep references to the Dutch source screenshots only in project documentation where needed.
2. **Remove temporary review artifacts.** Inspect the project root for debug scripts, screenshots, browser profiles, and unused assets. Preserve intentional reference images and source files. Remove only identified generated review data whose location and purpose are established.
3. **Audit the prototype boundary and privacy.** Search application source for file inputs/file APIs, JSON or ZIP processors, uploads, downloads, runtime network calls, embedded secrets, and user data. A guarded `localStorage` entry for the user's theme is expected; it stores no library contents.
4. **Reconcile version metadata.** Confirm `package.json`, `package-lock.json`, the drawer's package-sourced version, and the newest changelog entry agree. Do not bump again for documentation-only cleanup or because the verification step completed.
5. **Document real and mock behavior.** State which navigation/theme/drawer/dialog interactions are functional and which library content/results are samples. Make clear that the prototype does not select, read, merge, upload, or download user files.
6. **Carry open items forward.** Include remaining repository-slug, Safari/Chrome/WebKit, screen-reader, physical-device, or manual browser checks. Do not convert an unavailable check into a passed item.
7. **Prepare the exact upload list.** For an implementation release, list changed source/configuration/version/changelog files and give their target repository paths. Exclude ignored build output, dependencies, user data, screenshots used only as references unless the round changed them, and temporary browser profiles.
8. **Use the user's GitHub workflow.** When handing files over, direct the user to upload/edit them on GitHub.com and use its **Commit changes** action. Do not use Git command-line tools or claim a commit/publish occurred without evidence.
9. **Complete the checklist and handoff record.** Mark only supported requirements complete, record exact files/version and verification limits, and leave the project ready for design approval or a separately scoped functional phase.

#### Execution record — 2026-10-13

- Reviewed the UI source for Dutch user-facing labels; visible app copy is English. The supplied screenshots remain unchanged reference inputs.
- Confirmed the placeholder controls open a clearly labelled Coming soon dialog; navigation and theme switching are real UI interactions. Merger sources and preview are static examples; no user files are read or processed.
- Searched application source for file inputs and file-processing APIs, JSON/ZIP handling, downloads/uploads, runtime network calls, and embedded secrets. None were found. The only persistence is the explicitly selected `light`/`dark` theme in local storage.
- Found and removed the generated `step4-review-cdp-profile` browser profile from the project root; the Step 4 plan record identifies it as a temporary review profile that should have been cleaned up. Preserved both theme reference images and all app source.
- Confirmed `package.json`, `package-lock.json`, the package-sourced drawer version, and `CHANGELOG.md` agree on `0.1.12`. No new version was created for documentation/cleanup-only work.
- Current implementation release files to upload for version `0.1.12` are:
  - `src/styles/layout.css` → `src/styles/layout.css`
  - `package.json` → `package.json`
  - `package-lock.json` → `package-lock.json`
  - `CHANGELOG.md` → `CHANGELOG.md`
  - `DESIGN_IMPLEMENTATION_PLAN.md` → `DESIGN_IMPLEMENTATION_PLAN.md` (updated verification and handoff records)
- No remote repository metadata is present in this checkout, so the `/LibraryMerger/` base path must still be compared with the GitHub repository slug before publishing. Chrome/Chromium, WebKit, Safari, assistive technology, and physical-device coverage remain unverified as recorded in Step 11.
- No commit or deployment was made. Use GitHub.com's upload/edit flow and **Commit changes** after confirming the repository slug and reviewing the files.

**Checkpoint:** the prototype is cleaned and version-consistent at `0.1.12`; real versus mock behavior and the release file list are documented. The remaining publishing and platform checks are visible handoff items rather than assumed successes.

## 8. Proposed screen inventory

This inventory remains relevant as the compact map of screens and states implemented by the design prototype. The original table combined the preview screen with the placeholder dialog and did not represent theme initialization, compact navigation, or direct hash entry. Reconcile the inventory with the built app while keeping its boundary explicit: this section describes rendered UI states and navigation, not future merger functionality.

### Inventory review steps

1. **Separate routes from overlay states.** List hash-routed pages separately from drawer and dialog states so each has one clear entry, dismissal, and return path.
2. **Include cross-cutting state variants.** Record theme preference resolution, light/dark display, and compact versus desktop drawer behavior without duplicating every route/theme/viewport combination as a separate row.
3. **Describe outcomes and data boundaries.** For every state, say what the user sees and whether anything is persisted or processed. Identify all merger content and results as static samples.
4. **Include accessibility cues.** Note the semantic/current/pressed/open state that helps communicate where the user is and how controls work. Do not imply unavailable controls are disabled if they actually open a prototype notice.
5. **Reconcile against the app.** Confirm every listed row has a current UI entry point; add no speculative screens or production behaviors to this prototype inventory.

### Current screen and state inventory

| Screen/state | Entry point or transition | Expected visible behavior | Data and persistence |
|---|---|---|---|
| Toolbox, desktop drawer open | Initial load above the compact breakpoint; reopen with the hamburger | Toolbox header and three tool cards remain visible beside the drawer; drawer exposes tool navigation, theme choices, and version | No user data |
| Toolbox, drawer closed | Drawer X, Escape, or hamburger | Toolbox remains usable; header hamburger reports the current expanded state and can reopen navigation | No user data |
| Compact drawer open | Hamburger on phone/tablet layout | Drawer appears as a modal panel over a scrim; background main content is inert; focus stays in the panel | No user data |
| Compact drawer closed | X, Escape, scrim, or selecting a drawer route | Scrim and modal state are removed; focus returns to the opener or moves to the newly navigated page heading | No user data |
| Initial theme resolution | First page load | A valid saved Light/Dark choice wins; otherwise the operating-system color preference is used; dark is the fallback if preference APIs are unavailable | Reads `library-merger-theme`; system-derived choice is not saved automatically |
| Light or Dark theme selected | Theme control in the drawer, available from each route | All shared surfaces and controls switch immediately; the selected control exposes `aria-pressed` and a visible selected state | Explicit choice is saved locally; storage failure leaves the current session switchable |
| JW Library Merger source mock | Toolbox tool card or drawer item | Two named sample-library panels and a Preview Merge action; Toolbox return path remains available | Static sample labels only; no file input, file read, or merge |
| Merge preview mock | Preview Merge action or direct `#merge-preview` hash | Illustrative combined-library result and prototype/sample notice; Back to edit and Return to Toolbox links are available | Static example only; no merge calculation, export, or download |
| New Tool notice open | Either New Tool card | A labelled Coming soon dialog opens with placeholder-only text and a Close button; Escape dismisses it and returns focus | No tool creation and no saved data |
| New Tool notice closed | Close button or Escape | User returns to the same Toolbox context and can choose either placeholder again | No user data |
| Hash route refresh/history | Direct `#toolbox`, `#library-merger`, or `#merge-preview`; browser back/forward | Correct page heading/content renders without server-side route rewrites; route changes keep the chosen theme | Hash in browser location only; no account or server state |

#### Execution record — 2026-10-13

- Rechecked the inventory against `src/App.tsx`, `index.html`, and the production preview behavior recorded in Steps 8–11.
- Confirmed all listed screen states and entry paths exist. The drawer/dialog overlays are now distinct from hash routes; the inventory also names system/saved theme resolution and compact drawer modality that were missing from the earlier table.
- Confirmed this is a documentation-only reconciliation. No application change or version bump is required; the current implementation remains `0.1.12`.

**Checkpoint:** this section now gives a complete, current route/state inventory with explicit entry paths, accessibility cues, and real-data/persistence boundaries. No missing prototype screen was found.

## 9. Suggested visual tuning order

This order remains useful, but it needs concrete review gates so developers do not spend time polishing an unstable layout or compare themes in inconsistent states. Use the same route, viewport, drawer state, focus state, and selected theme control for each comparison. Treat the screenshots as proportion and mood references rather than exact-pixel targets.

### Visual tuning substages

1. **Lock the composition first.** Compare the Toolbox header, drawer, work surface, tool-card group, and orbital background at the reference aspect ratio. Confirm alignment, hierarchy, and readable negative space before adjusting effects.
2. **Review responsive geometry.** Check open and closed drawer states at compact widths and just below/above the desktop breakpoint. Keep the main content out from under the desktop drawer; at compact widths use the modal drawer/scrim behavior. Reflow cards and mock workflow content without horizontal page overflow.
3. **Tune type and legibility.** Review heading/body/caption hierarchy, line length, wrapping, and contrast on every semantic surface in both themes. Text and boundaries must remain clear without glow or blur.
4. **Tune components and spacing.** Align card, icon, label, navigation, and workflow-action sizes with shared spacing/radius tokens. Check visible focus outlines and practical touch targets as part of component sizing.
5. **Tune theme tokens side by side.** Adjust centralized light/dark semantic tokens and the small brand-accent source values, not scattered component palette literals. Preserve the same layout and state cues in both themes. Recheck text, focus, selection, borders, and disabled styling after an accent change.
6. **Tune decorative background art.** Adjust local CSS orbital forms, gradients, and diffuse light only after content hierarchy is stable. Keep the art decorative and behind all interactive surfaces; never use it to carry meaning or compromise text contrast.
7. **Tune glass and motion effects.** Apply blur, glow, shadows, and transitions last. Verify opaque fallback surfaces where backdrop filtering is unavailable and verify reduced-motion behavior.
8. **Tune interaction states.** Compare hover, keyboard focus, active, current/selected, dialog, prototype notice, and any disabled state in both themes. State must remain understandable when color or glow is unavailable.
9. **Use matched comparisons and record the result.** Compare each route in Light and Dark using the actual theme controls so `data-theme` and `aria-pressed` cannot drift apart. Capture the review viewport and list any concrete issue before changing CSS.
10. **Recheck after every visual change.** Repeat the affected screen at compact and desktop widths, in both themes, with reduced motion where relevant. Run the production build and bump version/changelog only for actual implementation changes, not for a documentation-only visual review.

### Visual review record — 2026-10-13

- Captured the Toolbox, source mock, and preview at 1586 × 992 in Edge 155 in both themes, activating the actual Light/Dark buttons so visual palette and selected-control state matched.
- Compared hierarchy, spacing, drawer/content alignment, card group, sample panels, actions, selected/focus treatment, surface boundaries, and background contrast against the references. The composition remains coherent across all three routes and both themes.
- No concrete visual defect requiring another CSS adjustment was found. The small-size and breakpoint checks remain covered by Step 10; no application code or version change was made in this visual review.

**Checkpoint:** the visual tuning sequence now has explicit gates and matched-theme review guidance; the current rendered routes passed the recorded desktop comparison without an additional implementation change.

## 10. Completion checklist

This step remains relevant as the release-readiness audit for the design prototype. A checkbox alone is not evidence: reconcile each claim with the current source and documentation, execute the walkthrough where the local environment permits, and keep unavailable platform checks visibly open. Do not interpret this step as permission to add merger functionality.

### Completion audit substages

1. **Reconcile requirements with the current project.** Compare `AGENTS.md`, `DESIGN.md`, this plan, the rendered UI, and the README. Correct stale or conflicting project-facing documentation, especially language, prototype boundaries, theme persistence, and version claims.
2. **Verify the implementation baseline.** Confirm the supported Node.js/package-manager setup, the app version source, changelog agreement, static Vite base configuration, and a fresh production build. Do not add dependencies solely to make an audit checklist look complete.
3. **Walk through the clickable prototype.** Exercise the Toolbox, tool navigation, open/close drawer, theme selection and refresh persistence, sample merger route, illustrative preview/back links, placeholder dialog, keyboard dismissal/focus behavior, and direct hash entry. Confirm that displayed sample content is clearly identified as illustrative.
4. **Review responsive and accessibility evidence.** Recheck representative narrow phone, tablet, breakpoint-adjacent, and wide desktop sizes in both themes; inspect overflow, touch/keyboard access, selected/current state, focus visibility, and reduced motion. Record which browsers, assistive technologies, and physical devices were actually available; do not infer one platform's result from another.
5. **Audit scope, privacy, and handoff.** Confirm no real file selection/processing, upload/download, remote runtime dependency, secret, or user data was added. List the exact changed files, separate completed checks from open deployment/platform checks, and state that no commit or publication occurred unless verified.

### Requirements

- [x] App uses the existing or newly created TypeScript + React + Vite setup.
- [x] User-facing UI and project documentation are in English; supplied screenshot references may retain their original labels.
- [x] The desktop home screen reflects both attached references, including the open-book card, two New Tool placeholders, glass work surface, header, drawer, and abstract background.
- [x] The same layout hierarchy works in light and dark themes.
- [x] The theme choice can be changed without page reload and is remembered locally.
- [x] The drawer and prototype screens are navigable and keyboard operable.
- [x] The JW Library Merger destination is a visual prototype only.
- [x] No actual files are read, uploaded, transformed, or downloaded.
- [x] Phone, tablet, and wide desktop layouts avoid clipping and horizontal scrolling at the recorded Edge sizes.
- [x] Focus, contrast, reduced motion, and accessible labels have been reviewed in source/Edge; screen-reader testing is still outstanding.
- [x] Static GitHub Pages output and the configured `/LibraryMerger/` base path have been checked locally.
- [ ] Confirm `/LibraryMerger/` matches the actual GitHub repository slug before publishing; repository metadata is not available in this checkout.
- [x] Version and changelog are updated together for the completed implementation round (`0.1.12`).

### Checks that require another environment

- Actual Chrome/Chromium and WebKit browser coverage, Apple Safari on macOS, physical iPhone/iPad checks, screen-reader testing, and confirmation of the GitHub repository slug remain separate follow-up checks when those environments or repository metadata are available. A local Edge result does not satisfy these checks.

### Review walkthrough

1. Open the home page at desktop width with the drawer open.
2. Close it with the X; reopen it with the hamburger.
3. Use the keyboard to open and close it, and navigate to JW Library Merger.
4. Change to light theme; visit the prototype screen; confirm the theme remains consistent.
5. Refresh and confirm the stored theme is restored.
6. Open and dismiss the mock preview; confirm that no file selection or processing occurs.
7. Return to Toolbox and inspect the New Tool placeholders.
8. Repeat the layout review at phone and tablet widths in both themes.
9. Confirm the UI copy is English and the displayed version is consistent.

#### Execution record — 2026-10-13

- Reconciled this checklist with the current source and found the root `README.md` was still in Dutch and described theme choice as session-only. Rewrote it in English and corrected the status to match the current prototype: system preference on first visit, locally remembered explicit choice, sample-only merger screens, and no file-processing behavior.
- Confirmed `package.json` and `CHANGELOG.md` both identify version `0.1.12`; the drawer reads the version from `package.json`. `.nvmrc` selects Node 22, and the package supports Node `^20.19.0 || >=22.12.0`.
- Confirmed `vite.config.ts` uses `/LibraryMerger/`. The actual GitHub repository slug remains unverified because repository metadata is unavailable; this is now an unchecked pre-publication item rather than a completed requirement.
- Reviewed the current React routes and controls against the walkthrough: Toolbox, `#library-merger`, `#merge-preview`, drawer/theme controls, sample-only preview, and placeholder dialog are present. Source inspection shows theme initialization reads the saved theme or system preference, and explicit theme changes write only the theme value to local storage.
- Re-ran the prototype-boundary source search. No file input, file-reading API, JSON/ZIP processor, upload/download flow, or runtime network request was found in application source. The theme preference is the only intended browser persistence.
- The fresh production build passed with Node.js 22.23.3: TypeScript checking completed and Vite 8.3.4 generated the static output in `dist/`.
- Completed a hands-on automated walkthrough in Microsoft Edge 155 on Windows against the built preview. Toolbox and sample merger navigation, Preview Merge/back links, drawer open/close, both theme controls, light-theme restoration after refresh, the New Tool dialog and Escape dismissal, direct `#merge-preview` entry and refresh, and the no-file-input prototype boundary passed.
- Checked horizontal overflow at 320, 390, 768, 960, 961, 1024, and 1440 px in both themes. At desktop widths 961, 1024, and 1440 px, the open drawer did not cover the main content. At compact width, the drawer exposed modal semantics and made the main content inert.
- Chrome itself, WebKit, Apple Safari on macOS, physical iPhone/iPad devices, and screen-reader behavior were not available for this audit and remain open follow-up checks. This Edge run does not claim coverage for those environments. The actual GitHub repository slug also remains unverified.
- This round changes documentation only. No app behavior, version, or changelog entry was changed; no commit or deployment was made.

## 11. Handoff note for the next implementation phase

This step remains relevant as the boundary between the clickable design prototype and any later functional release. It is a handoff and readiness check; completing it does not start file-processing work. The visual direction has been implemented, but explicit design approval is not recorded. Step 10 also retains open repository-slug, Safari/Chrome/WebKit, physical-device, and screen-reader checks. Carry those forward honestly.

### Functional-phase handoff substages

1. **Confirm the phase entry gate.** Before functional implementation starts, record acceptance of the visual direction and decide whether the open publishing/platform checks are required for that release. Keep the current design prototype releasable as its own version while those decisions are pending.
2. **Specify the input contract before writing merge logic.** Obtain representative, non-private JW Library exports and document supported JSON structures and versions, the relevant files and directory layout inside ZIP archives, size/encoding limits, and unsupported cases. Do not infer a schema from the current sample labels or invent file-format compatibility.
3. **Agree on merge semantics and output.** Define how entries are identified, duplicates and conflicting values are handled, ordering and metadata are preserved, partial/invalid sources are reported, and what output file(s) and names users receive. Decide whether ZIP input, ZIP output, or both are required. Treat unanswered rules as blockers for merge implementation, not as choices a junior developer should guess.
4. **Keep implementation isolated and local.** Put the merger's parsing, validation, and transformation in an independently understandable TypeScript tool module, separate from the app shell and screen components. Use standard browser file-input and download APIs; process files on the device; add no upload, server, account, database, analytics, or runtime network behavior.
5. **Add only phase-appropriate dependencies.** Use the project's existing React/TypeScript/Vite/npm setup. Add JSZip only when ZIP support is actually implemented and record its practical benefit. Add Vitest for isolated processing tests and Playwright for key browser flows as required by `AGENTS.md`; explain and keep dependency changes minimal. Do not maintain a second lockfile.
6. **Build representative fixtures and failure cases.** Add clearly licensed or project-created valid JSON/ZIP fixtures plus malformed, unsupported, empty, duplicate, and relevant boundary cases based on the agreed input contract. Never check in real user libraries, secrets, or private data. Tests must prove errors are understandable and do not mutate source files.
7. **Design the real workflow states.** Extend the prototype screens with accessible source selection, validation/loading/error states, a reviewable merge result, and an explicit output/download action only after merge semantics are agreed. Preserve light/dark tokens, keyboard operation, reduced motion, responsive behavior, and clear no-network/local-processing copy. Keep sample-only labels on fixtures and test examples.
8. **Verify browser and static-host behavior.** Run the build and the Vitest/Playwright suites, then cover Chromium, WebKit, and Edge when available. Verify important file flows in actual Safari on a Mac when available. Confirm `/LibraryMerger/` against the actual GitHub repository slug before publishing; do not treat a local preview or Edge as proof of the other environments.
9. **Release and hand off the functional change separately.** Update `package.json`, `package-lock.json`, and `CHANGELOG.md` together for each implementation round, keep the displayed app version package-sourced, list every changed file and destination path, record exact test/platform limitations, and use the user's GitHub.com upload/edit plus **Commit changes** workflow. Do not claim commit or publication without evidence.

### Decisions required before functional coding

The repository guidance establishes browser-local JSON/ZIP handling, but the design documents do not define the actual JW Library export schema or merge rules. Confirm these with the product owner before implementing: supported export variants; the ZIP's internal file selection; duplicate/conflict policy; item identity and order preservation; malformed/partial input behavior; maximum file/archive limits; and exact output format and filename. The implementation plan must not substitute assumptions for these product rules.

### Handoff status — 2026-10-13

- Current deliverable: clickable visual prototype `0.1.12`, built with React, TypeScript, Vite, standard CSS/CSS Modules, and centralized light/dark tokens. It has hash-routed sample screens, theme persistence, and drawer/dialog interactions.
- Explicitly not delivered: file input, JSON/ZIP parsing, validation, merge logic, upload, or output download. The only current local persistence is the selected theme.
- Current dependencies include React and React DOM; JSZip, Vitest, and Playwright are not installed. The present package build script performs TypeScript checking and a Vite production build only.
- Phase gates still open: explicit design approval is not recorded; the actual GitHub repository slug is unavailable; and the browser/device/screen-reader limitations are listed in Step 10.
- Product rules still needed before merge implementation: the input/export contract and all conflict, preservation, error, size, and output decisions listed above.
- This handoff was clarified as documentation only. No functional code, dependency, app version, or changelog entry was changed; no commit or deployment was made.

**Checkpoint:** the next phase now has an explicit entry gate, required product decisions, architecture/privacy boundaries, dependency/testing expectations, fixture guidance, browser coverage, and release handoff. The current phase remains design-only until a separate functional task is authorized and its merge contract is agreed.

