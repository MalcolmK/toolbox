import { useRef, useState, type Ref } from "react";
import { buildSimpleJwLibrary } from "../archive/buildSimpleJwLibrary";
import type { JwLibraryWriteResult } from "../archive/writeJwLibrary";
import {
  AdvancedMergeInputError,
  prepareAdvancedMerge,
  SimpleMergeInputError,
  prepareSimpleMerge,
  type AdvancedMergePreview,
  type MergeInputCheck,
  type SimpleMergePreview,
} from "../merge/prepareSimpleMerge";
import { AdvancedMergeResults } from "./AdvancedMergeResults";
import { ArchiveDownload, type ArchiveDownloadSummary } from "./ArchiveDownload";
import { SimpleMergeResults } from "./SimpleMergeResults";
import { SourceFilePicker } from "./SourceFilePicker";
import styles from "./LibraryMergerPage.module.css";

interface LibraryMergerPageProps {
  readonly surfaceClassName: string;
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

type FilePair = [File | null, File | null];
type CheckPair = [MergeInputCheck | null, MergeInputCheck | null];

function createDownloadSummary(preview: SimpleMergePreview): ArchiveDownloadSummary {
  const recordsByTable: Record<string, number> = {};
  for (const record of preview.mergePlan.records) recordsByTable[record.tableName] = (recordsByTable[record.tableName] ?? 0) + 1;
  const formatOmittedValue = (value: unknown): string => {
    if (value === undefined) return "ontbrekende waarde";
    if (value === null) return "lege waarde";
    if (value instanceof Uint8Array) return `binaire inhoud (${value.byteLength} bytes)`;
    return String(value);
  };
  return {
    recordCount: preview.mergePlan.records.length,
    recordsByTable,
    choices: preview.mergePlan.report.choices.map((choice) =>
      `${choice.tableName}: ${choice.selectedSource ? `bron ${choice.selectedSource}` : "geen bron geselecteerd"}; ${choice.reason}`),
    uncertainties: [
      ...preview.mergePlan.report.warnings,
      ...preview.mergePlan.report.unresolved.map((record) => `${record.tableName}: ${record.reason}`),
    ],
    omissions: preview.mergePlan.report.informationLoss.map((loss) =>
      `${loss.tableName}.${loss.field}: waarde uit bron ${loss.omittedFrom} niet meegenomen: ${formatOmittedValue(loss.valueNotRetained)} (${loss.reason})`),
  };
}

export function LibraryMergerPage({ surfaceClassName, headingRef }: LibraryMergerPageProps) {
  const [files, setFiles] = useState<FilePair>([null, null]);
  const [checks, setChecks] = useState<CheckPair>([null, null]);
  const [baseFile, setBaseFile] = useState<File | null>(null);
  const [baseCheck, setBaseCheck] = useState<MergeInputCheck | null>(null);
  const [simplePreview, setSimplePreview] = useState<SimpleMergePreview | null>(null);
  const [advancedPreview, setAdvancedPreview] = useState<AdvancedMergePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildStageOpen, setBuildStageOpen] = useState(false);
  const [buildingArchive, setBuildingArchive] = useState(false);
  const [archiveWriteResult, setArchiveWriteResult] = useState<JwLibraryWriteResult | null>(null);
  const [archiveBuildError, setArchiveBuildError] = useState<string | null>(null);
  const buildGeneration = useRef(0);
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const canCompare = files[0] !== null && files[1] !== null && !busy;
  const activePreview = mode === "simple" ? simplePreview : null;

  const clearResults = () => {
    buildGeneration.current += 1;
    setSimplePreview(null);
    setAdvancedPreview(null);
    setError(null);
    setBuildStageOpen(false);
    setBuildingArchive(false);
    setArchiveWriteResult(null);
    setArchiveBuildError(null);
  };

