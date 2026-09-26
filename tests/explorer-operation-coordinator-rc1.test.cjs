const assert=require('assert');
const fs=require('fs');
const path=require('path');
const os=require('os');
const {ExplorerOperationCoordinator}=require('../electron/services/explorer-operation-coordinator.cjs');

(()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'wa-coordinator-'));
  const root=path.join(base,'root'),a=path.join(root,'a'),b=path.join(root,'b');fs.mkdirSync(a,{recursive:true});fs.mkdirSync(b,{recursive:true});
  const c=new ExplorerOperationCoordinator({maxLeases:16});
  const r1=c.acquire('reader-1',{paths:[{path:root,mode:'read'}]});assert(r1.ok);
  const r2=c.acquire('reader-2',{paths:[{path:a,mode:'read'}]});assert(r2.ok,'overlapping readers must coexist');
  const w1=c.acquire('writer-1',{paths:[{path:a,mode:'write'}]});assert.equal(w1.ok,false);assert.equal(w1.code,'EXPLORER_OPERATION_BUSY');assert.equal(w1.details.kind,'path');
  c.release(r1.lease);c.release(r2.lease);
  const w2=c.acquire('writer-1',{paths:[{path:a,mode:'write'}]});assert(w2.ok);
  const w3=c.acquire('writer-2',{paths:[{path:b,mode:'write'}]});assert(w3.ok,'unrelated sibling writes can coexist');
  c.release(w2.lease);c.release(w3.lease);
  const v1=c.acquire('xmove-1',{paths:[{path:a,mode:'write'}],volumes:[{identity:'volume:A',mode:'exclusive'}]});assert(v1.ok);
  const v2=c.acquire('xcopy-2',{paths:[{path:b,mode:'write'}],volumes:[{identity:'volume:A',mode:'shared'}]});assert.equal(v2.ok,false);assert.equal(v2.details.kind,'volume');c.release(v1.lease);
  const v3=c.acquire('xcopy-2',{paths:[{path:b,mode:'write'}],volumes:[{identity:'volume:A',mode:'shared'}]});assert(v3.ok);c.release(v3.lease);
  assert.equal(c.status().active,0);
  const main=fs.readFileSync(path.join(__dirname,'..','electron','main.cjs'),'utf8');assert(main.includes('app.requestSingleInstanceLock()'),'Electron app must hold a single-instance lock');
  c.close();fs.rmSync(base,{recursive:true,force:true});
  console.log('explorer-operation-coordinator-rc1.test.cjs PASS',{pathLease:true,volumeLease:true,singleInstance:true});
})();
