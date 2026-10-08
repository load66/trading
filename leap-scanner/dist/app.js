const SB_URL="https://ppsljqaaanpkksxbpalk.supabase.co";
const SB_KEY="sb_publishable_2JLPa7GMpdacVfxBnfCv_w_wl36jn2n";
const MIN_CONTRACT_DELTA=0.60;
const MAX_CONTRACT_DELTA=0.75;
const CONTRACT_SELECTION_RULE="0.60–0.75 delta, with no premium or contract-cost cap. Rank eligible liquid ITM calls by highest open interest, then tightest bid/ask spread as a percentage of midpoint. Live liquidity verification required.";
const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2});
const pct=n=>Number.isFinite(n)?(n*100).toFixed(1)+"%":"—";
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateFmt=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit",timeZoneName:"short"});
const shortDateFmt=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",hour:"numeric",minute:"2-digit",timeZoneName:"short"});
let research=null,previousResearch=null,market=null,previousMarket=null,marketSavedAt=null,researchSavedAt=null,marketFromDatabase=false,researchFromDatabase=false,activeFilter="all",feedMode="CONNECTING";
// Publication order is based on the genuine research completion time, not upload time.
function completionMs(row){const t=Date.parse(row?.payload?.scanCompletedAt||"");return Number.isFinite(t)?t:-Infinity;}
function selectPublished(rows,savedField){
  const valid=(Array.isArray(rows)?rows:[]).filter(row=>row&&row.payload&&Number.isFinite(completionMs(row)));
  valid.sort((a,b)=>completionMs(b)-completionMs(a)||(Date.parse(b[savedField]||"")||0)-(Date.parse(a[savedField]||"")||0));
  const latest=valid[0]||null;
  const previous=latest?valid.find(row=>completionMs(row)<completionMs(latest))||null:null;
  const ignoredStaleUpload=Boolean(latest&&rows[0]&&completionMs(rows[0])<completionMs(latest));
  return {latest,previous,ignoredStaleUpload};
}
function applyIfNotOlder(current,incoming){
  return incoming&&(!current||completionMs({payload:incoming})>=completionMs({payload:current}));
}
function quoteCutoff(){return market?.quoteObservation?.observedAt||market?.market?.spy?.observedAt||marketSavedAt;}


