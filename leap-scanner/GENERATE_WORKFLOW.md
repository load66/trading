# Manual Generate Workflow

This file defines the owner's manual publication command for the LEAPS Desk.

## Trigger

When the owner sends the standalone word:

`generate`

in the LEAPS ChatGPT project chat, perform a full research refresh and publish the results to the public app.

## Full refresh sequence

1. Load `MASTER_PROMPT.md` and the latest approved research snapshot.
2. Research with Massive + AlphaStocks + current web sources as needed.
3. Re-screen the profitable-company universe using both qualification lanes.
4. Verify GAAP profitability, revenue, earnings, FCF, margins, balance sheet, catalysts, valuation, moat, technical state and event risk. Require both positive TTM FCF and positive latest-quarter FCF; negative or unverified FCF cannot qualify.
5. Refresh rankings and exact Entry 1 / Add 2 / Final Add zones.
6. Re-check available ITM LEAP calls, preferring 18–30 months. Require 0.60–0.75 delta inclusive, with no premium/contract-cost cap or preferred delta sub-band. Among liquid eligible calls with comparable current quotes, rank highest open interest first and tightest bid/ask width as a percentage of midpoint second. Reject poor spreads before ranking; missing OI/spread makes the reference provisional. Keep valuation coverage, expiration, IV and event-risk checks; never invent live data.
7. Write a new immutable Supabase research snapshot and a new market scan row.
8. Update GitHub fallback JSON.
9. Deploy from `main` to Railway.
10. Verify the public deployment before reporting completion.

## Current owner policy

Structural-downtrend and quality-trap automatic exclusion filters are disabled. Keep technical risk/action labels and business-quality checks. Include HUBS and INTU when their business data qualify; do not require technical re-entry gates.

## Scheduled-job boundary

The 2 PM weekday job runs the complete detailed MASTER_PROMPT research workflow and may add, remove, or rescore candidates when evidence warrants. The intraday dip watcher remains market/entry-timing only and must not change the core qualified universe or fundamental scores.

## Publication safety

- Public Supabase access is SELECT-only.
- The browser has no write path.
- Tariffs are context, not a qualification filter or score penalty.
- Business-quality gates remain strict.
- Historical snapshots are append-only and preserved.
