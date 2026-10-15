import type { SqlValue } from "sql.js";
import type { UserDataRow, UserDataSnapshot } from "../database/readUserData";
import { compareLibraries, type ComparedRecord, type ComparisonStatus } from "../compare/compareLibraries";
import { normalizeTimestamp, type NormalizedTimestamp } from "../compare/normalizeTimestamp";

export type MergeSource = "A" | "B";
export type MergeConfidence = "identical" | "record-timestamp" | "database-timestamp" | "manifest-timestamp" | "manual-choice" | "unresolved";

export interface MergeRowCandidate {
  readonly source: MergeSource;
  readonly fileName: string;
  /** Still source-local; Step 22 must remap these keys and foreign keys. */
  readonly localKey: string | null;
  readonly row: UserDataRow;
  /** Fields copied from a different source than the selected row, such as Note.Created. */
  readonly fieldSources?: Readonly<Record<string, MergeSource>>;
}

export interface SimpleMergeRecord {
  readonly tableName: string;
  readonly identityKey: string | null;
  readonly identityStatus: ComparedRecord["identityStatus"];
  readonly comparisonStatus: ComparisonStatus;
  readonly action: "keep-one" | "omit" | "keep-both-pending-review" | "needs-review";
  readonly selected: MergeRowCandidate | null;
  readonly retainedAlternatives: readonly MergeRowCandidate[];
  readonly confidence: MergeConfidence;
  readonly rule: string;
}

export interface SimpleMergeChoice {
  readonly tableName: string;
  readonly identityKey: string | null;
  readonly selectedSource: MergeSource | null;
  readonly confidence: MergeConfidence;
  readonly reason: string;
}

export interface SimpleMergeInformationLoss {
  readonly kind: "field" | "relationship";
  readonly tableName: string;
  readonly identityKey: string | null;
  readonly field: string;
  readonly valueNotRetained: SqlValue | undefined;
  readonly omittedFrom: MergeSource;
  readonly retainedValue: SqlValue | undefined;
  readonly retainedFrom: MergeSource | null;
  readonly reason: string;
  readonly relationshipTargetTable?: string;
  readonly relationshipIdentityNotRetained?: string | null;
  readonly relationshipIdentityRetained?: string | null;
}

export interface SimpleMergeReport {
  readonly sourceA: { readonly fileName: string; readonly databaseTimestamp: NormalizedTimestamp; readonly manifestTimestamp: NormalizedTimestamp };
  readonly sourceB: { readonly fileName: string; readonly databaseTimestamp: NormalizedTimestamp; readonly manifestTimestamp: NormalizedTimestamp };
  readonly choices: readonly SimpleMergeChoice[];
  readonly informationLoss: readonly SimpleMergeInformationLoss[];
  readonly warnings: readonly string[];
  readonly unresolved: readonly {
    readonly tableName: string;
    readonly identityKey: string | null;
    readonly reason: string;
    readonly sourceA: MergeRowCandidate | null;
    readonly sourceB: MergeRowCandidate | null;
  }[];
}

export interface SimpleMergeResult {
  /** `ready` means record-level choices are resolved, not that an archive has been built. */
  readonly status: "ready" | "needs-review";
  readonly records: readonly SimpleMergeRecord[];
  readonly report: SimpleMergeReport;
}

interface SourceRecency {
  readonly source: MergeSource | null;
  readonly confidence: "database-timestamp" | "manifest-timestamp" | "unresolved";
  readonly reason: string;
  readonly warnings: readonly string[];
}

interface SnapshotPair {
  readonly A: UserDataSnapshot;
  readonly B: UserDataSnapshot;
}

const tableLabels: Readonly<Record<string, string>> = {
  BlockRange: "markeerbereik",
  Bookmark: "bladwijzer",
  IndependentMedia: "mediabestand",
  InputField: "invoerveld",
  LastModified: "databasetijd",
  Location: "publicatie- of mediaplek",
  Note: "aantekening",
  PlaylistItem: "afspeellijstitem",
  PlaylistItemAccuracy: "nauwkeurigheidsinstelling",
  Tag: "label",
  TagMap: "labelkoppeling",
  UserMark: "markering",
};