async function sb(table,query){
  const r=await fetch(SB_URL+"/rest/v1/"+table+"?"+query,{headers:{apikey:SB_KEY},cache:"no-store"});
  if(!r.ok)throw new Error("Supabase "+table+" "+r.status);
  return r.json();
}
async function json(path){
  const r=await fetch(path,{cache:"no-store"});
  if(!r.ok)throw new Error(path);
  return r.json();
}
function toast(msg){const e=document.getElementById("toast");e.textContent=msg;e.classList.add("on");clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove("on"),2200);}
function normalizedStatus(value){return String(value||"").trim().toUpperCase().replace(/^[^A-Z]+/,"");}
function actionTone(value){const a=normalizedStatus(value);if(a==="HIGH-CONVICTION DIP"||a.startsWith("BUY ZONE")||a.startsWith("ADD ZONE"))return"buy";if(a.includes("BROKEN")||a.includes("AVOID")||a.includes("DO NOT"))return"stop";return"watch";}
function readinessTone(value){const r=normalizedStatus(value);if(/\b(?:NO CONTRACT APPROVED|NOT(?: FULLY)? APPROVED|POOR|AVOID|REJECT(?:ED)?|FAILED)\b/.test(r))return"bad";if(/\b(?:DELAYED|MODELED|REFERENCE|VERIFY|VERIFICATION|UNVERIFIED|WAIT|WATCH|NOT READY)\b/.test(r))return"reference";return["APPROVED","FULLY APPROVED","LIVE VERIFIED"].includes(r)?"good":"reference";}
function readinessLabel(value){const tone=readinessTone(value);return tone==="good"?"APPROVED":tone==="bad"?"NOT APPROVED":"REFERENCE · VERIFY LIVE";}
function fmtMove(n){if(!Number.isFinite(n))return"—";return(n>=0?"+":"")+n.toFixed(2)+"%";}
function formatTime(value){const time=new Date(value||"");return Number.isNaN(time.getTime())?"Timestamp unrecorded":dateFmt.format(time);}
function shortTime(value){const time=new Date(value||"");return Number.isNaN(time.getTime())?"time unavailable":shortDateFmt.format(time);}
function sourceMode(mode,time){feedMode=mode;const m=document.getElementById("data-mode");m.textContent=mode;m.style.color=mode==="DATABASE SNAPSHOT"?"var(--green)":"var(--amber)";document.getElementById("fresh-time").textContent=shortTime(time||quoteCutoff());}
function renderFreshness(){
  const strip=document.getElementById("snapshot-strip");
  if(strip){
    const researchCompleted=research?.scanCompletedAt,priceObserved=market?.quoteObservation?.observedAt||market?.market?.spy?.observedAt;
    strip.innerHTML='<span><b>RESEARCH COMPLETED</b> '+safe(formatTime(researchCompleted))+'</span><span><b>PRICES OBSERVED</b> '+safe(formatTime(priceObserved))+'</span>';
    strip.dataset.health=/ERROR|PARTIAL|STALE/.test(feedMode)?"warning":"normal";
  }
  document.getElementById("market-saved-time").textContent=formatTime(marketSavedAt||market&&market.scanCompletedAt);
  document.getElementById("research-saved-time").textContent=formatTime(researchSavedAt||research&&research.scanCompletedAt);
  const cutoff=document.getElementById("price-cutoff"),note=document.getElementById("feed-note"),summary=document.getElementById("source-short");
  const savedCutoff=market&&market.marketAsOf?market.marketAsOf:"Price cutoff unverified";
  const owner=typeof window!=="undefined"?window.leapsOwnerPriceState:null;
  if(owner?.active){
    document.getElementById("data-mode").textContent="OWNER ALPACA "+String(owner.feed||"IEX").toUpperCase()+(owner.count<owner.total?" · "+owner.count+"/"+owner.total:"");
    document.getElementById("data-mode").style.color="var(--green)";
    document.getElementById("fresh-time").textContent=formatTime(owner.asOf);
    cutoff.textContent="Owner Alpaca "+String(owner.feed||"IEX").toUpperCase()+" response "+formatTime(owner.asOf)+". Saved public cutoff: "+savedCutoff;
    note.textContent="Private owner quotes update "+owner.count+" of "+owner.total+" qualified stocks/ETFs with recent trades. Any remaining prices, VIX, market regime, fundamentals and option references use the latest published snapshot.";
    if(summary)summary.textContent="Owner Alpaca "+String(owner.feed||"IEX").toUpperCase()+" · "+owner.count+"/"+owner.total+" recent · "+shortTime(owner.asOf);
    return;
  }
  sourceMode(feedMode==="CONNECTING"?(marketFromDatabase&&researchFromDatabase?"DATABASE SNAPSHOT":marketFromDatabase||researchFromDatabase?"MIXED SOURCES":"DATED FALLBACK"):feedMode,quoteCutoff());
  cutoff.textContent=savedCutoff;
  const observed=Date.parse(market&&market.market&&market.market.spy&&market.market.spy.observedAt||"");
  const age=Number.isFinite(observed)?Math.max(0,Math.floor((Date.now()-observed)/60000)):null;
  note.textContent=(age===null?"Price observation time is unverified. ":"Prices were observed "+age+" minutes ago. ")+"Saved research snapshots; prices and option references may be delayed. A new upload does not make the quotes live.";
  if(summary)summary.textContent="Public snapshot · observed "+shortTime(market?.quoteObservation?.observedAt||market?.market?.spy?.observedAt);
}
function ownerQuoteFor(t){
  if(typeof window==="undefined"||!window.leapsOwnerPriceState?.active)return null;
  const q=window.leapsOwnerQuotes?.[t];
  return Number.isFinite(q?.price)&&q.price>0?q:null;
}
function marketStat(label,x){
  const live=(label==="SPY"||label==="QQQ")?ownerQuoteFor(label):null;
  if(live)x={...(x||{}),close:live.price,dayChangePct:Number.isFinite(live.dayChangePct)?live.dayChangePct:null};
  const source=live?" · ALPACA IEX":label==="VIX"?" · SAVED":"";
  if(!x||!Number.isFinite(label==="VIX"?x.value:x.close)||(label==="VIX"?x.value:x.close)<=0)return'<div class="market-stat"><span>'+label+'</span><b>—</b><small class="flat">Unavailable</small></div>';
  const val=label==="VIX"?Number(x.value).toFixed(2):money.format(x.close);
  const move=Number.isFinite(x.dayChangePct)?x.dayChangePct:null;
  return'<div class="market-stat"><span>'+label+source+'</span><b>'+val+'</b><small class="'+(move>0?"up":move<0?"down":"flat")+'">'+fmtMove(move)+'</small></div>';
}
function planFor(t){
  const base=market&&market.candidatePlans?market.candidatePlans.find(x=>x.ticker===t):null;
  const q=ownerQuoteFor(t);
  return base&&q?{...base,price:q.price,todayPct:Number.isFinite(q.dayChangePct)?q.dayChangePct:base.todayPct,quoteObservedAt:q.observedAt,livePriceSource:"ALPACA "+String(q.feed||"IEX").toUpperCase()}:base;
}
function stageAction(p){
  return entryTimingStatus(p).label;
}
function supportEvidence(value){
  // Saved research may contain retired reversal instructions; keep the technical evidence.
  return String(value||"").replace(/The stock is already testing this zone, so a hold\/reclaim is required\./gi,"")
    .replace(/;?\s*requires? a support hold\/reclaim\./gi,".")
    .replace(/;?\s*require a hold\/reclaim rather than buying a straight breakdown\./gi,".").trim();
}
function contractDelta(c){return Number.isFinite(c.delta)?c.delta:Number.isFinite(c.modeledDelta)?c.modeledDelta:null;}
function contractSpread(c){
  if(!Number.isFinite(c.bid)||!Number.isFinite(c.ask)||c.bid<=0||c.ask<c.bid)return null;
  return (c.ask-c.bid)/((c.ask+c.bid)/2);
}
function ownerContractFor(t){
  if(typeof window==="undefined"||!window.leapsOwnerContractState?.active)return null;
  const c=window.leapsOwnerContracts?.[t];
  return c&&c.classification==="alpaca_prescreen"?c:null;
}
function contractFor(t){
  const company=companyFor(t),plan=planFor(t)||{},underlying=Number.isFinite(plan.price)?plan.price:company&&company.price;
  if(!(market&&market.contractProfiles)||!company||!company.qualified)return null;
  return market.contractProfiles.filter(x=>{
    if(x.ticker!==t||x.classification!=="eligible"||!Number.isFinite(underlying)||!Number.isFinite(x.strike)||x.strike>=underlying)return false;
    const delta=Number.isFinite(x.delta)?x.delta:null;
    const spread=contractSpread(x);
    const iv=Number.isFinite(x.iv)?x.iv:Number.isFinite(x.impliedVolatility)?x.impliedVolatility:null;
    const observed=Date.parse(x.quoteObservedAt||""),age=Date.now()-observed;
    const expiry=Date.parse(String(x.expiration||"")+"T12:00:00Z");
    const targets=x.fundamentalTargets||{};
    const currentVerified=x.verified===true&&Number.isFinite(age)&&age>=0&&age<=900000&&Number.isFinite(expiry)&&expiry-Date.now()>=365*86400000&&Number.isFinite(targets.bear)&&targets.bear>x.strike&&Number.isFinite(targets.base)&&targets.base>x.strike;
    return Number.isFinite(delta)&&delta>=MIN_CONTRACT_DELTA&&delta<=MAX_CONTRACT_DELTA&&
      Number.isFinite(x.openInterest)&&x.openInterest>=0&&Number.isFinite(x.bid)&&Number.isFinite(x.ask)&&
      spread!==null&&spread<=0.05&&Number.isFinite(iv)&&iv>0&&currentVerified;
  }).sort((a,b)=>b.openInterest-a.openInterest||contractSpread(a)-contractSpread(b)||String(a.expiration||"").localeCompare(String(b.expiration||"")))[0]||null;
}
function historicalContractFor(t){
  if(!(market&&market.contractProfiles))return null;
  return market.contractProfiles.filter(x=>x.ticker===t).sort((a,b)=>{
    const da=contractDelta(a),db=contractDelta(b);
    const aBand=Number.isFinite(da)&&da>=MIN_CONTRACT_DELTA&&da<=MAX_CONTRACT_DELTA?1:0;
    const bBand=Number.isFinite(db)&&db>=MIN_CONTRACT_DELTA&&db<=MAX_CONTRACT_DELTA?1:0;
    return bBand-aBand||(Number(b.openInterest)||0)-(Number(a.openInterest)||0);
  })[0]||null;
}
function companyFor(t){return research&&research.candidates?research.candidates.find(x=>x.ticker===t):null}
function fundamentalDetails(c){
  const sources=(c.sources||[]).filter(s=>/^https:\/\//.test(s.url||"")).map(s=>'<a class="source-link" href="'+safe(s.url)+'" target="_blank" rel="noopener">'+safe(s.label||"Source")+' ↗</a>').join("");
  return '<p><b>Margins:</b> '+safe(c.margins||"Not recorded")+'</p><p><b>Balance sheet:</b> '+safe(c.balance||"Not recorded")+'</p><p><b>Catalysts:</b> '+safe((c.catalysts||[]).join(" "))+'</p><p><b>Biggest risk:</b> '+safe(c.risk||"Not recorded")+'</p><div class="research-sources">'+sources+'</div>';
}
function latestFcf(c){return Array.isArray(c.fcf)&&Number.isFinite(c.fcf[0])?c.fcf[0]:null;}
function qualificationGates(c){
  const q=c.quarter||{},latestRev=Array.isArray(q.revg)&&Number.isFinite(q.revg[0])?q.revg[0]:null;
  const latestNet=Array.isArray(q.net)&&Number.isFinite(q.net[0])?q.net[0]:null;
  const lf=latestFcf(c),ttm=Number.isFinite(c.fcfTTM)?c.fcfTTM:null;
  const warn=/down|declin|cut|negative|-\d/i.test(String(c.fcfSummary||"")+" "+String(c.cash||""));
  const gate=(label,pass,unknown=false)=>'<span class="gate '+(unknown?"unknown":pass?"pass":"fail")+'">'+safe(label)+' '+(unknown?"?":pass?"✓":"✕")+'</span>';
  return '<div class="qualification-gates" aria-label="Qualification gates">'+
    gate("GAAP PROFIT",latestNet!==null?latestNet>0:Number(c.gaapEPSTTM)>0,latestNet===null&&!Number.isFinite(c.gaapEPSTTM))+
    gate("REV GROWTH",latestRev!==null&&latestRev>0,latestRev===null)+
    gate("LATEST FCF",lf!==null&&lf>0,lf===null)+
    gate("TTM FCF",ttm!==null&&ttm>0,ttm===null)+
    gate("THESIS",Boolean(c.qualified))+
    (warn?'<span class="gate warn">FCF TREND ⚠</span>':"")+
  '</div>';
}
function cashFlowPanel(c){
  const q=c.quarter||{},latest=latestFcf(c),ttm=Number.isFinite(c.fcfTTM)?c.fcfTTM:null;
  const prior=Array.isArray(c.fcf)&&Number.isFinite(c.fcf[4])?c.fcf[4]:null;
  const yoy=latest!==null&&prior!==null&&prior!==0?(latest/prior-1):null;
  const revenue=Array.isArray(q.revenues)&&Number.isFinite(q.revenues[0])?q.revenues[0]:null;
  const margin=latest!==null&&revenue?latest/revenue:null;
  const trend=yoy===null?"UNVERIFIED":yoy>0.05?"IMPROVING":yoy<-.05?"WEAKENING":"STABLE";
  return '<div class="fcf-panel"><div class="mini-section-head"><h4>Cash-flow quality</h4><span class="'+(trend==="WEAKENING"?"bad-text":trend==="IMPROVING"?"good-text":"")+'">'+trend+'</span></div>'+
    '<div class="fcf-grid"><div><span>LATEST FCF</span><b>'+(latest===null?"—":money.format(latest)+"M")+'</b></div><div><span>YOY CHANGE</span><b>'+(yoy===null?"—":fmtMove(yoy*100))+'</b></div><div><span>TTM FCF</span><b>'+(ttm===null?"—":money.format(ttm)+"M")+'</b></div><div><span>FCF MARGIN</span><b>'+(margin===null?"—":pct(margin))+'</b></div></div>'+
    '<p>'+safe(c.cash||c.fcfSummary||"Cash-flow commentary unavailable.")+'</p>'+
    '<p class="fcf-guidance"><b>FCF guidance:</b> '+safe(c.fcfGuidance||c.fcfGuidanceTrend||"Not separately stored in this snapshot; verify in the latest company guidance.")+'</p></div>';
}
function compactMillions(v){
  if(!Number.isFinite(v))return"—";
  const sign=v<0?"−":"",n=Math.abs(v);
  if(n>=1000)return sign+"$"+(n/1000).toFixed(n>=10000?1:2)+"B";
  return sign+"$"+n.toFixed(n>=100?0:n>=10?1:2)+"M";
}
function metricBarChart(title,items,key,kind){
  const valid=(items||[]).filter(x=>Number.isFinite(x[key]));
  if(!valid.length)return '<div class="financial-chart empty"><div class="financial-chart-head"><b>'+safe(title)+'</b><span>NO VERIFIED DATA</span></div></div>';
  const max=Math.max(...valid.map(x=>Math.abs(x[key])),1);
  const rows=valid.map(x=>{
    const value=x[key],width=Math.max(3,Math.abs(value)/max*100);
    return '<div class="bar-row '+(value<0?"negative":"positive")+'"><span class="bar-period">'+safe(x.period||"—")+'</span><div class="bar-track"><i class="bar-fill '+safe(kind)+'" style="--bar-width:'+width.toFixed(1)+'%"></i></div><b>'+compactMillions(value)+'</b></div>';
  }).join("");
  return '<div class="financial-chart"><div class="financial-chart-head"><b>'+safe(title)+'</b><span>USD · SCALE WITHIN CHART</span></div>'+rows+'</div>';
}
function financialTrendCharts(c){
  const q=c.quarter||{},periods=(q.periods||[]).slice(0,8);
  const quarterly=periods.map((period,i)=>({period,revenue:(q.revenues||[])[i],netIncome:(q.net||[])[i]}));
  const annual=Array.isArray(c.annualFinancials)?c.annualFinancials.slice(0,4):[];
  const latestAnnual=annual[0]||{},profitState=Number.isFinite(latestAnnual.netIncome)?latestAnnual.netIncome>0?"PROFITABLE":"NET LOSS":"UNVERIFIED";
  const annualSource=c.annualFinancialsSource&&/^https:\/\//.test(c.annualFinancialsSource.url||"")?'<a class="source-link" href="'+safe(c.annualFinancialsSource.url)+'" target="_blank" rel="noopener">Annual financial source ↗</a>':"";
  return '<section class="financial-growth"><div class="mini-section-head"><h4>Revenue & net income trends</h4><span class="'+(profitState==="PROFITABLE"?"good-text":profitState==="NET LOSS"?"bad-text":"")+'">'+profitState+'</span></div>'+
    '<div class="financial-chart-grid">'+
      metricBarChart("Quarterly revenue",quarterly,"revenue","revenue")+
      metricBarChart("Quarterly GAAP net income",quarterly,"netIncome","income")+
      metricBarChart("Annual revenue",annual,"revenue","revenue")+
      metricBarChart("Annual GAAP net income",annual,"netIncome","income")+
    '</div><div class="chart-source-row"><span>Quarterly: latest 8 reported periods · Annual: latest 4 completed fiscal years.</span>'+annualSource+'</div></section>';
}
// Never compare GAAP results to adjusted consensus, or infer a beat from a missing estimate.
function earningsAtAGlance(c){
  const q=c.quarter||{},report=(c.earningsSurprises||[])[0]||{},basis=String(report.epsBasis||report.basis||"").toUpperCase();
  const consensus=Number.isFinite(report.epsConsensus)?report.epsConsensus:report.consensus;
  const actual=basis==="GAAP"?(q.eps||c.eps||[])[0]:["ADJUSTED","NON-GAAP"].includes(basis)?report.adjustedEps:null;
  const verified=String(report.status||"").toUpperCase()!=="UNVERIFIED";
  const classify=(value,estimate)=>verified&&Number.isFinite(value)&&Number.isFinite(estimate)?Math.abs(value-estimate)<.005?"MEET":value>estimate?"BEAT":"MISS":"UNVERIFIED";
  const epsOutcome=["GAAP","ADJUSTED","NON-GAAP"].includes(basis)?classify(actual,consensus):"UNVERIFIED";
  const revActual=Number.isFinite(report.revenueActual)?report.revenueActual:(q.revenues||[])[0];
  const revOutcome=classify(revActual,report.revenueConsensus);
  const yoy=v=>Number.isFinite(v)?(v>0?"+":"")+v.toFixed(1)+"% YoY":"YoY unavailable";
  const chip=(label,value,sub,kind)=>'<div class="earnings-chip '+safe(kind||"")+'"><span>'+safe(label)+'</span><b>'+safe(value)+'</b><small>'+safe(sub)+'</small></div>';
  return '<div class="earnings-glance" aria-label="Latest quarterly earnings summary">'+
    chip("REVENUE",compactMillions((q.revenues||[])[0]),yoy((q.revg||[])[0]))+
    chip("GAAP NET INCOME",compactMillions((q.net||[])[0]),yoy((q.nyoy||[])[0]),(q.net||[])[0]<0?"loss":"")+
    chip("EPS VS CONSENSUS",epsOutcome,epsOutcome==="UNVERIFIED"?"Comparable estimate missing":basis+" basis",epsOutcome.toLowerCase())+
    chip("REVENUE VS CONSENSUS",revOutcome,revOutcome==="UNVERIFIED"?"Estimate unverified":"Latest quarter",revOutcome.toLowerCase())+
    '</div>';
}
function earningsQuality(c){
  const q=c.quarter||{},periods=(q.periods||[]).slice(0,4),eps=(q.eps||c.eps||[]),surprises=Array.isArray(c.earningsSurprises)?c.earningsSurprises:[];
  const resultBadge=v=>v?'<span class="surprise '+safe(String(v).toLowerCase().replace(/[^a-z]+/g,"-"))+'">'+safe(v)+'</span>':'<span class="surprise neutral">UNVERIFIED</span>';
  const rows=periods.map((period,i)=>{
    const x=surprises[i]||{};
    const gaap=Number.isFinite(eps[i])?money.format(eps[i]):"—";
    const adj=Number.isFinite(x.adjustedEps)?money.format(x.adjustedEps):"—";
    const epsConsensus=Number.isFinite(x.epsConsensus)?money.format(x.epsConsensus):(Number.isFinite(x.consensus)?money.format(x.consensus):"—");
    const basis=String(x.epsBasis||x.basis||"").toUpperCase();
    const actual=basis==="GAAP"?eps[i]:["ADJUSTED","NON-GAAP"].includes(basis)?x.adjustedEps:null;
    const estimate=Number.isFinite(x.epsConsensus)?x.epsConsensus:x.consensus;
    const epsResult=Number.isFinite(actual)&&Number.isFinite(estimate)?Math.abs(actual-estimate)<.005?"MEET":actual>estimate?"BEAT":"MISS":null;
    const epsCell=(epsConsensus!=="—"?'<b>'+epsConsensus+'</b><small>'+(basis?basis+" CONSENSUS":"BASIS UNVERIFIED")+'</small>':"—")+resultBadge(epsResult);
    const revActual=Number.isFinite(x.revenueActual)?money.format(x.revenueActual)+"M":(Array.isArray(q.revenues)&&Number.isFinite(q.revenues[i])?money.format(q.revenues[i])+"M":"—");
    const revConsensus=Number.isFinite(x.revenueConsensus)?money.format(x.revenueConsensus)+"M":"—";
    const revNumber=Number.isFinite(x.revenueActual)?x.revenueActual:(q.revenues||[])[i];
    const revResult=Number.isFinite(revNumber)&&Number.isFinite(x.revenueConsensus)?Math.abs(revNumber-x.revenueConsensus)<.005?"MEET":revNumber>x.revenueConsensus?"BEAT":"MISS":null;
    const revCell='<b>'+revActual+'</b><small>vs '+revConsensus+'</small>'+resultBadge(revResult);
    return '<tr><th scope="row">'+safe(period)+'</th><td>'+gaap+'</td><td>'+adj+'</td><td>'+epsCell+'</td><td>'+revCell+'</td></tr>';
  }).join("");
  const trend=n=>Number.isFinite(n)?(n>=0?"+":"")+n.toFixed(1)+"% YoY":"Prior loss / unverified";
  const gaapRows=periods.map((period,i)=>'<tr><th scope="row">'+safe(period)+'</th><td>'+(Number.isFinite((q.revenues||[])[i])?money.format(q.revenues[i])+"M":"—")+'<small>'+trend((q.revg||[])[i])+'</small></td><td>'+(Number.isFinite((q.net||[])[i])?money.format(q.net[i])+"M":"—")+'<small>'+trend((q.nyoy||[])[i])+'</small></td><td>'+(Number.isFinite(eps[i])?money.format(eps[i]):"—")+'</td></tr>').join("");
  const source=c.earningsSurpriseSource&&/^https:\/\//.test(c.earningsSurpriseSource.url||"")?'<a class="source-link" href="'+safe(c.earningsSurpriseSource.url)+'" target="_blank" rel="noopener">Consensus history source ↗</a>':"";
  return '<div class="earnings-quality">'+earningsAtAGlance(c)+financialTrendCharts(c)+'<div class="mini-section-head"><h4>Four-quarter GAAP results</h4><span>SAME QUARTER YOY</span></div><table class="fundamental-table"><thead><tr><th>Fiscal quarter</th><th>Revenue</th><th>Net income</th><th>EPS</th></tr></thead><tbody>'+gaapRows+'</tbody></table><p class="history-note">USD millions except per-share EPS. '+safe(q.verification||"Verify historical figures in the linked filings.")+'</p><div class="mini-section-head"><h4>Earnings quality & surprise</h4><span>GAAP + COMPARABLE CONSENSUS</span></div><div class="table-scroll"><table class="fundamental-table earnings-table"><thead><tr><th>Quarter</th><th>GAAP EPS</th><th>Adjusted EPS*</th><th>EPS vs estimate*</th><th>Revenue vs estimate*</th></tr></thead><tbody>'+rows+'</tbody></table></div><div class="earnings-source-row"><p class="history-note">*Adjusted EPS is compared only with adjusted/non-GAAP consensus. GAAP EPS remains separately visible and is never compared against an adjusted consensus. Missing comparable consensus stays UNVERIFIED.</p>'+source+'</div></div>';
}
function previousCandidate(c){
  return previousResearch&&Array.isArray(previousResearch.candidates)?previousResearch.candidates.find(x=>x.ticker===c.ticker&&x.qualified):null;
}
function rankMovement(c){
  const p=previousCandidate(c);
  if(!previousResearch||!Array.isArray(previousResearch.candidates))return '<span class="rank-move flat">FIRST</span>';
  if(!p||!Number.isFinite(p.rank))return '<span class="rank-move new">NEW</span>';
  const d=p.rank-c.rank;
  if(d>0)return '<span class="rank-move up">↑'+d+'</span>';
  if(d<0)return '<span class="rank-move down">↓'+Math.abs(d)+'</span>';
  return '<span class="rank-move flat">—</span>';
}
function rankMovementDetail(c){
  const p=previousCandidate(c);
  if(!p||!Number.isFinite(p.rank)||!Number.isFinite(c.rank))return "";
  const d=p.rank-c.rank,changes=[],current=c.scoreBreakdown||{},prior=p.scoreBreakdown||{};
  Object.keys(current).forEach(k=>{
    if(Number.isFinite(current[k])&&Number.isFinite(prior[k])){
      const delta=current[k]-prior[k];
      if(delta)changes.push({k,delta,abs:Math.abs(delta)});
    }
  });
  changes.sort((a,b)=>b.abs-a.abs||a.k.localeCompare(b.k));
  const factors=changes.slice(0,2).map(x=>x.k.replace(" / Drawdown","").replace(" / Macro Resilience","")+" "+(x.delta>0?"+":"")+x.delta).join(" · ");
  const move=d>0?"Rank improved "+d:d<0?"Rank fell "+Math.abs(d):"Rank unchanged";
  return '<div class="rank-context">'+safe(move)+(factors?" · "+safe(factors):"")+'</div>';
}
function matchesFilter(c){
  const p=planFor(c.ticker)||{},a=normalizedStatus(p.action);
  if(activeFilter==="tier1")return Number(c.tier)===1;
  if(activeFilter==="tier2")return Number(c.tier)===2;
  if(activeFilter==="tier3")return Number(c.tier)===3;
  if(activeFilter==="support"){const s=supportTiming(p);return s.state==="in"||s.state==="near";}
  if(activeFilter==="wait")return entryTimingStatus(p).label.includes("WAIT")||a.includes("DO NOT");
  if(activeFilter==="contract")return Boolean(contractFor(c.ticker));
  return true;
}
function supportTimingBadge(p){
  const s=supportTiming(p),e=entryTimingStatus(p);
  const pctText=Number.isFinite(s.distancePct)&&s.distancePct>0?" · "+(s.distancePct*100).toFixed(1)+"% above zone":"";
  return '<div class="support-timing '+safe(e.tone)+'"><div><span>SUPPORT STATUS</span><b>'+safe(s.label)+'</b><small>'+safe(e.detail)+safe(pctText)+'</small></div><strong>'+safe(e.label)+'</strong></div>';
}
function setupCard(c,compact){
  const p=planFor(c.ticker)||{},contract=contractFor(c.ticker),ownerCandidate=ownerContractFor(c.ticker),historical=historicalContractFor(c.ticker),action=stageAction(p);
  const event=p.eventRisk?'<div class="event-note">⚠ '+safe(p.eventRisk)+'</div>':"";
  const ladder=(p.entry1||p.add2||p.finalAdd)?'<div class="entry-ladder"><div><span>'+safe(p.entry1Label||"1ST MAJOR SUPPORT")+' · 30%</span><b>'+safe(p.entry1||"—")+'</b></div><div><span>'+safe(p.add2Label||"2ND MAJOR SUPPORT")+' · 30%</span><b>'+safe(p.add2||"—")+'</b></div><div><span>'+safe(p.finalAddLabel||"FINAL DEEP SUPPORT")+' · 40%</span><b>'+safe(p.finalAdd||"—")+'</b></div></div>':"";
  const reasons=(p.entry1Reason||p.add2Reason||p.finalAddReason)?'<div class="support-reasons"><div><b>Why this is the 1st buy area</b><p>'+safe(supportEvidence(p.entry1Reason)||"—")+'</p></div><div><b>Why this is the 2nd buy area</b><p>'+safe(supportEvidence(p.add2Reason)||"—")+'</p></div><div><b>Why this is the final deep-buy area</b><p>'+safe(supportEvidence(p.finalAddReason)||"—")+'</p></div></div>':"";
  const vm=c.valuationModel&&c.valuationModel.targets?c.valuationModel.targets:null;
  const targetBlock=vm?'<div class="target-strip"><div><span>BEAR VALUE</span><b>'+money.format(vm.bear.blended)+'</b><small>Conservative case</small></div><div><span>BASE VALUE</span><b>'+money.format(vm.base.blended)+'</b><small>Central case</small></div><div><span>BULL VALUE</span><b>'+money.format(vm.bull.blended)+'</b><small>Strong execution</small></div></div>':"";
  const sector='<div class="sector-line"><span>'+safe(c.sector||"Sector N/A")+'</span><b>'+safe(c.industry||"")+'</b></div>';
  const sectorDetail=(c.sectorLongTermGood||c.sectorLongTermRisk)?'<div class="sector-box"><div><b>Sector tailwinds</b><p>'+safe((c.sectorLongTermGood||[]).join(" · "))+'</p></div><div><b>Sector risks</b><p>'+safe((c.sectorLongTermRisk||[]).join(" · "))+'</p></div></div>':"";
  const price=(p.price!=null?p.price:c.price);
  const drawdown=ownerQuoteFor(c.ticker)&&Number.isFinite(c.high)&&c.high>0?Math.max(0,(c.high-price)/c.high):c.drawdown;
  const rev=c.quarter&&c.quarter.revg&&c.quarter.revg[0]!=null?(Number(c.quarter.revg[0])>=0?"+":"")+Number(c.quarter.revg[0]).toFixed(1)+"%":"—";
  const contractSummary=contract?'<span class="contract-ready">VERIFIED ELIGIBLE</span>':ownerCandidate?'<span class="contract-reference-only">'+safe(ownerCandidate.screeningLevelLabel||"ALPACA PRE-SCREEN")+' · OI VERIFY</span>':historical?'<span class="contract-reference-only">HISTORICAL / VERIFY</span>':'<span class="contract-none">NO VERIFIED CONTRACT</span>';
  const optionBody=contract?contractCard(contract,true):ownerCandidate?contractCard(ownerCandidate,true):'<section class="contract-pending"><p>No current contract has complete verified delta, IV, bid/ask and OI that passes the 0.60–0.75 delta / ≤5% spread rules.</p>'+(historical?'<div class="historical-reference"><b>Saved reference only</b><span>'+safe(historical.reference||"Historical chain reference")+'</span><small>'+safe(historical.sourceAsOf||"Timestamp unavailable")+'</small></div>':"")+'</section>';
  return '<article id="stock-'+safe(c.ticker)+'" class="setup-card '+(actionTone(action)==="buy"?"actionable":"")+'" data-ticker="'+safe(c.ticker)+'">'+
    '<div class="setup-top"><div class="ticker-block"><div class="ticker-row"><span class="rank-badge">#'+safe(c.rank||"—")+'</span><span class="ticker">'+safe(c.ticker)+'</span><span class="score">'+c.score+'/100</span>'+rankMovement(c)+'</div><div class="company">'+safe(c.company)+'</div><span class="lane-tag">Tier '+safe(c.tier||"—")+' · '+safe(c.strategyLane||"Qualified")+'</span></div><span class="action '+actionTone(action)+'">'+safe(action)+'</span></div>'+sector+
    '<div class="setup-meta"><div><span>PRICE</span><b>'+money.format(price)+'</b><small>'+fmtMove(p.todayPct)+' today</small></div><div><span>DRAWDOWN</span><b class="down">−'+pct(drawdown)+'</b><small>52W high '+money.format(c.high)+'</small></div><div><span>REV. YOY</span><b class="up">'+rev+'</b><small>Latest quarter</small></div></div>'+
    qualificationGates(c)+rankMovementDetail(c)+supportTimingBadge(p)+
    '<p class="business-summary"><b>'+safe(c.netSummary)+'</b> · FCF '+safe(c.fcfSummary)+'<br>Technical: '+safe(p.technicalState||c.state||"Unverified")+' · '+contractSummary+'</p>'+
    '<div class="card-section-stack">'+
      '<details class="card-more" data-detail-key="entry:'+safe(c.ticker)+'"><summary>Entry plan & support <span>⌄</span></summary><div class="deep-detail">'+ladder+reasons+'<p class="confirm"><b>Entry rule:</b> Buy or add in the planned major support zone while the thesis remains intact. Verify material news and the actual LEAPS contract before placing a trade.</p>'+event+'</div></details>'+
      '<details class="card-more" data-detail-key="fundamentals:'+safe(c.ticker)+'"><summary>Fundamentals & cash flow <span>⌄</span></summary><div class="deep-detail">'+cashFlowPanel(c)+earningsQuality(c)+sectorDetail+fundamentalDetails(c)+'</div></details>'+
      '<details class="card-more" data-detail-key="valuation:'+safe(c.ticker)+'"><summary>Valuation & thesis <span>⌄</span></summary><div class="deep-detail">'+targetBlock+'<p><b>Why down:</b> '+safe(c.down||"—")+'</p><p><b>Valuation:</b> '+safe(c.valuation||"—")+'</p><p><b>Moat:</b> '+safe(c.moat||"—")+'</p><p><b>Prior-high reference:</b> '+safe(c.recovery||"—")+'</p><p><b>Invalidation:</b> '+safe(c.invalidation||"—")+'</p></div></details>'+
      '<details class="contract-panel" data-detail-key="contract-panel:'+safe(c.ticker)+'"><summary><span class="contract-panel-title">LEAP contract<small>'+safe(contract?contract.reference||"Verified candidate":ownerCandidate?ownerCandidate.reference||"Alpaca pre-screen candidate":historical?"Historical reference only":"Awaiting verified chain")+'</small></span><span class="contract-panel-toggle">⌄</span></summary><div class="contract-panel-body">'+optionBody+'</div></details>'+
    '</div>'+
  '</article>';
}
function supportZone(value){
  const nums=(String(value||"").replace(/,/g,"").match(/\d+(?:\.\d+)?/g)||[]).map(Number).filter(Number.isFinite);
  if(!nums.length)return null;
  return {low:Math.min(...nums),high:Math.max(...nums)};
}
function supportAlertTarget(value){const z=supportZone(value);return z?z.high:null;}
function robinhoodLevels(p){
  const defs=[
    {key:"entry1",label:(p&&p.entry1Label)||"1st Major Support",size:"30%"},
    {key:"add2",label:(p&&p.add2Label)||"2nd Major Support",size:"30%"},
    {key:"finalAdd",label:(p&&p.finalAddLabel)||"Final Deep Support",size:"40%"}
  ];
  return defs.map(d=>{
    const raw=p&&p[d.key],zone=supportZone(raw);
    return {...d,raw:raw||"",zone,target:zone?zone.high:null};
  });
}
function nextRobinhoodAlert(p){
  const price=Number(p&&p.price);
  if(!Number.isFinite(price))return null;
  return robinhoodLevels(p).filter(x=>Number.isFinite(x.target)&&price>x.target).sort((a,b)=>b.target-a.target)[0]||null;
}
function supportTiming(p){
  const price=Number(p&&p.price),levels=robinhoodLevels(p);
  if(!Number.isFinite(price))return {state:"unverified",label:"SUPPORT UNVERIFIED",level:null,distancePct:null};
  for(const level of levels){
    if(level.zone&&price>=level.zone.low&&price<=level.zone.high){
      return {state:"in",label:"AT "+String(level.label).toUpperCase(),level,distancePct:0};
    }
  }
  const below=levels.filter(x=>x.zone&&price>x.zone.high).sort((a,b)=>b.zone.high-a.zone.high);
  if(below.length){
    const level=below[0],distance=(price-level.zone.high)/level.zone.high;
    if(distance<=0.01)return {state:"near",label:"NEAR "+String(level.label).toUpperCase(),level,distancePct:distance};
    return {state:"above",label:"ABOVE SUPPORT",level,distancePct:distance};
  }
  return {state:"below",label:"BELOW PLANNED SUPPORTS",level:null,distancePct:null};
}
function entryTimingStatus(p){
  const s=supportTiming(p),day=Number(p&&p.todayPct),action=normalizedStatus(p&&p.action);
  if(action.includes("BROKEN")||action.includes("AVOID"))return {label:"NO ENTRY",tone:"stop",detail:"Thesis or market plan blocks an entry."};
  if(s.state==="in"){
    const thesis=normalizedStatus(p&&p.thesisStatus);
    if(!thesis.startsWith("INTACT")||thesis.includes("UNRESOLVED"))return {label:"THESIS CHECK — WAIT",tone:"stop",detail:"Verify material news and business thesis before a staged entry."};
    const stage=s.level.key==="entry1"?"BUY ZONE — ENTRY 1":s.level.key==="add2"?"ADD ZONE — ADD 2":"ADD ZONE — FINAL ADD";
    return {label:stage,tone:"buy",detail:(Number.isFinite(day)?fmtMove(day)+" today · ":"")+s.label+" · verify event risk and contract"};
  }
  if(action.includes("DO NOT ADD"))return {label:"NO ENTRY",tone:"stop",detail:"Current market plan says do not add; wait for a planned major support zone."};
  if(s.state==="near")return {label:"NEAR SUPPORT — WATCH",tone:"watch",detail:(Number.isFinite(day)?fmtMove(day)+" today · ":"")+s.label};
  return {label:"WAIT",tone:"watch",detail:s.label};
}
function robinhoodLevelState(price,level){
  if(!Number.isFinite(price)||!level||!level.zone||!Number.isFinite(level.target))return {label:"PENDING",tone:"pending"};
  if(price>level.target)return {label:"READY TO SET",tone:"future"};
  if(price>=level.zone.low&&price<=level.zone.high)return {label:"IN ZONE",tone:"zone"};
  return {label:"CROSSED",tone:"crossed"};
}
function robinhoodAlertCard(c){
  const p=planFor(c.ticker)||{},price=Number(p.price),levels=robinhoodLevels(p),next=nextRobinhoodAlert(p);
  const validPlan=Number.isFinite(price)&&levels.every(x=>Number.isFinite(x.target));
  if(!validPlan){
    return '<article class="rh-card pending"><div class="rh-card-head"><div><span class="rank-badge">#'+safe(c.rank||"—")+'</span><b>'+safe(c.ticker)+'</b></div><span class="rh-state pending">SUPPORT PLAN PENDING</span></div><p>Waiting for a verified three-level market support plan. This row will populate automatically when the next market snapshot is published.</p></article>';
  }
  const levelsHtml=levels.map(level=>{
    const state=robinhoodLevelState(price,level),target=money.format(level.target);
    const copy=state.tone==="future"?'<button type="button" class="rh-copy" data-copy-price="'+level.target.toFixed(2)+'">COPY '+target+'</button>':"";
    return '<div class="rh-level '+state.tone+'"><div><span>'+safe(level.label)+'</span><small>'+safe(level.raw)+' · '+safe(level.size)+'</small></div><div class="rh-level-price"><b>'+target+'</b><small>'+state.label+'</small></div>'+copy+'</div>';
  }).join("");
  const timing=supportTiming(p),timingEntry=entryTimingStatus(p);
  const currentSupport='<div class="rh-current-support '+safe(timing.state)+'"><span>CURRENT SUPPORT STATUS</span><b>'+safe(timing.label)+'</b><small>'+safe(timingEntry.detail)+'</small></div>';
  const nextBlock=next?'<div class="rh-next"><div><span>NEXT ROBINHOOD ALERT</span><b>'+money.format(next.target)+'</b><small>'+safe(next.label)+' · set trigger to “Falls below”</small></div><button type="button" data-copy-price="'+next.target.toFixed(2)+'">COPY TARGET</button></div>':'<div class="rh-next exhausted"><div><span>NEXT ROBINHOOD ALERT</span><b>NO LOWER PLANNED LEVEL</b><small>Price has already reached or crossed every published support alert. Wait for a refreshed plan.</small></div></div>';
  const action=stageAction(p);
  return '<article class="rh-card"><div class="rh-card-head"><div class="rh-symbol"><span class="rank-badge">#'+safe(c.rank||"—")+'</span><div><b>'+safe(c.ticker)+'</b><small>'+safe(c.company||"Qualified company")+'</small></div></div><span class="action '+actionTone(action)+'">'+safe(action)+'</span></div>'+
    '<div class="rh-current"><div><span>CURRENT PRICE</span><b>'+money.format(price)+'</b></div><div><span>TODAY</span><b class="'+(Number(p.todayPct)<0?"down":Number(p.todayPct)>0?"up":"")+'">'+fmtMove(Number(p.todayPct))+'</b></div><div><span>ROBINHOOD TRIGGER</span><b>Falls below</b></div></div>'+
    currentSupport+nextBlock+'<div class="rh-levels">'+levelsHtml+'</div>'+
    '<p class="rh-card-note">Price alert only. The 30% / 30% / 40% plan uses the three published major support zones while the thesis remains intact. Verify material news and the LEAPS contract before trading; day-change percentage is context.</p></article>';
}
function renderRobinhoodAlerts(allCards){
  const el=document.getElementById("robinhood-alert-list");
  if(!el)return;
  const cards=(allCards||[]).slice().sort((a,b)=>(a.rank||999)-(b.rank||999));
  el.innerHTML=cards.length?cards.map(robinhoodAlertCard).join(""):'<div class="loading">No qualified stocks currently require alert levels.</div>';
  const note=document.getElementById("robinhood-alert-note");
  if(note)note.textContent="Generated from the current qualified list and latest published support plan. Auto-refreshes every 60 seconds; list additions/removals and support changes update this section automatically.";
}
function attentionRows(allCards){
  return allCards.map(c=>({c,p:planFor(c.ticker)||{}})).map(x=>({...x,s:supportTiming(x.p),e:entryTimingStatus(x.p)}))
    .filter(x=>x.s.state==="in"||x.s.state==="near")
    .sort((a,b)=>(a.s.state==="in"?0:1)-(b.s.state==="in"?0:1)||a.c.rank-b.c.rank);
}
function renderAttention(allCards){
  const rows=attentionRows(allCards),inZone=rows.filter(x=>x.s.state==="in").length,near=rows.length-inZone;
  const count=document.getElementById("attention-count"),list=document.getElementById("attention-list"),source=document.getElementById("attention-source");
  if(count)count.textContent=inZone+" at support · "+near+" near";
  if(source){
    const owner=typeof window!=="undefined"?window.leapsOwnerPriceState:null;
    const observed=market?.quoteObservation?.observedAt||market?.market?.spy?.observedAt;
    const age=Date.now()-Date.parse(observed||"");
    source.textContent=owner?.active?"Owner Alpaca "+String(owner.feed||"IEX").toUpperCase()+" recent quotes for "+owner.count+" of "+owner.total+" symbols; others use the saved snapshot.":"Public snapshot observed "+formatTime(observed)+"."+(Number.isFinite(age)&&age>90*60000?" Saved prices; confirm current quotes before acting.":"");
  }
  if(!list)return;
  list.innerHTML=rows.length?rows.map(({c,p,s,e})=>{
    const price=Number(p.price),contract=contractFor(c.ticker),ownerCandidate=ownerContractFor(c.ticker);
    const label=s.state==="in"&&e.tone==="buy"?"STOCK IN ENTRY ZONE":e.label;
    return '<a class="attention-row '+safe(e.tone)+'" href="#stock-'+safe(c.ticker)+'" data-focus-ticker="'+safe(c.ticker)+'"><span class="attention-symbol"><b>#'+safe(c.rank)+' '+safe(c.ticker)+'</b><small>'+safe(c.company)+'</small></span><span class="attention-position"><b>'+money.format(price)+'</b><small>'+safe(s.label)+'</small></span><span class="attention-decision"><b>'+safe(label)+'</b><small>'+(contract?'Verified contract available':ownerCandidate?(ownerCandidate.screeningLevelLabel||"Alpaca candidate")+' · OI verify':'Contract check needed')+'</small></span><span class="attention-arrow" aria-hidden="true">↗</span></a>';
  }).join(""):'<p class="attention-empty">No qualified stock is at or within about 1% above a planned support zone in the current price view. The full research list remains below.</p>';
}
function publishedChanges(){
  const changes=[],current=(research&&research.candidates)||[],prior=(previousResearch&&previousResearch.candidates)||[];
  const scoreFactors=(c,before)=>{
    const now=c.scoreBreakdown||{},was=before.scoreBreakdown||{};
    return Object.keys(now).filter(k=>Number.isFinite(now[k])&&Number.isFinite(was[k])&&now[k]!==was[k])
      .sort((a,b)=>Math.abs(now[b]-was[b])-Math.abs(now[a]-was[a]))
      .slice(0,2).map(k=>k+" "+(now[k]>was[k]?"+":"")+(now[k]-was[k])).join(" · ");
  };
  if(previousResearch){
    const oldQualified=new Map(prior.filter(c=>c.qualified).map(c=>[c.ticker,c]));
    const newQualified=new Map(current.filter(c=>c.qualified).map(c=>[c.ticker,c]));
    const rejected=new Map(((research&&research.rejected)||[]).map(c=>[c.ticker,c]));
    for(const [ticker,c] of newQualified){
      const before=oldQualified.get(ticker);
      if(!before){changes.push({kind:"research",ticker,detail:"Newly qualified at research rank #"+c.rank+"; see current qualification gates and research"});continue;}
      const factors=scoreFactors(c,before);
      if(c.rank!==before.rank)changes.push({kind:"research",ticker,detail:"Research rank #"+before.rank+" → #"+c.rank+(c.score!==before.score?" · score "+before.score+" → "+c.score:"")+(factors?" · score factors: "+factors:"")});
      else if(c.score!==before.score)changes.push({kind:"research",ticker,detail:"Research score "+before.score+" → "+c.score+"; rank remains #"+c.rank+(factors?" · score factors: "+factors:"")});
    }
    for(const [ticker] of oldQualified)if(!newQualified.has(ticker))changes.push({kind:"research",ticker,detail:"No longer qualified"+(rejected.get(ticker)?.reason?": "+rejected.get(ticker).reason:"; review current research")});
  }
  if(previousMarket){
    const oldPlans=new Map(((previousMarket&&previousMarket.candidatePlans)||[]).map(p=>[p.ticker,p]));
    for(const p of ((market&&market.candidatePlans)||[])){
      const old=oldPlans.get(p.ticker);
      if(!old||!current.some(c=>c.ticker===p.ticker&&c.qualified))continue;
      for(const [key,name] of [["entry1","1st support"],["add2","2nd support"],["finalAdd","Final support"]]){
        if(String(p[key]||"")!==String(old[key]||""))changes.push({kind:"support",ticker:p.ticker,detail:name+" "+String(old[key]||"unavailable")+" → "+String(p[key]||"unavailable")+(p[key+"ChangeReason"]?" · change reason: "+p[key+"ChangeReason"]:p[key+"Reason"]?" · current support basis: "+supportEvidence(p[key+"Reason"]):" · change reason unavailable")});
      }
    }
  }
  return changes;
}
function renderChanges(){
  const el=document.getElementById("change-list"),count=document.getElementById("change-count");if(!el)return;
  const changes=publishedChanges();
  if(count)count.textContent=changes.length?changes.length+" published change"+(changes.length===1?"":"s"):previousResearch||previousMarket?"No plan or rank changes":"Previous scan unavailable";
  const coverage=(!previousResearch||!previousMarket)?'<p class="change-caveat">'+(!previousResearch?"Previous research unavailable. ":"")+(!previousMarket?"Previous market plan unavailable.":"")+'</p>':"";
  el.innerHTML=changes.length?'<p class="change-caveat">Compared with the prior saved research and market snapshots. Price moves alone are excluded.</p>'+changes.slice(0,8).map(x=>'<p class="change-item"><b>'+safe(x.ticker)+'</b> '+safe(x.detail)+'</p>').join("")+(changes.length>8?'<p class="change-caveat">'+(changes.length-8)+' more changes in this comparison.</p>':"")+coverage:'<p class="change-caveat">'+(previousResearch||previousMarket?"No qualification, rank, score, or support-zone changes in the available previous snapshots.":"A previous published snapshot is needed to compare changes.")+'</p>'+coverage;
}
function documentedReviewCount(snapshot){
  const qualified=(snapshot?.candidates||[]).filter(c=>c.qualified).length;
  const rejected=(snapshot?.rejected||[]).length;
  const reported=snapshot?.researchFunnel?.deepReviewCount;
  const documented=qualified+rejected;
  return {documented,reported,unreconciled:Number.isFinite(reported)&&reported!==documented};
}
function renderDesk(){
  const state=market&&market.marketState?market.marketState:"UNAVAILABLE";
  const ownerLive=typeof window!=="undefined"&&window.leapsOwnerPriceState?.active===true;
  document.getElementById("market-state").textContent=state==="NORMAL DAY"?"NO BROAD-MARKET DIP":state;
  const trig=document.getElementById("trigger-pill");
  trig.textContent=ownerLive?"PUBLISHED SCAN":market&&market.triggered?"DIP TRIGGER ACTIVE":"NO DIP TRIGGER";
  trig.className="state-pill "+(market&&market.triggered?"hot":"good");
  document.getElementById("market-message").textContent=(market?.triggered?"Broad-market dip trigger active.":"No broad-market dip trigger.")+" Individual stocks may still reach an entry zone; see Needs attention below."+(ownerLive?" Owner prices refresh automatically.":"");
  const published=document.getElementById("published-assessment");if(published)published.textContent=market?.message||"No published assessment available.";
  document.getElementById("market-grid").innerHTML=marketStat("SPY",market&&market.market?market.market.spy:null)+marketStat("QQQ",market&&market.market?market.market.qqq:null)+marketStat("VIX",market&&market.market?market.market.vix:null);

  const allCards=((research&&research.candidates)||[]).filter(c=>c.qualified).sort((a,b)=>{
    const ar=Number.isFinite(a.rank)?a.rank:Infinity,br=Number.isFinite(b.rank)?b.rank:Infinity;
    return ar-br||b.score-a.score||String(a.ticker).localeCompare(String(b.ticker));
  });
  renderAttention(allCards);
  renderChanges();
  const visible=allCards.filter(matchesFilter);
  document.getElementById("top-setups").innerHTML=visible.length?visible.map(c=>setupCard(c,false)).join(""):'<div class="loading">No qualified setups match this filter.</div>';
  const count=document.getElementById("filter-count");if(count)count.textContent=visible.length+" of "+allCards.length;
  document.querySelectorAll("[data-filter]").forEach(b=>b.classList.toggle("active",b.dataset.filter===activeFilter));

  const buyCount=allCards.filter(c=>entryTimingStatus(planFor(c.ticker)||{}).tone==="buy").length;
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};

  const f=(research&&research.researchFunnel)||{};
  set("coverage-universe",f.universeScanned==null?"—":Number(f.universeScanned).toLocaleString());
  set("coverage-qualified",f.qualifiedCount==null?allCards.length:Number(f.qualifiedCount).toLocaleString());
  set("coverage-actionable",buyCount.toLocaleString());
  const reviewCount=documentedReviewCount(research);
  set("coverage-reviewed",reviewCount.documented.toLocaleString());
  const note=document.getElementById("coverage-note");
  if(note)note.textContent=(f.universeDefinition||"Coverage details unavailable.")+(reviewCount.unreconciled?" Historical count warning: "+reviewCount.reported+" reviews were reported, but only "+reviewCount.documented+" company outcomes are documented. Undocumented reviews are not treated as completed.":"");
  const rejected=(research&&research.rejected)||[];
  const re=document.getElementById("coverage-rejections");
  if(re)re.innerHTML=rejected.length?'<details class="card-more" data-detail-key="rejected"><summary>Reviewed · '+rejected.length+' not qualified ⌄</summary><div class="deep-detail">'+rejected.map(x=>'<p><b>'+safe(x.ticker)+':</b> '+safe(x.reason)+'</p>').join("")+'</div></details>':"";
  renderRobinhoodAlerts(allCards);
}
function contractCard(c,embedded=false){
  const readiness=c.approval||c.readiness||"VERIFY LIVE";
  const tone=normalizedStatus(readiness).includes("REFERENCE ONLY")?"reference":readinessTone(readiness);
  const status=c.classification==="eligible"&&c.verified===true?"Verified eligible":c.classification==="alpaca_prescreen"?(c.screeningLevelLabel||"Alpaca pre-screen")+" · OI verify":tone==="good"?"Verified contract":tone==="bad"?"Not approved":"Live check required";
  const company=companyFor(c.ticker);
  const ft=c.fundamentalTargets||{},em=c.expirationMoneyness||{};
  const cost=Number.isFinite(c.costPerContract)?c.costPerContract:(Number.isFinite(c.ask)?c.ask*100:null);
  const deltaValue=contractDelta(c);
  const delta=Number.isFinite(deltaValue)?(Number.isFinite(c.delta)?"":"~")+deltaValue.toFixed(2):"—";
  const spread=contractSpread(c);
  const ivValue=Number.isFinite(c.iv)?c.iv:Number.isFinite(c.impliedVolatility)?c.impliedVolatility:Number.isFinite(c.modeledIV)?c.modeledIV:null;
  const iv=Number.isFinite(ivValue)?((Number.isFinite(c.iv)||Number.isFinite(c.impliedVolatility)?"":"~")+(ivValue*100).toFixed(1)+"%"):"—";
  const expiry=new Date(String(c.expiration||"")+"T12:00:00Z");
  const expiryText=Number.isNaN(expiry.getTime())?"Expiration unverified":new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(expiry);
  const reference=Number.isFinite(c.strike)?expiryText+" · "+money.format(c.strike)+" call":c.reference||"Contract reference unavailable";
  const horizon=String(c.preferredHorizonStatus||"");
  const horizonText=horizon.includes("SHORTER")?"Shorter than the preferred 18-month horizon":horizon.replace(/_/g," ").toLowerCase();
  const oiText=Number.isFinite(c.openInterest)?Number(c.openInterest).toLocaleString():"—";
  const oiNote=Number.isFinite(c.openInterest)?c.openInterest<100?"Below preferred 100 contracts":c.classification==="eligible"?"Observed OI · verify before entry":"Delayed reference · verify live":c.classification==="alpaca_prescreen"?"Not supplied by Alpaca snapshot · independent OI check required":"Live verification needed";
  const rows=[['Bear','Conservative',ft.bear,em.bear],['Base','Central estimate',ft.base,em.base],['Bull','Strong execution',ft.bull,em.bull]].map(([label,note,value,moneyness])=>'<tr><th scope="row"><b>'+label+'</b><small>'+note+'</small></th><td>'+(Number.isFinite(value)?money.format(value):"—")+'</td><td><span class="scenario-state">'+safe(moneyness||"Unverified")+'</span></td></tr>').join("");
  const tag=embedded?"section":"article";
  return '<'+tag+' class="contract-card contract-card-v12'+(embedded?" embedded-contract":"")+'" aria-label="'+safe(c.ticker)+' LEAP contract reference">'+
    '<header class="contract-card-head"><div class="contract-identity"><span class="contract-eyebrow">OPTION REFERENCE</span><div class="contract-title">'+(embedded?'<h4>LEAP call</h4>':'<h3>'+safe(c.ticker)+'</h3><span>'+safe(company&&company.company||"")+'</span>')+'</div></div><span class="readiness '+tone+'"><i aria-hidden="true"></i>'+status+'</span></header>'+
    '<div class="contract-reference">'+safe(reference)+'</div>'+(horizonText?'<p class="contract-horizon">'+safe(horizonText)+'</p>':"")+'<p class="reference-cutoff">'+safe(c.sourceAsOf||"Reference feed timestamp unavailable; verify the current chain.")+'</p>'+
    '<div class="contract-price-panel"><div><span>Cost per contract</span><strong>'+(Number.isFinite(cost)?money.format(cost):"—")+'</strong><small>Reference ask × 100 shares</small></div><div><span>Expiration breakeven</span><strong>'+(Number.isFinite(c.breakeven)?money.format(c.breakeven):"—")+'</strong><small>Underlying price to cover premium</small></div></div>'+
    '<dl class="contract-facts"><div><dt>Delta <span>'+(Number.isFinite(c.delta)?"reported":"modeled")+'</span></dt><dd>'+delta+'</dd><small>Stock-price sensitivity · verify live</small></div><div><dt>Open interest</dt><dd>'+oiText+'</dd><small>'+oiNote+'</small></div><div><dt>Bid/ask spread</dt><dd>'+(Number.isFinite(spread)?pct(spread):"—")+'</dd><small>'+(Number.isFinite(spread)?"Percent of midpoint · verify live":"Bid/ask not recorded; ranking provisional")+'</small></div><div><dt>Ask per share</dt><dd>'+(Number.isFinite(c.ask)?money.format(c.ask):"—")+'</dd><small>'+(c.classification==="alpaca_prescreen"?"Alpaca option quote":"Delayed premium reference")+'</small></div><div><dt>Implied volatility <span>'+(Number.isFinite(c.iv)||Number.isFinite(c.impliedVolatility)?"reported":"modeled")+'</span></dt><dd>'+iv+'</dd><small>'+(Number.isFinite(c.iv)||Number.isFinite(c.impliedVolatility)?"Observed IV; verify before entry":"Approximate model; verify the live chain")+'</small></div></dl><p class="contract-screen-note">0.60–0.75 delta · no price cap. Highest verified open interest still decides the final winner; tightest spread breaks ties. '+(c.classification==="alpaca_prescreen"?"Alpaca has pre-screened current delta, IV and spread; OI is still required before full approval.":spread===null?"This snapshot cannot confirm the liquidity winner.":"Compare current quotes before entry.")+'</p>'+
    '<section class="contract-scenarios" aria-label="Estimated underlying value at expiration"><div class="contract-section-heading"><h4>Value at expiration</h4><span>Underlying stock · estimates</span></div><table class="scenario-table"><thead><tr><th scope="col">Scenario</th><th scope="col">Stock value</th><th scope="col">Call status</th></tr></thead><tbody>'+rows+'</tbody></table><p class="scenario-footnote">'+safe(em.coverage||"Scenario coverage unverified")+'. ITM does not mean profitable; compare stock value with breakeven.</p></section>'+
    '<section class="contract-rationale"><h4>Selection rationale</h4>'+(c.classification==="alpaca_prescreen"&&c.screeningLevelLabel?'<p><b>Screening level:</b> '+safe(c.screeningLevelLabel)+'</p>':"")+''+(c.classification==="alpaca_prescreen"&&c.relaxedRules?'<p><b>What was relaxed:</b> '+safe(c.relaxedRules)+'</p>':"")+'<p>'+safe(c.selectionReason||c.note||"No selection rationale recorded. Verify the live chain before entry.")+'</p></section>'+
    '<details class="contract-more" data-detail-key="contract:'+safe(c.ticker)+'"><summary>Contract details & verification <span aria-hidden="true">+</span></summary><div class="contract-more-body"><dl class="contract-detail-facts"><div><dt>Stock above strike</dt><dd>'+(Number.isFinite(c.stockAboveStrike)?money.format(c.stockAboveStrike):"—")+'</dd></div><div><dt>Intrinsic value / share</dt><dd>'+(Number.isFinite(c.currentIntrinsic)?money.format(c.currentIntrinsic):"—")+'</dd></div><div><dt>Extrinsic value / share</dt><dd>'+(Number.isFinite(c.currentExtrinsic)?money.format(c.currentExtrinsic):"—")+'</dd></div><div><dt>Gamma</dt><dd>'+(Number.isFinite(c.gamma)?c.gamma.toFixed(4):"—")+'</dd></div><div><dt>Theta / day</dt><dd>'+(Number.isFinite(c.theta)?c.theta.toFixed(4):"—")+'</dd></div><div><dt>Vega</dt><dd>'+(Number.isFinite(c.vega)?c.vega.toFixed(4):"—")+'</dd></div></dl><p><b>Verification status:</b> '+safe(readiness)+'</p><p><b>Target profile:</b> 18–30 months preferred · 0.60–0.75 delta · ITM</p><p><b>Selection rule:</b> '+safe(CONTRACT_SELECTION_RULE)+'</p><p><b>Greek source:</b> '+safe(c.deltaSource||"Live delta required.")+'</p><p>Valuation scenarios are estimates, not probabilities or guarantees. Liquidity, bid/ask spread, IV and open interest need live verification.</p>'+(c.source?'<a class="source-link" href="'+safe(c.source)+'" target="_blank" rel="noopener">View delayed chain source ↗</a>':"")+'</div></details></'+tag+'>';
}
function renderAll(){const openKeys=new Set(Array.from(document.querySelectorAll("details[data-detail-key][open]")).map(e=>e.dataset.detailKey));renderDesk();renderFreshness();document.querySelectorAll("details[data-detail-key]").forEach(e=>{e.open=openKeys.has(e.dataset.detailKey);});}

