# Merge-decision model

`types.ts` defines the information a later advanced-mode screen needs for one
record decision. The object carries the record table, a logical identity and
its confidence, source labels and file names, field- or block-level values,
timestamp evidence with explicit provenance, a proposed action, available
actions, and a plain-language reason. It does not require the UI to interpret
SQLite row IDs.

Each value distinguishes an absent field from a present SQL `NULL` or other
value. A `baseValue` of `null` means no base backup was provided; a base value
with `presence: "missing"` means the base exists but has no such field.
Timestamp entries preserve their source (`A`, `B`, or `basis`) and kind
(`record`, `database`, `manifest`, or `archive`).

## Conflict certainty

- `none` means the compared changes do not overlap, or there is no conflict to
  resolve. The base remains optional.
- `possible` is reserved for a two-way comparison without a base. The type
  requires `baseVersion: null`; it must not be presented as a confirmed
  concurrent conflict.
- `confirmed` requires a base source and at least one explicit overlapping
  field or block. The overlap records the shared path and why both sides changed
  it relative to that base.
- `uncertain` means the available base or values do not establish whether the
  changes overlap. It must remain reviewable rather than being silently
  classified as confirmed or conflict-free.

`proposedAction` may be `null` when there is no safe automatic suggestion.
`availableActions` should include `keep-both` only when separate identities and
valid relationships can be maintained, and should include
`combine-non-overlapping` only for changes that can coexist safely. These types
describe a decision; they do not yet implement three-way comparison, render the
advanced UI, or build an output database.
