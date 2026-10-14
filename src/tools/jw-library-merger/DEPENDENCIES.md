# Merger dependency decisions

## Selected packages

| Package | Role | Why it is needed |
| --- | --- | --- |
| `jszip` | Read and write `.jwlibrary` ZIP archives in the browser. | Implements the project's prescribed browser ZIP workflow without a backend. |
| `sql.js` | Open and query SQLite databases in browser memory. | `userData.db` is SQLite, so the browser needs a SQLite reader; sql.js provides a WebAssembly build that can load database bytes. |
| `@types/sql.js` | Development-only TypeScript declarations for sql.js. | sql.js does not ship TypeScript declarations in its package. |

These are the only packages added for this step. Resolved versions are recorded
in `package-lock.json`; `package.json` uses the corresponding semver ranges.

## Local WebAssembly asset

The browser-only sql.js WebAssembly binary is imported as a Vite URL asset by
`database/sqliteRuntime.ts`. `loadSqlite()` passes that emitted, same-origin
URL through sql.js `locateFile`. This keeps the runtime independent of a CDN
and lets Vite apply the configured `/toolbox/` GitHub Pages base path.

## Smoke check

`dev/dependencySmoke.html` runs a browser-only synthetic check. It creates a
small SQLite database in memory, places its exported bytes in a JSZip archive,
opens that archive again, and queries the database bytes. No user backup is
needed or uploaded. Run the Vite development server and open:

`/toolbox/src/tools/jw-library-merger/dev/dependencySmoke.html`

This check validates package loading and the local WebAssembly asset. It does
not prove that sql.js preserves every JW Library schema object, that rewritten
databases are accepted by JW Library, or that the manifest hash is correct.
Database and guarded ZIP output are implemented, but production download must
remain blocked until the hash rule is established and a generated archive is
validated with JW Library.

The check passed in Microsoft Edge against both the Vite development server
and an isolated production preview. The production preview emitted the WASM
file under `assets/` and loaded it through the `/toolbox/` base path. The
smoke-only build was written to a temporary directory and is not part of the
published app build.

## Resource and compatibility boundary

sql.js loads a database into browser memory and exports a new byte array. This
is suitable for the inspected backup size as an initial implementation choice,
but larger backups and phone/tablet memory use still need measurement. The
selected package is not yet approved as a lossless rewrite mechanism for
unknown tables, indexes, triggers, or JW Library-specific metadata.
