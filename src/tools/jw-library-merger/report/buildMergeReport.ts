import type { SqlValue } from "sql.js";
import type {
  ComparedRecord,
  ComparisonStatus,
  LibraryComparison,
} from "../compare/compareLibraries";
import type {
  NormalizedTimestamp,
  TimestampStatus,
  UserDataTimestampSummary,
} from "../compare/normalizeTimestamp";

export interface MergeReportSource {
  readonly label: "Back-up A" | "Back-up B";
  readonly fileName: string;
  readonly schemaVersion: number;
  readonly recordCounts: Readonly<Record<string, number>>;
  readonly timestamps: readonly ReportTimestamp[];
}

export interface ReportTimestamp {
  readonly label: string;
  readonly source: "Back-up A" | "Back-up B";
  readonly recordLabel: string | null;
  readonly status: TimestampStatus;
  readonly originalValue: string | null;
  readonly utcValue: string | null;
  readonly message: string;
}

export interface ReportFieldChange {
  readonly field: string;
  readonly label: string;
  readonly valueA: string;
  readonly valueB: string;
}

export interface ReportRelationship {
  readonly label: string;
  readonly status: "changed" | "uncertain";
  readonly message: string;
}

export interface ReportRecordSide {
  readonly headline: string;
  /** Recognizable record information, excluding database row IDs and GUIDs. */
  readonly details: readonly { readonly label: string; readonly value: string }[];
}

export interface ReportRecord {
  readonly tableLabel: string;
  readonly headline: string;
  readonly status: ComparisonStatus;
  readonly statusLabel: string;
  readonly explanation: string;
  readonly sourceA: ReportRecordSide | null;
  readonly sourceB: ReportRecordSide | null;
  readonly changes: readonly ReportFieldChange[];
  readonly relationships: readonly ReportRelationship[];
  readonly uncertaintyNotes: readonly string[];
  readonly absenceWarning: string | null;
  readonly noteTimestamps: readonly {
    readonly field: "Aangemaakt" | "Laatst gewijzigd";
    readonly valueA: ReportTimestamp | null;
    readonly valueB: ReportTimestamp | null;
  }[];
}

export interface MergeReport {
  readonly title: string;
  readonly introduction: string;
  readonly sources: readonly [MergeReportSource, MergeReportSource];
  readonly summary: {
    readonly equal: number;
    readonly onlyInA: number;
    readonly onlyInB: number;
    readonly changed: number;
    readonly possibleConflicts: number;
    readonly uncertain: number;
    readonly listedDifferences: number;
  };
  /** Only non-equal records are listed; equal counts remain in the summary. */
  readonly records: readonly ReportRecord[];
  /** Includes invalid or absent source-level times and note times. */
  readonly timestampWarnings: readonly ReportTimestamp[];
  readonly limitations: readonly string[];
}

const tableLabels: Readonly<Record<string, string>> = {
  BlockRange: "Markeerbereik",
  Bookmark: "Bladwijzer",
  IndependentMedia: "Mediabestand",
  InputField: "Invoerveld",
  LastModified: "Databasetijd",
  Location: "Publicatie- of mediaplek",
  Note: "Aantekening",
  PlaylistItem: "Afspeellijstitem",
  PlaylistItemAccuracy: "Nauwkeurigheidsinstelling",
  PlaylistItemIndependentMediaMap: "Koppeling met mediabestand",
  PlaylistItemLocationMap: "Koppeling met publicatie- of mediaplek",
  PlaylistItemMarker: "Afspeellijstmarkering",
  PlaylistItemMarkerBibleVerseMap: "Koppeling met Bijbelvers",
  PlaylistItemMarkerParagraphMap: "Koppeling met alinea",
  Tag: "Label",
  TagMap: "Labelkoppeling",
  UserMark: "Markering",
  grdb_migrations: "Databaseschemaregistratie",
};

