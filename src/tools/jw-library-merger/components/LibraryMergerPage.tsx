import { useState, type Ref } from "react";
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
import { SimpleMergeResults } from "./SimpleMergeResults";
import { SourceFilePicker } from "./SourceFilePicker";
import styles from "./LibraryMergerPage.module.css";

interface LibraryMergerPageProps {
  readonly surfaceClassName: string;
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

type FilePair = [File | null, File | null];
type CheckPair = [MergeInputCheck | null, MergeInputCheck | null];

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
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const canCompare = files[0] !== null && files[1] !== null && !busy;
  const activePreview = mode === "simple" ? simplePreview : null;

  const clearResults = () => {
    setSimplePreview(null);
    setAdvancedPreview(null);
    setError(null);
    setBuildStageOpen(false);
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
    setError(null);
    setSimplePreview(null);
    setAdvancedPreview(null);
    setBuildStageOpen(false);
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
              <h2 id="build-stage-heading">Mergeplan klaar voor de bestandsstap</h2>
              <p>
                Er zijn geen open mergekeuzes. Het maken en downloaden van een nieuw .jwlibrary-bestand
                wordt in een latere stap aangesloten; er is nu nog geen bestand gemaakt.
              </p>
              <button className={styles.clearFileButton} type="button" onClick={() => setBuildStageOpen(false)}>
                Terug naar het mergeplan
              </button>
            </section>
          )}
        </>
      )}
      {mode === "advanced" && advancedPreview && <AdvancedMergeResults comparison={advancedPreview.comparison} />}
    </section>
  );
}
