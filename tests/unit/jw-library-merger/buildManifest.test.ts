import { describe, expect, it } from "vitest";
import { buildManifest } from "../../../src/tools/jw-library-merger/archive/buildManifest";
import type { JwLibraryManifest } from "../../../src/tools/jw-library-merger/archive/readJwLibrary";

const sourceManifest = (hash: string): JwLibraryManifest => ({
  name: "synthetic.jwlibrary",
  creationDate: "2026-10-14",
  userDataBackup: {
    databaseName: "userData.db",
    schemaVersion: 16,
    lastModifiedDate: "2026-10-14T10:00:00Z",
    hash,
    unknownSourceField: "preserve when the rule is established",
  },
});

describe("buildManifest", () => {
  it("blocks manifest output while the JW Library hash rule is unverified", () => {
    const result = buildManifest({
      databaseBytes: new Uint8Array([1, 2, 3, 4]),
      sourceManifests: [sourceManifest("source-a-hash"), sourceManifest("source-b-hash")],
    });

    expect(result).toMatchObject({
      status: "blocked",
      code: "unverified-hash-rule",
      databaseByteLength: 4,
      manifest: null,
      json: null,
    });
    expect(result.message).toMatch(/geen manifest gemaakt/i);
    expect(JSON.stringify(result)).not.toContain("source-a-hash");
    expect(JSON.stringify(result)).not.toContain("source-b-hash");
  });

  it("does not turn an empty database into a manifest", () => {
    const result = buildManifest({
      databaseBytes: new Uint8Array(),
      sourceManifests: [sourceManifest("same"), sourceManifest("same")],
    });

    expect(result.status).toBe("blocked");
    expect(result.manifest).toBeNull();
    expect(result.json).toBeNull();
  });
});
