import type { SqlJsStatic, SqlValue } from "sql.js";
import { identifyRecord } from "../compare/recordIdentity";
import type { UserDataRow, UserDataSnapshot } from "./readUserData";
import type { ValidatedUserData } from "./validateUserData";
import type { SimpleMergeResult } from "../merge/simpleMerge";
import { loadSqlite } from "./sqliteRuntime";

export type MergeDatabaseSource = "A" | "B";
export interface OutputIdMapping {
  readonly source: MergeDatabaseSource;
  readonly tableName: string;
  readonly sourceLocalKey: string;
  readonly outputKey: string;
}
export interface MergeBuildIssue {
  readonly code: "unresolved-plan" | "unknown-table" | "schema-mismatch" | "unknown-schema-object" | "identity-collision" | "unmapped-reference" | "integrity-failed" | "sqlite-write-failed";
  readonly message: string;
  readonly tableName?: string;
  readonly rowKey?: string;
}
export interface BuiltMergedDatabase {
  readonly bytes: Uint8Array;
  readonly outputIds: readonly OutputIdMapping[];
  readonly tableCounts: Readonly<Record<string, number>>;
  /** Media payloads required by merged IndependentMedia rows, with selected source provenance. */
  readonly archiveFiles: readonly { readonly path: string; readonly source: MergeDatabaseSource }[];
  readonly integrity: "ok";
}
export class MergeDatabaseBuildError extends Error {
  constructor(readonly issues: readonly MergeBuildIssue[], options?: ErrorOptions) {
    super(issues.map((issue) => issue.message).join(" "), options);
    this.name = "MergeDatabaseBuildError";
  }
}

type RowChoice = { readonly source: MergeDatabaseSource; readonly row: UserDataRow; readonly identity: string | null };
type Tables = UserDataSnapshot["tables"];

