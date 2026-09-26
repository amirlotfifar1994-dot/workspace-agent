const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const root=path.resolve(__dirname,'..');
const {createHandoff,verifyHandoff}=require('../scripts/rc1-execution-handoff.cjs');
const lock=path.join(root,'package-lock.json');
const had=fs.existsSync(lock);const old=had?fs.readFileSync(lock):null;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wa-rc1-handoff-'));
try{
  if(!had)fs.writeFileSync(lock,JSON.stringify({name:'windows-workspace-agent',version:'1.0.0-rc1',lockfileVersion:3,requires:true,packages:{}},null,2));
  fs.writeFileSync(path.join(tmp,'payload.txt'),'primary evidence\n');fs.copyFileSync(lock,path.join(tmp,'package-lock.json'));
  const pointer=path.join(tmp,'primary-pointer.json');fs.writeFileSync(pointer,JSON.stringify({schemaVersion:'workspace-agent-rc1-primary-pointer-v1',executionId:'exec-test',certificationReport:'payload.txt',evidenceBundle:'payload.txt',releaseManifest:'payload.txt',sha256Sums:'payload.txt',manualEvidenceTemplate:'payload.txt',packageLock:'package-lock.json'}));
  const manifest=path.join(tmp,'handoff-manifest.json');
  const created=createHandoff({dir:tmp,out:manifest,role:'primary',executionId:'exec-test',pointer});
  assert(created.ok);assert.equal(created.role,'primary');assert.equal(created.executionId,'exec-test');assert(/^[a-f0-9]{64}$/.test(created.handoffId));assert(/^[a-f0-9]{64}$/.test(created.releaseIdentitySha256));
  let verified=verifyHandoff({dir:tmp,manifestPath:manifest,requireCurrentSource:true});assert(verified.ok,JSON.stringify(verified.errors));
  fs.writeFileSync(lock,JSON.stringify({name:'windows-workspace-agent',version:'1.0.0-rc1',lockfileVersion:3,requires:true,packages:{},identityMutation:true},null,2));
  verified=verifyHandoff({dir:tmp,manifestPath:manifest,requireCurrentSource:true});assert(!verified.ok);assert(verified.errors.includes('HANDOFF_CURRENT_LOCK_MISMATCH'));assert(verified.errors.includes('HANDOFF_CURRENT_RELEASE_IDENTITY_MISMATCH'));
  if(had)fs.writeFileSync(lock,old);else fs.writeFileSync(lock,JSON.stringify({name:'windows-workspace-agent',version:'1.0.0-rc1',lockfileVersion:3,requires:true,packages:{}},null,2));
  fs.appendFileSync(path.join(tmp,'payload.txt'),'tampered');verified=verifyHandoff({dir:tmp,manifestPath:manifest,requireCurrentSource:true});assert(!verified.ok);assert(verified.errors.some(x=>x.includes('HANDOFF_FILE_TAMPERED')||x==='HANDOFF_AGGREGATE_MISMATCH'));
  console.log('rc1-execution-handoff PASS');
}finally{fs.rmSync(tmp,{recursive:true,force:true});if(had)fs.writeFileSync(lock,old);else fs.rmSync(lock,{force:true});}
