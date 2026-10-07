"""Build the dated, manually researched strict screen. No live-market refresh."""
import json, csv, html
from pathlib import Path
from datetime import datetime, timezone
R=Path(__file__).resolve().parents[1]
D=R/'dist'; old=json.loads((D/'data/scan-2026-10-07.json').read_text())
old_by={r['ticker']:r for r in old['candidates']}
tech=json.loads((R/'scripts/strict_technicals.json').read_text())
SCORES=['Fundamental Quality','Earnings Momentum','Valuation / Drawdown','Future Catalysts','Competitive Advantage','Low Tariff / Macro Exposure','Technical Quality','LEAP Option Quality']
MAX=[25,20,15,15,10,5,5,5]
spec={
'ADSK':dict(tier=1,points=[24,18,12,13,9,4,2,0],eps=[2.33,2.32,1.47,1.60],fcf=[561,876,972,430,451,556,678,199],state='Building Base',tariff='Low',macro='Medium',pe=29.97,pfcf=17.03,evfcf=16.80,
 down='Software valuation compression, AI disruption concerns, sales-channel changes and cash-flow guidance affected by MaintainX acquisition costs. The historical 2024 cash-flow-practices investigations closed in August 2025; shareholder litigation remains a governance risk.',
 cash='TTM FCF $2.84B, +50.7% YoY; latest quarter $561M, +24.4%. OCF $575M; capex $14M. Direct-sales transaction changes affect collection timing, so do not extrapolate one cash-rich quarter.',
 margins='Latest GAAP operating margin 29.3% versus 25.2%; gross margin 91.4% versus 91.0%. Latest net-income growth also benefits from a lower tax rate.',
 balance='About $4.16B cash/investments versus $3.71B total debt including leases (secondary aggregation). FY27 SBC guidance about 9% of revenue. Latest diluted shares 211M versus 215M a year earlier.',
 catalysts=['Direct sales and sales reorganization can retain channel economics and expand operating margins.','Construction Cloud and design/manufacturing subscriptions can increase product attach and recurring revenue.','MaintainX can add maintenance-software subscriptions and cross-selling, offset by integration costs.','AI design/workflow features can support higher-value subscription tiers; incremental AI revenue is not separately verified.'],
 moat='AutoCAD/Revit file formats, installed users and embedded design workflows produce substantial switching costs.',
 valuation='At about 17.0x TTM FCF / 30.0x GAAP earnings, attractive relative to 30.3x P/FCF at Q3 FY26 and 34.4x at Q2 FY26. Cheaper on cash flow than Reddit; it earns a premium over slower Accenture. Consensus forward P/E (~17.8x) may use adjusted EPS.',
 risk='Construction/manufacturing budgets, MaintainX integration and cash-collection comparability; historical accounting-practices litigation warrants monitoring.',
 recovery='A return to the $344.39 August 2021 high is fundamentally plausible over 12–36 months if recurring growth and margin gains persist. That old valuation is not guaranteed.',
 invalidation='Organic growth slips to low single digits, GAAP operating margins reverse materially, cash collection worsens, or new material accounting findings emerge.'),
'RDDT':dict(tier=1,points=[23,20,10,14,8,3,2,0],eps=[1.25,1.01,1.24,.80],fcf=[260.74,311.16,263.64,183.10,110.83,126.60,89.16,70.27],state='Building Base',tariff='Low',macro='Medium',pe=34.72,pfcf=28.13,evfcf=25.42,
 down='High-growth valuation compression and concerns that search engines and AI summaries will divert traffic. The Q2 earnings selloff occurred despite revenue and profit growth; revenue growth slowed from about 69% to 61%.',
 cash='TTM FCF $1.02B, +156.7% YoY. Latest FCF $260.7M, +135.3%; OCF $261.9M. Latest FCF margin 32.4% versus 22.2%.',
 margins='Latest gross margin 91.3% versus 90.8%; operating margin 28.8% versus 13.5%. Revenue, operating profit, net income and cash flow improve together.',
 balance='About $2.79B cash/investments; negligible funded debt. Latest SBC about $101M (~12.5% of sales); fully diluted shares rose only about 0.2% YoY in the Q2 release.',
 catalysts=['AI-assisted Max ad campaigns and creative automation can improve advertiser conversion and ad pricing.','Shopify integration and performance ads can broaden paying advertisers and commerce ad spend.','International monetization: Q2 international revenue +84% and ARPU +31%; translation expands accessible audiences.','Data licensing can add high-margin revenue, but new large agreements are not assumed in the base case.'],
 moat='Community network effects and a proprietary corpus of human conversations; advertising is recurring activity rather than contracted SaaS revenue.',
 valuation='28.1x P/FCF and 34.7x GAAP P/E: attractive for sustained growth, but not conventionally cheap. P/FCF was about 84.5x at September 2025. More expensive than Adobe, Autodesk and Salesforce; requires much faster growth.',
 risk='Dependence on search referrals, weaker US user growth, advertising budgets and data/privacy regulation.',
 recovery='The $263.50 January 2026 high is plausibly recoverable if user monetization and cash growth continue; stronger direct/logged-in engagement would reduce the main risk.',
 invalidation='Persistent direct-user or engagement erosion, ad growth drops sharply without offsetting monetization, gross margins deteriorate, or data-access restrictions undermine the moat.'),
'ADBE':dict(tier=1,points=[23,15,14,12,10,4,1,0],eps=[4.62,4.25,4.60,4.45],fcf=[2438,2107,2921,3126,2126,2144,2456,2873],state='Early Bottom',tariff='Low',macro='Medium',pe=13.29,pfcf=8.75,evfcf=8.86,
 down='Investors fear AI-native creative tools will erode subscription pricing. CEO transition and slower ARR expectations add uncertainty; this could be structural, not simply sentiment.',
 cash='TTM FCF $10.59B, +10.3% YoY. Latest $2.44B, +14.7%; prior quarter declined 1.7%. Cash generation is strong, but not accelerating every quarter.',
 margins='Latest operating margin 34.8% versus 36.3%; gross margin 88.7% versus 89.3%. This is a margin exception to the ideal divergence despite rising GAAP net income.',
 balance='About $5.64B cash/investments versus $6.79B total debt. Latest stock-based/deferred compensation ~$544M (~8% of revenue). Buybacks reduced diluted shares from about 424M to 395M.',
 catalysts=['Firefly subscriptions and generative-credit consumption can turn AI use into paid recurring revenue.','Acrobat AI Assistant and business document workflows can upsell the installed document base.','Enterprise content generation/orchestration can expand marketing-platform contracts.','AI-first ARR exceeded $650M and grew >150% YoY; AI monetization remains small versus total revenue.'],
 moat='Creative file standards, enterprise workflows, installed users and distribution; consumer/prosumer creation is more vulnerable to AI substitutes.',
 valuation='8.8x P/FCF / 13.3x GAAP P/E: cheapest established software cash-flow multiple here alongside Intuit. P/FCF was ~15.8x at Q3 FY25 and ~28.9x at Q4 FY24. Low consensus forward P/E (~8.9x) may reflect adjusted EPS.',
 risk='AI substitutes weaken pricing/retention while compute and product investment pressure margins; management transition adds execution risk.',
 recovery='Recovering the recent $363.70 high is plausible if ARR and margins stabilize. Recovering the much higher 2021 peak is not assumed.',
 invalidation='Sustained paid-seat/ARR deterioration, AI revenue fails to offset cannibalization, repeated guidance reductions, or persistent GAAP margin erosion.'),
'ACN':dict(tier=2,points=[22,13,14,12,9,3,4,0],eps=[3.29,3.80,2.93,3.54],fcf=[2845,3600,3668,1508,3806,3515,2683,870.28],state='Confirmed Reversal',tariff='Low',macro='Medium',pe=14.26,pfcf=9.92,evfcf=9.97,
 down='Fears that AI will reduce billable consulting work, cautious client budgets and slower bookings. The October 1 earnings rally improved sentiment, but followed a guidance cut earlier in FY26.',
 cash='FY26 FCF $11.62B, +6.7%. Latest quarter $2.85B, down 25.3% YoY; OCF fell and capex rose. Three prior quarters grew FCF. This is a material latest-quarter exception.',
 margins='Latest GAAP operating margin 15.3% versus 11.6%, but only about 0.2 percentage points above the prior adjusted margin because prior severance costs depress the GAAP comparison. Gross margin stable around 32%.',
 balance='About $12.84B cash/investments versus $13.40B total debt including leases. Debt/FCF ~1.15x; repurchases reduce share count. Labor-intensive delivery is less scalable than SaaS.',
 catalysts=['Convert $22.17B quarterly consulting/managed-services bookings into recognized revenue.','AI/data implementation, model integration and governance generate project fees rather than hypothetical AI exposure.','Managed-services contracts can expand recurring multi-year delivery revenue.','AI-assisted delivery can improve utilization and margins, provided clients do not capture all productivity savings through lower prices.'],
 moat='Enterprise relationships, regulated-industry expertise, integration ecosystem and global delivery; less lock-in than proprietary software.',
 valuation='9.9x P/FCF / 14.3x GAAP P/E: attractively priced for a durable services firm. P/FCF was ~14.9x at Q4 FY25 and ~25.0x at Q1 FY25. Slower 3–6% FY27 local-currency growth justifies a discount to Autodesk/Reddit.',
 risk='AI-driven price reductions, labor-fee compression and discretionary enterprise spending. Latest FCF weakness needs reversal.',
 recovery='The recent $291.09 high is possible with renewed bookings conversion and stable margins; requires a services re-rating, not explosive revenue growth.',
 invalidation='Repeated guidance cuts, sustained organic revenue/bookings contraction, AI savings erode billing faster than new work grows, or FCF weakness persists.'),
'INTU':dict(tier=2,points=[23,14,14,12,10,3,1,0],eps=[1.34,11.09,2.48,1.59],fcf=[1304,5236,1524,599,396,4360,1038,329],state='Still Falling',tariff='Low',macro='Medium',pe=17.61,pfcf=8.94,evfcf=9.08,
 down='Growth/valuation reset, weak Mailchimp and softer FY27 guidance; management prioritized customer growth. TurboTax units declined ~2%, a competitive warning rather than a pure sentiment issue.',
 cash='FY26 OCF $8.84B; capex $221M; FCF $8.62B, +41.7%. Cash growth includes tax/working-capital timing and should not be treated as a repeatable 42% trend. Annual company cash-flow totals override a conflicting secondary quarterly aggregation.',
 margins='FY26 operating income grew ~20% versus revenue ~14%, expanding annual GAAP margin. Latest quarterly net income fell 4.7%; NI grew in 3 of 4 quarters. Seasonal Q3 must be compared with prior-year Q3.',
 balance='Company-reported $7.20B corporate cash/investments versus $7.70B funded debt (customer funds excluded); secondary debt aggregation including leases is $8.42B. FY26 SBC ~$2.06B (~9.6% of revenue); diluted annual shares fell about 2%.',
 catalysts=['QuickBooks AI bookkeeping/collections agents can increase automation value, subscription tiers and retention.','Enterprise Suite can move QuickBooks customers into higher-revenue midmarket contracts.','TurboTax Live/expert services can raise revenue per filer despite pressure on do-it-yourself units.','Credit Karma referrals/payments can monetize users, with credit and interest-rate sensitivity.'],
 moat='Accounting/tax datasets, financial integrations, accountant ecosystem and workflow switching costs; tax unit losses need monitoring.',
 valuation='8.9x P/FCF / 17.6x GAAP P/E: deep compression from ~35.8x P/FCF at Q4 FY25. Cheap relative to most software here, but FY27 revenue guidance of 9–10% is below FY26 ~14%; cash timing and competition matter.',
 risk='AI tax/accounting competition, weak Mailchimp and customer losses; Credit Karma adds macro sensitivity.',
 recovery='A full recovery to $689.17 (+138%) is not a base-case expectation within an 18–30 month option window. It needs restored double-digit growth, margin confidence and a substantial re-rating.',
 invalidation='Tax units/customer retention continue shrinking, QuickBooks growth materially slows, repeated guidance cuts occur, or FCF normalizes sharply lower.'),
'CRM':dict(tier=2,points=[20,15,12,14,9,3,3,0],eps=[4.29,2.42,2.07,2.19],fcf=[1098,6556,5323,2177,605,6297,3816,1779],state='Confirmed Reversal',tariff='Low',macro='Medium',pe=20.85,pfcf=12.22,evfcf=14.26,
 down='AI agents threaten seat-based pricing; organic growth is slower than reported growth. Informatica integration and a debt-funded $25B accelerated buyback increase financial complexity.',
 cash='TTM FCF $15.15B, +21.2%. Latest FCF $1.10B, +81.5%; H1 grew 10.9%. FY27 FCF growth guidance only 4–5%, meaning cash-growth deceleration is expected.',
 margins='Latest GAAP operating margin ~20.5%; FY27 guidance 20.1%. Reported EPS $4.29 includes $2.43 from investment gains; removing that contribution leaves $1.86 versus $1.96 a year earlier. Do not mistake reported profit growth for purely operating improvement.',
 balance='Total debt including leases about $42.38B, debt/FCF ~2.8x. SBC guidance ~9% of revenue. Buybacks reduce shares but add leverage; Enterprise Value/FCF is less flattering than equity P/FCF.',
 catalysts=['Agentforce premium editions and usage/Flex Credits can generate incremental subscription and consumption revenue.','Data 360/Informatica can monetize data preparation required for enterprise agents.','Slackbot and workflow automation can expand paid platform use beyond CRM seats.','Agentforce ARR exceeded $1.5B, but its Q2 definition broadened to include Slackbot and Headless 360; do not treat all reported growth as comparable organic growth.'],
 moat='Large installed enterprise customer base, workflow integrations, customer data and platform ecosystem; seat-model disruption remains a risk.',
 valuation='12.2x P/FCF / 14.3x EV/FCF; about 20.9x reported GAAP P/E includes investment gains. P/FCF was ~19.8x at Q2 FY26. Cheaper than Autodesk/Reddit, but acquisition contribution, debt and slower organic growth justify a discount.',
 risk='Agent monetization cannibalizes seat revenue; debt, integration costs and volatile investment gains cloud earnings quality.',
 recovery='The $369 December 2024 high is plausible only if organic growth improves and agents create net new revenue. Investment portfolio gains alone do not justify returning to the old multiple.',
 invalidation='Organic recurring revenue weakens, agent revenue does not exceed cannibalized seats, leverage rises further without cash improvement, or retention deteriorates.'),
'HUBS':dict(tier=2,points=[20,17,12,13,8,3,1,0],eps=[.86,.62,1.04,.31],fcf=None,state='Early Bottom',tariff='Low',macro='Medium',pe=76.71,pfcf=16.45,evfcf=None,
 down='AI disruption fears, pressure on SMB budgets and a reset in premium software valuations. Next-quarter revenue guidance around +14% is slower than the latest +20%, weakening the reacceleration thesis.',
 cash='Q2 strict FCF $163.15M versus $112.90M (+44.5%): GAAP OCF $222.76M less $19.65M PPE and $39.95M capitalized software. H1 strict FCF $312.21M versus $230.71M (+35.3%); TTM strict FCF $658.44M. Restructuring addbacks are excluded.',
 margins='Q2 GAAP operating margin +4.8% versus -3.2%, but gross margin fell to ~82.4% from ~83.9%, including hosting/AI costs. Four positive net-income quarters are verified; the absolute GAAP margin remains modest.',
 balance='About $1.4B cash/investments. Q2 SBC expense $128.5M (~14.1% of revenue), plus $15.2M capitalized SBC; significant economic cost despite buybacks. Profitability is young.',
 catalysts=['Paid Breeze agents and credit consumption can monetize prospecting, customer support and marketing automation.','Multi-Hub adoption can lift average customer spending through CRM cross-selling.','Upmarket customer expansion can increase contract sizes, offset by more complex sales cycles.','Embedded AI can improve customer productivity, but pricing must cover inference costs and prevent gross-margin erosion.'],
 moat='Unified customer platform, integrations and marketing/sales workflow data; smaller customers face fewer switching barriers than large enterprises.',
 valuation='About 16.4x strict P/FCF (market cap $10.83B / $658.44M FCF including capitalized software) versus a secondary 13.6x figure that omits capitalized software. About 76.7x GAAP P/E using summed quarterly diluted EPS is still expensive. Consensus forward P/E ~14.4x largely reflects adjusted earnings. More operating execution risk than mature Adobe/Autodesk.',
 risk='SMB demand, gross-margin pressure from AI hosting and a forecast revenue slowdown; SBC remains substantial.',
 recovery='Returning to the recent $503 high (+132%) is possible over 24–36 months only with durable mid/high-teens growth and much higher GAAP margins. It is not the base-case option break-even target.',
 invalidation='Guided deceleration continues, net customer/retention trends weaken, gross margins keep falling, GAAP profitability reverses, or SBC outweighs owner cash generation.'),
'IOT':dict(tier=3,points=[16,17,3,13,8,2,4,0],eps=[.03,.08,.03,.01],fcf=[64.74,73.18,61.72,55.85,44.19,45.69,48.51,31.24],state='Uptrend',tariff='Medium',macro='Medium',pe=271.44,pfcf=95.68,evfcf=90.76,
 down='Compression from its February 2025 growth-stock peak and concern about enterprise-spending expectations. It has since recovered strongly and is only ~12% below its 52-week high; the qualifying drawdown uses its older all-time high.',
 cash='TTM FCF ~$255.5M, +50.6%; latest $64.7M, +46.5%. Latest FCF margin 12.7% versus 11.3%. Cash generation is heavily supported by stock compensation addbacks.',
 margins='GAAP operating margin +1.0% versus -6.8%; latest gross margin 77.3% versus 77.0%. Four GAAP net profits are verified, but Q1 includes a $30.3M arbitration award; ordinary operating profitability is very thin.',
 balance='About $1.33B cash/investments; limited funded debt. Latest stock compensation and related charges ~20% of revenue. Connected hardware creates more tariff exposure than pure SaaS.',
 catalysts=['AI safety/video products can support additional subscriptions and higher fleet penetration.','Multi-product connected-operations adoption can lift annual contract value.','Larger enterprise fleets and international expansion can increase recurring ARR.','AI incident detection can improve customer ROI, retention and paid product attachment.'],
 moat='Fleet/operations data, embedded sensors and workflows create switching costs; customer sectors remain economically sensitive.',
 valuation='~95.7x P/FCF / 90.8x EV/FCF and ~271x GAAP P/E are still expensive despite the ATH drawdown. Much dearer than the qualified software list; 30% revenue growth does not eliminate valuation risk.',
 risk='High valuation, ~20% SBC, thin GAAP operating profit and some hardware/industrial exposure.',
 recovery='The $61.90 high is reachable if ~30% growth persists, but it could require maintaining an already demanding valuation. A return to that high is not evidence of attractive risk-adjusted value.',
 invalidation='Growth drops substantially, mature-contract renewal or retention weakens, SBC/dilution stays excessive, or thin GAAP operating profits reverse.')}

