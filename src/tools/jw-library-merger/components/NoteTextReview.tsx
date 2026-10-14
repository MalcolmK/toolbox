import { canKeepBothTextFragments, mergeNoteText, type TextGranularity, type TextMergeSegment } from "../compare/mergeNoteText";
import type { ThreeWayRecordDecision } from "../compare/compareThreeWay";
import type { MergeDecisionValue } from "../types";
import styles from "./LibraryMergerPage.module.css";

export type NoteTextResolution = { readonly choice: "a" | "b" | "both" | "manual"; readonly manualText?: string };
export interface NoteTextReviewState {
  readonly granularity: TextGranularity;
  readonly resolutions: Readonly<Record<string, NoteTextResolution>>;
}
export const emptyNoteTextReviewState: NoteTextReviewState = { granularity: "block", resolutions: {} };

function textValue(value: MergeDecisionValue | null): string | null {
  if (!value || value.presence === "missing" || typeof value.value !== "string") return null;
  return value.value;
}

function quoted(text: string): string {
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

export function NoteTextReview({ record, stateKey, state, onChange }: {
  readonly record: ThreeWayRecordDecision;
  readonly stateKey: string;
  readonly state: NoteTextReviewState;
  readonly onChange: (next: NoteTextReviewState) => void;
}) {
  const { granularity, resolutions } = state;
  const difference = record.differences.find((item) => item.path === "Content");
  const base = textValue(difference?.baseValue ?? null);
  const textA = textValue(difference?.valueA ?? null);
  const textB = textValue(difference?.valueB ?? null);

  if (record.logicalIdentity.confidence !== "stable") {
    return <p className={styles.notReadyNotice}>De identiteit van deze aantekening is onzeker. De app kan de blokken niet veilig aan de juiste recordkoppelingen toewijzen; beoordeel daarom de volledige bronwaarde.</p>;
  }
  if (base === null || textA === null || textB === null) {
    return <p className={styles.notReadyNotice}>Blok- en regelvergelijking is niet veilig mogelijk: de basis of een volledige tekstwaarde ontbreekt. Gebruik de keuze voor de volledige bron hierboven.</p>;
  }

  const plan = mergeNoteText(base, textA, textB, granularity);
  const conflictSegments = plan.segments.filter((segment) => segment.kind === "conflict");
  const resolvedCount = conflictSegments.filter((segment) => resolutions[`${granularity}:${segment.id}`]).length;
  const setResolution = (segment: TextMergeSegment, choice: NoteTextResolution["choice"]) => {
    const key = `${granularity}:${segment.id}`;
    onChange({ ...state, resolutions: {
      ...resolutions,
      [key]: { choice, ...(choice === "manual" ? { manualText: resolutions[key]?.manualText ?? segment.textA } : {}) },
    } });
  };
  const setManualText = (segment: TextMergeSegment, value: string) => {
    const key = `${granularity}:${segment.id}`;
    onChange({ ...state, resolutions: { ...resolutions, [key]: { choice: "manual", manualText: value } } });
  };

  return <section className={styles.noteTextReview} aria-labelledby={`${stateKey}-text-review-heading`}>
    <div className={styles.noteTextHeading}>
      <div><h5 id={`${stateKey}-text-review-heading`}>Aantekeningstekst samenvoegen</h5><p>Blokken worden standaard vergeleken. Schakel naar regels voor een fijnere keuze.</p></div>
      <div className={styles.granularitySwitch} role="group" aria-label="Vergelijkingsniveau">
        <button type="button" className={granularity === "block" ? styles.selectedDecision : styles.clearFileButton} aria-pressed={granularity === "block"} onClick={() => onChange({ ...state, granularity: "block" })}>Blokken</button>
        <button type="button" className={granularity === "line" ? styles.selectedDecision : styles.clearFileButton} aria-pressed={granularity === "line"} onClick={() => onChange({ ...state, granularity: "line" })}>Regels</button>
      </div>
    </div>
    {plan.warning && <p className={styles.notReadyNotice} role="status">{plan.warning}</p>}
    <p className={styles.choiceStatus} role="status">{conflictSegments.length === 0 ? "Alle tekstwijzigingen passen automatisch naast elkaar." : `${resolvedCount} van ${conflictSegments.length} overlappende tekstblokken gekozen.`}</p>
    <section className={styles.textProposal} aria-label="Samengevoegd tekstvoorstel">
      <h6>Voorstel in oorspronkelijke volgorde</h6>
      <p>Dit browservoorstel bevat nog geen exportbestand. Niet gekozen blokken blijven als open keuze zichtbaar.</p>
      <ol>{plan.segments.map((segment, index) => {
        const resolution = resolutions[`${granularity}:${segment.id}`];
        const text = segment.kind === "unchanged" ? segment.baseText
          : segment.kind === "automatic" ? segment.textA
            : resolution?.choice === "a" ? segment.textA
              : resolution?.choice === "b" ? segment.textB
                : resolution?.choice === "both" ? segment.textA + segment.textB
                  : resolution?.choice === "manual" ? resolution.manualText ?? "" : null;
        const status = segment.kind === "unchanged" ? "Ongewijzigde basistekst"
          : segment.kind === "automatic" ? `Veilig gecombineerd (${segment.source === "both" ? "A en B" : `bron ${segment.source}`})`
            : resolution ? `Keuze ${resolution.choice === "a" ? "A" : resolution.choice === "b" ? "B" : resolution.choice === "both" ? "beide fragmenten" : "handmatige tekst"}`
              : `Open conflict · blok ${index + 1}`;
        return <li key={segment.id}><span>{status}</span><pre>{text === null ? "Nog geen tekstkeuze" : text || "(leeg)"}</pre></li>;
      })}</ol>
    </section>
    <ol className={styles.textMergeSegments}>
      {plan.segments.map((segment, index) => {
        const key = `${granularity}:${segment.id}`;
        const resolution = resolutions[key];
        if (segment.kind === "unchanged") return null;
        if (segment.kind === "automatic") return <li key={segment.id} className={styles.textMergeSegment}>
          <strong>Blok {index + 1} · veilig automatisch meegenomen ({segment.source === "both" ? "staat in A en B" : `bron ${segment.source}`})</strong>
          <pre>{segment.textA}</pre>
          {segment.baseText !== segment.textA && <details className={styles.valueDisclosure}><summary>Oorspronkelijke basiswaarde die hierdoor vervalt</summary><pre>{segment.baseText || "(leeg; dit was een toevoeging)"}</pre></details>}
        </li>;
        const selectedText = resolution?.choice === "a" ? segment.textA
          : resolution?.choice === "b" ? segment.textB
            : resolution?.choice === "both" ? segment.textA + segment.textB
              : resolution?.choice === "manual" ? resolution.manualText ?? "" : null;
        const excludedText = resolution?.choice === "a" ? segment.textB
          : resolution?.choice === "b" ? segment.textA
            : resolution?.choice === "both" ? segment.baseText
              : resolution?.choice === "manual" ? `${segment.textA}\n\n--- bron B ---\n\n${segment.textB}` : null;
        const canKeepBoth = canKeepBothTextFragments(segment.textA, segment.textB);
        return <li key={segment.id} className={styles.textMergeSegment}>
          <strong>Blok {index + 1} · overlappende wijziging</strong>
          <div className={styles.textCandidateGrid}>
            <div><span>Basis</span><pre>{segment.baseText || "(geen basisregels in dit blok)"}</pre></div>
            <div><span>Bron A</span><pre>{segment.textA || "(dit blok is verwijderd)"}</pre></div>
            <div><span>Bron B</span><pre>{segment.textB || "(dit blok is verwijderd)"}</pre></div>
          </div>
          <div className={styles.conflictActions} role="group" aria-label={`Keuze voor tekstblok ${index + 1}`}>
            <button type="button" className={resolution?.choice === "a" ? styles.selectedDecision : styles.clearFileButton} aria-pressed={resolution?.choice === "a"} onClick={() => setResolution(segment, "a")}>Behoud A</button>
            <button type="button" className={resolution?.choice === "b" ? styles.selectedDecision : styles.clearFileButton} aria-pressed={resolution?.choice === "b"} onClick={() => setResolution(segment, "b")}>Behoud B</button>
            <button type="button" className={resolution?.choice === "both" ? styles.selectedDecision : styles.clearFileButton} aria-pressed={resolution?.choice === "both"} disabled={!canKeepBoth} onClick={() => setResolution(segment, "both")}>Neem beide fragmenten op</button>
            <button type="button" className={resolution?.choice === "manual" ? styles.selectedDecision : styles.clearFileButton} aria-pressed={resolution?.choice === "manual"} onClick={() => setResolution(segment, "manual")}>Bewerk tekst zelf</button>
          </div>
          {resolution?.choice === "manual" && <label className={styles.manualTextEditor}>Handmatig samengestelde tekst
            <textarea value={resolution.manualText ?? ""} rows={6} onChange={(event) => setManualText(segment, event.target.value)} />
          </label>}
          {selectedText !== null && <p className={styles.modeHint}>Voorlopige tekst voor dit blok:</p>}
          {selectedText !== null && <pre className={styles.textSelectionPreview}>{selectedText || "(leeg; dit blok wordt verwijderd)"}</pre>}
          {excludedText !== null && <details className={styles.valueDisclosure}><summary>Informatie die deze keuze buiten het blok laat</summary><pre>{quoted(excludedText) || "(leeg)"}</pre></details>}
          {!canKeepBoth && <p className={styles.modeHint}>Beide fragmenten kunnen hier niet veilig apart leesbaar blijven: er is geen bestaand regeleinde tussen de twee tekstwaarden.</p>}
          {resolution?.choice === "both" && <p className={styles.modeHint}>De bestaande regeleinden houden beide tekstfragmenten apart leesbaar. Ze worden exact in volgorde A en daarna B opgenomen. De basiswaarde van dit blok vervalt.</p>}
        </li>;
      })}
    </ol>
    <p className={styles.modeHint}>Dit is een tekstvoorstel in de browser. Ruwe bronwaarden blijven ongewijzigd; er wordt nog geen database of downloadbestand gemaakt.</p>
  </section>;
}
