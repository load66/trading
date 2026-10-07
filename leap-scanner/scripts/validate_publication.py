#!/usr/bin/env python3
import json
import math
import sys
from pathlib import Path

def fail(msg, errors):
    errors.append(msg)

def finite(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)

def load(path):
    return json.loads(Path(path).read_text())

research_path = Path(sys.argv[1] if len(sys.argv) > 1 else "dist/data/research-latest.json")
market_path = Path(sys.argv[2] if len(sys.argv) > 2 else "dist/data/market-latest.json")
research = load(research_path)
market = load(market_path)
errors, warnings = [], []

if not research.get("asOf"):
    fail("research.asOf is required", errors)
if not market.get("marketAsOf"):
    fail("market.marketAsOf is required", errors)

candidates = research.get("candidates") or []
qualified = [c for c in candidates if c.get("qualified") is True]
qualified_tickers = {c.get("ticker") for c in qualified}

ranks = [c.get("rank") for c in qualified]
expected = list(range(1, len(qualified) + 1))
if ranks != expected:
    fail(f"qualified ranks must be sequential research ranks {expected}; got {ranks}", errors)

seen = set()
for c in qualified:
    t = c.get("ticker") or "<missing>"
    if t in seen:
        fail(f"duplicate qualified ticker: {t}", errors)
    seen.add(t)

    score = c.get("score")
    breakdown = c.get("scoreBreakdown") or {}
    if breakdown:
        total = sum(v for v in breakdown.values() if finite(v))
        if not finite(score) or abs(total - score) > 1e-9:
            fail(f"{t}: score {score} does not equal scoreBreakdown total {total}", errors)

    eps = c.get("gaapEPSTTM")
    latest_net = ((c.get("quarter") or {}).get("net") or [None])[0]
    if not ((finite(eps) and eps > 0) or (finite(latest_net) and latest_net > 0)):
        fail(f"{t}: qualified company lacks verified positive GAAP profitability", errors)

    latest_rev = ((c.get("quarter") or {}).get("revg") or [None])[0]
    if not finite(latest_rev) or latest_rev <= 0:
        fail(f"{t}: qualified company lacks positive latest YoY revenue growth", errors)

    ttm_fcf = c.get("fcfTTM")
    latest_fcf = (c.get("fcf") or [None])[0]
    if not finite(ttm_fcf) or ttm_fcf <= 0:
        fail(f"{t}: TTM free cash flow must be positive", errors)
    if not finite(latest_fcf) or latest_fcf <= 0:
        fail(f"{t}: latest-quarter free cash flow must be verified and positive", errors)

    surprises = c.get("earningsSurprises")
    if surprises is None:
        warnings.append(f"{t}: earnings-surprise history not stored; UI must show UNVERIFIED")
    elif not isinstance(surprises, list):
        fail(f"{t}: earningsSurprises must be an array when present", errors)
    else:
        for i, row in enumerate(surprises[:4]):
            if not isinstance(row, dict):
                fail(f"{t}: earningsSurprises[{i}] must be an object", errors)
                continue
            basis = row.get("epsBasis") or row.get("basis")
            result = row.get("epsResult") or row.get("result")
            consensus = row.get("epsConsensus") if finite(row.get("epsConsensus")) else row.get("consensus")
            if result and (not basis or not finite(consensus)):
                fail(f"{t}: earnings surprise result requires verified consensus and GAAP/adjusted basis", errors)

funnel = research.get("researchFunnel") or {}
if finite(funnel.get("qualifiedCount")) and int(funnel["qualifiedCount"]) != len(qualified):
    fail(f"researchFunnel.qualifiedCount={funnel['qualifiedCount']} but {len(qualified)} candidates are qualified", errors)

for p in market.get("candidatePlans") or []:
    t = p.get("ticker")
    if t and t not in qualified_tickers:
        fail(f"market plan exists for non-qualified ticker {t}", errors)

for c in market.get("contractProfiles") or []:
    t = c.get("ticker")
    if t and t not in qualified_tickers:
        fail(f"contract profile exists for non-qualified ticker {t}", errors)
    classification = c.get("classification")
    if classification not in {"eligible", "historical_reference", "no_verified_contract"}:
        warnings.append(f"{t}: contract classification missing/unknown ({classification!r})")
        continue
    if classification != "eligible":
        continue

    company = next((x for x in qualified if x.get("ticker") == t), None)
    strike, delta = c.get("strike"), c.get("delta")
    bid, ask, oi = c.get("bid"), c.get("ask"), c.get("openInterest")
    iv = c.get("iv") if finite(c.get("iv")) else c.get("impliedVolatility")

    if not company or not finite(strike) or not finite(company.get("price")) or strike >= company["price"]:
        fail(f"{t}: eligible contract must be ITM now", errors)
    if not finite(delta) or not (0.60 <= delta <= 0.75):
        fail(f"{t}: eligible contract delta must be reported and between 0.60 and 0.75", errors)
    if not finite(oi) or oi < 0:
        fail(f"{t}: eligible contract requires open interest", errors)
    if not (finite(bid) and finite(ask) and bid > 0 and ask >= bid):
        fail(f"{t}: eligible contract requires current valid bid/ask", errors)
    else:
        spread = (ask - bid) / ((ask + bid) / 2)
        if spread > 0.05:
            fail(f"{t}: eligible contract spread {spread:.2%} exceeds 5%", errors)
    if not finite(iv):
        fail(f"{t}: eligible contract requires current IV", errors)

for w in warnings:
    print("WARNING:", w, file=sys.stderr)
if errors:
    print("LEAPS publication validation FAILED", file=sys.stderr)
    for e in errors:
        print("ERROR:", e, file=sys.stderr)
    sys.exit(1)

print(f"LEAPS publication validation passed: {len(qualified)} qualified companies; {len(market.get('contractProfiles') or [])} contract records checked.")
