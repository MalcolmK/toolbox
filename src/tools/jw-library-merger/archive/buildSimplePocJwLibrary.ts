import { buildPocManifest } from "./buildPocManifest";
import { writePocJwLibrary, type JwLibraryWriteResult } from "./writeJwLibrary";
import { buildMergedDatabase } from "../database/buildMergedDatabase";
import { validateUserData, type ValidatedUserData } from "../database/validateUserData";
import type { SimpleMergePreview } from "../merge/prepareSimpleMerge";
import type { NormalizedTimestamp } from "../compare/normalizeTimestamp";

function validEpoch(timestamp: NormalizedTimestamp): number | null {
  return timestamp.status === "valid" ? timestamp.epochMilliseconds : null;
}

/**
 * Selects the most recent source using Simple mode's database-first ordering.
 * If no reliable ordering exists, A is a deterministic fallback and the
 * returned archive still carries the POC-unverified/hash-source disclosure.
 */
export function selectSimplePocHashSource(preview: SimpleMergePreview): "A" | "B" {
  const databaseA = validEpoch(preview.mergePlan.report.sourceA.databaseTimestamp);
  const databaseB = validEpoch(preview.mergePlan.report.sourceB.databaseTimestamp);
  if (databaseA !== null && databaseB !== null && databaseA !== databaseB) return databaseA > databaseB ? "A" : "B";

  if (databaseA === null || databaseB === null) {
    const manifestA = validEpoch(preview.mergePlan.report.sourceA.manifestTimestamp);
    const manifestB = validEpoch(preview.mergePlan.report.sourceB.manifestTimestamp);
    if (manifestA !== null && manifestB !== null && manifestA !== manifestB) return manifestA > manifestB ? "A" : "B";
  }

  return "A";
}

/** Builds a checked Simple-mode POC archive without opening the production hash route. */
export async function buildSimplePocJwLibrary(
  preview: SimpleMergePreview,
  createdAt: Date = new Date(),
): Promise<JwLibraryWriteResult> {
  if (preview.mergePlan.status !== "ready") {
    throw new Error("De database kan niet worden opgebouwd zolang er mergekeuzes openstaan.");
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
      preview.mergePlan,
    );

    const hashSource = selectSimplePocHashSource(preview);
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
