'use strict';
// Resumable, deadline-bounded research orchestration. Adapters must return verified evidence.
// This module NEVER invents financials or publishes an incomplete scan.
const {performance}=require('node:perf_hooks');
const DEFAULT_MAX_MS=19*60*1000;
const STAGES=['financials','issuer_events','valuation','public_support','leap_contract'];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const validDecision=d=>d&&['qualified','rejected'].includes(d.status)&&typeof d.ticker==='string'&&
  (d.status!=='qualified'||(d.financialGatesVerified===true&&d.issuerEventsVerified===true&&d.valuationVerified===true&&d.supportVerified===true));
function chicagoClock(date=new Date()){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(date).map(x=>[x.type,x.value]));
  return {day:p.year+'-'+p.month+'-'+p.day,weekday:p.weekday,hour:Number(p.hour),minute:Number(p.minute)};
}
function scheduleDue(date,latestKey,{hour=12,minute=30}={}){
  const c=chicagoClock(date);
  return !['Sat','Sun'].includes(c.weekday)&&(c.hour*60+c.minute>=hour*60+minute)&&
    c.hour*60+c.minute<(hour*60+minute+30)&&latestKey!==c.day;
}
function ensureEvidence(result,expectedStage,ticker){
  if(!result||result.verified!==true||result.ticker!==ticker||result.stage!==expectedStage||!result.source||
    !result.checkedAt||!Number.isFinite(Date.parse(result.checkedAt)))throw Error('Unverified '+expectedStage+' evidence for '+ticker);
  // A provider's "verified" flag is a prerequisite, never final publication approval.
  if(expectedStage==='financials'){
    const f=result.filing;
    if(!f?.accession||!f?.periodEnd||!f?.url)throw Error('Missing original filing identity: '+ticker);
    if(result.hardGate==='pass'){
      const m=result.metrics;
      if(!m||!Number.isFinite(m.netIncome)||m.netIncome<=0||!Number.isFinite(m.yoyRevenueGrowth)||m.yoyRevenueGrowth<=0||
        !Number.isFinite(m.quarterFCF)||m.quarterFCF<=0||!Number.isFinite(m.ttmFCF)||m.ttmFCF<=0)
        throw Error('Invalid financial hard gate for '+ticker);
    }
    if(!['pass','fail'].includes(result.hardGate))throw Error('Financial gate unresolved for '+ticker);
    if(result.hardGate==='fail'&&!result.rejectReason)throw Error('Missing reasoned financial rejection for '+ticker);
  }
  if(expectedStage==='issuer_events'&&result.thesisStatus!=='intact'&&result.thesisStatus!=='broken')throw Error('Missing thesis verdict for '+ticker);
  if(expectedStage==='public_support'&&result.supportVerified===true&&(!Array.isArray(result.zones)||result.zones.length!==3||result.zones.some(x=>!x.source||!x.rationale)))throw Error('Unproven 30/30/40 support for '+ticker);
  return result;
}
function makeRunner({storage,adapters,clock=()=>performance.now(),wallClock=()=>new Date(),sleep=delay,
  maxRunMs=DEFAULT_MAX_MS,concurrency=4,batchSize=5,heartbeatMs=10000,report=()=>{}}){
  if(!storage||!adapters||maxRunMs<1000||maxRunMs>20*60*1000)throw Error('Invalid worker configuration: maxRunMs <=20min');
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>5||!Number.isInteger(batchSize)||batchSize<1||batchSize>10)throw Error('Invalid batching');
  async function execute({runKey,policyKey,tickers,startedAt=null}){
    if(!runKey||!policyKey||!Array.isArray(tickers)||!tickers.length||new Set(tickers).size!==tickers.length)throw Error('Explicit run, policy and unique tickers required');
    const began=clock(),deadline=began+maxRunMs,expiry=()=>deadline-clock(),out={runKey,policyKey,startedAt:startedAt||wallClock().toISOString(),result:'incomplete',reviewed:0,published:false,completed:0,failures:[],remaining:[],elapsedMs:0};
    const completed=await storage.load(runKey,policyKey);
    const verified=new Map((completed||[]).filter(x=>x.status==='verified'&&x.runKey===runKey&&x.policyKey===policyKey).map(x=>[x.ticker+':'+x.stage,x]));
    let stop=false,workError=null,lastHeartbeat=clock();
    const sigHandler=()=>{stop=true;};
    process.on('SIGTERM',sigHandler);process.on('SIGINT',sigHandler);
    const shouldStop=()=>stop||expiry()<25000;
    async function heartbeat(){
      if(clock()-lastHeartbeat>=heartbeatMs){await storage.heartbeat(runKey,wallClock().toISOString());lastHeartbeat=clock();}
    }
    async function runStage(stage){
      const jobs=tickers.filter(ticker=>{
        const fin=verified.get(ticker+':financials')?.evidence;
        if(stage!=='financials'&&fin?.hardGate==='fail')return false;
        return !verified.has(ticker+':'+stage);
      });
      const invoke=adapters[stage];
      if(typeof invoke!=='function')throw Error('Missing production adapter '+stage);
      for(let offset=0;offset<jobs.length;offset+=batchSize){
        if(shouldStop())break;
        const chunk=jobs.slice(offset,offset+batchSize),results=new Array(chunk.length);
        let cursor=0;
        await Promise.all(Array.from({length:Math.min(concurrency,chunk.length)},async()=>{
          while(cursor<chunk.length&&!shouldStop()){
            const i=cursor++,ticker=chunk[i];
            try{
              // Reserve per-request timeout: stalled providers cannot consume entire scan.
              const remaining=expiry();
              const controller=new AbortController();
              const timer=setTimeout(()=>controller.abort(),Math.max(1000,Math.min(30000,remaining-10000)));
              try{
                const context=Object.fromEntries(STAGES.filter(s=>verified.has(ticker+':'+s)).map(s=>[s,verified.get(ticker+':'+s).evidence]));
                const evidence=ensureEvidence(await invoke({ticker,context,runKey,policyKey,signal:controller.signal}),stage,ticker);
                results[i]={ticker,stage,runKey,policyKey,status:'verified',evidence,recordedAt:wallClock().toISOString()};
              }finally{clearTimeout(timer);}
            }catch(e){results[i]={ticker,stage,runKey,policyKey,status:'failed',reason:String(e?.message||e).slice(0,350),recordedAt:wallClock().toISOString()};}
          }
        }));
        const rows=results.filter(Boolean);
        if(rows.length){
          await storage.saveBatch({runKey,policyKey,stage,rows,recordedAt:wallClock().toISOString()});
          for(const row of rows){
            if(row.status==='verified')verified.set(row.ticker+':'+row.stage,row);
            else out.failures.push({ticker:row.ticker,stage,reason:row.reason});
          }
        }
        await heartbeat();
        report({runKey,stage,done:verified.size,of:tickers.length*STAGES,remainingMs:Math.max(0,expiry())});
      }
    }
    try{
      for(const stage of STAGES){
        if(shouldStop())break;
        await runStage(stage);
        // Failed primary data never becomes an approved stock, even if later stages return evidence.
        if(out.failures.length)break;
      }
      const decisions=[];
      for(const ticker of tickers){
        const f=verified.get(ticker+':financials')?.evidence;
        if(f?.hardGate==='fail'){
          decisions.push({ticker,status:'rejected',reason:f.rejectReason,source:f.source});continue;
        }
        if(!STAGES.every(s=>verified.has(ticker+':'+s))){out.remaining.push(ticker);continue;}
        const stages=Object.fromEntries(STAGES.map(s=>[s,verified.get(ticker+':'+s).evidence]));
        const events=stages.issuer_events;
        if(events.thesisStatus==='broken')decisions.push({ticker,status:'rejected',reason:events.reason||'Thesis broken',source:events.source});
        else if(stages.valuation.valuationVerified===true&&stages.public_support.supportVerified===true){
          decisions.push({ticker,status:'qualified',financialGatesVerified:true,issuerEventsVerified:true,valuationVerified:true,supportVerified:true,stages,contractReady:stages.leap_contract.contractReady===true});
        }else out.remaining.push(ticker);
      }
      out.reviewed=decisions.length;out.completed=verified.size;
      // Only authorized publisher with strict validator can turn evidence into public rows.
      if(!out.remaining.length&&!out.failures.length&&decisions.length===tickers.length&&decisions.every(validDecision)&&expiry()>15000&&adapters.publish){
        await adapters.publish({runKey,policyKey,decisions,signal:AbortSignal.timeout(Math.min(10000,Math.max(1000,expiry()-2000)))});
        out.published=true;out.result='completed';
      }else out.result=expiry()<=25000?'deadline_reached':'incomplete';
    }catch(e){workError=String(e?.message||e);out.failures.push({stage:'worker',reason:workError});out.result=expiry()<=25000?'deadline_reached':'blocked';}
    finally{
      out.elapsedMs=Math.max(0,clock()-began);
      await storage.finish({runKey,status:out.published?'completed':out.result,completed:out.reviewed,failures:out.failures,remaining:out.remaining,elapsedMs:out.elapsedMs});
      process.off('SIGTERM',sigHandler);process.off('SIGINT',sigHandler);
    }
    return out;
  }
  return {execute};
}
module.exports={makeRunner,STAGES,DEFAULT_MAX_MS,scheduleDue,chicagoClock,ensureEvidence,validDecision};
