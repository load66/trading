const SB_URL="https://ppsljqaaanpkksxbpalk.supabase.co";
const SB_KEY="sb_publishable_2JLPa7GMpdacVfxBnfCv_w_wl36jn2n";
const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2});
const pct=n=>Number.isFinite(n)?(n*100).toFixed(1)+"%":"—";
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateFmt=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"});
let research=null,market=null;

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
function actionTone(a){a=String(a||"").toUpperCase();if(a.includes("BUY")||a.includes("ADD")||a.includes("HIGH-CONVICTION"))return"buy";if(a.includes("BROKEN")||a.includes("AVOID")||a.includes("DO NOT"))return"stop";return"watch";}
function actionRank(a){a=String(a||"").toUpperCase();if(a.includes("HIGH-CONVICTION"))return 0;if(a.includes("BUY ZONE"))return 1;if(a.includes("ADD ZONE"))return 2;if(a.includes("NEAR SUPPORT"))return 3;if(a.includes("WAIT FOR REVERSAL"))return 4;if(a.includes("WATCH"))return 5;return 6;}
function readinessTone(r){
  r=String(r||"").toUpperCase();
  if(r.includes("REJECT")||r.includes("POOR")||r.includes("FAILED"))return"bad";
  if((r.includes("APPROVED")&&!r.includes("NOT")&&!r.includes("REFERENCE"))||r.includes("STRONG LIQUIDITY"))return"good";
  return"reference";
}
function readinessLabel(r){
  const s=String(r||"").toUpperCase();
  if(s.includes("REFERENCE")||s.includes("VERIFY")||s.includes("WAIT"))return"REFERENCE · VERIFY LIVE";
  if(s.includes("APPROVED")&&!s.includes("NOT"))return"APPROVED";
  if(s.includes("REJECT")||s.includes("POOR")||s.includes("FAILED"))return"NOT SUITABLE";
  return"REVIEW LIVE";
}
function fmtMove(n){if(!Number.isFinite(n))return"—";return(n>=0?"+":"")+n.toFixed(2)+"%";}
function sourceMode(mode,time){const m=document.getElementById("data-mode");m.textContent=mode;m.style.color=mode==="LIVE DATA"?"var(--green)":"var(--amber)";document.getElementById("fresh-time").textContent=time?dateFmt.format(new Date(time)):"Dated snapshot";}
function marketStat(label,x){
  if(!x)return'<div class="market-stat"><span>'+label+'</span><b>—</b><small class="flat">Unavailable</small></div>';
  const val=label==="VIX"?Number(x.value).toFixed(2):money.format(x.close);
  const move=Number(x.dayChangePct);
  return'<div class="market-stat"><span>'+label+'</span><b>'+val+'</b><small class="'+(move>0?"up":move<0?"down":"flat")+'">'+fmtMove(move)+'</small></div>';
}
function planFor(t){return market&&market.candidatePlans?market.candidatePlans.find(x=>x.ticker===t):null}
function contractFor(t){return market&&market.contractProfiles?market.contractProfiles.find(x=>x.ticker===t):null}
function companyFor(t){return research&&research.candidates?research.candidates.find(x=>x.ticker===t):null}

