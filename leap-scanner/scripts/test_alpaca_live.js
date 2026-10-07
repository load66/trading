// Owner quotes must never be presented as live after polling fails or the page is hidden.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');
assert.ok(!html.includes('\\n<link')&&!html.includes('\\n<script'),'Literal backslash-n must not render above the header');
const listeners={},elements={};
for(const id of ['alpaca-live-status','alpaca-signin-form','alpaca-live-controls','alpaca-live-description']){
  elements[id]={style:{},className:'',textContent:'',hidden:false};
}
const document={
  readyState:'complete',visibilityState:'visible',
  getElementById:id=>elements[id]||null,querySelector:()=>null,querySelectorAll:()=>[],
  addEventListener:(name,fn)=>listeners[name]=fn
};
const storage={};
const localStorage={
  getItem:key=>storage[key]||null,
  setItem:(key,value)=>storage[key]=value,
  removeItem:key=>delete storage[key]
};
storage['leaps-owner-auth']=JSON.stringify({access_token:'test-token',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600});
let fail=false,holdQuote=false,releaseQuote,unauthorizedNext=false,staleQqq=false,rendered=[],requested=[];
const window={addEventListener:(name,fn)=>listeners[name]=fn};
const context=vm.createContext({window,document,localStorage,Date,Number,Object,String,Boolean,Intl,console});
const appSource=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('load().catch(')[0];
vm.runInContext(appSource,context);
vm.runInContext('market={candidatePlans:[{ticker:"ADSK",price:210,todayPct:-1,entry1:"$200–205",add2:"$180–185",finalAdd:"$160–165"}]}',context);
window.renderAll=()=>rendered.push(vm.runInContext('planFor("ADSK").price',context));
const fetch=async url=>{
  if(url.includes('leap_research_snapshots'))return {ok:true,json:async()=>[{payload:{candidates:[{ticker:'ADSK',qualified:true}]}}]};
  if(url.includes('/quotes')){
    requested.push(url);
    if(fail)throw new Error('Network unavailable');
    if(unauthorizedNext){unauthorizedNext=false;return {ok:false,status:401,json:async()=>({error:'Unauthorized'})};}
    if(holdQuote)await new Promise(resolve=>{releaseQuote=resolve;});
    return {ok:true,json:async()=>({feed:'iex',asOf:new Date().toISOString(),quotes:{ADSK:{price:200,dayChangePct:-3,observedAt:new Date().toISOString()},SPY:{price:500,dayChangePct:-2,observedAt:new Date().toISOString()},QQQ:{price:400,dayChangePct:-3,observedAt:new Date(Date.now()-(staleQqq?600000:0)).toISOString()}}})};
  }
  throw new Error('Unexpected request: '+url);
};
let statusTick;
Object.assign(context,{fetch,setTimeout:()=>1,clearTimeout:()=>{},setInterval:fn=>{statusTick=fn;}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/alpaca-live.js'),'utf8'),context);
const drain=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
(async()=>{
  await drain();
  assert.equal(rendered.at(-1),200);
  assert.ok(requested[0].includes('ADSK')&&requested[0].includes('SPY')&&requested[0].includes('QQQ'),'Owner batch includes qualified stocks and market ETFs');
  assert.equal(vm.runInContext('supportTiming(planFor("ADSK")).state',context),'in');
  assert.equal(vm.runInContext('supportTiming({price:225.14,entry1:"$221–225",add2:"$198–203",finalAdd:"$154–160"}).state',context),'near');
  assert.equal(vm.runInContext('supportTiming({price:224.61,entry1:"$221–225",add2:"$198–203",finalAdd:"$154–160"}).state',context),'in');
  assert.ok(vm.runInContext('marketStat("SPY",{close:190,dayChangePct:-1})',context).includes('$500.00'));
  assert.ok(vm.runInContext('marketStat("VIX",{value:16,dayChangePct:1})',context).includes('VIX · SAVED'));
  assert.match(elements['alpaca-live-status'].textContent,/ALPACA IEX LIVE/);
  staleQqq=true;listeners.focus();await drain();
  assert.equal(window.leapsOwnerPriceState.count,2);
  assert.ok(vm.runInContext('marketStat("QQQ",{close:390,dayChangePct:-1})',context).includes('$390.00'),'Stale ETF trade uses saved price');
  assert.match(elements['alpaca-live-status'].textContent,/2\/3/);
  staleQqq=false;listeners.focus();await drain();
  assert.equal(window.leapsOwnerPriceState.count,3);
  fail=true;listeners.focus();await drain();
  assert.equal(rendered.at(-1),210,'Failed poll restores scheduled plan');
  assert.ok(vm.runInContext('marketStat("SPY",{close:190,dayChangePct:-1})',context).includes('$190.00'));
  assert.match(elements['alpaca-live-status'].textContent,/LIVE PRICE ERROR/);
  statusTick();
  assert.match(elements['alpaca-live-status'].textContent,/LIVE PRICE ERROR/,'Status timer must preserve error');
  fail=false;listeners.focus();await drain();
  assert.equal(rendered.at(-1),200);
  assert.match(elements['alpaca-live-status'].textContent,/ALPACA IEX LIVE/);
  holdQuote=true;listeners.focus();await drain();
  document.visibilityState='hidden';listeners.visibilitychange();
  assert.equal(rendered.at(-1),210,'Hidden tab must release the old quote overlay');
  releaseQuote();await drain();
  assert.equal(rendered.at(-1),210,'In-flight quotes cannot restore a hidden overlay');
  document.visibilityState='visible';holdQuote=false;listeners.visibilitychange();await drain();
  assert.equal(rendered.at(-1),200);
  holdQuote=true;listeners.focus();await drain();
  unauthorizedNext=true;listeners.focus();await drain();
  assert.equal(elements['alpaca-signin-form'].hidden,false,'Sign-in returns after an unauthorized response');
  assert.match(elements['alpaca-live-status'].textContent,/OWNER LIVE OFF/);
  releaseQuote();await drain();
  assert.equal(rendered.at(-1),210,'An older response cannot restore quotes after session ends');
  assert.match(elements['alpaca-live-status'].textContent,/OWNER LIVE OFF/);
  console.log('Owner live quote fallback, race handling, and clean header passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
