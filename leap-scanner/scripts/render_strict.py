"""Render exact dated research data; no generated or simulated market figures."""
import json, zipfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
R=Path(__file__).resolve().parents[1];D=R/'dist';scan=json.loads((D/'data/strict-scan-2026-10-07.json').read_text());rows=scan['candidates']
OUT=D/'cards';BG='#101519';PANEL='#1b242a';INK='#edf2f2';MUTED='#a4b0b7';GOLD='#e8b354';MINT='#86d4b5';LINE='#35424a'
BASE='/usr/share/fonts/truetype/dejavu/'
def font(n,b=False):return ImageFont.truetype(BASE+('DejaVuSans-Bold.ttf' if b else 'DejaVuSans.ttf'),n)
def txt(d,x,y,s,n=24,c=INK,b=False):d.text((x,y),str(s),font=font(n,b),fill=c)
def wrap(d,s,w,n):
 lines=[];line=''
 for word in str(s).split():
  trial=(line+' '+word).strip()
  if d.textlength(trial,font=font(n))>w and line:lines.append(line);line=word
  else:line=trial
 if line:lines.append(line)
 return lines
def block(d,x,y,s,w,n=23,c=MUTED):
 for line in wrap(d,s,w,n):txt(d,x,y,line,n,c);y+=n+9
 return y
def short(d,s,w,n):
 if d.textlength(s,font=font(n))<=w:return s
 while s and d.textlength(s+'…',font=font(n))>w:s=s[:-1]
 return s+'…'
tags={'ADSK':'Direct sales · Construction Cloud · AI design · MaintainX','RDDT':'Max AI ad campaigns · Shopify ads · international ARPU','ADBE':'Firefly credits · Acrobat AI · enterprise content workflows','ACN':'AI/data project fees · bookings conversion · managed services','INTU':'QuickBooks agents · Enterprise Suite · TurboTax Live','CRM':'Agentforce paid usage · Data 360/Informatica · Slack agents','HUBS':'Breeze paid agents · multi-Hub CRM · upmarket expansion','IOT':'AI fleet safety · multi-product contracts · larger fleets'}
im=Image.new('RGB',(1400,1960),BG);d=ImageDraw.Draw(im)
txt(d,50,35,'Leap Scanner',33,b=True);txt(d,50,96,'Strict LEAPS research list',49,b=True)
txt(d,50,167,'7 qualified companies + 1 early watch · scores /100',27,GOLD)
txt(d,50,218,'Scan completed: Oct 7, 2026 · 2:11:33 AM CDT',25,MUTED)
txt(d,50,258,'Prices: Oct 6 close · live option contracts NOT verified',23,MUTED)
d.line((50,303,1350,303),fill=LINE,width=2)
for i,r in enumerate(rows):
 y=329+i*164;d.rounded_rectangle((38,y,1362,y+154),radius=9,fill=PANEL)
 txt(d,57,y+14,f"{i+1:02d}",24,MUTED);txt(d,117,y+8,r['ticker'],35,b=True)
 txt(d,292,y+17,f"${r['price']:.2f}",26);txt(d,477,y+17,f"-{r['drawdown']*100:.1f}%",27,GOLD)
 txt(d,689,y+17,f"TIER {r['tier']}",24,GOLD if r['tier']>1 else MINT)
 txt(d,875,y+17,f"{r['score']}/100",27,b=True);txt(d,1080,y+17,r['state'],22,MUTED)
 txt(d,117,y+57,f"Revenue +{r['quarter']['revg'][0]:.1f}% latest YoY  |  GAAP net income higher {r['quarter']['improvingQuarters']}/4 quarters",23,MINT)
 txt(d,117,y+94,f"FCF: {r['fcfSummary']}  |  High ${r['high']:.2f} ({r['basis']})",22,MUTED)
 txt(d,117,y+126,short(d,tags[r['ticker']],1190,20),20)
y=1660;d.line((50,y,1350,y),fill=LINE,width=2)
y=block(d,50,y+23,'Tier 1: research first. Tier 2: cash-flow, margin, growth or leverage exceptions. Tier 3: IOT is NOT qualified; valuation and stock compensation are too high.',1290,23)
y=block(d,50,y+12,'ATH references: ADSK (2021), CRM (2024), IOT (2025). Others use 52-week highs. An old high is not a price target. Quarter growth compares the same quarter YoY.',1290,22)
y=block(d,50,y+12,'All options receive 0/5 quality points: IV, spreads, delta, open interest and liquidity require live verification. Research 18–30 months / 0.70–0.85 delta ITM calls.',1290,22)
txt(d,50,1920,'Full quarterly evidence, sources and thesis risks in Leap Scanner · dated research',20,MUTED)
assert y<1900
im.save(OUT/'strict-watchlist-2026-10-07.png',optimize=True)
paths=[]
for r in rows:
 im=Image.new('RGB',(1280,1960),BG);d=ImageDraw.Draw(im);q=r['quarter']
 txt(d,55,35,'Leap Scanner',30,b=True);txt(d,55,90,f"{r['ticker']} · {r['score']}/100",64,b=True)
 txt(d,55,179,f"{r['company']}  |  Tier {r['tier']}  |  ${r['price']:.2f}",29,MUTED)
 txt(d,55,229,'Scan: Oct 7, 2026 · 2:11:33 AM CDT  |  Prices: Oct 6 close',23,MUTED)
 txt(d,55,280,f"{r['drawdown']*100:.1f}% off ${r['high']:.2f} {r['basis']} high",30,GOLD,b=True)
 d.rounded_rectangle((45,344,1235,633),radius=10,fill=PANEL)
 txt(d,65,361,'FISCAL QUARTER',19,MUTED);txt(d,390,361,'REVENUE YoY',19,MUTED);txt(d,665,361,'GAAP NET ($M)',19,MUTED);txt(d,1010,361,'GAAP EPS',19,MUTED)
 for line,i in enumerate([3,2,1,0]):
  y=408+line*51;txt(d,65,y,q['periods'][i],24);txt(d,390,y,f"+{q['revg'][i]:.1f}%",24,MINT);txt(d,665,y,f"{q['net'][i]:,.1f}",24);txt(d,1010,y,f"${q['eps'][i]:.2f}",24)
 y=662
 for title,body in [('CASH FLOW',r['cash']),('MARGINS',r['margins']),('MONETIZABLE CATALYSTS',tags[r['ticker']]),('VALUATION / TECHNICAL STATE',f"P/FCF {r['pfcf']:.1f}x; GAAP P/E {r['pe']:.1f}x. {r['state']}. 50-day SMA ${r['technical']['sma50']:.2f}; 200-day ${r['technical']['sma200']:.2f}."),('BIGGEST RISK',r['risk']),('LEAP QUALITY',r['leapQuality']+'. Live chain, IV, spread, open interest and delta unverified. No specific contract recommended.')]:
  txt(d,55,y,title,22,GOLD);y=block(d,55,y+38,body,1165,25,INK);y+=24
 txt(d,55,1860,'18–30 month expirations when available · ~0.70–0.85 delta ITM',22,MUTED)
 txt(d,55,1902,'Dated research · entire option premium at risk · full sources in the app',21,MUTED)
 assert y<1840,(r['ticker'],y)
 p=OUT/f"strict-{r['ticker']}-2026-10-07.png";im.save(p,optimize=True);paths.append(p)
with zipfile.ZipFile(OUT/'strict-candidate-cards.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in paths:z.write(p,p.name)
print(json.dumps({'list':str(OUT/'strict-watchlist-2026-10-07.png'),'size':[1400,1960],'freshCards':len(paths)}))
