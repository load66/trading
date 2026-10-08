'use strict';
// A pure Node.js executor for verified provider jobs. No network/auth/storage assumptions.
// The caller supplies actual provider functions and durable, backend-only checkpoint writes.
const {performance}=require('node:perf_hooks');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const code=e=>Number(e?.status||e?.statusCode||e?.response?.status||0);
const retryable=e=>[408,425,429,500,502,503,504].includes(code(e))||Boolean(e?.transient);
const unavailableMessage=value=>{
  if(typeof value==='string')return value;
  if(value&&typeof value==='object')return String(value.text||value.error||value.message||value.structuredContent?.error||'');
  return '';
};
const entitlement=e=>/NOT_ENTITLED|SUBSCRIPTION_REQUIRED|NOT SUBSCRIBED|INSUFFICIENT[_ -]CREDITS|CURRENT BALANCE IS\\s*\\$?0(?:\\.0+)?|ADD MORE CREDITS|MONTHLY TOOL-CALL LIMIT/i.test(String(e?.code||'')+' '+unavailableMessage(e));
const providerFailure=value=>{
  const msg=unavailableMessage(value);
  if(entitlement({message:msg}))return Object.assign(Error('Provider balance or entitlement unavailable: '+msg.slice(0,180)),{code:'NOT_ENTITLED',status:402});
  return null;
};
function runPool(items,limit,fn){
  if(!Number.isInteger(limit)||limit<1||limit>10)throw Error('Invalid concurrency');
  let cursor=0,active=0,maxActive=0;
  const out=new Array(items.length);
  const worker=async()=>{
    while(cursor<items.length){
      const i=cursor++;
      active++;maxActive=Math.max(active,maxActive);
      try{out[i]={ok:true,value:await fn(items[i],i)};}
      catch(e){out[i]={ok:false,error:String(e?.message||e),status:code(e),entitlement:entitlement(e)};}
      finally{active--;}
    }
  };
  return Promise.all(Array.from({length:Math.min(limit,items.length)},worker)).then(()=>({results:out,maxConcurrencyObserved:maxActive}));
}
function createFastRunner({callProvider,saveCheckpoint,concurrency=4,batchSize=10,maxAttempts=3,baseDelayMs=400,sleepFn=sleep,clock=()=>new Date(),onTelemetry=()=>{}}){
  if(typeof callProvider!=='function'||typeof saveCheckpoint!=='function')throw Error('Provider and checkpoint callbacks required');
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>10)throw Error('Batch size 1..10 required');
  if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>4)throw Error('Max attempts 1..4');
  const flights=new Map(),successful=new Map(),disabledProviders=new Set();
  const stats={networkCalls:0,deduplicatedCalls:0,retries:0,failures:0,completed:0,failed:0,skippedVerified:0,maxConcurrent:0,providerFailures:{},providerCalls:{},batches:[]};
  async function oneProvider(job,provider){
    const key=provider+'|'+String(job.cacheKey||job.ticker+'|'+job.phase+'|'+job.filingId);
    if(successful.has(key)){stats.deduplicatedCalls++;return successful.get(key);}
    if(flights.has(key)){stats.deduplicatedCalls++;return flights.get(key);}
    const fetch=async()=>{
      if(disabledProviders.has(provider))throw Error('Unavailable subscription: '+provider);
      let lastError;
      for(let attempt=1;attempt<=maxAttempts;attempt++){
        try{
          stats.networkCalls++;
          stats.providerCalls[provider]=(stats.providerCalls[provider]||0)+1;
          const result=await callProvider({...job,provider},attempt);
          const providerError=providerFailure(result);
          if(providerError)throw providerError;
          if(!result||result.verified!==true)throw Object.assign(Error('Provider returned no explicit verified evidence'),{status:422});
          successful.set(key,result);return result;
        }catch(e){
          lastError=e;
          if(entitlement(e)){disabledProviders.add(provider);break;}
          if(!retryable(e)||attempt===maxAttempts)break;
          stats.retries++;
          const seconds=Number(e?.retryAfterSeconds);
          const wait=Number.isFinite(seconds)&&seconds>=0?Math.min(30000,Math.round(seconds*1000)):Math.min(5000,baseDelayMs*Math.pow(2,attempt-1));
          await sleepFn(wait);
        }
      }
      stats.providerFailures[provider]=(stats.providerFailures[provider]||0)+1;
      throw lastError;
    };
    const pending=fetch();
    flights.set(key,pending);
    try{return await pending;}finally{flights.delete(key);}
  }
  async function fetchWithFallback(job){
    const providers=Array.isArray(job.providers)&&job.providers.length?job.providers:[job.provider];
    let last;
    for(const provider of providers){
      if(typeof provider!=='string'||!provider)throw Error('Explicit provider list required');
      try{
        const value=await oneProvider(job,provider);
        return {value,provider};
      }catch(e){last=e;}
    }
    throw last||Error('No provider succeeded');
  }
  async function execute(jobs,{runKey,policyKey,phase='hard_gate_detail',alreadySaved=[]}={}){
    if(!runKey||!policyKey||!Array.isArray(jobs)||!jobs.length)throw Error('Run identity, policy and jobs required');
    const symbols=new Set();
    for(const job of jobs){if(!job?.ticker||symbols.has(job.ticker))throw Error('Missing or duplicate tickers in scheduled workload');symbols.add(job.ticker);}
    const verifiedSaved=new Map();
    for(const row of alreadySaved){
      // No replay from another run, policy or filing identity.
      if(row?.runKey!==runKey||row?.policyKey!==policyKey||row?.phase!==phase)continue;
      if(row?.status==='verified'&&row?.ticker&&symbols.has(row.ticker)&&row.filingId===jobs.find(j=>j.ticker===row.ticker)?.filingId)
        verifiedSaved.set(row.ticker,row);
    }
    const outputs=[];
    for(let offset=0;offset<jobs.length;offset+=batchSize){
      const chunk=jobs.slice(offset,offset+batchSize);
      const batchNo=Math.floor(offset/batchSize);
      const startedAt=clock().toISOString(),start=performance.now();
      const result=await runPool(chunk,concurrency,async job=>{
        if(verifiedSaved.has(job.ticker)){stats.skippedVerified++;return {...verifiedSaved.get(job.ticker),resumed:true};}
        const response=await fetchWithFallback(job);
        // The provider's answer is evidence, not a hard-gate certification.
        return {ticker:job.ticker,filingId:job.filingId||null,runKey,policyKey,phase,status:'verified',provider:response.provider,evidence:response.value};
      });
      const rows=result.results.map((r,i)=>r.ok?r.value:{ticker:chunk[i].ticker,filingId:chunk[i].filingId||null,runKey,policyKey,phase,status:'failed',error:r.error,providerErrorStatus:r.status});
      const failed=rows.filter(x=>x.status==='failed');
      const elapsedMs=Math.round(performance.now()-start);
      const checkpoint={runKey,policyKey,phase,batchNo,status:failed.length?'failed':'completed',
        tickers:chunk.map(j=>j.ticker),results:rows,startedAt,finishedAt:clock().toISOString(),elapsedMs,failedCount:failed.length};
      // Never report completion before durable checkpoint is written.
      await saveCheckpoint(checkpoint);
      stats.batches.push({batchNo,count:chunk.length,elapsedMs,failed:failed.length});
      stats.maxConcurrent=Math.max(stats.maxConcurrent,result.maxConcurrencyObserved);
      stats.completed+=rows.length-failed.length;stats.failed+=failed.length;
      onTelemetry({kind:'checkpoint',...stats.batches.at(-1)});
      outputs.push(...rows);
    }
    return {results:outputs,stats:{...stats},allVerified:outputs.every(x=>x.status==='verified'),
      publicationAllowed:false}; // The primary publication validator is always mandatory.
  }
  return {execute,stats};
}
module.exports={runPool,createFastRunner,retryable,entitlement,providerFailure};