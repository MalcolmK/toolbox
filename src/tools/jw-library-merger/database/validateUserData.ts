import type { Database, SqlJsStatic } from "sql.js";
import { loadSqlite } from "./sqliteRuntime";

/** Schema versions whose structure has been reviewed and included in fixtures. */
export const SUPPORTED_SCHEMA_VERSIONS = [16] as const;
export type SupportedSchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number];

export type DatabaseValidationIssueCode =
  | "invalid-database"
  | "sqlite-runtime-failed"
  | "integrity-check-failed"
  | "foreign-key-check-failed"
  | "unsupported-schema-version"
  | "schema-version-mismatch"
  | "missing-table"
  | "missing-column"
  | "invalid-migration-table";

export interface DatabaseValidationIssue {
  readonly code: DatabaseValidationIssueCode;
  readonly message: string;
  readonly table?: string;
  readonly column?: string;
}

export interface ValidatedUserData {
  readonly sourceFileName: string;
  readonly databaseName: string;
  readonly archiveCreatedAt: unknown;
  readonly manifestDatabaseLastModified: unknown;
  readonly schemaVersion: SupportedSchemaVersion;
  readonly integrity: "ok";
  readonly foreignKeys: "ok";
  readonly tables: readonly string[];
  /** Read-only sql.js connection; callers must close it after use. */
  readonly database: Database;
}

export class UserDataValidationError extends Error {
  constructor(
    readonly issues: readonly DatabaseValidationIssue[],
    options?: ErrorOptions,
  ) {
    super(
      issues.map((issue) => issue.message).join(" "),
      options,
    );
    this.name = "UserDataValidationError";
  }
}

const requiredColumns: Readonly<Record<string, readonly string[]>> = {
  BlockRange: ["BlockRangeId", "BlockType", "Identifier", "StartToken", "EndToken", "UserMarkId"],
  Bookmark: ["BookmarkId", "LocationId", "PublicationLocationId", "Slot", "Title", "Snippet", "BlockType", "BlockIdentifier"],
  IndependentMedia: ["IndependentMediaId", "OriginalFilename", "FilePath", "MimeType", "Hash"],
  InputField: ["LocationId", "TextTag", "Value"],
  LastModified: ["LastModified"],
  Location: ["LocationId", "BookNumber", "ChapterNumber", "DocumentId", "Track", "IssueTagNumber", "KeySymbol", "MepsLanguage", "Type", "Title", "Specialty", "Edition"],
  Note: ["NoteId", "Guid", "UserMarkId", "LocationId", "Title", "Content", "LastModified", "Created", "BlockType", "BlockIdentifier"],
  PlaylistItem: ["PlaylistItemId", "Label", "Accuracy", "EndAction", "ThumbnailFilePath"],
  PlaylistItemAccuracy: ["PlaylistItemAccuracyId", "Description"],
  PlaylistItemIndependentMediaMap: ["PlaylistItemId", "IndependentMediaId", "DurationTicks"],
  PlaylistItemLocationMap: ["PlaylistItemId", "LocationId", "MajorMultimediaType", "BaseDurationTicks"],
  PlaylistItemMarker: ["PlaylistItemMarkerId", "PlaylistItemId", "StartTimeTicks", "DurationTicks", "EndTransitionDurationTicks", "Label"],
  PlaylistItemMarkerBibleVerseMap: ["PlaylistItemMarkerId", "VerseId"],
  PlaylistItemMarkerParagraphMap: ["PlaylistItemMarkerId", "MepsDocumentId", "ParagraphIndex", "MarkerIndexWithinParagraph"],
  Tag: ["TagId", "Type", "Name"],
  TagMap: ["TagId", "NoteId", "LocationId", "PlaylistItemId", "Position"],
  UserMark: ["UserMarkId", "ColorIndex", "LocationId", "StyleIndex", "UserMarkGuid", "Version"],
  grdb_migrations: ["identifier"],
};

function queryStrings(database: Database, sql: string): string[] {
  const result = database.exec(sql)[0];
  return result?.values.map((row) => String(row[0])) ?? [];
}

