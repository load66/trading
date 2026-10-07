#!/usr/bin/env python3
import json
import math
import sys
from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

def fail(msg, errors):
    errors.append(msg)

def finite(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)

def load(path):
    return json.loads(Path(path).read_text())

def timestamp(value):
    try:
        dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return dt if dt.tzinfo is not None else None
    except (ValueError, TypeError):
        return None

def comparison(actual, estimate):
    return 'MEET' if abs(actual-estimate) < .005 else 'BEAT' if actual > estimate else 'MISS'

research_path = Path(sys.argv[1] if len(sys.argv) > 1 else "dist/data/research-latest.json")
market_path = Path(sys.argv[2] if len(sys.argv) > 2 else "dist/data/market-latest.json")
research = load(research_path)
market = load(market_path)
errors, warnings = [], []

if not research.get("asOf"):
    fail("research.asOf is required", errors)
if not market.get("marketAsOf"):
    fail("market.marketAsOf is required", errors)
for name, payload in [('research', research), ('market', market)]:
    if timestamp(payload.get('scanCompletedAt')) is None:
        fail(f'{name}.scanCompletedAt must be an ISO timestamp with timezone', errors)

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
    if not finite(score) or not (0 <= score <= 100):
        fail(f'{t}: score must be between 0 and 100', errors)
    breakdown = c.get("scoreBreakdown") or {}
    if not breakdown or len(breakdown) != 8 or not all(finite(v) and v >= 0 for v in breakdown.values()):
        fail(f'{t}: complete eight-category numeric scoreBreakdown is required', errors)
    if breakdown:
        total = sum(v for v in breakdown.values() if finite(v))
        if not finite(score) or abs(total - score) > 1e-9:
            fail(f"{t}: score {score} does not equal scoreBreakdown total {total}", errors)

    eps = c.get("gaapEPSTTM")
    latest_net = ((c.get("quarter") or {}).get("net") or [None])[0]
    if not (finite(eps) and eps > 0 and finite(latest_net) and latest_net > 0):
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
            normalized_basis = str(basis or '').upper().replace('NON-GAAP', 'ADJUSTED')
            actual = ((c.get('quarter') or {}).get('eps') or c.get('eps') or [None]*4)
            actual = actual[i] if i < len(actual) and normalized_basis == 'GAAP' else row.get('adjustedEps') if normalized_basis == 'ADJUSTED' else None
            if result and str(result).upper() != 'UNVERIFIED':
                if normalized_basis not in {'GAAP', 'ADJUSTED'} or not finite(consensus) or not finite(actual):
                    fail(f'{t}: EPS surprise requires a comparable actual, consensus and GAAP/adjusted basis', errors)
                elif str(result).upper() != comparison(actual, consensus):
                    fail(f'{t}: EPS surprise label contradicts the comparable actual and consensus', errors)
            rev_result = row.get('revenueResult')
            if rev_result and str(rev_result).upper() != 'UNVERIFIED':
                revenues = ((c.get('quarter') or {}).get('revenues') or [])
                actual_rev = row.get('revenueActual') if finite(row.get('revenueActual')) else revenues[i] if i < len(revenues) else None
                estimate_rev = row.get('revenueConsensus')
                if not finite(actual_rev) or not finite(estimate_rev):
                    fail(f'{t}: revenue surprise requires reported revenue and consensus in matching USD millions', errors)
                elif str(rev_result).upper() != comparison(actual_rev, estimate_rev):
                    fail(f'{t}: revenue surprise label contradicts actual and consensus', errors)

funnel = research.get("researchFunnel") or {}
if finite(funnel.get("qualifiedCount")) and int(funnel["qualifiedCount"]) != len(qualified):
    fail(f"researchFunnel.qualifiedCount={funnel['qualifiedCount']} but {len(qualified)} candidates are qualified", errors)
counts = {'qualifiedCount': len(qualified), 'rejectedCount': len(research.get('rejected') or [])}
counts.update({f'tier{tier}Count': sum(c.get('tier') == tier for c in qualified) for tier in [1, 2, 3]})
for key, actual in counts.items():
    if not finite(funnel.get(key)) or funnel[key] != actual:
        fail(f'researchFunnel.{key} must match actual count {actual}', errors)
if any(c.get('tier') not in [1, 2, 3] for c in qualified):
    fail('Every qualified company requires Tier 1, 2 or 3', errors)
if not finite(funnel.get('deepReviewCount')) or funnel['deepReviewCount'] != len(qualified) + len(research.get('rejected') or []):
    fail('researchFunnel.deepReviewCount must reconcile qualified and reviewed-not-qualified companies', errors)
if set(research.get('shortlist') or []) != qualified_tickers:
    fail('research.shortlist must match qualified tickers', errors)
if {p.get('ticker') for p in market.get('candidatePlans') or []} != qualified_tickers:
    fail('Market plans must cover every qualified company exactly once', errors)
if len(market.get('candidatePlans') or []) != len(qualified):
    fail('Market plans cannot be duplicated', errors)
buy_labels = {'HIGH-CONVICTION DIP', 'BUY ZONE — ENTRY 1', 'ADD ZONE'}
actionable = sum(str(p.get('action') or '').upper() in buy_labels for p in market.get('candidatePlans') or [])
if market.get('scanCompletedAt') == research.get('scanCompletedAt') and funnel.get('actionableToday') != actionable:
    fail(f'researchFunnel.actionableToday must match current market count {actionable}', errors)

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
        fail(f"{t}: contract classification missing/unknown ({classification!r})", errors)
        continue
    if classification != "eligible":
        continue

    company = next((x for x in qualified if x.get("ticker") == t), None)
    strike, delta = c.get("strike"), c.get("delta")
    bid, ask, oi = c.get("bid"), c.get("ask"), c.get("openInterest")
    iv = c.get("iv") if finite(c.get("iv")) else c.get("impliedVolatility")

    plan = next((p for p in market.get('candidatePlans') or [] if p.get('ticker') == t), {})
    underlying = plan.get('price') if finite(plan.get('price')) else company.get('price') if company else None
    if not company or not finite(strike) or not finite(underlying) or strike >= underlying:
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
    if not finite(iv) or iv <= 0:
        fail(f"{t}: eligible contract requires current IV", errors)
    observed = timestamp(c.get('quoteObservedAt'))
    if c.get('verified') is not True or observed is None or not (0 <= (datetime.now(timezone.utc)-observed).total_seconds() <= 900):
        fail(f'{t}: eligible contract requires verified=true and quoteObservedAt within 15 minutes', errors)
    try:
        expiration = datetime.fromisoformat(str(c.get('expiration'))).replace(hour=16, tzinfo=ZoneInfo('America/New_York'))
    except (ValueError, TypeError):
        expiration = None
    if expiration is None or (expiration-datetime.now(timezone.utc)).days < 365:
        fail(f'{t}: eligible LEAP requires at least 12 months to expiration', errors)
    targets = c.get('fundamentalTargets') or {}
    if not all(finite(targets.get(k)) and finite(strike) and targets[k] > strike for k in ['bear', 'base']):
        fail(f'{t}: eligible strike must be below expiration-specific Bear and Base targets', errors)

for w in warnings:
    print("WARNING:", w, file=sys.stderr)
if errors:
    print("LEAPS publication validation FAILED", file=sys.stderr)
    for e in errors:
        print("ERROR:", e, file=sys.stderr)
    sys.exit(1)

print(f"LEAPS publication validation passed: {len(qualified)} qualified companies; {len(market.get('contractProfiles') or [])} contract records checked.")