function readableUncertainty(record: ComparedRecord): string {
  const raw = record.uncertaintyReasons;
  const translated = raw.map((reason) => {
    if (/^(Uses|Declared|Depends|No cross-backup|Logical|Unique)/i.test(reason)) {
      return `De voorlopige sleutel voor dit ${tableLabels[record.tableName] ?? "record"} is niet voldoende bevestigd voor automatisch samenvoegen.`;
    }
    return reason.replaceAll(/\b(BlockRange|Bookmark|IndependentMedia|InputField|LastModified|Location|Note|PlaylistItem|TagMap|Tag|UserMark)\b/g,
      (name) => tableLabels[name] ?? name);
  });
  return translated.join(" ")
    || `De identiteit of koppeling van dit ${tableLabels[record.tableName] ?? "record"} kan niet veilig worden bevestigd.`;
}

function normalizedNoteTimestamp(row: UserDataRow): NormalizedTimestamp {
  return normalizeTimestamp(row.LastModified);
}

function sourceRecency(pair: SnapshotPair): SourceRecency {
  const databaseA = normalizeTimestamp(pair.A.modificationTimes.databaseLastModified);
  const databaseB = normalizeTimestamp(pair.B.modificationTimes.databaseLastModified);
  const manifestA = normalizeTimestamp(pair.A.modificationTimes.manifestDatabaseLastModified);
  const manifestB = normalizeTimestamp(pair.B.modificationTimes.manifestDatabaseLastModified);
  const warnings: string[] = [];

  if (databaseA.status === "valid" && databaseB.status === "valid") {
    const databaseWinner = databaseA.epochMilliseconds === databaseB.epochMilliseconds
      ? null
      : databaseA.epochMilliseconds! > databaseB.epochMilliseconds! ? "A" : "B";
    if (manifestA.status === "valid" && manifestB.status === "valid") {
      const manifestWinner = manifestA.epochMilliseconds === manifestB.epochMilliseconds
        ? null
        : manifestA.epochMilliseconds! > manifestB.epochMilliseconds! ? "A" : "B";
      if (databaseWinner !== manifestWinner) {
        warnings.push("De databasetijd en manifesttijd geven geen eensluidende volgorde; de databasetijd is gebruikt.");
      }
    }
    if (databaseWinner) {
      return {
        source: databaseWinner,
        confidence: "database-timestamp",
        reason: `Back-up ${databaseWinner} heeft de nieuwere databasewijzigingstijd; dit is geen precieze wijzigingstijd van dit record.`,
        warnings,
      };
    }
    return {
      source: null,
      confidence: "unresolved",
      reason: "De geldige databasetijden zijn gelijk; er is geen nieuwere bron aan te wijzen.",
      warnings,
    };
  }

  if (manifestA.status === "valid" && manifestB.status === "valid") {
    if (manifestA.epochMilliseconds !== manifestB.epochMilliseconds) {
      const source = manifestA.epochMilliseconds! > manifestB.epochMilliseconds! ? "A" : "B";
      return {
        source,
        confidence: "manifest-timestamp",
        reason: `Back-up ${source} heeft de nieuwere manifest-databasetijd; de databasetijd zelf is niet aan beide kanten bruikbaar.`,
        warnings: ["De bronvolgorde is afgeleid uit de manifesttijd omdat de databasetijd ontbreekt of ongeldig is."],
      };
    }
    return {
      source: null,
      confidence: "unresolved",
      reason: "De manifesttijden zijn gelijk en de databasetijd levert geen betrouwbare volgorde.",
      warnings: ["De databasetijd ontbreekt of is ongeldig; de gelijke manifesttijden geven geen tie-break."],
    };
  }

  return {
    source: null,
    confidence: "unresolved",
    reason: "Er is geen geldige databasetijd of manifesttijd om de bronvolgorde te bepalen.",
    warnings: ["De bronvolgorde is onbekend doordat de beschikbare databasetijden ontbreken of ongeldig zijn."],
  };
}

function candidate(
  record: ComparedRecord,
  source: MergeSource,
  snapshot: UserDataSnapshot,
): MergeRowCandidate | null {
  const sourceRecord = source === "A" ? record.sourceA : record.sourceB;
  if (!sourceRecord) return null;
  return {
    source,
    fileName: snapshot.sourceFileName,
    localKey: sourceRecord.identity.localKey,
    row: sourceRecord.row,
  };
}

