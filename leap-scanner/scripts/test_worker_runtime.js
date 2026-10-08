'use strict';
const assert=require('node:assert/strict');
const {makeRunner,scheduleDue,chicagoClock,DEFAULT_MAX_MS,ensureEvidence}=require('./worker_runtime');
const tickers=['ABC','DEF','GHI'];
const now='2026-10-08T13:05:00Z';
const evidence=(ticker,stage,extra={})=>({
  ticker,stage,verified:true,source:'https://www.sec.gov/Archives/edgar/data/1/report.htm',checkedAt:now,
  ...(stage==='financials'?{filing:{accession:'0000000001-26-000001',periodEnd:'2026-06-30',url:'https://www.sec.gov/Archives/edgar/data/1/report.htm'},hardGate:'pass',metrics:{netIncome:10,yoyRevenueGrowth:0.13,quarterFCF:12,ttmFCF:45}}:{}),
  ...(stage==='issuer_events'?{thesisStatus:'intact'}:{}),
  ...(stage==='valuation'?{valuationVerified:true}:{}),
  ...(stage==='public_support'?{supportVerified:true,zones:[1,2,3].map(i=>({source:'https://example.com/quote',rationale:'historical major swing level '+i}))}:{}),
  ...(stage==='leap_contract'?{contractReady:false,classification:'NO_VERIFIED_CONTRACT'}:{}),...extra
});
function setup(){
  const rows=[],statuses=[],saved=[];
  const storage={
    load:async()=>rows.filter(x=>x.status==='verified'),
    saveBatch:async x=>{rows.push(...x.rows);saved.push(x);},
    heartbeat:async()=>{},
    finish:async x=>statuses.push(x)
  };
  const counts={};
  const adapters=Object.fromEntries(['financials','issuer_events','valuation','public_support','leap_contract'].map(stage=>[
    stage,async({ticker})=>{counts[ticker+':'+stage]=(counts[ticker+':'+stage]||0)+1;return evidence(ticker,stage);}
  ]));
  let publishes=0;
  adapters.publish=async({decisions})=>{assert.equal(decisions.length,3);publishes++;};
  return {storage,adapters,rows,counts,saved,statuses,getPublishes:()=>publishes};
}
async function happyPath(){
  const x=setup(),runner=makeRunner({storage:x.storage,adapters:x.adapters,maxRunMs:100000,concurrency:4,batchSize:2});
  const a=await runner.execute({runKey:'test-a',policyKey:'v1',tickers});
  assert.equal(a.result,'completed');assert.equal(a.published,true);
  assert.equal(x.getPublishes(),1);assert.equal(x.rows.length,15);
  assert.deepEqual(x.saved.map(x=>x.rows.length),[2,1,2,1,2,1,2,1,2,1]);
  const b=await runner.execute({runKey:'test-a',policyKey:'v1',tickers});
  assert.equal(b.published,true);assert.equal(x.rows.length,15,'verified checkpoints must be reused');
  assert.equal(x.counts['ABC:financials'],1);
}
async function failClosed(){
  const x=setup();
  x.adapters.financials=async({ticker})=>ticker==='ABC'?evidence(ticker,'financials',{metrics:{netIncome:1,yoyRevenueGrowth:0.2,quarterFCF:-5,ttmFCF:20}}):evidence(ticker,'financials');
  const r=await makeRunner({storage:x.storage,adapters:x.adapters,maxRunMs:100000}).execute({runKey:'fail-1',policyKey:'v1',tickers});
  assert.equal(r.published,false);assert.ok(r.failures.some(x=>x.ticker==='ABC'));assert.equal(x.getPublishes(),0);
  const y=setup();
  y.adapters.financials=async({ticker})=>ticker==='ABC'?evidence(ticker,'financials',{hardGate:'fail',rejectReason:'GAAP net loss'}):evidence(ticker,'financials');
  const z=await makeRunner({storage:y.storage,adapters:y.adapters,maxRunMs:100000}).execute({runKey:'reject-1',policyKey:'v1',tickers});
  assert.equal(z.published,true,'reasoned hard-gate rejects count as completed review outcomes');
  assert.equal(y.counts['ABC:issuer_events'],undefined,'do not spend review calls after hard-gate rejection');
  const w=setup();delete w.adapters.leap_contract;
  const blocked=await makeRunner({storage:w.storage,adapters:w.adapters,maxRunMs:100000}).execute({runKey:'missing-adapter',policyKey:'v1',tickers});
  assert.equal(blocked.published,false);
  assert.ok(blocked.failures.some(f=>/Missing production adapter leap_contract/.test(f.reason)));
}
async function deadline(){
  const x=setup();let tick=0;
  const clock=()=>tick;
  x.adapters.financials=async({ticker})=>{tick+=32000;return evidence(ticker,'financials');};
  const r=await makeRunner({storage:x.storage,adapters:x.adapters,maxRunMs:60000,clock,concurrency:1,batchSize:1}).execute({runKey:'late',policyKey:'v1',tickers});
  assert.equal(r.published,false);assert.equal(r.result,'deadline_reached');assert.ok(x.rows.length>0&&x.rows.length<15);
  assert.throws(()=>makeRunner({storage:x.storage,adapters:x.adapters,maxRunMs:20*60*1000+1}),/20min/);
  assert.equal(DEFAULT_MAX_MS,19*60*1000);
}
function schedule(){
  // UTC 17:30 is 12:30 CDT in October, while UTC 18:30 is 12:30 CST in January.
  assert.equal(scheduleDue(new Date('2026-10-08T17:30:00Z'),null),true);
  assert.equal(scheduleDue(new Date('2026-10-08T17:30:00Z'),'2026-10-08'),false);
  assert.equal(scheduleDue(new Date('2026-01-08T18:30:00Z'),null),true);
  assert.equal(scheduleDue(new Date('2026-10-10T17:30:00Z'),null),false);
  assert.equal(chicagoClock(new Date('2026-10-08T17:30:00Z')).hour,12);
  assert.throws(()=>ensureEvidence({verified:true},'financials','ABC'),/Unverified financials/);
}
(async()=>{schedule();await happyPath();await failClosed();await deadline();console.log('PASS 20-minute deadline, DST schedule, checkpoints, fail-closed financials, hard-gate early exit and absent-provider blocker');})().catch(e=>{console.error(e);process.exitCode=1;});
