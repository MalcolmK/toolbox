import type { SqlValue } from "sql.js";
import type { SimpleMergePreview } from "../merge/prepareSimpleMerge";
import type { MergeRowCandidate, SimpleMergeReport } from "../merge/simpleMerge";
import { getPublicationConflictGroups, type PublicationConflictGroup } from "../merge/publicationConflicts";
import styles from "./LibraryMergerPage.module.css";

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
  PlaylistItemIndependentMediaMap: "Mediakoppeling",
  PlaylistItemLocationMap: "Locatiekoppeling",
  PlaylistItemMarker: "Afspeellijstmarkering",
  PlaylistItemMarkerBibleVerseMap: "Bijbelverskoppeling",
  PlaylistItemMarkerParagraphMap: "Alineakoppeling",
  Tag: "Label",
  TagMap: "Labelkoppeling",
  UserMark: "Markering",
  grdb_migrations: "Databaseschemaregistratie",
};

function tableLabel(tableName: string): string {
  return tableLabels[tableName] ?? "Gegeven";
}

function valueText(value: SqlValue | undefined): string {
  if (value === undefined) return "(geen waarde)";
  if (value === null) return "(leeg)";
  if (value instanceof Uint8Array) return `Binaire waarde (${value.byteLength} bytes)`;
  return String(value);
}

function ValueDisclosure({ label, value }: { readonly label: string; readonly value: SqlValue | undefined }) {
  const text = valueText(value);
  if (text.length <= 180 && !text.includes("\n")) return <span>{text}</span>;
  return (
    <details className={styles.valueDisclosure}>
      <summary>{text.slice(0, 140)}{text.length > 140 ? "…" : ""} ({label})</summary>
      <pre>{text}</pre>
    </details>
  );
}

function noteTitle(source: MergeRowCandidate | null): string | null {
  const title = source?.row.Title;
  return typeof title === "string" && title.trim() ? title : null;
}

