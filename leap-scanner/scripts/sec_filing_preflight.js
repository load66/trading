'use strict';
// SEC filing-identity preflight. NOT a stock qualification, FCF verification, or news check.
// No third-party packages or credentials; SEC_USER_AGENT must identify an operator contact.
const fs=require('node:fs');
const {runPool}=require('./fast_scan_runtime');
const secHost='https://data.sec.gov/submissions/CIK';
const companyTickers='https://www.sec.gov/files/company_tickers.json';
function tickerKey(x){return String(x||'').toUpperCase().replace(/[-.]/g,'');}
function cik10(value){
  const s=String(value||'').replace(/\D/g,'');
  if(!s||s.length>10)throw Error('Invalid CIK');
  return s.padStart(10,'0');
}
function latestPeriodic(submissions){
  const r=submissions?.filings?.recent;
  if(!r||!Array.isArray(r.form)||!Array.isArray(r.accessionNumber)||!Array.isArray(r.reportDate))throw Error('SEC filing fields unavailable');
  for(let i=0;i<r.form.length;i++){
    if(!['10-Q','10-K','10-Q/A','10-K/A','20-F','40-F'].includes(String(r.form[i])))continue;
    const filingId=r.accessionNumber[i],period=r.reportDate[i],filedAt=r.filingDate?.[i];
    if(!/^\d{10}-\d{2}-\d{6}$/.test(String(filingId||''))||!/^\d{4}-\d{2}-\d{2}$/.test(String(period||'')))continue;
    return {latestFilingId:filingId,fiscalPeriod:period,filingForm:r.form[i],filedAt:filedAt||null};
  }
  throw Error('No suitable current annual/quarterly SEC filing found');
}
function secMap(data){
  const items=Array.isArray(data)?data:Object.values(data||{});
  const map=new Map();
  for(const item of items){
    if(item?.ticker&&item.cik_str!==undefined){
      map.set(tickerKey(item.ticker),cik10(item.cik_str));
    }
  }
  return map;
}
function createThrottledFetch({fetchFn=fetch,userAgent,intervalMs=250,now=()=>Date.now(),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  if(typeof userAgent!=='string'||!userAgent.includes('@')||userAgent.length<15)throw Error('SEC_USER_AGENT must name a real contact: ResearchClient/1.0 contact@example.com');
  let next=0;
  let reservation=Promise.resolve();
  const request=async url=>{
    if(url!==companyTickers&&!/^https:\/\/data\.sec\.gov\/submissions\/CIK\d{10}\.json$/.test(url))throw Error('Unapproved SEC URL');
    // Reserve a global 250ms request slot even when 4 jobs are concurrent.
    let slot;
    const pending=reservation.then(()=>{slot=Math.max(now(),next);next=slot+intervalMs;});
    reservation=pending.catch(()=>{});
    await pending;
    const wait=slot-now();if(wait>0)await pause(wait);
    const resp=await fetchFn(url,{headers:{'User-Agent':userAgent,'Accept':'application/json'}});
    if(!resp.ok){const e=Object.assign(Error('SEC request failed: HTTP '+resp.status),{status:resp.status});const retry=resp.headers?.get?.('retry-after');if(retry!==null&&retry!==undefined&&/^\d+$/.test(retry))e.retryAfterSeconds=Number(retry);throw e;}
    return resp.json();
  };
  return request;
}
async function preflight({tickers,fetchJson,asOf=()=>new Date().toISOString(),concurrency=4}){
  if(!Array.isArray(tickers)||!tickers.length||typeof fetchJson!=='function')throw Error('Tickers and SEC JSON fetcher required');
  const map=secMap(await fetchJson(companyTickers));
  const unique=[...new Set(tickers.map(t=>String(typeof t==='string'?t:t?.ticker||'').toUpperCase().trim()))];
  const result=await runPool(unique,concurrency,async ticker=>{
    const cik=map.get(tickerKey(ticker));
    if(!cik)throw Error('No verified CIK mapping for '+ticker);
    const submission=await fetchJson(secHost+cik+'.json');
    const filing=latestPeriodic(submission),checkedAt=asOf();
    return {ticker,cik,...filing,filingCheckedAt:checkedAt,latestFilingVerified:true,
      filingSourceUrl:secHost+cik+'.json',newsCheckedAt:null,materialChange:null,
      guidanceChange:null,newEarningsReleased:null,hardGateAlert:null,
      status:'FILING_ONLY_NEWS_PENDING',
      note:'SEC filing identity confirmed, but independent fresh news/guidance review and GAAP/FCF verification are still required before qualification or audited-data reuse.'};
  });
  return {asOf:asOf(),universeRequested:unique.length,filingsVerified:result.results.filter(x=>x.ok).length,
    exceptions:result.results.filter(x=>!x.ok).map((x,i)=>({ticker:unique[result.results.indexOf(x)],error:x.error})),
    rows:result.results.map((x,i)=>x.ok?x.value:{ticker:unique[i],status:'UNVERIFIED',error:x.error}),
    qualificationAllowed:false};
}
async function cli(){
  const [input,output]=process.argv.slice(2);
  if(!input||!output)throw Error('Usage: SEC_USER_AGENT="Research App/1.0 email@domain" node scripts/sec_filing_preflight.js discovery.json evidence.json');
  const obj=JSON.parse(fs.readFileSync(input,'utf8'));
  const fetcher=createThrottledFetch({userAgent:process.env.SEC_USER_AGENT});
  const result=await preflight({tickers:obj.discovery||obj.tickers||obj,fetchJson:fetcher});
  // Atomic local checkpoint; production Supabase publication is intentionally forbidden.
  const tmp=output+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(result,null,2)+'\n');
  fs.renameSync(tmp,output);
  console.log('SEC filing preflight: '+result.filingsVerified+'/'+result.universeRequested+' latest filing IDs; full financial/news audit still required.');
}
if(require.main===module)cli().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={tickerKey,cik10,latestPeriodic,secMap,createThrottledFetch,preflight};