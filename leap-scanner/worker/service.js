'use strict';
// Railway long-running worker. STARTS DISABLED until owner supplies backend keys + audit adapter.
// Website remains separate. Browser never receives any service key.
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {makeRunner,scheduleDue}=require('../scripts/worker_runtime');
const runCommand=promisify(execFile);
const RUN_MS=19*60*1000,RETRY_MS=60*1000;
const enabled=process.env.LEAPS_WORKER_ENABLED==='true';
const env={
  supabase:process.env.SUPABASE_URL||'',
  key:process.env.SUPABASE_SERVICE_ROLE_KEY||'',
  adapter:process.env.LEAPS_RESEARCH_ADAPTER_URL||'',
  token:process.env.LEAPS_RESEARCH_ADAPTER_TOKEN||''
};
const missing=()=>[
  ...(!env.supabase?['SUPABASE_URL']:[]),
  ...(!env.key?['SUPABASE_SERVICE_ROLE_KEY']:[]),
  ...(!env.adapter?['LEAPS_RESEARCH_ADAPTER_URL']:[]),
  ...(!env.token?['LEAPS_RESEARCH_ADAPTER_TOKEN']:[])
];
let state={enabled,mode:enabled?(missing().length?'standby_missing_credentials':'ready'):'standby_disabled',missing:missing(),lastRun:null,lastError:null,startedAt:new Date().toISOString(),deadlineMinutes:19};
const log=(level,event,detail={})=>console.log(JSON.stringify({level,event,at:new Date().toISOString(),...detail}));
function safeURL(input){const u=new URL(input);if(u.protocol!=='https:')throw Error('Only HTTPS endpoint allowed');return u;}
async function httpJSON(url,{method='GET',body,headers={},attempts=2,timeoutMs=14000}={}){
  for(let attempt=0;attempt<attempts;attempt++){
    const signal=AbortSignal.timeout(timeoutMs);
    try{
      const response=await fetch(url,{method,headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal});
      const text=await response.text();
      if(!response.ok){
        const err=new Error('HTTP '+response.status+': '+text.slice(0,160));
        err.status=response.status;throw err;
      }
      return text?JSON.parse(text):null;
    }catch(e){
      if(attempt+1===attempts||!(e.name==='TimeoutError'||e.name==='AbortError'||[429,500,502,503,504].includes(e.status)))throw e;
      await new Promise(r=>setTimeout(r,Math.min(3000,600*(attempt+1))));
    }
  }
}
function db(endpoint,opts={}){
  return httpJSON(safeURL(env.supabase).origin+'/rest/v1/'+endpoint,{
    ...opts,headers:{apikey:env.key,Authorization:'Bearer '+env.key,Prefer:opts?.method==='POST'?'return=representation':'return=minimal',...(opts.headers||{})}
  });
}
function rpc(name,payload){return db('rpc/'+name,{method:'POST',body:payload});}
function adapter(method,body,signal){
  const url=safeURL(env.adapter);
  url.pathname=url.pathname.replace(/\/$/,'')+'/'+method;
  // Adapter must be a separately deployed privileged backend service with real licensed data integrations.
  return fetch(url,{method:'POST',headers:{Authorization:'Bearer '+env.token,'Content-Type':'application/json'},
    body:JSON.stringify(body),signal}).then(async response=>{
    const txt=await response.text();
    if(!response.ok)throw Error('Audit adapter '+method+' HTTP '+response.status+': '+txt.slice(0,150));
    return JSON.parse(txt);
  });
}
function tickerListFromRouting(row){
  const lanes=row?.result?.lanes||{};
  const tickers=Object.values(lanes).flatMap(x=>Array.isArray(x?.tickers)?x.tickers:[]);
  return [...new Set(tickers)];
}
async function currentRoute(run){
  const r=await db('leap_scan_checkpoints?run_id=eq.'+run.id+'&stage=eq.work_routing_v1&select=result&limit=1');
  if(r?.length){const tickers=tickerListFromRouting(r[0]);if(tickers.length)return tickers;}
  const discovered=await db('leap_scan_checkpoints?run_id=eq.'+run.id+'&stage=eq.worker_discovery&select=result&limit=1');
  const names=discovered?.[0]?.result?.selected;
  if(Array.isArray(names)&&names.length>=20&&names.length<=100)return names;
  throw Error('No compatible routed audit worklist; cannot start full scan');
}
async function saveDiscovery(run,data){
  if(data?.verified!==true||!data?.source||!Array.isArray(data.universe)||data.universe.length<150||
     !Array.isArray(data.selected)||data.selected.length<20||data.selected.length>100||
     new Set(data.universe).size!==data.universe.length||data.selected.some(t=>!data.universe.includes(t))){
    throw Error('Unverified broad discovery (must contain >=150 distinct stocks and 20-100 valid selected)');
  }
  await db('leap_scan_checkpoints',{method:'POST',body:{
    run_id:run.id,stage:'worker_discovery',batch_no:0,status:'completed',tickers:data.selected,
    result:{source:data.source,observedAt:new Date().toISOString(),universe:data.universe,selected:data.selected,verified:true},
    finished_at:new Date().toISOString()
  }});
  await db('leap_scan_runs?id=eq.'+run.id,{method:'PATCH',body:{universe_count:data.universe.length,stage:'auditing'}});
}
async function validatePair(research,market){
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'leaps-pair-'));
  try{
    const a=path.join(tmp,'research.json'),b=path.join(tmp,'market.json');
    await Promise.all([fs.writeFile(a,JSON.stringify(research),{mode:0o600}),fs.writeFile(b,JSON.stringify(market),{mode:0o600})]);
    await runCommand('python3',[path.resolve(__dirname,'../scripts/validate_publication.py'),a,b],{timeout:9000,maxBuffer:100000});
  }finally{await fs.rm(tmp,{recursive:true,force:true});}
}
async function publishPair(run,decisions){
  const generated=await adapter('prepare_publication',{runKey:run.run_key,decisions},AbortSignal.timeout(8000));
  if(!generated?.research||!generated?.market)throw Error('Missing complete research/market pair');
  await validatePair(generated.research,generated.market);
  // One SQL transaction + lease owner assertion prevents half-published research/market pairs.
  const result=await rpc('leaps_worker_publish_pair',{p_run_id:run.id,p_owner:owner,
    p_research:generated.research,p_market:generated.market});
  if(!result||!(Array.isArray(result)?result[0]:result)?.research_id)throw Error('Transactional publication unconfirmed');
  log('info','published_pair',{runId:run.id});
}
const owner='railway-'+process.pid+'-'+Math.random().toString(36).slice(2);
async function runOne(run){
  state.mode='running';state.lastRun={id:run.id,key:run.run_key,startedAt:new Date().toISOString()};
  log('info','claimed_run',{id:run.id,runKey:run.run_key});
  let heartbeat=null;
  try{
    let names;
    try{names=await currentRoute(run);}
    catch(e){
      if(run.stage!=='discovery')throw e;
      const discovery=await adapter('discover',{runKey:run.run_key,policyKey:run.metadata?.policyKey||'worker_v1'},AbortSignal.timeout(30000));
      await saveDiscovery(run,discovery);names=discovery.selected;
    }
    // Renew a short lease while processing; crashed deployments can safely resume after TTL.
    heartbeat=setInterval(()=>rpc('leaps_worker_renew',{p_run_id:run.id,p_owner:owner,p_lease_seconds:90}).catch(e=>{log('error','heartbeat_failed',{message:String(e.message).slice(0,120)});}),15000);
    const storage={
      load:async(key,policy)=>{
        const rows=await db('leap_scan_checkpoints?run_id=eq.'+run.id+'&stage=like.worker_%25&select=result&limit=1000');
        return (rows||[]).flatMap(c=>Array.isArray(c.result?.rows)?c.result.rows:[])
          .filter(x=>x.runKey===key&&x.policyKey===policy);
      },
      saveBatch:async({stage,rows,recordedAt})=>db('leap_scan_checkpoints',{method:'POST',body:{
        run_id:run.id,stage:'worker_'+stage,batch_no:Math.floor(Date.now()%1900000000),
        status:rows.every(x=>x.status==='verified')?'completed':'failed',tickers:rows.map(r=>r.ticker),
        result:{rows,recordedAt},finished_at:recordedAt
      }}),
      heartbeat:async()=>rpc('leaps_worker_renew',{p_run_id:run.id,p_owner:owner,p_lease_seconds:90}),
      finish:async(info)=>{
        if(!info||!['completed','incomplete','deadline_reached','blocked'].includes(info.status))throw Error('Unsafe finish');
        if(info.status!=='completed')await db('leap_scan_runs?id=eq.'+run.id,{method:'PATCH',body:{
          status:'paused',stage:'worker_pending_audit',last_error:JSON.stringify({status:info.status,failures:info.failures?.slice(0,3),remaining:info.remaining?.length}).slice(0,1500),
          updated_at:new Date().toISOString(),
          metadata:{...(run.metadata||{}),workerEligible:true,lastAttemptDate:new Date().toISOString().slice(0,10),lastRuntimeMs:info.elapsedMs,
            finalAuditCount:info.completed,publicationAllowed:false}
        }});
      }
    };
    const adapters=Object.fromEntries(['financials','issuer_events','valuation','public_support','leap_contract'].map(stage=>[
      stage,async(args)=>adapter(stage,args,args.signal)
    ]));
    adapters.publish=async({decisions})=>publishPair(run,decisions);
    const worker=makeRunner({storage,adapters,maxRunMs:RUN_MS,concurrency:4,batchSize:5,
      report:x=>log('info','worker_checkpoint',{runKey:x.runKey,stage:x.stage,progress:x.done,remainingMs:x.remainingMs})});
    const result=await worker.execute({runKey:run.run_key,policyKey:run.metadata?.policyKey||'worker_v1',tickers:names,startedAt:run.started_at});
    state.lastRun={id:run.id,result:result.result,published:result.published,elapsedMs:result.elapsedMs,reviewed:result.reviewed};
    state.mode=result.published?'idle':'waiting_next_scan';
    if(!result.published)log('warn','scan_incomplete',{id:run.id,status:result.result,remaining:result.remaining.length,failures:result.failures.length});
  }catch(e){
    state.lastError=String(e.message).slice(0,250);state.mode='standby_error';
    log('error','worker_run_error',{runId:run.id,error:state.lastError});
  }finally{
    if(heartbeat)clearInterval(heartbeat);
    await rpc('leaps_worker_release',{p_run_id:run.id,p_owner:owner}).catch(e=>log('error','release_failed',{message:String(e.message).slice(0,120)}));
  }
}
let busy=false;
async function tick(){
  if(busy||!enabled||missing().length)return;
  busy=true;
  try{
    const candidates=await db('leap_scan_runs?status=in.(paused,queued)&order=updated_at.asc&select=id,run_key,status,stage,started_at,metadata,updated_at&limit=30');
    const day=new Date().toISOString().slice(0,10);
    let eligible=(candidates||[]).find(r=>r.metadata?.workerEligible===true&&r.metadata?.lastAttemptDate!==day);
    if(!eligible){
      const now=new Date();
      const r=await db('leap_scan_runs?mode=eq.worker&select=run_key&order=started_at.desc&limit=1');
      const latest=(r||[])[0]?.run_key?.slice(-10)||null;
      if(scheduleDue(now,latest)){
        const local=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
        const runKey='worker-'+local;
        const rows=await db('leap_scan_runs',{method:'POST',body:{
          run_key:runKey,status:'queued',stage:'discovery',mode:'worker',
          metadata:{workerEligible:true,policyKey:'worker_v1',publicationAllowed:false}
        }});
        eligible=rows?.[0]||null;
      }
    }
    if(!eligible){state.mode='idle';return;}
    const claimed=await rpc('leaps_worker_claim',{p_run_id:eligible.id,p_owner:owner,p_lease_seconds:90});
    if(!claimed){state.mode='idle';return;}
    await runOne(eligible);
  }catch(e){state.lastError=String(e.message).slice(0,250);state.mode='standby_error';log('error','tick_failed',{error:state.lastError});}
  finally{busy=false;}
}
function start(){
  const port=Number(process.env.PORT||8080);
  http.createServer((req,res)=>{
    if(req.url!=='/health'){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify(state));
  }).listen(port,'0.0.0.0',()=>log('info','worker_boot',{port,enabled,missing:missing(),maxRunMinutes:RUN_MS/60000}));
  if(enabled&&missing().length)log('error','worker_standby_missing_server_config',{missing:missing()});
  if(enabled&&!missing().length){void tick();setInterval(()=>void tick(),RETRY_MS);}
}
if(require.main===module)start();
module.exports={start,tickerListFromRouting,saveDiscovery,missing};
