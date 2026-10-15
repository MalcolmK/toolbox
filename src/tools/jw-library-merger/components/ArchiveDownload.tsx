import { useEffect, useRef, useState } from "react";
import type { JwLibraryWriteResult } from "../archive/writeJwLibrary";
import styles from "./LibraryMergerPage.module.css";

export interface ArchiveDownloadSummary {
  readonly recordCount: number;
  readonly recordsByTable: Readonly<Record<string, number>>;
  readonly choices: readonly string[];
  readonly uncertainties: readonly string[];
  readonly omissions: readonly string[];
}

interface ArchiveDownloadProps {
  readonly result: JwLibraryWriteResult;
  readonly summary: ArchiveDownloadSummary;
}

export function ArchiveDownload({ result, summary }: ArchiveDownloadProps) {
  const [downloaded, setDownloaded] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const objectUrls = useRef(new Map<string, number>());

  useEffect(() => () => {
    for (const [url, timer] of objectUrls.current) {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    objectUrls.current.clear();
  }, []);

  const startDownload = () => {
    if (result.status !== "ready") return;
    setDownloadError(null);
    try {
      const blobBuffer = new ArrayBuffer(result.bytes.byteLength);
      new Uint8Array(blobBuffer).set(result.bytes);
      const blob = new Blob([blobBuffer], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const timer = window.setTimeout(() => {
        URL.revokeObjectURL(url);
        objectUrls.current.delete(url);
      }, 60_000);
      objectUrls.current.set(url, timer);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      setDownloaded(true);
    } catch {
      setDownloadError("De browser kon de download niet starten. Probeer het opnieuw.");
    }
  };

  return (
    <section className={styles.downloadPanel} aria-labelledby="archive-download-heading">
      <div>
        <h3 id="archive-download-heading">Download samengevoegde back-up</h3>
        <p>Het bestand wordt alleen aangeboden nadat database, manifest, mediabestanden en ZIP-controle zijn geslaagd.</p>
      </div>
      {result.status === "ready" && result.verification === "poc-unverified" && (
        <div className={styles.downloadBlocked} role="note" aria-label="POC-waarschuwing">
          <strong>POC-bestand · JW Library-acceptatie is niet geverifieerd</strong>
          <p>De hash is voorlopig overgenomen uit bron {result.hashSource ?? "onbekend"} en is niet gecontroleerd. De .jwlibrary-bestandsextensie bewijst niet dat JW Library het bestand accepteert. Download alleen als POC en controleer de acceptatie zelf.</p>
        </div>
      )}
      {result.status === "blocked" && (
        <div className={styles.downloadBlocked} role="status">
          <strong>Download geblokkeerd</strong>
          <ul>{result.issues.map((issue, index) => <li key={`${issue.code}-${issue.path ?? index}`}>{issue.message}</li>)}</ul>
        </div>
      )}
      <button className={styles.actionButton} type="button" disabled={result.status !== "ready"} onClick={startDownload}>
        {result.status !== "ready"
          ? "Download niet beschikbaar"
          : result.verification === "poc-unverified"
            ? `Download POC-bestand · ${result.fileName}`
            : `Download ${result.fileName}`}
      </button>
      {downloadError && <p className={styles.downloadError} role="alert">{downloadError}</p>}
      {downloaded && result.status === "ready" && (
        <div className={styles.downloadSummary} role="status" aria-live="polite">
          <h4>Je mergebestand wordt gedownload: {result.fileName}</h4>
          <p>{summary.recordCount} opgenomen mergeplanrecords in {Object.keys(summary.recordsByTable).length} tabellen.</p>
          <details><summary>Gemaakte keuzes ({summary.choices.length})</summary>{summary.choices.length ? <ul>{summary.choices.map((choice, index) => <li key={`${index}-${choice}`}>{choice}</li>)}</ul> : <p>Geen verschillende bronwaarden geselecteerd.</p>}</details>
          <details><summary>Aandachtspunten ({summary.uncertainties.length})</summary>{summary.uncertainties.length ? <ul>{summary.uncertainties.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p>Geen open onzekerheden gerapporteerd.</p>}</details>
          <details><summary>Niet meegenomen informatie ({summary.omissions.length})</summary>{summary.omissions.length ? <ul>{summary.omissions.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p>Er is geen uitgesloten waarde gerapporteerd.</p>}</details>
          <details><summary>Aantallen per tabel</summary><ul>{Object.entries(summary.recordsByTable).map(([table, count]) => <li key={table}>{table}: {count}</li>)}</ul></details>
        </div>
      )}
    </section>
  );
}
