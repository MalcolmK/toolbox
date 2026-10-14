import { useEffect, useMemo, useState } from "react";
import type { ThreeWayOutcome, ThreeWayRecordDecision } from "../compare/compareThreeWay";
import { mergeNoteText } from "../compare/mergeNoteText";
import type { MergeDecisionAction, MergeDecisionTimestamp, MergeDecisionValue } from "../types";
import { advancedDecisionKey, buildAdvancedMergePlan, emptyNoteTextReviewState, type AdvancedMergeReviewState, type NoteTextReviewState } from "../merge/advancedMerge";
import type { AdvancedMergePreview } from "../merge/prepareSimpleMerge";
import type { SimpleMergeResult } from "../merge/simpleMerge";
import { NoteTextReview } from "./NoteTextReview";
import styles from "./LibraryMergerPage.module.css";

const outcomeLabels: Readonly<Record<ThreeWayOutcome, string>> = {
  unchanged: "Geen wijziging", "changed-in-a": "Wijziging alleen in A", "changed-in-b": "Wijziging alleen in B",
  "same-change": "Dezelfde wijziging in A en B", "non-overlapping": "Niet-overlappende wijzigingen", conflict: "Conflict", uncertain: "Onzeker gekoppeld",
};
const tableLabels: Readonly<Record<string, string>> = {
  BlockRange: "Markeerbereik", Bookmark: "Bladwijzer", InputField: "Invoerveld", LastModified: "Databasetijd",
  Location: "Publicatie- of mediaplek", Note: "Aantekening", Tag: "Label", TagMap: "Labelkoppeling", UserMark: "Markering",
};
const visibleOutcomes: readonly ThreeWayOutcome[] = ["changed-in-a", "changed-in-b", "same-change", "non-overlapping", "conflict", "uncertain"];
const actionLabels: Readonly<Partial<Record<MergeDecisionAction, string>>> = {
  "take-a": "Behoud A", "take-b": "Behoud B", "combine-non-overlapping": "Combineer veilige wijzigingen", "keep-both": "Bewaar beide",
};
const timestampLabels: Readonly<Record<MergeDecisionTimestamp["kind"], string>> = {
  archive: "Archief aangemaakt", manifest: "Manifest gewijzigd", database: "Database gewijzigd", record: "Recordtijd",
};

