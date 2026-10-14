import JSZip from "jszip";

export type JwLibraryReadErrorCode =
  | "empty-file"
  | "file-read-failed"
  | "invalid-zip"
  | "missing-manifest"
  | "unreadable-manifest"
  | "invalid-manifest-json"
  | "invalid-manifest"
  | "missing-database"
  | "unreadable-database";

export class JwLibraryReadError extends Error {
  constructor(
    readonly code: JwLibraryReadErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "JwLibraryReadError";
  }
}

export interface JwLibraryManifest {
  readonly [key: string]: unknown;
  readonly userDataBackup: {
    readonly [key: string]: unknown;
    readonly databaseName: string;
  };
}

export interface LoadedJwLibrary {
  /** Original filename, retained for a later download name or report. */
  readonly sourceFileName: string;
  /** Parsed manifest; unrecognized fields are retained as-is. */
  readonly manifest: JwLibraryManifest;
  /** Original manifest text, so formatting and unknown fields can be preserved. */
  readonly manifestText: string;
  readonly databaseName: string;
  /** Database entry bytes; not merge-ready until validateUserData accepts them. */
  readonly databaseBytes: Uint8Array;
  /** Loaded outer ZIP, including media and any entries unknown to this version. */
  readonly archive: JSZip;
  /** Names of all non-directory entries in the source archive. */
  readonly entryNames: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseManifest(text: string): JwLibraryManifest {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text) as unknown;
  } catch (cause) {
    throw new JwLibraryReadError(
      "invalid-manifest-json",
      "Het archief bevat een manifest.json dat geen geldige JSON is.",
      { cause },
    );
  }

  if (!isRecord(parsed) || !isRecord(parsed.userDataBackup)) {
    throw new JwLibraryReadError(
      "invalid-manifest",
      "Het manifest mist de verwachte sectie userDataBackup.",
    );
  }

  const databaseName = parsed.userDataBackup.databaseName;
  if (typeof databaseName !== "string" || databaseName.trim().length === 0) {
    throw new JwLibraryReadError(
      "invalid-manifest",
      "Het manifest bevat geen geldige databaseName.",
    );
  }

  return parsed as JwLibraryManifest;
}

/**
 * Reads the outer .jwlibrary ZIP and locates its manifest and database entry.
 * It deliberately does not inspect SQLite structure or schema compatibility.
 */
export async function readJwLibrary(file: File): Promise<LoadedJwLibrary> {
  if (file.size === 0) {
    throw new JwLibraryReadError("empty-file", "Het geselecteerde bestand is leeg.");
  }

  let input: ArrayBuffer;
  try {
    input = await file.arrayBuffer();
  } catch (cause) {
    throw new JwLibraryReadError(
      "file-read-failed",
      "Het geselecteerde bestand kon niet worden gelezen.",
      { cause },
    );
  }

  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(input, { checkCRC32: true });
  } catch (cause) {
    throw new JwLibraryReadError(
      "invalid-zip",
      "Het bestand is geen leesbaar ZIP-archief of bevat beschadigde archiefgegevens.",
      { cause },
    );
  }

  const manifestEntry = archive.file("manifest.json");
  if (!manifestEntry) {
    throw new JwLibraryReadError(
      "missing-manifest",
      "Het archief bevat geen manifest.json in de hoofdmap.",
    );
  }

  let manifestText: string;
  try {
    manifestText = await manifestEntry.async("string");
  } catch (cause) {
    throw new JwLibraryReadError(
      "unreadable-manifest",
      "Het manifest in het archief kon niet worden uitgepakt.",
      { cause },
    );
  }

  const manifest = parseManifest(manifestText);
  const databaseName = manifest.userDataBackup.databaseName;
  const databaseEntry = archive.file(databaseName);

  if (!databaseEntry) {
    throw new JwLibraryReadError(
      "missing-database",
      `De database-entry "${databaseName}" uit het manifest ontbreekt in het archief.`,
    );
  }

  let databaseBytes: Uint8Array;
  try {
    databaseBytes = await databaseEntry.async("uint8array");
  } catch (cause) {
    throw new JwLibraryReadError(
      "unreadable-database",
      `De database-entry "${databaseName}" kon niet worden uitgepakt.`,
      { cause },
    );
  }

  return {
    sourceFileName: file.name,
    manifest,
    manifestText,
    databaseName,
    databaseBytes,
    archive,
    entryNames: Object.values(archive.files)
      .filter((entry) => !entry.dir)
      .map((entry) => entry.name),
  };
}
