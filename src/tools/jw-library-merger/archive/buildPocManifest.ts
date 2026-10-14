import type { JwLibraryManifest } from "./readJwLibrary";

export interface PocManifestBuildInput {
  /** A source manifest chosen explicitly by the user for the provisional hash. */
  readonly sourceManifest: JwLibraryManifest;
  /** Path where the merged database will be written in the output archive. */
  readonly databaseName: string;
  readonly createdAt?: Date;
}

export type PocManifestBuildResult =
  | {
      readonly status: "ready-unverified";
      readonly manifest: JwLibraryManifest;
      readonly json: string;
      readonly hashVerified: false;
      readonly hashSource: "A" | "B";
    }
  | {
      readonly status: "blocked";
      readonly code: "missing-source-hash" | "invalid-database-name" | "invalid-date";
      readonly message: string;
      readonly manifest: null;
      readonly json: null;
    };

/**
 * Builds a deliberately provisional POC manifest by retaining one selected
 * source hash. This does not calculate or verify the JW Library hash rule and
 * must never be treated as production verification.
 */
export function buildPocManifest(
  input: PocManifestBuildInput & { readonly hashSource: "A" | "B" },
): PocManifestBuildResult {
  const { sourceManifest, databaseName, hashSource } = input;
  if (!databaseName.trim() || databaseName !== databaseName.trim() || databaseName.includes("\\")
    || databaseName.startsWith("/") || databaseName.split("/").some((part) => !part || part === "." || part === ".." || part.includes(":"))) {
    return {
      status: "blocked",
      code: "invalid-database-name",
      message: "POC-manifest geblokkeerd: de databaseverwijzing is geen veilig archiefpad.",
      manifest: null,
      json: null,
    };
  }

  const hash = sourceManifest.userDataBackup.hash;
  if (typeof hash !== "string" || hash.trim().length === 0) {
    return {
      status: "blocked",
      code: "missing-source-hash",
      message: `POC-manifest geblokkeerd: bron ${hashSource} bevat geen bruikbare hash om voorlopig over te nemen.`,
      manifest: null,
      json: null,
    };
  }

  const createdAt = input.createdAt ?? new Date();
  if (!Number.isFinite(createdAt.getTime())) {
    return {
      status: "blocked",
      code: "invalid-date",
      message: "POC-manifest geblokkeerd: de aanmaakdatum is ongeldig.",
      manifest: null,
      json: null,
    };
  }

  const timestamp = createdAt.toISOString();
  const manifest: JwLibraryManifest = {
    ...sourceManifest,
    creationDate: timestamp,
    userDataBackup: {
      ...sourceManifest.userDataBackup,
      databaseName,
      lastModifiedDate: timestamp,
      hash,
    },
  };

  return {
    status: "ready-unverified",
    manifest,
    json: JSON.stringify(manifest),
    hashVerified: false,
    hashSource,
  };
}
