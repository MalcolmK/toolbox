import { LOCATION_COMPARISON_FIELDS } from "../compare/locationDescriptor";
import { identifyRecord } from "../compare/recordIdentity";
import type { SimpleMergePreview } from "../merge/prepareSimpleMerge";
import type { LocationProposalGroup } from "../merge/locationProposalGroups";
import { getLocationProposalGroups } from "../merge/locationProposalGroups";
import type { LocationSource } from "../merge/locationResolution";
import styles from "./LibraryMergerPage.module.css";

function titleText(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "Niet opgegeven";
}

function fieldText(value: unknown): string {
  return value === null || value === undefined || value === "" ? "Niet opgegeven" : String(value);
}

export function LocationResolutionReview({
  preview,
  metadataChoices,
  onChooseMetadata,
  onConfirm,
  onDifferent,
  onRevoke,
}: {
  readonly preview: SimpleMergePreview;
  readonly metadataChoices: ReadonlyMap<string, LocationSource>;
  readonly onChooseMetadata: (group: LocationProposalGroup, source: LocationSource) => void;
  readonly onConfirm: (group: LocationProposalGroup, source: LocationSource) => void;
  readonly onDifferent: (group: LocationProposalGroup) => void;
  readonly onRevoke: (group: LocationProposalGroup) => void;
}) {
  const groups = getLocationProposalGroups(preview);
  const unresolved = preview.locationResolution.unresolved;
  if (groups.length === 0 && unresolved.length === 0) return null;

  return (
    <section className={styles.locationReview} aria-labelledby="location-review-heading">
      <div>
        <h3 id="location-review-heading">Controleer welke plaatsen bij elkaar horen</h3>
        <p className={styles.planSummary}>
          Deze bevestiging bepaalt alleen de plaatskoppeling. Je keuze voor versie A of B blijft apart en geldt alleen voor conflicterende inhoud.
        </p>
      </div>
      {groups.map((group, groupIndex) => {
        const metadataSource = metadataChoices.get(group.key);
        const confirmSource = metadataSource ?? (group.hasTitleDifference ? null : "A");
        const titleChoiceMissing = group.hasTitleDifference && metadataSource === undefined;
        const cardStatus = group.confirmed
          ? "Bevestigd"
          : group.different
            ? group.canKeepSeparate ? "Afzonderlijk behouden" : "Blokkeert door unieke sleutel"
            : "Bevestiging nodig";
        return (
          <article className={styles.locationCard} key={group.key}>
            <div className={styles.locationCardHeading}>
              <div>
                <h4>{group.label}</h4>
                <p>{group.family === "media" ? "Mediagroep" : group.family === "single-place" ? "Afzonderlijke plaats" : "Publicatiegroep"}</p>
              </div>
              <span className={group.confirmed || group.canKeepSeparate ? styles.readyBadge : styles.reviewBadge}>{cardStatus}</span>
            </div>
            <p className={styles.planSummary}>
              Back-up A: {preview.sources[0].fileName} · Back-up B: {preview.sources[1].fileName}
            </p>
            <p className={styles.planSummary}>{group.pairs.length} precies plaatsparen in dit voorstel.</p>
            {group.pairs.some((pair) => pair.hasTitleDifference) && (
              <div className={styles.locationMetadataChoice}>
                <strong>De titels verschillen. Welke titel wil je als plaatsmetadata behouden?</strong>
                {group.pairs.filter((pair) => pair.hasTitleDifference).map((pair) => (
                  <p key={pair.proposal.id}>
                    Plek: back-up A “{titleText(pair.rowA.Title)}” · back-up B “{titleText(pair.rowB.Title)}”
                  </p>
                ))}
                <div className={styles.locationRadioGroup} role="group" aria-label={`Titelmetadata voor ${group.label}`}>
                  {(["A", "B"] as const).map((source) => (
                    <label key={source}>
                      <input
                        type="radio"
                        name={`location-metadata-${groupIndex}`}
                        checked={metadataSource === source}
                        onChange={() => onChooseMetadata(group, source)}
                      />
                      Gebruik titelmetadata uit back-up {source}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <details className={styles.locationPairs}>
              <summary>Bekijk alle voorgestelde plaatsparen ({group.pairs.length}) en de tien sleutelvelden</summary>
              {group.pairs.map((pair, pairIndex) => (
                <article className={styles.locationPair} key={pair.proposal.id}>
                  <h5>Paar {pairIndex + 1}: {titleText(pair.rowA.Title) !== "Niet opgegeven"
                    ? titleText(pair.rowA.Title) : titleText(pair.rowB.Title)}</h5>
                  <div className={styles.locationPairSources}>
                    {(["A", "B"] as const).map((source) => (
                      <div className={styles.locationSource} key={source}>
                        <strong>Back-up {source}</strong>
                        <p>{titleText(source === "A" ? pair.rowA.Title : pair.rowB.Title)}</p>
                      </div>
                    ))}
                  </div>
                  <dl className={styles.locationFields}>
                    {LOCATION_COMPARISON_FIELDS.map((field) => {
                      const valueA = fieldText(pair.rowA[field]);
                      const valueB = fieldText(pair.rowB[field]);
                      return (
                        <div key={field}>
                          <dt>{field}</dt>
                          <dd><span>Back-up A</span>{valueA}</dd>
                          <dd><span>Back-up B</span>{valueB}</dd>
                          {valueA !== valueB && <dd className={styles.locationFieldDifference}>Verschilt</dd>}
                        </div>
                      );
                    })}
                  </dl>
                </article>
              ))}
            </details>
            {group.different && !group.canKeepSeparate && (
              <p className={styles.locationBlocker} role="alert">
                Afzonderlijk behoud blokkeert: {group.pairs.find((pair) => pair.different && !pair.different.canKeepSeparate)?.different?.blockingReason}
              </p>
            )}
            <div className={styles.locationActions}>
              {group.confirmed ? (
                <button type="button" className={styles.actionButton} onClick={() => onRevoke(group)}>
                  Bevestiging intrekken
                </button>
              ) : (
                <button type="button" className={styles.selectedDecision}
                  disabled={titleChoiceMissing || !confirmSource}
                  onClick={() => confirmSource && onConfirm(group, confirmSource)}>
                  {group.family === "publication"
                    ? "Deze getoonde plekken horen bij dezelfde publicatie."
                    : group.family === "media"
                      ? "Deze getoonde mediaplekken horen bij dezelfde mediagroep."
                      : "Deze twee beschreven plekken horen bij elkaar."}
                </button>
              )}
              <button type="button" className={group.different ? styles.selectedDecision : styles.actionButton}
                aria-pressed={group.different}
                disabled={group.confirmed}
                onClick={() => onDifferent(group)}>
                Dit zijn verschillende plekken
              </button>
            </div>
          </article>
        );
      })}
      {unresolved.length > 0 && (
        <details className={styles.locationUnresolved}>
          <summary>Niet koppelbare of onzekere plaatsen ({unresolved.length})</summary>
          <ul>
            {unresolved.map((item, index) => {
              const snapshot = preview.sources[item.source === "A" ? 0 : 1].snapshot;
              const row = item.localKey
                ? snapshot.tables.Location?.rows.find((candidate, rowIndex) =>
                  identifyRecord(snapshot, "Location", candidate, rowIndex).localKey === item.localKey)
                : null;
              return (
                <li key={`${item.source}-${item.localKey ?? "unknown"}-${index}`}>
                  <strong>Back-up {item.source}: {titleText(row?.Title)}</strong>
                  <p>{item.reason}</p>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