function decideRecordTime(record: ComparedRecord): {
  source: MergeSource | null;
  confidence: MergeConfidence;
  reason: string;
} | null {
  if (record.tableName !== "Note" || !record.sourceA || !record.sourceB) return null;
  const timeA = normalizedNoteTimestamp(record.sourceA.row);
  const timeB = normalizedNoteTimestamp(record.sourceB.row);
  if (timeA.status !== "valid" || timeB.status !== "valid"
    || timeA.epochMilliseconds === timeB.epochMilliseconds) return null;
  const source = timeA.epochMilliseconds! > timeB.epochMilliseconds! ? "A" : "B";
  return {
    source,
    confidence: "record-timestamp",
    reason: `Back-up ${source} heeft voor deze aantekening de nieuwere geldige LastModified-tijd (${source === "A" ? timeA.utc : timeB.utc}).`,
  };
}

function rowWithPreservedCreated(
  record: ComparedRecord,
  winner: MergeSource,
): UserDataRow | null {
  if (record.tableName !== "Note" || !record.sourceA || !record.sourceB) {
    return (winner === "A" ? record.sourceA : record.sourceB)?.row ?? null;
  }
  const rowA = record.sourceA.row;
  const rowB = record.sourceB.row;
  const createdA = normalizeTimestamp(rowA.Created);
  const createdB = normalizeTimestamp(rowB.Created);
  let created: SqlValue | undefined;

  if (createdA.status === "valid" && createdB.status === "valid") {
    created = createdA.epochMilliseconds! <= createdB.epochMilliseconds! ? rowA.Created : rowB.Created;
  } else if (createdA.status === "valid") {
    created = rowA.Created;
  } else if (createdB.status === "valid") {
    created = rowB.Created;
  } else {
    created = (winner === "A" ? rowA : rowB).Created;
  }

  const base = (winner === "A" ? rowA : rowB);
  if (created === undefined || base.Created === created) return base;
  return { ...base, Created: created };
}

function fieldLosses(
  record: ComparedRecord,
  winner: MergeSource,
  selectedRow: UserDataRow,
  reason: string,
): SimpleMergeInformationLoss[] {
  const fieldEntries: SimpleMergeInformationLoss[] = record.fieldDifferences.flatMap((difference) => {
    if (difference.valueA === difference.valueB
      && !(difference.valueA instanceof Uint8Array && difference.valueB instanceof Uint8Array)) return [];
    const retainedFrom: MergeSource = record.tableName === "Note"
      && difference.field === "Created"
      && selectedRow.Created === record.sourceA?.row.Created
      ? "A"
      : winner;
    const omittedFrom: MergeSource = retainedFrom === "A" ? "B" : "A";
    const omitted = omittedFrom === "A" ? record.sourceA?.row : record.sourceB?.row;
    if (!omitted) return [];
    const fieldReason = record.tableName === "Note" && difference.field === "Created" && retainedFrom !== winner
      ? `${reason} De vroegste geldige aanmaakdatum is apart behouden volgens de Created-regel.`
      : reason;
    return [{
      kind: "field",
      tableName: record.tableName,
      identityKey: record.identityKey,
      field: difference.field,
      valueNotRetained: omitted[difference.field],
      omittedFrom,
      retainedValue: selectedRow[difference.field],
      retainedFrom,
      reason: fieldReason,
    }];
  });
  const relationshipEntries: SimpleMergeInformationLoss[] = record.relationshipDifferences
    .filter((difference) => difference.status === "changed")
    .map((difference) => ({
      kind: "relationship",
      tableName: record.tableName,
      identityKey: record.identityKey,
      field: difference.field,
      valueNotRetained: undefined,
      omittedFrom: winner === "A" ? "B" : "A",
      retainedValue: undefined,
      retainedFrom: winner,
      reason: `${reason} De andere gekoppelde ${tableLabels[difference.targetTable] ?? difference.targetTable}-identiteit wordt niet behouden.`,
      relationshipTargetTable: difference.targetTable,
      relationshipIdentityNotRetained: winner === "A"
        ? difference.identityKeyB
        : difference.identityKeyA,
      relationshipIdentityRetained: winner === "A"
        ? difference.identityKeyA
        : difference.identityKeyB,
    }));
  return [...fieldEntries, ...relationshipEntries];
}

/**
 * Plans a simple merge from two already-read snapshots. This pure function
 * returns source-tagged logical rows; database IDs and archive bytes are left
 * untouched for the later database/output steps.
 */
