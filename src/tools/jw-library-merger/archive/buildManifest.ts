import type { JwLibraryManifest } from "./readJwLibrary";

export interface ManifestBuildInput {
  /** The database produced by the merge builder. */
  readonly databaseBytes: Uint8Array;
  /** The original manifests are supplied for later, evidence-backed metadata selection. */
  readonly sourceManifests: readonly [JwLibraryManifest, JwLibraryManifest];
}

export interface BlockedManifestBuild {
  readonly status: "blocked";
  readonly code: "unverified-hash-rule";
  readonly message: string;
  readonly databaseByteLength: number;
  /** No JSON is returned, so callers cannot accidentally package a speculative manifest. */
  readonly manifest: null;
  readonly json: null;
}

export interface ReadyManifestBuild {
  readonly status: "ready";
  readonly manifest: JwLibraryManifest;
  readonly json: string;
  /** Set only by a future implementation after the JW Library hash rule is verified. */
  readonly hashVerified: true;
}

export type ManifestBuildResult = BlockedManifestBuild | ReadyManifestBuild;

/**
 * Step 23's fail-closed gate. The expected JW Library hash rule is not currently
 * verified, so this function deliberately does not emit manifest JSON. Keep the
 * inputs in the contract so packaging cannot silently skip this gate later.
 */
export function buildManifest(input: ManifestBuildInput): ManifestBuildResult {
  // Read both source manifests so callers must pass the provenance required by
  // a future verified implementation; do not infer the output hash from them.
  void input.sourceManifests;

  return {
    status: "blocked",
    code: "unverified-hash-rule",
    message:
      "Export geblokkeerd: de hash-regel van JW Library voor manifest.userDataBackup.hash is niet geverifieerd. Er wordt geen manifest gemaakt.",
    databaseByteLength: input.databaseBytes.byteLength,
    manifest: null,
    json: null,
  };
}
