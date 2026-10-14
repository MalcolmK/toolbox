import { normalizeTimestamp } from "../compare/normalizeTimestamp";
import type { SimpleMergeResult } from "../merge/simpleMerge";
import type { AdvancedMergePreview } from "../merge/prepareSimpleMerge";
import { buildMergedDatabase } from "../database/buildMergedDatabase";
import { validateUserData, type ValidatedUserData } from "../database/validateUserData";
import { buildPocManifest } from "./buildPocManifest";
import { writePocJwLibrary, type JwLibraryWriteResult } from "./writeJwLibrary";

function timestampValue(value: unknown): number | null {
  const timestamp = normalizeTimestamp(value);
  return timestamp.status === "valid" ? timestamp.epochMilliseconds : null;
}

/** Uses Advanced source timestamps only to choose the explicitly unverified POC manifest hash. */
export function selectAdvancedPocHashSource(preview: AdvancedMergePreview): "A" | "B" {
  const [sourceA, sourceB] = preview.sources;
  const databaseA = timestampValue(sourceA.snapshot.modificationTimes.databaseLastModified);
  const databaseB = timestampValue(sourceB.snapshot.modificationTimes.databaseLastModified);
  if (databaseA !== null && databaseB !== null && databaseA !== databaseB) return databaseA > databaseB ? "A" : "B";

  if (databaseA === null || databaseB === null) {
    const manifestA = timestampValue(sourceA.snapshot.modificationTimes.manifestDatabaseLastModified);
    const manifestB = timestampValue(sourceB.snapshot.modificationTimes.manifestDatabaseLastModified);
    if (manifestA !== null && manifestB !== null && manifestA !== manifestB) return manifestA > manifestB ? "A" : "B";
  }
  return "A";
}

/** Builds a checked Advanced-mode POC archive without entering the production hash-verification route. */
export async function buildAdvancedPocJwLibrary(
  preview: AdvancedMergePreview,
  plan: SimpleMergeResult,
  createdAt: Date = new Date(),
): Promise<JwLibraryWriteResult> {
  if (plan.status !== "ready" || plan.report.unresolved.length > 0) {
    throw new Error("De database kan niet worden opgebouwd zolang Advanced-keuzes openstaan of onveilig zijn.");
  }

  let validatedA: ValidatedUserData | undefined;
  let validatedB: ValidatedUserData | undefined;
  try {
    validatedA = await validateUserData(preview.sources[0].archive);
    validatedB = await validateUserData(preview.sources[1].archive);
    const database = await buildMergedDatabase(
      validatedA,
      preview.sources[0].snapshot,
      validatedB,
      preview.sources[1].snapshot,
      plan,
    );

    const hashSource = selectAdvancedPocHashSource(preview);
    const selectedSource = preview.sources[hashSource === "A" ? 0 : 1];
    const manifest = buildPocManifest({
      sourceManifest: selectedSource.archive.manifest,
      databaseName: preview.sources[0].archive.databaseName,
      hashSource,
      createdAt,
    });
    return writePocJwLibrary({
      database,
      manifest,
      sourceLibraries: [preview.sources[0].archive, preview.sources[1].archive],
      createdAt,
    });
  } finally {
    validatedA?.database.close();
    validatedB?.database.close();
  }
}
