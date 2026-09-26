const assert=require('assert');const os=require('os');const fs=require('fs');const fsp=fs.promises;const path=require('path');
const{CycleStore}=require('../electron/services/cycle-store.cjs');const{CycleEngine}=require('../electron/services/cycle-engine.cjs');const{SnapshotStore}=require('../electron/services/snapshot-store.cjs');
const{healthCycle,duplicateCycle,duplicateReviewCycle,organizeCycle}=require('../electron/services/file-cycles.cjs');
const{fileSearchCycle,snapshotCycle,snapshotDiffCycle,maintenanceCleanupCycle,renameCycle,missionCycle}=require('../electron/services/workspace-cycles.cjs');
(async()=>{
 const workspace=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-mission-ws-'));const state=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-mission-state-'));const old=Date.now()-20*86400000;
 await fsp.writeFile(path.join(workspace,'a.txt'),'same');await fsp.writeFile(path.join(workspace,'a copy.txt'),'same');await fsp.writeFile(path.join(workspace,'cache.tmp'),'junk');await fsp.utimes(path.join(workspace,'cache.tmp'),old/1000,old/1000);
 const store=new CycleStore(state),snapshots=new SnapshotStore(state),engine=new CycleEngine({store,maxIterations:30});
 engine.register('workspace-health',healthCycle());engine.register('duplicates',duplicateCycle());engine.register('duplicate-review',duplicateReviewCycle());engine.register('organize',organizeCycle());engine.register('file-search',fileSearchCycle());engine.register('snapshot',snapshotCycle(snapshots));engine.register('snapshot-diff',snapshotDiffCycle(snapshots));engine.register('maintenance-cleanup',maintenanceCleanupCycle());engine.register('rename',renameCycle());engine.register('mission',missionCycle({getEngine:()=>engine}));
 let m=engine.create('mission',{root:workspace,command:'این پوشه را بررسی کن و junk های قدیمی را پاکسازی کن ولی حذف دائمی نکن'});m=await engine.run(m.id);assert.equal(m.status,'waiting-confirmation');assert.ok(m.pendingChildId);m=await engine.confirm(m.id,'approve');assert.equal(m.status,'completed');assert.ok(m.childCycles.length>=2);assert.ok(fs.existsSync(path.join(workspace,'.workspace-agent-quarantine')));
 const rb=await engine.rollback(m.id);assert.equal(rb.ok,true);assert.ok(fs.existsSync(path.join(workspace,'cache.tmp')));
 console.log('mission.integration.test: OK');
})().catch(e=>{console.error(e);process.exit(1)});
