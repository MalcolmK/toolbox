import type { SqlValue } from "sql.js";
import type { ValidatedUserData } from "./validateUserData";

export type UserDataRow = Readonly<Record<string, SqlValue>>;

export interface UserDataColumn {
  readonly name: string;
  readonly declaredType: string;
  readonly notNull: boolean;
  readonly defaultValue: SqlValue;
  /** One-based position in a composite primary key; zero means not a key. */
  readonly primaryKeyOrder: number;
}

export interface UserDataForeignKey {
  readonly id: number;
  readonly sequence: number;
  readonly referencedTable: string;
  readonly fromColumn: string;
  readonly toColumn: string | null;
  readonly onUpdate: string;
  readonly onDelete: string;
  readonly match: string;
}

export interface UserDataTable {
  readonly name: string;
  readonly columns: readonly UserDataColumn[];
  readonly primaryKey: readonly string[];
  readonly foreignKeys: readonly UserDataForeignKey[];
  readonly ordering: "primary-key" | "rowid";
  readonly rows: readonly UserDataRow[];
  readonly rowCount: number;
}

export interface UserDataSchemaObject {
  readonly type: "index" | "trigger" | "view";
  readonly name: string;
  readonly tableName: string | null;
  readonly sql: string;
}

export interface UserDataSnapshot {
  readonly sourceFileName: string;
  readonly databaseName: string;
  readonly schemaVersion: number;
  readonly modificationTimes: {
    /** Original manifest text; normalization and ordering belong to Step 8. */
    readonly archiveCreatedAt: unknown;
    readonly manifestDatabaseLastModified: unknown;
    /** Set only when LastModified has exactly one text value. */
    readonly databaseLastModified: string | null;
    /** Retained even when malformed or unexpectedly duplicated. */
    readonly databaseLastModifiedValues: readonly SqlValue[];
  };
  readonly recordCounts: Readonly<Record<string, number>>;
  /** All user tables are included, including tables this app does not know. */
  readonly tables: Readonly<Record<string, UserDataTable>>;
  /** Explicit schema objects are retained for later diff/report/output work. */
  readonly schemaObjects: readonly UserDataSchemaObject[];
}

export class UserDataReadError extends Error {
  constructor(
    readonly tableName: string | null,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "UserDataReadError";
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function copyValue(value: SqlValue): SqlValue {
  return value instanceof Uint8Array ? new Uint8Array(value) : value;
}

function readTable(database: ValidatedUserData["database"], name: string): UserDataTable {
  const quotedName = quoteIdentifier(name);
  const columnsResult = database.exec(`PRAGMA table_info(${quotedName})`)[0];
  if (!columnsResult) {
    throw new UserDataReadError(name, `De tabel ${name} kon niet worden beschreven.`);
  }

  const columns: UserDataColumn[] = columnsResult.values.map((row) => ({
    name: String(row[1]),
    declaredType: String(row[2] ?? ""),
    notNull: Number(row[3]) === 1,
    defaultValue: row[4] ?? null,
    primaryKeyOrder: Number(row[5] ?? 0),
  }));
  const primaryKeyColumns = columns
    .filter((column) => column.primaryKeyOrder > 0)
    .sort((left, right) => left.primaryKeyOrder - right.primaryKeyOrder)
    .map((column) => column.name);
  const ordering = primaryKeyColumns.length > 0 ? "primary-key" : "rowid";
  const orderBy = primaryKeyColumns.length > 0
    ? primaryKeyColumns.map(quoteIdentifier).join(", ")
    : "rowid";

  const foreignKeysResult = database.exec(`PRAGMA foreign_key_list(${quotedName})`)[0];
  const foreignKeys: UserDataForeignKey[] = (foreignKeysResult?.values ?? []).map((row) => ({
    id: Number(row[0]),
    sequence: Number(row[1]),
    referencedTable: String(row[2]),
    fromColumn: String(row[3]),
    toColumn: row[4] === null ? null : String(row[4]),
    onUpdate: String(row[5]),
    onDelete: String(row[6]),
    match: String(row[7]),
  }));

  try {
    const result = database.exec(
      `SELECT * FROM ${quotedName} ORDER BY ${orderBy}`,
    )[0];
    const resultColumns = result?.columns ?? columns.map((column) => column.name);
    const rows = (result?.values ?? []).map((values) => {
      const row: Record<string, SqlValue> = {};
      resultColumns.forEach((column, index) => {
        row[column] = copyValue(values[index] ?? null);
      });
      return row;
    });

    return {
      name,
      columns,
      primaryKey: primaryKeyColumns,
      foreignKeys,
      ordering,
      rows,
      rowCount: rows.length,
    };
  } catch (cause) {
    throw new UserDataReadError(
      name,
      `De rijen van tabel ${name} konden niet volledig worden uitgelezen.`,
      { cause },
    );
  }
}

/**
 * Copies every validated database table into a stable, typed snapshot. The
 * validated sql.js database remains owned by the caller and is never changed.
 */
export function readUserData(source: ValidatedUserData): UserDataSnapshot {
  try {
    const tables: Record<string, UserDataTable> = {};
    for (const name of source.tables) {
      tables[name] = readTable(source.database, name);
    }

    const schemaObjectsResult = source.database.exec(
      `SELECT type, name, tbl_name, sql
       FROM sqlite_master
       WHERE type IN ('index', 'trigger', 'view') AND sql IS NOT NULL
       ORDER BY type, name`,
    )[0];
    const schemaObjects: UserDataSchemaObject[] = (schemaObjectsResult?.values ?? []).map((row) => ({
      type: row[0] as UserDataSchemaObject["type"],
      name: String(row[1]),
      tableName: row[2] === null ? null : String(row[2]),
      sql: String(row[3]),
    }));
    const recordCounts = Object.fromEntries(
      Object.values(tables).map((table) => [table.name, table.rowCount]),
    );
    const databaseLastModifiedValues = tables.LastModified?.rows
      .map((row) => row.LastModified ?? null) ?? [];
    const databaseLastModified = databaseLastModifiedValues.length === 1
      && typeof databaseLastModifiedValues[0] === "string"
      ? databaseLastModifiedValues[0]
      : null;

    return {
      sourceFileName: source.sourceFileName,
      databaseName: source.databaseName,
      schemaVersion: source.schemaVersion,
      modificationTimes: {
        archiveCreatedAt: source.archiveCreatedAt,
        manifestDatabaseLastModified: source.manifestDatabaseLastModified,
        databaseLastModified,
        databaseLastModifiedValues,
      },
      recordCounts,
      tables,
      schemaObjects,
    };
  } catch (cause) {
    if (cause instanceof UserDataReadError) throw cause;
    throw new UserDataReadError(
      null,
      "De gevalideerde database kon niet volledig worden uitgelezen.",
      { cause },
    );
  }
}
