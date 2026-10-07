import json, zipfile, shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
DATE='2026-10-07'
data=json.loads((ROOT/'dist/data'/f'scan-{DATE}.json').read_text())
OUT=ROOT/'dist/cards'; OUT.mkdir(parents=True, exist_ok=True)
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
MONO='/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
BG='#101519'; PANEL='#1b242a'; INK='#edf2f2'; MUTED='#a4b0b7'; GOLD='#e8b354'; MINT='#86d4b5'; LINE='#35424a'
def f(size,bold=False,mono=False): return ImageFont.truetype(MONO if mono else BOLD if bold else FONT,size)
def text(draw,xy,value,size=24,color=INK,bold=False,mono=False): draw.text(xy,str(value),font=f(size,bold,mono),fill=color)
def wrap(draw,value,width,size=24):
    lines=[]; line=''
    for word in value.split():
        trial=(line+' '+word).strip()
        if draw.textlength(trial,font=f(size))>width and line: lines.append(line);line=word
        else: line=trial
    if line: lines.append(line)
    return lines
def block(draw,x,y,value,width=1160,size=25,color=MUTED):
    lines=wrap(draw,value,width,size)
    for line in lines: text(draw,(x,y),line,size,color);y+=size+12
    return y

for row in data['candidates']:
    if row['ticker'] not in data['shortlist']: continue
    im=Image.new('RGB',(1280,1510),BG);d=ImageDraw.Draw(im)
    d.rounded_rectangle((60,50,109,99),radius=11,fill=GOLD)
    d.line([(72,61),(72,87),(99,87)],fill=BG,width=4)
    d.line([(77,81),(85,69),(93,73),(101,60)],fill=BG,width=4)
    text(d,(126,58),'Leap Scanner',30,bold=True)
    text(d,(845,67),'OCT 6, 2026 CLOSE',20,MUTED,mono=True)
    d.line((60,127,1220,127),fill=LINE,width=2)
    text(d,(60,159),str(row['rank']).zfill(2)+' / RESEARCH SHORTLIST',20,GOLD,mono=True)
    text(d,(60,202),row['ticker'],80,bold=True)
    text(d,(64,300),row['company'],29,MUTED)
    text(d,(970,227),f"${row['price']:.2f}",39,bold=True,mono=True)
    text(d,(978,284),'Closing price',21,MUTED)
    d.rounded_rectangle((60,365,1220,506),radius=12,fill=PANEL)
    vals=[('TTM REVENUE YoY',f"+{row['revenueGrowth']*100:.1f}%"),('TTM NET INCOME',f"${row['netIncome']/1000:.2f}B" if row['netIncome']>=1000 else f"${row['netIncome']:.0f}M"),('TTM PROFIT YoY','Turned positive' if row['netGrowth'] is None else f"+{row['netGrowth']*100:.1f}%")]
    for i,(label,value) in enumerate(vals):
        x=85+i*386;text(d,(x,389),label,18,MUTED,mono=True);text(d,(x,433),value,32,MINT if i!=1 else INK,bold=True)
    drawdown=1-row['price']/row['high']
    text(d,(60,546),f"{drawdown*100:.1f}% BELOW {row['basis'].upper()} HIGH",25,GOLD,bold=True)
    text(d,(60,587),f"High reference ${row['high']:.2f}  |  Required drawdown 30–70%",21,MUTED)
    x1,x2,y=62,1218,650
    d.rounded_rectangle((x1,y-7,x2,y+7),radius=7,fill=LINE)
    # Current price position in the high-to-zero range; band spans 30–70% drawdown.
    d.rectangle((x1+int(.3*(x2-x1)),y-7,x1+int(.7*(x2-x1)),y+7),fill='#666047')
    pos=x1+int((1-drawdown)*(x2-x1));d.ellipse((pos-12,y-12,pos+12,y+12),fill=GOLD)
    text(d,(60,674),'0% of high',18,MUTED);text(d,(1090,674),'100% of high',18,MUTED)
    y=731
    text(d,(60,y),'EARNINGS CONSISTENCY',20,GOLD,mono=True);y+=42
    y=block(d,60,y,row['quality'],size=24,color=INK)
    q=row.get('quarter')
    if q:
        periods=list(reversed(q['periods'][:4])); nets=list(reversed(q['net'][:4])); ymax=max(nets)*1.2
        chart_y=y+25; base=chart_y+105; start=66
        text(d,(850,chart_y-2),'Quarterly GAAP net income',18,MUTED)
        for i,(period,net) in enumerate(zip(periods,nets)):
            x=start+i*270;h=int(75*net/ymax)
            d.rounded_rectangle((x,base-h,x+200,base),radius=4,fill=MINT)
            text(d,(x,base-h-26),f"{net:,.0f}M",17,MUTED,mono=True)
            text(d,(x,base+12),period,18,MUTED)
        y=base+54
        if row['ticker']=='SAP':text(d,(60,y),'Quarterly values in EUR; overview TTM in USD.',18,MUTED);y+=32
        else:text(d,(60,y),'Quarterly values in USD millions; compare same quarter YoY.',18,MUTED);y+=32
    y+=12;text(d,(60,y),'THE CATALYST',20,GOLD,mono=True);y+=38
    y=block(d,60,y,row['catalyst'],size=24,color=INK)
    y+=18;text(d,(60,y),'THE RISK',20,GOLD,mono=True);y+=38
    y=block(d,60,y,row['risk'],size=23)
    y+=18;text(d,(60,y),'LEAPS CHECK',20,GOLD,mono=True);y+=36
    brief='Late 2028 / Jan 2029: confirm listed expirations, liquidity, spreads and break-even. Listing does not confirm a good contract.'
    y=block(d,60,y,brief,size=22)
    if y>1390: raise ValueError(f"Card overflow: {row['ticker']} at {y}")
    d.line((60,1404,1220,1404),fill=LINE,width=2)
    text(d,(60,1430),'Dated research · not live quotes · entire option premium is at risk',20,MUTED)
    text(d,(60,1465),'Sources, filing links and contract notes are in the dashboard and workbook.',18,MUTED)
    im.save(OUT/f"{row['ticker']}-{DATE}.png",optimize=True)

with zipfile.ZipFile(OUT/'candidate-cards.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(OUT.glob(f'*-{DATE}.png')): z.write(p,p.name)
print(json.dumps({'cards':len(list(OUT.glob(f'*-{DATE}.png'))),'zip':str(OUT/'candidate-cards.zip')}))
