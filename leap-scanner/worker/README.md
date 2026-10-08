# LEAPS Desk — isolated 20-minute research worker

This is a separate Railway service from the existing Nginx frontend.

## Readiness (important)

Runtime orchestration, durable checkpoints, 19-minute execution budget, strict publication gate, lease/heartbeat and daylight-saving-aware scheduling are implemented. The full autonomous research scan is NOT operational until a licensed server-side research provider adapter and secret keys are connected. ChatGPT MCP plugin connections do not automatically grant access to server-side API calls.

The service starts with LEAPS_WORKER_ENABLED=false. This is intentional: standby is safer than claiming a research scan that was never run.

## Private environment variables (set on worker service only)

* LEAPS_WORKER_ENABLED=true, only after upstream research adapter is verified.
* SUPABASE_URL=https://yourproject.supabase.co
* SUPABASE_SERVICE_ROLE_KEY=(service role, never in browser/frontend/GitHub/chat)
* LEAPS_RESEARCH_ADAPTER_URL=https://secure-research-provider.example/api
* LEAPS_RESEARCH_ADAPTER_TOKEN=(backend authentication token)

The existing connected Massive/AlphaStocks/Unusual Whales ChatGPT tools are not available inside Railway. A provider adapter must use real direct vendor credentials and SEC/issuer sources. Do not fabricate results when data plans are insufficient.

## HTTP adapter API

POST (JSON + Bearer token) endpoints:
* /discover: verified:true, source URL, universe of at least 150 unique US common stocks, prioritized selected array of 20-100 (including prior candidates and material events).
* /financials: verified:true, ticker, stage, source, checkedAt, filing:{accession,periodEnd,url}, hardGate:'pass'/'fail', metrics:{netIncome,yoyRevenueGrowth,quarterFCF,ttmFCF}, optional rejectReason. Latest-quarter cashflow must be STANDALONE, not cumulative annual/YTD.
* /issuer_events: verified:true, ticker, stage, source, checkedAt, thesisStatus:'intact'/'broken', reason if broken.
* /valuation: issuer-specific normalized valuation, Bear/Base/Bull expiration scenarios and valuationVerified:true.
* /public_support: supportVerified:true and three independently justified levels with source and rationale; never publicly redistribute owner-private Alpaca bars.
* /leap_contract: contractReady true only with verified suitable long-dated call IV/bid-ask/delta/OI and source timestamp; false with explicit unavailable/no-contract status.
* /prepare_publication: full research and market payloads for strict validation. Publication requires complete reasoned verdicts for the selected worklist, a passing scripts/validate_publication.py, and an atomic database transaction.

Each stage returns original source, timestamp and verified=true; any missing stage remains pending, never inferred or approved. Vendor entitlement errors fail closed.

## Reliability

The worker polls at 12:30 PM America/Chicago on weekdays (CDT/CST-safe). Each attempt is capped at 19 minutes of research processing (20-minute hard upper bound in runtime); an overrun produces a missed-SLA status, not a fake new list. Every five tickers are saved durably. Workers claim a DB lease, heartbeat, and release. A replacement process can resume saved evidence after lease expiry. No Slack is required.

The paused October 8 57-name worklist can be opted into a safe resume only when real backend provider APIs and publisher are connected and tested. Its 50 secondary financial prescreens are NOT 50 fully completed deep reviews. The existing 11-stock approved list is preserved.

The independent Nginx frontend must not be modified. One worker replica, no service sleeping, ALWAYS restart, /health for diagnostics, and no hardcoded credentials. GitHub fallback data must be updated separately after successful publication.