function displayValue(value: MergeDecisionValue): string {
  if (value.presence === "missing") return "(ontbreekt)";
  if (value.value === null) return "(leeg)";
  if (value.value instanceof Uint8Array) return `Binaire waarde (${value.value.byteLength} bytes)`;
  const text = String(value.value);
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

function fullDisplayValue(value: MergeDecisionValue): string {
  if (value.presence === "missing") return "(ontbreekt)";
  if (value.value === null) return "(leeg)";
  if (value.value instanceof Uint8Array) return `Binaire waarde (${value.value.byteLength} bytes)`;
  return String(value.value);
}

function displayTime(timestamp: MergeDecisionTimestamp): string {
  const time = timestamp.value;
  if (time.status === "missing") return "niet aanwezig";
  if (time.status === "invalid") return `niet herkenbaar: ${time.sourceText ?? "onbekende waarde"}`;
  return `${time.utc} (bronwaarde: ${time.sourceText})`;
}

function recordKey(record: ThreeWayRecordDecision, index: number): string {
  return advancedDecisionKey(record.tableName, record.logicalIdentity.key, index);
}

interface ReviewDecisionUnit {
  readonly key: string;
  readonly label: string;
  readonly complete: boolean;
}

interface LossEntry {
  readonly key: string;
  readonly label: string;
  readonly summary: string;
  readonly excludedValue: string;
}

function textValue(value: MergeDecisionValue | null): string | null {
  return value?.presence === "present" && typeof value.value === "string" ? value.value : null;
}

function noteTextInputs(record: ThreeWayRecordDecision) {
  if (record.tableName !== "Note" || record.logicalIdentity.confidence !== "stable") return null;
  const content = record.differences.find((difference) => difference.path === "Content");
  const base = textValue(content?.baseValue ?? null);
  const a = textValue(content?.valueA ?? null);
  const b = textValue(content?.valueB ?? null);
  return base === null || a === null || b === null ? null : { base, a, b };
}

function canResolveRecordByText(record: ThreeWayRecordDecision): boolean {
  return record.conflictStatus === "confirmed"
    && record.overlappingChanges.every((change) => change.path === "Content")
    && noteTextInputs(record) !== null;
}

function buildDecisionUnits(
  items: readonly { readonly record: ThreeWayRecordDecision; readonly key: string }[],
  choices: Readonly<Record<string, MergeDecisionAction>>,
  textStates: Readonly<Record<string, NoteTextReviewState>>,
  textPlans: ReadonlyMap<string, ReturnType<typeof mergeNoteText>>,
): ReviewDecisionUnit[] {
  return items.flatMap(({ record, key }) => {
    if (record.outcome !== "conflict" && record.outcome !== "uncertain") return [];
    const recordLabel = record.sourceA?.recordLabel ?? record.sourceB?.recordLabel ?? "Gegeven";
    if (choices[key] === "take-a" || choices[key] === "take-b") {
      return [{ key: `record:${key}`, label: recordLabel, complete: true }];
    }
    if (!canResolveRecordByText(record)) {
      return [{ key: `record:${key}`, label: recordLabel, complete: false }];
    }
    const state = textStates[key] ?? emptyNoteTextReviewState;
    const segments = textPlans.get(key)?.segments.filter((segment) => segment.kind === "conflict") ?? [];
    return segments.map((segment, index) => ({
      key: `text:${key}:${state.granularity}:${segment.id}`,
      label: `${recordLabel} · ${state.granularity === "block" ? "blok" : "regel"} ${index + 1}`,
      complete: state.resolutions[`${state.granularity}:${segment.id}`] !== undefined,
    }));
  });
}

function valueChanged(a: MergeDecisionValue, b: MergeDecisionValue): boolean {
  if (a.presence !== b.presence) return true;
  if (a.presence === "missing" || b.presence === "missing") return false;
  const valueA = a.value;
  const valueB = b.value;
  if (valueA instanceof Uint8Array && valueB instanceof Uint8Array) {
    return valueA.length !== valueB.length || !valueA.every((value, index) => value === valueB[index]);
  }
  return valueA !== valueB;
}

function collectLossEntries(
  items: readonly { readonly record: ThreeWayRecordDecision; readonly key: string }[],
  choices: Readonly<Record<string, MergeDecisionAction>>,
  textStates: Readonly<Record<string, NoteTextReviewState>>,
  textPlans: ReadonlyMap<string, ReturnType<typeof mergeNoteText>>,
): LossEntry[] {
  const losses: LossEntry[] = [];
  for (const { record, key } of items) {
    const action = choices[key];
    const label = record.sourceA?.recordLabel ?? record.sourceB?.recordLabel ?? "Gegeven";
    if (action === "take-a" || action === "take-b") {
      const excludedSide = action === "take-a" ? "B" : "A";
      for (const difference of record.differences) {
        const kept = action === "take-a" ? difference.valueA : difference.valueB;
        const excluded = action === "take-a" ? difference.valueB : difference.valueA;
        if (!valueChanged(kept, excluded)) continue;
        losses.push({
          key: `record:${key}:${difference.path}`,
          label: `${label} · ${difference.label}`,
          summary: `Behoud ${action === "take-a" ? "A" : "B"}; de waarde uit bron ${excludedSide} wordt niet meegenomen.`,
          excludedValue: fullDisplayValue(excluded),
        });
      }
      continue;
    }
    const inputs = noteTextInputs(record);
    if (!inputs) continue;
    const state = textStates[key] ?? emptyNoteTextReviewState;
    const plan = textPlans.get(key);
    if (!plan) continue;
    for (const segment of plan.segments) {
      const segmentLabel = `${label} · ${state.granularity === "block" ? "blok" : "regel"} ${segment.id}`;
      if (segment.kind === "automatic") {
        if (segment.baseText !== segment.textA && segment.baseText) losses.push({
          key: `auto:${key}:${segment.id}`, label: segmentLabel,
          summary: `De wijziging uit ${segment.source ?? "een bron"} wordt automatisch voorgesteld; de oude basisinhoud vervalt.`,
          excludedValue: fullDisplayValue({ presence: "present", value: segment.baseText }),
        });
        continue;
      }
      if (segment.kind !== "conflict") continue;
      if (!canResolveRecordByText(record)) continue;
      const resolution = state.resolutions[`${state.granularity}:${segment.id}`];
      if (!resolution) continue;
      const excluded = resolution.choice === "a" ? segment.textB
        : resolution.choice === "b" ? segment.textA
          : resolution.choice === "both" ? segment.baseText
            : null;
      if (resolution.choice === "manual") {
        losses.push({
          key: `manual:${key}:${segment.id}`, label: segmentLabel,
          summary: "Handmatige tekst vervangt de bronfragmenten. De app kan niet bepalen welke oorspronkelijke passages zijn overgenomen.",
          excludedValue: `Bron A:\n${segment.textA}\n\nBron B:\n${segment.textB}`,
        });
      } else if (excluded !== null && excluded.length > 0) {
        const excludedSide = resolution.choice === "a" ? "B" : resolution.choice === "b" ? "A" : "basis";
        losses.push({
          key: `text:${key}:${segment.id}`, label: segmentLabel,
          summary: resolution.choice === "both" ? "Beide bronfragmenten worden opgenomen; de oorspronkelijke basisinhoud vervalt." : `Behoud ${resolution.choice.toUpperCase()}; dit tekstfragment wordt niet meegenomen.`,
          excludedValue: `${excludedSide}:\n${excluded}`,
        });
      }
    }
  }
  return losses;
}

export function AdvancedMergeResults({ preview, onPlanChange }: {
  readonly preview: AdvancedMergePreview;
  readonly onPlanChange?: (plan: SimpleMergeResult) => void;
}) {
  const { comparison } = preview;
  const [choices, setChoices] = useState<Readonly<Record<string, MergeDecisionAction>>>({});
  const [noteTextStates, setNoteTextStates] = useState<Readonly<Record<string, NoteTextReviewState>>>({});
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const reviewState: AdvancedMergeReviewState = { choices, noteTextStates, reviewConfirmed };
  const mergePlan = useMemo(() => buildAdvancedMergePlan(preview, reviewState), [preview, choices, noteTextStates, reviewConfirmed]);
  useEffect(() => { onPlanChange?.(mergePlan); }, [mergePlan, onPlanChange]);
  const changedRecords = comparison.records.filter((record) => record.outcome !== "unchanged");
  const reviewItems = useMemo(() => comparison.records
      .map((record, index) => ({ record, key: recordKey(record, index) }))
      .filter(({ record }) => record.outcome === "conflict" || record.outcome === "uncertain"
        || (record.tableName === "Note" && ["changed-in-a", "changed-in-b", "non-overlapping"].includes(record.outcome)))
      .sort((left, right) => {
        const rank = (outcome: ThreeWayOutcome) => outcome === "conflict" ? 0 : outcome === "uncertain" ? 1 : 2;
        return rank(left.record.outcome) - rank(right.record.outcome)
          || left.record.tableName.localeCompare(right.record.tableName)
          || left.key.localeCompare(right.key);
      }), [comparison.records]);
  const [activeIndex, setActiveIndex] = useState(0);
  const current = reviewItems[activeIndex];
  const textPlans = useMemo(() => {
    const plans = new Map<string, ReturnType<typeof mergeNoteText>>();
    for (const { record, key } of reviewItems) {
      const inputs = noteTextInputs(record);
      if (inputs) {
        const state = noteTextStates[key] ?? emptyNoteTextReviewState;
        plans.set(key, mergeNoteText(inputs.base, inputs.a, inputs.b, state.granularity));
      }
    }
    return plans;
  }, [reviewItems, noteTextStates]);
  const decisionUnits = useMemo(() => buildDecisionUnits(reviewItems, choices, noteTextStates, textPlans),
    [reviewItems, choices, noteTextStates, textPlans]);
  const completedUnits = decisionUnits.filter((unit) => unit.complete).length;
  const pendingUnits = decisionUnits.filter((unit) => !unit.complete);
  const losses = useMemo(() => collectLossEntries(reviewItems, choices, noteTextStates, textPlans),
    [reviewItems, choices, noteTextStates, textPlans]);

  const choose = (key: string, action: MergeDecisionAction) => {
    setReviewConfirmed(false);
    setChoices((previous) => ({ ...previous, [key]: action }));
    if (action === "take-a" || action === "take-b") {
      setNoteTextStates((previous) => {
        if (!previous[key]) return previous;
        const next = { ...previous };
        delete next[key];
        return next;
      });
    }
  };

  return (
    <section className={styles.results} aria-labelledby="advanced-results-heading">
      <div className={styles.resultsHeading}>
        <div>
          <h2 id="advanced-results-heading">Driewegvergelijking</h2>
          <p>Back-up A en B zijn de twee bronbestanden. De basisversie is alleen gebruikt om wijzigingen te herkennen.</p>
        </div>
        <span className={styles.reviewBadge}>{comparison.baseFileName ? "Basisversie gebruikt" : "Tweewegvergelijking"}</span>
      </div>
      {comparison.baseFileName ? <p className={styles.planSummary}>Basisversie: {comparison.baseFileName}</p> : (
        <p className={styles.notReadyNotice} role="status">Zonder basisversie zijn verschillen alleen mogelijke conflicten; de app kan niet vaststellen wie een veld eerder heeft gewijzigd.</p>
      )}
      <dl className={styles.summaryGrid}>
        {visibleOutcomes.map((outcome) => <div key={outcome}><dt>{outcomeLabels[outcome]}</dt><dd>{comparison.summary[outcome]}</dd></div>)}
      </dl>

      <section className={styles.decisionOverview} aria-labelledby="decision-overview-heading">
        <div className={styles.reviewTitle}><div><h3 id="decision-overview-heading">Keuzes in deze sessie</h3><p>Je kunt teruggaan en elke keuze aanpassen zolang deze vergelijking openstaat.</p></div>
          <span className={styles.reviewBadge} aria-live="polite">{completedUnits} van {decisionUnits.length} beslissingen afgerond</span>
        </div>
        {pendingUnits.length > 0 && <ul className={styles.pendingDecisionList}>{pendingUnits.map((unit) => <li key={unit.key}>{unit.label}: nog geen keuze</li>)}</ul>}
        <button className={styles.actionButton} type="button" disabled={pendingUnits.length > 0} onClick={() => setReviewConfirmed(true)}>
          {pendingUnits.length > 0 ? "Resterende keuzes beoordelen" : "Besluiten afronden"}
        </button>
        {reviewConfirmed && <p className={styles.choiceStatus} role="status">Alle vereiste beslissingen zijn ingevuld. De keuzes blijven aanpasbaar zolang deze vergelijking openstaat.</p>}
        {reviewConfirmed && mergePlan.status === "ready" && <p className={styles.choiceStatus} role="status">De keuzes zijn veilig vertaald naar een databaseplan. De bronbestanden en vergelijkingsbasis zijn niet gewijzigd; de uitvoerstap volgt hierna.</p>}
        {reviewConfirmed && mergePlan.status === "needs-review" && <div className={styles.notReadyNotice} role="status"><strong>Geen uitvoerbaar databaseplan</strong><ul>{mergePlan.report.unresolved.map((item, index) => <li key={`${item.tableName}-${item.identityKey ?? index}`}>{item.tableName}: {item.reason}</li>)}</ul></div>}
      </section>

      <section className={styles.lossOverview} aria-labelledby="loss-overview-heading">
        <div><h3 id="loss-overview-heading">Voorlopig informatieverlies</h3><p>Dit overzicht toont bron- of basiswaarden die volgens de huidige keuzes niet in het voorstel komen.</p></div>
        {losses.length === 0 ? <p className={styles.emptyMessage}>Er is nog geen uitgesloten waarde vastgesteld. Bij open keuzes zie je beide alternatieven in de review.</p> : (
          <ul className={styles.lossList}>{losses.map((loss) => <li key={loss.key}>
            <strong>{loss.label}</strong><p>{loss.summary}</p>
            <details className={styles.valueDisclosure}><summary>Bekijk uitgesloten inhoud</summary><pre>{loss.excludedValue}</pre></details>
          </li>)}</ul>
        )}
      </section>

      <section className={styles.conflictReview} aria-labelledby="conflict-review-heading">
        <div className={styles.reviewTitle}>
          <div><h3 id="conflict-review-heading">Conflicten beoordelen</h3><p>Elke keuze blijft voorlopig en is tijdens deze vergelijking aanpasbaar.</p></div>
          {reviewItems.length > 0 && <span className={styles.reviewBadge}>{completedUnits} van {decisionUnits.length} beslissingen afgerond</span>}
        </div>
        {reviewItems.length === 0 ? <p className={styles.emptyMessage}>Er zijn geen conflicten die nu een keuze vragen.</p> : current && (
          <article className={styles.conflictCard} aria-label={`Review item ${activeIndex + 1} van ${reviewItems.length}`}>
            <div className={styles.conflictNavigation}>
              <button className={styles.clearFileButton} type="button" disabled={activeIndex === 0} onClick={() => setActiveIndex((index) => index - 1)}>Vorig conflict</button>
              <span aria-live="polite">Item {activeIndex + 1} van {reviewItems.length}</span>
              <button className={styles.clearFileButton} type="button" disabled={activeIndex === reviewItems.length - 1} onClick={() => setActiveIndex((index) => index + 1)}>Volgend conflict</button>
            </div>
            <h4>{tableLabels[current.record.tableName] ?? "Gegeven"} · {outcomeLabels[current.record.outcome]}</h4>
            <p>{current.record.reason}</p>
            {(current.record.outcome === "conflict" || current.record.outcome === "uncertain") && <p className={styles.conflictPrompt}>{current.record.conflictReason ?? "Kies welke bronwaarde behouden moet blijven."}</p>}

            <div className={styles.conflictSources}>
              <SourcePanel label="Bron A" source={current.record.sourceA} record={current.record} side="A" />
              <SourcePanel label="Bron B" source={current.record.sourceB} record={current.record} side="B" />
              {current.record.baseVersion && <SourcePanel label="Basis" source={current.record.baseVersion} record={current.record} side="base" />}
            </div>
            {current.record.tableName === "Note" && <NoteTextReview
              record={current.record}
              stateKey={current.key.replaceAll(":", "-")}
              state={noteTextStates[current.key] ?? emptyNoteTextReviewState}
              onChange={(next) => {
                setReviewConfirmed(false);
                setNoteTextStates((previous) => ({ ...previous, [current.key]: next }));
                setChoices((previous) => {
                  if (!previous[current.key]) return previous;
                  const updated = { ...previous };
                  delete updated[current.key];
                  return updated;
                });
              }}
            />}
            {(current.record.outcome === "conflict" || current.record.outcome === "uncertain") && <div className={styles.conflictActions} role="group" aria-label="Keuze voor dit conflict">
              {(["take-a", "take-b"] as const).map((action) => (
                <button key={action} className={choices[current.key] === action ? styles.selectedDecision : styles.actionButton} type="button" aria-pressed={choices[current.key] === action} onClick={() => choose(current.key, action)}>{actionLabels[action]}</button>
              ))}
              <p className={styles.modeHint}>Combineren is hier niet veilig: de bronnen hebben dezelfde waarde of hetzelfde blok verschillend aangepast.</p>
              <p className={styles.modeHint}>Beide bewaren is nog niet veilig beschikbaar: er is nog geen nieuwe identiteit met bijgewerkte koppelingen aangemaakt.</p>
            </div>}
            {(current.record.outcome === "conflict" || current.record.outcome === "uncertain") && <p className={styles.choiceStatus} role="status">{choices[current.key] ? `Voorlopige keuze: ${actionLabels[choices[current.key]!]}` : "Nog geen keuze voor dit conflict"}</p>}
          </article>
        )}
      </section>

      <section aria-labelledby="advanced-records-heading">
        <h3 id="advanced-records-heading">Verschillende records ({changedRecords.length})</h3>
        {changedRecords.length === 0 ? <p className={styles.emptyMessage}>Er zijn geen inhoudelijke wijzigingen vastgesteld.</p> : (
          <ul className={styles.detailList}>
            {changedRecords.map((record, index) => <li key={recordKey(record, index)}>
              <strong>{tableLabels[record.tableName] ?? "Gegeven"} · {outcomeLabels[record.outcome]}</strong>
              <p>{record.reason}</p><p>A: {record.sourceA?.recordLabel ?? "record ontbreekt"}; B: {record.sourceB?.recordLabel ?? "record ontbreekt"}.</p>
              {record.differences.map((difference) => <p key={difference.path}>{difference.label}: A «{displayValue(difference.valueA)}» · B «{displayValue(difference.valueB)}»{difference.baseValue && ` · basis «${displayValue(difference.baseValue)}»`}</p>)}
            </li>)}
          </ul>
        )}
      </section>
      <p className={styles.modeHint}>Deze stap maakt nog geen mergebestand en past geen bron aan. De keuzes zijn alleen zichtbaar zolang deze vergelijking openstaat.</p>
    </section>
  );
}

function SourcePanel({ label, source, record, side }: {
  readonly label: string;
  readonly source: ThreeWayRecordDecision["sourceA"] | ThreeWayRecordDecision["baseVersion"];
  readonly record: ThreeWayRecordDecision;
  readonly side: "A" | "B" | "base";
}) {
  const times = record.timestamps.filter((time) => time.source === (side === "base" ? "basis" : side));
  return <section className={styles.sourceEvidence} aria-label={label}>
    <h5>{label}</h5>
    <p>{source?.fileName ?? "Record ontbreekt in deze bron"}</p>
    {source && <p>{source.recordLabel}</p>}
    <ul>{times.map((time) => <li key={`${time.kind}:${time.field}`}>{timestampLabels[time.kind]}{time.kind === "record" ? ` (${time.field})` : ""}: {displayTime(time)}</li>)}</ul>
    <h6>Waarden</h6>
    {record.differences.length === 0 ? <p>Geen afwijkende velden.</p> : <ul>{record.differences.map((difference) => {
      const value = side === "A" ? difference.valueA : side === "B" ? difference.valueB : difference.baseValue;
      return <li key={difference.path}><strong>{difference.label}:</strong> {value ? displayValue(value) : "(geen basis beschikbaar)"}</li>;
    })}</ul>}
  </section>;
}
