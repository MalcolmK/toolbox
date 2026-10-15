import type { SqlJsStatic, SqlValue } from "sql.js";
import { identifyRecord } from "../compare/recordIdentity";
import type { UserDataRow, UserDataSnapshot } from "./readUserData";
import type { ValidatedUserData } from "./validateUserData";
import type { SimpleMergeResult } from "../merge/simpleMerge";
import { loadSqlite } from "./sqliteRuntime";
import { isLocationResolutionContextCurrent, type LocationResolutionContext } from "../merge/locationResolution";
import { isPlaylistResolutionContextCurrent, type PlaylistResolutionContext } from "../merge/playlistResolution";

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

type SourceAlias = { readonly source: MergeDatabaseSource; readonly localKey: string };
type RowChoice = { readonly source: MergeDatabaseSource; readonly row: UserDataRow; readonly identity: string | null; readonly fieldSources?: Readonly<Record<string, MergeDatabaseSource>>; readonly aliases: readonly SourceAlias[] };
type Tables = UserDataSnapshot["tables"];

function quote(name: string): string { return `"${name.replaceAll('"', '""')}"`; }
function valueKey(value: SqlValue): string {
  return value instanceof Uint8Array ? `blob:${Array.from(value).join(",")}` : `${typeof value}:${String(value)}`;
}
function sourceKey(snapshot: UserDataSnapshot, table: string, row: UserDataRow): string | null {
  if (table === "LastModified" && snapshot.tables.LastModified?.rowCount === 1) return '["LastModified","singleton"]';
  const identityKey = identifyRecord(snapshot, table, row).localKey;
  if (identityKey) return identityKey;
  const primaryKey = snapshot.tables[table]?.primaryKey ?? [];
  if (primaryKey.length === 0) return null;
  const values = primaryKey.map((column) => row[column]);
  if (values.some((value) => value === null || value === undefined)) return null;
  return JSON.stringify([table, "source-local", ...values]);
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
  locationResolution?: LocationResolutionContext,
  playlistResolution?: PlaylistResolutionContext,
): Map<string, RowChoice[]> {
  if (plan.status !== "ready" || plan.report.unresolved.length > 0) {
    fail([{ code: "unresolved-plan", message: "Het mergeplan bevat nog onopgeloste records; er wordt geen database gebouwd." }]);
  }
  const result = new Map<string, RowChoice[]>();
  const sourceSnapshots = { A: snapshotA, B: snapshotB } as const;
  const sourceAliases = new Map<string, string>();
  const omittedAliases = new Set<string>();
  const aliasToken = (table: string, source: MergeDatabaseSource, local: string) => `${table}\u0000${source}\u0000${local}`;
  const presentSourceRows = new Set<string>();
  for (const [source, snapshot] of [["A", snapshotA], ["B", snapshotB]] as const) {
    for (const [tableName, table] of Object.entries(snapshot.tables)) for (const row of table.rows) {
      const local = sourceKey(snapshot, tableName, row);
      if (local) presentSourceRows.add(aliasToken(tableName, source, local));
    }
  }
  for (const record of plan.records) {
    if (record.action === "omit" && !record.selected) {
      for (const candidate of record.retainedAlternatives) {
        const key = sourceKey(sourceSnapshots[candidate.source], record.tableName, candidate.row);
        if (key) omittedAliases.add(aliasToken(record.tableName, candidate.source, key));
      }
      continue;
    }
    if (record.action !== "keep-one" || !record.selected) {
      fail([{ code: "unresolved-plan", message: `De keuze voor ${record.tableName} is niet uitvoerklaar.`, tableName: record.tableName }]);
    }
    const rows = result.get(record.tableName) ?? [];
    const selected = record.selected;
    const aliases: SourceAlias[] = [];
    const selectedKey = sourceKey(sourceSnapshots[selected.source], record.tableName, selected.row);
    if (selectedKey) aliases.push({ source: selected.source, localKey: selectedKey });
    // Alternatives carried by the reviewed plan are explicit source aliases. Do not
    // recalculate a potentially ambiguous logical identity during database build.
    for (const candidate of record.sourceAliases ?? []) {
      const localKey = sourceKey(sourceSnapshots[candidate.source], record.tableName, candidate.row);
      if (localKey && !aliases.some((alias) => alias.source === candidate.source && alias.localKey === localKey)) {
        aliases.push({ source: candidate.source, localKey });
      }
    }
    rows.push({ source: selected.source, row: selected.row, identity: record.identityKey, fieldSources: selected.fieldSources, aliases });
    result.set(record.tableName, rows);
  }
  const choicesByIdentity = new Map<string, Map<string, RowChoice>>();
  for (const [tableName, choices] of result) {
    const index = new Map<string, RowChoice>();
    for (const choice of choices) if (choice.identity !== null) {
      if (index.has(choice.identity)) fail([{ code: "identity-collision", tableName, message: `Het mergeplan bevat meer dan één uitvoerrij voor dezelfde identiteit in ${tableName}.` }]);
      index.set(choice.identity, choice);
    }
    choicesByIdentity.set(tableName, index);
  }
  // Session-confirmed cross-backup identities are explicit aliases supplied by
  // their resolution contexts. Dependent aliases come from the reviewed plan above.
  for (const group of locationResolution?.confirmedGroups ?? []) {
    const selected = choicesByIdentity.get("Location")?.get(group.logicalIdentity);
    if (selected) for (const member of group.members) {
      const destination = sourceKey(sourceSnapshots[selected.source], "Location", selected.row);
      if (destination) {
        const token = aliasToken("Location", member.source, member.localKey);
        const target = aliasToken("Location", selected.source, destination);
        const existing = sourceAliases.get(token);
        if (existing && existing !== target) fail([{ code: "identity-collision", tableName: "Location", rowKey: member.localKey, message: "Een bevestigde plaatsalias wijst naar meer dan één uitvoerrij." }]);
        sourceAliases.set(token, target);
        const aliases = selected.aliases as SourceAlias[];
        if (!aliases.some((alias) => alias.source === member.source && alias.localKey === member.localKey)) aliases.push({ source: member.source, localKey: member.localKey });
      }
    }
  }
  for (const group of playlistResolution?.confirmedGroups ?? []) {
    const selected = choicesByIdentity.get("PlaylistItem")?.get(group.logicalIdentity);
    if (selected) for (const member of group.members) {
      const destination = sourceKey(sourceSnapshots[selected.source], "PlaylistItem", selected.row);
      if (destination) {
        const token = aliasToken("PlaylistItem", member.source, member.localKey);
        const target = aliasToken("PlaylistItem", selected.source, destination);
        const existing = sourceAliases.get(token);
        if (existing && existing !== target) fail([{ code: "identity-collision", tableName: "PlaylistItem", rowKey: member.localKey, message: "Een bevestigde afspeellijstalias wijst naar meer dan één uitvoerrij." }]);
        sourceAliases.set(token, target);
        const aliases = selected.aliases as SourceAlias[];
        if (!aliases.some((alias) => alias.source === member.source && alias.localKey === member.localKey)) aliases.push({ source: member.source, localKey: member.localKey });
      }
    }
  }
  // Bind each selected/plan-provided alias to its selected output row.
  for (const [tableName, choices] of result) for (const choice of choices) {
    const destinationKey = sourceKey(sourceSnapshots[choice.source], tableName, choice.row);
    if (!destinationKey) continue;
    for (const alias of choice.aliases) {
      const token = aliasToken(tableName, alias.source, alias.localKey);
      const destination = aliasToken(tableName, choice.source, destinationKey);
      const existing = sourceAliases.get(token);
      if (existing && existing !== destination) fail([{ code: "identity-collision", tableName, rowKey: alias.localKey, message: `Bronalias in ${tableName} wijst naar meer dan één uitvoerrij.` }]);
      sourceAliases.set(token, destination);
    }
  }
  for (const token of omittedAliases) if (sourceAliases.has(token)) {
    const [tableName, source, local] = token.split("\u0000");
    fail([{ code: "identity-collision", tableName, rowKey: local, message: `Bronrij uit ${source} in ${tableName} staat zowel als behouden als weggelaten geregistreerd.` }]);
  }
  for (const token of [...sourceAliases.keys(), ...omittedAliases]) if (!presentSourceRows.has(token)) {
    const [tableName, source, local] = token.split("\u0000");
    fail([{ code: "unknown-table", tableName, rowKey: local, message: `Een alias of weglatingsbeslissing verwijst naar een niet-bestaande rij in bron ${source}.` }]);
  }
  for (const tableName of new Set([...Object.keys(snapshotA.tables), ...Object.keys(snapshotB.tables)])) {
    if (!result.has(tableName)) result.set(tableName, []);
  }
  for (const [source, snapshot] of [["A", snapshotA], ["B", snapshotB]] as const) {
    for (const [tableName, table] of Object.entries(snapshot.tables)) {
      for (const row of table.rows) {
        const local = sourceKey(snapshot, tableName, row);
        const token = local ? aliasToken(tableName, source, local) : "";
        const covered = Boolean(local && sourceAliases.has(token));
        const intentionallyOmitted = Boolean(local && omittedAliases.has(token));
        if (!covered && !intentionallyOmitted) fail([{ code: "unknown-table", message: `Rij in ${tableName} uit bron ${source} ontbreekt in het mergeplan; de rij wordt niet stilzwijgend weggelaten.`, tableName }]);
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

type SourceRowIndexes = ReadonlyMap<string, ReadonlyMap<string, ReadonlyMap<string, UserDataRow>>>;
function buildSourceRowIndexes(snapshot: UserDataSnapshot): SourceRowIndexes {
  const tables = new Map<string, ReadonlyMap<string, ReadonlyMap<string, UserDataRow>>>();
  for (const [tableName, table] of Object.entries(snapshot.tables)) {
    const columns = new Map<string, Map<string, UserDataRow>>();
    for (const column of table.columns) {
      const values = new Map<string, UserDataRow>();
      for (const row of table.rows) {
        const value = row[column.name];
        if (value !== null && value !== undefined) {
          const key = valueKey(value);
          if (!values.has(key)) values.set(key, row);
          else values.set(key, undefined as unknown as UserDataRow);
        }
      }
      columns.set(column.name, values);
    }
    tables.set(tableName, columns);
  }
  return tables;
}

function resolveOutputId(
  source: MergeDatabaseSource,
  snapshot: UserDataSnapshot,
  tableName: string,
  row: UserDataRow,
  column: string,
  maps: Map<string, Map<string, SqlValue>>,
  indexes: SourceRowIndexes,
): SqlValue | undefined {
  const targetRow = indexes.get(tableName)?.get(column)?.get(valueKey(row[column]!));
  if (!targetRow) return undefined;
  const key = sourceKey(snapshot, tableName, targetRow);
  if (!key) return undefined;
  const output = maps.get(tableName)?.get(`${source}\u0000${key}`);
  if (output === undefined) return undefined;
  return output;
}

function remapRow(
  source: MergeDatabaseSource,
  fieldSources: Readonly<Record<string, MergeDatabaseSource>> | undefined,
  snapshots: Readonly<Record<MergeDatabaseSource, UserDataSnapshot>>,
  tableName: string,
  row: UserDataRow,
  table: UserDataSnapshot["tables"][string],
  maps: Map<string, Map<string, SqlValue>>,
  mediaPathLookup: Map<string, SqlValue>,
  indexes: Readonly<Record<MergeDatabaseSource, SourceRowIndexes>>,
): UserDataRow {
  const mapped: Record<string, SqlValue> = {};
  for (const column of table.columns) mapped[column.name] = copyValue(row[column.name] ?? null);
  for (const key of table.foreignKeys) {
    const value = row[key.fromColumn];
    if (value === null || value === undefined) continue;
    const relationshipSource = fieldSources?.[key.fromColumn] ?? source;
    const relationshipSnapshot = snapshots[relationshipSource];
    const targetTable = relationshipSnapshot.tables[key.referencedTable];
    const targetPrimaryKey = targetTable?.primaryKey.length === 1 ? targetTable.primaryKey[0] : null;
    if (key.toColumn && key.toColumn !== targetPrimaryKey) {
      if (key.referencedTable !== "IndependentMedia" || key.toColumn !== "FilePath") {
        throw new MergeDatabaseBuildError([{ code: "unmapped-reference", message: `${tableName}.${key.fromColumn} verwijst via de niet-primaire kolom ${key.referencedTable}.${key.toColumn}; deze relatie heeft geen gecontroleerde omzetregel.`, tableName }]);
      }
      const media = indexes[relationshipSource].get("IndependentMedia")?.get("FilePath")?.get(valueKey(value));
      if (!media) throw new MergeDatabaseBuildError([{ code: "unmapped-reference", message: `${tableName}.${key.fromColumn} kon de gekoppelde mediabron niet terugvinden.`, tableName }]);
      const mediaLocalKey = sourceKey(relationshipSnapshot, "IndependentMedia", media);
      const mediaOutput = mediaLocalKey === null ? undefined : mediaPathLookup.get(`${relationshipSource}\u0000${mediaLocalKey}`);
      if (mediaOutput === undefined) throw new MergeDatabaseBuildError([{ code: "unmapped-reference", message: `${tableName}.${key.fromColumn} verwijst naar media die niet in de uitvoer is opgenomen.`, tableName }]);
      mapped[key.fromColumn] = mediaOutput;
      continue;
    }
    const referenceTarget = relationshipSnapshot.tables[key.referencedTable];
    const referenceColumn = key.toColumn ?? referenceTarget?.primaryKey[0] ?? "";
    const reference = resolveOutputId(relationshipSource, relationshipSnapshot, key.referencedTable, { [referenceColumn]: value }, referenceColumn, maps, indexes[relationshipSource]);
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
  locationResolution?: LocationResolutionContext,
  locationResolutionGuard?: () => boolean,
  playlistResolution?: PlaylistResolutionContext,
): Promise<BuiltMergedDatabase> {
  const issues: MergeBuildIssue[] = [];
  if (locationResolution && !isLocationResolutionContextCurrent(locationResolution, snapshotA, snapshotB)) {
    fail([{ code: "unresolved-plan", message: "De plaatsbevestigingen horen niet meer bij de huidige bronbestanden." }]);
  }
  if (locationResolutionGuard && !locationResolutionGuard()) {
    fail([{ code: "unresolved-plan", message: "De plaats- of afspeellijstbevestigingen zijn tijdens het bouwen gewijzigd." }]);
  }
  if (playlistResolution && !locationResolution
    || playlistResolution && !isPlaylistResolutionContextCurrent(playlistResolution, snapshotA, snapshotB,
      playlistResolution.sourceLibraries.A, playlistResolution.sourceLibraries.B, locationResolution!)) {
    fail([{ code: "unresolved-plan", message: "De afspeellijstbevestigingen horen niet meer bij de huidige bronbestanden of plaatskeuzes." }]);
  }
  if (playlistResolution && (playlistResolution.unresolved.length > 0
    || playlistResolution.proposals.some((proposal) =>
      !playlistResolution.confirmedGroups.some((group) => group.proposalId === proposal.id)
      && !playlistResolution.differentDecisions.some((decision) => decision.proposalId === proposal.id)))) {
    fail([{ code: "unresolved-plan", message: "Afspeellijstidentiteiten zijn nog niet allemaal bevestigd of veilig afzonderlijk behouden." }]);
  }
  if (sourceA.schemaVersion !== sourceB.schemaVersion || snapshotA.schemaVersion !== snapshotB.schemaVersion) {
    fail([{ code: "schema-mismatch", message: "De bronbestanden gebruiken niet dezelfde gevalideerde databasestructuur." }]);
  }
  if (schemaSignature(snapshotA) !== schemaSignature(snapshotB)) {
    fail([{ code: "schema-mismatch", message: "De tabellen, foreign keys of expliciete schema-objecten verschillen; samenvoegen wordt geblokkeerd om structuurverlies te voorkomen." }]);
  }
  const rowsByTable = plannedRows(snapshotA, snapshotB, plan, locationResolution, playlistResolution);
  const knownTables = new Set(rowsByTable.keys());
  for (const table of Object.keys(snapshotA.tables)) if (!knownTables.has(table)) issues.push({ code: "unknown-table", tableName: table, message: `Onbekende tabel ${table} is niet veilig samengevoegd.` });
  if (issues.length) fail(issues);

  const ids = new Map<string, SqlValue>();
  const outputIds: OutputIdMapping[] = [];
  const mapLookup = new Map<string, Map<string, SqlValue>>();
  const mediaPathLookup = new Map<string, SqlValue>();
  for (const [tableName, choices] of rowsByTable) {
    const targetTable = snapshotA.tables[tableName]!;
    const pk = targetTable.primaryKey.length === 1 ? targetTable.primaryKey[0]! : null;
    const isIntegerId = pk !== null && choices.every(({ row }) => typeof row[pk] === "number");
    const seen = new Set<string>();
    const lookup = new Map<string, SqlValue>();
    let nextId = 1;
    for (const choice of choices) {
      const snapshot = choice.source === "A" ? snapshotA : snapshotB;
      const local = sourceKey(snapshot, tableName, choice.row);
      if (!local) { issues.push({ code: "identity-collision", tableName, message: `${tableName} heeft een uitvoerrij zonder primaire sleutel.` }); continue; }
      let id: SqlValue;
      if (isIntegerId) { while (seen.has(valueKey(nextId))) nextId++; id = nextId++; }
      else if (pk) id = choice.row[pk] ?? null;
      else if (targetTable.primaryKey.length > 1) id = JSON.stringify(targetTable.primaryKey.map((column) => choice.row[column]));
      else id = null;
      if (targetTable.primaryKey.length > 0 && id === null) { issues.push({ code: "identity-collision", tableName, message: `Primaire sleutel voor ${tableName} ontbreekt.` }); continue; }
      if (targetTable.primaryKey.length > 0) {
        const outputKey = valueKey(id);
        if (seen.has(outputKey)) { issues.push({ code: "identity-collision", tableName, rowKey: local, message: `Uitvoer-ID ${outputKey} komt dubbel voor in ${tableName}.` }); continue; }
        seen.add(outputKey);
      }
      for (const alias of choice.aliases) {
        const aliasKey = `${alias.source}\u0000${alias.localKey}`;
        const existing = lookup.get(aliasKey);
        if (existing !== undefined && valueKey(existing) !== valueKey(id)) {
          issues.push({ code: "identity-collision", tableName, rowKey: alias.localKey, message: `Bronalias in ${tableName} wijst naar twee verschillende uitvoer-ID's.` });
          continue;
        }
        lookup.set(aliasKey, id);
        ids.set(`${tableName}\u0000${aliasKey}`, id);
        outputIds.push({ source: alias.source, tableName, sourceLocalKey: alias.localKey, outputKey: valueKey(id) });
        if (tableName === "IndependentMedia") mediaPathLookup.set(aliasKey, choice.row.FilePath ?? null);
      }
      const selectedAlias = `${choice.source}\u0000${local}`;
      if (!lookup.has(selectedAlias)) {
        lookup.set(selectedAlias, id);
        ids.set(`${tableName}\u0000${selectedAlias}`, id);
        outputIds.push({ source: choice.source, tableName, sourceLocalKey: local, outputKey: valueKey(id) });
        if (tableName === "IndependentMedia") mediaPathLookup.set(selectedAlias, choice.row.FilePath ?? null);
      }
    }
    mapLookup.set(tableName, lookup);
  }
  if (issues.length) fail(issues);
  const sourceIndexes = { A: buildSourceRowIndexes(snapshotA), B: buildSourceRowIndexes(snapshotB) } as const;
  const SQL = await sqliteLoader();
  if (locationResolutionGuard && !locationResolutionGuard()) {
    fail([{ code: "unresolved-plan", message: "De plaats- of afspeellijstbevestigingen zijn tijdens het bouwen gewijzigd." }]);
  }
  const database = new SQL.Database(sourceA.database.export());
  try {
    database.run("PRAGMA foreign_keys = ON");
    if (database.exec("PRAGMA foreign_keys")[0]?.values[0]?.[0] !== 1) {
      throw new MergeDatabaseBuildError([{ code: "integrity-failed", message: "SQLite kon foreign-key-handhaving niet inschakelen; er wordt geen database vrijgegeven." }]);
    }
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
        const remapped = remapRow(choice.source, choice.fieldSources, { A: snapshotA, B: snapshotB }, tableName, row, table, mapLookup, mediaPathLookup, sourceIndexes);
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
    const counts = Object.fromEntries(Object.keys(snapshotA.tables).map((tableName) => {
      const actual = database.exec(`SELECT COUNT(*) FROM ${quote(tableName)}`)[0]?.values[0]?.[0];
      const expected = rowsByTable.get(tableName)?.length ?? 0;
      if (actual !== expected) throw new MergeDatabaseBuildError([{ code: "integrity-failed", tableName,
        message: `Rijcontrole voor ${tableName} faalde: verwacht ${expected}, gevonden ${String(actual)}.` }]);
      return [tableName, expected];
    }));
    if (counts.LastModified !== 1) throw new MergeDatabaseBuildError([{ code: "integrity-failed", tableName: "LastModified", message: "De uitvoer moet precies één LastModified-singleton bevatten." }]);
    database.run("COMMIT");
    const bytes = database.export();
    const reopened = new SQL.Database(bytes);
    try {
      const exportedFk = reopened.exec("PRAGMA foreign_key_check")[0];
      const exportedIntegrity = reopened.exec("PRAGMA integrity_check")[0]?.values;
      if (exportedFk && exportedFk.values.length > 0) throw new MergeDatabaseBuildError([{ code: "integrity-failed", message: `De geëxporteerde database bevat ${exportedFk.values.length} foreign-key-fout(en).` }]);
      if (!exportedIntegrity || exportedIntegrity.length !== 1 || exportedIntegrity[0]?.[0] !== "ok") {
        throw new MergeDatabaseBuildError([{ code: "integrity-failed", message: "De SQLite-integriteitscontrole op de geëxporteerde bytes is niet geslaagd." }]);
      }
      for (const [tableName, expected] of Object.entries(counts)) {
        const actual = reopened.exec(`SELECT COUNT(*) FROM ${quote(tableName)}`)[0]?.values[0]?.[0];
        if (actual !== expected) throw new MergeDatabaseBuildError([{ code: "integrity-failed", tableName,
          message: `De geëxporteerde bytes bevatten voor ${tableName} ${String(actual)} rijen; verwacht waren ${expected}.` }]);
      }
    } finally {
      reopened.close();
    }
    const archiveFiles = (rowsByTable.get("IndependentMedia") ?? []).flatMap((choice) =>
      typeof choice.row.FilePath === "string" && choice.row.FilePath.length > 0
        ? [{ path: choice.row.FilePath, source: choice.source }]
        : []);
    return { bytes, outputIds, tableCounts: counts, archiveFiles, integrity: "ok" };
  } catch (cause) {
    try { database.run("ROLLBACK"); } catch { /* transaction may already have ended */ }
    if (cause instanceof MergeDatabaseBuildError) throw cause;
    throw new MergeDatabaseBuildError([{ code: "sqlite-write-failed", message: "SQLite kon het mergeplan niet toepassen; er zijn geen outputbytes vrijgegeven." }], { cause });
  } finally {
    database.close();
  }
}