rows=[]
for rank,(ticker,s) in enumerate(spec.items(),1):
 r=old_by[ticker].copy();r.update(s);r['rank']=rank;r['technical']=tech[ticker]
 r['qualified']=ticker!='IOT';r['score']=sum(s['points']);r['scoreBreakdown']=dict(zip(SCORES,s['points']))
 r['scoreMaximums']=dict(zip(SCORES,MAX));r['drawdown']=1-r['price']/r['high'];r['upsideToHigh']=r['high']/r['price']-1
 r['leapQuality']='Good LEAP Vehicle (provisional)' if ticker in ['ADSK','RDDT','ADBE','ACN','INTU','CRM'] else 'Acceptable (provisional)' if ticker=='HUBS' else 'Poor LEAP Vehicle for this strategy (provisional)'
 r['optionNote']='No live option-chain snapshot: liquidity, bid/ask spread, IV, delta and open interest remain unverified. No specific contract recommended. Research 18–30 month expirations when listed and ~0.70–0.85 delta ITM calls; verify break-even and avoid an IV spike.'
 r['options']=r['optionNote'];r['catalyst']=' '.join(s['catalysts']);r['risk']=s['risk'];r['quality']=s['margins']
 q=r['quarter']
 if ticker=='HUBS':q={'periods':['Q2 2026','Q1 2026','Q4 2025','Q3 2025','Q2 2025','Q1 2025','Q4 2024','Q3 2024'],'revenues':[911.740,880.995,846.746,809.506,760.866,714.137,703.172,669.720],'net':[43.338,32.554,54.426,16.536,-3.258,-21.793,4.935,8.146]}
 q['eps']=s['eps'];q['revg']=[(q['revenues'][i]/q['revenues'][i+4]-1)*100 for i in range(4)]
 q['nyoy']=[(q['net'][i]/q['net'][i+4]-1)*100 if q['net'][i+4]>0 else None for i in range(4)]
 q['positiveQuarters']=sum(n>0 for n in q['net'][:4]);q['improvingQuarters']=sum(q['net'][i]>q['net'][i+4] for i in range(4))
 r['quarter']=q;r['netIncome']=sum(q['net'][:4]);prior=sum(q['net'][4:8]);r['netGrowth']=r['netIncome']/prior-1 if prior>0 else None
 r['revenueGrowth']=sum(q['revenues'][:4])/sum(q['revenues'][4:8])-1
 if s['fcf']:r['fcfTTM']=sum(s['fcf'][:4]);r['fcfGrowth']=r['fcfTTM']/sum(s['fcf'][4:8])-1
 else:r['fcfTTM']=658.437;r['fcfGrowth']=.3533
 if ticker=='INTU':r['fcfTTM']=8617;r['fcfGrowth']=8617/6083-1;r['fcf']=None
 r['fcfSummary']=f"TTM +{r['fcfGrowth']*100:.1f}%" if ticker!='HUBS' else 'H1 +35.3% strict FCF'
 r['revenueSummary']=f"Latest +{q['revg'][0]:.1f}%; 4/4 up"
 r['netSummary']=f"4/4 profits; {q['improvingQuarters']}/4 higher"+(' incl. gain' if ticker=='CRM' else '')
 r['primary']= {'ADBE':'https://www.sec.gov/Archives/edgar/data/796343/000079634326000147/adbeex991q326.htm','ACN':'https://newsroom.accenture.com/content/4q-full-fy26-earnings/accenture-reports-fourth-quarter-and-full-year-fiscal-2026-results.pdf','HUBS':'https://www.sec.gov/Archives/edgar/data/1404655/000119312526335148/hubs-ex99_1.htm'}.get(ticker,r['primary'])
 r['sources']=[{'label':'Latest company GAAP results','url':r['primary']},{'label':'Four-quarter financial overview','url':r['overview']},{'label':'Current valuation metrics','url':f'https://stockanalysis.com/stocks/{ticker.lower()}/statistics/'},{'label':'High price reference','url':r['highSource']}]
 if ticker=='ADSK':r['sources'].append({'label':'FY26 10-K / historical investigations','url':'https://investors.autodesk.com/financials/sec-filings'})
 if ticker=='HUBS':r['sources'] += [{'label':'Q4 2025 GAAP release','url':'https://www.sec.gov/Archives/edgar/data/1404655/000119312526046563/hubs-ex99_1.htm'},{'label':'Q1 2026 GAAP 10-Q','url':'https://www.sec.gov/Archives/edgar/data/1404655/000119312526212122/hubs-20260331.htm'},{'label':'Q3 2025 GAAP release','url':'https://ir.hubspot.com/news-releases/news-release-details/hubspot-reports-q3-2025-results'}]
 rows.append(r)
