const SB_URL="https://ppsljqaaanpkksxbpalk.supabase.co";
const SB_KEY="sb_publishable_2JLPa7GMpdacVfxBnfCv_w_wl36jn2n";
const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2});
const pct=n=>Number.isFinite(n)?(n*100).toFixed(1)+"%":"—";
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateFmt=new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"});
let research=null,market=null,history=[],filter="all",researchStamp=null;

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
function readinessTone(r){r=String(r||"").toUpperCase();if(r.includes("NOT APPROVED")||r.includes("POOR"))return"bad";if(r.includes("GOOD")||r.includes("STRONG")||r.includes("READY"))return"good";return"watch";}
function fmtMove(n){if(!Number.isFinite(n))return"—";return(n>=0?"+":"")+n.toFixed(2)+"%";}
function sourceMode(mode,time){const m=document.getElementById("data-mode");m.textContent=mode;m.style.color=mode==="LIVE DATA"?"var(--green)":"var(--amber)";document.getElementById("fresh-time").textContent=time?dateFmt.format(new Date(time)):"Dated snapshot";}
function nav(name){
  document.querySelectorAll(".screen").forEach(x=>x.classList.toggle("on",x.id==="screen-"+name));
  document.querySelectorAll(".nav-btn").forEach(x=>x.classList.toggle("on",x.dataset.screen===name));
  window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.screen)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>nav(b.dataset.go)));
document.querySelectorAll(".filter").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;document.querySelectorAll(".filter").forEach(x=>x.classList.toggle("on",x===b));renderSetups();}));

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
  const ladder=(p.entry1||p.add2||p.finalAdd)?'<div class="entry-ladder"><div><span>ENTRY 1 · 30%</span><b>'+safe(p.entry1||"—")+'</b></div><div><span>ADD 2 · 30%</span><b>'+safe(p.add2||"—")+'</b></div><div><span>FINAL · 40%</span><b>'+safe(p.finalAdd||"—")+'</b></div></div>':"";
  const more=compact?"":'<details class="card-more"><summary>Research details + thesis ⌄</summary><div class="deep-detail"><p><b>Why down:</b> '+safe(c.down)+'</p><p><b>Valuation:</b> '+safe(c.valuation)+'</p><p><b>Moat:</b> '+safe(c.moat)+'</p><p><b>Invalidation:</b> '+safe(c.invalidation)+'</p><p><b>Contract:</b> '+safe(contract&&contract.reference?contract.reference:c.leapQuality||"Verify live chain")+' · '+safe(contract&&contract.readiness?contract.readiness:c.optionNote||"")+'</p></div></details>';
  const price=(p.price!=null?p.price:c.price);
  const rev=c.quarter&&c.quarter.revg&&c.quarter.revg[0]!=null?"+"+Number(c.quarter.revg[0]).toFixed(1)+"%":"—";
  return'<article class="setup-card '+(actionTone(action)==="buy"?"actionable":"")+'">'+
    '<div class="setup-top"><div class="ticker-block"><div class="ticker-row"><span class="ticker">'+safe(c.ticker)+'</span><span class="score">'+c.score+'/100</span></div><div class="company">'+safe(c.company)+'</div><span class="lane-tag">'+safe(c.strategyLane||"Qualified")+'</span></div><span class="action '+actionTone(action)+'">'+safe(action)+'</span></div>'+
    '<div class="setup-meta"><div><span>PRICE</span><b>'+money.format(price)+'</b></div><div><span>DRAWDOWN</span><b class="down">−'+pct(c.drawdown)+'</b></div><div><span>REV. YOY</span><b class="up">'+rev+'</b></div></div>'+
    ladder+'<p class="confirm"><b>Confirmation:</b> '+safe(p.confirmation||"Wait for support + intact thesis + price confirmation.")+'</p>'+event+more+
  '</article>';
}
function renderDesk(){
  const s=market&&market.marketState?market.marketState:"UNAVAILABLE";
  document.getElementById("market-state").textContent=s;
  const trig=document.getElementById("trigger-pill");trig.textContent=market&&market.triggered?"DIP TRIGGER ACTIVE":"NO DIP TRIGGER";trig.className="state-pill "+(market&&market.triggered?"hot":"good");
  document.getElementById("market-message").textContent=market&&market.message?market.message:"No current market message.";
  document.getElementById("market-grid").innerHTML=marketStat("SPY",market&&market.market?market.market.spy:null)+marketStat("QQQ",market&&market.market?market.market.qqq:null)+marketStat("VIX",market&&market.market?market.market.vix:null);
  const cards=((research&&research.candidates)||[]).filter(c=>c.qualified).sort((a,b)=>actionRank(planFor(a.ticker)&&planFor(a.ticker).action)-actionRank(planFor(b.ticker)&&planFor(b.ticker).action)||b.score-a.score);
  document.getElementById("top-setups").innerHTML=cards.length?cards.map(c=>setupCard(c,true)).join(""):'<div class="loading">No qualified setups are loaded.</div>';
}
function renderSetups(){
  let list=((research&&research.candidates)||[]).filter(c=>c.qualified);
  if(filter==="actionable")list=list.filter(c=>actionTone(planFor(c.ticker)&&planFor(c.ticker).action)==="buy");
  if(filter==="deep")list=list.filter(c=>String(c.strategyLane||"").toLowerCase().includes("deep"));
  if(filter==="compounder")list=list.filter(c=>String(c.strategyLane||"").toLowerCase().includes("compounder"));
  list.sort((a,b)=>actionRank(planFor(a.ticker)&&planFor(a.ticker).action)-actionRank(planFor(b.ticker)&&planFor(b.ticker).action)||b.score-a.score);
  document.getElementById("setup-list").innerHTML=list.length?list.map(c=>setupCard(c,false)).join(""):'<div class="loading">No setups match this filter.</div>';
}
function contractCard(c){
  const readiness=c.readiness||"VERIFY LIVE";
  return'<article class="contract-card"><div class="contract-card-head"><div><h3>'+safe(c.ticker)+'</h3><div class="ref">'+safe(c.reference)+'</div></div><span class="readiness '+readinessTone(readiness)+'">'+safe(readiness)+'</span></div>'+
  '<div class="contract-metrics"><div><span>ASK REF.</span><b>'+(Number.isFinite(c.ask)?money.format(c.ask):"—")+'</b></div><div><span>BREAKEVEN</span><b>'+(Number.isFinite(c.breakeven)?money.format(c.breakeven):"—")+'</b></div><div><span>OPEN INT.</span><b>'+(Number.isFinite(c.openInterest)?Number(c.openInterest).toLocaleString():"—")+'</b></div></div>'+
  '<p><b>Target profile:</b> '+safe(c.preferred)+'</p><p style="margin-top:7px">'+safe(c.note)+'</p><a class="source-link" href="'+safe(c.source)+'" target="_blank" rel="noopener">Delayed chain source ↗</a></article>';
}
function renderContracts(){const list=(market&&market.contractProfiles)||[];document.getElementById("contract-list").innerHTML=list.length?list.map(contractCard).join(""):'<div class="loading">No contract references loaded.</div>';}
function renderResearch(){
  const rt=document.getElementById("research-refresh-time");if(rt)rt.textContent=researchStamp?dateFmt.format(new Date(researchStamp)):(research&&research.asOf?research.asOf:"Dated snapshot");
  const r=(research&&research.rankings)||{};
  const map=[["BEST OVERALL",r.bestOverall],["HIGHEST BOUNCE",r.highestBounce],["SAFEST QUALITY",r.safestQuality]];
  document.getElementById("rankings").innerHTML=map.map(row=>'<div class="rank-card"><span>'+row[0]+'</span><b>'+((row[1]||[]).slice(0,8).map((t,i)=>(i+1)+". "+safe(t)).join(" · ")||"—")+'</b></div>').join("");
  document.getElementById("scan-history").innerHTML=history.length?history.slice(0,8).map(h=>'<div class="history-item"><div><b>'+safe(h.payload&&h.payload.marketState?h.payload.marketState:"SCAN")+'</b><p>'+safe(h.payload&&h.payload.message?h.payload.message:"Automated LEAPS update")+'</p></div><time>'+(h.scan_time?dateFmt.format(new Date(h.scan_time)):"—")+'</time></div>').join(""):'<div class="loading">No scan history yet.</div>';
  document.getElementById("rejected-list").innerHTML=((research&&research.rejected)||[]).map(x=>'<div class="reject"><b>'+safe(x.ticker)+'</b><p>'+safe(x.reason)+'</p></div>').join("")||"<p>No rejections loaded.</p>";
}
function renderAll(){renderDesk();renderSetups();renderContracts();renderResearch();}

