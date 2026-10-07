"""Render the existing dated research's top 15 as one factual PNG table."""
import json
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
DATA=json.loads((ROOT/'dist/data/scan-2026-10-07.json').read_text())
META=json.loads((ROOT/'dist/data/scan-metadata.json').read_text())
ROWS=sorted(DATA['candidates'],key=lambda x:x['rank'])[:15]
assert len(ROWS)==15 and len({r['ticker'] for r in ROWS})==15
OUT=ROOT/'dist/cards/top-15-research-2026-10-07.png'
BG='#101519'; PANEL='#1b242a'; INK='#edf2f2'; MUTED='#a4b0b7'; GOLD='#e8b354'; MINT='#86d4b5'; LINE='#35424a'
BASE='/usr/share/fonts/truetype/dejavu/'
def font(size,bold=False,mono=False):return ImageFont.truetype(BASE+('DejaVuSansMono.ttf' if mono else 'DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'),size)
im=Image.new('RGB',(1400,2650),BG);d=ImageDraw.Draw(im)
def text(x,y,value,size=25,color=INK,bold=False,mono=False):d.text((x,y),str(value),font=font(size,bold,mono),fill=color)
def right(x,y,value,size=29,color=INK):d.text((x,y),value,font=font(size,mono=True),fill=color,anchor='ra')
def fit(value,width,size=23):
 if d.textlength(value,font=font(size))<=width:return value
 while value and d.textlength(value+'…',font=font(size))>width:value=value[:-1]
 return value.rstrip()+'…'
CATALYST={
 'RDDT':'Ad monetization, international users and data licensing',
 'ORCL':'AI cloud capacity and contracted-demand conversion',
 'IOT':'AI fleet safety, connected operations and larger customers',
 'ADBE':'Firefly and Acrobat AI monetization; subscription growth',
 'ADSK':'AI design and construction; direct sales and MaintainX',
 'APP':'AI advertising and Axon expansion into e-commerce',
 'ACN':'AI implementation bookings converting into revenue',
 'SAP':'Cloud ERP migrations and Joule AI adoption',
 'ISRG':'Da Vinci 5 replacement cycle and procedure growth',
 'MNDY':'AI agents and CRM/service cross-selling',
 'HUBS':'Breeze AI, multi-product CRM and larger customers',
 'MDB':'Atlas cloud database and AI/vector-search workloads',
 'INTU':'AI accounting/tax agents and Enterprise Suite adoption',
 'SOFI':'Fee-based loan platform, members and cross-selling',
 'TOST':'Restaurant locations, software upsell and recurring profit'}
NOTES={
 'RDDT':'SHORTLIST · 4Q checked · thin option OI',
 'ORCL':'SHORTLIST · 4Q checked · funding/capex risk',
 'IOT':'SHORTLIST · 4Q checked · profitable from prior losses',
 'ADBE':'SHORTLIST · 4Q checked · modest profit growth',
 'ADSK':'SHORTLIST · 4Q checked · acquisition/tax effects',
 'APP':'SHORTLIST · 4Q checked · fresh litigation risk',
 'ACN':'SHORTLIST · 3Q checked · slower sales growth',
 'SAP':'SHORTLIST · 4Q checked · USD overview / EUR filings',
 'ISRG':'WATCH · 4Q checked · surgical thesis, less direct AI',
 'MNDY':'WATCH · quarterly GAAP consistency not fully verified',
 'HUBS':'WATCH · recent TTM profit; quarterly streak unverified',
 'MDB':'WATCH · only 2 quarters meet the improvement test',
 'INTU':'WATCH · latest quarter net income declined YoY',
 'SOFI':'WATCH · 2-quarter streak; prior tax boost affects YoY',
 'TOST':'WATCH · quarterly GAAP streak not fully verified'}
d.rounded_rectangle((55,42,105,92),radius=10,fill=GOLD)
d.line([(68,54),(68,80),(94,80)],fill=BG,width=4)
d.line([(74,75),(82,62),(91,67),(99,53)],fill=BG,width=4)
text(123,49,'Leap Scanner',32,bold=True)
text(55,119,'Top 15 research stocks',54,bold=True)
text(55,190,'8 AI shortlist candidates + 7 additional watchlist ideas',27,GOLD)
text(55,237,'Prices: Oct 6, 2026 close · Research scan: Oct 7, 2026',23,MUTED)
uploaded=datetime.fromisoformat(META['resultsUploadedAt'].replace('Z','+00:00')).astimezone(ZoneInfo('America/Chicago'))
text(55,270,'Results uploaded: '+uploaded.strftime('%b %-d, %Y · %-I:%M:%S %p %Z'),23,MUTED)
d.line((55,317,1345,317),fill=LINE,width=2)
text(55,341,'RANK / COMPANY',19,MUTED,mono=True)
right(670,341,'REV YoY',21,MUTED);right(885,341,'PROFIT YoY',21,MUTED);right(1110,341,'OFF HIGH',21,MUTED);right(1345,341,'PRICE',21,MUTED)
text(55,375,'Revenue and profit growth are trailing 12 months; all 15 have positive TTM GAAP net income.',21,MUTED)
top=420;rowh=132
for i,r in enumerate(ROWS):
 y=top+i*rowh;color=MINT if r['ticker'] in DATA['shortlist'] else GOLD
 if i%2==0:d.rounded_rectangle((42,y,1358,y+rowh-5),radius=8,fill=PANEL)
 text(58,y+14,str(r['rank']).zfill(2),26,MUTED,mono=True)
 text(117,y+10,r['ticker'],35,bold=True)
 text(117,y+53,fit(r['company'],410,22),22,MUTED)
 right(670,y+14,f"+{r['revenueGrowth']*100:.1f}%",30,MINT)
 right(885,y+14,'New profit' if r['netGrowth'] is None else f"+{r['netGrowth']*100:.1f}%",29,MINT)
 right(1110,y+14,f"−{(1-r['price']/r['high'])*100:.1f}%",30,GOLD)
 right(1345,y+14,f"${r['price']:.2f}",30)
 right(1345,y+57,'52-week high' if r['basis']=='52-week' else 'All-time high',20,MUTED)
 text(520,y+58,fit(NOTES[r['ticker']],610,18),18,color)
 text(117,y+94,fit('Catalyst: '+CATALYST[r['ticker']],1200,22),22,INK)
footer=top+15*rowh+24
d.line((55,footer,1345,footer),fill=LINE,width=2)
text(55,footer+26,'Shortlist = stronger AI/earnings fit. Watch = additional research with stated exceptions.',22,MUTED)
text(55,footer+64,'3Q / 4Q = consecutive reports with positive GAAP earnings and higher revenue / profit YoY.',21,MUTED)
text(55,footer+102,'Original scan completion time was not recorded. A new image is not a fresh market scan.',21,MUTED)
text(55,footer+140,'Check late 2028 / 2029 options, current quotes, liquidity and break-even before trading.',21,MUTED)
text(55,footer+178,'Research only · entire option premium is at risk · source links and full risks in the app.',21,MUTED)
assert footer+206<2650
OUT.parent.mkdir(parents=True,exist_ok=True)
im.save(OUT,optimize=True)
print(json.dumps({'path':str(OUT),'stocks':len(ROWS),'size':list(im.size)}))