const fieldLabels: Readonly<Record<string, string>> = {
  Accuracy: "Nauwkeurigheid",
  BlockIdentifier: "Tekstblok",
  BlockType: "Tekstsoort",
  ChapterNumber: "Hoofdstuk",
  ColorIndex: "Kleur",
  Content: "Inhoud",
  Created: "Aangemaakt",
  Description: "Omschrijving",
  DocumentId: "Publicatie-ID",
  EndAction: "Actie aan het einde",
  EndToken: "Eindpositie",
  EndTrimOffsetTicks: "Eindpunt bij afspelen",
  FileName: "Bestandsnaam",
  FilePath: "Bestandslocatie in back-up",
  IssueTagNumber: "Uitgavenummer",
  KeySymbol: "Publicatiecode",
  Label: "Naam",
  LastModified: "Laatst gewijzigd",
  LocationId: "Locatie-ID",
  MepsLanguage: "Taalcode",
  MimeType: "Bestandstype",
  Name: "Naam",
  NoteId: "Aantekening-ID",
  OriginalFileName: "Oorspronkelijke bestandsnaam",
  Position: "Volgorde",
  Slot: "Positie",
  Snippet: "Fragment",
  StartToken: "Beginpositie",
  StartTrimOffsetTicks: "Beginpunt bij afspelen",
  StyleIndex: "Stijl",
  TextTag: "Veldsoort",
  Title: "Titel",
  TrackNumber: "Tracknummer",
  Type: "Soort",
  Value: "Waarde",
  Version: "Versie",
};

const relationshipLabels: Readonly<Record<string, string>> = {
  IndependentMediaId: "Gekoppeld mediabestand",
  LocationId: "Gekoppelde publicatie- of mediaplek",
  NoteId: "Gekoppelde aantekening",
  PlaylistItemId: "Gekoppeld afspeellijstitem",
  PlaylistItemMarkerId: "Gekoppelde afspeellijstmarkering",
  TagId: "Gekoppeld label",
  UserMarkId: "Gekoppelde markering",
};

const sourceDetailFields: Readonly<Record<string, readonly string[]>> = {
  BlockRange: ["BlockType", "Identifier", "StartToken", "EndToken"],
  Bookmark: ["Title", "Snippet", "Slot"],
  IndependentMedia: ["OriginalFileName", "MimeType"],
  InputField: ["TextTag", "Value"],
  Location: ["Title", "KeySymbol", "BookNumber", "ChapterNumber", "TrackNumber", "MepsLanguage", "Type"],
  Note: ["Title", "Content"],
  PlaylistItem: ["Label", "StartTrimOffsetTicks", "EndTrimOffsetTicks", "EndAction"],
  PlaylistItemAccuracy: ["Description"],
  Tag: ["Name", "Type"],
  TagMap: ["Position"],
  UserMark: ["ColorIndex", "StyleIndex", "Version"],
};

function displayValue(value: SqlValue | undefined): string {
  if (value === undefined) return "Niet aanwezig in deze bron";
  if (value === null) return "Leeg";
  if (value instanceof Uint8Array) return `Binair gegeven (${value.byteLength} bytes)`;
  return String(value);
}

function readableField(field: string): string {
  return fieldLabels[field] ?? field.replaceAll(/([a-z])([A-Z])/g, "$1 $2");
}

function humanStatus(status: ComparisonStatus): { label: string; explanation: string } {
  switch (status) {
    case "equal":
      return { label: "Geen verschil gevonden", explanation: "De vergelijkbare gegevens zijn gelijk." };
    case "only-in-a":
      return {
        label: "Komt alleen voor in back-up A",
        explanation: "Dit record is met een betrouwbare sleutel alleen in back-up A gevonden.",
      };
    case "only-in-b":
      return {
        label: "Komt alleen voor in back-up B",
        explanation: "Dit record is met een betrouwbare sleutel alleen in back-up B gevonden.",
      };
    case "changed":
      return {
        label: "Gewijzigd",
        explanation: "Er is een verschil gevonden. Met alleen deze twee back-ups is niet vast te stellen hoe of wanneer de wijziging ontstond.",
      };
    case "possible-conflict":
      return {
        label: "Mogelijk inhoudelijk conflict",
        explanation: "Beide bronnen bevatten verschillende inhoud op een plek waar wijzigingen elkaar kunnen overschrijven. Zonder basisback-up is een conflict niet bewezen.",
      };
    case "uncertain-linked":
      return {
        label: "Koppeling of overeenkomst onzeker",
        explanation: "De gegevens zijn zichtbaar, maar er is geen voldoende betrouwbare sleutel om ze automatisch als hetzelfde record te behandelen.",
      };
  }
}

