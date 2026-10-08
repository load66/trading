# LEAPS Desk

Production mobile-first LEAPS research and entry-planning dashboard.

Permanent public app: https://leaps-desk.up.railway.app/

The current production architecture uses GitHub as source/fallback, Supabase for append-only research and market snapshots, Railway for hosting, Massive + AlphaStocks + current web research for evidence, a complete detailed 12:30 PM weekday research scan, and an intraday market-timing watcher.

`MASTER_PROMPT.md` is the canonical research-policy source. `GENERATE_WORKFLOW.md` defines the publication workflow. Historical sections below document earlier versions and must not override those two files.

## Research files

- `dist/data/scan-2026-10-07.json`: 36 candidates, ranks, profitability checks, source URLs and caveats.
- `dist/cards/`: PNG report cards for RDDT, ORCL, IOT, ADBE, ADSK, APP, ACN and SAP, plus a ZIP.
- `dist/LEAPS_Stock_Watchlist_2026-10-07.xlsx`: full workbook and quarterly audit.

## Upload a refreshed result

Current publication is controlled by `GENERATE_WORKFLOW.md`. A full refresh verifies earnings, prices, high references, positive latest-quarter and TTM FCF, valuation, support and long-dated option quality; builds the latest research/market payloads; runs `scripts/validate_publication.py`; writes append-only Supabase snapshots; commits the validated fallback data; and verifies Railway deployment. The weekday 12:30 PM automation runs the same complete research workflow, while the intraday watcher is timing-only.

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
- The intraday layer may change without rewriting the audited company screen; the full 12:30 PM research scan can update qualification and scores.
- A market trigger starts analysis; it never creates an automatic trade.

Default market-dislocation thresholds:

- SPY <= -1.75% from the prior close
- QQQ <= -2.25% from the prior close
- VIX > 20
- or a material macro/news shock causing broad indiscriminate selling

Stronger dip context is SPY <= -2.5% and/or QQQ <= -3.0%, especially with elevated volatility.

Each qualified name can carry three published support zones using the 30% / 30% / 40% staged plan. Staged entries require reaching major support, an intact thesis and material-news review; no mandatory reversal confirmation or -2% to -5% daily-price move. Never average because an option premium alone is falling.

The first dated entry map is prepared for the October 7, 2026 session using October 6 closing data. It correctly reports no A+ broad-market dip trigger. Live option contract selection remains separate and must verify expiration, delta, IV, bid/ask spread and open interest before any contract is chosen.

### Current automation

1. **12:30 PM America/Chicago on U.S. trading weekdays:** run the complete detailed `MASTER_PROMPT.md` research workflow, including broad discovery, hard GAAP/revenue/FCF gates, rescoring, qualification changes, valuation, support and contract-readiness research.
2. **Intraday condition watch:** market/entry-timing only. It may refresh market regime, support/action labels, event risk and contract readiness, but it must not change the fundamental qualified universe or research scores.
3. Every publication must pass `scripts/validate_publication.py` (or an equivalent integrity check) before Supabase/GitHub publication.
4. Historical snapshots stay append-only. The public app always uses the permanent research rank; intraday action status never renumbers the qualified list.


## Professional mobile public app (v3)

The public LEAPS Desk is now designed mobile-first and backed by a public read-only Supabase feed.

### Architecture

- **Railway** — public hosting and automatic deploys from GitHub main.
- **GitHub** — source of truth for the app and fallback JSON snapshots.
- **Supabase** — persistent latest scan + research history for the public dashboard.
- **Massive** — market price/history and technical support inputs when available.
- **AlphaStocks** — company risk/news context.
- **Current web research** — earnings, macro/event risk and option-chain verification when connected tools do not provide the needed fact.
- **ChatGPT automations** — 12:30 PM daily scan plus intraday dip-condition watch.

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

### Unified Desk layout

Each qualified stock card contains its research, support plan and a LEAP contract disclosure, collapsed by default. Expansion is preserved during feed refreshes. The contract screen uses delta 0.60–0.75 inclusive with no premium/contract-cost cap or preferred sub-band. Among eligible calls with comparable current liquidity data and acceptable spreads, choose the highest open interest; the tightest spread as a percentage of midpoint breaks ties. Missing OI or bid/ask remains provisional. Existing dated references are not freshly verified liquidity winners.

The app independently reads Supabase research and market snapshots, selects the latest actual scan-completion timestamps (not merely the last-uploaded rows), and retains the last good copy when either feed fails. GitHub JSON is the cold-start fallback. Public prices are dated observations, not claimed as live quotes.

### Research control

- Sending **`generate`** in the LEAPS project chat runs the complete detailed research refresh immediately.
- The **12:30 PM weekday job runs the same full research policy** and may add, remove, or rescore candidates when evidence warrants.
- The **intraday watcher is timing-only** and cannot change fundamental qualification or research scores.
- Supabase research snapshots are append-only history; GitHub `research-latest.json` is the public fallback.
- `MASTER_PROMPT.md` is the single canonical policy source; duplicated documentation must not override it.
- The public UI displays research-snapshot freshness separately from market-scan freshness.

## Publication and regression protection (October 8, 2026)

- Research selection is monotonic by `payload.scanCompletedAt`. A later INSERT containing old results cannot replace newer research; previous-rank comparisons skip duplicate completion timestamps.
- The intraday market reader and research reader refresh independently, preserve their last good data through transient outages, and display partial/stale-data warnings. The frontend renders the research-completed and price-observed timestamps separately.
- Financial details show quarterly and annual revenue/GAAP-net-income bar charts plus latest-quarter EPS and revenue BEAT/MEET/MISS only when comparably verified. Missing/adjusted-basis-incompatible consensus remains UNVERIFIED.
- GitHub Actions `.github/workflows/leaps-desk-integrity.yml` validates saved publication payloads, publication rejections, rank/support/contract safeguards, private Alpaca isolation and independent browser-feed fallbacks on pushes and pull requests.
- Local suite from `leap-scanner/`: `python3 scripts/validate_publication.py`, `python3 -m unittest discover -s scripts -p 'test_publication_integrity.py' -v`, `node scripts/test_desk_integrity.js`, `node scripts/test_alpaca_live.js`, and `node scripts/test_public_refresh.js`.
- The 12:30 PM CT weekday full research run and 1:45 PM CT recovery check are separate enabled automations. Running on schedule, and publishing valid fresh snapshots, must be established from execution records; an enabled switch is not proof of successful future publication.