rejects=[
 dict(ticker='ORCL',reason='Q1 FY27 FCF about -$5.4B despite positive GAAP profit. AI infrastructure capex, funding and dilution fail the positive cash-flow / asset-light setup.',url='https://investor.oracle.com/investor-news/news-details/2026/Oracle-Announces-Q1-Results-Driven-by-Triple-Digit-Growth-in-Cloud-Infrastructure-Revenues/default.aspx'),
 dict(ticker='NET',reason='Q2 2026 GAAP net loss $170M versus $50.4M loss; gross margin also declined. Adjusted profit cannot satisfy the GAAP requirement.',url='https://www.sec.gov/Archives/edgar/data/1477333/000147733326000053/q226exhibit991.htm'),
 dict(ticker='PANW',reason='Latest Q4 FY26 GAAP net loss $282M; adjusted net income $853M does not cure the current GAAP loss.',url='https://www2.paloaltonetworks.com/company/press/2026/palo-alto-networks-reports-fiscal-fourth-quarter-and-fiscal-year-2026-financial-results'),
 dict(ticker='APP',reason='Excluded under the major legal/regulatory-risk filter: fresh securities-fraud allegations and an October 6 consumer-protection suit. Allegations are unproven; this is a risk exclusion, not a finding of misconduct.',url='https://www.prnewswire.com/news-releases/pomerantz-law-firm-announces-the-filing-of-a-class-action-against-applovin-corporation-and-certain-officers--app-302889805.html'),
 dict(ticker='MNDY',reason='Q2 strict FCF about $50.46M versus $60.03M (-15.9%), including capitalized software; latest GAAP operating income slightly negative. Gross margin declined; does not show the requested simultaneous cash/margin improvement.',url='https://ir.monday.com/news-and-events/news-releases/news-details/2026/monday-com-Announces-Second-Quarter-2026-Results/default.aspx'),
 dict(ticker='PYPL',reason='Latest GAAP net income -12% YoY, operating income -5%, and operating margin -171bp despite positive revenue. Not the desired improving-earnings divergence.',url='https://www.sec.gov/Archives/edgar/data/1633917/000163391726000080/pypl2q-26earningsrelease.htm'),
 dict(ticker='SAP',reason='Not in the strict US-GAAP universe: statutory financial statements use IFRS. Can be a separate IFRS watchlist; exclusion does not mean it is loss-making.',url='https://www.sap.com/integrated-reports/2026/q2.html'),
 dict(ticker='ISRG',reason='Profitable growth company, but not selected for this strategy: medical-device hardware/supply chains, tariffs and hospital-capex exposure; not an asset-light software setup.',url='https://www.sec.gov/Archives/edgar/data/1035267/000103526726000058/isrg-20260630.htm'),
 dict(ticker='CRWD',reason='Near a new 52-week high on October 6, so insufficient current drawdown. Latest GAAP net income is positive $5.3M, but GAAP operating loss persists; do not label it currently net-loss-making.',url='https://www.marketwatch.com/data-news/crowdstrike-holdings-inc-cl-a-stock-rises-tuesday-outperforms-market-73eab325-f0dcab09345e'),
 dict(ticker='DOCU',reason='$68.22 versus $75.00 52-week high: only 9.0% below. Its pandemic ATH is more than 70% above in drawdown terms; neither reference meets this screen.',url='https://stockanalysis.com/stocks/docu/'),
 dict(ticker='VEEV',reason='$283.50 versus $310.50 52-week high: only 8.7% below. Quality business, but the current recent-high discount is insufficient; no qualifying older high was verified.',url='https://stockanalysis.com/stocks/veev/'),
 dict(ticker='FTNT',reason='$191.27 versus $192.41 52-week high: only 0.6% below. Strong latest earnings, but not a heavily discounted current-price setup.',url='https://stockanalysis.com/stocks/ftnt/')]
