const assert=require('assert');const os=require('os');const fs=require('fs');const fsp=fs.promises;const path=require('path');
const{CycleStore}=require('../electron/services/cycle-store.cjs');const{CycleEngine}=require('../electron/services/cycle-engine.cjs');const{healthCycle,duplicateReviewCycle,organizeCycle}=require('../electron/services/file-cycles.cjs');
(async()=>{
  const workspace=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-cycle-workspace-'));const state=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-cycle-state-'));
  await fsp.writeFile(path.join(workspace,'original.txt'),'duplicate-live');await new Promise(r=>setTimeout(r,5));await fsp.writeFile(path.join(workspace,'original copy.txt'),'duplicate-live');await fsp.writeFile(path.join(workspace,'image.jpg'),'image-data');
  const store=new CycleStore(state);const engine=new CycleEngine({store,maxIterations:8});const qh=duplicateReviewCycle(),oh=organizeCycle();engine.register('duplicate-review',qh);engine.register('workspace-health',healthCycle());engine.register('organize',oh);
  let c=engine.create('workspace-health',{root:workspace});c=await engine.run(c.id);assert.equal(c.status,'completed');assert.ok(c.end);assert.equal(c.end.quality,'verified');
  let q=engine.create('duplicate-review',{root:workspace});q=await engine.run(q.id);assert.equal(q.status,'waiting-confirmation');assert.equal(q.operations.length,1);q=await engine.confirm(q.id,'approve');assert.equal(q.status,'completed');assert.equal(q.verification.ok,true);assert.ok(fs.existsSync(q.quarantineBase));const restored=await qh.undo(q);assert.equal(restored.every(x=>x.ok),true);
  let o=engine.create('organize',{root:workspace,mode:'type'});o=await engine.run(o.id);assert.equal(o.status,'waiting-confirmation');assert.ok(o.operations.length>=3);o=await engine.confirm(o.id,'approve');assert.equal(o.status,'completed');assert.equal(o.verification.ok,true);const undone=await oh.undo(o);assert.equal(undone.every(x=>x.ok),true);
  console.log('file-cycles.integration.test: OK');
})().catch(e=>{console.error(e);process.exit(1)});
