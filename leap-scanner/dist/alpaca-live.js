(() => {
  const SB_URL="https://ppsljqaaanpkksxbpalk.supabase.co";
  const SB_KEY="sb_publishable_2JLPa7GMpdacVfxBnfCv_w_wl36jn2n";
  const LIVE_API="https://leaps-alpaca-live-production.up.railway.app";
  const STORAGE_KEY="leaps-owner-auth";
  const POLL_MS=15000;
  const OPTIONS_POLL_MS=60000;
  const MAX_QUOTE_AGE_MS=300000;
  let session=null, timer=null, optionsTimer=null, liveQuotes={}, liveContracts={}, feed="iex", lastAsOf=null, liveState="off", liveError="", pollSerial=0, optionSerial=0;
  window.leapsOwnerQuotes={};
  window.leapsOwnerPriceState={active:false};
  window.leapsOwnerContracts={};
  window.leapsOwnerContractState={active:false};

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
    clearContracts();
    liveState="off";
    liveError="";
    stopPolling();
    stopOptionPolling();
    const panel=document.getElementById("alpaca-owner-panel");if(panel)panel.hidden=true;
    const toggle=document.getElementById("alpaca-owner-toggle");if(toggle)toggle.setAttribute("aria-expanded","false");
    updateUi();
  }
  function clearContracts(){
    optionSerial++;
    const had=Object.keys(liveContracts).length>0;
    liveContracts={};
    window.leapsOwnerContracts={};
    window.leapsOwnerContractState={active:false};
    if(had&&typeof window.renderAll==="function")window.renderAll();
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
    const now=Date.now(),fresh={};
    for(const symbol of required){
      const q=quotes[symbol],age=now-Date.parse(q?.observedAt||"");
      if(Number.isFinite(q?.price)&&q.price>0&&Number.isFinite(age)&&age>=0&&age<=MAX_QUOTE_AGE_MS)fresh[symbol]=q;
    }
    if(!Object.keys(fresh).length)throw new Error("No recent Alpaca trades; showing saved snapshot");
    liveQuotes=fresh;
    feed=payload?.feed||feed;
    lastAsOf=payload?.asOf||new Date().toISOString();
    window.leapsOwnerQuotes=fresh;
    window.leapsOwnerPriceState={active:true,feed,asOf:lastAsOf,count:Object.keys(fresh).length,total:required.length};
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
  async function pollOptions(){
    if(document.visibilityState==="hidden"||!session?.access_token)return;
    const serial=++optionSerial;
    try{
      session=await restoreSession();
      if(!session||serial!==optionSerial)return;
      const all=await qualifiedSymbols();
      const symbols=all.filter(s=>s!=="SPY"&&s!=="QQQ");
      if(!symbols.length){clearContracts();return;}
      const token=session.access_token;
      const r=await fetch(LIVE_API+"/options?symbols="+encodeURIComponent(symbols.join(",")),{headers:{Authorization:"Bearer "+token},cache:"no-store"});
      const payload=await r.json().catch(()=>({}));
      if(serial!==optionSerial||session?.access_token!==token||document.visibilityState==="hidden")return;
      if(r.status===401){clearSession();return;}
      if(!r.ok)throw new Error(payload.error||"Alpaca option screen failed");
      const next={};
      for(const symbol of symbols){
        const c=payload?.contracts?.[symbol]?.candidates?.[0];
        if(c)next[symbol]=c;
      }
      liveContracts=next;
      window.leapsOwnerContracts=next;
      window.leapsOwnerContractState={active:true,asOf:payload?.asOf||new Date().toISOString(),feed:payload?.optionsFeed||"indicative",count:Object.keys(next).length,total:symbols.length};
      if(typeof window.renderAll==="function")window.renderAll();
      decorate();
    }catch(e){
      window.leapsOwnerContractState={active:false,error:e?.message||"Option screen unavailable"};
    }
  }
  function stopOptionPolling(){if(optionsTimer)clearTimeout(optionsTimer);optionsTimer=null;}
  function scheduleOptions(){
    stopOptionPolling();
    if(!session?.access_token)return;
    optionsTimer=setTimeout(async()=>{await pollOptions();scheduleOptions();},OPTIONS_POLL_MS);
  }
  function stopPolling(){if(timer)clearTimeout(timer);timer=null;}

  function schedule(){
    stopPolling();
    if(!session?.access_token)return;
    timer=setTimeout(async()=>{await poll();schedule();},POLL_MS);
  }
  function setStatus(mode,message=""){
    const status=document.getElementById("alpaca-live-status");
    const toggle=document.getElementById("alpaca-owner-toggle");
    if(status){status.className="alpaca-live-status "+mode;status.title=mode==="error"?message:"";}
    if(mode==="live"){
      const age=lastAsOf?Math.max(0,Math.round((Date.now()-Date.parse(lastAsOf))/1000)):0;
      const state=window.leapsOwnerPriceState||{};
      if(status)status.textContent="ALPACA "+String(feed).toUpperCase()+" LIVE"+(state.count<state.total?" · "+state.count+"/"+state.total:"")+" · "+age+"s";
      if(toggle)toggle.textContent="● IEX LIVE"+(state.count<state.total?" "+state.count+"/"+state.total:"");
    }else if(mode==="error"){
      if(status)status.textContent="LIVE PRICE ERROR · SAVED SNAPSHOT";
      if(toggle)toggle.textContent="● PRICE PAUSED";
    }else if(mode==="ready"){
      if(status)status.textContent="OWNER MODE READY";
      if(toggle)toggle.textContent="● OWNER READY";
    }else{
      if(status)status.textContent="OWNER LIVE OFF";
      if(toggle)toggle.textContent="Owner sign in";
    }
    if(toggle){toggle.className="alpaca-owner-toggle "+mode;toggle.title=mode==="error"?message:"";}
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
        ?"Private stock and ETF prices. Sign in once; your session refreshes automatically."
        :liveState==="error"
          ?"Live quotes are unavailable. Saved prices are shown while automatic retries continue."
          :"Qualified stocks, SPY and QQQ refresh about every 15 seconds. LEAPS contracts are privately pre-screened from Alpaca about once per minute; current OI still requires independent verification.";
    }
    if(signed&&liveState==="live"&&lastAsOf&&Date.now()-Date.parse(lastAsOf)>45000){
      liveUnavailable("Quotes are stale; showing scheduled snapshot");
      return;
    }
    setStatus(signed?liveState:"off",liveError);
  }
  function injectUi(){
    if(document.getElementById("alpaca-owner-live"))return;
    const mount=document.getElementById("owner-mount");
    if(!mount)return;
    const section=document.createElement("section");
    section.id="alpaca-owner-live";
    section.className="alpaca-owner-menu";
    section.innerHTML='<button type="button" id="alpaca-owner-toggle" class="alpaca-owner-toggle off" aria-controls="alpaca-owner-panel" aria-expanded="false">Owner sign in</button><div id="alpaca-owner-panel" class="alpaca-owner-panel" hidden><div class="alpaca-live-head"><div><span class="kicker">OWNER ACCESS</span><h2>Private live prices</h2></div><span id="alpaca-live-status" class="alpaca-live-status off">OWNER LIVE OFF</span></div><p id="alpaca-live-description">Private stock and ETF prices. Sign in once; your session refreshes automatically.</p><form id="alpaca-signin-form" class="alpaca-signin"><input id="alpaca-email" type="email" autocomplete="email" placeholder="Email" required><input id="alpaca-password" type="password" autocomplete="current-password" placeholder="Password" required><button type="submit">Sign in</button><small id="alpaca-auth-note" role="alert"></small></form><div id="alpaca-live-controls" class="alpaca-live-controls" hidden><small>Automatic updates are on for this device.</small><button type="button" id="alpaca-signout">Sign out</button></div></div>';
    mount.appendChild(section);
    const panel=section.querySelector("#alpaca-owner-panel"),toggle=section.querySelector("#alpaca-owner-toggle");
    const close=()=>{panel.hidden=true;toggle.setAttribute("aria-expanded","false");};
    toggle.addEventListener("click",()=>{panel.hidden=!panel.hidden;toggle.setAttribute("aria-expanded",String(!panel.hidden));});
    document.addEventListener("click",e=>{if(!section.contains(e.target))close();});
    document.addEventListener("keydown",e=>{if(e.key==="Escape")close();});
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
        close();
        await Promise.all([poll(),pollOptions()]);
        schedule();
        scheduleOptions();
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
    if(session){await Promise.all([poll(),pollOptions()]);schedule();scheduleOptions();}
    window.addEventListener("focus",()=>{if(session){poll();pollOptions();schedule();scheduleOptions();}});
    document.addEventListener("visibilitychange",()=>{
      if(!session)return;
      if(document.visibilityState==="hidden"){
        pollSerial++;
        clearQuotes();
        clearContracts();
        liveState="ready";
        updateUi();
      }else{poll();pollOptions();schedule();scheduleOptions();}
    });
    setInterval(()=>{if(session&&lastAsOf)updateUi();},1000);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
