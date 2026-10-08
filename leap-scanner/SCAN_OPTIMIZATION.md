# LEAPS Desk — Fast, Auditable Research Workflow

This is a performance-only companion to MASTER_PROMPT.md. The master policy, hard gates, support-based 30/30/40 staged plan, separate contract certification, and publication safety prevail.

## Two-stage broad scan

1. Run a genuinely NEW broad discovery screen over at least 150, ideally 200–300, liquid U.S. common stocks. Capture actual ticker list, source, UTC retrieved time and all preliminary values in a discovery checkpoint. Never start exclusively from the existing shortlist.
2. Use cheap batch screener/filing-summary values to create an opportunity-ranked review worklist. Choose roughly 20–60 companies for full deep review first, but always include previously qualified names and any material-news, new-filing, guidance-change or hard-gate alerts. Expand beyond 60 whenever needed. No final qualification cap. Do not spend detailed 8-quarter filing calls on all 200+ preliminary survivors before ranking the work.
3. Every discovered symbol remains counted in the screening funnel. Unreviewed symbols are 'screened/pending', not 'rejected' or 'qualified'. The broad-screen exclusions must not be misrepresented as deep-reviewed rejections.

## Safe financial-data reuse

The financial statements of an earlier fully audited issuer may be reused ONLY with fresh same-run proof that:
- the current SEC/company filing identifier AND fiscal period exactly match the earlier audited filing;
- the current latest-report check and recent company news/guidance checks happened AFTER this scan started;
- no earnings release, material change, guidance cut or hard-gate alert occurred;
- previously audited GAAP profit, positive latest-year-over-year revenue, latest-quarter FCF and TTM FCF remain verified with primary-source links and source timestamps.

Any changed or unknown field requires new direct filing verification. A TTL, an old upload timestamp, a provider screener flag or prior qualification alone never authorizes reuse. Recompute current event risk, valuation, staged support and contract status even when unchanged financials are reused. Persist a per-stock checkpoint with filing ID, period, fresh checks and reused field provenance.

## Faster execution without shortcuts

Use independent provider reads in bounded concurrency up to 5, subject to the actual rate limits. Write checkpoints after each group of at most 10 tickers; reduce to 5 if responses are large. Batch screener calls rather than repeating them per ticker; deduplicate verified filing IDs and retry ONLY failed calls. Skip unavailable premium endpoints immediately. An old 203-name verification queue should not be blindly restarted after moving to the prioritized protocol; preserve old successful checkpoints, revalidate their provenance and create a compatible new worklist only when run identity/policy allows.

The deterministic helper is `node scripts/plan_scan_work.js discovery.json current-evidence.json verified-cache.json plan.json`. It schedules work but never publishes. The 12:30 PM CT research job performs fundamentals; hourly public market updates never repeat financial due diligence.

## Immutable publication boundary

Before writing a NEW full-research snapshot, verify every reviewed company and reconcile precisely: `qualifiedCount = candidates.length`, `rejectedCount = rejected.length`, `deepReviewCount = candidates.length + rejected.length`. Store cheap-screen eliminations separately, e.g. `screenedOutCount`. The previous October 8 snapshot reported 47 deep reviews alongside 11 qualified and 9 explicit reviewed rejections; those historical counts are unreconciled and must not be copied into a new publication. The backend research table's strict count check must be respected.

Maintain unique sequential ranks, correct latest FCF and TTM FCF, checked earnings-consensus basis, every qualified stock's support zones, and explicit contract readiness. Use current validator, read back the actual Supabase row, and only then update GitHub fallback. If any review or check is incomplete, mark the run paused with exact checkpoints and leave approved snapshots intact. Never claim a complete scan from a partial worklist.

## Measure progress

Log discovery size, preliminary survivors, queued vs actually deep-reviewed tickers, safe reused filings, full financial fetches, per-provider failures, checkpointed batch count, stage start/end UTC timestamps, and publication outcome. These are separate metrics. Faster means fewer unnecessary provider requests and restarts, not fewer hard gates.