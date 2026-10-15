import { describeLocation, type LocationDescription } from "../compare/locationDescriptor";
import { identifyRecord } from "../compare/recordIdentity";
import type { UserDataRow, UserDataSnapshot } from "../database/readUserData";
import type { ConfirmedLocationGroup, LocationProposal, LocationResolutionContext, LocationSource } from "./locationResolution";
import type { SimpleMergePreview } from "./prepareSimpleMerge";

export interface LocationProposalPair {
  readonly proposal: LocationProposal;
  readonly rowA: UserDataRow;
  readonly rowB: UserDataRow;
  readonly confirmed: ConfirmedLocationGroup | null;
  readonly different: LocationResolutionContext["differentDecisions"][number] | null;
  readonly hasTitleDifference: boolean;
}

export interface LocationProposalGroup {
  readonly key: string;
  readonly label: string;
  readonly family: "publication" | "media" | "single-place";
  readonly pairs: readonly LocationProposalPair[];
  readonly confirmed: boolean;
  readonly different: boolean;
  readonly canKeepSeparate: boolean;
  readonly displayMetadataSource: LocationSource | null;
  readonly hasTitleDifference: boolean;
}

function rowFor(snapshot: UserDataSnapshot, localKey: string): UserDataRow | null {
  return (snapshot.tables.Location?.rows ?? []).find((row, index) =>
    identifyRecord(snapshot, "Location", row, index).localKey === localKey) ?? null;
}

function family(description: LocationDescription): "publication" | "media" {
  return description.Type === 3 ? "media" : "publication";
}

function keyForPublication(description: LocationDescription): string | null {
  if (typeof description.KeySymbol !== "string" || description.KeySymbol.trim() === ""
    || description.MepsLanguage === null) return null;
  return JSON.stringify([
    family(description), description.KeySymbol, description.MepsLanguage,
    description.Edition, description.Specialty,
  ]);
}

export function locationPublicationGroupKey(row: UserDataRow): string | null {
  const description = describeLocation(row);
  return description.description && description.recordForm
    ? keyForPublication(description.description) : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fallbackPlaceLabel(row: UserDataRow, description: LocationDescription): string {
  const title = textValue(row.Title);
  if (title) return title;
  if (description.Type === 3) {
    return description.Track !== null ? `Mediaplek · track ${description.Track}` : "Mediaplek";
  }
  if (description.BookNumber !== null && description.ChapterNumber !== null) {
    return `Bijbelboek ${description.BookNumber} · hoofdstuk ${description.ChapterNumber}`;
  }
  if (description.DocumentId !== null) return `Document ${description.DocumentId}`;
  return textValue(description.KeySymbol) ?? `Plaats van type ${description.Type}`;
}

function publicationLabel(description: LocationDescription): string {
  const parts = [description.KeySymbol ?? "Symbool niet opgegeven"];
  parts.push(description.MepsLanguage === null ? "taal niet opgegeven" : `taal ${description.MepsLanguage}`);
  if (description.Edition !== null && description.Edition !== "") parts.push(`editie ${description.Edition}`);
  if (description.Specialty !== null && description.Specialty !== "") parts.push(`specialty ${description.Specialty}`);
  return parts.join(" · ");
}

function resolvedGroupStatus(pairs: readonly LocationProposalPair[]) {
  const confirmed = pairs.map((pair) => pair.confirmed);
  const different = pairs.map((pair) => pair.different);
  const isConfirmed = confirmed.every(Boolean);
  const isDifferent = different.every(Boolean);
  return {
    confirmed: isConfirmed,
    different: isDifferent,
    canKeepSeparate: isDifferent && different.every((decision) => decision?.canKeepSeparate === true),
    displayMetadataSource: isConfirmed
      && confirmed.every((item) => item?.displayMetadataSource === confirmed[0]?.displayMetadataSource)
      ? confirmed[0]?.displayMetadataSource ?? null : null,
  };
}

export function getLocationProposalGroups(preview: SimpleMergePreview): LocationProposalGroup[] {
  const context = preview.locationResolution;
  const [sourceA, sourceB] = preview.sources;
  const grouped = new Map<string, {
    family: LocationProposalGroup["family"];
    label: string;
    pairs: LocationProposalPair[];
  }>();
  for (const proposal of context.proposals) {
    if (!proposal.description) continue;
    const rowA = rowFor(sourceA.snapshot, proposal.sourceA.localKey);
    const rowB = rowFor(sourceB.snapshot, proposal.sourceB.localKey);
    if (!rowA || !rowB) continue;
    const placeFamily = family(proposal.description);
    const publicationKey = keyForPublication(proposal.description);
    const groupKey = publicationKey ?? JSON.stringify(["single-place", proposal.id]);
    const groupFamily: LocationProposalGroup["family"] = publicationKey ? placeFamily : "single-place";
    const label = publicationKey ? publicationLabel(proposal.description)
      : fallbackPlaceLabel(rowA, proposal.description);
    const existing = grouped.get(groupKey) ?? { family: groupFamily, label, pairs: [] };
    existing.pairs.push({
      proposal, rowA, rowB,
      confirmed: context.confirmedGroups.find((item) => item.proposalId === proposal.id) ?? null,
      different: context.differentDecisions.find((item) => item.proposalId === proposal.id) ?? null,
      hasTitleDifference: !Object.is(rowA.Title, rowB.Title),
    });
    grouped.set(groupKey, existing);
  }
  return [...grouped.entries()].map(([key, item]) => {
    const state = resolvedGroupStatus(item.pairs);
    return {
      key,
      family: item.family,
      label: item.label,
      pairs: item.pairs,
      ...state,
      hasTitleDifference: item.pairs.some((pair) => pair.hasTitleDifference),
    };
  }).sort((a, b) => a.label.localeCompare(b.label, "nl"));
}

