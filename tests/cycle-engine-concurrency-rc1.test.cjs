const assert=require('assert');
const fs=require('fs');const fsp=fs.promises;const path=require('path');const os=require('os');
const {CycleStore}=require('../electron/services/cycle-store.cjs');
const {CycleEngine}=require('../electron/services/cycle-engine.cjs');
(async()=>{
  const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-cycle-concurrency-'));const store=new CycleStore(base);const engine=new CycleEngine({store,maxIterations:4,maxWallTimeMs:10000});let calls=0;
  engine.register('slow',{async next(){calls++;await new Promise(r=>setTimeout(r,30));return{status:'completed',result:{calls}};}});
  const c=engine.create('slow',{});const [a,b]=await Promise.all([engine.run(c.id),engine.run(c.id)]);assert.equal(a.status,'completed');assert.equal(b.status,'completed');assert.equal(calls,1,'same cycle must not execute next() concurrently');assert.equal(engine.inFlight.size,0);
  engine.register('rollback-test',{async next(){await new Promise(r=>setTimeout(r,30));return{status:'completed',completedOperation:{},undoStack:[{}]};},async undo(){return[{ok:true}]}});const r=engine.create('rollback-test',{});const running=engine.run(r.id);await new Promise(x=>setTimeout(x,5));const rb=await engine.rollback(r.id);assert.equal(rb.ok,false);assert.equal(rb.code,'CYCLE_BUSY');await running;
  let blocked=true,leaseCalls=0;const store2=new CycleStore(path.join(base,'lease-store'));const engine2=new CycleEngine({store:store2,maxIterations:4,maxWallTimeMs:10000,stepLease:async()=>{leaseCalls++;return blocked?{ok:false,code:'EXPLORER_OPERATION_BUSY',message:'busy'}:{ok:true,lease:{release:()=>{}}};}});engine2.register('leased',{resumable:true,async next(){return{status:'completed'};}});let l=engine2.create('leased',{});l=await engine2.run(l.id);assert.equal(l.status,'paused');assert.equal(l.iteration,0,'blocked lease must not consume iteration budget');blocked=false;l=await engine2.resume(l.id);assert.equal(l.status,'completed');assert.equal(l.iteration,1);assert(leaseCalls>=2);
  await fsp.rm(base,{recursive:true,force:true});console.log('cycle-engine-concurrency-rc1.test.cjs PASS',{dedupe:true,rollbackGuard:true,stepLease:true});
})().catch(e=>{console.error(e);process.exit(1)});
