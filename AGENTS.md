# Project instructions

## Purpose

Build a simple, responsive web toolbox that can host multiple small tools, starting with Library Merger. The site should be usable from Windows, Mac, iPhone, and iPad through a browser.

## Current design direction

- Keep the homepage calm and minimal: it is a compact grid/list of available tools, not an explanatory landing page.
- Represent each tool with an icon and its short label, normally the tool's name. Do not add descriptive paragraphs to the homepage unless requested.
- Use a restrained visual style inspired by macOS. The accent color has not been chosen; keep it easy to change and do not treat any color as final.
- Include a side-opening hamburger navigation panel with tool navigation, the light/dark theme setting, and current version information.
- Remember the user's light/dark theme choice between visits.
- Tool cards remain icon plus tool name. Give cards a clear but subtle hover treatment so pointer users can tell which card is under the pointer; provide equivalent visible focus feedback for keyboard users.

## Preferred stack

- Use TypeScript, React, and Vite for the website.
- Keep the production site static so it can be hosted on GitHub Pages.
- Configure Vite's `base` path for the repository name when deploying a project site to GitHub Pages.
- Keep the setup and development workflow straightforward; do not add a backend, account system, or database unless the user asks for one.

## Files and browser support

- Support JSON and ZIP workflows in the browser. Use the standard browser file input and download APIs; use JSZip when ZIP reading or creation is needed.
- Process user-selected files on the device by default. Do not upload file contents to a server unless the user explicitly requests that behavior.
- Target current stable Safari, Chrome, and Microsoft Edge on desktop and mobile layouts where practical.
- Responsiveness is a core requirement: every page and tool must remain usable across screen sizes, from narrow phone screens through tablets to large desktop displays. Check layouts at small, medium, and wide viewport sizes when implementing or changing UI.
- Prefer broadly supported web APIs and provide clear errors for invalid or unsupported files. Avoid relying on Chromium-only file system APIs.

## Testing

- Use Vitest for isolated utility and data-processing tests.
- Use Playwright for end-to-end tests of the main user flows.
- Run browser coverage in Chromium, WebKit, and Microsoft Edge when available.
- Treat Playwright WebKit as useful Safari coverage, not as a substitute for testing in Apple's actual Safari. Verify important file workflows in real Safari when a Mac is available.
- Include representative JSON and ZIP fixtures in tests, including invalid-input cases.

## Versioning and change notes

- Give every completed change round a new version number, starting at `0.1.0`.
- Increment the patch number for each change round (for example, `0.1.0` to `0.1.1`) to keep versioning easy to follow. Do not skip a number.
- Keep a `CHANGELOG.md` with the version, date, and a short description of each change round.
- Keep the current app version visible in the app, such as in an About section or footer, once the app shell exists.
- Update the version and changelog together with the related implementation; do not bump the version for discussion or planning alone.
- When delivering files for upload to GitHub, identify all files changed in the round, including the version and changelog files.

## Working conventions

- Keep tools independently understandable and organized so additional tools can be added without coupling their logic.
- Use accessible labels, keyboard-operable controls, and layouts that adapt cleanly to every screen size, including phone, tablet, laptop, and large desktop.
- Do not commit secrets, private files, or real user data. GitHub Pages content is publicly accessible.
- Before adding dependencies or changing the agreed stack, explain the practical benefit and keep the change minimal.
- The user prefers not to use Git command-line tools or Git clients. Prefer a browser-based GitHub workflow: upload or edit files on GitHub.com and use its **Commit changes** action. When providing changed files from this workspace, explain which files to upload and where they belong in the repository.