  const chooseFile = (index: 0 | 1, file: File | null) => {
    setFiles((current) => {
      const next: FilePair = [...current];
      next[index] = file;
      return next;
    });
    setChecks((current) => {
      const next: CheckPair = [...current];
      next[index] = null;
      return next;
    });
    clearResults();
  };

  const chooseBaseFile = (file: File | null) => {
    setBaseFile(file);
    setBaseCheck(null);
    clearResults();
  };

  const compareFiles = async () => {
    const [fileA, fileB] = files;
    if (!fileA || !fileB) return;

    setBusy(true);
    buildGeneration.current += 1;
    setError(null);
    setSimplePreview(null);
    setAdvancedPreview(null);
    setBuildStageOpen(false);
    setBuildingArchive(false);
    setArchiveWriteResult(null);
    setArchiveBuildError(null);
    setChecks([null, null]);
    if (baseFile) setBaseCheck(null);

    try {
      if (mode === "advanced") {
        const result = await prepareAdvancedMerge(fileA, fileB, baseFile);
        setAdvancedPreview(result);
        setChecks([
          { source: "A", fileName: fileA.name, valid: true, schemaVersion: result.sources[0].schemaVersion, error: null },
          { source: "B", fileName: fileB.name, valid: true, schemaVersion: result.sources[1].schemaVersion, error: null },
        ]);
        setBaseCheck(result.baseSource ? {
          source: "basis",
          fileName: result.baseSource.fileName,
          valid: true,
          schemaVersion: result.baseSource.schemaVersion,
          error: null,
        } : null);
      } else {
        const result = await prepareSimpleMerge(fileA, fileB);
        setSimplePreview(result);
        setChecks([
          { source: "A", fileName: fileA.name, valid: true, schemaVersion: result.sources[0].schemaVersion, error: null },
          { source: "B", fileName: fileB.name, valid: true, schemaVersion: result.sources[1].schemaVersion, error: null },
        ]);
      }
    } catch (cause) {
      if (cause instanceof SimpleMergeInputError) {
        setChecks([...cause.checks]);
      } else if (cause instanceof AdvancedMergeInputError) {
        for (const check of cause.checks) {
          if (check.source === "basis") setBaseCheck(check);
          if (check.source === "A") setChecks(([ , b]) => [check, b]);
          if (check.source === "B") setChecks(([a]) => [a, check]);
        }
      } else {
        setError(cause instanceof Error
          ? cause.message
          : "De bestanden konden niet worden vergeleken. Probeer het opnieuw.");
      }
    } finally {
      setBusy(false);
    }
  };

  const buildArchive = async () => {
    if (!activePreview || activePreview.mergePlan.status !== "ready") return;
    const generation = ++buildGeneration.current;
    setBuildStageOpen(true);
    setBuildingArchive(true);
    setArchiveWriteResult(null);
    setArchiveBuildError(null);
    try {
      const result = await buildSimpleJwLibrary(activePreview);
      if (generation === buildGeneration.current) setArchiveWriteResult(result);
    } catch (cause) {
      if (generation === buildGeneration.current) {
        setArchiveBuildError(cause instanceof Error ? cause.message : "Het archief kon niet veilig worden opgebouwd.");
      }
    } finally {
      if (generation === buildGeneration.current) setBuildingArchive(false);
    }
  };

  const closeBuildStage = () => {
    buildGeneration.current += 1;
    setBuildingArchive(false);
    setArchiveWriteResult(null);
    setArchiveBuildError(null);
    setBuildStageOpen(false);
  };

  const changeMode = (nextMode: "simple" | "advanced") => {
    setMode(nextMode);
    clearResults();
  };

