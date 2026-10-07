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
