#!/usr/bin/env node
'use strict';
// Checkpoint work planner. Never publishes or treats stale quarterly data as current.
const fs=require('node:fs');
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const stamp=s=>typeof s==='string'?Date.parse(s):NaN;
const gate=f=>Boolean(f&&finite(f.gaapNetIncome)&&f.gaapNetIncome>0&&finite(f.latestYoYRevenueGrowth)&&f.latestYoYRevenueGrowth>0&&finite(f.latestQuarterFCF)&&f.latestQuarterFCF>0&&finite(f.ttmFCF)&&f.ttmFCF>0);
function mayReuse(nowEvidence,prior,runStartedAt,now=Date.now()){
  if(!nowEvidence||!prior||!Number.isFinite(stamp(runStartedAt)))return false;
  const start=stamp(runStartedAt),checked=stamp(nowEvidence.filingCheckedAt),news=stamp(nowEvidence.newsCheckedAt);
  if(!Number.isFinite(checked)||!Number.isFinite(news)||checked<start||news<start||checked>now+60000||news>now+60000)return false;
  for(const k of ['materialChange','guidanceChange','newEarningsReleased','hardGateAlert'])if(nowEvidence[k]!==false)return false;
  if(nowEvidence.latestFilingVerified!==true||!nowEvidence.latestFilingId||nowEvidence.latestFilingId!==prior.latestFilingId)return false;
  if(!nowEvidence.fiscalPeriod||nowEvidence.fiscalPeriod!==prior.fiscalPeriod)return false;
  if(!/^https:\/\//i.test(nowEvidence.filingSourceUrl||'')||!Number.isFinite(stamp(prior.financialVerifiedAt)))return false;
  return Array.isArray(prior.filingEvidence)&&prior.filingEvidence.length>0&&gate(prior.financials);
}
function planScan({discovery,evidence={},verifiedCache={},scanStartedAt,deepReviewTarget=40},now=Date.now()){
  if(!Number.isFinite(stamp(scanStartedAt)))throw Error('Real scanStartedAt required');
  if(!Array.isArray(discovery)||!discovery.length)throw Error('New broad discovery required');
  if(!Number.isInteger(deepReviewTarget)||deepReviewTarget<20||deepReviewTarget>60)throw Error('Review target 20..60');
  const seen=new Set(),items=[];
  for(const raw of discovery){
    const d=typeof raw==='string'?{ticker:raw}:raw,t=String(d?.ticker||'').toUpperCase().trim();
    if(!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t)||seen.has(t))throw Error('Invalid/duplicate ticker '+t);
    seen.add(t);
    const e=evidence[t]||{},p=verifiedCache[t]||{},reuse=mayReuse(e,p,scanStartedAt,now),f=d.preliminary||{};
    const preliminaryFail=['gaapNetIncome','latestYoYRevenueGrowth','latestQuarterFCF','ttmFCF'].some(k=>finite(f[k])&&f[k]<=0);
    const urgent=Boolean(d.previousQualified||d.materialNews||d.newEarnings||e.materialChange||e.guidanceChange||e.hardGateAlert);
    const score=finite(d.opportunityScore)?Math.max(0,Math.min(100,d.opportunityScore)):0;
    const priority=(d.previousQualified?1000:0)+(urgent?500:0)+(reuse?100:0)+(preliminaryFail?-150:0)+score;
    items.push({ticker:t,priority,previousQualified:Boolean(d.previousQualified),urgent,preliminaryFail,route:reuse?'REUSE_VERIFIED_FINANCIALS':'VERIFY_FINANCIALS',filingId:reuse?p.latestFilingId:null});
  }
  items.sort((a,b)=>b.priority-a.priority||a.ticker.localeCompare(b.ticker));
  const chosen=new Set(items.filter(x=>x.previousQualified||x.urgent).map(x=>x.ticker));
  for(const x of items){if(chosen.size>=deepReviewTarget)break;if(!x.preliminaryFail)chosen.add(x.ticker);}
  const review=items.filter(x=>chosen.has(x.ticker)),otherScreened=items.filter(x=>!chosen.has(x.ticker)),batches=[];
  for(const route of ['VERIFY_FINANCIALS','REUSE_VERIFIED_FINANCIALS']){
    const group=review.filter(x=>x.route===route);
    for(let i=0;i<group.length;i+=10)batches.push({stage:route,batch:Math.floor(i/10)+1,tickers:group.slice(i,i+10).map(x=>x.ticker),checkpointRequired:true});
  }
  return {scanStartedAt,universeScanned:items.length,initialReviewCount:review.length,fullVerifyCount:review.filter(x=>x.route==='VERIFY_FINANCIALS').length,reusedWithFreshProof:review.filter(x=>x.route==='REUSE_VERIFIED_FINANCIALS').length,pendingScreeningCount:otherScreened.length,review,otherScreened,batches,publicationAllowed:false,warning:'Remaining names are screened, NOT rejected or qualified; expand reviews whenever warranted. Run full hard-gate and publication validation.'};
}
if(require.main===module){
  try{
    const [d,e,p,out]=process.argv.slice(2);
    if(!d||!e||!p)throw Error('Usage: plan_scan_work.js discovery.json evidence.json verified-cache.json [output.json]');
    const data=JSON.parse(fs.readFileSync(d,'utf8'));
    const result=JSON.stringify(planScan({discovery:data.discovery||data.tickers||data,evidence:JSON.parse(fs.readFileSync(e,'utf8')),verifiedCache:JSON.parse(fs.readFileSync(p,'utf8')),scanStartedAt:data.scanStartedAt,deepReviewTarget:data.deepReviewTarget||40}),null,2);
    if(out)fs.writeFileSync(out,result+'\n');else console.log(result);
  }catch(err){console.error(err.message);process.exitCode=1;}
}
module.exports={gate,mayReuse,planScan};