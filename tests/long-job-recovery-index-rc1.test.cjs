const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const os=require('os');
const crypto=require('crypto');
const {ExplorerBatchStore}=require('../electron/services/explorer-batch-store.cjs');
const {buildBatchManifest,processBatchChunk,undoBatch}=require('../electron/services/explorer-batch-service.cjs');
const {TransactionStore}=require('../electron/services/transaction-store.cjs');
const {classifyOp}=require('../electron/services/recovery-service.cjs');

async function write(p,text){await fsp.mkdir(path.dirname(p),{recursive:true});await fsp.writeFile(p,text);}
async function hash(p){return crypto.createHash('sha256').update(await fsp.readFile(p)).digest('hex');}

(async()=>{
  const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-rc1-long-job-'));
  const root=path.join(base,'workspace'),dest=path.join(root,'dest');await fsp.mkdir(dest,{recursive:true});
  const store=new ExplorerBatchStore(base);

  // Crash exactly after stage->destination rename but before SQLite item commit: commit-ready evidence resumes safely.
  await write(path.join(root,'replace.txt'),'NEW-VALUE');await write(path.join(dest,'replace.txt'),'OLD-VALUE');
  const plan=await buildBatchManifest({root,operation:'copy',sourcesRelative:['replace.txt'],destinationDirRelative:'dest',conflictPolicy:'replace',duplicateAware:false});
  store.createJob({id:'commit-window',cycleId:'cycle-commit-window',root,sourceRoot:root,destinationRoot:root,operation:'copy',destinationDir:dest,conflictPolicy:'replace',duplicateAware:false,items:plan.items});
  const artifactRoot=path.join(root,'.workspace-agent-batch','commit-window'),stageDir=path.join(artifactRoot,'stage'),backupDir=path.join(artifactRoot,'backup');
  await fsp.mkdir(stageDir,{recursive:true});await fsp.mkdir(backupDir,{recursive:true});
  const stage=path.join(stageDir,'0.part'),backup=path.join(backupDir,'0-replace.txt');
  await fsp.copyFile(path.join(root,'replace.txt'),stage);await fsp.rename(path.join(dest,'replace.txt'),backup);
  const h=await hash(stage);store.updateItem('commit-window',0,{state:'commit-ready',stagePath:stage,backupPath:backup,sourceHash:h,destinationHash:h});
  await fsp.rename(stage,path.join(dest,'replace.txt')); // simulated crash window: DB still says commit-ready
  let out=await processBatchChunk(store,'commit-window',{limit:2});
  assert.equal(out.status,'completed');assert.equal(store.item('commit-window',0).state,'done');assert.equal(await fsp.readFile(path.join(dest,'replace.txt'),'utf8'),'NEW-VALUE');
  let undo=await undoBatch(store,'commit-window');assert.equal(undo[0].ok,true);assert.equal(await fsp.readFile(path.join(dest,'replace.txt'),'utf8'),'OLD-VALUE');

  // Partial rollback is retryable and idempotent: already-rolled-back items are not run again.
  await write(path.join(root,'a.txt'),'A');await write(path.join(root,'b.txt'),'B');
  const plan2=await buildBatchManifest({root,operation:'copy',sourcesRelative:['a.txt','b.txt'],destinationDirRelative:'dest',conflictPolicy:'skip',duplicateAware:false});
  store.createJob({id:'rollback-retry',cycleId:'cycle-rollback-retry',root,sourceRoot:root,destinationRoot:root,operation:'copy',destinationDir:dest,conflictPolicy:'skip',duplicateAware:false,items:plan2.items});
  out=await processBatchChunk(store,'rollback-retry',{limit:8});assert.equal(out.status,'completed');
  await write(path.join(dest,'b.txt'),'B-TAMPERED');
  undo=await undoBatch(store,'rollback-retry');assert(undo.some(x=>x.ok===false));
  assert.equal(store.item('rollback-retry',0).state,'rolled-back');assert.equal(store.item('rollback-retry',1).state,'rollback-failed');assert(!fs.existsSync(path.join(dest,'a.txt')));
  await write(path.join(dest,'b.txt'),'B');
  const retry=await undoBatch(store,'rollback-retry');assert.equal(retry.length,1,'retry must only include the failed rollback item');assert.equal(retry[0].ok,true);
  assert.equal(store.item('rollback-retry',0).state,'rolled-back');assert.equal(store.item('rollback-retry',1).state,'rolled-back');assert.equal(store.get('rollback-retry').status,'rolled-back');

  // Recovery identity evidence must reject an unrelated same-size replacement at the destination.
  const txStore=new TransactionStore(path.join(base,'tx'));
  const src=path.join(root,'identity.txt'),dst=path.join(dest,'identity.txt');await write(src,'12345678');
  const tx=txStore.create({kind:'explorer-move',cycleId:'cycle-identity',root,operations:[{kind:'explorer-move-file',source:src,destination:dst,size:8}]});
  await fsp.rename(src,dst);await new Promise(r=>setTimeout(r,8));await write(dst,'ABCDEFGH');
  const current=txStore.get(tx.id);const classified=classifyOp(current.operations[0]);
  assert.equal(classified.state,'ambiguous');assert.equal(classified.safeResume,false);assert.equal(classified.safeRollback,false);

  store.close();await fsp.rm(base,{recursive:true,force:true});
  console.log('long-job-recovery-index-rc1.test.cjs PASS',{commitWindow:true,rollbackRetry:true,recoveryIdentity:true});
})().catch(e=>{console.error(e);process.exit(1)});
