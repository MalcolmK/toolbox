import JSZip from "jszip";
import type { BuiltMergedDatabase } from "../database/buildMergedDatabase";
import type { LoadedJwLibrary } from "./readJwLibrary";
import type { ManifestBuildResult, ReadyManifestBuild } from "./buildManifest";

export interface WriteJwLibraryInput {
  readonly database: BuiltMergedDatabase;
  readonly manifest: ManifestBuildResult;
  readonly sourceLibraries: readonly [LoadedJwLibrary, LoadedJwLibrary];
  readonly createdAt?: Date;
}

export type JwLibraryWriteIssueCode =
  | "manifest-not-verified"
  | "invalid-manifest"
  | "invalid-database"
  | "unsafe-entry-name"
  | "required-file-missing"
  | "entry-name-conflict"
  | "required-file-conflict"
  | "archive-write-failed"
  | "archive-verification-failed";

export interface JwLibraryWriteIssue {
  readonly code: JwLibraryWriteIssueCode;
  readonly message: string;
  readonly path?: string;
}

export type JwLibraryWriteResult =
  | {
      readonly status: "blocked";
      readonly issues: readonly JwLibraryWriteIssue[];
      readonly bytes: null;
      readonly fileName: null;
    }
  | {
      readonly status: "ready";
      readonly issues: readonly [];
      readonly bytes: Uint8Array;
      readonly fileName: string;
      readonly entryNames: readonly string[];
    };

function blocked(...issues: JwLibraryWriteIssue[]): JwLibraryWriteResult {
  return { status: "blocked", issues, bytes: null, fileName: null };
}

function safeArchivePath(path: string): boolean {
  if (!path || path !== path.trim() || path.startsWith("/") || path.includes("\\") || /[\u0000-\u001f]/.test(path)) return false;
  const segments = path.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== ".." && !segment.includes(":"));
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index++) if (left[index] !== right[index]) return false;
  return true;
}

function outputFileName(date: Date): string | null {
  if (!Number.isFinite(date.getTime())) return null;
  return `JWLibrary-Merged-${date.toISOString().slice(0, 10)}.jwlibrary`;
}

function isReadyManifest(result: ManifestBuildResult): result is ReadyManifestBuild {
  return result.status === "ready" && result.hashVerified === true;
}

async function readEntry(library: LoadedJwLibrary, path: string): Promise<Uint8Array | null> {
  const entry = library.archive.file(path);
  return entry ? entry.async("uint8array") : null;
}

/**
 * Builds a new .jwlibrary ZIP only from a manifest explicitly marked hash-verified.
 * It preserves source entries, fails on ambiguous path collisions, and reopens
 * the generated ZIP to verify the manifest, database, and referenced files.
 */
