import type { ChangeEvent } from "react";
import type { MergeInputCheck } from "../merge/prepareSimpleMerge";
import styles from "./LibraryMergerPage.module.css";

interface SourceFilePickerProps {
  readonly source: "A" | "B" | "basis";
  readonly file: File | null;
  readonly check: MergeInputCheck | null;
  readonly busy: boolean;
  readonly onChoose: (file: File | null) => void;
}

export function SourceFilePicker({ source, file, check, busy, onChoose }: SourceFilePickerProps) {
  const sourceLabel = source === "basis" ? "basisversie" : `Back-up ${source}`;
  const inputId = `library-source-${source.toLowerCase()}`;
  const statusId = `${inputId}-status`;
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChoose(event.currentTarget.files?.[0] ?? null);
    event.currentTarget.value = "";
  };

  let status = "Nog geen bestand gecontroleerd.";
  let statusClass = styles.statusIdle;
  if (busy) {
    status = "Bestand wordt gecontroleerd…";
    statusClass = styles.statusWorking;
  } else if (check?.valid) {
    status = "Geldig JW Library-bestand.";
    statusClass = styles.statusValid;
  } else if (check && !check.valid) {
    status = check.error ?? "Dit bestand kon niet worden gevalideerd.";
    statusClass = styles.statusInvalid;
  } else if (file) {
    status = "Geselecteerd, nog niet gecontroleerd.";
  }

  return (
    <div className={styles.sourceCard}>
      <div className={styles.sourceHeading}>
          <h2>{sourceLabel}</h2>
      </div>
      <label className={styles.fileLabel} htmlFor={inputId}>
        Kies een .jwlibrary-bestand voor {sourceLabel}
      </label>
      <input
        id={inputId}
        className={styles.fileInput}
        type="file"
        accept=".jwlibrary,application/zip"
        aria-describedby={statusId}
        disabled={busy}
        onChange={handleChange}
      />
      <p className={styles.fileName} title={file?.name ?? undefined}>
        {file?.name ?? "Nog geen bestand gekozen"}
      </p>
      <p id={statusId} className={`${styles.sourceStatus} ${statusClass}`} role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
