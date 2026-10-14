export type TextGranularity = "block" | "line";

export interface TextMergeSegment {
  readonly id: string;
  readonly kind: "unchanged" | "automatic" | "conflict";
  readonly baseText: string;
  readonly textA: string;
  readonly textB: string;
  readonly source: "A" | "B" | "both" | "base" | null;
}

export interface TextMergePlan {
  readonly granularity: TextGranularity;
  readonly segments: readonly TextMergeSegment[];
  readonly fellBackToWholeText: boolean;
  readonly warning: string | null;
}

const maxLcsCells = 1_000_000;

/** Preserve both candidate fragments only when existing line breaks keep them visibly distinct. */
export function canKeepBothTextFragments(textA: string, textB: string): boolean {
  const hasBoundary = textA.endsWith("\n") || textA.endsWith("\r") || textB.startsWith("\n") || textB.startsWith("\r");
  return textA.length > 0 && textB.length > 0 && hasBoundary;
}

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly replacement: readonly string[];
  readonly side: "A" | "B";
}

function splitLines(text: string): string[] {
  const lines = text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [];
  return lines.filter((line) => line.length > 0);
}

function splitBlocks(text: string): string[] {
  const lines = splitLines(text);
  const blocks: string[] = [];
  let current = "";
  let currentIsSeparator: boolean | null = null;
  for (const line of lines) {
    const isSeparator = /^(?:\r\n|\n|\r)+$/.test(line);
    if (current && currentIsSeparator !== isSeparator) {
      blocks.push(current);
      current = "";
    }
    current += line;
    currentIsSeparator = isSeparator;
  }
  if (current) blocks.push(current);
  return blocks;
}

function tokenize(text: string, granularity: TextGranularity): string[] {
  return granularity === "line" ? splitLines(text) : splitBlocks(text);
}

function buildEdits(base: readonly string[], changed: readonly string[], side: "A" | "B"): Edit[] | null {
  const rows = base.length + 1;
  const columns = changed.length + 1;
  const cells = rows * columns;
  if (cells > maxLcsCells) return null;
  const lcs = new Uint32Array(cells);
  for (let i = base.length - 1; i >= 0; i -= 1) {
    for (let j = changed.length - 1; j >= 0; j -= 1) {
      const at = i * columns + j;
      lcs[at] = base[i] === changed[j]
        ? 1 + lcs[(i + 1) * columns + j + 1]!
        : Math.max(lcs[(i + 1) * columns + j]!, lcs[at + 1]!);
    }
  }

  const edits: Edit[] = [];
  let i = 0;
  let j = 0;
  while (i < base.length || j < changed.length) {
    if (i < base.length && j < changed.length && base[i] === changed[j]) {
      i += 1;
      j += 1;
      continue;
    }
    const start = i;
    const replacement: string[] = [];
    while (i < base.length || j < changed.length) {
      if (i < base.length && j < changed.length && base[i] === changed[j]) break;
      if (i < base.length && (j >= changed.length || lcs[(i + 1) * columns + j]! >= lcs[i * columns + j + 1]!)) i += 1;
      else if (j < changed.length) replacement.push(changed[j++]!);
    }
    edits.push({ start, end: i, replacement, side });
  }
  return edits;
}

function sameEdit(a: Edit, b: Edit): boolean {
  return a.start === b.start && a.end === b.end && a.replacement.join("") === b.replacement.join("");
}

function editsOverlap(a: Edit, b: Edit): boolean {
  if (a.start === a.end && b.start === b.end) return a.start === b.start;
  if (a.start === a.end) return a.start >= b.start && a.start <= b.end;
  if (b.start === b.end) return b.start >= a.start && b.start <= a.end;
  return Math.max(a.start, b.start) < Math.min(a.end, b.end);
}

function applySlice(base: readonly string[], start: number, end: number, edits: readonly Edit[]): string {
  const ordered = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  let output = "";
  let cursor = start;
  for (const edit of ordered) {
    if (edit.start < cursor && edit.start !== edit.end) continue;
    output += base.slice(cursor, edit.start).join("") + edit.replacement.join("");
    cursor = Math.max(cursor, edit.end);
  }
  return output + base.slice(cursor, end).join("");
}

