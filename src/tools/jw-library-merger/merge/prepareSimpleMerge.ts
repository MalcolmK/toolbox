import { readJwLibrary, type LoadedJwLibrary } from "../archive/readJwLibrary";
import { readUserData, type UserDataSnapshot } from "../database/readUserData";
import { loadSqlite } from "../database/sqliteRuntime";
import { validateUserData } from "../database/validateUserData";
import type { SqlJsStatic } from "sql.js";
import { compareLibraries, type LibraryComparison } from "../compare/compareLibraries";
import { buildMergeReport, type MergeReport } from "../report/buildMergeReport";
import { simpleMerge, type SimpleMergeResult } from "./simpleMerge";
import { compareThreeWay, type ThreeWayComparison } from "../compare/compareThreeWay";
import { createLocationResolutionContext, type LocationResolutionContext } from "./locationResolution";
import { createPlaylistResolutionContext, type PlaylistResolutionContext } from "./playlistResolution";

export interface PreparedMergeSource {
  readonly fileName: string;
  readonly schemaVersion: number;
  readonly archive: LoadedJwLibrary;
  readonly snapshot: UserDataSnapshot;
}

export interface SimpleMergePreview {
  readonly sources: readonly [PreparedMergeSource, PreparedMergeSource];
  readonly comparison: LibraryComparison;
  readonly differenceReport: MergeReport;
  readonly mergePlan: SimpleMergeResult;
  readonly locationResolution: LocationResolutionContext;
  readonly playlistResolution: PlaylistResolutionContext;
}

export interface AdvancedMergePreview {
  /** A comparison ancestor only; output candidates remain A and B. */
  readonly baseSource: Omit<PreparedMergeSource, "archive"> | null;
  readonly sources: readonly [PreparedMergeSource, PreparedMergeSource];
  readonly comparison: ThreeWayComparison;
}

export interface MergeInputCheck {
  readonly source: "A" | "B" | "basis";
  readonly fileName: string;
  readonly valid: boolean;
  readonly schemaVersion: number | null;
  readonly error: string | null;
}

export class SimpleMergeInputError extends Error {
  constructor(readonly checks: readonly [MergeInputCheck, MergeInputCheck]) {
    super("Een of beide geselecteerde back-ups konden niet veilig worden verwerkt.");
    this.name = "SimpleMergeInputError";
  }
}

async function prepareSource(file: File, sqliteLoader: () => Promise<SqlJsStatic>): Promise<PreparedMergeSource> {
  const archive = await readJwLibrary(file);
  const validated = await validateUserData(archive, sqliteLoader);
  try {
    return {
      fileName: file.name,
      schemaVersion: validated.schemaVersion,
      archive,
      snapshot: readUserData(validated),
    };
  } finally {
    validated.database.close();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Er ging iets mis bij het lezen van dit bestand.";
}

/** Read, validate, compare, and plan two local files without writing either archive. */
export async function prepareSimpleMerge(
  fileA: File,
  fileB: File,
  sqliteLoader: () => Promise<SqlJsStatic> = loadSqlite,
): Promise<SimpleMergePreview> {
  const [resultA, resultB] = await Promise.allSettled([
    prepareSource(fileA, sqliteLoader),
    prepareSource(fileB, sqliteLoader),
  ]);
  const checks: [MergeInputCheck, MergeInputCheck] = [
    {
      source: "A",
      fileName: fileA.name,
      valid: resultA.status === "fulfilled",
      schemaVersion: resultA.status === "fulfilled" ? resultA.value.schemaVersion : null,
      error: resultA.status === "rejected" ? errorMessage(resultA.reason) : null,
    },
    {
      source: "B",
      fileName: fileB.name,
      valid: resultB.status === "fulfilled",
      schemaVersion: resultB.status === "fulfilled" ? resultB.value.schemaVersion : null,
      error: resultB.status === "rejected" ? errorMessage(resultB.reason) : null,
    },
  ];

  if (resultA.status === "rejected" || resultB.status === "rejected") {
    throw new SimpleMergeInputError(checks);
  }

  const sources = [resultA.value, resultB.value] as const;
  const locationResolution = createLocationResolutionContext(
    crypto.randomUUID(), crypto.randomUUID(), sources[0].snapshot, sources[1].snapshot,
  );
  const playlistResolution = await createPlaylistResolutionContext(
    locationResolution.sessionId, locationResolution.sourcePairId,
    sources[0].snapshot, sources[1].snapshot,
    sources[0].archive, sources[1].archive, locationResolution,
  );
  const comparison = compareLibraries(sources[0].snapshot, sources[1].snapshot, locationResolution, playlistResolution);
  return {
    sources,
    locationResolution,
    playlistResolution,
    comparison,
    differenceReport: buildMergeReport(comparison),
    mergePlan: simpleMerge(sources[0].snapshot, sources[1].snapshot, new Map(), locationResolution, playlistResolution),
  };
}

export class AdvancedMergeInputError extends Error {
  constructor(readonly checks: readonly MergeInputCheck[]) {
    super("Een of meer geselecteerde back-ups konden niet veilig worden verwerkt.");
    this.name = "AdvancedMergeInputError";
  }
}

/** Read and validate two output sources plus an optional comparison-only base. */
export async function prepareAdvancedMerge(
  fileA: File,
  fileB: File,
  baseFile: File | null,
  sqliteLoader: () => Promise<SqlJsStatic> = loadSqlite,
): Promise<AdvancedMergePreview> {
  const files = [
    ...(baseFile ? [{ source: "basis" as const, file: baseFile }] : []),
    { source: "A" as const, file: fileA },
    { source: "B" as const, file: fileB },
  ];
  const results = await Promise.allSettled(files.map(({ file }) => prepareSource(file, sqliteLoader)));
  const checks: MergeInputCheck[] = results.map((result, index) => ({
    source: files[index]!.source,
    fileName: files[index]!.file.name,
    valid: result.status === "fulfilled",
    schemaVersion: result.status === "fulfilled" ? result.value.schemaVersion : null,
    error: result.status === "rejected" ? errorMessage(result.reason) : null,
  }));
  if (results.some((result) => result.status === "rejected")) {
    throw new AdvancedMergeInputError(checks);
  }

  const prepared = results.map((result) => {
    if (result.status !== "fulfilled") throw new Error("Unreachable rejected input after validation.");
    return result.value;
  });
  const baseSource = baseFile ? prepared[0]! : null;
  const offset = baseFile ? 1 : 0;
  const sources = [prepared[offset]!, prepared[offset + 1]!] as const;
  const comparisonBase = baseSource
    ? { fileName: baseSource.fileName, schemaVersion: baseSource.schemaVersion, snapshot: baseSource.snapshot }
    : null;
  return {
    baseSource: comparisonBase,
    sources,
    comparison: compareThreeWay(sources[0].snapshot, sources[1].snapshot, comparisonBase?.snapshot ?? null),
  };
}
