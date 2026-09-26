const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const os=require('os');
const {CycleStore}=require('../electron/services/cycle-store.cjs');
const {ExplorerBatchStore}=require('../electron/services/explorer-batch-store.cjs');
const {reconcileStartupWriteFreshness}=require('../electron/services/index-freshness-guard.cjs');

(async()=>{
  const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-rc1-startup-freshness-')),root=path.join(base,'root'),dst=path.join(base,'dst');await fsp.mkdir(root);await fsp.mkdir(dst);
  const cycles=new CycleStore(path.join(base,'state'));
  cycles.save({id:'cycle-interrupted',type:'explorer-batch-copy',status:'interrupted',updatedAt:new Date().toISOString(),steps:[],evidence:[]});
  const batches=new ExplorerBatchStore(path.join(base,'batch-state'));
  batches.createJob({id:'job-running',cycleId:'cycle-interrupted',root,sourceRoot:root,destinationRoot:dst,operation:'copy',destinationDir:dst,conflictPolicy:'skip',duplicateAware:false,items:[]});
  batches.mark('job-running',{status:'running'});
  // Even a job whose own status already says completed is still suspect if its cycle checkpoint was interrupted after filesystem work.
  batches.createJob({id:'job-completed-window',cycleId:'cycle-interrupted',root,sourceRoot:root,destinationRoot:dst,operation:'copy',destinationDir:dst,conflictPolicy:'skip',duplicateAware:false,items:[]});
  batches.mark('job-completed-window',{status:'completed'});

  const markedIndex=[],markedWatcher=[];
  const fakeIndex={markStale:(r,reason)=>{markedIndex.push([path.resolve(r),reason]);return{ok:true};}};
  const fakeWatcher={markDirty:(r,reason)=>{markedWatcher.push([path.resolve(r),reason]);return{root:r,reason};}};
  const recoveryService={inspect:()=>[{id:'tx-pending',root,cycleId:'cycle-interrupted',operations:[],status:'prepared'}]};
  const result=await reconcileStartupWriteFreshness({cycleStore:cycles,batchStore:batches,recoveryService,index:fakeIndex,watcher:fakeWatcher});
  assert.equal(result.interruptedCycles,1);assert.equal(result.batchJobs,2);assert.equal(result.batchJobsChanged,1);assert.equal(result.recoveryTransactions,1);
  assert.equal(batches.get('job-running').status,'interrupted');assert.equal(batches.get('job-completed-window').status,'completed');
  assert(markedIndex.some(([r])=>r===path.resolve(root)));assert(markedIndex.some(([r])=>r===path.resolve(dst)));assert.equal(markedWatcher.length,markedIndex.length);

  batches.close();await fsp.rm(base,{recursive:true,force:true});
  console.log('startup-write-freshness-rc1.test.cjs PASS',{runningJobInterrupted:true,completedWindowMarked:true,recoveryRootMarked:true});
})().catch(e=>{console.error(e);process.exit(1)});
