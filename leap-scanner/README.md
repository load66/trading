# Leap Scanner

A dated LEAPS research dashboard with eight shortlisted candidate image cards and a 36-company research list. This first scan uses October 6, 2026 closing prices and was uploaded October 7. It is research, not a trading recommendation or a live market scanner.

## View

Private app: https://leap-scanner.philipbenedicto.chatgpt.site

The `dist/` folder is a static website. Serve it with any static web server; opening the HTML with `file://` will not allow the JSON fetch. Example: `python3 -m http.server 8000 --directory dist`.

## Research files

- `dist/data/scan-2026-10-07.json`: 36 candidates, ranks, profitability checks, source URLs and caveats.
- `dist/cards/`: PNG report cards for RDDT, ORCL, IOT, ADBE, ADSK, APP, ACN and SAP, plus a ZIP.
- `dist/LEAPS_Stock_Watchlist_2026-10-07.xlsx`: full workbook and quarterly audit.

## Upload a refreshed result

Ask the assistant to update Leap Scanner with a new dated scan. The assistant should verify earnings, prices and high references; check long-dated option availability and liquidity; write a new dated JSON; regenerate cards; update the website's snapshot text and JSON reference; commit the files; and publish the app. No schedule or live quote connection is configured. GitHub stores durable research files; there is no browser-only upload state.

The initial shortlist is profitable and has three or four recent reports showing revenue and net-income improvement against the year-earlier quarter. The broader list contains exceptions and must not be labeled as a strict-screen pass. All-time and 52-week high references are labeled separately. TTM net-income growth can include one-off items, which are described in candidate notes. SAP's overview figures use USD while quarterly filings report EUR.

Card generation: `python3 scripts/render_cards.py`. Requires Pillow. Run after reviewing the dated JSON; change the explicit input date when making a new scan. Preserve old dated results instead of silently overwriting them.

The GitHub copy is in the isolated `leap-scanner/` directory of `load66/trading`. Existing trading files are unaffected.

## Mobile sharing and timestamps

Select a shortlisted candidate and tap Share image. Supported phones share the actual PNG file; on iPhone, select Save Image in the share sheet. Browsers without file sharing show a full-size image preview with save instructions and a PNG download. Cancellation does not trigger a download. Images are prepared before the tap so native sharing retains user activation.

`dist/data/scan-metadata.json` separates research completion, verified results upload, price cutoff and app update times. Original scan completion time was not recorded and remains null. Times display in America/Chicago with seconds and the CDT/CST designation. For future scans, record actual UTC scan start/completion times at those events; never infer scan time from a UI or app deployment. Set the results upload time from its verified publication event. Feature-only updates must preserve the previous research completion, results upload and price cutoff.

## Share the top 15 as one image

The prominent Share top 15 image button exports one PNG containing the first 15 ranked research stocks. It includes revenue growth, profit growth, high-reference drawdown, prices, catalysts, shortlist/watch labels and the original result upload timestamp. Seven additional names remain watchlist entries; they are not reclassified as strict shortlist passes.

Regenerate this combined report with `python3 scripts/render_top15.py` after verifying and updating its source data and compact catalyst/exception descriptions. The asset is `dist/cards/top-15-research-2026-10-07.png`. The individual stock sharing control is labeled Share this stock.


## Fresh strict scan — October 7, 2026

Research began 06:54:40 UTC and completed 07:11:33 UTC (02:11:33 CDT). Prices are October 6 closes. The strict JSON/CSV and HTML report contain seven company research candidates, one excluded early valuation watch, and 12 rejections. Earlier scan files are retained as historical artifacts and are not the current screen.

Massive daily adjusted price history supplied moving averages and support references; AlphaStocks supplied quote cross-checks. Current company filings override conflicting legacy/secondary calculations. No live option-chain snapshot was entitled; all scores receive 0/5 option-quality points. Contract spreads, IV, delta, open interest and liquidity remain unverified.