async function load(){
  // Read enough immutable rows to survive stale reuploads; never trust insertion order as scan order.
  const [marketResult,researchResult]=await Promise.allSettled([
    sb("leap_scans","select=payload,scan_time&order=scan_time.desc&limit=30"),
    sb("leap_research_snapshots","select=payload,snapshot_time&order=snapshot_time.desc&limit=30")
  ]);
  let ignoredStale=false,partialFailure=false;
  if(marketResult.status==="fulfilled"){
    const selected=selectPublished(marketResult.value,"scan_time");
    if(selected.latest&&applyIfNotOlder(market,selected.latest.payload)){
      market=selected.latest.payload;previousMarket=selected.previous?.payload||null;marketSavedAt=selected.latest.scan_time;marketFromDatabase=true;
    }
    ignoredStale=ignoredStale||selected.ignoredStaleUpload;
    if(!selected.latest)partialFailure=true;
  }else{partialFailure=true;console.info("Market snapshot fallback",marketResult.reason?.message||marketResult.reason);}
  if(researchResult.status==="fulfilled"){
    const selected=selectPublished(researchResult.value,"snapshot_time");
    if(selected.latest&&applyIfNotOlder(research,selected.latest.payload)){
      research=selected.latest.payload;researchSavedAt=selected.latest.snapshot_time;previousResearch=selected.previous?.payload||null;researchFromDatabase=true;
    }
    ignoredStale=ignoredStale||selected.ignoredStaleUpload;
    if(!selected.latest)partialFailure=true;
  }else{partialFailure=true;console.info("Research snapshot fallback",researchResult.reason?.message||researchResult.reason);}
  if(!research)research=await json("data/research-latest.json");
  if(!market)market=await json("data/market-latest.json");
  const mode=partialFailure?"PARTIAL DATA":ignoredStale?"STALE UPLOAD IGNORED":marketFromDatabase&&researchFromDatabase?"DATABASE SNAPSHOT":marketFromDatabase||researchFromDatabase?"MIXED SOURCES":"DATED FALLBACK";
  sourceMode(mode,quoteCutoff());
  renderAll();
  if(partialFailure||ignoredStale){
    const note=document.getElementById("feed-note");
    if(note)note.textContent=ignoredStale?"An older scan was uploaded later. The latest genuinely completed scan remains displayed; check the dated price observation.":"One published source is unavailable. The most recent saved data or fallback is shown; verify timestamps before trading.";
  }
}
load().catch(e=>{console.error(e);sourceMode("LOAD ERROR");toast("Data could not load");});
let publicPollInFlight=false,lastPublicPollAt=0;
async function pollLatest(){
  if(publicPollInFlight)return;
  publicPollInFlight=true;
  try{
    const [marketResult,researchResult]=await Promise.allSettled([
      sb("leap_scans","select=payload,scan_time&order=scan_time.desc&limit=30"),
      sb("leap_research_snapshots","select=payload,snapshot_time&order=snapshot_time.desc&limit=30")
    ]);
    let changed=false,ignoredStale=false;
    const errors=[];
    if(marketResult.status==="fulfilled"){
      const selected=selectPublished(marketResult.value,"scan_time");
      if(selected.latest&&applyIfNotOlder(market,selected.latest.payload)){
        if(!marketFromDatabase||selected.latest.scan_time!==marketSavedAt){market=selected.latest.payload;previousMarket=selected.previous?.payload||null;marketSavedAt=selected.latest.scan_time;changed=true;}
        marketFromDatabase=true;
      }
      if(!selected.latest)errors.push("market");
      ignoredStale=ignoredStale||selected.ignoredStaleUpload;
    }else errors.push("market");
    if(researchResult.status==="fulfilled"){
      const selected=selectPublished(researchResult.value,"snapshot_time");
      if(selected.latest&&applyIfNotOlder(research,selected.latest.payload)){
        if(!researchFromDatabase||selected.latest.snapshot_time!==researchSavedAt){research=selected.latest.payload;researchSavedAt=selected.latest.snapshot_time;previousResearch=selected.previous?.payload||null;changed=true;}
        researchFromDatabase=true;
      }
      if(!selected.latest)errors.push("research");
      ignoredStale=ignoredStale||selected.ignoredStaleUpload;
    }else errors.push("research");
    const mode=errors.length?(errors.length===2?"REFRESH UNAVAILABLE":"PARTIAL REFRESH"):ignoredStale?"STALE UPLOAD IGNORED":
      marketFromDatabase&&researchFromDatabase?"DATABASE SNAPSHOT":marketFromDatabase||researchFromDatabase?"MIXED SOURCES":"DATED FALLBACK";
    sourceMode(mode,quoteCutoff());
    if(changed)renderAll();else renderFreshness();
    if(errors.length||ignoredStale){
      const note=document.getElementById("feed-note");
      if(note)note.textContent=ignoredStale?"An outdated research upload was ignored. The most recently completed scan is displayed.": "Latest "+errors.join(" and ")+" update unavailable. Showing saved observations; check timestamps before trading.";
    }
  }catch(e){
    console.error("Public refresh error",e);
    sourceMode("REFRESH ERROR",quoteCutoff());
    const note=document.getElementById("feed-note");
    if(note)note.textContent="Unexpected refresh error. The last known good market and research snapshots remain displayed.";
  }finally{
    publicPollInFlight=false;
    lastPublicPollAt=Date.now();
  }
}
setInterval(()=>{if(document.visibilityState!=="hidden")pollLatest();},60000);
window.addEventListener("focus",()=>{if(Date.now()-lastPublicPollAt>15000)pollLatest();});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&Date.now()-lastPublicPollAt>15000)pollLatest();});

document.addEventListener("click",e=>{
  const focus=e.target.closest("[data-focus-ticker]");
  if(focus){
    e.preventDefault();activeFilter="all";renderAll();
    document.getElementById("stock-"+focus.dataset.focusTicker)?.scrollIntoView({behavior:"smooth",block:"start"});
    return;
  }
  const copy=e.target.closest("[data-copy-price]");
  if(copy){
    const value=copy.dataset.copyPrice;
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(value).then(()=>toast("$"+value+" copied")).catch(()=>toast("Target $"+value));
    }else toast("Target $"+value);
    return;
  }
  const b=e.target.closest("[data-filter]");
  if(!b)return;
  activeFilter=b.dataset.filter||"all";
  renderAll();
});

