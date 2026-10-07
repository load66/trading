(() => {
  const SB_URL="https://ppsljqaaanpkksxbpalk.supabase.co";
  const SB_KEY="sb_publishable_2JLPa7GMpdacVfxBnfCv_w_wl36jn2n";
  const LIVE_API="https://leaps-alpaca-live-production.up.railway.app";
  const STORAGE_KEY="leaps-owner-auth";
  const POLL_MS=15000;
  let session=null, timer=null, liveQuotes={}, feed="iex", lastAsOf=null, liveState="off", liveError="", pollSerial=0;
  window.leapsOwnerQuotes={};
  window.leapsOwnerPriceState={active:false};

  function readSession(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");}catch{return null;}}
  function saveSession(s){
    const expiresAt=s.expires_at||Math.floor(Date.now()/1000)+Number(s.expires_in||3600);
    session={...s,expires_at:expiresAt};
    localStorage.setItem(STORAGE_KEY,JSON.stringify(session));
    return session;
  }
  function clearSession(){
    pollSerial++;
    session=null;
    localStorage.removeItem(STORAGE_KEY);
    clearQuotes();
    liveState="off";
    liveError="";
    stopPolling();
    updateUi();
  }
  function clearQuotes(){
    const hadQuotes=Object.keys(liveQuotes).length>0;
    liveQuotes={};
    window.leapsOwnerQuotes={};
    window.leapsOwnerPriceState={active:false};
    lastAsOf=null;
    if(hadQuotes&&typeof window.renderAll==="function")window.renderAll();
  }
  function liveUnavailable(message){
    clearQuotes();
    liveState="error";
    liveError=message;
    updateUi();
  }
  async function authRequest(path,body){
    const r=await fetch(SB_URL+"/auth/v1/"+path,{method:"POST",headers:{apikey:SB_KEY,"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
    const payload=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(payload.msg||payload.error_description||payload.error||"Authentication failed");
    return payload;
  }
  async function restoreSession(){
    session=readSession();
    if(!session?.access_token||!session?.refresh_token)return null;
    const now=Math.floor(Date.now()/1000);
    if(Number(session.expires_at||0)>now+180)return session;
    try{return saveSession(await authRequest("token?grant_type=refresh_token",{refresh_token:session.refresh_token}));}
    catch{clearSession();return null;}
  }
  async function signIn(email,password){
    return saveSession(await authRequest("token?grant_type=password",{email,password}));
  }
  async function qualifiedSymbols(){
    const r=await fetch(SB_URL+"/rest/v1/leap_research_snapshots?select=payload&order=snapshot_time.desc&limit=1",{headers:{apikey:SB_KEY},cache:"no-store"});
    if(!r.ok)throw new Error("Could not load qualified list");
    const rows=await r.json();
    const qualified=((rows[0]?.payload?.candidates)||[]).filter(c=>c.qualified).map(c=>c.ticker).filter(Boolean);
    return [...new Set([...qualified,"SPY","QQQ"])];
  }
  function decorate(){
    document.querySelectorAll(".setup-card[data-ticker]").forEach(card=>{
      const ticker=card.dataset.ticker,q=liveQuotes[ticker];
      if(!q||!Number.isFinite(q.price))return;
      const row=card.querySelector(".ticker-row");
      if(row&&!row.querySelector(".alpaca-live-badge")){
        const badge=document.createElement("span");
        badge.className="alpaca-live-badge";
        badge.textContent="ALPACA "+String(q.feed||feed).toUpperCase();
        row.appendChild(badge);
      }
    });
  }
  function applyQuotes(payload,required){
    const quotes=payload?.quotes||{};
    if(required.some(symbol=>!Number.isFinite(quotes[symbol]?.price)||quotes[symbol].price<=0))throw new Error("Incomplete owner quotes; showing saved snapshot");
    liveQuotes=quotes;
    feed=payload?.feed||feed;
    lastAsOf=payload?.asOf||new Date().toISOString();
    window.leapsOwnerQuotes=quotes;
    window.leapsOwnerPriceState={active:true,feed,asOf:lastAsOf};
    liveState="live";
    liveError="";
    if(typeof window.renderAll==="function")window.renderAll();
    decorate();
    updateUi();
  }
  async function poll(){
    if(document.visibilityState==="hidden"||!session?.access_token)return;
    const serial=++pollSerial;
    try{
      session=await restoreSession();
      if(!session||serial!==pollSerial)return;
      const symbols=await qualifiedSymbols();
      if(serial!==pollSerial||!session?.access_token||document.visibilityState==="hidden")return;
      if(!symbols.length){clearQuotes();liveState="ready";updateUi();return;}
      const requestToken=session.access_token;
      const batches=[];
      for(let i=0;i<symbols.length;i+=50)batches.push(symbols.slice(i,i+50));
      const responses=await Promise.all(batches.map(async batch=>{
        const r=await fetch(LIVE_API+"/quotes?symbols="+encodeURIComponent(batch.join(",")),{headers:{Authorization:"Bearer "+requestToken},cache:"no-store"});
        return {status:r.status,ok:r.ok,payload:await r.json().catch(()=>({}))};
      }));
      if(serial!==pollSerial||session?.access_token!==requestToken||document.visibilityState==="hidden")return;
      if(responses.some(r=>r.status===401)){clearSession();return;}
      const failed=responses.find(r=>!r.ok);
      if(failed)throw new Error(failed.payload.error||"Live quote request failed");
      applyQuotes({quotes:Object.assign({},...responses.map(r=>r.payload.quotes||{})),feed:responses[0]?.payload.feed,asOf:responses[0]?.payload.asOf},symbols);
    }catch(e){
      if(serial===pollSerial&&session?.access_token)liveUnavailable(e?.message||"Live price unavailable");
    }
  }
  function stopPolling(){if(timer)clearTimeout(timer);timer=null;}
  function schedule(){
    stopPolling();
    if(!session?.access_token)return;
    timer=setTimeout(async()=>{await poll();schedule();},POLL_MS);
  }
  function setStatus(mode,message=""){
    const status=document.getElementById("alpaca-live-status");
    if(!status)return;
    status.className="alpaca-live-status "+mode;
    status.title=mode==="error"?message:"";
    if(mode==="live"){
      const age=lastAsOf?Math.max(0,Math.round((Date.now()-Date.parse(lastAsOf))/1000)):0;
      status.textContent="ALPACA "+String(feed).toUpperCase()+" LIVE · "+age+"s";
    }else if(mode==="error")status.textContent="LIVE PRICE ERROR · SAVED SNAPSHOT";
    else if(mode==="ready")status.textContent="OWNER MODE READY";
    else status.textContent="OWNER LIVE OFF";
  }
  function updateUi(){
    const signed=Boolean(session?.access_token);
    const form=document.getElementById("alpaca-signin-form");
    const controls=document.getElementById("alpaca-live-controls");
    if(form){
      form.hidden=signed;
      form.style.display=signed?"none":"";
    }
    if(controls){
      controls.hidden=!signed;
      controls.style.display=signed?"flex":"none";
    }
    const desc=document.getElementById("alpaca-live-description");
    if(desc){
      desc.textContent=!signed
        ?"Sign in once on this device to enable private Alpaca live prices. Your saved owner session will refresh automatically afterward."
        :liveState==="error"
          ?"Live quotes are unavailable. Showing the saved market snapshot and retrying automatically."
          :"Owner Live Mode is active. Qualified-stock prices, SPY and QQQ refresh about every 15 seconds; support and entry status recalculate automatically. VIX, research and option references use the published snapshot.";
    }
    if(signed&&liveState==="live"&&lastAsOf&&Date.now()-Date.parse(lastAsOf)>45000){
      liveUnavailable("Quotes are stale; showing scheduled snapshot");
      return;
    }
    setStatus(signed?liveState:"off",liveError);
  }
  function injectUi(){
    if(document.getElementById("alpaca-owner-live"))return;
    const anchor=document.querySelector(".quick-guide")||document.getElementById("market");
    if(!anchor)return;
    const section=document.createElement("section");
    section.id="alpaca-owner-live";
    section.className="alpaca-owner-live";
    section.innerHTML='<div class="alpaca-live-head"><div><span class="kicker">OWNER LIVE PRICE MODE</span><h2>Alpaca price overlay</h2></div><span id="alpaca-live-status" class="alpaca-live-status off">OWNER LIVE OFF</span></div><p class="home-queue-note" id="alpaca-live-description">Sign in once on this device to enable private Alpaca live prices. Your saved owner session will refresh automatically afterward.</p><form id="alpaca-signin-form" class="alpaca-signin"><input id="alpaca-email" type="email" autocomplete="email" placeholder="Email" required><input id="alpaca-password" type="password" autocomplete="current-password" placeholder="Password" required><button type="submit">Sign in once</button><small id="alpaca-auth-note"></small></form><div id="alpaca-live-controls" class="alpaca-live-controls" hidden><small>Automatic mode is on. Alpaca refreshes qualified-stock prices about every 15 seconds whenever this page is open. Your saved owner session refreshes itself automatically.</small><button type="button" id="alpaca-signout">Sign out</button></div>';
    anchor.insertAdjacentElement("afterend",section);
    section.querySelector("#alpaca-signin-form").addEventListener("submit",async e=>{
      e.preventDefault();
      const note=section.querySelector("#alpaca-auth-note");
      note.textContent="Signing in…";
      try{
        await signIn(section.querySelector("#alpaca-email").value.trim(),section.querySelector("#alpaca-password").value);
        section.querySelector("#alpaca-password").value="";
        note.textContent="";
        liveState="ready";
        updateUi();
        await poll();
        schedule();
      }catch(err){note.textContent=err?.message||"Sign in failed";}
    });
    section.querySelector("#alpaca-signout").addEventListener("click",clearSession);
    updateUi();
  }
  async function boot(){
    injectUi();
    session=await restoreSession();
    if(session)liveState="ready";
    updateUi();
    if(session){await poll();schedule();}
    window.addEventListener("focus",()=>{if(session){poll();schedule();}});
    document.addEventListener("visibilitychange",()=>{
      if(!session)return;
      if(document.visibilityState==="hidden"){
        pollSerial++;
        clearQuotes();
        liveState="ready";
        updateUi();
      }else{poll();schedule();}
    });
    setInterval(()=>{if(session&&lastAsOf)updateUi();},1000);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