Update `scripts/build_strict_scan.py` only after a fresh manual financial audit; `render_strict.py` renders the current data to one combined PNG, eight individual cards and a ZIP. `strict_technicals.json` is a dated snapshot, not a data feed. Do not rerun the one-time UI migration script on an already migrated checkout.

Share tests cover cached file preparation, synchronous native-share invocation, cancellation, fallback preview and full-list selection. No physical phone/browser share-sheet test was available. Mobile CSS retains 44px+ controls and readable horizontal scrolling for quarterly evidence.


## Daily dip / entry-plan layer

The dashboard now separates **audited company qualification** from **dated market-entry timing**.

- `dist/data/strict-scan-YYYY-MM-DD.json` remains the fundamental research record.
- `dist/data/market-latest.json` is the replaceable market-regime and staged-support layer.
- The daily layer may change without rewriting the audited company screen.
- A market trigger starts analysis; it never creates an automatic trade.

Default market-dislocation thresholds:

- SPY <= -1.75% from the prior close
- QQQ <= -2.25% from the prior close
- VIX > 20
- or a material macro/news shock causing broad indiscriminate selling

Stronger dip context is SPY <= -2.5% and/or QQQ <= -3.0%, especially with elevated volatility.

Each qualified name can carry up to three underlying-stock support zones using a 30% / 30% / 40% staged plan. Adds require an intact thesis and price confirmation. Never average because an option premium alone is falling.

The first dated entry map is prepared for the October 7, 2026 session using October 6 closing data. It correctly reports no A+ broad-market dip trigger. Live option contract selection remains separate and must verify expiration, delta, IV, bid/ask spread and open interest before any contract is chosen.

### Intended automation

1. **2:00 PM America/Chicago on U.S. trading weekdays:** always create the daily LEAPS market/entry report.
2. **Intraday condition watch:** check market conditions during the session and notify only when SPY/QQQ/VIX/macro conditions produce a meaningful dip.
3. On a triggered scan, refresh the market regime first, then evaluate the qualified company list against support, thesis integrity, valuation and reversal confirmation.
4. If GitHub write access is available during the scheduled run, update `dist/data/market-latest.json` with the new dated snapshot. Do not modify historical strict-scan files merely because market prices moved.


## Professional mobile public app (v3)

The public LEAPS Desk is now designed mobile-first and backed by a public read-only Supabase feed.

### Architecture

- **Railway** — public hosting and automatic deploys from GitHub main.
- **GitHub** — source of truth for the app and fallback JSON snapshots.
- **Supabase** — persistent latest scan + research history for the public dashboard.
- **Massive** — market price/history and technical support inputs when available.
- **AlphaStocks** — company risk/news context.
- **Current web research** — earnings, macro/event risk and option-chain verification when connected tools do not provide the needed fact.
- **ChatGPT automations** — 2 PM daily scan plus intraday dip-condition watch.

Public Supabase tables:
- `public.leap_scans`
- `public.leap_research_snapshots`

Both tables use RLS and grant **SELECT only** to `anon` and `authenticated`. There is no public browser write path.

### Qualification model

There are now two paths into the qualified universe:

1. **Deep Discount / Recovery** — normally 30–70% below a meaningful high with fundamentals intact.
2. **Quality Compounder Pullback** — elite GAAP-profitable companies can qualify with a smaller pullback when valuation compression, major support or broad-market weakness creates attractive long-term risk/reward.

Tariff exposure is **not** a qualification filter or scoring penalty. Tariff headlines can be recorded as temporary event/margin context, but hardware, med-tech, robotics and other physical-product businesses are not rejected merely for tariff exposure.

The current master instructions live in `MASTER_PROMPT.md`.

### Mobile information architecture

Bottom navigation:
- **Desk** — market regime, SPY/QQQ/VIX, top opportunity queue.
- **Setups** — qualified company cards with 30/30/40 entry ladders and confirmation.
- **Contracts** — delayed contract references, liquidity/readiness and live-verification warnings.
- **Research** — two-lane methodology, rankings, scan history, rejections and scoring.

The app reads Supabase first and falls back to GitHub JSON if the database feed is temporarily unavailable.
