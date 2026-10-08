"""Regression checks for invalid publications; no external writes or data feeds."""
import copy, json, subprocess, tempfile, unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = json.loads((ROOT/'dist/data/research-latest.json').read_text())
MARKET = json.loads((ROOT/'dist/data/market-latest.json').read_text())

class PublicationIntegrity(unittest.TestCase):
    def check_payload(self, research, market, succeeds=False):
        with tempfile.TemporaryDirectory() as directory:
            r, m = Path(directory)/'research.json', Path(directory)/'market.json'
            r.write_text(json.dumps(research)); m.write_text(json.dumps(market))
            result = subprocess.run(['python3', str(ROOT/'scripts/validate_publication.py'), str(r), str(m)], capture_output=True, text=True)
            self.assertEqual(result.returncode == 0, succeeds, result.stderr)

    def test_current_snapshot(self):
        self.check_payload(RESEARCH, MARKET, True)

    def test_malformed_publications_are_blocked(self):
        mutations = [
            ('completion missing', lambda r,m: r.pop('scanCompletedAt')),
            ('tier counts wrong', lambda r,m: r['researchFunnel'].update(tier1Count=99)),
            ('score breakdown missing', lambda r,m: r['candidates'][0].pop('scoreBreakdown')),
            ('GAAP latest loss', lambda r,m: r['candidates'][0]['quarter']['net'].__setitem__(0,-1)),
            ('latest negative FCF', lambda r,m: r['candidates'][0]['fcf'].__setitem__(0,-1)),
            ('TTM negative FCF', lambda r,m: r['candidates'][0].update(fcfTTM=-1)),
            ('non-qualified plan', lambda r,m: m['candidatePlans'][0].update(ticker='FAKE')),
            ('duplicate ranks', lambda r,m: r['candidates'][1].update(rank=1)),
            ('wrong actionable count in same-time publication', lambda r,m: (r['researchFunnel'].update(actionableToday=99),m.update(scanCompletedAt=r['scanCompletedAt']))),
            ('earnings history missing', lambda r,m: r['candidates'][0].pop('earningsSurprises')),
            ('annual financial history missing', lambda r,m: r['candidates'][0].pop('annualFinancials')),
            ('ambiguous EPS basis', lambda r,m: r['candidates'][0].update(earningsSurprises=[dict(epsBasis='unknown',epsConsensus=1,epsResult='BEAT')])),
            ('adjusted actual missing', lambda r,m: r['candidates'][0].update(earningsSurprises=[dict(epsBasis='adjusted',epsConsensus=1,epsResult='BEAT')])),
        ]
        for name, mutate in mutations:
            with self.subTest(name=name):
                r,m=copy.deepcopy(RESEARCH),copy.deepcopy(MARKET);mutate(r,m);self.check_payload(r,m)

    def test_current_eligible_contract_and_invalid_variants(self):
        future = str(datetime.now(timezone.utc).year+2)+'-01-21'
        eligible = dict(ticker='ADSK',classification='eligible',verified=True,quoteObservedAt=datetime.now(timezone.utc).isoformat(),strike=200,delta=.65,bid=98,ask=100,openInterest=3000,iv=.30,expiration=future,fundamentalTargets=dict(bear=260,base=300))
        m=copy.deepcopy(MARKET);m['contractProfiles']=[eligible];self.check_payload(RESEARCH,m,True)
        for name, updates in [('expired',dict(expiration='2025-01-17')),('stale',dict(quoteObservedAt='2026-01-01T00:00:00Z')),('modeled',dict(verified=False)),('bad spread',dict(bid=80)),('wrong delta',dict(delta=.80)),('missing IV',dict(iv=None)),('OTM',dict(strike=300)),('bear below strike',dict(fundamentalTargets=dict(bear=180,base=300)))]:
            with self.subTest(name=name):
                m=copy.deepcopy(MARKET);m['contractProfiles']=[dict(eligible,**updates)];self.check_payload(RESEARCH,m)

if __name__=='__main__': unittest.main()
