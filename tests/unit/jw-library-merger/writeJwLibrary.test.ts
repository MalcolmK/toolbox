import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildManifest, type ReadyManifestBuild } from "../../../src/tools/jw-library-merger/archive/buildManifest";
import { readJwLibrary, type JwLibraryManifest } from "../../../src/tools/jw-library-merger/archive/readJwLibrary";
import { writeJwLibrary, type WriteJwLibraryInput } from "../../../src/tools/jw-library-merger/archive/writeJwLibrary";
import type { BuiltMergedDatabase } from "../../../src/tools/jw-library-merger/database/buildMergedDatabase";

const bytes = (...values: number[]) => new Uint8Array(values);

async function sourceLibrary(fileName: string, entries: Readonly<Record<string, Uint8Array>>) {
  const manifest = {
    name: fileName,
    creationDate: "2026-10-14",
    userDataBackup: { databaseName: "userData.db", schemaVersion: 16, hash: "source-hash" },
  };
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest));
  zip.file("userData.db", bytes(100));
  for (const [path, value] of Object.entries(entries)) zip.file(path, value);
  const archiveBytes = await zip.generateAsync({ type: "uint8array" });
  return readJwLibrary(new File([archiveBytes], fileName));
}

function verifiedSyntheticManifest(databaseName = "userData.db"): ReadyManifestBuild {
  const manifest: JwLibraryManifest = {
    name: "JWLibrary-Merged-2026-10-14.jwlibrary",
    creationDate: "2026-10-14",
    userDataBackup: { databaseName, schemaVersion: 16, lastModifiedDate: "2026-10-14T10:00:00Z", hash: "synthetic-test-hash" },
  };
  return { status: "ready", manifest, json: JSON.stringify(manifest), hashVerified: true };
}

function database(value: Uint8Array = bytes(1, 2, 3), archiveFiles: BuiltMergedDatabase["archiveFiles"] = [{ path: "media/required.bin", source: "A" }]): BuiltMergedDatabase {
  return { bytes: value, outputIds: [], tableCounts: {}, archiveFiles, integrity: "ok" };
}

async function input(entriesA: Readonly<Record<string, Uint8Array>>, entriesB: Readonly<Record<string, Uint8Array>>): Promise<WriteJwLibraryInput> {
  return {
    database: database(),
    manifest: verifiedSyntheticManifest(),
    sourceLibraries: [await sourceLibrary("a.jwlibrary", entriesA), await sourceLibrary("b.jwlibrary", entriesB)],
    createdAt: new Date("2026-10-14T12:00:00Z"),
  };
}

describe("writeJwLibrary", () => {
  it("never packages a database when the production manifest gate is blocked", async () => {
    const sources = [await sourceLibrary("a.jwlibrary", {}), await sourceLibrary("b.jwlibrary", {})] as const;
    const manifest = buildManifest({ databaseBytes: database().bytes, sourceManifests: [sources[0].manifest, sources[1].manifest] });
    const result = await writeJwLibrary({
      database: database(bytes(1, 2, 3), []), manifest, sourceLibraries: sources,
      createdAt: new Date("2026-10-14T12:00:00Z"),
    });
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.bytes).toBeNull();
      expect(result.issues[0]?.code).toBe("manifest-not-verified");
    }
  });

  it("blocks empty or unchecked SQLite bytes before packaging", async () => {
    const sourceInput = await input({ "media/required.bin": bytes(8) }, { "media/required.bin": bytes(8) });
    for (const invalidDatabase of [
      { ...sourceInput.database, bytes: bytes(), integrity: "ok" as const },
      { ...sourceInput.database, integrity: "failed" as const },
    ]) {
      const result = await writeJwLibrary({ ...sourceInput, database: invalidDatabase });
      expect(result.status).toBe("blocked");
      if (result.status === "blocked") {
        expect(result.bytes).toBeNull();
        expect(result.issues[0]?.code).toBe("invalid-database");
      }
    }
  });

  it("blocks malformed or inconsistent manifest JSON", async () => {
    const sourceInput = await input({ "media/required.bin": bytes(8) }, { "media/required.bin": bytes(8) });
    const malformed = await writeJwLibrary({
      ...sourceInput,
      manifest: { ...sourceInput.manifest, json: "{" },
    });
    expect(malformed.status).toBe("blocked");
    if (malformed.status === "blocked") expect(malformed.issues[0]?.code).toBe("invalid-manifest");

    const inconsistent = await writeJwLibrary({
      ...sourceInput,
      manifest: { ...sourceInput.manifest, json: JSON.stringify({ ...sourceInput.manifest.manifest, name: "different" }) },
    });
    expect(inconsistent.status).toBe("blocked");
    if (inconsistent.status === "blocked") expect(inconsistent.issues[0]?.code).toBe("invalid-manifest");
  });

  it("writes a new ZIP, retains safe source entries, and verifies its manifest, database, and required media", async () => {
    const sourceInput = await input({
      "media/required.bin": bytes(8, 9),
      "shared/identical.bin": bytes(4),
      "notes/unknown-a.bin": bytes(5),
    }, {
      "media/required.bin": bytes(8, 9),
      "shared/identical.bin": bytes(4),
      "notes/unknown-b.bin": bytes(6),
    });

    const result = await writeJwLibrary(sourceInput);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.fileName).toBe("JWLibrary-Merged-2026-10-14.jwlibrary");
    const reopened = await JSZip.loadAsync(result.bytes, { checkCRC32: true });
    expect(await reopened.file("manifest.json")?.async("string")).toBe(sourceInput.manifest.json);
    expect(Array.from(await reopened.file("userData.db")!.async("uint8array"))).toEqual([1, 2, 3]);
    expect(Array.from(await reopened.file("media/required.bin")!.async("uint8array"))).toEqual([8, 9]);
    expect(reopened.file("shared/identical.bin")).not.toBeNull();
    expect(reopened.file("notes/unknown-a.bin")).not.toBeNull();
    expect(reopened.file("notes/unknown-b.bin")).not.toBeNull();
    expect(reopened.file("a.jwlibrary")).toBeNull();
  });

  it("blocks when a required media file is missing from its selected source", async () => {
    const sourceInput = await input({}, { "media/required.bin": bytes(8, 9) });
    const result = await writeJwLibrary(sourceInput);
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") expect(result.issues[0]?.code).toBe("required-file-missing");
  });

  it("blocks different payloads at a required media path instead of silently choosing one", async () => {
    const sourceInput = await input({ "media/required.bin": bytes(8) }, { "media/required.bin": bytes(9) });
    const result = await writeJwLibrary(sourceInput);
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") expect(result.issues[0]?.code).toBe("required-file-conflict");
  });

  it("blocks different payloads at an unclassified archive path and unsafe paths", async () => {
    const conflicting = await input({ "media/required.bin": bytes(8), "extra/shared.bin": bytes(1) }, {
      "media/required.bin": bytes(8), "extra/shared.bin": bytes(2),
    });
    const conflictResult = await writeJwLibrary(conflicting);
    expect(conflictResult.status).toBe("blocked");
    if (conflictResult.status === "blocked") expect(conflictResult.issues[0]?.code).toBe("entry-name-conflict");

    const unsafe = await input({ "media/required.bin": bytes(8), "../escape.bin": bytes(1) }, { "media/required.bin": bytes(8) });
    const unsafeResult = await writeJwLibrary(unsafe);
    expect(unsafeResult.status).toBe("blocked");
    if (unsafeResult.status === "blocked") expect(unsafeResult.issues[0]?.code).toBe("unsafe-entry-name");
  });
});
