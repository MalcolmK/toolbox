# Library Merger Toolbox

A small, responsive web toolbox designed for static hosting on GitHub Pages. The current release is a clickable visual prototype; it does not process user files.

## Included tools

- **JW Library Merger** — a visual prototype with sample source libraries and an illustrative preview.
- **New Tool** — two placeholders for future tools.

## Requirements

- Node.js `^20.19.0` or `>=22.12.0` (the project version is recorded in `.nvmrc`).
- npm, included with Node.js.

## Getting started

Install dependencies and start the local development server:

```sh
npm install
npm run dev
```

Vite prints the local address in the terminal. Press `Ctrl+C` to stop the server.

## Available scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the development server with hot reload. |
| `npm run build` | Check TypeScript types and create the production build in `dist/`. |
| `npm run preview` | Serve the production build locally. Run `npm run build` first. |

## Technology

- React and TypeScript
- Vite
- CSS Modules and shared CSS design tokens

The project has no backend. Its production output is static.

## GitHub Pages

Vite uses `/toolbox/` as its base path in `vite.config.ts`, matching the repository name for the GitHub Pages project site. The GitHub Actions workflow builds the app and deploys `dist/`. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. Do not publish the repository root directly: `index.html` there is the Vite source entry and points to uncompiled TypeScript.

## Project structure

```text
src/
  data/tools.ts       # Central, typed list of toolbox entries
  App.tsx             # App shell, navigation, and tool views
  App.module.css      # App shell and view styles
  styles/             # Shared base, layout, and design-token styles
```

## Current status

The prototype includes responsive navigation, Toolbox and sample merger views, light and dark themes, and clickable placeholder cards. The theme follows the system preference on first visit and remembers an explicit light or dark selection locally. Merger content is illustrative only: the prototype does not select, read, merge, upload, or download files. The two **New Tool** cards open a placeholder notice.

See [CHANGELOG.md](CHANGELOG.md) for changes by version, [DESIGN.md](DESIGN.md) for the design brief, and [DESIGN_IMPLEMENTATION_PLAN.md](DESIGN_IMPLEMENTATION_PLAN.md) for the implementation and verification plan.
