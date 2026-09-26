const assert=require('assert');const fs=require('fs');const os=require('os');const path=require('path');
const {fileRows,validatePointerDocument,normalizePointerRef}=require('../scripts/rc1-execution-handoff.cjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wa-pointer-semantics-'));
try{
  for(const f of ['payload.txt','package-lock.json'])fs.writeFileSync(path.join(tmp,f),'x\n');
  const pointer=path.join(tmp,'primary-pointer.json');
  const base={schemaVersion:'workspace-agent-rc1-primary-pointer-v1',executionId:'exec-pointer',certificationReport:'payload.txt',evidenceBundle:'payload.txt',releaseManifest:'payload.txt',sha256Sums:'payload.txt',manualEvidenceTemplate:'payload.txt',packageLock:'package-lock.json'};
  fs.writeFileSync(pointer,JSON.stringify(base));let rows=fileRows(tmp);let r=validatePointerDocument({dir:tmp,pointerPath:pointer,role:'primary',executionId:'exec-pointer',rows});assert.equal(r.refs.certificationReport,'payload.txt');
  fs.writeFileSync(pointer,JSON.stringify({...base,certificationReport:'../outside.json'}));rows=fileRows(tmp);assert.throws(()=>validatePointerDocument({dir:tmp,pointerPath:pointer,role:'primary',executionId:'exec-pointer',rows}),/HANDOFF_POINTER_REF_INVALID/);
  fs.writeFileSync(pointer,JSON.stringify({...base,certificationReport:'C:\\outside\\report.json'}));rows=fileRows(tmp);assert.throws(()=>validatePointerDocument({dir:tmp,pointerPath:pointer,role:'primary',executionId:'exec-pointer',rows}),/HANDOFF_POINTER_REF_INVALID/);
  fs.writeFileSync(pointer,JSON.stringify({...base,certificationReport:'missing.json'}));rows=fileRows(tmp);assert.throws(()=>validatePointerDocument({dir:tmp,pointerPath:pointer,role:'primary',executionId:'exec-pointer',rows}),/(ENOENT|HANDOFF_POINTER_REF_NOT_DECLARED)/);
  const peer=path.join(tmp,'peer-pointer.json');fs.writeFileSync(peer,JSON.stringify({schemaVersion:'workspace-agent-rc1-peer-pointer-v1',executionId:'exec-pointer',windowsFamily:'Windows11',primaryWindowsFamily:'Windows11',certificationReport:'payload.txt',evidenceBundle:'payload.txt',packageLock:'package-lock.json'}));rows=fileRows(tmp);assert.throws(()=>validatePointerDocument({dir:tmp,pointerPath:peer,role:'peer',executionId:'exec-pointer',rows}),/HANDOFF_POINTER_WINDOWS_PAIR_INVALID/);
  assert.throws(()=>normalizePointerRef('folder/../escape.txt','x'),/HANDOFF_POINTER_REF_INVALID/);
  console.log('rc1-handoff-pointer-semantics-rc1 PASS',{traversalBlocked:true,absoluteBlocked:true,undeclaredBlocked:true,peerPairBound:true});
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