function fallbackPlan(baseText: string, textA: string, textB: string, granularity: TextGranularity): TextMergePlan {
  return {
    granularity,
    fellBackToWholeText: true,
    warning: "De tekst is te groot voor een betrouwbare automatische blokvergelijking. De volledige aantekening wordt als één conflict getoond.",
    segments: [{ id: "whole-text", kind: "conflict", baseText, textA, textB, source: null }],
  };
}

/** Build an exact-text three-way plan; this function never normalizes line endings or Unicode. */
export function mergeNoteText(baseText: string, textA: string, textB: string, granularity: TextGranularity = "block"): TextMergePlan {
  const base = tokenize(baseText, granularity);
  const a = tokenize(textA, granularity);
  const b = tokenize(textB, granularity);
  const editsA = buildEdits(base, a, "A");
  const editsB = buildEdits(base, b, "B");
  if (!editsA || !editsB) return fallbackPlan(baseText, textA, textB, granularity);

  const all = [...editsA, ...editsB];
  const removed = new Set<Edit>();
  const shared = new Set<Edit>();
  for (const editA of editsA) {
    const duplicate = editsB.find((editB) => sameEdit(editA, editB));
    if (duplicate) { removed.add(duplicate); shared.add(editA); }
  }
  const unique = all.filter((edit) => !removed.has(edit));
  const parent = unique.map((_, index) => index);
  const root = (index: number): number => parent[index] === index ? index : (parent[index] = root(parent[index]!));
  const join = (left: number, right: number) => { parent[root(left)] = root(right); };
  for (let left = 0; left < unique.length; left += 1) {
    for (let right = left + 1; right < unique.length; right += 1) {
      if (unique[left]!.side !== unique[right]!.side && editsOverlap(unique[left]!, unique[right]!)) join(left, right);
    }
  }

  const groups = new Map<number, Edit[]>();
  unique.forEach((edit, index) => {
    const group = groups.get(root(index)) ?? [];
    group.push(edit);
    groups.set(root(index), group);
  });
  const hunks = [...groups.values()].map((edits, index) => {
    const start = Math.min(...edits.map((edit) => edit.start));
    const end = Math.max(...edits.map((edit) => edit.end));
    const aEdits = edits.filter((edit) => edit.side === "A");
    const bEdits = edits.filter((edit) => edit.side === "B");
    const textAForHunk = aEdits.length ? applySlice(base, start, end, aEdits) : applySlice(base, start, end, edits);
    const textBForHunk = bEdits.length ? applySlice(base, start, end, bEdits) : applySlice(base, start, end, edits);
    return {
      id: `${start}:${end}:${index}`, start, end, edits, textA: textAForHunk, textB: textBForHunk,
      conflict: aEdits.length > 0 && bEdits.length > 0,
      source: edits.some((edit) => shared.has(edit)) ? "both" as const : edits[0]!.side,
    };
  }).sort((left, right) => left.start - right.start || left.end - right.end);

  const segments: TextMergeSegment[] = [];
  let cursor = 0;
  hunks.forEach((hunk) => {
    if (hunk.start < cursor) return;
    if (hunk.start > cursor) {
      const unchanged = base.slice(cursor, hunk.start).join("");
      segments.push({ id: `base:${cursor}`, kind: "unchanged", baseText: unchanged, textA: unchanged, textB: unchanged, source: "base" });
    }
    const baseHunk = base.slice(hunk.start, hunk.end).join("");
    segments.push({
      id: hunk.id,
      kind: hunk.conflict ? "conflict" : "automatic",
      baseText: baseHunk,
      textA: hunk.textA,
      textB: hunk.textB,
      source: hunk.conflict ? null : hunk.source,
    });
    cursor = Math.max(cursor, hunk.end);
  });
  if (cursor < base.length) {
    const unchanged = base.slice(cursor).join("");
    segments.push({ id: `base:${cursor}`, kind: "unchanged", baseText: unchanged, textA: unchanged, textB: unchanged, source: "base" });
  }
  if (segments.length === 0) {
    segments.push({ id: "same", kind: "unchanged", baseText, textA: baseText, textB: baseText, source: "base" });
  }
  return { granularity, segments, fellBackToWholeText: false, warning: null };
}
