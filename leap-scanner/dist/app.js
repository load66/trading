const SB_URL="https://ppsljqaaanpkksxbpalk.supabase.co";
const SB_KEY="sb_publishable_2JLPa7GMpdacVfxBnfCv_w_wl36jn2n";
const MAX_CONTRACT_COST=6500;
const MIN_CONTRACT_DELTA=0.60;
const MAX_CONTRACT_DELTA=0.75;
const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2});
const pct=n=>Number.isFinite(n)?(n*100).toFixed(1)+"%":"—";
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateFmt=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit",timeZoneName:"short"});
let research=null,market=null,marketSavedAt=null,researchSavedAt=null,marketFromDatabase=false,researchFromDatabase=false;

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
function contractFor(t){
  if(!(market&&market.contractProfiles)||!(companyFor(t)&&companyFor(t).qualified))return null;
  return market.contractProfiles.find(x=>{
    if(x.ticker!==t)return false;
    const cost=Number.isFinite(x.costPerContract)?x.costPerContract:(Number.isFinite(x.ask)?x.ask*100:null);
    const delta=Number(x.modeledDelta);
    return Number.isFinite(cost)&&cost<=MAX_CONTRACT_COST&&Number.isFinite(delta)&&delta>=MIN_CONTRACT_DELTA&&delta<=MAX_CONTRACT_DELTA;
  })||null;
}
function companyFor(t){return research&&research.candidates?research.candidates.find(x=>x.ticker===t):null}

