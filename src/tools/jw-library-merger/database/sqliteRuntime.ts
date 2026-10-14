import initSqlJs from "sql.js";
import sqliteWasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";

let sqliteModulePromise: ReturnType<typeof initSqlJs> | undefined;

/** Load the browser SQLite runtime and its locally bundled WebAssembly binary. */
export function loadSqlite() {
  sqliteModulePromise ??= initSqlJs({ locateFile: () => sqliteWasmUrl });
  return sqliteModulePromise;
}