scan={'title':'Strict LEAPS screen','asOf':'2026-10-06 close','scanStartedAt':'2026-10-07T06:54:40Z','scanCompletedAt':'2026-10-07T07:11:33Z','shortlist':[r['ticker'] for r in rows if r['qualified']], 'candidates':rows,'rejected':rejects,'optionDataVerified':False,'sourcesUsed':['Massive historical daily prices and available legacy financial statements','AlphaStocks latest quotes','Current SEC filings, company releases and web research'], 'rankings':{'bestOverall':['ADSK','RDDT','ADBE','ACN','INTU','CRM','HUBS'],'highestBounce':['RDDT','HUBS','INTU','CRM','ADBE','ADSK','ACN'],'safestQuality':['ADBE','ADSK','ACN','INTU','CRM','RDDT','HUBS']},'method':'Seven qualified company research candidates plus one excluded early valuation watch. Scores are judgments, not forecasts; all get 0/5 option-quality points because live chain data is unavailable. Four-quarter growth always compares the same fiscal quarter YoY. FCF is OCF minus capital expenditures, including capitalized software where relevant, without restructuring addbacks. Use stated 52-week or ATH reference; ADSK/CRM/IOT use older ATH references, not recent 52-week collapse. Source conflicts are resolved in favor of current company filings. This is a targeted audited candidate screen, not an exhaustive automated universe scan.'}
(D/'data/strict-scan-2026-10-07.json').write_text(json.dumps(scan,indent=2))
now=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
meta={'scanDate':'2026-10-07','scanStartedAt':scan['scanStartedAt'],'scanCompletedAt':scan['scanCompletedAt'],'pricesAsOf':'2026-10-06 close','resultsUploadedAt':None,'reportPreparedAt':now,'appUpdatedAt':now,'timeZone':'America/Chicago','note':'Fresh research completed at the exact recorded time. Publication is pending until its deployment status succeeds. Closing prices are not live option quotes.'}
(D/'data/scan-metadata.json').write_text(json.dumps(meta,indent=2))
headers=['Rank','Ticker','Company','Current Price','High','High Basis','Drawdown %','Revenue Growth','Net Income Trend','FCF Trend','AI/Future Catalyst','Tariff Risk','Macro Risk','Technical State','LEAP Quality','Score /100','Tier','Qualified']
with (D/'data/strict-scan-2026-10-07.csv').open('w') as f:
 w=csv.writer(f);w.writerow(headers)
 for r in rows:w.writerow([r['rank'],r['ticker'],r['company'],r['price'],r['high'],r['basis'],round(r['drawdown']*100,2),r['revenueSummary'],r['netSummary'],r['fcfSummary'],r['catalyst'],r['tariff'],r['macro'],r['state'],r['leapQuality'],r['score'],r['tier'],r['qualified']])
