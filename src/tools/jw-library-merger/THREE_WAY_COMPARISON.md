# Three-way comparison

Advanced mode accepts two merge candidates, A and B, and an optional older
base backup. The base is read and validated locally, used to compare changes,
and kept separate from `sources` in `AdvancedMergePreview`; it is never treated
as a third output candidate.

When a base is provided, the comparator compares base→A, base→B, and A→B for
records with a stable cross-backup identity. For fields reported by the pairwise
comparator, it classifies changes as made only in A, only in B, the same change
on both sides, non-overlapping changes, or an overlap where both sides changed
the same field to different values. A removal on one side combined with a
modification on the other is also a confirmed record-presence overlap.
`Created` and `LastModified` remain timestamp evidence and do not on their own
constitute an overlapping content conflict.

Without a base, the existing two-way comparison remains available. Differences
that cannot be attributed to a common starting point are marked possible rather
than confirmed. Records whose identity is not stable or whose relationships
cannot be followed safely remain visible as uncertain and are not automatically
classified as safe changes.

Record fields are classified by the three-way comparison. `Note.Content` also
has a separate block-first text comparison with an optional line-level view.
Independent changes are proposed together; overlapping changes require a
source, both-fragments, or manual-text decision. The review shows excluded text
and keeps these choices editable for the active comparison session. Review
decisions can now be converted to the SQLite builder's plan format with
`buildAdvancedMergePlan`. This conversion uses internal source-row references
aligned with comparison records, carries per-field provenance for relationship
remapping, and blocks unresolved or unsafe identities. The browser passes a
confirmed plan to the Advanced POC database/archive pipeline. Only A and B
can contribute output data; the optional base is comparison-only. Production
manifest generation still fails closed while the hash rule is unverified, but
the separate POC route can produce a `.jwlibrary` download with an explicitly
unverified copied source hash after database and archive checks pass. This
does not establish JW Library acceptance or restore compatibility.
