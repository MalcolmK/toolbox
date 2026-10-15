/** The ten content fields used to describe a schema-version-16 Location. */
export const LOCATION_COMPARISON_FIELDS = [
  "Type",
  "KeySymbol",
  "MepsLanguage",
  "BookNumber",
  "ChapterNumber",
  "DocumentId",
  "IssueTagNumber",
  "Track",
  "Specialty",
  "Edition",
] as const;

export type LocationRecordForm =
  | "document-place"
  | "bible-chapter"
  | "publication-root"
  | "media-track-with-symbol"
  | "media-track-with-document";

export interface LocationDescription {
  readonly Type: number;
  readonly KeySymbol: string | null;
  readonly MepsLanguage: number | null;
  readonly BookNumber: number | null;
  readonly ChapterNumber: number | null;
  readonly DocumentId: number | null;
  readonly IssueTagNumber: number;
  readonly Track: number | null;
  readonly Specialty: string | null;
  readonly Edition: string | null;
}

export interface LocationDescriptor {
  /** Null means that the ten fields are valid but the record form is unsupported. */
  readonly recordForm: LocationRecordForm | null;
  /** All ten comparison fields, with their original scalar values. */
  readonly description: LocationDescription | null;
  /** JSON array key in LOCATION_COMPARISON_FIELDS order; never confirms identity. */
  readonly comparisonKey: string | null;
  /** A concrete explanation for missing/invalid fields or an unsupported form. */
  readonly reason: string | null;
}

const numericFields = [
  "Type",
  "MepsLanguage",
  "BookNumber",
  "ChapterNumber",
  "DocumentId",
  "IssueTagNumber",
  "Track",
] as const;

const textFields = ["KeySymbol", "Specialty", "Edition"] as const;
const allFields = [...numericFields, ...textFields] as const;

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isNullableSafeInteger(value: unknown): value is number | null {
  return value === null || isSafeInteger(value);
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isActive(value: number | null): boolean {
  return value !== null && value !== 0;
}

function classify(description: LocationDescription): LocationRecordForm | null {
  const noActiveBookChapter = !isActive(description.BookNumber)
    && !isActive(description.ChapterNumber);
  const noActiveDocument = !isActive(description.DocumentId);
  const noActiveTrack = !isActive(description.Track);
  const hasSymbol = typeof description.KeySymbol === "string"
    && description.KeySymbol.length > 0;
  const hasDocument = isActive(description.DocumentId);
  const hasTrack = isActive(description.Track);

  if (description.Type === 0) {
    if (hasDocument && noActiveBookChapter && noActiveTrack) return "document-place";
    if (isActive(description.BookNumber)
      && isActive(description.ChapterNumber)
      && noActiveDocument
      && noActiveTrack) {
      return "bible-chapter";
    }
    return null;
  }

  if (description.Type === 1) {
    if (description.BookNumber === null
      && description.ChapterNumber === null
      && description.DocumentId === null
      && description.Track === null
      && description.MepsLanguage !== null
      && description.Specialty === null
      && description.Edition === null
      && hasSymbol) {
      return "publication-root";
    }
    return null;
  }

  if (description.Type === 3) {
    if (!hasTrack
      || description.BookNumber !== null
      || description.ChapterNumber !== null
      || description.MepsLanguage === null
      || description.Specialty !== null
      || description.Edition !== null) return null;
    if (hasSymbol && !hasDocument) return "media-track-with-symbol";
    if (description.KeySymbol === null && hasDocument) return "media-track-with-document";
    return null;
  }

  return null;
}

/**
 * Describe one Location row without normalizing content or asserting that two
 * rows from different backups are the same place.
 */
export function describeLocation(row: Readonly<Record<string, unknown>>): LocationDescriptor {
  const missing = allFields.filter((field) => !Object.hasOwn(row, field));
  if (missing.length > 0) {
    return {
      recordForm: null,
      description: null,
      comparisonKey: null,
      reason: `Ontbrekende Location-velden: ${missing.join(", ")}.`,
    };
  }

  const invalidNumeric = numericFields.filter((field) => {
    const value = row[field];
    if (field === "Type" || field === "IssueTagNumber") return !isSafeInteger(value);
    return !isNullableSafeInteger(value);
  });
  const invalidText = textFields.filter((field) => !isNullableText(row[field]));
  if (invalidNumeric.length > 0 || invalidText.length > 0) {
    const invalid = [...invalidNumeric, ...invalidText];
    return {
      recordForm: null,
      description: null,
      comparisonKey: null,
      reason: `Location-velden hebben een ongeldig type of geen veilig geheel getal: ${invalid.join(", ")}.`,
    };
  }

  // Validation above makes this conversion exact; no values are coerced.
  const description: LocationDescription = {
    Type: row.Type as number,
    KeySymbol: row.KeySymbol as string | null,
    MepsLanguage: row.MepsLanguage as number | null,
    BookNumber: row.BookNumber as number | null,
    ChapterNumber: row.ChapterNumber as number | null,
    DocumentId: row.DocumentId as number | null,
    IssueTagNumber: row.IssueTagNumber as number,
    Track: row.Track as number | null,
    Specialty: row.Specialty as string | null,
    Edition: row.Edition as string | null,
  };
  const comparisonKey = JSON.stringify(
    LOCATION_COMPARISON_FIELDS.map((field) => description[field]),
  );
  const recordForm = classify(description);

  return {
    recordForm,
    description,
    comparisonKey,
    reason: recordForm === null
      ? `Niet-ondersteunde Location-vorm voor Type ${description.Type}.`
      : null,
  };
}

/**
 * Count supported full keys within one source. Call separately for backup A
 * and backup B; a count other than one cannot form an unambiguous proposal.
 */
export function countLocationDescriptorKeys(
  rows: readonly Readonly<Record<string, unknown>>[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const descriptor = describeLocation(row);
    if (descriptor.recordForm === null || descriptor.comparisonKey === null) continue;
    counts.set(descriptor.comparisonKey, (counts.get(descriptor.comparisonKey) ?? 0) + 1);
  }
  return counts;
}
