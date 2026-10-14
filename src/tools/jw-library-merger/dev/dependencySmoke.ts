import JSZip from "jszip";
import { loadSqlite } from "../database/sqliteRuntime";

const status = document.querySelector<HTMLParagraphElement>("#status");
const details = document.querySelector<HTMLPreElement>("#details");

async function runDependencySmokeCheck() {
  if (!status || !details) {
    throw new Error("The dependency check page is missing its result elements.");
  }

  const SQL = await loadSqlite();
  const originalDatabase = new SQL.Database();
  originalDatabase.run("CREATE TABLE smoke_probe (message TEXT NOT NULL)");
  originalDatabase.run("INSERT INTO smoke_probe (message) VALUES (?)", [
    "synthetic browser database works",
  ]);
  const databaseBytes = originalDatabase.export();
  originalDatabase.close();

  const originalArchive = new JSZip();
  originalArchive.file(
    "manifest.json",
    JSON.stringify({ name: "synthetic-dependency-check.jwlibrary", version: 1 }),
  );
  originalArchive.file("userData.db", databaseBytes);
  const archiveBytes = await originalArchive.generateAsync({ type: "uint8array" });

  const reopenedArchive = await JSZip.loadAsync(archiveBytes);
  const databaseEntry = reopenedArchive.file("userData.db");
  if (!databaseEntry) {
    throw new Error("JSZip could not find the synthetic database in the archive.");
  }

  const reopenedDatabaseBytes = await databaseEntry.async("uint8array");
  const reopenedDatabase = new SQL.Database(reopenedDatabaseBytes);
  const [queryResult] = reopenedDatabase.exec("SELECT message FROM smoke_probe");
  const message = queryResult?.values[0]?.[0];
  reopenedDatabase.close();

  if (message !== "synthetic browser database works") {
    throw new Error("SQLite did not return the expected value after the ZIP round trip.");
  }

  status.textContent = "Passed: JSZip and local SQLite WebAssembly work in this browser.";
  details.textContent = [
    `ZIP round trip: ${archiveBytes.byteLength} bytes`,
    `SQLite result: ${message}`,
    "All data in this check was generated in memory; no backup was uploaded.",
  ].join("\n");
}

runDependencySmokeCheck().catch((error: unknown) => {
  if (status) {
    status.textContent = "Failed: the local dependency check did not complete.";
  }
  if (details) {
    details.textContent = error instanceof Error ? error.message : String(error);
  }
});
