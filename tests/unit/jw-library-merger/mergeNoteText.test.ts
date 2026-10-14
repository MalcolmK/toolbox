import { describe, expect, it } from "vitest";
import { canKeepBothTextFragments, mergeNoteText } from "../../../src/tools/jw-library-merger/compare/mergeNoteText";

describe("mergeNoteText", () => {
  it("automatically preserves independent paragraph additions and original characters", () => {
    const base = "Voorwoord.\r\n\r\nSlot.\r\n";
    const plan = mergeNoteText(base, "Voorwoord.\r\n\r\nExtra van A. ☀️\r\n\r\nSlot.\r\n", "Voorwoord.\r\n\r\nSlot.\r\n\r\nExtra van B. é\r\n");
    const conflicts = plan.segments.filter((segment) => segment.kind === "conflict");
    const automatic = plan.segments.filter((segment) => segment.kind === "automatic");

    expect(conflicts).toHaveLength(0);
    expect(automatic.map((segment) => segment.textA || segment.textB).join("")).toContain("Extra van A. ☀️");
    expect(automatic.map((segment) => segment.textA || segment.textB).join("")).toContain("Extra van B. é");
    expect(plan.segments.map((segment) => segment.baseText).join("")).toBe(base);
  });

  it("isolates an overlapping paragraph as a conflict while retaining independent edits", () => {
    const base = "Start.\n\nOude alinea.\n\nSlot.\n";
    const plan = mergeNoteText(base, "Start.\n\nTekst van A.\n\nSlot.\n\nExtra A.\n", "Start.\n\nTekst van B.\n\nSlot.\n");
    const conflict = plan.segments.find((segment) => segment.kind === "conflict");
    const automatic = plan.segments.filter((segment) => segment.kind === "automatic");

    expect(conflict).toMatchObject({ baseText: "Oude alinea.\n", textA: "Tekst van A.\n", textB: "Tekst van B.\n" });
    expect(automatic.some((segment) => segment.textA.includes("Extra A.\n"))).toBe(true);
  });

  it("splits changed blocks into line choices when finer granularity is requested", () => {
    const base = "Eerste regel.\nTweede regel.\n";
    const plan = mergeNoteText(base, "Eerste regel A.\nTweede regel.\n", "Eerste regel B.\nTweede regel.\n", "line");
    const conflict = plan.segments.find((segment) => segment.kind === "conflict");

    expect(conflict).toMatchObject({ baseText: "Eerste regel.\n", textA: "Eerste regel A.\n", textB: "Eerste regel B.\n" });
    expect(plan.segments.map((segment) => segment.baseText).join("")).toBe(base);
  });

  it("treats same-position insertions as a choice and identical changes as shared", () => {
    const base = "begin\neinde\n";
    const conflict = mergeNoteText(base, "begin\nA\neinde\n", "begin\nB\neinde\n");
    const same = mergeNoteText(base, "begin\nbeide\neinde\n", "begin\nbeide\neinde\n");

    expect(conflict.segments.some((segment) => segment.kind === "conflict")).toBe(true);
    expect(same.segments.some((segment) => segment.kind === "conflict")).toBe(false);
    expect(same.segments.filter((segment) => segment.kind === "automatic")).toHaveLength(1);
  });

  it("does not normalize CRLF, Unicode, or a missing final newline", () => {
    const base = "☀️ oude\r\nlaatste";
    const plan = mergeNoteText(base, "☀️ A\r\nlaatste", "☀️ oude\r\nlaatste B", "line");

    expect(plan.segments.map((segment) => segment.baseText).join("")).toBe(base);
    expect(plan.segments.map((segment) => segment.kind === "unchanged" ? segment.baseText : segment.textA).join("")).toBe("☀️ A\r\nlaatste B");
  });

  it("offers both fragments only when an existing line break can keep them distinct", () => {
    expect(canKeepBothTextFragments("A\n", "B")).toBe(true);
    expect(canKeepBothTextFragments("A", "\r\nB")).toBe(true);
    expect(canKeepBothTextFragments("A", "B")).toBe(false);
    expect(canKeepBothTextFragments("", "B\n")).toBe(false);
  });
});
