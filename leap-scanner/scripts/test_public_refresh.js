// Run with: node scripts/test_public_refresh.js
// No network, secrets, browser or third-party packages. Tests immutable snapshot selection and partial refresh.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'dist/app.js'),'utf8');
const before=app.split('load().catch(')[0];
const metadata=app.slice(app.indexOf('function shouldFetchPublishedPayload('),app.indexOf('let publicPollInFlight='));
const poll=app.slice(app.indexOf('let publicPollInFlight='),app.indexOf('\nsetInterval(()=>'));
assert.ok(before.includes('function selectPublished(')&&poll.includes('async function pollLatest()'));
const elements=new Map();
const document={
  getElementById(id){if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',style:{},dataset:{},classList:{add(){},remove(){}}});return elements.get(id);},
  querySelectorAll(){return[];},
  visibilityState:'visible'
};
const ctx=vm.createContext({console,document,window:{},Intl,Date,Number,Math,Promise});
vm.runInContext(before+'\n'+metadata+'\n'+poll,ctx);
const research=JSON.parse(fs.readFileSync(path.join(root,'dist/data/research-latest.json'),'utf8'));
const market=JSON.parse(fs.readFileSync(path.join(root,'dist/data/market-latest.json'),'utf8'));
const copy=o=>JSON.parse(JSON.stringify(o));
const researchStamp=Date.parse(research.scanCompletedAt);
assert.ok(Number.isFinite(researchStamp));
const oldResearch=copy(research);
oldResearch.scanCompletedAt=new Date(researchStamp-60*60*1000).toISOString();
assert.ok(researchStamp>Date.parse(oldResearch.scanCompletedAt));
const rr=(payload,time)=>({payload,snapshot_time:time});
const mm=(payload,time)=>({payload,scan_time:time});
const newRow=rr(research,'2026-10-08T04:53:57Z'),staleRow=rr(oldResearch,'2026-10-08T05:00:11Z');
ctx.rows={leap_scans:[mm(market,'2026-10-08T04:53:57Z')],leap_research_snapshots:[staleRow,newRow]};
ctx.failed=new Set();
ctx.renderCount=0;
ctx.fallbacks={};
ctx.fullPayloadReads=0;
ctx.metadataReads=0;
ctx.fetchRows=async (name,query)=>{
  if(ctx.failed.has(name))throw Error('Simulated endpoint failure');
  const rows=ctx.rows[name];
  if(query.includes('select=id,')){
    ctx.metadataReads++;
    return rows.map((row,i)=>({id:i+1,scan_time:row.scan_time,snapshot_time:row.snapshot_time,completion:row.payload?.scanCompletedAt}));
  }
  ctx.fullPayloadReads++;
  return rows;
};
ctx.loadFallback=async name=>ctx.fallbacks[name]||null;
vm.runInContext('sb=async function(table,query){return fetchRows(table,query)};json=async function(name){return loadFallback(name)};renderAll=function(){renderCount++};renderFreshness=function(){};',ctx);
const read=expression=>vm.runInContext(expression,ctx);
const newMarket=copy(market);newMarket.scanCompletedAt='2026-10-08T06:00:00Z';
const newerResearch=copy(research);newerResearch.scanCompletedAt='2026-10-08T07:00:00Z';
(async()=>{
  await read('load()');
  assert.equal(read('research.scanCompletedAt'),research.scanCompletedAt,'Insertion order cannot roll back research');
  assert.equal(read('researchSavedAt'),newRow.snapshot_time,'Saved-at tracks the selected valid row');
  assert.equal(read('previousResearch.scanCompletedAt'),oldResearch.scanCompletedAt,'Previous rank snapshot must have distinct completion time');
  assert.equal(read('feedMode'),'STALE UPLOAD IGNORED');
  ctx.rows.leap_research_snapshots=[rr(newerResearch,'2026-10-08T07:01:00Z'),newRow];
  ctx.failed.add('leap_scans');
  await read('pollLatest()');
  assert.equal(read('research.scanCompletedAt'),newerResearch.scanCompletedAt,'Research refresh survives market outage');
  assert.equal(read('market.scanCompletedAt'),market.scanCompletedAt,'Market outage preserves previous market');
  assert.equal(read('feedMode'),'PARTIAL REFRESH');
  ctx.failed.clear();
  ctx.failed.add('leap_research_snapshots');
  ctx.rows.leap_scans=[mm(newMarket,'2026-10-08T06:01:00Z')];
  await read('pollLatest()');
  assert.equal(read('research.scanCompletedAt'),newerResearch.scanCompletedAt,'Research outage preserves previous research');
  assert.equal(read('market.scanCompletedAt'),newMarket.scanCompletedAt,'Market refresh survives research outage');
  ctx.failed.add('leap_scans');
  await read('pollLatest()');
  assert.equal(read('feedMode'),'REFRESH UNAVAILABLE','Double outage must be identified');
  assert.equal(read('market.scanCompletedAt'),newMarket.scanCompletedAt,'Double outage cannot erase valid market');
  ctx.failed.clear();
  ctx.rows.leap_research_snapshots=[staleRow,newRow];
  ctx.rows.leap_scans=[mm(market,'2026-10-08T04:53:57Z')];
  await read('pollLatest()');
  assert.equal(read('research.scanCompletedAt'),newerResearch.scanCompletedAt,'Newer in-memory scan cannot regress');
  assert.equal(read('market.scanCompletedAt'),newMarket.scanCompletedAt,'Newer in-memory market cannot regress');
  const readsBefore=ctx.fullPayloadReads,metaBefore=ctx.metadataReads;
  await read('pollLatest()');
  assert.equal(ctx.fullPayloadReads,readsBefore,'No unchanged full JSON payloads should be downloaded on each poll');
  assert.equal(ctx.metadataReads,metaBefore+2,'Both independent publication feeds use compact metadata reads');
  const summary=read('earningsAtAGlance({quarter:{revenues:[150],net:[20],eps:[2.5],revg:[12],nyoy:[8]},earningsSurprises:[{epsBasis:"ADJUSTED",epsConsensus:2.3,status:"UNVERIFIED"}]})');
  assert.ok(summary.includes('UNVERIFIED')&&!summary.includes('class="earnings-chip beat"'),'Do not invent EPS beats');
  assert.ok(ctx.renderCount>=3,'Successful independent publication updates must render');
  console.log('Public refresh regression passed: true scan order, rollback prevention, distinct history, one-sided outages, double outage, recovery, and unverified consensus.');
})().catch(e=>{console.error(e);process.exitCode=1;});
