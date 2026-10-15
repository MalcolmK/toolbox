import type { SimpleMergePreview } from "../merge/prepareSimpleMerge";
import type { PlaylistProposal, PlaylistResolutionContext, PlaylistUnresolvedItem } from "../merge/playlistResolution";
import styles from "./LibraryMergerPage.module.css";

function Structure({ source, fields, media, locations, markers, tags }: {
  readonly source: string;
  readonly fields: readonly { readonly label: string; readonly value: string }[];
  readonly media: readonly { readonly fileName: string; readonly path: string; readonly mimeType: string; readonly bytes: number }[];
  readonly locations: readonly string[];
  readonly markers: readonly string[];
  readonly tags: readonly string[];
}) {
  return <details className={styles.playlistSource}>
    <summary>Back-up {source} · volledige gecontroleerde structuur</summary>
    <h5>Back-up {source}</h5>
    <dl>{fields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
    <p><strong>Media</strong>{media.length ? media.map((item) => <span key={`${item.path}:${item.bytes}`}>{item.fileName} · {item.path} · {item.mimeType} · {item.bytes} bytes</span>) : <span>Geen mediabestand</span>}</p>
    <p><strong>Plaatskoppelingen</strong><span>{locations.join(", ") || "Geen"}</span></p>
    <p><strong>Markeringen en verwijzingen</strong>{markers.length ? markers.map((item, index) => <span key={`${index}:${item}`}>{item}</span>) : <span>Geen</span>}</p>
    <p><strong>Labels</strong><span>{tags.join(", ") || "Geen"}</span></p>
  </details>;
}

export function PlaylistResolutionReview({
  preview, onSame, onDifferent, onRevoke, onReopenDifferent, onKeepSeparate,
}: {
  readonly preview: SimpleMergePreview;
  readonly onSame: (proposal: PlaylistProposal) => void;
  readonly onDifferent: (proposal: PlaylistProposal) => void;
  readonly onRevoke: (groupId: string) => void;
  readonly onReopenDifferent: (proposalId: string) => void;
  readonly onKeepSeparate: (item: PlaylistUnresolvedItem) => void;
}) {
  const context: PlaylistResolutionContext = preview.playlistResolution;
  const proposals = context.proposals;
  const unresolved = context.unresolved;
  if (!proposals.length && !unresolved.length) return null;
  return <section className={styles.playlistReview} aria-labelledby="playlist-review-heading">
    <div><h3 id="playlist-review-heading">Beoordeel afspeellijsten</h3>
      <p>Een koppeling gebruikt de volledige playliststructuur, bevestigde plaatskoppelingen en gecontroleerde mediabytes. Het label is alleen ter herkenning.</p></div>
    {proposals.map((proposal) => {
      const confirmed = context.confirmedGroups.find((group) => group.proposalId === proposal.id);
      const different = context.differentDecisions.find((decision) => decision.proposalId === proposal.id);
      return <article className={styles.playlistCard} key={proposal.id}>
        <h4>{proposal.summaryA.label || "Afspeellijst"}</h4>
        <div className={styles.playlistSources}>
          <Structure source="A" {...proposal.summaryA} />
          <Structure source="B" {...proposal.summaryB} />
        </div>
        {proposal.blockingReason && <p className={styles.locationBlocker}>{proposal.blockingReason}</p>}
        {confirmed ? <div className={styles.choiceStatus} role="status"><strong>Bevestigd: dezelfde afspeellijst.</strong>
          <button className={styles.clearFileButton} type="button" onClick={() => onRevoke(confirmed.id)}>Bevestiging intrekken</button></div>
          : different ? <div className={styles.choiceStatus} role="status"><strong>Afzonderlijk behouden als verschillende afspeellijsten; mogelijke dubbeling blijft bestaan.</strong>
            <button className={styles.clearFileButton} type="button" onClick={() => onReopenDifferent(proposal.id)}>Keuze opnieuw beoordelen</button></div>
            : <div className={styles.locationActions}>
              <button className={styles.actionButton} type="button" onClick={() => onSame(proposal)}>Dit is dezelfde afspeellijst.</button>
              <button className={styles.actionButton} type="button" disabled={!proposal.canKeepSeparate} title={proposal.blockingReason ?? undefined} onClick={() => onDifferent(proposal)}>Dit zijn verschillende afspeellijsten.</button>
            </div>}
      </article>;
    })}
    {unresolved.length > 0 && <div className={styles.playlistUnresolved}>
      <h4>Geen volledige, unieke overeenkomst</h4>
      <p>Deze structuur blijft geblokkeerd totdat je haar afzonderlijk behoudt. Ontbrekende of onveilige media kan niet afzonderlijk in de uitvoer worden opgenomen.</p>
      {unresolved.map((item, index) => <article key={`${item.source}:${item.localKey ?? index}`}>
        <h5>Back-up {item.source} · {item.label}</h5><p>{item.reason}</p>
        {item.summary && <div className={styles.playlistSources}><Structure source={item.source} {...item.summary} /></div>}
        {item.summary && <button className={styles.actionButton} type="button" disabled={item.canKeepSeparate === false} title={item.canKeepSeparate === false ? item.reason : undefined} onClick={() => onKeepSeparate(item)}>Deze bronstructuur afzonderlijk behouden</button>}
      </article>)}
    </div>}
  </section>;
}
