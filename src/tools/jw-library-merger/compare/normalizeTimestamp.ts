import type { UserDataSnapshot } from "../database/readUserData";

export type TimestampStatus = "valid" | "missing" | "invalid";

export interface NormalizedTimestamp {
  /** Exact original input text, retained for reports and provenance. */
  readonly sourceText: string | null;
  readonly status: TimestampStatus;
  /** Comparable UTC instant in milliseconds, or null when the time is unknown. */
  readonly epochMilliseconds: number | null;
  /** Canonical UTC representation for display, or null when unknown. */
  readonly utc: string | null;
}

export interface NormalizedNoteTimestamps {
  readonly guid: string | null;
  readonly rowIndex: number;
  readonly created: NormalizedTimestamp;
  readonly lastModified: NormalizedTimestamp;
}

export interface UserDataTimestampSummary {
  readonly archiveCreatedAt: NormalizedTimestamp;
  readonly manifestDatabaseLastModified: NormalizedTimestamp;
  readonly databaseLastModified: NormalizedTimestamp;
  readonly notes: readonly NormalizedNoteTimestamps[];
}

const timestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/i;

function result(
  sourceText: string | null,
  status: TimestampStatus,
  epochMilliseconds: number | null = null,
): NormalizedTimestamp {
  return {
    sourceText,
    status,
    epochMilliseconds,
    utc: epochMilliseconds === null
      ? null
      : new Date(epochMilliseconds).toISOString(),
  };
}

/**
 * Parses a timestamp with an explicit UTC marker or numeric timezone offset.
 * Naive/local times are deliberately not guessed. Original input is retained.
 */
export function normalizeTimestamp(value: unknown): NormalizedTimestamp {
  if (value === null || value === undefined) {
    return result(null, "missing");
  }
  if (typeof value !== "string") {
    return result(null, "invalid");
  }
  if (value.trim().length === 0) {
    return result(value, "missing");
  }

  const match = value.match(timestampPattern);
  if (!match) {
    return result(value, "invalid");
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zoneText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  // Date.parse alone can normalize out-of-range calendar dates such as Feb 30.
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, 0);
  if (
    calendar.getUTCFullYear() !== year
    || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day
    || hour > 23
    || minute > 59
    || second > 59
  ) {
    return result(value, "invalid");
  }

  const normalizedZone = zoneText.toUpperCase() === "Z"
    ? "Z"
    : `${zoneText.slice(0, 3)}:${zoneText.slice(-2)}`;
  const parseable = `${value.slice(0, -zoneText.length)}${normalizedZone}`;
  const epochMilliseconds = Date.parse(parseable);
  if (!Number.isFinite(epochMilliseconds)) {
    return result(value, "invalid");
  }

  return result(value, "valid", epochMilliseconds);
}

/** Normalize all known time fields without replacing any raw snapshot values. */
export function normalizeUserDataTimestamps(
  snapshot: UserDataSnapshot,
): UserDataTimestampSummary {
  const noteRows = snapshot.tables.Note?.rows ?? [];
  const databaseLastModified = snapshot.modificationTimes.databaseLastModifiedValues;

  return {
    archiveCreatedAt: normalizeTimestamp(snapshot.modificationTimes.archiveCreatedAt),
    manifestDatabaseLastModified: normalizeTimestamp(
      snapshot.modificationTimes.manifestDatabaseLastModified,
    ),
    databaseLastModified: databaseLastModified.length === 1
      ? normalizeTimestamp(databaseLastModified[0])
      : normalizeTimestamp(databaseLastModified.length === 0 ? null : databaseLastModified),
    notes: noteRows.map((row, rowIndex) => ({
      guid: typeof row.Guid === "string" ? row.Guid : null,
      rowIndex,
      created: normalizeTimestamp(row.Created),
      lastModified: normalizeTimestamp(row.LastModified),
    })),
  };
}
