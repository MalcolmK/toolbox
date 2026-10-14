import type { ThreeWayOutcome, ThreeWayRecordDecision } from "../compare/compareThreeWay";
import styles from "./LibraryMergerPage.module.css";

const outcomeLabels: Readonly<Record<ThreeWayOutcome, string>> = {
  unchanged: "Geen wijziging",
  "changed-in-a": "Wijziging alleen in A",
  "changed-in-b": "Wijziging alleen in B",
  "same-change": "Dezelfde wijziging in A en B",
  "non-overlapping": "Niet-overlappende wijzigingen",
  conflict: "Conflict",
  uncertain: "Onzeker gekoppeld",
};

const tableLabels: Readonly<Record<string, string>> = {
  BlockRange: "Markeerbereik",
  Bookmark: "Bladwijzer",
  InputField: "Invoerveld",
  LastModified: "Databasetijd",
  Location: "Publicatie- of mediaplek",
  Note: "Aantekening",
  Tag: "Label",
  TagMap: "Labelkoppeling",
  UserMark: "Markering",
};

const visibleOutcomes: readonly ThreeWayOutcome[] = [
  "changed-in-a",
  "changed-in-b",
  "same-change",
  "non-overlapping",
  "conflict",
  "uncertain",
];

function displayValue(value: ThreeWayRecordDecision["differences"][number]["valueA"]): string {
  if (value.presence === "missing") return "(ontbreekt)";
  if (value.value === null) return "(leeg)";
  if (value.value instanceof Uint8Array) return `Binaire waarde (${value.value.byteLength} bytes)`;
  const string = String(value.value);
  return string.length > 180 ? `${string.slice(0, 180)}…` : string;
}

export function AdvancedMergeResults({
  comparison,
}: {
  readonly comparison: AdvancedMergeRecordComparison;
}) {
  const changedRecords = comparison.records.filter((record) => record.outcome !== "unchanged");
  return (
    <section className={styles.results} aria-labelledby="advanced-results-heading">
      <div className={styles.resultsHeading}>
        <div>
          <h2 id="advanced-results-heading">Driewegvergelijking</h2>
          <p>Back-up A en B zijn de twee bronbestanden. De basisversie is alleen gebruikt om wijzigingen te herkennen.</p>
        </div>
        <span className={styles.reviewBadge}>
          {comparison.baseFileName ? "Basisversie gebruikt" : "Tweewegvergelijking"}
        </span>
      </div>

      {comparison.baseFileName ? (
        <p className={styles.planSummary}>Basisversie: {comparison.baseFileName}</p>
      ) : (
        <p className={styles.notReadyNotice} role="status">
          Zonder basisversie zijn wijzigingen tussen A en B alleen mogelijke conflicten; de app kan niet vaststellen wie een veld eerder heeft gewijzigd.
        </p>
      )}

      <dl className={styles.summaryGrid}>
        {visibleOutcomes.map((outcome) => (
          <div key={outcome}><dt>{outcomeLabels[outcome]}</dt><dd>{comparison.summary[outcome]}</dd></div>
        ))}
      </dl>

      <section aria-labelledby="advanced-records-heading">
        <h3 id="advanced-records-heading">Verschillende records ({changedRecords.length})</h3>
        {changedRecords.length === 0 ? (
          <p className={styles.emptyMessage}>Er zijn geen inhoudelijke wijzigingen vastgesteld.</p>
        ) : (
          <ul className={styles.detailList}>
            {changedRecords.map((record, index) => (
              <li key={`${record.tableName}-${record.logicalIdentity.key ?? "unknown"}-${index}`}>
                <strong>{tableLabels[record.tableName] ?? "Gegeven"} · {outcomeLabels[record.outcome]}</strong>
                <p>{record.reason}</p>
                <p>
                  A: {record.sourceA?.recordLabel ?? "record ontbreekt"}; B: {record.sourceB?.recordLabel ?? "record ontbreekt"}.
                </p>
                {record.differences.map((difference) => (
                  <p key={difference.path}>
                    {difference.label}: A «{displayValue(difference.valueA)}» · B «{displayValue(difference.valueB)}»
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className={styles.modeHint}>
        Deze stap maakt nog geen mergebestand en past geen bron aan. Conflicten per record en tekstblok oplossen volgt in de volgende stap.
      </p>
    </section>
  );
}

interface AdvancedMergeRecordComparison {
  readonly baseFileName: string | null;
  readonly records: readonly ThreeWayRecordDecision[];
  readonly summary: Readonly<Record<ThreeWayOutcome, number>>;
}
