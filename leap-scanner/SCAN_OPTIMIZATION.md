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

## Concurrent execution engine and official filing preflight

- `scripts/fast_scan_runtime.js`: reusable, tested provider-callback executor. Processes up to 10 tickers per durable checkpoint, with 4 concurrent calls by default, retry/backoff for transient HTTP 408/429/5xx, a no-retry entitlement fallback, in-flight call deduplication, strictly compatible per-ticker resume, and per-batch elapsed timing. A failed verification never becomes a qualified ticker. `publicationAllowed` remains false until the separate publication validator passes.
- `scripts/sec_filing_preflight.js`: optional faster server-side official SEC accession/period identity pass. It obtains the SEC ticker-to-CIK map once and queries each distinct company at a polite shared 250ms/request pace. Company filings and accession IDs are authoritative identity evidence, but **do not** substitute for current news/guidance checks, GAAP/FCF statements or contract data. It intentionally leaves those checks null. Requires a genuine operator-provided `SEC_USER_AGENT` with contact details, and an execution environment with outbound SEC access. Do not hardcode or publish the owner's personal identity. Usage: `SEC_USER_AGENT='ResearchApp/1.0 contact@yourdomain' node scripts/sec_filing_preflight.js discovery.json sec-preflight.json`.
- The executor and SEC preflight require an authorized backend/process integration to collect real provider data. ChatGPT MCP connector calls do not automatically execute Node repository code, so their existence alone is **not proof** of faster daily autonomous scans. Do not conflate mocked CI throughput with production wall-clock performance.
- Measure `timeToFirstValidatedCandidate`, `discoveryElapsedMs`, `financialFetchElapsedMs`, `providerRequests`, `reusedVerifiedFilings`, `retryCount`, `checkpointWriteElapsedMs`, `deepReviewElapsedMs`, `publishVerificationElapsedMs` and total `scanElapsedMs` on each actual run; compute percentiles only after multiple valid executions.

## Public client transfer optimization

The dashboard now queries only slim Supabase publication metadata during routine minute polls. Full research/market JSON is fetched only when a later **true scan completion time** exists. Cold load first selects 30 lightweight ID/completion metadata records and retrieves only the latest and preceding distinct scan payloads, falling back to the full-list safety path if the metadata endpoint fails. Preserve rollback protection even when old snapshots are inserted later. None of these client-side changes makes provider quotes live or accelerates the server-side fundamental scan itself.

## Corporate-action and cash-flow reconciliation (October 2026 scan finding)

- A `close` quote and `52-week high` are not automatically comparable. KLA (`KLAC`) completed a 10-for-1 stock split on June 11, 2026; the October 5 Unusual Whales screen's raw 52-week high versus latest close yielded an implausible 91.5% 'drawdown'. **Suppress such drawdown/near-support comparisons until both price series are confirmed corporate-action adjusted** against an official split or verified adjusted daily bars. Preserve the raw feed and flag `SPLIT_ADJUSTMENT_UNVERIFIED`. Never promote on a false discount.
- For free cash flow, retain the cashflow-statement formula `operating_cashflow - abs(capital_expenditures)` as a screen, but reconcile against the issuer's definition. AppLovin's 2026-Q2 release reports free cash flow of $863.317M versus $869.040M in operating cash flow, accounting for equipment and lease principal payments; the raw standardized feed alone overstates issuer-defined FCF by about $5.7M. Use a sourced reconciliation where a company supplies one.
- Live freshness: the October 8 discovery request returned stock-screener observations dated October 5. These observations are dated historical prices, not fresh October 8 market data. Do not claim current entry/support or live contracts without a newer timestamp.
