'use strict';
const assert=require('node:assert/strict');
const {preflight,latestPeriodic,cik10,tickerKey,createThrottledFetch}=require('./sec_filing_preflight');
assert.equal(cik10('12345'),'0000012345');
assert.equal(tickerKey('BRK.B'),'BRKB');
const sub={filings:{recent:{form:['8-K','10-Q','10-K'],accessionNumber:['0000000001-26-000013','0000000001-26-000011','0000000001-25-000012'],reportDate:['2026-09-01','2026-06-30','2025-12-31'],filingDate:['2026-10-01','2026-08-03','2026-02-20']}}};
assert.deepEqual(latestPeriodic(sub),{latestFilingId:'0000000001-26-000011',fiscalPeriod:'2026-06-30',filingForm:'10-Q',filedAt:'2026-08-03'});
assert.throws(()=>latestPeriodic({filings:{recent:{form:[]}}}),/No suitable/);
const urls=[],u='https://www.sec.gov/files/company_tickers.json';
const fetcher=async url=>{
  urls.push(url);
  if(url===u)return {'0':{ticker:'AAA',cik_str:1},'1':{ticker:'BBB',cik_str:2},'2':{ticker:'CCC',cik_str:3}};
  if(url.endsWith('0000000003.json'))throw Error('Provider temporarily unreachable');
  return sub;
};
(async()=>{
  const result=await preflight({tickers:['AAA','BBB','CCC','AAA','UNKNOWN'],fetchJson:fetcher,asOf:()=>new Date('2026-10-08T12:31:00Z').toISOString()});
  assert.equal(urls.length,4,'Only one ticker map and one request per unique known CIK');
  assert.equal(result.universeRequested,4);
  assert.equal(result.filingsVerified,2);
  assert.equal(result.qualificationAllowed,false);
  assert.ok(result.rows.filter(x=>x.status==='UNVERIFIED').length===2);
  assert.ok(result.rows.every(x=>x.status!=='FILING_ONLY_NEWS_PENDING'||(x.newsCheckedAt===null&&x.guidanceChange===null)));
  let count=0;const headers=[];
  const controlled=createThrottledFetch({userAgent:'ResearchApp/1.0 analyst@example.com',intervalMs:250,
    fetchFn:async (url,opts)=>{count++;headers.push(opts.headers);return {ok:true,json:async()=>({})};},
    now:()=>0,pause:async()=>{}});
  const [a,b]=await Promise.all([controlled('https://data.sec.gov/submissions/CIK0000000001.json'),controlled('https://data.sec.gov/submissions/CIK0000000002.json')]);
  assert.equal(count,2);
  assert.ok(headers.every(x=>x['User-Agent'].includes('@')));
  await assert.rejects(controlled('https://evil.example.com/'),/Unapproved/);
  assert.throws(()=>createThrottledFetch({userAgent:'Anonymous'}),/SEC_USER_AGENT/);
  console.log('SEC preflight passed: CIK dedup, latest periodic accession, fail-closed missing filings, rate slot reservations, identification and no implied GAAP/FCF/news verification.');
})().catch(e=>{console.error(e);process.exitCode=1;});