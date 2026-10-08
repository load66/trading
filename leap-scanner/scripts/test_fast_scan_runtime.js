'use strict';
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {runPool,createFastRunner}=require('./fast_scan_runtime');
const nap=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const jobs=Array.from({length:40},(_,i)=>({ticker:'T'+String(i).padStart(3,'0'),filingId:'2026q3',provider:'SEC',phase:'latest_filing'}));
async function baseline(){const start=performance.now();for(const job of jobs)await nap(14);return performance.now()-start;}
async function concurrent(){
  const saved=[],calls=[],fail=new Set(['T005']),slow=new Set(['T009']),entitled=new Set(['T010']);
  let attempts={};
  const runner=createFastRunner({
    callProvider:async(j,attempt)=>{
      calls.push(j.ticker+':'+j.provider);
      attempts[j.ticker]=(attempts[j.ticker]||0)+1;
      await nap(14);
      if(fail.has(j.ticker)){fail.delete(j.ticker);throw Object.assign(Error('rate-limited'),{status:429,retryAfterSeconds:0});}
      if(slow.has(j.ticker)){slow.delete(j.ticker);throw Object.assign(Error('upstream transient'),{status:503});}
      if(entitled.has(j.ticker)&&j.provider==='Premium')throw Object.assign(Error('NOT_ENTITLED'),{code:'NOT_ENTITLED'});
      return {verified:true,latestFilingId:j.filingId,fiscalPeriod:'2026-Q3'};
    },
    saveCheckpoint:async x=>{saved.push(x);},
    sleepFn:async()=>{},
    concurrency:5,batchSize:10,maxAttempts:3
  });
  const enriched=jobs.map((j,i)=>i===10?{...j,providers:['Premium','SEC']}:j);
  const start=performance.now();
  const r=await runner.execute(enriched,{runKey:'scan-20261008',policyKey:'fast-v2'});
  const elapsed=performance.now()-start;
  assert.equal(r.allVerified,true);
  assert.equal(r.publicationAllowed,false);
  assert.equal(saved.length,4);
  assert.ok(saved.every(x=>x.status==='completed'&&x.tickers.length===10&&x.results.every(z=>z.status==='verified')));
  assert.equal(r.stats.maxConcurrent,5);
  assert.equal(r.stats.retries,2);
  assert.ok(r.stats.networkCalls<50);
  assert.equal(r.results.length,40);
  assert.equal(r.results[10].provider,'SEC','Entitlement falls back to available source');
  assert.equal(attempts.T010,2);
  assert.equal(attempts.T005,2);
  assert.ok(r.stats.batches.every(x=>x.elapsedMs>0));
  const resumed=await runner.execute(enriched,{runKey:'scan-20261008',policyKey:'fast-v2',alreadySaved:r.results});
  assert.equal(resumed.stats.skippedVerified,40);
  const mismatch=await runner.execute(enriched.slice(0,2),{runKey:'new-run',policyKey:'fast-v2',alreadySaved:r.results});
  assert.ok(mismatch.stats.skippedVerified>=40,'Previous verified resume count retained');
  assert.equal(mismatch.results.filter(x=>x.resumed).length,0);
  const wronglyFiled=await runner.execute([{...enriched[0],filingId:'2027q1'}],{runKey:'scan-20261008',policyKey:'fast-v2',alreadySaved:r.results});
  assert.notEqual(wronglyFiled.results[0].resumed,true,'changed filing cannot be treated as a saved result');
  return {elapsed,calls: r.stats.networkCalls,serializedResult:r};
}
async function failures(){
  let saved;
  const runner=createFastRunner({callProvider:async j=>{
    if(j.ticker==='FAIL')throw Object.assign(Error('Invalid filing'),{status:422});
    return {verified:true,value:1};
  },saveCheckpoint:async x=>{saved=x;},concurrency:2});
  const r=await runner.execute([{ticker:'OK',provider:'SEC',filingId:'x'},{ticker:'FAIL',provider:'SEC',filingId:'x'}],{runKey:'scan',policyKey:'v2'});
  assert.equal(r.allVerified,false);assert.equal(r.publicationAllowed,false);
  assert.equal(saved.status,'failed');assert.equal(saved.results[0].status,'verified');
  assert.equal(saved.results[1].status,'failed');
  const bad=createFastRunner({callProvider:async()=>({verified:true}),saveCheckpoint:async()=>{throw Error('checkpoint storage unavailable');}});
  await assert.rejects(bad.execute([{ticker:'OK',provider:'SEC',filingId:'x'}],{runKey:'scan',policyKey:'v2'}),/checkpoint storage unavailable/);
  let inflight=0;
  const p=await runPool(Array.from({length:20},(_,i)=>i),4,async()=>{inflight++;assert.ok(inflight<=4);await nap(1);inflight--;return true;});
  assert.equal(p.maxConcurrencyObserved,4);
}
async function exhaustedFinancialDatasets(){
  const saved=[],calls=[];
  const runner=createFastRunner({
    callProvider:async j=>{
      calls.push(j.provider+':'+j.ticker);
      if(j.provider==='Financial_Datasets')return {text:'Error fetching cash flow for KLAC: Your current balance is $0.00. Please add more credits to continue using the API.'};
      return {verified:true,filingId:j.filingId,source:'SEC fallback'};
    },
    saveCheckpoint:async row=>saved.push(row),
    batchSize:1,concurrency:1,maxAttempts:3
  });
  const names=['KLAC','APP','BSX'];
  const jobs=names.map(ticker=>({ticker,phase:'filing',filingId:'2026-Q2',providers:['Financial_Datasets','SEC']}));
  const out=await runner.execute(jobs,{runKey:'current-run',policyKey:'policy'});
  assert.equal(out.allVerified,true);
  assert.equal(out.publicationAllowed,false);
  assert.deepEqual(out.results.map(x=>x.provider),['SEC','SEC','SEC']);
  assert.equal(calls.filter(x=>x.startsWith('Financial_Datasets')).length,1,'Zero balance should disable provider after first observed failure');
  assert.equal(out.stats.retries,0,'Do not retry a provider with exhausted credits');
  assert.equal(saved.length,3);
  const failing=createFastRunner({
    callProvider:async()=>({text:'Your current balance is $0.00. Please add more credits to continue using the API.'}),
    saveCheckpoint:async()=>{}
  });
  const blocked=await failing.execute([{ticker:'APP',provider:'Financial_Datasets',filingId:'2026-Q2'}],{runKey:'r',policyKey:'p'});
  assert.equal(blocked.allVerified,false,'No other provider means fail closed');
  assert.equal(blocked.results[0].status,'failed');
}
async function verifyCacheIsolation(){
  const received=[];
  const runner=createFastRunner({
    callProvider:async j=>{
      received.push({ticker:j.ticker,phase:j.phase,provider:j.provider});
      return {verified:true,issuer:j.ticker,provider:j.provider,requestNumber:received.length};
    },
    saveCheckpoint:async()=>{},
    concurrency:2,batchSize:10
  });
  const job={ticker:'AAA',phase:'financials',filingId:'2026-Q2',provider:'SEC',cacheKey:'shared-accession'};
  const first=await runner.execute([job],{runKey:'scan-A',policyKey:'policy-1'});
  const sameRun=await runner.execute([job],{runKey:'scan-A',policyKey:'policy-1'});
  assert.equal(received.length,1,'Deduplication within the identical scan scope is allowed');
  assert.equal(sameRun.results[0].evidence.requestNumber,first.results[0].evidence.requestNumber);
  const nextRun=await runner.execute([job],{runKey:'scan-B',policyKey:'policy-1'});
  assert.equal(received.length,2,'New scan must fetch new provider evidence');
  assert.equal(nextRun.results[0].evidence.requestNumber,2);
  await runner.execute([job],{runKey:'scan-A',policyKey:'policy-2'});
  assert.equal(received.length,3,'Policy revision must fetch new provider evidence');
  await runner.execute([job],{runKey:'scan-A',policyKey:'policy-1',phase:'support'});
  assert.equal(received.length,4,'Different verification stage must fetch new provider evidence');
  const secondIssuer={...job,ticker:'BBB'};
  const shared=await runner.execute([job,secondIssuer],{runKey:'scan-C',policyKey:'policy-1'});
  assert.equal(received.length,6,'Shared caller cache key must not merge distinct issuers');
  assert.deepEqual(shared.results.map(x=>x.evidence.issuer),['AAA','BBB']);
  assert.equal(shared.publicationAllowed,false,'Cache fixes never bypass publication checks');
}
(async()=>{
  const sequentialMs=await baseline(),fast=await concurrent();await failures();await exhaustedFinancialDatasets();await verifyCacheIsolation();
  // Descriptive synthetic benchmark only: never extrapolate to real provider latency.
  assert.ok(fast.elapsed<sequentialMs,'Mock concurrency must outperform serial mock requests');
  console.log('Optimized scan runtime tests passed. Synthetic 40-record latency baseline '+sequentialMs.toFixed(0)+'ms serial vs '+fast.elapsed.toFixed(0)+'ms concurrent (mocked, NOT a production speed claim).');
})().catch(e=>{console.error(e);process.exitCode=1;});