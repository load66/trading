// Guard append-only publication semantics in checked-in fallback JSON. Runs on GitHub Actions.
// A research rollback is allowed only as a one-time, cryptographically pinned recovery from an
// invalid parent fallback to a fallback that passes the strict publication validator.
const {execFileSync,spawnSync}=require('node:child_process');
const crypto=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');

const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const validate=(researchPath,marketPath)=>spawnSync(
  'python3',[path.join(root,'scripts/validate_publication.py'),researchPath,marketPath],
  {cwd:root,encoding:'utf8'}
);

function verifyResearchRecovery({current,currentRaw,previous,previousRaw}){
  const manifestPath=path.join(root,'research/fallback-recovery.json');
  assert.ok(fs.existsSync(manifestPath),'research fallback rollback requires research/fallback-recovery.json');
  const recovery=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  assert.equal(recovery.fromScanCompletedAt,previous.scanCompletedAt,'recovery source timestamp mismatch');
  assert.equal(recovery.toScanCompletedAt,current.scanCompletedAt,'recovery target timestamp mismatch');
  assert.equal(recovery.fromSha256,sha256(previousRaw),'recovery source hash mismatch');
  assert.equal(recovery.toSha256,sha256(currentRaw),'recovery target hash mismatch');
  assert.ok(typeof recovery.reason==='string'&&recovery.reason.trim(),'recovery reason is required');
  assert.ok(typeof recovery.resumeRunKey==='string'&&recovery.resumeRunKey.trim(),'recovery resumeRunKey is required');
  assert.ok(Array.isArray(recovery.previousValidationErrors)&&recovery.previousValidationErrors.length,'previous validation errors are required');

  assert.equal(recovery.quarantinedGitObject,'HEAD^:leap-scanner/dist/data/research-latest.json','recovery Git audit pointer mismatch');

  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'leaps-fallback-recovery-'));
  try{
    const previousPath=path.join(temporary,'previous-research.json');
    fs.writeFileSync(previousPath,previousRaw);
    const marketPath=path.join(root,'dist/data/market-latest.json');
    const oldResult=validate(previousPath,marketPath);
    const newResult=validate(path.join(root,'dist/data/research-latest.json'),marketPath);
    assert.notEqual(oldResult.status,0,'rollback source unexpectedly passes strict publication validation');
    assert.equal(newResult.status,0,'rollback target fails strict publication validation:\n'+newResult.stderr);
    for(const expected of recovery.previousValidationErrors){
      assert.ok(oldResult.stderr.includes(expected),'documented source validation error not reproduced: '+expected);
    }
  }finally{
    fs.rmSync(temporary,{recursive:true,force:true});
  }
  console.log('research fallback verified recovery: '+previous.scanCompletedAt+' -> '+current.scanCompletedAt);
}

for(const kind of ['research','market']){
  const name=kind+'-latest.json';
  const currentPath=path.join(root,'dist/data',name);
  const currentRaw=fs.readFileSync(currentPath);
  const current=JSON.parse(currentRaw);
  const currentTime=Date.parse(current.scanCompletedAt);
  assert.ok(Number.isFinite(currentTime),kind+' fallback must have a valid scanCompletedAt');
  let previousRaw;
  try{
    previousRaw=execFileSync('git',['show','HEAD^:leap-scanner/dist/data/'+name],{cwd:root,stdio:['ignore','pipe','ignore']});
  }catch{
    console.log(kind+': no previous checked-in fallback; skip parent comparison');
    continue;
  }
  const previous=JSON.parse(previousRaw);
  const previousTime=Date.parse(previous.scanCompletedAt);
  assert.ok(Number.isFinite(previousTime),kind+' parent fallback completion timestamp must be valid');
  if(currentTime<previousTime&&kind==='research'){
    verifyResearchRecovery({current,currentRaw,previous,previousRaw});
    continue;
  }
  assert.ok(currentTime>=previousTime,kind+' publication rollback: '+current.scanCompletedAt+' < '+previous.scanCompletedAt);
  console.log(kind+' fallback monotonic: '+previous.scanCompletedAt+' -> '+current.scanCompletedAt);
}