async function load(){
  let live=false,stamp=null;
  try{
    const results=await Promise.all([
      sb("leap_scans","select=payload,scan_time&order=scan_time.desc&limit=12"),
      sb("leap_research_snapshots","select=payload,snapshot_time&order=snapshot_time.desc&limit=1")
    ]);
    const scans=results[0],res=results[1];
    if(scans&&scans[0]&&scans[0].payload)market=scans[0].payload;
    if(res&&res[0]&&res[0].payload){research=res[0].payload;researchStamp=res[0].snapshot_time||null;}
    history=scans||[];stamp=scans&&scans[0]?scans[0].scan_time:(res&&res[0]?res[0].snapshot_time:null);live=!!(market&&research);
  }catch(e){console.info("Supabase fallback",e.message);}
  if(!research){research=await json("data/research-latest.json");researchStamp=null;}
  if(!market)market=await json("data/market-latest.json");
  sourceMode(live?"LIVE DATA":"DATED FALLBACK",stamp);
  renderAll();
}
load().catch(e=>{console.error(e);sourceMode("LOAD ERROR");toast("Data could not load");});
setInterval(async()=>{
  try{
    const rows=await sb("leap_scans","select=payload,scan_time&order=scan_time.desc&limit=12");
    if(rows&&rows[0]&&rows[0].payload){market=rows[0].payload;history=rows;sourceMode("LIVE DATA",rows[0].scan_time);renderAll();}
  }catch(e){}
},60000);