  return (
    <section className={`${surfaceClassName} ${styles.page}`} aria-labelledby="workflow-heading">
      <div className={styles.heading}>
        <h1 id="workflow-heading" ref={headingRef} tabIndex={-1}>JW Library Merger</h1>
        <p>Kies twee back-ups. De bestanden worden alleen in deze browser verwerkt.</p>
      </div>

      <fieldset className={styles.modeFieldset}>
        <legend>Merger-modus</legend>
        <label className={styles.modeOption}>
          <input type="radio" name="merge-mode" value="simple" checked={mode === "simple"} onChange={() => changeMode("simple")} />
          <span>Simpel</span>
        </label>
        <label className={styles.modeOption}>
          <input type="radio" name="merge-mode" value="advanced" checked={mode === "advanced"} onChange={() => changeMode("advanced")} />
          <span>Geavanceerd</span>
        </label>
        <p id="advanced-mode-note" className={styles.modeHint}>
          Geavanceerd vergelijkt A en B optioneel met een oudere basisversie. Zonder basis worden conflicten als mogelijk gemarkeerd.
        </p>
      </fieldset>

      <div className={styles.sectionHeading}>
        <div>
          <h2>Bronbestanden</h2>
          <p>Kies elk bestand bij de juiste bron. A en B zijn de twee versies die je later kunt samenvoegen.</p>
        </div>
      </div>

      <div className={`${styles.sourceGrid} ${mode === "advanced" ? styles.sourceGridAdvanced : ""}`}>
        {mode === "advanced" && (
          <SourceFilePicker source="basis" file={baseFile} check={baseCheck} busy={busy} onChoose={chooseBaseFile} />
        )}
        <SourceFilePicker source="A" file={files[0]} check={checks[0]} busy={busy} onChoose={(file) => chooseFile(0, file)} />
        <SourceFilePicker source="B" file={files[1]} check={checks[1]} busy={busy} onChoose={(file) => chooseFile(1, file)} />
      </div>

      <div className={styles.actions}>
        <button className={styles.actionButton} type="button" disabled={!canCompare} onClick={() => void compareFiles()}>
          {busy ? "Bestanden controleren en vergelijken…" : mode === "advanced" ? "Vergelijk wijzigingen" : "Controleer en maak mergeplan"}
        </button>
        {(simplePreview || advancedPreview) && (
          <button className={styles.clearFileButton} type="button" onClick={clearResults}>Resultaat wissen</button>
        )}
      </div>

      {error && <p className={styles.globalError} role="alert">{error}</p>}

      {activePreview && (
        <>
          <SimpleMergeResults preview={activePreview} />
          {activePreview.mergePlan.status === "ready" && !buildStageOpen && (
            <div className={styles.actions}>
              <button className={styles.actionButton} type="button" onClick={() => setBuildStageOpen(true)}>
                Naar bestand maken
              </button>
            </div>
          )}
          {activePreview.mergePlan.status === "needs-review" && (
            <p className={styles.notReadyNotice} role="status">
              De bestandsstap is geblokkeerd zolang er onopgeloste identiteiten, koppelingen of keuzes zijn.
              Los die later op in de geavanceerde modus.
            </p>
          )}
          {buildStageOpen && (
            <section className={styles.buildStage} aria-labelledby="build-stage-heading">
              <h2 id="build-stage-heading">Back-up opbouwen en controleren</h2>
              {buildingArchive && <p role="status">De database wordt opnieuw gevalideerd en lokaal opgebouwd…</p>}
              {archiveBuildError && <p className={styles.downloadError} role="alert">{archiveBuildError}</p>}
              {archiveWriteResult && <ArchiveDownload result={archiveWriteResult} summary={createDownloadSummary(activePreview)} />}
              {!buildingArchive && !archiveBuildError && !archiveWriteResult && (
                <button className={styles.actionButton} type="button" onClick={() => void buildArchive()}>
                  Bestand maken en controleren
                </button>
              )}
              <button className={styles.clearFileButton} type="button" onClick={closeBuildStage}>
                Terug naar het mergeplan en uitvoer wissen
              </button>
            </section>
          )}
        </>
      )}
      {mode === "advanced" && advancedPreview && <AdvancedMergeResults comparison={advancedPreview.comparison} />}
    </section>
  );
}
