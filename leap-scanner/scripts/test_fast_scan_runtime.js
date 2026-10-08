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
(async()=>{
  const sequentialMs=await baseline(),fast=await concurrent();await failures();
  // Descriptive synthetic benchmark only: never extrapolate to real provider latency.
  assert.ok(fast.elapsed<sequentialMs,'Mock concurrency must outperform serial mock requests');
  console.log('Optimized scan runtime tests passed. Synthetic 40-record latency baseline '+sequentialMs.toFixed(0)+'ms serial vs '+fast.elapsed.toFixed(0)+'ms concurrent (mocked, NOT a production speed claim).');
})().catch(e=>{console.error(e);process.exitCode=1;});