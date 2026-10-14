import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  JwLibraryReadError,
  readJwLibrary,
} from "../../../src/tools/jw-library-merger/archive/readJwLibrary";

const fixtureUrl = (name: string) =>
  new URL(`../../fixtures/jw-library/${name}`, import.meta.url);

async function fixtureFile(name: string): Promise<File> {
  const bytes = await readFile(fixtureUrl(name));
  return new File([new Uint8Array(bytes)], name);
}

describe("readJwLibrary", () => {
  it("reads the manifest and database while retaining every archive entry", async () => {
    const result = await readJwLibrary(await fixtureFile("base.jwlibrary"));

    expect(result.sourceFileName).toBe("base.jwlibrary");
    expect(result.databaseName).toBe("userData.db");
    expect(result.manifest.userDataBackup.databaseName).toBe("userData.db");
    expect(result.manifestText).toContain('"databaseName": "userData.db"');
    expect(result.databaseBytes.byteLength).toBeGreaterThan(0);
    expect(result.entryNames).toContain("manifest.json");
    expect(result.entryNames).toContain("userData.db");
    expect(result.entryNames).toContain("default_thumbnail.png");
    expect(result.archive.file("default_thumbnail.png")).not.toBeNull();
  });

  it("does not inspect SQLite validity at the outer-archive step", async () => {
    const result = await readJwLibrary(
      await fixtureFile("corrupt-database.jwlibrary"),
    );

    expect(new TextDecoder().decode(result.databaseBytes)).toContain(
      "synthetic invalid SQLite",
    );
  });

  it.each([
    ["missing-manifest.jwlibrary", "missing-manifest"],
    ["invalid-manifest.jwlibrary", "invalid-manifest-json"],
    ["missing-database.jwlibrary", "missing-database"],
  ] as const)("reports %s with a specific error", async (name, code) => {
    await expect(readJwLibrary(await fixtureFile(name))).rejects.toMatchObject({
      name: "JwLibraryReadError",
      code,
    });
  });

  it("rejects a manifest whose required database reference is malformed", async () => {
    const archive = await new JSZip()
      .file("manifest.json", JSON.stringify({ userDataBackup: {} }))
      .generateAsync({ type: "uint8array" });
    const file = new File([new Uint8Array(archive)], "invalid-reference.jwlibrary");

    await expect(readJwLibrary(file)).rejects.toMatchObject({
      name: "JwLibraryReadError",
      code: "invalid-manifest",
    });
  });

  it("rejects empty files and non-ZIP files with specific errors", async () => {
    const empty = new File([], "empty.jwlibrary");
    const plainText = new File(["not a ZIP"], "plain-text.jwlibrary");

    await expect(readJwLibrary(empty)).rejects.toMatchObject({
      name: "JwLibraryReadError",
      code: "empty-file",
    });
    await expect(readJwLibrary(plainText)).rejects.toBeInstanceOf(JwLibraryReadError);
    await expect(readJwLibrary(plainText)).rejects.toMatchObject({
      code: "invalid-zip",
    });
  });
});
