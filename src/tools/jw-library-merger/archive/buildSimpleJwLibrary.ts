import { buildManifest } from "./buildManifest";
import { writeJwLibrary, type JwLibraryWriteResult } from "./writeJwLibrary";
import { buildMergedDatabase } from "../database/buildMergedDatabase";
import { validateUserData, type ValidatedUserData } from "../database/validateUserData";
import type { SimpleMergePreview } from "../merge/prepareSimpleMerge";

/**
 * Runs the resolved Simple mode export pipeline in memory. The current manifest
 * gate blocks before ZIP creation until JW Library's hash rule is verified.
 */
export async function buildSimpleJwLibrary(
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
      undefined,
      preview.locationResolution,
    );
    const manifest = buildManifest({
      databaseBytes: database.bytes,
      sourceManifests: [preview.sources[0].archive.manifest, preview.sources[1].archive.manifest],
    });
    return writeJwLibrary({
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
