import { useState, type Ref } from "react";
import { SimpleMergeInputError, prepareSimpleMerge, type MergeInputCheck, type SimpleMergePreview } from "../merge/prepareSimpleMerge";
import { SimpleMergeResults } from "./SimpleMergeResults";
import { SourceFilePicker } from "./SourceFilePicker";
import styles from "./LibraryMergerPage.module.css";

interface LibraryMergerPageProps {
  readonly surfaceClassName: string;
  readonly headingRef: Ref<HTMLHeadingElement>;
}

type FilePair = [File | null, File | null];
type CheckPair = [MergeInputCheck | null, MergeInputCheck | null];

export function LibraryMergerPage({ surfaceClassName, headingRef }: LibraryMergerPageProps) {
  const [files, setFiles] = useState<FilePair>([null, null]);
  const [checks, setChecks] = useState<CheckPair>([null, null]);
  const [preview, setPreview] = useState<SimpleMergePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildStageOpen, setBuildStageOpen] = useState(false);
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const canCompare = files[0] !== null && files[1] !== null && !busy;

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
    setPreview(null);
    setError(null);
    setBuildStageOpen(false);
  };

  const compareFiles = async () => {
    const [fileA, fileB] = files;
    if (!fileA || !fileB) return;

    setBusy(true);
    setError(null);
    setPreview(null);
    setBuildStageOpen(false);
    setChecks([null, null]);
    try {
      const nextPreview = await prepareSimpleMerge(fileA, fileB);
      setPreview(nextPreview);
      setChecks([
        { source: "A", fileName: fileA.name, valid: true, schemaVersion: nextPreview.sources[0].schemaVersion, error: null },
        { source: "B", fileName: fileB.name, valid: true, schemaVersion: nextPreview.sources[1].schemaVersion, error: null },
      ]);
    } catch (cause) {
      if (cause instanceof SimpleMergeInputError) {
        setChecks([...cause.checks]);
      } else {
        setError(cause instanceof Error
          ? cause.message
          : "De bestanden konden niet worden vergeleken. Probeer het opnieuw.");
      }
    } finally {
      setBusy(false);
    }
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
          <input type="radio" name="merge-mode" value="simple" checked={mode === "simple"} onChange={() => setMode("simple")} />
          <span>Simpel</span>
        </label>
        <label className={styles.modeOption}>
          <input type="radio" name="merge-mode" value="advanced" disabled aria-describedby="advanced-mode-note" />
          <span>Geavanceerd</span>
        </label>
        <p id="advanced-mode-note" className={styles.modeHint}>
          De geavanceerde modus wordt in een latere stap toegevoegd. Simpel is nu de beschikbare standaardmodus.
        </p>
      </fieldset>

      <div className={styles.sectionHeading}>
        <div>
          <h2>Bronbestanden</h2>
          <p>Kies elk bestand bij de juiste bron. De volgorde bepaalt alleen de labels A en B.</p>
        </div>
      </div>

      <div className={styles.sourceGrid}>
        <SourceFilePicker source="A" file={files[0]} check={checks[0]} busy={busy} onChoose={(file) => chooseFile(0, file)} />
        <SourceFilePicker source="B" file={files[1]} check={checks[1]} busy={busy} onChoose={(file) => chooseFile(1, file)} />
      </div>

      <div className={styles.actions}>
        <button className={styles.actionButton} type="button" disabled={!canCompare} onClick={() => void compareFiles()}>
          {busy ? "Bestanden controleren en vergelijken…" : "Controleer en maak mergeplan"}
        </button>
        {preview && (
          <button className={styles.clearFileButton} type="button" onClick={() => {
            setPreview(null);
            setChecks([null, null]);
            setBuildStageOpen(false);
          }}>
            Resultaat wissen
          </button>
        )}
      </div>

      {error && <p className={styles.globalError} role="alert">{error}</p>}

      {preview && (
        <>
          <SimpleMergeResults preview={preview} />
          {preview.mergePlan.status === "ready" && !buildStageOpen && (
            <div className={styles.actions}>
              <button className={styles.actionButton} type="button" onClick={() => setBuildStageOpen(true)}>
                Naar bestand maken
              </button>
            </div>
          )}
          {preview.mergePlan.status === "needs-review" && (
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
    </section>
  );
}
