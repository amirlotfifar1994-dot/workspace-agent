const assert=require('assert');
const os=require('os');
const path=require('path');
const fs=require('fs');
const fsp=fs.promises;
const {PersistentFileIndex}=require('../electron/services/persistent-file-index.cjs');
const {findExactDuplicatesFromIndex}=require('../electron/services/indexed-duplicate-finder.cjs');
const {FileWatcherService}=require('../electron/services/file-watcher-service.cjs');

(async()=>{
 const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v081-'));const root=path.join(base,'workspace');await fsp.mkdir(root);
 for(let d=0;d<8;d++){const dir=path.join(root,`d${d}`);await fsp.mkdir(dir);for(let i=0;i<12;i++)await fsp.writeFile(path.join(dir,`f-${i}.txt`),`row-${d}-${i}`);}
 await fsp.writeFile(path.join(root,'dup-a.bin'),'same-content-v081');await fsp.writeFile(path.join(root,'dup-b.bin'),'same-content-v081');
 const index=new PersistentFileIndex(base);
 const first=index.scan(root,{maxDirsSession:1,dbBatchSize:10});
 assert.throws(()=>index.maintain(),e=>e.code==='INDEX_MAINTENANCE_BUSY');
 await assert.rejects(()=>index.scan(root,{maxDirsSession:1}),e=>e.code==='INDEX_SCAN_ALREADY_RUNNING');
 await first;
 let st=await index.status(root);while(st.status!=='completed'){st=await index.scan(root,{resume:true,maxDirsSession:50,dbBatchSize:25});}
 const health=index.health();assert.strictEqual(health.ok,true);assert(health.pageCount>0);
 const maint=index.maintain();assert.strictEqual(maint.ok,true);assert.strictEqual(maint.vacuum,false);
 const dup=await findExactDuplicatesFromIndex(index,root,{concurrency:2,maxCandidateFiles:1000});assert(dup.groupsTotal>=1);assert.strictEqual(dup.policy.hashExecution,'worker_threads-with-safe-fallback');
 index.close();

 let deliveries=0;const watcherBase=path.join(base,'watch-base');await fsp.mkdir(watcherBase);const watcher=new FileWatcherService(watcherBase,{debounceMs:60000,maxPending:120,maxBatchSize:20,maxDeliveryBatches:2,onBatch:async batch=>{deliveries+=batch.length;await new Promise(r=>setTimeout(r,80));}});
 const row={id:'storm',root};
 // repeated paths must coalesce rather than grow without bound
 for(let i=0;i<5000;i++)watcher.queue(row,'change',`d0/repeat-${i%40}.txt`);
 let ws=watcher.status();assert(ws.pending<=120);assert(ws.coalesced>4900);
 watcher.flush();
 // unique bursts force bounded delivery backpressure while consumer is intentionally slow
 for(let round=0;round<8;round++){for(let i=0;i<20;i++)watcher.queue(row,'rename',`burst-${round}-${i}.txt`);watcher.flush();}
 const drained=await watcher.drain({timeoutMs:5000});assert.strictEqual(drained.ok,true);ws=watcher.status();assert.strictEqual(ws.pending,0);assert(ws.droppedDelivery>0);assert(ws.batches>=2);assert(deliveries>0);assert.strictEqual(ws.needsFullRescan,true);assert(watcher.clearDirty(root));assert.strictEqual(watcher.status().needsFullRescan,false);watcher.stopAll();
 await fsp.rm(base,{recursive:true,force:true});
 console.log('production-hardening-v081.test.cjs PASS',{hashWorkers:dup.policy.hashExecution,watchReceived:ws.received,coalesced:ws.coalesced,droppedDelivery:ws.droppedDelivery,delivered:ws.delivered});
})().catch(e=>{console.error(e);process.exit(1)});
