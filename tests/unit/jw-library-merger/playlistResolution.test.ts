import { readFile } from "node:fs/promises";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { readJwLibrary } from "../../../src/tools/jw-library-merger/archive/readJwLibrary";
import { readUserData } from "../../../src/tools/jw-library-merger/database/readUserData";
import { validateUserData } from "../../../src/tools/jw-library-merger/database/validateUserData";
import { buildMergedDatabase } from "../../../src/tools/jw-library-merger/database/buildMergedDatabase";
import { compareLibraries } from "../../../src/tools/jw-library-merger/compare/compareLibraries";
import { confirmLocationProposal, createLocationResolutionContext } from "../../../src/tools/jw-library-merger/merge/locationResolution";
import {
  confirmPlaylistProposal, createPlaylistResolutionContext, keepPlaylistSeparate,
  markPlaylistsDifferent, revokePlaylistConfirmation,
} from "../../../src/tools/jw-library-merger/merge/playlistResolution";
import { simpleMerge } from "../../../src/tools/jw-library-merger/merge/simpleMerge";

const fixture = (name: string) => new URL(`../../fixtures/jw-library/${name}`, import.meta.url);
const wasm = new URL("../../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url);
const SQLPromise = readFile(wasm).then((bytes) => initSqlJs({ wasmBinary: new Uint8Array(bytes) }));

async function open(name: string) {
  const bytes = await readFile(fixture(name));
  const archive = await readJwLibrary(new File([new Uint8Array(bytes)], name));
  const validated = await validateUserData(archive, () => SQLPromise);
  return { archive, snapshot: readUserData(validated), validated, close: () => validated.database.close() };
}

async function pair(aName: string, bName: string) {
  const [a, b] = await Promise.all([open(aName), open(bName)]);
  let places = createLocationResolutionContext("playlist-session", "playlist-pair", a.snapshot, b.snapshot);
  for (const proposal of places.proposals) {
    const result = confirmLocationProposal(places, proposal.id, places.sessionId, places.revision,
      a.snapshot, b.snapshot, "A");
    if (!result.ok) throw new Error(result.reason);
    places = result.context;
  }
  const playlists = await createPlaylistResolutionContext("playlist-session", "playlist-pair",
    a.snapshot, b.snapshot, a.archive, b.archive, places);
  return { a, b, places, playlists, close: () => { a.close(); b.close(); } };
}

describe("session-scoped playlist identity", () => {
  it("requires explicit confirmation despite different local IDs, then remaps the complete dependent graph", async () => {
    const data = await pair("playlist-a.jwlibrary", "playlist-b.jwlibrary");
    try {
      expect(data.playlists.proposals).toHaveLength(1);
      expect(data.playlists.unresolved).toHaveLength(0);
      expect(compareLibraries(data.a.snapshot, data.b.snapshot, data.places, data.playlists).records
        .find((row) => row.tableName === "PlaylistItem")?.status).toBe("uncertain-linked");
      const confirmed = confirmPlaylistProposal(data.playlists, data.playlists.proposals[0]!.id,
        "playlist-session", 0, data.a.snapshot, data.b.snapshot);
      if (!confirmed.ok) throw new Error(confirmed.reason);
      const plan = simpleMerge(data.a.snapshot, data.b.snapshot, new Map(), data.places, confirmed.context);
      expect(plan.status).toBe("ready");
      const validationB = await validateUserData(data.b.archive, () => SQLPromise);
      try {
        const built = await buildMergedDatabase(data.a.validated, data.a.snapshot, validationB, data.b.snapshot,
          plan, () => SQLPromise, data.places, undefined, confirmed.context);
        expect(built.tableCounts.PlaylistItem).toBe(1);
        expect(built.tableCounts.PlaylistItemIndependentMediaMap).toBe(1);
        expect(built.tableCounts.PlaylistItemLocationMap).toBe(1);
        expect(built.tableCounts.PlaylistItemMarker).toBe(1);
        expect(built.tableCounts.PlaylistItemMarkerBibleVerseMap).toBe(1);
        expect(built.tableCounts.PlaylistItemMarkerParagraphMap).toBe(1);
        expect(built.archiveFiles).toContainEqual({ path: "playlist-media.bin", source: "A" });
      } finally { validationB.database.close(); }
      const revoked = revokePlaylistConfirmation(confirmed.context, confirmed.context.confirmedGroups[0]!.id,
        "playlist-session", 1, data.a.snapshot, data.b.snapshot);
      expect(revoked).toMatchObject({ ok: true });
      if (revoked.ok) {
        expect(revoked.context.confirmedGroups).toHaveLength(0);
        expect(simpleMerge(data.a.snapshot, data.b.snapshot, new Map(), data.places, revoked.context).status).toBe("needs-review");
      }
    } finally { data.close(); }
  });

  it("does not propose same labels with different media paths or durations", async () => {
    const differentMedia = await pair("playlist-different-media-a.jwlibrary", "playlist-different-media-b.jwlibrary");
    const differentDuration = await pair("playlist-a.jwlibrary", "playlist-different-duration.jwlibrary");
    try {
      expect(differentMedia.playlists.proposals).toHaveLength(0);
      expect(differentMedia.playlists.unresolved).toHaveLength(2);
      expect(differentDuration.playlists.proposals).toHaveLength(0);
      expect(differentDuration.playlists.unresolved).toHaveLength(2);
      const issue = differentDuration.playlists.unresolved[0]!;
      const separate = keepPlaylistSeparate(differentDuration.playlists, issue.source, issue.localKey!,
        "playlist-session", 0, differentDuration.a.snapshot, differentDuration.b.snapshot);
      expect(separate.ok).toBe(true);
    } finally { differentMedia.close(); differentDuration.close(); }
  });

  it("blocks a byte mismatch at the same archive path and an absent media payload", async () => {
    const mismatch = await pair("playlist-a.jwlibrary", "playlist-different-bytes.jwlibrary");
    const missing = await pair("playlist-a.jwlibrary", "playlist-missing-media.jwlibrary");
    try {
      expect(mismatch.playlists.proposals).toHaveLength(0);
      expect(mismatch.playlists.unresolved).toHaveLength(2);
      expect(mismatch.playlists.unresolved.every((item) => item.canKeepSeparate === false)).toBe(true);
      const blocked = keepPlaylistSeparate(mismatch.playlists, "A", mismatch.playlists.unresolved[0]!.localKey!,
        "playlist-session", 0, mismatch.a.snapshot, mismatch.b.snapshot);
      expect(blocked).toMatchObject({ ok: false, code: "cannot-keep-separate" });
      expect(missing.playlists.proposals).toHaveLength(0);
      expect(missing.playlists.unresolved.some((item) => item.summary === null)).toBe(true);
    } finally { mismatch.close(); missing.close(); }
  });

  it("does not propose a structure duplicated within one source", async () => {
    const data = await pair("playlist-duplicate-a.jwlibrary", "playlist-single-b.jwlibrary");
    try {
      expect(data.playlists.proposals).toHaveLength(0);
      expect(data.playlists.unresolved).toHaveLength(3);
      expect(data.playlists.unresolved.every((item) => item.reason.includes("meer dan eenmaal"))).toBe(true);
    } finally { data.close(); }
  });

  it("records explicit different choices and rejects stale source-pair decisions", async () => {
    const data = await pair("playlist-different-choice-a.jwlibrary", "playlist-single-b.jwlibrary");
    try {
      const proposal = data.playlists.proposals[0]!;
      expect(markPlaylistsDifferent(data.playlists, proposal.id, "new-session", 0, data.a.snapshot, data.b.snapshot))
        .toMatchObject({ ok: false, code: "stale-context" });
      const changedSourcePair = { ...data.b.snapshot, sourceFileName: "replacement-source.jwlibrary" };
      expect(markPlaylistsDifferent(data.playlists, proposal.id, "playlist-session", 0, data.a.snapshot, changedSourcePair))
        .toMatchObject({ ok: false, code: "stale-context" });
      const result = markPlaylistsDifferent(data.playlists, proposal.id, "playlist-session", 0, data.a.snapshot, data.b.snapshot);
      if (!result.ok) throw new Error(result.reason);
      expect(result.context.differentDecisions).toHaveLength(1);
      expect(compareLibraries(data.a.snapshot, data.b.snapshot, data.places, result.context).records
        .filter((row) => row.tableName === "PlaylistItem")).toHaveLength(2);
      const plan = simpleMerge(data.a.snapshot, data.b.snapshot, new Map(), data.places, result.context);
      expect(plan.status).toBe("ready");
      const validationB = await validateUserData(data.b.archive, () => SQLPromise);
      try {
        const built = await buildMergedDatabase(data.a.validated, data.a.snapshot, validationB, data.b.snapshot,
          plan, () => SQLPromise, data.places, undefined, result.context);
        expect(built.tableCounts.PlaylistItem).toBe(2);
        expect(built.tableCounts.PlaylistItemIndependentMediaMap).toBe(2);
        expect(built.tableCounts.PlaylistItemMarker).toBe(2);
        expect(built.tableCounts.PlaylistItemMarkerBibleVerseMap).toBe(2);
        expect(built.tableCounts.PlaylistItemMarkerParagraphMap).toBe(2);
      } finally { validationB.database.close(); }
    } finally { data.close(); }
  });
});
