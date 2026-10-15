import { useRef, useState, type Ref } from "react";
import { buildSimplePocJwLibrary } from "../archive/buildSimplePocJwLibrary";
import type { JwLibraryWriteResult } from "../archive/writeJwLibrary";
import type { SimpleMergeResult } from "../merge/simpleMerge";
import { simpleMerge } from "../merge/simpleMerge";
import { compareLibraries } from "../compare/compareLibraries";
import { buildMergeReport } from "../report/buildMergeReport";
import { SimpleMergeInputError, prepareSimpleMerge, type MergeInputCheck, type SimpleMergePreview } from "../merge/prepareSimpleMerge";
import type { PublicationConflictGroup } from "../merge/publicationConflicts";
import { getLocationProposalGroups, type LocationProposalGroup } from "../merge/locationProposalGroups";
import { createPlaylistResolutionContext, confirmPlaylistProposal, keepPlaylistSeparate, markPlaylistsDifferent, revokePlaylistConfirmation, revokePlaylistDifferentDecision, isPlaylistResolutionContextCurrent, type PlaylistProposal, type PlaylistUnresolvedItem } from "../merge/playlistResolution";
import {
  confirmLocationProposal,
  markLocationDifferent,
  revokeLocationConfirmation,
  type LocationResolutionContext,
  type LocationSource,
} from "../merge/locationResolution";
import { ArchiveDownload, type ArchiveDownloadSummary } from "./ArchiveDownload";
import { SimpleMergeResults } from "./SimpleMergeResults";
import { PlaylistResolutionReview } from "./PlaylistResolutionReview";
import { SourceFilePicker } from "./SourceFilePicker";
import styles from "./LibraryMergerPage.module.css";

interface LibraryMergerPageProps {
  readonly surfaceClassName: string;
  readonly headingRef?: Ref<HTMLHeadingElement>;
}

type FilePair = [File | null, File | null];
type CheckPair = [MergeInputCheck | null, MergeInputCheck | null];

function createDownloadSummary(plan: SimpleMergeResult): ArchiveDownloadSummary {
  const recordsByTable: Record<string, number> = {};
  for (const record of plan.records) recordsByTable[record.tableName] = (recordsByTable[record.tableName] ?? 0) + 1;
  const formatOmittedValue = (value: unknown): string => {
    if (value === undefined) return "ontbrekende waarde";
    if (value === null) return "lege waarde";
    if (value instanceof Uint8Array) return `binaire inhoud (${value.byteLength} bytes)`;
    return String(value);
  };
  return {
    recordCount: plan.records.length,
    recordsByTable,
    choices: plan.report.choices.map((choice) =>
      `${choice.tableName}: ${choice.selectedSource ? `back-up ${choice.selectedSource}` : "geen bron geselecteerd"}; ${choice.reason}`),
    uncertainties: [
      ...plan.report.warnings,
      ...plan.report.unresolved.map((record) => `${record.tableName}: ${record.reason}`),
    ],
    omissions: plan.report.informationLoss.map((loss) =>
      `${loss.tableName}.${loss.field}: waarde uit back-up ${loss.omittedFrom} niet meegenomen: ${formatOmittedValue(loss.valueNotRetained)} (${loss.reason})`),
  };
}