function setupCard(c,compact){
  const p=planFor(c.ticker)||{};
  const contract=contractFor(c.ticker);
  const action=p.action||"RESEARCH ONLY";
  const event=p.eventRisk?'<div class="event-note">⚠ '+safe(p.eventRisk)+'</div>':"";
  const ladder=(p.entry1||p.add2||p.finalAdd)?'<div class="entry-ladder"><div><span>'+safe(p.entry1Label||"1ST MAJOR SUPPORT")+' · 30%</span><b>'+safe(p.entry1||"—")+'</b></div><div><span>'+safe(p.add2Label||"2ND MAJOR SUPPORT")+' · 30%</span><b>'+safe(p.add2||"—")+'</b></div><div><span>'+safe(p.finalAddLabel||"FINAL DEEP SUPPORT")+' · 40%</span><b>'+safe(p.finalAdd||"—")+'</b></div></div>':"";
  const reasons=(p.entry1Reason||p.add2Reason||p.finalAddReason)?'<div class="support-reasons"><div><b>Why this is the 1st buy area</b><p>'+safe(p.entry1Reason||"—")+'</p></div><div><b>Why this is the 2nd buy area</b><p>'+safe(p.add2Reason||"—")+'</p></div><div><b>Why this is the final deep-buy area</b><p>'+safe(p.finalAddReason||"—")+'</p></div></div>':"";
  const vm=c.valuationModel&&c.valuationModel.targets?c.valuationModel.targets:null;
  const targetBlock=vm?'<div class="target-strip"><div><span>BEAR VALUE</span><b>'+money.format(vm.bear.blended)+'</b><small>Conservative case</small></div><div><span>BASE VALUE</span><b>'+money.format(vm.base.blended)+'</b><small>Most reasonable case</small></div><div><span>BULL VALUE</span><b>'+money.format(vm.bull.blended)+'</b><small>Strong execution case</small></div></div>':"";
  const sector='<div class="sector-line"><span>'+safe(c.sector||"Sector N/A")+'</span><b>'+safe(c.industry||"")+'</b></div>';
  const sectorDetail=(c.sectorLongTermGood||c.sectorLongTermRisk)?'<div class="sector-box"><div><b>Sector tailwinds</b><p>'+safe((c.sectorLongTermGood||[]).join(" · "))+'</p></div><div><b>Sector risks</b><p>'+safe((c.sectorLongTermRisk||[]).join(" · "))+'</p></div></div>':"";
  const more=compact?sectorDetail:'<details class="card-more"><summary>Research details + thesis ⌄</summary><div class="deep-detail">'+sectorDetail+'<p><b>Why down:</b> '+safe(c.down)+'</p><p><b>Valuation:</b> '+safe(c.valuation)+'</p><p><b>Moat:</b> '+safe(c.moat)+'</p><p><b>Invalidation:</b> '+safe(c.invalidation)+'</p><p><b>Target method:</b> '+safe(c.valuationModel&&c.valuationModel.method?c.valuationModel.method:"Recompute after earnings.")+'</p><p><b>Contract:</b> '+safe(contract&&contract.reference?contract.reference:c.leapQuality||"Verify live chain")+' · '+safe(contract&&contract.approval?contract.approval:(contract&&contract.readiness?contract.readiness:c.optionNote||""))+'</p></div></details>';
  const price=(p.price!=null?p.price:c.price);
  const rev=c.quarter&&c.quarter.revg&&c.quarter.revg[0]!=null?"+"+Number(c.quarter.revg[0]).toFixed(1)+"%":"—";
  return'<article class="setup-card '+(actionTone(action)==="buy"?"actionable":"")+'">'+
    '<div class="setup-top"><div class="ticker-block"><div class="ticker-row"><span class="ticker">'+safe(c.ticker)+'</span><span class="score">'+c.score+'/100</span></div><div class="company">'+safe(c.company)+'</div><span class="lane-tag">'+safe(c.strategyLane||"Qualified")+'</span></div><span class="action '+actionTone(action)+'">'+safe(action)+'</span></div>'+sector+
    '<div class="setup-meta"><div><span>PRICE</span><b>'+money.format(price)+'</b></div><div><span>DRAWDOWN</span><b class="down">−'+pct(c.drawdown)+'</b></div><div><span>REV. YOY</span><b class="up">'+rev+'</b></div></div>'+
    targetBlock+ladder+reasons+'<p class="confirm"><b>Confirmation:</b> '+safe(p.confirmation||"Wait for support + intact thesis + price confirmation.")+'</p>'+event+more+
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
function contractCard(c){
  const readiness=c.approval||c.readiness||"VERIFY LIVE";
  const ft=c.fundamentalTargets||{};
  const em=c.expirationMoneyness||{};
  const stockAbove=Number.isFinite(c.stockAboveStrike)?money.format(c.stockAboveStrike):"—";
  const delta=Number.isFinite(c.modeledDelta)?"~"+c.modeledDelta.toFixed(2):"LIVE VERIFY";
  const iv=Number.isFinite(c.modeledIV)?(c.modeledIV*100).toFixed(1)+"%":"LIVE VERIFY";
  const intrinsic=Number.isFinite(c.currentIntrinsic)?money.format(c.currentIntrinsic):"—";
  const extrinsic=Number.isFinite(c.currentExtrinsic)?money.format(c.currentExtrinsic):"—";
  return'<article class="contract-card"><div class="contract-card-head"><div><h3>'+safe(c.ticker)+'</h3><div class="ref">'+safe(c.reference)+'</div><small class="contract-exp">'+safe(c.expiration||"Expiration verify")+' · '+safe(c.preferredHorizonStatus||"")+'</small></div><span class="readiness '+readinessTone(readiness)+'">'+safe(readinessLabel(readiness))+'</span></div>'+
  '<div class="beginner-note"><b>What matters most</b><span>We want a long-dated call that is already ITM, liquid enough to trade, and still likely to remain ITM even in our conservative valuation case.</span></div>'+
  '<div class="contract-metrics six"><div><span>DELTA</span><b>'+delta+'</b><small>Higher = more stock-like</small></div><div><span>OPEN INTEREST</span><b>'+(Number.isFinite(c.openInterest)?Number(c.openInterest).toLocaleString():"—")+'</b><small>More can mean better liquidity</small></div><div><span>ASK PRICE</span><b>'+(Number.isFinite(c.ask)?money.format(c.ask):"—")+'</b><small>Reference premium</small></div><div><span>COST / CONTRACT</span><b>'+(Number.isFinite(c.costPerContract)?money.format(c.costPerContract):"—")+'</b><small>Premium × 100 shares</small></div><div><span>BREAKEVEN</span><b>'+(Number.isFinite(c.breakeven)?money.format(c.breakeven):"—")+'</b><small>Needed at expiration to cover premium</small></div><div><span>MODELED IV</span><b>'+iv+'</b><small>Volatility estimate, not live</small></div></div>'+
  '<div class="itm-grid"><div><span>BEAR CASE · '+(em.bear||"—")+'</span><b>'+ (Number.isFinite(ft.bear)?money.format(ft.bear):"—") +'</b><small>Conservative business value</small></div><div><span>BASE CASE · '+(em.base||"—")+'</span><b>'+ (Number.isFinite(ft.base)?money.format(ft.base):"—") +'</b><small>Most reasonable value</small></div><div><span>BULL CASE · '+(em.bull||"—")+'</span><b>'+ (Number.isFinite(ft.bull)?money.format(ft.bull):"—") +'</b><small>Strong execution value</small></div></div>'+
  '<p class="coverage"><b>Expiration cushion:</b> '+safe(em.coverage||"Not modeled")+' <span>— more scenarios ITM is better.</span></p>'+
  '<div class="contract-reason"><b>Why this contract was chosen</b><p>'+safe(c.selectionReason||c.note||"Verify live chain before entry.")+'</p></div>'+
  '<details class="contract-more"><summary>More contract details</summary><div class="contract-more-body"><div class="contract-metrics three"><div><span>STOCK ABOVE STRIKE</span><b>'+stockAbove+'</b></div><div><span>INTRINSIC VALUE</span><b>'+intrinsic+'</b></div><div><span>EXTRINSIC VALUE</span><b>'+extrinsic+'</b></div></div><p><b>Target profile:</b> '+safe(c.preferred)+'</p><p><b>Selection rule:</b> '+safe(c.selectionRule||"Use verified 0.70–0.85 delta ITM contracts.")+'</p><p><b>Greek note:</b> '+safe(c.deltaSource||"Live delta required.")+'</p><a class="source-link" href="'+safe(c.source)+'" target="_blank" rel="noopener">Delayed chain source ↗</a></div></details></article>';
}
function renderContracts(){
  const qualified=new Set(((research&&research.candidates)||[]).filter(c=>c.qualified).map(c=>c.ticker));
  const list=((market&&market.contractProfiles)||[])
    .filter(c=>qualified.has(c.ticker))
    .sort((a,b)=>{
      const ca=companyFor(a.ticker),cb=companyFor(b.ticker);
      return (cb&&cb.score||0)-(ca&&ca.score||0);
    });
  document.getElementById("contract-list").innerHTML=list.length
    ?list.map(contractCard).join("")
    :'<div class="loading">No qualified-stock contract references are available yet.</div>';
}
function renderAll(){renderDesk();renderContracts();}

async function load(){
  let live=false,stamp=null;
  try{
    const results=await Promise.all([
      sb("leap_scans","select=payload,scan_time&order=scan_time.desc&limit=1"),
      sb("leap_research_snapshots","select=payload,snapshot_time&order=snapshot_time.desc&limit=1")
    ]);
    const scans=results[0],res=results[1];
    if(scans&&scans[0]&&scans[0].payload)market=scans[0].payload;
    if(res&&res[0]&&res[0].payload)research=res[0].payload;
    stamp=scans&&scans[0]?scans[0].scan_time:(res&&res[0]?res[0].snapshot_time:null);live=!!(market&&research);
  }catch(e){console.info("Supabase fallback",e.message);}
  if(!research)research=await json("data/research-latest.json");
  if(!market)market=await json("data/market-latest.json");
  sourceMode(live?"LIVE DATA":"DATED FALLBACK",stamp);
  renderAll();
}
load().catch(e=>{console.error(e);sourceMode("LOAD ERROR");toast("Data could not load");});
setInterval(async()=>{
  try{
    const rows=await sb("leap_scans","select=payload,scan_time&order=scan_time.desc&limit=1");
    if(rows&&rows[0]&&rows[0].payload){market=rows[0].payload;sourceMode("LIVE DATA",rows[0].scan_time);renderAll();}
  }catch(e){}
},60000);
