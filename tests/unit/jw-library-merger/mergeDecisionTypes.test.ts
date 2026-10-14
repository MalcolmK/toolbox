import { describe, expect, test } from "vitest";
import type {
  LogicalRecordIdentity,
  MergeDecision,
  MergeDecisionOverlap,
  MergeDecisionSource,
} from "../../../src/tools/jw-library-merger/types";

type Assert<T extends true> = T;
type ConfirmedDecision = Extract<MergeDecision, { readonly conflictStatus: "confirmed" }>;
type ConfirmedRequiresBase = Assert<ConfirmedDecision["baseVersion"] extends MergeDecisionSource ? true : false>;
type ConfirmedRequiresOverlap = Assert<ConfirmedDecision["overlappingChanges"] extends readonly [
  MergeDecisionOverlap,
  ...MergeDecisionOverlap[],
] ? true : false>;

const typeContractChecks: readonly [ConfirmedRequiresBase, ConfirmedRequiresOverlap] = [true, true];

const identity: LogicalRecordIdentity = {
  key: "note:sample-guid",
  confidence: "stable",
  strategy: "Guid",
};

const twoWayDecision: MergeDecision = {
  tableName: "Note",
  logicalIdentity: identity,
  sourceA: { label: "A", fileName: "backup-a.jwlibrary", recordLabel: "Aantekening: Voorbeeld" },
  sourceB: { label: "B", fileName: "backup-b.jwlibrary", recordLabel: "Aantekening: Voorbeeld" },
  differences: [],
  timestamps: [],
  proposedAction: null,
  availableActions: ["take-a", "take-b", "edit-manually"],
  reason: "Zonder basisversie kan niet worden vastgesteld welke bron de andere wijziging overschreef.",
  conflictStatus: "possible",
  baseVersion: null,
  conflictReason: "Beide back-ups verschillen, maar een basisversie ontbreekt.",
  overlappingChanges: [],
};

describe("MergeDecision type contract", () => {
  test("represents two-way conflicts as possible and exposes readable source context", () => {
    expect(typeContractChecks).toEqual([true, true]);
    expect(twoWayDecision.conflictStatus).toBe("possible");
    expect(twoWayDecision.sourceA?.recordLabel).toBe("Aantekening: Voorbeeld");
    expect(twoWayDecision.sourceB?.fileName).toBe("backup-b.jwlibrary");
  });
});
