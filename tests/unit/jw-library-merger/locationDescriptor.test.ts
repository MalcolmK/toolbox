import { describe, expect, it } from "vitest";
import {
  LOCATION_COMPARISON_FIELDS,
  countLocationDescriptorKeys,
  describeLocation,
} from "../../../src/tools/jw-library-merger/compare/locationDescriptor";

function documentPlace(overrides: Record<string, unknown> = {}) {
  return {
    LocationId: 1,
    Type: 0,
    KeySymbol: "PUB-A",
    MepsLanguage: 1,
    BookNumber: null,
    ChapterNumber: null,
    DocumentId: 1001,
    IssueTagNumber: 0,
    Track: null,
    Specialty: null,
    Edition: null,
    Title: "Display title",
    ...overrides,
  };
}

describe("describeLocation", () => {
  it("recognizes a document place with an omitted language and describes all ten fields", () => {
    const result = describeLocation(documentPlace({ MepsLanguage: null }));

    expect(result.recordForm).toBe("document-place");
    expect(result.description).toEqual({
      Type: 0,
      KeySymbol: "PUB-A",
      MepsLanguage: null,
      BookNumber: null,
      ChapterNumber: null,
      DocumentId: 1001,
      IssueTagNumber: 0,
      Track: null,
      Specialty: null,
      Edition: null,
    });
    expect(Object.keys(result.description!)).toHaveLength(LOCATION_COMPARISON_FIELDS.length);
    expect(result.reason).toBeNull();
  });

  it("uses an ordered JSON array of original values and excludes local ID and title", () => {
    const first = describeLocation(documentPlace({ LocationId: 5, Title: "First title" }));
    const second = describeLocation(documentPlace({ LocationId: 99, Title: "Other title" }));

    expect(first.comparisonKey).toBe(
      JSON.stringify([0, "PUB-A", 1, null, null, 1001, 0, null, null, null]),
    );
    expect(first.comparisonKey).toBe(second.comparisonKey);
  });

  it("keeps a shared local ID from hiding different documents", () => {
    const first = describeLocation(documentPlace({ LocationId: 1, DocumentId: 1001 }));
    const second = describeLocation(documentPlace({ LocationId: 1, DocumentId: 1002 }));

    expect(first.comparisonKey).not.toBe(second.comparisonKey);
  });

  it.each([
    ["Type", 1],
    ["KeySymbol", "PUB-B"],
    ["MepsLanguage", 2],
    ["BookNumber", 0],
    ["ChapterNumber", 0],
    ["DocumentId", 1002],
    ["IssueTagNumber", 1],
    ["Track", 1],
    ["Specialty", "audio"],
    ["Edition", "special"],
  ] as const)("includes %s in the full comparison key", (field, value) => {
    const baseline = describeLocation(documentPlace());
    const changed = describeLocation(documentPlace({ [field]: value }));

    expect(changed.comparisonKey).not.toBe(baseline.comparisonKey);
  });

  it("distinguishes null from zero and null from empty text", () => {
    const nullBook = describeLocation(documentPlace({ BookNumber: null }));
    const zeroBook = describeLocation(documentPlace({ BookNumber: 0 }));
    const nullEdition = describeLocation(documentPlace({ Edition: null }));
    const emptyEdition = describeLocation(documentPlace({ Edition: "" }));

    expect(nullBook.comparisonKey).not.toBe(zeroBook.comparisonKey);
    expect(nullEdition.comparisonKey).not.toBe(emptyEdition.comparisonKey);
  });

  it("recognizes a Bible chapter only when book and chapter are active", () => {
    const result = describeLocation(documentPlace({
      BookNumber: 1,
      ChapterNumber: 3,
      DocumentId: null,
    }));

    expect(result.recordForm).toBe("bible-chapter");
  });

  it("recognizes a Type 1 publication root and retains its schema values", () => {
    const result = describeLocation(documentPlace({
      Type: 1,
      DocumentId: null,
      IssueTagNumber: 5,
    }));

    expect(result.recordForm).toBe("publication-root");
    expect(result.description?.IssueTagNumber).toBe(5);
  });

  it("keeps Type 1 roots limited to the observed null placement fields", () => {
    const result = describeLocation(documentPlace({
      Type: 1,
      BookNumber: 0,
      DocumentId: null,
    }));

    expect(result.recordForm).toBeNull();
    expect(result.reason).toMatch(/niet-ondersteunde/i);
  });

  it("recognizes Type 3 media with track and publication symbol", () => {
    const result = describeLocation(documentPlace({
      Type: 3,
      DocumentId: null,
      IssueTagNumber: 0,
      Track: 2,
    }));

    expect(result.recordForm).toBe("media-track-with-symbol");
  });

  it("recognizes Type 3 media with track and document number but no symbol", () => {
    const result = describeLocation(documentPlace({
      Type: 3,
      KeySymbol: null,
      MepsLanguage: 1,
      DocumentId: 2002,
      IssueTagNumber: 0,
      Track: 2,
    }));

    expect(result.recordForm).toBe("media-track-with-document");
  });

  it("does not treat an empty symbol as a missing symbol for Type 3 media", () => {
    const result = describeLocation(documentPlace({
      Type: 3,
      KeySymbol: "",
      DocumentId: null,
      IssueTagNumber: 0,
      Track: 2,
    }));

    expect(result.recordForm).toBeNull();
    expect(result.reason).toMatch(/niet-ondersteunde/i);
  });

  it("distinguishes edition and specialty values", () => {
    const base = describeLocation(documentPlace());
    const edition = describeLocation(documentPlace({ Edition: "special" }));
    const specialty = describeLocation(documentPlace({ Specialty: "audio" }));

    expect(base.comparisonKey).not.toBe(edition.comparisonKey);
    expect(base.comparisonKey).not.toBe(specialty.comparisonKey);
  });

  it("rejects an unknown type with a concrete reason while retaining its description key", () => {
    const result = describeLocation(documentPlace({ Type: 2 }));

    expect(result.recordForm).toBeNull();
    expect(result.description?.Type).toBe(2);
    expect(result.comparisonKey).not.toBeNull();
    expect(result.reason).toMatch(/niet-ondersteunde.*Type 2/i);
  });

  it("rejects a mixed form without collapsing its field values", () => {
    const result = describeLocation(documentPlace({ BookNumber: 1, ChapterNumber: 1 }));

    expect(result.recordForm).toBeNull();
    expect(result.description?.BookNumber).toBe(1);
    expect(result.reason).toMatch(/niet-ondersteunde/i);
  });

  it("rejects unsafe numeric values and missing required fields", () => {
    const unsafe = describeLocation(documentPlace({ DocumentId: Number.MAX_SAFE_INTEGER + 1 }));
    const missing = documentPlace();
    delete missing.IssueTagNumber;
    const omitted = describeLocation(missing);

    expect(unsafe.description).toBeNull();
    expect(unsafe.reason).toMatch(/DocumentId/);
    expect(omitted.description).toBeNull();
    expect(omitted.reason).toMatch(/IssueTagNumber/);
  });

  it.each([
    ["Type", "0"],
    ["MepsLanguage", 1.5],
    ["BookNumber", Number.POSITIVE_INFINITY],
    ["IssueTagNumber", null],
    ["Track", new Uint8Array([2])],
  ] as const)("blocks an invalid numeric value in %s", (field, value) => {
    const result = describeLocation(documentPlace({ [field]: value }));

    expect(result.description).toBeNull();
    expect(result.comparisonKey).toBeNull();
    expect(result.reason).toContain(field);
  });

  it("does not normalize case, whitespace, or Unicode in key fields", () => {
    const base = describeLocation(documentPlace({ KeySymbol: "PUB-A" }));
    const spaced = describeLocation(documentPlace({ KeySymbol: " PUB-A" }));
    const lower = describeLocation(documentPlace({ KeySymbol: "pub-a" }));
    const composed = describeLocation(documentPlace({ Edition: "é" }));
    const decomposed = describeLocation(documentPlace({ Edition: "e\u0301" }));

    expect(base.comparisonKey).not.toBe(spaced.comparisonKey);
    expect(base.comparisonKey).not.toBe(lower.comparisonKey);
    expect(composed.comparisonKey).not.toBe(decomposed.comparisonKey);
  });

  it("does not present repeated full keys as unique within a source", () => {
    const rows = [documentPlace({ LocationId: 1 }), documentPlace({ LocationId: 2 })];
    const counts = countLocationDescriptorKeys(rows);

    expect(counts.get(describeLocation(rows[0]!).comparisonKey!)).toBe(2);
  });

  it("does not return a key for non-scalar field values", () => {
    const result = describeLocation(documentPlace({ KeySymbol: new Uint8Array([1]) }));

    expect(result.comparisonKey).toBeNull();
    expect(result.reason).toMatch(/KeySymbol/);
  });
});