function recordHeadline(record: ComparedRecord): string {
  const row = record.sourceA?.row ?? record.sourceB?.row;
  if (!row) return tableLabels[record.tableName] ?? record.tableName;
  const value = record.tableName === "Tag"
    ? row.Name
    : record.tableName === "InputField"
    ? row.TextTag
    : record.tableName === "IndependentMedia"
    ? row.OriginalFileName
    : row.Title ?? row.Label ?? row.Description ?? row.KeySymbol;
  return typeof value === "string" && value.length > 0
    ? `${tableLabels[record.tableName] ?? record.tableName}: ${value}`
    : tableLabels[record.tableName] ?? record.tableName;
}

function sourceSide(record: ComparedRecord, side: "A" | "B"): ReportRecordSide | null {
  const source = side === "A" ? record.sourceA : record.sourceB;
  if (!source) return null;
  const row = source.row;
  const fields = sourceDetailFields[record.tableName] ?? [];
  return {
    headline: recordHeadline(record),
    details: fields
      .filter((field) => row[field] !== null && row[field] !== undefined)
      .map((field) => ({ label: readableField(field), value: displayValue(row[field]) })),
  };
}

function timestampMessage(timestamp: NormalizedTimestamp): string {
  if (timestamp.status === "valid") return `Bekend tijdstip: ${timestamp.utc}.`;
  if (timestamp.status === "missing") return "Geen tijdstip opgeslagen; ouder of nieuwer kan hieruit niet worden afgeleid.";
  return "Tijdstip ontbreekt of heeft een onbekend formaat; ouder of nieuwer kan hieruit niet worden afgeleid.";
}

function sourceTimestamps(
  source: "Back-up A" | "Back-up B",
  summary: UserDataTimestampSummary,
): ReportTimestamp[] {
  return [
    { label: "Back-up aangemaakt", timestamp: summary.archiveCreatedAt },
    { label: "Database volgens manifest gewijzigd", timestamp: summary.manifestDatabaseLastModified },
    { label: "Database volgens LastModified-tabel gewijzigd", timestamp: summary.databaseLastModified },
  ].map(({ label, timestamp }) => ({
    label,
    source,
    recordLabel: null,
    status: timestamp.status,
    originalValue: timestamp.sourceText,
    utcValue: timestamp.utc,
    message: timestampMessage(timestamp),
  }));
}

function noteTime(
  record: ComparedRecord,
  side: "A" | "B",
  field: "Created" | "LastModified",
  sourceLabel: "Back-up A" | "Back-up B",
  sourceTimes: UserDataTimestampSummary,
): ReportTimestamp | null {
  const sourceRecord = side === "A" ? record.sourceA : record.sourceB;
  if (!sourceRecord) return null;
  const guid = sourceRecord.row.Guid;
  if (typeof guid !== "string") return null;
  const normalized = sourceTimes.notes.find((item) => item.guid === guid);
  const timestamp = field === "Created" ? normalized?.created : normalized?.lastModified;
  if (!timestamp) return null;
  return {
    label: field === "Created" ? "Aantekening aangemaakt" : "Aantekening laatst gewijzigd",
    source: sourceLabel,
    recordLabel: recordHeadline(record),
    status: timestamp.status,
    originalValue: timestamp.sourceText,
    utcValue: timestamp.utc,
    message: timestampMessage(timestamp),
  };
}

function reportRecord(comparison: LibraryComparison, record: ComparedRecord): ReportRecord {
  const status = humanStatus(record.status);
  const label = tableLabels[record.tableName] ?? record.tableName;
  const absenceWarning = record.absenceInterpretation === "unknown"
    ? "Alleen-aanwezig betekent niet dat iemand dit bewust heeft verwijderd. Met twee back-ups zonder basis is verwijdering niet vast te stellen."
    : null;
  const noteTimestamps = record.tableName === "Note"
    ? (["Created", "LastModified"] as const).map((field) => ({
      field: field === "Created" ? "Aangemaakt" as const : "Laatst gewijzigd" as const,
      valueA: noteTime(record, "A", field, "Back-up A", comparison.sourceA.timestamps),
      valueB: noteTime(record, "B", field, "Back-up B", comparison.sourceB.timestamps),
    }))
    : [];

  return {
    tableLabel: label,
    headline: recordHeadline(record),
    status: record.status,
    statusLabel: status.label,
    explanation: status.explanation,
    sourceA: sourceSide(record, "A"),
    sourceB: sourceSide(record, "B"),
    changes: record.fieldDifferences.map((difference) => ({
      field: difference.field,
      label: readableField(difference.field),
      valueA: displayValue(difference.valueA),
      valueB: displayValue(difference.valueB),
    })),
    relationships: record.relationshipDifferences.map((difference) => ({
      label: relationshipLabels[difference.field]
        ?? `${readableField(difference.field)} → ${tableLabels[difference.targetTable] ?? difference.targetTable}`,
      status: difference.status === "same" ? "uncertain" : difference.status,
      message: difference.reason ?? (difference.status === "changed"
        ? "De gekoppelde publicatie, aantekening, markering of ander record verschilt tussen de bronnen."
        : "De koppeling kon niet betrouwbaar worden bevestigd."),
    })),
    uncertaintyNotes: record.uncertaintyReasons,
    absenceWarning,
    noteTimestamps,
  };
}