export function LibraryMergerPage({ surfaceClassName, headingRef }: LibraryMergerPageProps) {
  const [files, setFiles] = useState<FilePair>([null, null]);
  const [checks, setChecks] = useState<CheckPair>([null, null]);
  const [preview, setPreview] = useState<SimpleMergePreview | null>(null);
  const [reviewChoices, setReviewChoices] = useState<Map<string, "A" | "B">>(() => new Map());
  const [locationMetadataChoices, setLocationMetadataChoices] = useState<Map<string, LocationSource>>(() => new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildStageOpen, setBuildStageOpen] = useState(false);
  const [buildingArchive, setBuildingArchive] = useState(false);
  const [archiveWriteResult, setArchiveWriteResult] = useState<JwLibraryWriteResult | null>(null);
  const [archiveBuildError, setArchiveBuildError] = useState<string | null>(null);
  const buildGeneration = useRef(0);
  const canCompare = files[0] !== null && files[1] !== null && !busy;
  const activePlan = preview?.mergePlan ?? null;
  const locationDecisionsReady = preview !== null
    && preview.locationResolution.unresolved.length === 0
    && getLocationProposalGroups(preview).every((group) => group.confirmed || group.canKeepSeparate);
  const playlistDecisionsReady = preview !== null && preview.playlistResolution.unresolved.length === 0
    && preview.playlistResolution.proposals.every((proposal) =>
      preview.playlistResolution.confirmedGroups.some((group) => group.proposalId === proposal.id)
      || preview.playlistResolution.differentDecisions.some((decision) => decision.proposalId === proposal.id));
  const canBuildArchive = activePlan?.status === "ready" && locationDecisionsReady && playlistDecisionsReady;

  const clearResults = () => {
    buildGeneration.current += 1;
    setPreview(null);
    setReviewChoices(new Map());
    setLocationMetadataChoices(new Map());
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

  const compareFiles = async () => {
    const [fileA, fileB] = files;
    if (!fileA || !fileB) return;

    setBusy(true);
    buildGeneration.current += 1;
    setError(null);
    setPreview(null);
    setReviewChoices(new Map());
    setLocationMetadataChoices(new Map());
    setBuildStageOpen(false);
    setBuildingArchive(false);
    setArchiveWriteResult(null);
    setArchiveBuildError(null);
    setChecks([null, null]);

    try {
      const result = await prepareSimpleMerge(fileA, fileB);
      setPreview(result);
      setChecks([
        { source: "A", fileName: fileA.name, valid: true, schemaVersion: result.sources[0].schemaVersion, error: null },
        { source: "B", fileName: fileB.name, valid: true, schemaVersion: result.sources[1].schemaVersion, error: null },
      ]);
    } catch (cause) {
      if (cause instanceof SimpleMergeInputError) {
        setChecks([...cause.checks]);
      } else {
        setError(cause instanceof Error
          ? cause.message
          : "De back-ups konden niet worden vergeleken. Controleer de bestanden en probeer het opnieuw.");
      }
    } finally {
      setBusy(false);
    }
  };

  const buildArchive = async () => {
    if (!preview || !activePlan || activePlan.status !== "ready" || !locationDecisionsReady) return;
    const generation = ++buildGeneration.current;
    setBuildStageOpen(true);
    setBuildingArchive(true);
    setArchiveWriteResult(null);
    setArchiveBuildError(null);
    try {
      const result = await buildSimplePocJwLibrary(
        preview, new Date(), () => generation === buildGeneration.current
          && isPlaylistResolutionContextCurrent(preview.playlistResolution, preview.sources[0].snapshot,
            preview.sources[1].snapshot, preview.sources[0].archive, preview.sources[1].archive, preview.locationResolution),
      );
      if (generation === buildGeneration.current) setArchiveWriteResult(result);
    } catch (cause) {
      if (generation === buildGeneration.current) {
        setArchiveBuildError(cause instanceof Error ? cause.message : "Het mergebestand kon niet veilig worden opgebouwd.");
      }
    } finally {
      if (generation === buildGeneration.current) setBuildingArchive(false);
    }
  };

  const choosePublicationVersion = (group: PublicationConflictGroup, source: "A" | "B") => {
    if (!preview) return;
    buildGeneration.current += 1;
    const nextChoices = new Map(reviewChoices);
    for (const key of group.recordKeys) nextChoices.set(key, source);
    setReviewChoices(nextChoices);
    setPreview({
      ...preview,
      mergePlan: simpleMerge(preview.sources[0].snapshot, preview.sources[1].snapshot, nextChoices, preview.locationResolution, preview.playlistResolution),
    });
    setBuildStageOpen(false);
    setBuildingArchive(false);
    setArchiveWriteResult(null);
    setArchiveBuildError(null);
  };

  const refreshAfterLocationDecision = async (locationResolution: LocationResolutionContext) => {
    if (!preview) return;
    const generation = ++buildGeneration.current;
    setBusy(true);
    try {
      const playlistResolution = await createPlaylistResolutionContext(
        locationResolution.sessionId, locationResolution.sourcePairId,
        preview.sources[0].snapshot, preview.sources[1].snapshot,
        preview.sources[0].archive, preview.sources[1].archive, locationResolution,
      );
      if (generation !== buildGeneration.current) return;
      const comparison = compareLibraries(preview.sources[0].snapshot, preview.sources[1].snapshot, locationResolution, playlistResolution);
      setPreview({ ...preview, locationResolution, playlistResolution, comparison,
        differenceReport: buildMergeReport(comparison),
        mergePlan: simpleMerge(preview.sources[0].snapshot, preview.sources[1].snapshot, reviewChoices, locationResolution, playlistResolution) });
    } catch (cause) {
      if (generation === buildGeneration.current) setError(cause instanceof Error ? cause.message : "Afspeellijsten konden na de plaatskeuze niet opnieuw worden gecontroleerd.");
    } finally {
      if (generation === buildGeneration.current) setBusy(false);
    }
    setBuildStageOpen(false);
    setBuildingArchive(false);
    setArchiveWriteResult(null);
    setArchiveBuildError(null);
  };

  const refreshAfterPlaylistDecision = (playlistResolution: SimpleMergePreview["playlistResolution"]) => {
    if (!preview) return;
    buildGeneration.current += 1;
    const comparison = compareLibraries(preview.sources[0].snapshot, preview.sources[1].snapshot, preview.locationResolution, playlistResolution);
    setPreview({ ...preview, playlistResolution, comparison, differenceReport: buildMergeReport(comparison),
      mergePlan: simpleMerge(preview.sources[0].snapshot, preview.sources[1].snapshot, reviewChoices, preview.locationResolution, playlistResolution) });
    setBuildStageOpen(false); setBuildingArchive(false); setArchiveWriteResult(null); setArchiveBuildError(null); setError(null);
  };

  const decidePlaylist = (proposal: PlaylistProposal, decision: "same" | "different") => {
    if (!preview) return;
    const context = preview.playlistResolution;
    const result = decision === "same"
      ? confirmPlaylistProposal(context, proposal.id, context.sessionId, context.revision, preview.sources[0].snapshot, preview.sources[1].snapshot)
      : markPlaylistsDifferent(context, proposal.id, context.sessionId, context.revision, preview.sources[0].snapshot, preview.sources[1].snapshot);
    if (!result.ok) { setError(result.reason); return; }
    refreshAfterPlaylistDecision(result.context);
  };

  const reopenPlaylist = (id: string) => {
    if (!preview) return;
    const context = preview.playlistResolution;
    const group = context.confirmedGroups.find((candidate) => candidate.id === id);
    const result = group
      ? revokePlaylistConfirmation(context, id, context.sessionId, context.revision, preview.sources[0].snapshot, preview.sources[1].snapshot)
      : revokePlaylistDifferentDecision(context, id, context.sessionId, context.revision, preview.sources[0].snapshot, preview.sources[1].snapshot);
    if (!result.ok) { setError(result.reason); return; }
    refreshAfterPlaylistDecision(result.context);
  };

  const keepPlaylist = (item: PlaylistUnresolvedItem) => {
    if (!preview || !item.localKey) return;
    const context = preview.playlistResolution;
    const result = keepPlaylistSeparate(context, item.source, item.localKey, context.sessionId, context.revision,
      preview.sources[0].snapshot, preview.sources[1].snapshot);
    if (!result.ok) { setError(result.reason); return; }
    refreshAfterPlaylistDecision(result.context);
  };

  const chooseLocationMetadata = (group: LocationProposalGroup, source: LocationSource) => {
    buildGeneration.current += 1;
    setLocationMetadataChoices((current) => new Map(current).set(group.key, source));
    setBuildStageOpen(false);
    setBuildingArchive(false);
    setArchiveWriteResult(null);
    setArchiveBuildError(null);
  };

  const confirmLocations = (group: LocationProposalGroup, source: LocationSource) => {
    if (!preview) return;
    let next = preview.locationResolution;
    for (const pair of group.pairs) {
      if (next.confirmedGroups.some((item) => item.proposalId === pair.proposal.id)) continue;
      const result = confirmLocationProposal(next, pair.proposal.id, next.sessionId, next.revision,
        preview.sources[0].snapshot, preview.sources[1].snapshot, source);
      if (!result.ok) { setError(result.reason); return; }
      next = result.context;
    }
    setError(null);
    refreshAfterLocationDecision(next);
  };

  const markLocationsDifferent = (group: LocationProposalGroup) => {
    if (!preview) return;
    let next = preview.locationResolution;
    for (const pair of group.pairs) {
      const result = markLocationDifferent(next, pair.proposal.id, next.sessionId, next.revision,
        preview.sources[0].snapshot, preview.sources[1].snapshot);
      if (!result.ok) { setError(result.reason); return; }
      next = result.context;
    }
    setError(null);
    refreshAfterLocationDecision(next);
  };

  const revokeLocationGroup = (group: LocationProposalGroup) => {
    if (!preview) return;
    let next = preview.locationResolution;
    for (const pair of group.pairs) {
      const confirmed = next.confirmedGroups.find((item) => item.proposalId === pair.proposal.id);
      if (!confirmed) continue;
      const result = revokeLocationConfirmation(next, confirmed.id, next.sessionId, next.revision,
        preview.sources[0].snapshot, preview.sources[1].snapshot);
      if (!result.ok) { setError(result.reason); return; }
      next = result.context;
    }
    setError(null);
    refreshAfterLocationDecision(next);
  };

  const closeBuildStage = () => {
    buildGeneration.current += 1;
    setBuildingArchive(false);
    setArchiveWriteResult(null);
    setArchiveBuildError(null);
    setBuildStageOpen(false);
  };

  return (
    <section className={`${surfaceClassName} ${styles.page}`} aria-labelledby="workflow-heading">
      <div className={styles.heading}>
        <h1 id="workflow-heading" ref={headingRef} tabIndex={-1}>Back-ups samenvoegen</h1>
        <p>Kies twee JW Library-back-ups. Je bestanden blijven op dit apparaat.</p>
      </div>

      <div className={styles.sectionHeading}>
        <div>
          <h2>1. Kies je back-ups</h2>
          <p>De volgorde maakt niet uit. Beide bestanden worden eerst gecontroleerd.</p>
        </div>
      </div>

      <div className={styles.sourceGrid}>
        <SourceFilePicker source="A" file={files[0]} check={checks[0]} busy={busy} onChoose={(file) => chooseFile(0, file)} />
        <SourceFilePicker source="B" file={files[1]} check={checks[1]} busy={busy} onChoose={(file) => chooseFile(1, file)} />
      </div>

      <div className={styles.actions}>
        <button className={styles.actionButton} type="button" disabled={!canCompare} onClick={() => void compareFiles()}>
          {busy ? "Back-ups controleren…" : "Vergelijk back-ups"}
        </button>
        {preview && <button className={styles.clearFileButton} type="button" onClick={clearResults}>Opnieuw beginnen</button>}
      </div>

      {error && <p className={styles.globalError} role="alert">{error}</p>}

      {preview && (
        <>
          <SimpleMergeResults
            preview={preview}
            reviewChoices={reviewChoices}
            locationMetadataChoices={locationMetadataChoices}
            onChoosePublicationVersion={choosePublicationVersion}
            onChooseLocationMetadata={chooseLocationMetadata}
            onConfirmLocations={confirmLocations}
            onMarkLocationsDifferent={markLocationsDifferent}
            onRevokeLocationConfirmation={revokeLocationGroup}
          />
          <PlaylistResolutionReview preview={preview}
            onSame={(proposal) => decidePlaylist(proposal, "same")}
            onDifferent={(proposal) => decidePlaylist(proposal, "different")}
            onRevoke={reopenPlaylist} onReopenDifferent={reopenPlaylist} onKeepSeparate={keepPlaylist} />
          {activePlan?.status === "needs-review" && (
            <div className={styles.notReadyNotice} role="status">
              <strong>Voor deze back-ups is nu geen veilig mergebestand beschikbaar.</strong>
              <p>Een of meer gegevens kunnen niet betrouwbaar aan elkaar worden gekoppeld of automatisch gekozen. Bekijk de open punten hieronder. Simple Mode maakt geen bestand zolang die onzekerheden bestaan.</p>
            </div>
          )}
        </>
      )}

      {canBuildArchive && !buildStageOpen && (
        <div className={styles.actions}>
          <button className={styles.actionButton} type="button" onClick={() => void buildArchive()}>
            3. Maak mergebestand
          </button>
        </div>
      )}

      {buildStageOpen && canBuildArchive && (
        <section className={styles.buildStage} aria-labelledby="build-stage-heading">
          <h2 id="build-stage-heading">Mergebestand maken</h2>
          <p>De database en het nieuwe archief worden op dit apparaat opgebouwd en gecontroleerd.</p>
          {buildingArchive && <p role="status">Bezig met samenvoegen en controleren…</p>}
          {archiveBuildError && <p className={styles.downloadError} role="alert">{archiveBuildError}</p>}
          {archiveWriteResult && <ArchiveDownload result={archiveWriteResult} summary={createDownloadSummary(activePlan)} />}
          {!buildingArchive && !archiveBuildError && !archiveWriteResult && (
            <button className={styles.actionButton} type="button" onClick={() => void buildArchive()}>Opnieuw proberen</button>
          )}
          <button className={styles.clearFileButton} type="button" onClick={closeBuildStage}>Terug naar de vergelijking</button>
        </section>
      )}
    </section>
  );
}
