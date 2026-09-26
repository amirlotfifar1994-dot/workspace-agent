const assert=require('assert');
const fs=require('fs');const fsp=fs.promises;const path=require('path');const os=require('os');
const {ExplorerBatchStore}=require('../electron/services/explorer-batch-store.cjs');
const {buildBatchManifest,processBatchChunk}=require('../electron/services/explorer-batch-service.cjs');

(async()=>{
  const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-batch-fence-')),root=path.join(base,'workspace'),dest=path.join(root,'dest');await fsp.mkdir(dest,{recursive:true});await fsp.writeFile(path.join(root,'a.txt'),'A'.repeat(4096));
  const store=new ExplorerBatchStore(base);
  try{
    const plan=await buildBatchManifest({root,operation:'copy',sourcesRelative:['a.txt'],destinationDirRelative:'dest'});
    store.createJob({id:'job-fence',cycleId:'cycle-fence',root,sourceRoot:root,destinationRoot:root,operation:'copy',destinationDir:plan.destinationDir,conflictPolicy:'skip',duplicateAware:true,items:plan.items});
    let fired=false;
    const first=await processBatchChunk(store,'job-fence',{limit:4,commitGuard:async({phase})=>{if(!fired&&phase==='before-batch-copy-commit'){fired=true;throw Object.assign(new Error('stale lease'),{code:'EXPLORER_OPERATION_FENCE_STALE'});}}});
    assert.equal(first.status,'paused');assert.equal(first.blocker.category,'system');assert.equal(first.blocker.code,'EXPLORER_OPERATION_FENCE_STALE');assert.equal(fs.existsSync(path.join(dest,'a.txt')),false);
    const item=store.item('job-fence',0);assert.equal(item.state,'commit-ready','commit intent should remain checkpointed with its stage');assert(item.stage_path&&fs.existsSync(item.stage_path));
    const second=await processBatchChunk(store,'job-fence',{limit:4});assert.equal(second.status,'completed');assert.equal(await fsp.readFile(path.join(dest,'a.txt'),'utf8'),'A'.repeat(4096));
    console.log('batch-power-fence-rc1.test.cjs PASS',{pausedBeforeCommit:true,resume:true});
  }finally{store.close();await fsp.rm(base,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
