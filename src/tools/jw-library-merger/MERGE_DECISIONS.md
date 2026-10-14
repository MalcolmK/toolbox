# Merge-decision model

`types.ts` defines the information the Advanced mode review uses for one
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
`combine-non-overlapping` only for changes that can coexist safely.

The Advanced mode screen now presents conflicts and uncertain identities one at
a time, with previous/next navigation, source A and B evidence, the base when
available, field values, source-attributed timestamps, the reason for review,
and provisional A/B choices. The choices are held only while the comparison is
open; they do not change either input or produce an archive. The current data
model cannot safely duplicate a conflicted record with new identities and
rewritten relationships, so the screen explicitly withholds “keep both”.
For note content, block-level three-way comparison is now the default and a
line-level view can be selected for finer decisions. Independent text edits are
shown as automatically retained proposal segments; identical changes are
retained once. Overlapping blocks require an explicit A, B, both-fragments, or
manual-text choice. “Both fragments” is enabled only when an existing line
break keeps both strings visibly separate; the original strings are placed in
A-then-B order without inserting a separator. The UI shows the base or source
text that a decision excludes. Line endings, Unicode code points, and
final-newline presence are kept as source text; the comparison does not
normalize them.

The text differ uses a bounded LCS table. Inputs exceeding its cell limit are
shown as a single whole-note conflict rather than automatically combined.
Unknown identities, missing base text, and non-text values do not authorize a
block merge. These Advanced mode choices remain in the current comparison
session. The `buildAdvancedMergePlan` adapter now converts them to the database
builder's source-attributed plan shape. It uses internal row references aligned
to the comparison result instead of guessing source-local IDs, tracks the
source for each combined field so declared foreign keys can be remapped
correctly, and reports excluded source values. It blocks unresolved choices,
unstable or duplicate logical identities, unsupported actions, and rows without
a safe local key. The optional base remains comparison-only. Once the review
is confirmed, the page passes that plan through checked SQLite construction,
the separate provisional POC manifest, archive validation, and the `.jwlibrary`
download flow. The copied hash is explicitly unverified; the production path
still uses the separately verified-manifest gate.

The successful-download browser fixture currently uses empty schema-valid
libraries. A non-empty synthetic pair with identical visible records still
contains rows (including `Bookmark`, `InputField`, and `Location`) for which
the current identity rules cannot safely prove cross-source equivalence. The
Advanced plan therefore remains `needs-review`, and the POC builder refuses
to emit a file. This is a deliberate data-safety gate, not evidence that
non-empty Advanced merging has passed. Expanding identity coverage requires a
separate, evidence-based change to the data model and fixtures.

The session overview counts required whole-record or overlapping-text decisions
and lists any decisions still open. The completion control is disabled while a
required choice is missing. It confirms the review and enables the build stage
only for a safe resolved plan. The provisional loss overview names each field or text block excluded
by a source choice, both-fragment choice, or automatic note change, and exposes
the full excluded value. For manually entered text it lists both source
fragments and explains that the app cannot infer which passages were retained.
Choices are kept in React session state and can be revised by navigating back;
clearing/replacing the comparison begins a new decision session.
