// Deterministic offline checks for the LEAPS two-stage scan planner.
const assert=require('node:assert/strict');
const {planScan,mayReuse,gate}=require('./plan_scan_work.js');
const now=new Date('2026-10-08T15:00:00Z').getTime();
const started='2026-10-08T14:00:00Z';
const oldFiling='000000001-26-000001';
const evidence={filingCheckedAt:'2026-10-08T14:10:00Z',newsCheckedAt:'2026-10-08T14:11:00Z',latestFilingVerified:true,materialChange:false,guidanceChange:false,newEarningsReleased:false,hardGateAlert:false,latestFilingId:oldFiling,fiscalPeriod:'2026-Q2',filingSourceUrl:'https://www.sec.gov/Archives/edgar/data/1/filing'};
const prior={latestFilingId:oldFiling,fiscalPeriod:'2026-Q2',financialVerifiedAt:'2026-08-04T10:00:00Z',filingEvidence:[{source:'10-Q'}],financials:{gaapNetIncome:5,latestYoYRevenueGrowth:9,latestQuarterFCF:7,ttmFCF:25}};
assert.ok(gate(prior.financials));
assert.equal(mayReuse(evidence,prior,started,now),true,'Unchanged verified filing may reuse audited financials after fresh checks');
for(const update of [{latestFilingId:'new-earnings'},{latestFilingVerified:false},{materialChange:true},{guidanceChange:true},{newEarningsReleased:true},{hardGateAlert:true},{filingCheckedAt:'2026-10-07T15:00:00Z'},{newsCheckedAt:''},{fiscalPeriod:'2026-Q3'},{filingSourceUrl:'not verified'}]){
  assert.equal(mayReuse({...evidence,...update},prior,started,now),false,'Failed evidence must force full verification: '+JSON.stringify(update));
}
assert.equal(mayReuse(evidence,{...prior,financials:{...prior.financials,ttmFCF:-1}},started,now),false,'Negative cached FCF cannot certify qualification');
assert.equal(mayReuse(evidence,{...prior,filingEvidence:[]},started,now),false,'Missing provenance cannot be silently reused');
const discovery=Array.from({length:203},(_,i)=>({ticker:'T'+String(i+1).padStart(3,'0'),opportunityScore:203-i,previousQualified:i<11,preliminary:{gaapNetIncome:5,latestYoYRevenueGrowth:3,latestQuarterFCF:2,ttmFCF:7}}));
discovery[100].materialNews=true;discovery[145].newEarnings=true;discovery[200].preliminary.ttmFCF=-2;
const verifiedCache={T001:prior},currentEvidence={T001:evidence};
const result=planScan({discovery,evidence:currentEvidence,verifiedCache,scanStartedAt:started,deepReviewTarget:40},now);
assert.equal(result.universeScanned,203,'Never confuse preliminary survivor count with actual deep review');
assert.equal(result.initialReviewCount,40,'Select review workload without claiming that all 203 were reviewed');
assert.equal(result.pendingScreeningCount,163,'Unreviewed stocks remain explicitly tracked');
assert.equal(result.reusedWithFreshProof,1,'Only explicitly checked same-filing financials can be reused');
assert.equal(result.fullVerifyCount,39);
assert.ok(result.review.some(x=>x.ticker==='T101'),'Material-news security cannot be deferred');
assert.ok(result.review.some(x=>x.ticker==='T146'),'New earnings cannot be deferred');
assert.ok(result.review.every(x=>x.previousQualified!==true||x.priority>=1000),'Previously qualified names stay prioritized');
assert.ok(result.batches.every(x=>x.tickers.length<=10&&x.checkpointRequired),'Checkpoint every bounded batch');
assert.equal(result.publicationAllowed,false,'A work plan cannot be mistaken for full research certification');
assert.ok(result.otherScreened.some(x=>x.ticker==='T201'),'Preliminary negative remains pending, not silently rejected');
const next=planScan({discovery,evidence:currentEvidence,verifiedCache,scanStartedAt:started,deepReviewTarget:40},now);
assert.deepEqual(result,next,'Reproducible work order is required for checkpoint resumes');
assert.throws(()=>planScan({discovery:[discovery[0],discovery[0]],scanStartedAt:started},now),/duplicate/);
assert.throws(()=>planScan({discovery,scanStartedAt:started,deepReviewTarget:10},now),/20..60/);
console.log('Fast scanner planner passed: 203 screened / 40 reviewed, guaranteed hot-stock priority, fresh-filing gates, conservative cache, 10-name checkpoints, no premature publication.');
