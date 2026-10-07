// Owner quotes must never be presented as live after polling fails or the page is hidden.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
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
let fail=false,holdQuote=false,releaseQuote,rendered=[];
const window={
  planFor:()=>({price:210,todayPct:-1,entry1:'$200–205'}),
  renderAll:()=>rendered.push(window.planFor('ADSK').price),
  addEventListener:(name,fn)=>listeners[name]=fn
};
const fetch=async url=>{
  if(url.includes('leap_research_snapshots'))return {ok:true,json:async()=>[{payload:{candidates:[{ticker:'ADSK',qualified:true}]}}]};
  if(url.includes('/quotes')){
    if(fail)throw new Error('Network unavailable');
    if(holdQuote)await new Promise(resolve=>{releaseQuote=resolve;});
    return {ok:true,json:async()=>({feed:'iex',asOf:new Date().toISOString(),quotes:{ADSK:{price:200,dayChangePct:-3,observedAt:new Date().toISOString()}}})};
  }
  throw new Error('Unexpected request: '+url);
};
let statusTick;
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../dist/alpaca-live.js'),'utf8'),{
  window,document,localStorage,fetch,Date,Number,Object,String,Boolean,
  setTimeout:()=>1,clearTimeout:()=>{},setInterval:fn=>{statusTick=fn;}
});
const drain=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
(async()=>{
  await drain();
  assert.equal(rendered.at(-1),200);
  assert.match(elements['alpaca-live-status'].textContent,/ALPACA IEX LIVE/);
  fail=true;listeners.focus();await drain();
  assert.equal(rendered.at(-1),210,'Failed poll restores scheduled plan');
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
  console.log('Owner live quote fallback and recovery passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
