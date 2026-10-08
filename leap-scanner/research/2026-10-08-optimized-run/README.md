# Optimized scan recovery

The October 8 broad scan is resumable under Supabase run key
`manual-2026-10-08-complete-broad-optimized-02`.

The invalid JSON is preserved in the parent Git object recorded by `research/fallback-recovery.json`
and in the resumable backend checkpoints. It must not be published:

- It declares 47 deep reviews, but contains decisions for only 20 companies.
- It declares 245 reviewed rejections, but contains only 9 explicit rejection records.
- Its strict publication validation fails.

The public fallback remains on the last strictly valid snapshot until every selected company has a
documented qualified or rejected decision and the complete publication validator passes.