function readManifestSchemaVersion(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

/**
 * Opens an archive database and validates it without executing writes or
 * exporting it again. The returned sql.js database belongs to the caller.
 */
export async function validateUserData(
  source: {
    readonly sourceFileName: string;
    readonly databaseName: string;
    readonly databaseBytes: Uint8Array;
    readonly manifest: {
      readonly creationDate?: unknown;
      readonly userDataBackup: {
        readonly schemaVersion?: unknown;
        readonly lastModifiedDate?: unknown;
      };
    };
  },
  sqliteLoader: () => Promise<SqlJsStatic> = loadSqlite,
): Promise<ValidatedUserData> {
  const issues: DatabaseValidationIssue[] = [];
  let database: Database | undefined;
  let SQL: SqlJsStatic;

  try {
    SQL = await sqliteLoader();
  } catch (cause) {
    throw new UserDataValidationError(
      [{ code: "sqlite-runtime-failed", message: "De lokale SQLite-runtime kon niet worden gestart." }],
      { cause },
    );
  }

  try {
    database = new SQL.Database(source.databaseBytes);
    // sql.js may defer parsing malformed bytes until the first SQLite query.
    database.exec("PRAGMA schema_version");
  } catch (cause) {
    database?.close();
    throw new UserDataValidationError(
      [{ code: "invalid-database", message: "De database-entry kon niet als SQLite-database worden geopend." }],
      { cause },
    );
  }

  const tables = queryStrings(
    database,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const tableSet = new Set(tables);

  for (const [table, columns] of Object.entries(requiredColumns)) {
    if (!tableSet.has(table)) {
      issues.push({
        code: "missing-table",
        table,
        message: `De database mist de vereiste tabel ${table}.`,
      });
      continue;
    }

    const info = database.exec(`PRAGMA table_info("${table}")`)[0];
    const names = new Set(info?.values.map((row) => String(row[1])) ?? []);
    for (const column of columns) {
      if (!names.has(column)) {
        issues.push({
          code: "missing-column",
          table,
          column,
          message: `De database mist kolom ${table}.${column}.`,
        });
      }
    }
  }

  if (tableSet.has("grdb_migrations")) {
    const migrationColumns = database.exec('PRAGMA table_info("grdb_migrations")')[0];
    const migrationNames = new Set(
      migrationColumns?.values.map((row) => String(row[1])) ?? [],
    );
    if (!migrationNames.has("identifier")) {
      issues.push({
        code: "invalid-migration-table",
        table: "grdb_migrations",
        column: "identifier",
        message: "De migratietabel heeft geen identifier-kolom.",
      });
    }
  }

  let integrityResults: string[] = [];
  try {
    integrityResults = queryStrings(database, "PRAGMA integrity_check");
  } catch (cause) {
    issues.push({
      code: "integrity-check-failed",
      message: "De SQLite-integriteitscontrole kon niet worden uitgevoerd.",
    });
    void cause;
  }
  if (integrityResults.length !== 1 || integrityResults[0] !== "ok") {
    issues.push({
      code: "integrity-check-failed",
      message: `De SQLite-integriteitscontrole is niet geslaagd: ${integrityResults.join("; ") || "geen resultaat"}.`,
    });
  }

  try {
    const foreignKeyRows = database.exec("PRAGMA foreign_key_check")[0];
    if (foreignKeyRows && foreignKeyRows.values.length > 0) {
      issues.push({
        code: "foreign-key-check-failed",
        message: `De database bevat ${foreignKeyRows.values.length} schending(en) van foreign keys.`,
      });
    }
  } catch (cause) {
    issues.push({
      code: "foreign-key-check-failed",
      message: "De foreign-key-controle kon niet worden uitgevoerd.",
    });
    void cause;
  }

  const manifestSchemaVersion = readManifestSchemaVersion(
    source.manifest.userDataBackup.schemaVersion,
  );
  if (manifestSchemaVersion === null) {
    issues.push({
      code: "unsupported-schema-version",
      message: "Het manifest bevat geen geldige schemaVersion.",
    });
  } else if (!SUPPORTED_SCHEMA_VERSIONS.includes(manifestSchemaVersion as SupportedSchemaVersion)) {
    issues.push({
      code: "unsupported-schema-version",
      message: `Schema versie ${manifestSchemaVersion} wordt niet ondersteund. Alleen schema versie ${SUPPORTED_SCHEMA_VERSIONS.join(", ")} is gecontroleerd.`,
    });
  }

  const hasRequiredSchema = !issues.some(
    (issue) => issue.code === "missing-table" || issue.code === "missing-column" || issue.code === "invalid-migration-table",
  );
  if (manifestSchemaVersion !== null && !hasRequiredSchema) {
    issues.push({
      code: "schema-version-mismatch",
      message: `De database-structuur komt niet overeen met de gecontroleerde structuur voor schema versie ${manifestSchemaVersion}.`,
    });
  }

  if (issues.length > 0) {
    database.close();
    throw new UserDataValidationError(issues);
  }

  database.run("PRAGMA query_only = ON");

  return {
    sourceFileName: source.sourceFileName,
    databaseName: source.databaseName,
    archiveCreatedAt: source.manifest.creationDate ?? null,
    manifestDatabaseLastModified: source.manifest.userDataBackup.lastModifiedDate ?? null,
    schemaVersion: manifestSchemaVersion as SupportedSchemaVersion,
    integrity: "ok",
    foreignKeys: "ok",
    tables,
    database,
  };
}