e=lambda x:html.escape(str(x))
def quarters(r):
 q=r['quarter'];s='<div class="quarter-scroll"><table class="quarter-table"><thead><tr><th>Fiscal quarter</th><th>Revenue YoY</th><th>GAAP NI / prior ($M)</th><th>NI YoY</th><th>Diluted GAAP EPS</th></tr></thead><tbody>'
 for i in range(3,-1,-1):
  growth='Loss → profit' if q['nyoy'][i] is None else f"{q['nyoy'][i]:+.1f}%"
  s+=f"<tr><td>{e(q['periods'][i])}</td><td>+{q['revg'][i]:.1f}%</td><td>{q['net'][i]:,.1f} / {q['net'][i+4]:,.1f}</td><td>{growth}</td><td>${q['eps'][i]:.2f}</td></tr>"
 return s+'</tbody></table></div>'
cards=[]
for r in rows:
 sections=[('Why the stock declined',r['down']),('Cash-flow quality',r['cash']),('Margins',r['margins']),('Balance sheet / dilution',r['balance']),('Moat',r['moat']),('Valuation',r['valuation']),('Biggest risk',r['risk']),('Prior-high recovery',f"Mechanical stock upside +{r['upsideToHigh']*100:.1f}% to ${r['high']:.2f} {r['basis']} reference. "+r['recovery']),('LEAP suitability',r['leapQuality']+'. '+r['optionNote']),('What invalidates the thesis',r['invalidation'])]
 m=r['technical'];technical=f"{r['state']}: price ${r['price']:.2f}; 50-day SMA ${m['sma50']:.2f}; 200-day SMA ${m['sma200']:.2f}. Recent 20-session low ${m['low20']:.2f}, 60-session low ${m['low60']:.2f}; these are observed reference levels, not guaranteed support. Last 20-session return {m['return20']*100:+.1f}% versus SPY +1.7%. Technical labels are research judgments."
 sections.insert(6,('Technical setup',technical))
 cards.append(f"<article id='{r['ticker']}'><p class='eyebrow'>TIER {r['tier']} · {'QUALIFIED COMPANY RESEARCH' if r['qualified'] else 'EARLY WATCH / NOT QUALIFIED'} · {r['score']}/100</p><h2>{r['rank']}. {r['ticker']} — {e(r['company'])}</h2>"+quarters(r)+''.join(f'<h3>{e(k)}</h3><p>{e(v)}</p>' for k,v in sections[:4])+ '<h3>Specific 12–36 month catalysts / AI monetization</h3><ul>'+''.join('<li>'+e(x)+'</li>' for x in r['catalysts'])+'</ul>'+''.join(f'<h3>{e(k)}</h3><p>{e(v)}</p>' for k,v in sections[4:])+ '<h3>Score breakdown</h3><p>'+e(' · '.join(f'{k}: {v}/{MAX[i]}' for i,(k,v) in enumerate(r['scoreBreakdown'].items())))+'</p><p class="sources">'+''.join(f'<a href="{e(x["url"])}" target="_blank" rel="noopener">{e(x["label"])}</a>' for x in r['sources'])+'</p></article>')