export function SimpleMergeResults({
  preview,
  reviewChoices,
  onChoosePublicationVersion,
}: {
  readonly preview: SimpleMergePreview;
  readonly reviewChoices: ReadonlyMap<string, "A" | "B">;
  readonly onChoosePublicationVersion: (group: PublicationConflictGroup, source: "A" | "B") => void;
}) {
  const { differenceReport, mergePlan } = preview;
  const counts = differenceReport.summary;
  const losses = mergePlan.report.informationLoss;
  const unresolved: SimpleMergeReport["unresolved"] = mergePlan.report.unresolved;
  const selectedA = mergePlan.report.choices.filter((choice) => choice.selectedSource === "A").length;
  const selectedB = mergePlan.report.choices.filter((choice) => choice.selectedSource === "B").length;
  const publicationConflicts = getPublicationConflictGroups(preview, reviewChoices);
  const unresolvedPublications = publicationConflicts.filter((group) => group.selectedSource === null).length;
  const publicationRecordKeys = new Set(publicationConflicts.flatMap((group) => group.recordKeys));
  const otherOpenItems = unresolved.filter((item) =>
    !item.identityKey || !publicationRecordKeys.has(`${item.tableName}:${item.identityKey}`)).length;
  const statusLabel = mergePlan.status === "ready"
    ? "Klaar om bestand te maken"
    : unresolvedPublications > 0
      ? `${unresolvedPublications} publicatiekeuze${unresolvedPublications === 1 ? "" : "s"} nodig`
      : otherOpenItems > 0
        ? `${otherOpenItems} open punt${otherOpenItems === 1 ? "" : "en"}`
        : "Controle nodig";

  return (
    <section className={styles.results} aria-labelledby="merge-results-heading">
      <div className={styles.resultsHeading}>
        <div>
          <h2 id="merge-results-heading">Resultaat van de vergelijking</h2>
          <p>Je originele back-ups zijn niet gewijzigd.</p>
        </div>
        <span className={mergePlan.status === "ready" ? styles.readyBadge : styles.reviewBadge}>
          {statusLabel}
        </span>
      </div>

      <div className={styles.sourceSummary} aria-label="Gevalideerde bronnen">
        {preview.sources.map((source, index) => (
          <p key={`${index}-${source.fileName}`}>
            <strong>Back-up {index === 0 ? "A" : "B"}:</strong> {source.fileName}
          </p>
        ))}
      </div>

      <div className={styles.resultSummary} role="status" aria-live="polite" aria-atomic="true">
        <div>
          <strong>Vergelijking afgerond</strong>
          <p>
            {publicationConflicts.length === 0
              ? "Geen publicatieconflicten gevonden."
              : `${publicationConflicts.length} conflicterende publicatie${publicationConflicts.length === 1 ? "" : "s"}.`}
            {unresolvedPublications > 0 && ` ${unresolvedPublications} keuze${unresolvedPublications === 1 ? "" : "s"} nodig.`}
            {otherOpenItems > 0 && ` ${otherOpenItems} ander open punt${otherOpenItems === 1 ? "" : "en"}.`}
            {mergePlan.status === "ready" && " Je kunt nu een mergebestand maken."}
          </p>
        </div>
      </div>

      {publicationConflicts.length > 0 && (
        <section className={styles.conflictReview} aria-labelledby="publication-conflicts-heading">
          <div>
            <h3 id="publication-conflicts-heading">Kies per publicatie welke versie je wilt</h3>
            <p className={styles.planSummary}>Vergelijk de verschillen en kies back-up A of B. Je keuze geldt voor de conflicten binnen die publicatie.</p>
          </div>
          {publicationConflicts.map((group) => (
            <article className={styles.conflictCard} key={group.key}>
              <h4>{group.label}</h4>
              <p className={styles.planSummary}>Kies één versie voor alle conflicten die hieronder bij deze publicatie horen.</p>
              {group.differences.map((item) => (
                <div className={styles.publicationDifference} key={item.recordKey}>
                  <strong>{item.label}</strong>
                  <div className={styles.conflictSources}>
                    {(["A", "B"] as const).map((source) => {
                      const fields = item.fields.filter((field) => field.valueA !== field.valueB);
                      return (
                        <div className={styles.sourceEvidence} key={source}>
                          <h5>Back-up {source}</h5>
                          {fields.length > 0 ? fields.map((field) => (
                            <p key={field.field}>
                              <strong>{field.field}:</strong> <ValueDisclosure
                                label={`back-up ${source}`}
                                value={source === "A" ? field.valueA : field.valueB}
                              />
                            </p>
                          )) : <p>Geen losse veldverschillen beschikbaar.</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className={styles.conflictActions}>
                <button
                  className={reviewChoices.get(group.recordKeys[0]!) === "A" ? styles.selectedDecision : styles.actionButton}
                  type="button"
                  aria-pressed={reviewChoices.get(group.recordKeys[0]!) === "A"}
                  onClick={() => onChoosePublicationVersion(group, "A")}
                >
                  Gebruik versie A voor deze publicatie
                </button>
                <button
                  className={reviewChoices.get(group.recordKeys[0]!) === "B" ? styles.selectedDecision : styles.actionButton}
                  type="button"
                  aria-pressed={reviewChoices.get(group.recordKeys[0]!) === "B"}
                  onClick={() => onChoosePublicationVersion(group, "B")}
                >
                  Gebruik versie B voor deze publicatie
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      <div className={styles.pocNotice} role="note" aria-label="POC-status">
        <strong>POC-bestand: acceptatie in JW Library is niet bevestigd</strong>
        <p>De controles in deze tool bewijzen niet dat JW Library het bestand accepteert. Je kunt een kandidaat maken zonder vooraf de hashformule te laten verifiëren.</p>
      </div>

      <details className={styles.differenceDetails}>
        <summary>Tijdstempels en technische details bekijken</summary>
        <section aria-labelledby="timestamps-heading">
        <h3 id="timestamps-heading">Tijdstempels</h3>
        <ul className={styles.detailList}>
          {differenceReport.sources.flatMap((source) => source.timestamps.map((timestamp) => (
            <li key={`${source.label}-${timestamp.label}-${timestamp.recordLabel ?? "source"}`}>
              <strong>{source.label} · {timestamp.label}</strong>
              <p>{timestamp.originalValue ?? "Tijdstempel ontbreekt"} · {timestamp.status}</p>
              {timestamp.utcValue && <p>Genormaliseerd: {timestamp.utcValue}</p>}
              <p>{timestamp.message}</p>
            </li>
          )))}
        </ul>
        {differenceReport.timestampWarnings.length > 0 && (
          <ul className={styles.warningList} aria-label="Tijdstempelwaarschuwingen">
            {differenceReport.timestampWarnings.map((warning, index) => (
              <li key={`${warning.source}-${warning.label}-${warning.recordLabel ?? index}`}>{warning.message}</li>
            ))}
          </ul>
        )}
        </section>
      </details>

      <details className={styles.differenceDetails}>
        <summary>Bekijk uitgebreide verschilcijfers</summary>
        <section aria-labelledby="difference-summary-heading">
        <h3 id="difference-summary-heading">Uitgebreide verschillen</h3>
        <dl className={styles.summaryGrid}>
          <div><dt>Gelijk</dt><dd>{counts.equal}</dd></div>
          <div><dt>Alleen in back-up A</dt><dd>{counts.onlyInA}</dd></div>
          <div><dt>Alleen in back-up B</dt><dd>{counts.onlyInB}</dd></div>
          <div><dt>Gewijzigd</dt><dd>{counts.changed}</dd></div>
          <div><dt>Mogelijk conflict</dt><dd>{counts.possibleConflicts}</dd></div>
          <div><dt>Onzeker gekoppeld</dt><dd>{counts.uncertain}</dd></div>
        </dl>
        </section>
      </details>

      <details className={styles.differenceDetails}>
        <summary>Bekijk mergekeuzes en aandachtspunten</summary>
        <section aria-labelledby="plan-summary-heading">
        <h3 id="plan-summary-heading">Wat wordt meegenomen</h3>
        <p className={styles.planSummary}>{selectedA} keuze(s) uit back-up A en {selectedB} uit back-up B. {unresolved.length} open punt(en); {losses.length} waarde(s) worden niet meegenomen.</p>
        {mergePlan.report.warnings.length > 0 && (
          <ul className={styles.warningList} aria-label="Aandachtspunten">
            {mergePlan.report.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
          </ul>
        )}
        </section>
      </details>

      <details className={styles.differenceDetails}>
        <summary>Bekijk niet-meegenomen informatie ({losses.length})</summary>
        <section aria-labelledby="information-loss-heading">
        <h3 id="information-loss-heading">Niet-meegenomen informatie ({losses.length})</h3>
        {losses.length === 0 ? (
          <p className={styles.emptyMessage}>Er zijn geen afzonderlijke veldwaarden gemeld als niet-behouden.</p>
        ) : (
          <ul className={styles.detailList}>
            {losses.map((loss, index) => (
              <li key={`${loss.tableName}-${loss.identityKey ?? "unknown"}-${loss.field}-${index}`}>
                <strong>{tableLabel(loss.tableName)} · {loss.field}</strong>
                <p>{loss.reason}</p>
                <p>
                  Niet behouden uit bron {loss.omittedFrom}: <ValueDisclosure label="niet-behouden waarde" value={loss.valueNotRetained} />
                </p>
                <p>
                  Behouden uit bron {loss.retainedFrom}: <ValueDisclosure label="behouden waarde" value={loss.retainedValue} />
                </p>
              </li>
            ))}
          </ul>
        )}
        </section>
      </details>

      <details className={styles.differenceDetails} open={unresolved.length > 0}>
        <summary>Bekijk open keuzes en onzekerheden ({unresolved.length})</summary>
        <section aria-labelledby="unresolved-heading">
        <h3 id="unresolved-heading">Onzekerheden en open keuzes ({unresolved.length})</h3>
        {unresolved.length === 0 ? (
          <p className={styles.emptyMessage}>Alle mergekeuzes zijn op basis van de beschikbare informatie opgelost.</p>
        ) : (
          <ul className={styles.detailList}>
            {unresolved.map((item, index) => (
              <li key={`${item.tableName}-${item.identityKey ?? "unknown"}-${index}`}>
                <strong>{tableLabel(item.tableName)}{noteTitle(item.sourceA) ? `: ${noteTitle(item.sourceA)}` : ""}</strong>
                <p>{item.reason}</p>
                <p>Bron A: {item.sourceA?.fileName ?? "geen gekoppelde rij"}; bron B: {item.sourceB?.fileName ?? "geen gekoppelde rij"}.</p>
              </li>
            ))}
          </ul>
        )}
        </section>
      </details>

      {differenceReport.records.length > 0 && (
        <details className={styles.differenceDetails}>
          <summary>Alle inhoudelijke verschillen bekijken ({differenceReport.records.length})</summary>
          <ul className={styles.detailList}>
            {differenceReport.records.map((record, index) => (
              <li key={`${record.tableLabel}-${record.headline}-${index}`}>
                <strong>{record.headline}</strong>
                <p>{record.statusLabel}: {record.explanation}</p>
                {record.changes.map((change) => (
                  <p key={`${change.field}-${change.label}`}>
                    {change.label}: A «{change.valueA}» · B «{change.valueB}»
                  </p>
                ))}
                {record.noteTimestamps.map((timestamps) => (
                  <p key={timestamps.field}>
                    {timestamps.field}: A «{timestamps.valueA?.originalValue ?? "onbekend"}» ·
                    {` B «${timestamps.valueB?.originalValue ?? "onbekend"}»`}
                  </p>
                ))}
                {record.uncertaintyNotes.map((note, index) => <p key={`${index}-${note}`}>{note}</p>)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