export async function writeJwLibrary(input: WriteJwLibraryInput): Promise<JwLibraryWriteResult> {
  if (!isReadyManifest(input.manifest)) {
    return blocked({
      code: "manifest-not-verified",
      message: input.manifest.status === "blocked"
        ? input.manifest.message
        : "Export geblokkeerd: het manifest is niet gemarkeerd als hash-gecontroleerd.",
    });
  }
  if (input.database.integrity !== "ok" || input.database.bytes.byteLength === 0) {
    return blocked({ code: "invalid-database", message: "Export geblokkeerd: er zijn geen gecontroleerde databasebytes beschikbaar." });
  }

  const manifest = input.manifest.manifest;
  const databaseName = manifest.userDataBackup.databaseName;
  let parsedManifest: unknown;
  try {
    parsedManifest = JSON.parse(input.manifest.json) as unknown;
  } catch {
    return blocked({ code: "invalid-manifest", message: "Export geblokkeerd: de manifest-JSON is ongeldig." });
  }
  if (!safeArchivePath(databaseName) || JSON.stringify(parsedManifest) !== JSON.stringify(manifest)) {
    return blocked({ code: "invalid-manifest", message: "Export geblokkeerd: manifestinhoud en databaseverwijzing zijn ongeldig of komen niet overeen." });
  }

  const fileName = outputFileName(input.createdAt ?? new Date());
  if (!fileName) return blocked({ code: "archive-write-failed", message: "Export geblokkeerd: de gekozen datum voor de bestandsnaam is ongeldig." });

  const [sourceA, sourceB] = input.sourceLibraries;
  const sourceByName = { A: sourceA, B: sourceB } as const;
  const databasePaths = new Set([sourceA.databaseName, sourceB.databaseName, databaseName]);
  const reservedPaths = new Set(["manifest.json", ...databasePaths]);
  const contents = new Map<string, Uint8Array>();

  const addUnique = (path: string, bytes: Uint8Array, code: JwLibraryWriteIssueCode): JwLibraryWriteIssue | null => {
    if (!safeArchivePath(path)) return { code: "unsafe-entry-name", message: `Export geblokkeerd: de archiefnaam "${path}" is niet veilig.`, path };
    const existing = contents.get(path);
    if (existing && !equalBytes(existing, bytes)) {
      return { code, message: `Export geblokkeerd: meerdere verschillende bestanden gebruiken de naam "${path}".`, path };
    }
    if (!existing) contents.set(path, new Uint8Array(bytes));
    return null;
  };

  const requiredByPath = new Map<string, "A" | "B">();
  for (const required of input.database.archiveFiles) {
    if (reservedPaths.has(required.path)) {
      return blocked({ code: "invalid-manifest", message: `Export geblokkeerd: vereist bestand "${required.path}" botst met manifest of database.`, path: required.path });
    }
    const previous = requiredByPath.get(required.path);
    if (previous && previous !== required.source) {
      return blocked({ code: "required-file-conflict", message: `Export geblokkeerd: databaseverwijzingen naar "${required.path}" kiezen verschillende bronbestanden.`, path: required.path });
    }
    requiredByPath.set(required.path, required.source);
  }

  for (const [path, source] of requiredByPath) {
    if (!safeArchivePath(path)) return blocked({ code: "unsafe-entry-name", message: `Export geblokkeerd: het vereiste pad "${path}" is niet veilig.`, path });
    const selectedBytes = await readEntry(sourceByName[source], path);
    if (!selectedBytes) return blocked({ code: "required-file-missing", message: `Export geblokkeerd: het door de database vereiste bestand "${path}" ontbreekt in back-up ${source}.`, path });
    const other = sourceByName[source === "A" ? "B" : "A"];
    const otherBytes = await readEntry(other, path);
    if (otherBytes && !equalBytes(selectedBytes, otherBytes)) {
      return blocked({ code: "required-file-conflict", message: `Export geblokkeerd: het vereiste pad "${path}" heeft verschillende inhoud in back-up A en B. De database moet eerst eenduidig naar één mediabestand verwijzen.`, path });
    }
    const issue = addUnique(path, selectedBytes, "required-file-conflict");
    if (issue) return blocked(issue);
  }

  for (const library of [sourceA, sourceB]) {
    for (const entry of Object.values(library.archive.files).filter((candidate) => !candidate.dir)) {
      const originalPath = entry.unsafeOriginalName;
      if (originalPath && originalPath !== entry.name) {
        return blocked({ code: "unsafe-entry-name", message: `Export geblokkeerd: de ZIP-entry "${originalPath}" is door JSZip genormaliseerd naar "${entry.name}".`, path: originalPath });
      }
      const path = entry.name;
      if (path === "manifest.json" || databasePaths.has(path) || requiredByPath.has(path)) continue;
      if (!safeArchivePath(path)) return blocked({ code: "unsafe-entry-name", message: `Export geblokkeerd: de archiefnaam "${path}" is niet veilig.`, path });
      let bytes: Uint8Array;
      try {
        bytes = await entry.async("uint8array");
      } catch {
        return blocked({ code: "required-file-missing", message: `Archiefentry "${path}" kon niet worden gelezen.`, path });
      }
      const issue = addUnique(path, bytes, "entry-name-conflict");
      if (issue) return blocked(issue);
    }
  }

  const archive = new JSZip();
  archive.file("manifest.json", input.manifest.json, { date: new Date("1980-01-01T00:00:00.000Z") });
  archive.file(databaseName, input.database.bytes, { binary: true, date: new Date("1980-01-01T00:00:00.000Z") });
  for (const [path, bytes] of contents) archive.file(path, bytes, { binary: true, date: new Date("1980-01-01T00:00:00.000Z") });

  let bytes: Uint8Array;
  try {
    bytes = await archive.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  } catch {
    return blocked({ code: "archive-write-failed", message: "De nieuwe ZIP-container kon niet worden gemaakt." });
  }

  try {
    const reopened = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const reopenedManifestText = await reopened.file("manifest.json")?.async("string");
    const reopenedDatabase = await reopened.file(databaseName)?.async("uint8array");
    if (reopenedManifestText !== input.manifest.json || !reopenedDatabase || !equalBytes(reopenedDatabase, input.database.bytes)) {
      return blocked({ code: "archive-verification-failed", message: "De gemaakte ZIP bevat niet exact het gecontroleerde manifest en de samengestelde database." });
    }
    for (const path of requiredByPath.keys()) {
      if (!reopened.file(path)) return blocked({ code: "archive-verification-failed", message: `De gemaakte ZIP mist het door de database vereiste bestand "${path}".`, path });
    }
    const entryNames = Object.values(reopened.files).filter((entry) => !entry.dir).map((entry) => entry.name);
    return { status: "ready", issues: [], bytes, fileName, entryNames };
  } catch {
    return blocked({ code: "archive-verification-failed", message: "De gemaakte ZIP kon niet opnieuw worden geopend en gecontroleerd." });
  }
}