function timestampWarnings(
  comparison: LibraryComparison,
): ReportTimestamp[] {
  const warnings: ReportTimestamp[] = [];
  for (const [source, summary] of [
    ["Back-up A", comparison.sourceA.timestamps],
    ["Back-up B", comparison.sourceB.timestamps],
  ] as const) {
    warnings.push(...sourceTimestamps(source, summary).filter((item) => item.status !== "valid"));
    for (const note of summary.notes) {
      for (const [label, timestamp] of [
        ["Aantekening aangemaakt", note.created],
        ["Aantekening laatst gewijzigd", note.lastModified],
      ] as const) {
        if (timestamp.status === "valid") continue;
        const matchingRecord = note.guid
          ? comparison.records.find((record) => record.tableName === "Note"
            && (record.sourceA?.row.Guid === note.guid || record.sourceB?.row.Guid === note.guid))
          : undefined;
        const noteTitle = matchingRecord?.sourceA?.row.Title ?? matchingRecord?.sourceB?.row.Title;
        const recordLabel = typeof noteTitle === "string" && noteTitle.length > 0
          ? `Aantekening: ${noteTitle}`
          : "Aantekening zonder herkenbare titel";
        warnings.push({
          label,
          source,
          recordLabel,
          status: timestamp.status,
          originalValue: timestamp.sourceText,
          utcValue: timestamp.utc,
          message: timestampMessage(timestamp),
        });
      }
    }
  }
  return warnings;
}

/** Convert comparison results into a Dutch, presentation-ready difference report. */
export function buildMergeReport(comparison: LibraryComparison): MergeReport {
  const counts = comparison.summary.countsByStatus;
  const records = comparison.records
    .filter((record) => record.status !== "equal")
    .map((record) => reportRecord(comparison, record));

  return {
    title: "Verschillen tussen JW Library-back-ups",
    introduction: "Dit rapport beschrijft verschillen tussen twee bronnen. Het bepaalt niet welke back-up nieuwer is en voert geen samenvoeging uit.",
    sources: [
      {
        label: "Back-up A",
        fileName: comparison.sourceA.fileName,
        schemaVersion: comparison.sourceA.schemaVersion,
        recordCounts: comparison.sourceA.recordCounts,
        timestamps: sourceTimestamps("Back-up A", comparison.sourceA.timestamps),
      },
      {
        label: "Back-up B",
        fileName: comparison.sourceB.fileName,
        schemaVersion: comparison.sourceB.schemaVersion,
        recordCounts: comparison.sourceB.recordCounts,
        timestamps: sourceTimestamps("Back-up B", comparison.sourceB.timestamps),
      },
    ],
    summary: {
      equal: counts.equal,
      onlyInA: counts["only-in-a"],
      onlyInB: counts["only-in-b"],
      changed: counts.changed,
      possibleConflicts: counts["possible-conflict"],
      uncertain: counts["uncertain-linked"],
      listedDifferences: records.length,
    },
    records,
    timestampWarnings: timestampWarnings(comparison),
    limitations: [
      "Back-up A en B zijn bronlabels. Het rapport neemt niet aan welke bron nieuwer is.",
      "Een record dat alleen in één bron voorkomt, kan een verwijdering weerspiegelen, maar dat is zonder basisback-up niet bewezen.",
      "Mogelijk conflict betekent dat inhoud verschilt op een gevoelig veld; met twee bronnen is niet vast te stellen of beide kanten sinds een gezamenlijke basis zijn gewijzigd.",
      "Onzekere identiteiten en koppelingen worden expliciet gemeld. Bron-lokale database-ID's worden niet getoond als cross-back-up-identiteit.",
      "Ontbrekende of ongeldige tijdstempels geven geen betrouwbare aanwijzing voor de ouderdom van informatie.",
    ],
  };
}
