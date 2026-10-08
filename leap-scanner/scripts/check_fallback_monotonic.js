// Guard append-only publication semantics in checked-in fallback JSON. Runs on GitHub Actions.
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
for(const kind of ['research','market']){
  const name=kind+'-latest.json';
  const current=JSON.parse(fs.readFileSync(path.join(root,'dist/data',name),'utf8'));
  const currentTime=Date.parse(current.scanCompletedAt);
  assert.ok(Number.isFinite(currentTime),kind+' fallback must have a valid scanCompletedAt');
  let previous;
  try{
    previous=JSON.parse(execFileSync('git',['show','HEAD^:leap-scanner/dist/data/'+name],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}));
  }catch{
    console.log(kind+': no previous checked-in fallback; skip parent comparison');
    continue;
  }
  const previousTime=Date.parse(previous.scanCompletedAt);
  assert.ok(Number.isFinite(previousTime),kind+' parent fallback completion timestamp must be valid');
  assert.ok(currentTime>=previousTime,kind+' publication rollback: '+current.scanCompletedAt+' < '+previous.scanCompletedAt);
  console.log(kind+' fallback monotonic: '+previous.scanCompletedAt+' -> '+current.scanCompletedAt);
}
