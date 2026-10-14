import { readJwLibrary, type LoadedJwLibrary } from "../archive/readJwLibrary";
import { readUserData, type UserDataSnapshot } from "../database/readUserData";
import { validateUserData } from "../database/validateUserData";
import { compareLibraries, type LibraryComparison } from "../compare/compareLibraries";
import { buildMergeReport, type MergeReport } from "../report/buildMergeReport";
import { simpleMerge, type SimpleMergeResult } from "./simpleMerge";

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
}

export interface MergeInputCheck {
  readonly source: "A" | "B";
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

async function prepareSource(file: File): Promise<PreparedMergeSource> {
  const archive = await readJwLibrary(file);
  const validated = await validateUserData(archive);
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
): Promise<SimpleMergePreview> {
  const [resultA, resultB] = await Promise.allSettled([
    prepareSource(fileA),
    prepareSource(fileB),
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
  const comparison = compareLibraries(sources[0].snapshot, sources[1].snapshot);
  return {
    sources,
    comparison,
    differenceReport: buildMergeReport(comparison),
    mergePlan: simpleMerge(sources[0].snapshot, sources[1].snapshot),
  };
}
