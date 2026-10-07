const SB_URL="https://ppsljqaaanpkksxbpalk.supabase.co";
const SB_KEY="sb_publishable_2JLPa7GMpdacVfxBnfCv_w_wl36jn2n";
const MIN_CONTRACT_DELTA=0.60;
const MAX_CONTRACT_DELTA=0.75;
const CONTRACT_SELECTION_RULE="0.60–0.75 delta, with no premium or contract-cost cap. Rank eligible liquid ITM calls by highest open interest, then tightest bid/ask spread as a percentage of midpoint. Live liquidity verification required.";
const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2});
const pct=n=>Number.isFinite(n)?(n*100).toFixed(1)+"%":"—";
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateFmt=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit",timeZoneName:"short"});
let research=null,previousResearch=null,market=null,marketSavedAt=null,researchSavedAt=null,marketFromDatabase=false,researchFromDatabase=false,activeFilter="all";

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
function actionTone(value){const a=normalizedStatus(value);if(a==="HIGH-CONVICTION DIP"||a==="BUY ZONE — ENTRY 1"||a==="ADD ZONE")return"buy";if(a.includes("BROKEN")||a.includes("AVOID")||a.includes("DO NOT"))return"stop";return"watch";}
function actionRank(value){const a=normalizedStatus(value),order=["HIGH-CONVICTION DIP","BUY ZONE — ENTRY 1","ADD ZONE","NEAR SUPPORT — WATCH","WAIT FOR REVERSAL","WATCH"],rank=order.indexOf(a);return rank<0?6:rank;}
function readinessTone(value){const r=normalizedStatus(value);if(/\b(?:NO CONTRACT APPROVED|NOT(?: FULLY)? APPROVED|POOR|AVOID|REJECT(?:ED)?|FAILED)\b/.test(r))return"bad";if(/\b(?:DELAYED|MODELED|REFERENCE|VERIFY|VERIFICATION|UNVERIFIED|WAIT|WATCH|NOT READY)\b/.test(r))return"reference";return["APPROVED","FULLY APPROVED","LIVE VERIFIED"].includes(r)?"good":"reference";}
function readinessLabel(value){const tone=readinessTone(value);return tone==="good"?"APPROVED":tone==="bad"?"NOT APPROVED":"REFERENCE · VERIFY LIVE";}
function fmtMove(n){if(!Number.isFinite(n))return"—";return(n>=0?"+":"")+n.toFixed(2)+"%";}
function formatTime(value){const time=new Date(value||"");return Number.isNaN(time.getTime())?"Timestamp unrecorded":dateFmt.format(time);}
function sourceMode(mode,time){const m=document.getElementById("data-mode");m.textContent=mode;m.style.color=mode==="DATABASE SNAPSHOT"?"var(--green)":"var(--amber)";document.getElementById("fresh-time").textContent=formatTime(time);}
function renderFreshness(){document.getElementById("market-saved-time").textContent=formatTime(marketSavedAt);document.getElementById("research-saved-time").textContent=formatTime(researchSavedAt);document.getElementById("price-cutoff").textContent=market&&market.marketAsOf?market.marketAsOf:"Price cutoff unverified";document.getElementById("feed-note").textContent="Saved research snapshots; prices and option references may be delayed. Database access does not mean live market quotes.";}
function marketStat(label,x){
  if(!x||!Number.isFinite(label==="VIX"?x.value:x.close)||(label==="VIX"?x.value:x.close)<=0)return'<div class="market-stat"><span>'+label+'</span><b>—</b><small class="flat">Unavailable</small></div>';
  const val=label==="VIX"?Number(x.value).toFixed(2):money.format(x.close);
  const move=Number.isFinite(x.dayChangePct)?x.dayChangePct:null;
  return'<div class="market-stat"><span>'+label+'</span><b>'+val+'</b><small class="'+(move>0?"up":move<0?"down":"flat")+'">'+fmtMove(move)+'</small></div>';
}
function planFor(t){return market&&market.candidatePlans?market.candidatePlans.find(x=>x.ticker===t):null}
function contractDelta(c){return Number.isFinite(c.delta)?c.delta:Number.isFinite(c.modeledDelta)?c.modeledDelta:null;}
function contractSpread(c){
  if(!Number.isFinite(c.bid)||!Number.isFinite(c.ask)||c.bid<=0||c.ask<c.bid)return null;
  return (c.ask-c.bid)/((c.ask+c.bid)/2);
}
function contractFor(t){
  const company=companyFor(t);
  if(!(market&&market.contractProfiles)||!company||!company.qualified)return null;
  return market.contractProfiles.filter(x=>{
    if(x.ticker!==t||!Number.isFinite(x.strike)||x.strike>=company.price)return false;
    const delta=Number.isFinite(x.delta)?x.delta:null;
    const spread=contractSpread(x);
    const iv=Number.isFinite(x.iv)?x.iv:Number.isFinite(x.impliedVolatility)?x.impliedVolatility:null;
    const freshness=String(x.sourceAsOf||"")+" "+String(x.deltaSource||"")+" "+String(x.classification||"");
    const currentVerified=!/historic|delayed|modeled|unverified|reference/i.test(freshness);
    return Number.isFinite(delta)&&delta>=MIN_CONTRACT_DELTA&&delta<=MAX_CONTRACT_DELTA&&
      Number.isFinite(x.openInterest)&&Number.isFinite(x.bid)&&Number.isFinite(x.ask)&&
      spread!==null&&spread<=0.05&&Number.isFinite(iv)&&currentVerified;
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
    '<p>'+safe(c.cash||c.fcfSummary||"Cash-flow commentary unavailable.")+'</p></div>';
}
function earningsQuality(c){
  const q=c.quarter||{},periods=(q.periods||[]).slice(0,4),eps=(q.eps||c.eps||[]),nyoy=q.nyoy||[];
  const surprises=Array.isArray(c.earningsSurprises)?c.earningsSurprises:[];
  const rows=periods.map((period,i)=>{
    const x=surprises[i]||{},cons=Number.isFinite(x.consensus)?money.format(x.consensus):"—";
    const actual=Number.isFinite(eps[i])?money.format(eps[i]):"—";
    const result=x.result?'<span class="surprise '+safe(String(x.result).toLowerCase())+'">'+safe(x.result)+'</span>':'<span class="surprise neutral">NOT STORED</span>';
    return '<tr><th scope="row">'+safe(period)+'</th><td>'+actual+'</td><td>'+(Number.isFinite(nyoy[i])?fmtMove(nyoy[i]):"—")+'</td><td>'+cons+'</td><td>'+result+'</td></tr>';
  }).join("");
  return '<div class="earnings-quality"><div class="mini-section-head"><h4>Earnings quality & surprise</h4><span>GAAP FIRST</span></div><div class="table-scroll"><table class="fundamental-table"><thead><tr><th>Quarter</th><th>GAAP EPS</th><th>Net income YoY</th><th>Consensus*</th><th>Result*</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="history-note">*Consensus surprise is shown only when the research snapshot explicitly stores the estimate basis. GAAP EPS is never compared against an adjusted-EPS consensus.</p></div>';
}
function rankMovement(c){
  if(!previousResearch||!Array.isArray(previousResearch.candidates))return '<span class="rank-move flat">FIRST</span>';
  const p=previousResearch.candidates.find(x=>x.ticker===c.ticker&&x.qualified);
  if(!p||!Number.isFinite(p.rank))return '<span class="rank-move new">NEW</span>';
  const d=p.rank-c.rank;
  if(d>0)return '<span class="rank-move up">↑'+d+'</span>';
  if(d<0)return '<span class="rank-move down">↓'+Math.abs(d)+'</span>';
  return '<span class="rank-move flat">—</span>';
}
function matchesFilter(c){
  const p=planFor(c.ticker)||{},a=normalizedStatus(p.action);
  if(activeFilter==="tier1")return Number(c.tier)===1;
  if(activeFilter==="tier2")return Number(c.tier)===2;
  if(activeFilter==="tier3")return Number(c.tier)===3;
  if(activeFilter==="support")return a.includes("NEAR SUPPORT")||actionTone(a)==="buy";
  if(activeFilter==="wait")return a.includes("WAIT")||a.includes("DO NOT");
  if(activeFilter==="contract")return Boolean(contractFor(c.ticker));
  return true;
}
function todayPriority(c){
  const a=normalizedStatus((planFor(c.ticker)||{}).action);
  if(actionTone(a)==="buy")return 0;
  if(a.includes("NEAR SUPPORT"))return 1;
  if(a.includes("WAIT FOR REVERSAL"))return 2;
  if(a==="WATCH")return 3;
  if(a.includes("DO NOT"))return 5;
  return 4;
}
function setupCard(c,compact){
  const p=planFor(c.ticker)||{},contract=contractFor(c.ticker),historical=historicalContractFor(c.ticker),action=p.action||"RESEARCH ONLY";
  const event=p.eventRisk?'<div class="event-note">⚠ '+safe(p.eventRisk)+'</div>':"";
  const ladder=(p.entry1||p.add2||p.finalAdd)?'<div class="entry-ladder"><div><span>'+safe(p.entry1Label||"1ST MAJOR SUPPORT")+' · 30%</span><b>'+safe(p.entry1||"—")+'</b></div><div><span>'+safe(p.add2Label||"2ND MAJOR SUPPORT")+' · 30%</span><b>'+safe(p.add2||"—")+'</b></div><div><span>'+safe(p.finalAddLabel||"FINAL DEEP SUPPORT")+' · 40%</span><b>'+safe(p.finalAdd||"—")+'</b></div></div>':"";
  const reasons=(p.entry1Reason||p.add2Reason||p.finalAddReason)?'<div class="support-reasons"><div><b>Why this is the 1st buy area</b><p>'+safe(p.entry1Reason||"—")+'</p></div><div><b>Why this is the 2nd buy area</b><p>'+safe(p.add2Reason||"—")+'</p></div><div><b>Why this is the final deep-buy area</b><p>'+safe(p.finalAddReason||"—")+'</p></div></div>':"";
  const vm=c.valuationModel&&c.valuationModel.targets?c.valuationModel.targets:null;
  const targetBlock=vm?'<div class="target-strip"><div><span>BEAR VALUE</span><b>'+money.format(vm.bear.blended)+'</b><small>Conservative case</small></div><div><span>BASE VALUE</span><b>'+money.format(vm.base.blended)+'</b><small>Central case</small></div><div><span>BULL VALUE</span><b>'+money.format(vm.bull.blended)+'</b><small>Strong execution</small></div></div>':"";
  const sector='<div class="sector-line"><span>'+safe(c.sector||"Sector N/A")+'</span><b>'+safe(c.industry||"")+'</b></div>';
  const sectorDetail=(c.sectorLongTermGood||c.sectorLongTermRisk)?'<div class="sector-box"><div><b>Sector tailwinds</b><p>'+safe((c.sectorLongTermGood||[]).join(" · "))+'</p></div><div><b>Sector risks</b><p>'+safe((c.sectorLongTermRisk||[]).join(" · "))+'</p></div></div>':"";
  const price=(p.price!=null?p.price:c.price);
  const rev=c.quarter&&c.quarter.revg&&c.quarter.revg[0]!=null?(Number(c.quarter.revg[0])>=0?"+":"")+Number(c.quarter.revg[0]).toFixed(1)+"%":"—";
  const contractSummary=contract?'<span class="contract-ready">VERIFIED ELIGIBLE</span>':historical?'<span class="contract-reference-only">HISTORICAL / VERIFY</span>':'<span class="contract-none">NO VERIFIED CONTRACT</span>';
  const optionBody=contract?contractCard(contract,true):'<section class="contract-pending"><p>No current contract has complete verified delta, IV, bid/ask and OI that passes the 0.60–0.75 delta / ≤5% spread rules.</p>'+(historical?'<div class="historical-reference"><b>Saved reference only</b><span>'+safe(historical.reference||"Historical chain reference")+'</span><small>'+safe(historical.sourceAsOf||"Timestamp unavailable")+'</small></div>':"")+'</section>';
  return '<article class="setup-card '+(actionTone(action)==="buy"?"actionable":"")+'" data-ticker="'+safe(c.ticker)+'">'+
    '<div class="setup-top"><div class="ticker-block"><div class="ticker-row"><span class="rank-badge">#'+safe(c.rank||"—")+'</span><span class="ticker">'+safe(c.ticker)+'</span><span class="score">'+c.score+'/100</span>'+rankMovement(c)+'</div><div class="company">'+safe(c.company)+'</div><span class="lane-tag">Tier '+safe(c.tier||"—")+' · '+safe(c.strategyLane||"Qualified")+'</span></div><span class="action '+actionTone(action)+'">'+safe(action)+'</span></div>'+sector+
    '<div class="setup-meta"><div><span>PRICE</span><b>'+money.format(price)+'</b><small>'+fmtMove(p.todayPct)+' today</small></div><div><span>DRAWDOWN</span><b class="down">−'+pct(c.drawdown)+'</b><small>52W high '+money.format(c.high)+'</small></div><div><span>REV. YOY</span><b class="up">'+rev+'</b><small>Latest quarter</small></div></div>'+
    qualificationGates(c)+
    '<p class="business-summary"><b>'+safe(c.netSummary)+'</b> · FCF '+safe(c.fcfSummary)+'<br>Technical: '+safe(p.technicalState||c.state||"Unverified")+' · '+contractSummary+'</p>'+
    '<div class="card-section-stack">'+
      '<details class="card-more" data-detail-key="entry:'+safe(c.ticker)+'"><summary>Entry plan & support <span>⌄</span></summary><div class="deep-detail">'+ladder+reasons+'<p class="confirm"><b>Confirmation:</b> '+safe(p.confirmation||"Wait for support + intact thesis + price confirmation.")+'</p>'+event+'</div></details>'+
      '<details class="card-more" data-detail-key="fundamentals:'+safe(c.ticker)+'"><summary>Fundamentals & cash flow <span>⌄</span></summary><div class="deep-detail">'+cashFlowPanel(c)+earningsQuality(c)+sectorDetail+fundamentalDetails(c)+'</div></details>'+
      '<details class="card-more" data-detail-key="valuation:'+safe(c.ticker)+'"><summary>Valuation & thesis <span>⌄</span></summary><div class="deep-detail">'+targetBlock+'<p><b>Why down:</b> '+safe(c.down||"—")+'</p><p><b>Valuation:</b> '+safe(c.valuation||"—")+'</p><p><b>Moat:</b> '+safe(c.moat||"—")+'</p><p><b>Prior-high reference:</b> '+safe(c.recovery||"—")+'</p><p><b>Invalidation:</b> '+safe(c.invalidation||"—")+'</p></div></details>'+
      '<details class="contract-panel" data-detail-key="contract-panel:'+safe(c.ticker)+'"><summary><span class="contract-panel-title">LEAP contract<small>'+safe(contract?contract.reference||"Verified candidate":historical?"Historical reference only":"Awaiting verified chain")+'</small></span><span class="contract-panel-toggle">⌄</span></summary><div class="contract-panel-body">'+optionBody+'</div></details>'+
    '</div>'+
  '</article>';
}
function renderDesk(){
  const state=market&&market.marketState?market.marketState:"UNAVAILABLE";
  document.getElementById("market-state").textContent=state;
  const trig=document.getElementById("trigger-pill");
  trig.textContent=market&&market.triggered?"DIP TRIGGER ACTIVE":"NO DIP TRIGGER";
  trig.className="state-pill "+(market&&market.triggered?"hot":"good");
  document.getElementById("market-message").textContent=market&&market.message?market.message:"No current market message.";
  document.getElementById("market-grid").innerHTML=marketStat("SPY",market&&market.market?market.market.spy:null)+marketStat("QQQ",market&&market.market?market.market.qqq:null)+marketStat("VIX",market&&market.market?market.market.vix:null);

  const allCards=((research&&research.candidates)||[]).filter(c=>c.qualified).sort((a,b)=>{
    const ar=Number.isFinite(a.rank)?a.rank:Infinity,br=Number.isFinite(b.rank)?b.rank:Infinity;
    return ar-br||b.score-a.score||String(a.ticker).localeCompare(String(b.ticker));
  });
  const visible=allCards.filter(matchesFilter);
  document.getElementById("top-setups").innerHTML=visible.length?visible.map(c=>setupCard(c,false)).join(""):'<div class="loading">No qualified setups match this filter.</div>';
  const count=document.getElementById("filter-count");if(count)count.textContent=visible.length+" of "+allCards.length;
  document.querySelectorAll("[data-filter]").forEach(b=>b.classList.toggle("active",b.dataset.filter===activeFilter));

  const actions=allCards.map(c=>normalizedStatus((planFor(c.ticker)||{}).action));
  const buyCount=actions.filter(a=>actionTone(a)==="buy").length;
  const supportCount=actions.filter(a=>a.includes("NEAR SUPPORT")).length;
  const waitCount=actions.filter(a=>a.includes("WAIT")).length;
  const stopCount=actions.filter(a=>a.includes("DO NOT")).length;
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set("decision-buy",buyCount);set("decision-support",supportCount);set("decision-wait",waitCount);set("decision-stop",stopCount);
  const today=allCards.slice().sort((a,b)=>todayPriority(a)-todayPriority(b)||a.rank-b.rank).slice(0,3);
  const topToday=document.getElementById("decision-top3");
  if(topToday)topToday.innerHTML=today.map(c=>'<span><b>#'+safe(c.rank)+' '+safe(c.ticker)+'</b><small>'+safe((planFor(c.ticker)||{}).action||"RESEARCH ONLY")+'</small></span>').join("");

  const f=(research&&research.researchFunnel)||{};
  set("coverage-universe",f.universeScanned==null?"—":Number(f.universeScanned).toLocaleString());
  set("coverage-qualified",f.qualifiedCount==null?allCards.length:Number(f.qualifiedCount).toLocaleString());
  set("coverage-actionable",buyCount.toLocaleString());
  set("coverage-reviewed",f.deepReviewCount==null?"—":Number(f.deepReviewCount).toLocaleString());
  const note=document.getElementById("coverage-note");if(note)note.textContent=f.universeDefinition||"Coverage details unavailable.";
  const rejected=(research&&research.rejected)||[];
  const re=document.getElementById("coverage-rejections");
  if(re)re.innerHTML=rejected.length?'<details class="card-more" data-detail-key="rejected"><summary>Reviewed · '+rejected.length+' not qualified ⌄</summary><div class="deep-detail">'+rejected.map(x=>'<p><b>'+safe(x.ticker)+':</b> '+safe(x.reason)+'</p>').join("")+'</div></details>':"";
}
function contractCard(c,embedded=false){
  const readiness=c.approval||c.readiness||"VERIFY LIVE";
  const tone=normalizedStatus(readiness).includes("REFERENCE ONLY")?"reference":readinessTone(readiness);
  const status=tone==="good"?"Verified contract":tone==="bad"?"Not approved":"Live check required";
  const company=companyFor(c.ticker);
  const ft=c.fundamentalTargets||{},em=c.expirationMoneyness||{};
  const cost=Number.isFinite(c.costPerContract)?c.costPerContract:(Number.isFinite(c.ask)?c.ask*100:null);
  const deltaValue=contractDelta(c);
  const delta=Number.isFinite(deltaValue)?(Number.isFinite(c.delta)?"":"~")+deltaValue.toFixed(2):"—";
  const spread=contractSpread(c);
  const iv=Number.isFinite(c.modeledIV)?(c.modeledIV*100).toFixed(1)+"%":"—";
  const expiry=new Date(String(c.expiration||"")+"T12:00:00Z");
  const expiryText=Number.isNaN(expiry.getTime())?"Expiration unverified":new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(expiry);
  const reference=Number.isFinite(c.strike)?expiryText+" · "+money.format(c.strike)+" call":c.reference||"Contract reference unavailable";
  const horizon=String(c.preferredHorizonStatus||"");
  const horizonText=horizon.includes("SHORTER")?"Shorter than the preferred 18-month horizon":horizon.replace(/_/g," ").toLowerCase();
  const oiText=Number.isFinite(c.openInterest)?Number(c.openInterest).toLocaleString():"—";
  const oiNote=Number.isFinite(c.openInterest)?c.openInterest<100?"Below preferred 100 contracts":"Delayed reference · verify live":"Live verification needed";
  const rows=[['Bear','Conservative',ft.bear,em.bear],['Base','Central estimate',ft.base,em.base],['Bull','Strong execution',ft.bull,em.bull]].map(([label,note,value,moneyness])=>'<tr><th scope="row"><b>'+label+'</b><small>'+note+'</small></th><td>'+(Number.isFinite(value)?money.format(value):"—")+'</td><td><span class="scenario-state">'+safe(moneyness||"Unverified")+'</span></td></tr>').join("");
  const tag=embedded?"section":"article";
  return '<'+tag+' class="contract-card contract-card-v12'+(embedded?" embedded-contract":"")+'" aria-label="'+safe(c.ticker)+' LEAP contract reference">'+
    '<header class="contract-card-head"><div class="contract-identity"><span class="contract-eyebrow">OPTION REFERENCE</span><div class="contract-title">'+(embedded?'<h4>LEAP call</h4>':'<h3>'+safe(c.ticker)+'</h3><span>'+safe(company&&company.company||"")+'</span>')+'</div></div><span class="readiness '+tone+'"><i aria-hidden="true"></i>'+status+'</span></header>'+
    '<div class="contract-reference">'+safe(reference)+'</div>'+(horizonText?'<p class="contract-horizon">'+safe(horizonText)+'</p>':"")+'<p class="reference-cutoff">'+safe(c.sourceAsOf||"Reference feed timestamp unavailable; verify the current chain.")+'</p>'+
    '<div class="contract-price-panel"><div><span>Cost per contract</span><strong>'+(Number.isFinite(cost)?money.format(cost):"—")+'</strong><small>Reference ask × 100 shares</small></div><div><span>Expiration breakeven</span><strong>'+(Number.isFinite(c.breakeven)?money.format(c.breakeven):"—")+'</strong><small>Underlying price to cover premium</small></div></div>'+
    '<dl class="contract-facts"><div><dt>Delta <span>'+(Number.isFinite(c.delta)?"reported":"modeled")+'</span></dt><dd>'+delta+'</dd><small>Stock-price sensitivity · verify live</small></div><div><dt>Open interest</dt><dd>'+oiText+'</dd><small>'+oiNote+'</small></div><div><dt>Bid/ask spread</dt><dd>'+(Number.isFinite(spread)?pct(spread):"—")+'</dd><small>'+(Number.isFinite(spread)?"Percent of midpoint · verify live":"Bid/ask not recorded; ranking provisional")+'</small></div><div><dt>Ask per share</dt><dd>'+(Number.isFinite(c.ask)?money.format(c.ask):"—")+'</dd><small>Delayed premium reference</small></div><div><dt>Implied volatility <span>modeled</span></dt><dd>'+iv+'</dd><small>Estimate; verify the live chain</small></div></dl><p class="contract-screen-note">0.60–0.75 delta · no price cap. Highest open interest first; tightest spread breaks ties. '+(spread===null?"This snapshot cannot confirm the liquidity winner.":"Compare current quotes before entry.")+'</p>'+
    '<section class="contract-scenarios" aria-label="Estimated underlying value at expiration"><div class="contract-section-heading"><h4>Value at expiration</h4><span>Underlying stock · estimates</span></div><table class="scenario-table"><thead><tr><th scope="col">Scenario</th><th scope="col">Stock value</th><th scope="col">Call status</th></tr></thead><tbody>'+rows+'</tbody></table><p class="scenario-footnote">'+safe(em.coverage||"Scenario coverage unverified")+'. ITM does not mean profitable; compare stock value with breakeven.</p></section>'+
    '<section class="contract-rationale"><h4>Selection rationale</h4><p>'+safe(c.selectionReason||c.note||"No selection rationale recorded. Verify the live chain before entry.")+'</p></section>'+
    '<details class="contract-more" data-detail-key="contract:'+safe(c.ticker)+'"><summary>Contract details & verification <span aria-hidden="true">+</span></summary><div class="contract-more-body"><dl class="contract-detail-facts"><div><dt>Stock above strike</dt><dd>'+(Number.isFinite(c.stockAboveStrike)?money.format(c.stockAboveStrike):"—")+'</dd></div><div><dt>Intrinsic value / share</dt><dd>'+(Number.isFinite(c.currentIntrinsic)?money.format(c.currentIntrinsic):"—")+'</dd></div><div><dt>Extrinsic value / share</dt><dd>'+(Number.isFinite(c.currentExtrinsic)?money.format(c.currentExtrinsic):"—")+'</dd></div></dl><p><b>Verification status:</b> '+safe(readiness)+'</p><p><b>Target profile:</b> 18–30 months preferred · 0.60–0.75 delta · ITM</p><p><b>Selection rule:</b> '+safe(CONTRACT_SELECTION_RULE)+'</p><p><b>Greek source:</b> '+safe(c.deltaSource||"Live delta required.")+'</p><p>Valuation scenarios are estimates, not probabilities or guarantees. Liquidity, bid/ask spread, IV and open interest need live verification.</p>'+(c.source?'<a class="source-link" href="'+safe(c.source)+'" target="_blank" rel="noopener">View delayed chain source ↗</a>':"")+'</div></details></'+tag+'>';
}
function renderAll(){const openKeys=new Set(Array.from(document.querySelectorAll("details[data-detail-key][open]")).map(e=>e.dataset.detailKey));renderDesk();renderFreshness();document.querySelectorAll("details[data-detail-key]").forEach(e=>{e.open=openKeys.has(e.dataset.detailKey);});}

async function load(){
  try{
    const results=await Promise.all([
      sb("leap_scans","select=payload,scan_time&order=scan_time.desc&limit=1"),
      sb("leap_research_snapshots","select=payload,snapshot_time&order=snapshot_time.desc&limit=2")
    ]);
    const scans=results[0],res=results[1];
    if(scans&&scans[0]&&scans[0].payload){market=scans[0].payload;marketSavedAt=scans[0].scan_time;marketFromDatabase=true;}
    if(res&&res[0]&&res[0].payload){research=res[0].payload;researchSavedAt=res[0].snapshot_time;previousResearch=res[1]&&res[1].payload?res[1].payload:null;researchFromDatabase=true;}
  }catch(e){console.info("Supabase fallback",e.message);}
  if(!research)research=await json("data/research-latest.json");
  if(!market)market=await json("data/market-latest.json");
  sourceMode(marketFromDatabase&&researchFromDatabase?"DATABASE SNAPSHOT":marketFromDatabase||researchFromDatabase?"MIXED SOURCES":"DATED FALLBACK",marketSavedAt);
  renderAll();
}
load().catch(e=>{console.error(e);sourceMode("LOAD ERROR");toast("Data could not load");});
async function pollLatest(){
  try{
    const [scans,snapshots]=await Promise.all([sb("leap_scans","select=payload,scan_time&order=scan_time.desc&limit=1"),sb("leap_research_snapshots","select=payload,snapshot_time&order=snapshot_time.desc&limit=2")]);
    let changed=false;
    if(scans&&scans[0]&&scans[0].payload){if(!marketFromDatabase||scans[0].scan_time!==marketSavedAt){market=scans[0].payload;marketSavedAt=scans[0].scan_time;changed=true;}marketFromDatabase=true;}
    if(snapshots&&snapshots[0]&&snapshots[0].payload){if(!researchFromDatabase||snapshots[0].snapshot_time!==researchSavedAt){research=snapshots[0].payload;researchSavedAt=snapshots[0].snapshot_time;previousResearch=snapshots[1]&&snapshots[1].payload?snapshots[1].payload:null;changed=true;}researchFromDatabase=true;}
    sourceMode(marketFromDatabase&&researchFromDatabase?"DATABASE SNAPSHOT":marketFromDatabase||researchFromDatabase?"MIXED SOURCES":"DATED FALLBACK",marketSavedAt);
    if(changed)renderAll();else renderFreshness();
  }catch(e){sourceMode("REFRESH UNAVAILABLE",marketSavedAt);document.getElementById("feed-note").textContent="Latest refresh unavailable. Showing the last saved snapshot; verify its price cutoff before acting.";}
}
setInterval(pollLatest,60000);

document.addEventListener("click",e=>{const b=e.target.closest("[data-filter]");if(!b)return;activeFilter=b.dataset.filter||"all";renderAll();});
