import type { SqlValue } from "sql.js";
import type { SimpleMergePreview } from "../merge/prepareSimpleMerge";
import type { MergeRowCandidate, SimpleMergeReport } from "../merge/simpleMerge";
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

export function SimpleMergeResults({ preview }: { readonly preview: SimpleMergePreview }) {
  const { differenceReport, mergePlan } = preview;
  const counts = differenceReport.summary;
  const losses = mergePlan.report.informationLoss;
  const unresolved: SimpleMergeReport["unresolved"] = mergePlan.report.unresolved;
  const selectedA = mergePlan.report.choices.filter((choice) => choice.selectedSource === "A").length;
  const selectedB = mergePlan.report.choices.filter((choice) => choice.selectedSource === "B").length;

  return (
    <section className={styles.results} aria-labelledby="merge-results-heading">
      <div className={styles.resultsHeading}>
        <div>
          <h2 id="merge-results-heading">Vergelijking en mergeplan</h2>
          <p>De back-ups zijn lokaal verwerkt. De bronbestanden zijn niet gewijzigd.</p>
        </div>
        <span className={mergePlan.status === "ready" ? styles.readyBadge : styles.reviewBadge}>
          {mergePlan.status === "ready" ? "Keuzes afgerond" : "Controle nodig"}
        </span>
      </div>

      <div className={styles.sourceSummary} aria-label="Gevalideerde bronnen">
        {preview.sources.map((source, index) => (
          <p key={`${index}-${source.fileName}`}>
            <strong>Back-up {index === 0 ? "A" : "B"}:</strong> {source.fileName}
            <span> · schema {source.schemaVersion}</span>
          </p>
        ))}
      </div>

      <section aria-labelledby="timestamps-heading">
        <h3 id="timestamps-heading">Tijdstempels uit de back-ups</h3>
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

      <section aria-labelledby="difference-summary-heading">
        <h3 id="difference-summary-heading">Verschillen</h3>
        <dl className={styles.summaryGrid}>
          <div><dt>Gelijk</dt><dd>{counts.equal}</dd></div>
          <div><dt>Alleen in A</dt><dd>{counts.onlyInA}</dd></div>
          <div><dt>Alleen in B</dt><dd>{counts.onlyInB}</dd></div>
          <div><dt>Gewijzigd</dt><dd>{counts.changed}</dd></div>
          <div><dt>Mogelijk conflict</dt><dd>{counts.possibleConflicts}</dd></div>
          <div><dt>Onzeker gekoppeld</dt><dd>{counts.uncertain}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="plan-summary-heading">
        <h3 id="plan-summary-heading">Simpele modus</h3>
        <p className={styles.planSummary}>
          {selectedA} keuze(s) uit A, {selectedB} keuze(s) uit B, {unresolved.length} onopgelost(e) gegeven(s),
          {` ${losses.length} verschil(len) met een niet-behouden waarde.`}
        </p>
        {mergePlan.report.warnings.length > 0 && (
          <ul className={styles.warningList} aria-label="Waarschuwingen">
            {mergePlan.report.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
          </ul>
        )}
      </section>

      <section aria-labelledby="information-loss-heading">
        <h3 id="information-loss-heading">Niet-behouden informatie ({losses.length})</h3>
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
                {record.uncertaintyNotes.map((note) => <p key={note}>{note}</p>)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