export function simpleMerge(
  snapshotA: UserDataSnapshot,
  snapshotB: UserDataSnapshot,
  reviewChoices: ReadonlyMap<string, MergeSource> = new Map(),
): SimpleMergeResult {
  const pair: SnapshotPair = { A: snapshotA, B: snapshotB };
  const comparison = compareLibraries(snapshotA, snapshotB);
  const recency = sourceRecency(pair);
  const records: SimpleMergeRecord[] = [];
  const choices: SimpleMergeChoice[] = [];
  const informationLoss: SimpleMergeInformationLoss[] = [];
  const unresolved: SimpleMergeReport["unresolved"][number][] = [];
  const decisionWarnings: string[] = [];

  for (const compared of comparison.records) {
    const sourceA = candidate(compared, "A", snapshotA);
    const sourceB = candidate(compared, "B", snapshotB);

    if (compared.status === "equal" && sourceA) {
      records.push({
        tableName: compared.tableName,
        identityKey: compared.identityKey,
        identityStatus: compared.identityStatus,
        comparisonStatus: compared.status,
        action: "keep-one",
        selected: sourceA,
        retainedAlternatives: [],
        confidence: "identical",
        rule: "De rijen zijn gelijk en hebben een stabiele identiteit; één exemplaar wordt behouden.",
      });
      choices.push({
        tableName: compared.tableName,
        identityKey: compared.identityKey,
        selectedSource: "A",
        confidence: "identical",
        reason: "Gelijke stabiel geïdentificeerde gegevens; back-up A is alleen als representatief exemplaar gekozen.",
      });
      continue;
    }

    if ((compared.status === "only-in-a" && sourceA) || (compared.status === "only-in-b" && sourceB)) {
      const retained = sourceA ?? sourceB!;
      records.push({
        tableName: compared.tableName,
        identityKey: compared.identityKey,
        identityStatus: compared.identityStatus,
        comparisonStatus: compared.status,
        action: "keep-one",
        selected: retained,
        retainedAlternatives: [],
        confidence: "identical",
        rule: `Het stabiel geïdentificeerde record komt alleen voor in bron ${retained.source}; het wordt behouden en niet als verwijdering behandeld.`,
      });
      choices.push({
        tableName: compared.tableName,
        identityKey: compared.identityKey,
        selectedSource: retained.source,
        confidence: "identical",
        reason: "Eenzijdig aanwezig stabiel record wordt behouden; bewuste verwijdering is niet bewezen.",
      });
      continue;
    }

    if ((compared.status === "changed" || compared.status === "possible-conflict") && sourceA && sourceB) {
      const reviewChoice = compared.identityKey
        ? reviewChoices.get(`${compared.tableName}:${compared.identityKey}`)
        : undefined;
      if (reviewChoice && compared.identityStatus !== "uncertain") {
        const selectedRow = rowWithPreservedCreated(compared, reviewChoice) ??
          (reviewChoice === "A" ? sourceA.row : sourceB.row);
        const selectedCandidate = {
          ...(reviewChoice === "A" ? sourceA : sourceB),
          row: selectedRow,
        };
        const reason = `Je hebt voor deze publicatie back-up ${reviewChoice} gekozen.`;
        records.push({
          tableName: compared.tableName,
          identityKey: compared.identityKey,
          identityStatus: compared.identityStatus,
          comparisonStatus: compared.status,
          action: "keep-one",
          selected: selectedCandidate,
          retainedAlternatives: [],
          confidence: "manual-choice",
          rule: reason,
        });
        choices.push({
          tableName: compared.tableName,
          identityKey: compared.identityKey,
          selectedSource: reviewChoice,
          confidence: "manual-choice",
          reason,
        });
        informationLoss.push(...fieldLosses(compared, reviewChoice, selectedRow, reason));
        continue;
      }

      if (compared.status === "possible-conflict") {
        const unresolvedReason = "Deze publicatie wijkt in beide back-ups inhoudelijk af. Kies welke versie je wilt behouden.";
        records.push({
          tableName: compared.tableName,
          identityKey: compared.identityKey,
          identityStatus: compared.identityStatus,
          comparisonStatus: compared.status,
          action: "needs-review",
          selected: null,
          retainedAlternatives: [sourceA, sourceB],
          confidence: "unresolved",
          rule: unresolvedReason,
        });
        choices.push({
          tableName: compared.tableName,
          identityKey: compared.identityKey,
          selectedSource: null,
          confidence: "unresolved",
          reason: unresolvedReason,
        });
        unresolved.push({
          tableName: compared.tableName,
          identityKey: compared.identityKey,
          reason: unresolvedReason,
          sourceA,
          sourceB,
        });
        continue;
      }

      const recordDecision = decideRecordTime(compared);
      const selectedSource = recordDecision?.source ?? recency.source;
      const confidence = recordDecision?.confidence ?? recency.confidence;
      const reason = recordDecision?.reason ?? recency.reason;
      if (selectedSource) {
        const selectedRow = rowWithPreservedCreated(compared, selectedSource) ??
          (selectedSource === "A" ? sourceA.row : sourceB.row);
        const createdSource = compared.tableName === "Note"
          && compared.fieldDifferences.some((difference) => difference.field === "Created")
          ? selectedRow.Created === sourceA.row.Created ? "A" : "B"
          : selectedSource;
        const selectedCandidate = {
          ...(selectedSource === "A" ? sourceA : sourceB),
          row: selectedRow,
          ...(createdSource !== selectedSource ? { fieldSources: { Created: createdSource } } : {}),
        };
        records.push({
          tableName: compared.tableName,
          identityKey: compared.identityKey,
          identityStatus: compared.identityStatus,
          comparisonStatus: compared.status,
          action: "keep-one",
          selected: selectedCandidate,
          retainedAlternatives: [],
          confidence,
          rule: reason,
        });
        choices.push({
          tableName: compared.tableName,
          identityKey: compared.identityKey,
          selectedSource,
          confidence,
          reason,
        });
        informationLoss.push(...fieldLosses(compared, selectedSource, selectedRow, reason));
        if (confidence === "database-timestamp" || confidence === "manifest-timestamp") {
          decisionWarnings.push(
            `${compared.tableName} (${compared.identityKey ?? "onzekere identiteit"}): de gekozen bron is gebaseerd op bronniveau-tijd; dit is geen bewezen wijzigingstijd van het record. ${reason}`,
          );
        }
        continue;
      }

      const unresolvedReason = `${reason} De twee waarden blijven als alternatieven bewaard; er is geen winnaar gekozen.`;
      records.push({
        tableName: compared.tableName,
        identityKey: compared.identityKey,
        identityStatus: compared.identityStatus,
        comparisonStatus: compared.status,
        action: "needs-review",
        selected: null,
        retainedAlternatives: [sourceA, sourceB],
        confidence: "unresolved",
        rule: unresolvedReason,
      });
      choices.push({
        tableName: compared.tableName,
        identityKey: compared.identityKey,
        selectedSource: null,
        confidence: "unresolved",
        reason: unresolvedReason,
      });
      unresolved.push({
        tableName: compared.tableName,
        identityKey: compared.identityKey,
        reason: unresolvedReason,
        sourceA,
        sourceB,
      });
      continue;
    }

    const candidates = [sourceA, sourceB].filter((item): item is MergeRowCandidate => item !== null);
    const reason = readableUncertainty(compared);
    records.push({
      tableName: compared.tableName,
      identityKey: compared.identityKey,
      identityStatus: compared.identityStatus,
      comparisonStatus: compared.status,
      action: candidates.length > 1 ? "keep-both-pending-review" : "needs-review",
      selected: null,
      retainedAlternatives: candidates,
      confidence: "unresolved",
      rule: `${reason} De beschikbare bronrijen blijven in het resultaatmodel behouden, maar zijn niet vrijgegeven als definitieve uitvoer.`,
    });
    choices.push({
      tableName: compared.tableName,
      identityKey: compared.identityKey,
      selectedSource: null,
      confidence: "unresolved",
      reason,
    });
    unresolved.push({
      tableName: compared.tableName,
      identityKey: compared.identityKey,
      reason,
      sourceA,
      sourceB,
    });
  }

  return {
    status: unresolved.length === 0 ? "ready" : "needs-review",
    records,
    report: {
      sourceA: {
        fileName: snapshotA.sourceFileName,
        databaseTimestamp: normalizeTimestamp(snapshotA.modificationTimes.databaseLastModified),
        manifestTimestamp: normalizeTimestamp(snapshotA.modificationTimes.manifestDatabaseLastModified),
      },
      sourceB: {
        fileName: snapshotB.sourceFileName,
        databaseTimestamp: normalizeTimestamp(snapshotB.modificationTimes.databaseLastModified),
        manifestTimestamp: normalizeTimestamp(snapshotB.modificationTimes.manifestDatabaseLastModified),
      },
      choices,
      informationLoss,
      warnings: [...recency.warnings, ...decisionWarnings],
      unresolved,
    },
  };
}