function quote(name: string): string { return `"${name.replaceAll('"', '""')}"`; }
function valueKey(value: SqlValue): string {
  return value instanceof Uint8Array ? `blob:${Array.from(value).join(",")}` : `${typeof value}:${String(value)}`;
}
function sourceKey(snapshot: UserDataSnapshot, table: string, row: UserDataRow): string | null {
  if (table === "LastModified" && snapshot.tables.LastModified?.rowCount === 1) return '["LastModified","singleton"]';
  return identifyRecord(snapshot, table, row).localKey;
}
function schemaSignature(snapshot: UserDataSnapshot): string {
  return JSON.stringify({
    tables: Object.values(snapshot.tables).map((table) => ({
      name: table.name,
      columns: table.columns,
      primaryKey: table.primaryKey,
      foreignKeys: table.foreignKeys,
    })).sort((a, b) => a.name.localeCompare(b.name)),
    objects: snapshot.schemaObjects.map(({ type, name, tableName, sql }) => ({ type, name, tableName, sql }))
      .sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`)),
  });
}
function copyValue(value: SqlValue): SqlValue { return value instanceof Uint8Array ? new Uint8Array(value) : value; }

function fail(issues: MergeBuildIssue[]): never { throw new MergeDatabaseBuildError(issues); }

function plannedRows(
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
  plan: SimpleMergeResult,
): Map<string, RowChoice[]> {
  if (plan.status !== "ready" || plan.report.unresolved.length > 0) {
    fail([{ code: "unresolved-plan", message: "Het mergeplan bevat nog onopgeloste records; er wordt geen database gebouwd." }]);
  }
  const result = new Map<string, RowChoice[]>();
  for (const record of plan.records) {
    if (record.action !== "keep-one" || !record.selected) {
      fail([{ code: "unresolved-plan", message: `De keuze voor ${record.tableName} is niet uitvoerklaar.`, tableName: record.tableName }]);
    }
    const rows = result.get(record.tableName) ?? [];
    rows.push({ source: record.selected.source, row: record.selected.row, identity: record.identityKey });
    result.set(record.tableName, rows);
  }
  for (const tableName of new Set([...Object.keys(snapshotA.tables), ...Object.keys(snapshotB.tables)])) {
    if (!result.has(tableName)) result.set(tableName, []);
  }
  for (const [source, snapshot] of [["A", snapshotA], ["B", snapshotB]] as const) {
    for (const [tableName, table] of Object.entries(snapshot.tables)) {
      for (const row of table.rows) {
        const local = sourceKey(snapshot, tableName, row);
        const identity = identifyRecord(snapshot, tableName, row).key;
        const covered = (result.get(tableName) ?? []).some((choice) => {
          if (choice.source === source && sourceKey(snapshot, tableName, choice.row) === local) return true;
          const chosenSnapshot = choice.source === "A" ? snapshotA : snapshotB;
          return identity !== null && choice.identity === identity
            && identifyRecord(chosenSnapshot, tableName, choice.row).key === identity;
        });
        if (!covered) fail([{ code: "unknown-table", message: `Rij in ${tableName} uit bron ${source} ontbreekt in het mergeplan; de rij wordt niet stilzwijgend weggelaten.`, tableName }]);
      }
    }
  }
  return result;
}

function tableOrder(tables: Tables): string[] {
  const remaining = new Set(Object.keys(tables));
  const done = new Set<string>();
  const order: string[] = [];
  while (remaining.size) {
    const ready = [...remaining].filter((name) => (tables[name]?.foreignKeys ?? [])
      .every((key) => key.referencedTable === name || done.has(key.referencedTable) || !remaining.has(key.referencedTable)));
    if (!ready.length) {
      // Cyclic FK graphs are inserted in a deferred transaction after all IDs were mapped.
      order.push(...remaining);
      break;
    }
    for (const name of ready.sort()) { remaining.delete(name); done.add(name); order.push(name); }
  }
  return order;
}

function rowByLocalId(snapshot: UserDataSnapshot, table: string, column: string, value: SqlValue): UserDataRow | undefined {
  return snapshot.tables[table]?.rows.find((row) => row[column] === value);
}

function resolveOutputId(
  source: MergeDatabaseSource,
  snapshot: UserDataSnapshot,
  tableName: string,
  row: UserDataRow,
  column: string,
  maps: Map<string, Map<string, SqlValue>>,
): SqlValue | undefined {
  const targetRow = rowByLocalId(snapshot, tableName, column, row[column]!);
  if (!targetRow) return undefined;
  const key = sourceKey(snapshot, tableName, targetRow);
  if (!key) return undefined;
  const output = maps.get(tableName)?.get(`${source}\u0000${key}`);
  if (!output) return undefined;
  return output;
}

function remapRow(
  source: MergeDatabaseSource,
  snapshot: UserDataSnapshot,
  tableName: string,
  row: UserDataRow,
  table: UserDataSnapshot["tables"][string],
  rowsByTable: Map<string, RowChoice[]>,
  maps: Map<string, Map<string, SqlValue>>,
): UserDataRow {
  const mapped: Record<string, SqlValue> = {};
  for (const column of table.columns) mapped[column.name] = copyValue(row[column.name] ?? null);
  for (const key of table.foreignKeys) {
    const value = row[key.fromColumn];
    if (value === null || value === undefined) continue;
    const targetTable = snapshot.tables[key.referencedTable];
    const targetPrimaryKey = targetTable?.primaryKey.length === 1 ? targetTable.primaryKey[0] : null;
    if (key.toColumn && key.toColumn !== targetPrimaryKey) {
      if (key.referencedTable !== "IndependentMedia" || key.toColumn !== "FilePath") {
        throw new MergeDatabaseBuildError([{ code: "unmapped-reference", message: `${tableName}.${key.fromColumn} verwijst via de niet-primaire kolom ${key.referencedTable}.${key.toColumn}; deze relatie heeft geen gecontroleerde omzetregel.`, tableName }]);
      }
      const media = targetTable?.rows.find((candidate) => candidate.FilePath === value);
      if (!media) throw new MergeDatabaseBuildError([{ code: "unmapped-reference", message: `${tableName}.${key.fromColumn} kon de gekoppelde mediabron niet terugvinden.`, tableName }]);
      const mediaIdentity = identifyRecord(snapshot, "IndependentMedia", media).key;
      const mediaLocalKey = sourceKey(snapshot, "IndependentMedia", media);
      const selected = rowsByTable.get("IndependentMedia")?.find((candidate) => {
        return (candidate.source === source && sourceKey(snapshot, "IndependentMedia", candidate.row) === mediaLocalKey)
          || (mediaIdentity !== null && candidate.identity === mediaIdentity);
      });
      if (!selected) throw new MergeDatabaseBuildError([{ code: "unmapped-reference", message: `${tableName}.${key.fromColumn} verwijst naar media die niet in de uitvoer is opgenomen.`, tableName }]);
      mapped[key.fromColumn] = selected.row.FilePath ?? null;
      continue;
    }
    const reference = resolveOutputId(source, snapshot, key.referencedTable, { [key.toColumn ?? snapshot.tables[key.referencedTable]?.primaryKey[0] ?? ""]: value }, key.toColumn ?? snapshot.tables[key.referencedTable]?.primaryKey[0] ?? "", maps);
    if (reference === undefined) throw new MergeDatabaseBuildError([{ code: "unmapped-reference", message: `${tableName}.${key.fromColumn} kon niet veilig naar ${key.referencedTable} worden omgekoppeld.`, tableName }]);
    mapped[key.fromColumn] = reference;
  }
  return mapped;
}

/**
 * Rebuilds a SQLite database from a reviewed plan while retaining the chosen
 * source schema. Unknown schema objects/tables and unresolved identities fail closed.
 */
export async function buildMergedDatabase(
  sourceA: ValidatedUserData,
  snapshotA: UserDataSnapshot,
  sourceB: ValidatedUserData,
  snapshotB: UserDataSnapshot,
  plan: SimpleMergeResult,
  sqliteLoader: () => Promise<SqlJsStatic> = loadSqlite,
): Promise<BuiltMergedDatabase> {
  const issues: MergeBuildIssue[] = [];
  if (sourceA.schemaVersion !== sourceB.schemaVersion || snapshotA.schemaVersion !== snapshotB.schemaVersion) {
    fail([{ code: "schema-mismatch", message: "De bronbestanden gebruiken niet dezelfde gevalideerde databasestructuur." }]);
  }
  if (schemaSignature(snapshotA) !== schemaSignature(snapshotB)) {
    fail([{ code: "schema-mismatch", message: "De tabellen, foreign keys of expliciete schema-objecten verschillen; samenvoegen wordt geblokkeerd om structuurverlies te voorkomen." }]);
  }
  const rowsByTable = plannedRows(snapshotA, snapshotB, plan);
  const knownTables = new Set(rowsByTable.keys());
  for (const table of Object.keys(snapshotA.tables)) if (!knownTables.has(table)) issues.push({ code: "unknown-table", tableName: table, message: `Onbekende tabel ${table} is niet veilig samengevoegd.` });
  if (issues.length) fail(issues);

  const ids = new Map<string, SqlValue>();
  const outputIds: OutputIdMapping[] = [];
  for (const [tableName, choices] of rowsByTable) {
    const targetTable = snapshotA.tables[tableName]!;
    const pk = targetTable.primaryKey.length === 1 ? targetTable.primaryKey[0]! : null;
    const isIntegerId = pk !== null && choices.every(({ row }) => typeof row[pk] === "number");
    const seen = new Set<string>();
    let nextId = 1;
    for (const choice of choices) {
      const snapshot = choice.source === "A" ? snapshotA : snapshotB;
      const local = sourceKey(snapshot, tableName, choice.row);
      if (!local) { issues.push({ code: "identity-collision", tableName, message: `${tableName} heeft een uitvoerrij zonder primaire sleutel.` }); continue; }
      let id: SqlValue;
      if (isIntegerId) { while (seen.has(String(nextId))) nextId++; id = nextId++; }
      else if (pk) id = choice.row[pk] ?? null;
      else if (targetTable.primaryKey.length > 1) id = JSON.stringify(targetTable.primaryKey.map((column) => choice.row[column]));
      else id = null;
      if (targetTable.primaryKey.length > 0 && id === null) { issues.push({ code: "identity-collision", tableName, message: `Primaire sleutel voor ${tableName} ontbreekt.` }); continue; }
      const token = `${tableName}\u0000${choice.source}\u0000${local}`;
      ids.set(token, id);
      outputIds.push({ source: choice.source, tableName, sourceLocalKey: local, outputKey: valueKey(id) });
    }
  }
  if (issues.length) fail(issues);
  const mapLookup = new Map<string, Map<string, SqlValue>>();
  for (const [tableName, choices] of rowsByTable) {
    const lookup = new Map<string, SqlValue>();
    for (const choice of choices) {
      const snapshot = choice.source === "A" ? snapshotA : snapshotB;
      const local = sourceKey(snapshot, tableName, choice.row)!;
      const outputId = ids.get(`${tableName}\u0000${choice.source}\u0000${local}`)!;
      const aliases = choice.identity === null ? [{ source: choice.source, snapshot, row: choice.row, local }] :
        ([ ["A", snapshotA], ["B", snapshotB] ] as const).flatMap(([source, candidateSnapshot]) =>
          (candidateSnapshot.tables[tableName]?.rows ?? [])
            .filter((row) => identifyRecord(candidateSnapshot, tableName, row).key === choice.identity)
            .map((row) => ({ source, snapshot: candidateSnapshot, row, local: sourceKey(candidateSnapshot, tableName, row)! })));
      for (const source of ["A", "B"] as const) {
        const candidateSnapshot = source === "A" ? snapshotA : snapshotB;
        const matches = choice.identity === null ? [] : (candidateSnapshot.tables[tableName]?.rows ?? [])
          .filter((row) => identifyRecord(candidateSnapshot, tableName, row).key === choice.identity);
        if (matches.length > 1) issues.push({ code: "identity-collision", tableName, message: `De identiteit van ${tableName} komt meerdere keren voor in bron ${source}; relaties zijn niet eenduidig om te koppelen.` });
      }
      for (const alias of aliases) {
        const aliasKey = `${alias.source}\u0000${alias.local}`;
        const existing = lookup.get(aliasKey);
        if (existing !== undefined && existing !== outputId) {
          issues.push({ code: "identity-collision", tableName, rowKey: alias.local, message: `Bronrijen met dezelfde logische identiteit in ${tableName} zouden naar verschillende output-ID's wijzen.` });
          continue;
        }
        lookup.set(aliasKey, outputId);
        if (!outputIds.some((entry) => entry.source === alias.source && entry.tableName === tableName && entry.sourceLocalKey === alias.local)) {
          outputIds.push({ source: alias.source, tableName, sourceLocalKey: alias.local, outputKey: valueKey(outputId) });
        }
      }
    }
    mapLookup.set(tableName, lookup);
  }
  if (issues.length) fail(issues);
  const SQL = await sqliteLoader();
  const database = new SQL.Database(sourceA.database.export());
  try {
    database.run("PRAGMA foreign_keys = ON");
    database.run("PRAGMA defer_foreign_keys = ON");
    database.run("BEGIN IMMEDIATE");
    for (const tableName of tableOrder(snapshotA.tables)) {
      const quotedTable = quote(tableName);
      // Delete child-first data under the existing triggers; restore LastModified after data writes.
      if (tableName !== "LastModified") database.run(`DELETE FROM ${quotedTable}`);
    }
    // Trigger guards prohibit delete/insert of LastModified. Restore its singleton through UPDATE.
    const lastModifiedChoices = rowsByTable.get("LastModified") ?? [];
    for (const tableName of tableOrder(snapshotA.tables)) {
      if (tableName === "LastModified") continue;
      const table = snapshotA.tables[tableName]!;
      const columns = table.columns.map((column) => column.name);
      for (const choice of rowsByTable.get(tableName) ?? []) {
        const snapshot = choice.source === "A" ? snapshotA : snapshotB;
        const row = { ...choice.row } as Record<string, SqlValue>;
        const pk = table.primaryKey.length === 1 ? table.primaryKey[0]! : null;
        if (pk) row[pk] = ids.get(`${tableName}\u0000${choice.source}\u0000${sourceKey(snapshot, tableName, choice.row)!}`)!;
        const remapped = remapRow(choice.source, snapshot, tableName, row, table, rowsByTable, mapLookup);
        const placeholders = columns.map(() => "?").join(", ");
        database.run(`INSERT INTO ${quote(tableName)} (${columns.map(quote).join(", ")}) VALUES (${placeholders})`, columns.map((column) => remapped[column] ?? null));
      }
    }
    if (lastModifiedChoices.length === 0) throw new MergeDatabaseBuildError([{ code: "unresolved-plan", tableName: "LastModified", message: "De verplichte tabel LastModified heeft geen uitvoerrij." }]);
    const modifiedTime = lastModifiedChoices[0]?.row.LastModified;
    if (typeof modifiedTime !== "string") throw new MergeDatabaseBuildError([{ code: "unresolved-plan", tableName: "LastModified", message: "De gekozen uitvoerrij heeft geen bruikbare databasetijd." }]);
    database.run("UPDATE LastModified SET LastModified = ?", [modifiedTime]);
    const fk = database.exec("PRAGMA foreign_key_check")[0];
    if (fk && fk.values.length) throw new MergeDatabaseBuildError([{ code: "integrity-failed", message: `De opgebouwde database bevat ${fk.values.length} foreign-key-fout(en).` }]);
    const integrity = database.exec("PRAGMA integrity_check")[0]?.values;
    if (!integrity || integrity.length !== 1 || integrity[0]?.[0] !== "ok") throw new MergeDatabaseBuildError([{ code: "integrity-failed", message: "SQLite-integriteitscontrole is niet geslaagd." }]);
    database.run("COMMIT");
    const counts = Object.fromEntries(Object.keys(snapshotA.tables).map((tableName) => [tableName, rowsByTable.get(tableName)?.length ?? 0]));
    const archiveFiles = (rowsByTable.get("IndependentMedia") ?? []).flatMap((choice) =>
      typeof choice.row.FilePath === "string" && choice.row.FilePath.length > 0
        ? [{ path: choice.row.FilePath, source: choice.source }]
        : []);
    return { bytes: database.export(), outputIds, tableCounts: counts, archiveFiles, integrity: "ok" };
  } catch (cause) {
    try { database.run("ROLLBACK"); } catch { /* transaction may already have ended */ }
    if (cause instanceof MergeDatabaseBuildError) throw cause;
    throw new MergeDatabaseBuildError([{ code: "sqlite-write-failed", message: "SQLite kon het mergeplan niet toepassen; er zijn geen outputbytes vrijgegeven." }], { cause });
  } finally {
    database.close();
  }
}
