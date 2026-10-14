import type { SqlValue } from "sql.js";
import type { NormalizedTimestamp } from "./compare/normalizeTimestamp";

export type MergeDecisionSourceLabel = "A" | "B" | "basis";

/** Source context for a decision; database-local integer IDs are intentionally omitted. */
export interface MergeDecisionSource {
  readonly label: MergeDecisionSourceLabel;
  readonly fileName: string;
  readonly recordLabel: string;
}

export interface LogicalRecordIdentity {
  /** Canonical comparison key, or null when the record cannot be identified safely. */
  readonly key: string | null;
  readonly confidence: "stable" | "candidate" | "uncertain";
  readonly strategy: string;
}

export type MergeDecisionValue =
  | { readonly presence: "missing" }
  | { readonly presence: "present"; readonly value: SqlValue };

export interface MergeDecisionDifference {
  readonly granularity: "field" | "block";
  /** Stable field path or opaque text-block identifier; never a SQLite row ID. */
  readonly path: string;
  readonly label: string;
  readonly valueA: MergeDecisionValue;
  readonly valueB: MergeDecisionValue;
  /** Null means no base was supplied; `missing` means the base has no such value. */
  readonly baseValue: MergeDecisionValue | null;
  /** Null means it could not be determined, including in a two-way comparison. */
  readonly changedFromBase: { readonly A: boolean | null; readonly B: boolean | null };
}

export interface MergeDecisionTimestamp {
  readonly source: MergeDecisionSourceLabel;
  readonly kind: "record" | "database" | "manifest" | "archive";
  readonly field: string;
  readonly value: NormalizedTimestamp;
}

export type MergeDecisionAction =
  | "take-a"
  | "take-b"
  | "combine-non-overlapping"
  | "keep-both"
  | "edit-manually"
  | "retain-one-sided";

export interface MergeDecisionOverlap {
  readonly granularity: "field" | "block";
  readonly path: string;
  readonly reason: string;
}

interface MergeDecisionDetails {
  readonly tableName: string;
  readonly logicalIdentity: LogicalRecordIdentity;
  readonly sourceA: MergeDecisionSource | null;
  readonly sourceB: MergeDecisionSource | null;
  readonly differences: readonly MergeDecisionDifference[];
  readonly timestamps: readonly MergeDecisionTimestamp[];
  readonly proposedAction: MergeDecisionAction | null;
  readonly availableActions: readonly MergeDecisionAction[];
  /** Plain-language explanation for the suggested result or the requested review. */
  readonly reason: string;
}

type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

/**
 * A conflict assessment distinguishes two-way suspicion from a confirmed
 * three-way overlap. The union makes a confirmed conflict require both a base
 * source and at least one overlapping field or block.
 */
export type MergeDecision = MergeDecisionDetails & (
  | {
      readonly conflictStatus: "none";
      readonly baseVersion: MergeDecisionSource | null;
      readonly conflictReason: null;
      readonly overlappingChanges: readonly [];
    }
  | {
      /** There is no base version, so concurrent edits cannot be confirmed. */
      readonly conflictStatus: "possible";
      readonly baseVersion: null;
      readonly conflictReason: string;
      readonly overlappingChanges: readonly MergeDecisionOverlap[];
    }
  | {
      readonly conflictStatus: "confirmed";
      readonly baseVersion: MergeDecisionSource;
      readonly conflictReason: string;
      readonly overlappingChanges: NonEmptyReadonlyArray<MergeDecisionOverlap>;
    }
  | {
      /** A base exists, but its comparison is insufficient to classify overlap. */
      readonly conflictStatus: "uncertain";
      readonly baseVersion: MergeDecisionSource | null;
      readonly conflictReason: string;
      readonly overlappingChanges: readonly MergeDecisionOverlap[];
    }
);
