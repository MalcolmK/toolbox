import { describe, expect, it } from "vitest";
import { buildPocManifest } from "../../../src/tools/jw-library-merger/archive/buildPocManifest";
import type { JwLibraryManifest } from "../../../src/tools/jw-library-merger/archive/readJwLibrary";

const sourceManifest = (hash: unknown): JwLibraryManifest => ({
  name: "source.jwlibrary",
  creationDate: "2026-10-14T09:00:00Z",
  userDataBackup: {
    databaseName: "source/userData.db",
    schemaVersion: 16,
    lastModifiedDate: "2026-10-14T09:00:00Z",
    hash,
    extraSourceField: "preserved",
  },
  extraTopLevelField: "also-preserved",
});

describe("buildPocManifest", () => {
  it("copies the selected source hash and metadata while marking it explicitly unverified", () => {
    const result = buildPocManifest({
      sourceManifest: sourceManifest("source-hash-A"),
      databaseName: "userData.db",
      hashSource: "A",
      createdAt: new Date("2026-10-14T12:34:56Z"),
    });

    expect(result).toMatchObject({ status: "ready-unverified", hashVerified: false, hashSource: "A" });
    if (result.status !== "ready-unverified") return;
    expect(result.manifest.userDataBackup).toMatchObject({
      databaseName: "userData.db",
      hash: "source-hash-A",
      schemaVersion: 16,
      extraSourceField: "preserved",
      lastModifiedDate: "2026-10-14T12:34:56.000Z",
    });
    expect(result.manifest).toMatchObject({ extraTopLevelField: "also-preserved" });
    expect(JSON.parse(result.json)).toEqual(result.manifest);
    expect(JSON.stringify(result)).not.toContain('"hashVerified":true');
  });

  it("blocks a missing or empty source hash", () => {
    for (const hash of [undefined, null, "", "   ", 123]) {
      const result = buildPocManifest({ sourceManifest: sourceManifest(hash), databaseName: "userData.db", hashSource: "B" });
      expect(result).toMatchObject({ status: "blocked", code: "missing-source-hash", manifest: null, json: null });
    }
  });

  it("blocks unsafe database paths and invalid dates", () => {
    for (const databaseName of ["../userData.db", "/userData.db", "folder\\userData.db", "folder//db", "C:/db"]) {
      const result = buildPocManifest({ sourceManifest: sourceManifest("hash"), databaseName, hashSource: "A" });
      expect(result).toMatchObject({ status: "blocked", code: "invalid-database-name" });
    }
    const invalidDate = buildPocManifest({ sourceManifest: sourceManifest("hash"), databaseName: "userData.db", hashSource: "A", createdAt: new Date(Number.NaN) });
    expect(invalidDate).toMatchObject({ status: "blocked", code: "invalid-date" });
  });
});