function setupCard(c,compact){
  const p=planFor(c.ticker)||{};
  const contract=contractFor(c.ticker);
  const action=p.action||"RESEARCH ONLY";
  const optionBlock=contract?contractCard(contract,true):'<section class="contract-pending" aria-label="'+safe(c.ticker)+' LEAP contract pending"><h4>LEAP contract</h4><p>No eligible reference in this snapshot · $6,500 max · 0.60–0.75 delta. Live verification required.</p></section>';
  const event=p.eventRisk?'<div class="event-note">⚠ '+safe(p.eventRisk)+'</div>':"";
  const ladder=(p.entry1||p.add2||p.finalAdd)?'<div class="entry-ladder"><div><span>'+safe(p.entry1Label||"1ST MAJOR SUPPORT")+' · 30%</span><b>'+safe(p.entry1||"—")+'</b></div><div><span>'+safe(p.add2Label||"2ND MAJOR SUPPORT")+' · 30%</span><b>'+safe(p.add2||"—")+'</b></div><div><span>'+safe(p.finalAddLabel||"FINAL DEEP SUPPORT")+' · 40%</span><b>'+safe(p.finalAdd||"—")+'</b></div></div>':"";
  const reasons=(p.entry1Reason||p.add2Reason||p.finalAddReason)?'<div class="support-reasons"><div><b>Why this is the 1st buy area</b><p>'+safe(p.entry1Reason||"—")+'</p></div><div><b>Why this is the 2nd buy area</b><p>'+safe(p.add2Reason||"—")+'</p></div><div><b>Why this is the final deep-buy area</b><p>'+safe(p.finalAddReason||"—")+'</p></div></div>':"";
  const vm=c.valuationModel&&c.valuationModel.targets?c.valuationModel.targets:null;
  const targetBlock=vm?'<div class="target-strip"><div><span>BEAR VALUE</span><b>'+money.format(vm.bear.blended)+'</b><small>Conservative case</small></div><div><span>BASE VALUE</span><b>'+money.format(vm.base.blended)+'</b><small>Most reasonable case</small></div><div><span>BULL VALUE</span><b>'+money.format(vm.bull.blended)+'</b><small>Strong execution case</small></div></div>':"";
  const sector='<div class="sector-line"><span>'+safe(c.sector||"Sector N/A")+'</span><b>'+safe(c.industry||"")+'</b></div>';
  const sectorDetail=(c.sectorLongTermGood||c.sectorLongTermRisk)?'<div class="sector-box"><div><b>Sector tailwinds</b><p>'+safe((c.sectorLongTermGood||[]).join(" · "))+'</p></div><div><b>Sector risks</b><p>'+safe((c.sectorLongTermRisk||[]).join(" · "))+'</p></div></div>':"";
  const more=compact?sectorDetail:'<details class="card-more" data-detail-key="research:'+safe(c.ticker)+'"><summary>Research details + thesis ⌄</summary><div class="deep-detail">'+sectorDetail+'<p><b>Why down:</b> '+safe(c.down)+'</p><p><b>Valuation:</b> '+safe(c.valuation)+'</p><p><b>Moat:</b> '+safe(c.moat)+'</p><p><b>Invalidation:</b> '+safe(c.invalidation)+'</p><p><b>Target method:</b> '+safe(c.valuationModel&&c.valuationModel.method?c.valuationModel.method:"Recompute after earnings.")+'</p></div></details>';
  const price=(p.price!=null?p.price:c.price);
  const rev=c.quarter&&c.quarter.revg&&c.quarter.revg[0]!=null?"+"+Number(c.quarter.revg[0]).toFixed(1)+"%":"—";
  return'<article class="setup-card '+(actionTone(action)==="buy"?"actionable":"")+'">'+
    '<div class="setup-top"><div class="ticker-block"><div class="ticker-row"><span class="ticker">'+safe(c.ticker)+'</span><span class="score">'+c.score+'/100</span></div><div class="company">'+safe(c.company)+'</div><span class="lane-tag">'+safe(c.strategyLane||"Qualified")+'</span></div><span class="action '+actionTone(action)+'">'+safe(action)+'</span></div>'+sector+
    '<div class="setup-meta"><div><span>PRICE</span><b>'+money.format(price)+'</b></div><div><span>DRAWDOWN</span><b class="down">−'+pct(c.drawdown)+'</b></div><div><span>REV. YOY</span><b class="up">'+rev+'</b></div></div>'+
    targetBlock+ladder+reasons+'<p class="confirm"><b>Confirmation:</b> '+safe(p.confirmation||"Wait for support + intact thesis + price confirmation.")+'</p>'+event+more+optionBlock+
  '</article>';
}
function renderDesk(){
  const s=market&&market.marketState?market.marketState:"UNAVAILABLE";
  document.getElementById("market-state").textContent=s;
  const trig=document.getElementById("trigger-pill");
  trig.textContent=market&&market.triggered?"DIP TRIGGER ACTIVE":"NO DIP TRIGGER";
  trig.className="state-pill "+(market&&market.triggered?"hot":"good");
  document.getElementById("market-message").textContent=market&&market.message?market.message:"No current market message.";
  document.getElementById("market-grid").innerHTML=marketStat("SPY",market&&market.market?market.market.spy:null)+marketStat("QQQ",market&&market.market?market.market.qqq:null)+marketStat("VIX",market&&market.market?market.market.vix:null);

  const cards=((research&&research.candidates)||[]).filter(c=>c.qualified).sort((a,b)=>actionRank(planFor(a.ticker)&&planFor(a.ticker).action)-actionRank(planFor(b.ticker)&&planFor(b.ticker).action)||b.score-a.score);
  document.getElementById("top-setups").innerHTML=cards.length?cards.map(c=>setupCard(c,false)).join(""):'<div class="loading">No qualified setups are loaded.</div>';

  const f=(research&&research.researchFunnel)||{};
  const actionable=cards.filter(c=>actionTone(planFor(c.ticker)&&planFor(c.ticker).action)==="buy").length;
  const universe=document.getElementById("coverage-universe");
  const qualified=document.getElementById("coverage-qualified");
  const actionEl=document.getElementById("coverage-actionable");
  if(universe)universe.textContent=f.universeScanned==null?"—":Number(f.universeScanned).toLocaleString();
  if(qualified)qualified.textContent=f.qualifiedCount==null?cards.length:Number(f.qualifiedCount).toLocaleString();
  if(actionEl)actionEl.textContent=actionable.toLocaleString();
}
function contractCard(c,embedded=false){
  const readiness=c.approval||c.readiness||"VERIFY LIVE";
  const tone=normalizedStatus(readiness).includes("REFERENCE ONLY")?"reference":readinessTone(readiness);
  const status=tone==="good"?"Verified contract":tone==="bad"?"Not approved":"Live check required";
  const company=companyFor(c.ticker);
  const ft=c.fundamentalTargets||{},em=c.expirationMoneyness||{};
  const cost=Number.isFinite(c.costPerContract)?c.costPerContract:(Number.isFinite(c.ask)?c.ask*100:null);
  const delta=Number.isFinite(c.modeledDelta)?"~"+c.modeledDelta.toFixed(2):"—";
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
    '<div class="contract-reference">'+safe(reference)+'</div>'+(horizonText?'<p class="contract-horizon">'+safe(horizonText)+'</p>':"")+
    '<div class="contract-price-panel"><div><span>Cost per contract</span><strong>'+(Number.isFinite(cost)?money.format(cost):"—")+'</strong><small>Reference ask × 100 shares</small></div><div><span>Expiration breakeven</span><strong>'+(Number.isFinite(c.breakeven)?money.format(c.breakeven):"—")+'</strong><small>Underlying price to cover premium</small></div></div>'+
    '<dl class="contract-facts"><div><dt>Delta <span>modeled</span></dt><dd>'+delta+'</dd><small>Estimated stock-price sensitivity</small></div><div><dt>Open interest</dt><dd>'+oiText+'</dd><small>'+oiNote+'</small></div><div><dt>Ask per share</dt><dd>'+(Number.isFinite(c.ask)?money.format(c.ask):"—")+'</dd><small>Delayed premium reference</small></div><div><dt>Implied volatility <span>modeled</span></dt><dd>'+iv+'</dd><small>Estimate; verify the live chain</small></div></dl>'+
    '<section class="contract-scenarios" aria-label="Estimated underlying value at expiration"><div class="contract-section-heading"><h4>Value at expiration</h4><span>Underlying stock · estimates</span></div><table class="scenario-table"><thead><tr><th scope="col">Scenario</th><th scope="col">Stock value</th><th scope="col">Call status</th></tr></thead><tbody>'+rows+'</tbody></table><p class="scenario-footnote">'+safe(em.coverage||"Scenario coverage unverified")+'. ITM does not mean profitable; compare stock value with breakeven.</p></section>'+
    '<section class="contract-rationale"><h4>Selection rationale</h4><p>'+safe(c.selectionReason||c.note||"No selection rationale recorded. Verify the live chain before entry.")+'</p></section>'+
    '<details class="contract-more" data-detail-key="contract:'+safe(c.ticker)+'"><summary>Contract details & verification <span aria-hidden="true">+</span></summary><div class="contract-more-body"><dl class="contract-detail-facts"><div><dt>Stock above strike</dt><dd>'+(Number.isFinite(c.stockAboveStrike)?money.format(c.stockAboveStrike):"—")+'</dd></div><div><dt>Intrinsic value / share</dt><dd>'+(Number.isFinite(c.currentIntrinsic)?money.format(c.currentIntrinsic):"—")+'</dd></div><div><dt>Extrinsic value / share</dt><dd>'+(Number.isFinite(c.currentExtrinsic)?money.format(c.currentExtrinsic):"—")+'</dd></div></dl><p><b>Verification status:</b> '+safe(readiness)+'</p><p><b>Target profile:</b> '+safe(c.preferred)+'</p><p><b>Selection rule:</b> '+safe(c.selectionRule||"Use verified 0.70–0.75 delta ITM contracts.")+'</p><p><b>Greek source:</b> '+safe(c.deltaSource||"Live delta required.")+'</p><p>Valuation scenarios are estimates, not probabilities or guarantees. Liquidity, bid/ask spread, IV and open interest need live verification.</p>'+(c.source?'<a class="source-link" href="'+safe(c.source)+'" target="_blank" rel="noopener">View delayed chain source ↗</a>':"")+'</div></details></'+tag+'>';
}
function renderAll(){const openKeys=new Set(Array.from(document.querySelectorAll("details[data-detail-key][open]")).map(e=>e.dataset.detailKey));renderDesk();renderFreshness();document.querySelectorAll("details[data-detail-key]").forEach(e=>{e.open=openKeys.has(e.dataset.detailKey);});}

