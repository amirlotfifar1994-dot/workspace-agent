const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {computeFingerprint}=require('../scripts/source-tree-fingerprint.cjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wa-fp-lock-'));
try{
  fs.writeFileSync(path.join(tmp,'package.json'),JSON.stringify({version:'1.0.0-rc1'}));
  fs.mkdirSync(path.join(tmp,'src'));fs.writeFileSync(path.join(tmp,'src','a.js'),'module.exports=1;\n');
  const a=computeFingerprint(tmp);
  fs.writeFileSync(path.join(tmp,'package-lock.json'),JSON.stringify({name:'x',version:'1.0.0-rc1',lockfileVersion:3,packages:{}}));
  const b=computeFingerprint(tmp);
  fs.writeFileSync(path.join(tmp,'package-lock.json'),JSON.stringify({name:'x',version:'1.0.0-rc1',lockfileVersion:3,packages:{},changed:true}));
  const c=computeFingerprint(tmp);
  assert.equal(a.schemaVersion,'workspace-agent-source-fingerprint-v2');
  assert.equal(a.sha256,b.sha256);assert.equal(b.sha256,c.sha256);assert.equal(a.files,b.files);assert.equal(b.files,c.files);
  fs.writeFileSync(path.join(tmp,'src','a.js'),'module.exports=2;\n');
  const d=computeFingerprint(tmp);assert.notEqual(c.sha256,d.sha256);
  console.log('source-fingerprint-lockfile-invariance-rc1.test.cjs PASS',{lockExcluded:true,sourceMutationDetected:true});
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