report='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Strict LEAPS research · Oct 7, 2026</title><link rel="stylesheet" href="../styles.css"></head><body><main class="full-report"><a href="../">← Leap Scanner</a><p class="eyebrow">OCTOBER 7, 2026 · MANUALLY AUDITED SNAPSHOT</p><h1>7 qualified companies. 1 early watch.</h1><p>Research completed Oct 7, 2026 at 2:11:33 AM CDT (07:11:33 UTC). Prices: Oct 6 close. Live option chains unavailable; no specific contracts approved.</p><p>'+e(scan['method'])+'</p><nav class="sources">'+''.join(f'<a href="#{r["ticker"]}">{r["ticker"]} · {r["score"]}</a>' for r in rows)+'</nav>'+''.join(cards)+'<article><h2>Rejected / not selected</h2>'+''.join(f'<h3>{r["ticker"]}</h3><p>{e(r["reason"])} <a href="{e(r["url"])}" target="_blank" rel="noopener">Source</a></p>' for r in rejects)+'</article><article><h2>Final rankings</h2>'+''.join(f'<h3>{e(k)}</h3><p>'+e(' → '.join(v))+'</p>' for k,v in scan['rankings'].items())+'<p>Bounce ranking is a conditional judgment on recovery potential, not simply sorting distance to old highs. Old highs are not price targets. Company facts are reported data; scores, technical labels, risk grades, recovery judgments and catalysts are analysis/conditional estimates.</p></article></main></body></html>'
(D/'reports').mkdir(exist_ok=True);(D/'reports/strict-leaps-2026-10-07.html').write_text(report)
print(json.dumps({'qualified':len(scan['shortlist']),'early':len(rows)-len(scan['shortlist']),'rejected':len(rejects),'completed':scan['scanCompletedAt']}))