async function load(){
  try{
    const results=await Promise.all([
      sb("leap_scans","select=payload,scan_time&order=scan_time.desc&limit=1"),
      sb("leap_research_snapshots","select=payload,snapshot_time&order=snapshot_time.desc&limit=1")
    ]);
    const scans=results[0],res=results[1];
    if(scans&&scans[0]&&scans[0].payload){market=scans[0].payload;marketSavedAt=scans[0].scan_time;marketFromDatabase=true;}
    if(res&&res[0]&&res[0].payload){research=res[0].payload;researchSavedAt=res[0].snapshot_time;researchFromDatabase=true;}
  }catch(e){console.info("Supabase fallback",e.message);}
  if(!research)research=await json("data/research-latest.json");
  if(!market)market=await json("data/market-latest.json");
  sourceMode(marketFromDatabase&&researchFromDatabase?"DATABASE SNAPSHOT":marketFromDatabase||researchFromDatabase?"MIXED SOURCES":"DATED FALLBACK",marketSavedAt);
  renderAll();
}
load().catch(e=>{console.error(e);sourceMode("LOAD ERROR");toast("Data could not load");});
async function pollLatest(){
  try{
    const [scans,snapshots]=await Promise.all([sb("leap_scans","select=payload,scan_time&order=scan_time.desc&limit=1"),sb("leap_research_snapshots","select=payload,snapshot_time&order=snapshot_time.desc&limit=1")]);
    let changed=false;
    if(scans&&scans[0]&&scans[0].payload){if(!marketFromDatabase||scans[0].scan_time!==marketSavedAt){market=scans[0].payload;marketSavedAt=scans[0].scan_time;changed=true;}marketFromDatabase=true;}
    if(snapshots&&snapshots[0]&&snapshots[0].payload){if(!researchFromDatabase||snapshots[0].snapshot_time!==researchSavedAt){research=snapshots[0].payload;researchSavedAt=snapshots[0].snapshot_time;changed=true;}researchFromDatabase=true;}
    sourceMode(marketFromDatabase&&researchFromDatabase?"DATABASE SNAPSHOT":marketFromDatabase||researchFromDatabase?"MIXED SOURCES":"DATED FALLBACK",marketSavedAt);
    if(changed)renderAll();else renderFreshness();
  }catch(e){sourceMode("REFRESH UNAVAILABLE",marketSavedAt);document.getElementById("feed-note").textContent="Latest refresh unavailable. Showing the last saved snapshot; verify its price cutoff before acting.";}
}
setInterval(pollLatest,60000);
