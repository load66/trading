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
4. Verify GAAP profitability, revenue, earnings, FCF, margins, balance sheet, catalysts, valuation, moat, technical state and event risk.
5. Refresh rankings and exact Entry 1 / Add 2 / Final Add zones.
6. Re-check the best available LEAP contract profile. Prefer 18–30 months and roughly 0.70–0.85 delta ITM calls; never invent live data.
7. Write a new immutable Supabase research snapshot and a new market scan row.
8. Update GitHub fallback JSON.
9. Deploy from `main` to Railway.
10. Verify the public deployment before reporting completion.

## Scheduled-job boundary

The 2 PM daily job and intraday dip watcher may update market regime, support/action labels, event risk and contract readiness only. They must not change the core qualified universe or fundamental scores.

## Publication safety

- Public Supabase access is SELECT-only.
- The browser has no write path.
- Tariffs are context, not a qualification filter or score penalty.
- Business-quality gates remain strict.
- Historical snapshots are append-only and preserved.
