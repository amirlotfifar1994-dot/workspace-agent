const assert=require('assert');const fs=require('fs');const fsp=fs.promises;const os=require('os');const path=require('path');
const {PersistentFileIndex}=require('../electron/services/persistent-file-index.cjs');const {FileWatcherService}=require('../electron/services/file-watcher-service.cjs');const {findExactDuplicatesFromIndex}=require('../electron/services/indexed-duplicate-finder.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return true;await sleep(120)}return false;}
(async()=>{
 if(process.platform!=='win32'){console.log('windows-production-v081.uat.cjs SKIP (Windows only)');return;}
 const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-prod-v081-base-'));const root=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-prod-v081-root-'));
 let watcher,index;try{
  for(let d=0;d<20;d++){const dir=path.join(root,`folder-${d}`);await fsp.mkdir(dir);for(let i=0;i<100;i++)await fsp.writeFile(path.join(dir,`file-${i}.txt`),`uat-${d}-${i}`);}
  await fsp.writeFile(path.join(root,'dup-1.bin'),'worker-thread-duplicate');await fsp.writeFile(path.join(root,'dup-2.bin'),'worker-thread-duplicate');
  index=new PersistentFileIndex(base);let st=await index.scan(root,{resume:false,maxWallTimeMs:60000,dbBatchSize:250});while(st.status!=='completed')st=await index.scan(root,{resume:true,maxWallTimeMs:60000,dbBatchSize:250});assert.strictEqual(st.files,2002);assert.strictEqual(index.health().ok,true);
  const dup=await findExactDuplicatesFromIndex(index,root,{concurrency:3,maxCandidateFiles:5000});assert(dup.groups.some(g=>g.files.some(f=>f.path.endsWith('dup-1.bin'))));assert.strictEqual(dup.policy.hashExecution,'worker_threads-with-safe-fallback');
  watcher=new FileWatcherService(base,{debounceMs:100,maxPending:1000,maxBatchSize:100,onBatch:b=>index.reconcileBatch(b)});watcher.add(root,{title:'v0.8.1 Production UAT'});
  const hot=path.join(root,'folder-0','hot.txt');for(let i=0;i<250;i++)await fsp.writeFile(hot,`hot-${i}`);assert(await until(()=>index.search({root,query:'hot.txt'}).total===1),'hot file reconcile timeout');
  const renamed=path.join(root,'folder-0','hot-renamed.txt');await fsp.rename(hot,renamed);assert(await until(()=>index.search({root,query:'hot-renamed.txt'}).total===1),'rename reconcile timeout');assert(await until(()=>index.search({root,query:'hot.txt'}).total===0),'old rename path cleanup timeout');
  await fsp.rm(renamed);assert(await until(()=>index.search({root,query:'hot-renamed.txt'}).total===0),'delete reconcile timeout');
  await sleep(500);await watcher.drain({timeoutMs:10000});const ws=watcher.status();assert(ws.pending===0);const maint=index.maintain();assert.strictEqual(maint.ok,true);
  console.log('windows-production-v081.uat.cjs PASS',{files:st.files,duplicateGroups:dup.groupsTotal,watchReceived:ws.received,coalesced:ws.coalesced,dbMB:Math.round(maint.after.dbBytes/1024/1024)});
 }finally{try{watcher?.stopAll()}catch{}try{index?.close()}catch{}await fsp.rm(base,{recursive:true,force:true});await fsp.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
