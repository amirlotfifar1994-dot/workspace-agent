const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const {PersistentFileIndex}=require('../electron/services/persistent-file-index.cjs');

(async()=>{
 const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v083-interrupt-'));const root=path.join(base,'workspace');const offline=path.join(base,'workspace-offline');await fsp.mkdir(root);
 for(let d=0;d<8;d++){const dir=path.join(root,`d${d}`);await fsp.mkdir(dir);for(let i=0;i<25;i++)await fsp.writeFile(path.join(dir,`f${i}.txt`),`${d}-${i}`)}
 const index=new PersistentFileIndex(path.join(base,'state'));
 let st=await index.scan(root,{resume:false,maxDirsSession:2,dbBatchSize:20});assert.strictEqual(st.status,'paused');assert(st.queue>0);const generation=st.generation;const filesBefore=st.files;
 await fsp.rename(root,offline);
 await assert.rejects(()=>index.scan(root,{resume:true,maxWallTimeMs:10000}),e=>['ENOENT','ROOT_UNAVAILABLE'].includes(e.code));
 st=await index.status(root);assert.strictEqual(st.generation,generation);assert(st.queue>0,'queue must survive root outage');assert.strictEqual(st.files,filesBefore,'offline resume must not delete committed generation rows');
 await fsp.rename(offline,root);
 let loops=0;do{st=await index.scan(root,{resume:true,maxDirsSession:3,dbBatchSize:20});loops+=1;assert(loops<20);}while(st.status!=='completed');
 assert.strictEqual(st.files,200);assert.strictEqual(st.generation,generation);assert.strictEqual(index.health().ok,true);
 // Simulate the root disappearing after scan startup but before commit. Old generation rows must survive.
 if(process.platform!=='win32'){const origStat=fsp.stat;let statCalls=0,renamedMidScan=false;fsp.stat=async function(p,...args){statCalls+=1;if(!renamedMidScan&&statCalls===2){renamedMidScan=true;await fsp.rename(root,offline);}return origStat.call(this,p,...args)};try{st=await index.scan(root,{resume:false,maxWallTimeMs:30000,dbBatchSize:20});}finally{fsp.stat=origStat;}assert.strictEqual(renamedMidScan,true);assert.strictEqual(st.status,'paused');assert(['ROOT_UNAVAILABLE','ROOT_UNAVAILABLE_BEFORE_COMMIT'].includes(st.pauseReason));assert(st.queue>0);assert(index.search({root,limit:500}).total>0,'previous generation must not be stale-deleted while root is offline');await fsp.rename(offline,root);do{st=await index.scan(root,{resume:true,maxDirsSession:20,dbBatchSize:20});}while(st.status!=='completed');assert.strictEqual(st.files,200);}else console.log('SKIP mid-scan root rename: Windows forbids renaming a directory tree with open handles');
 // Even if the root vanishes only at the final commit boundary, stale-generation deletion must be deferred.
 const originalRootReadable=index._rootReadable.bind(index);index._rootReadable=async()=>false;try{st=await index.scan(root,{resume:false,maxWallTimeMs:30000,dbBatchSize:20});}finally{index._rootReadable=originalRootReadable;}assert.strictEqual(st.status,'paused');assert.strictEqual(st.pauseReason,'ROOT_UNAVAILABLE_BEFORE_COMMIT');assert(st.queue>0);assert.strictEqual(index.search({root,limit:500}).total,200);do{st=await index.scan(root,{resume:true,maxDirsSession:20,dbBatchSize:20});}while(st.status!=='completed');assert.strictEqual(st.files,200);
 // A runtime identity-change latch must pause an otherwise readable root without consuming the queue.
 st=await index.scan(root,{resume:false,maxDirsSession:1});assert.strictEqual(st.status,'paused');const q=st.queue;index.setRootRuntime(root,{available:true,status:'identity-changed',identityKey:'volume:B',volumeUniqueId:'B',identityChanged:true,lastProbeAt:new Date().toISOString()});st=await index.scan(root,{resume:true,maxDirsSession:20});assert.strictEqual(st.status,'paused');assert.strictEqual(st.pauseReason,'VOLUME_IDENTITY_CHANGED');assert.strictEqual(st.queue,q);
 index.close();await fsp.rm(base,{recursive:true,force:true});
 console.log('root-interruption-v083.test.cjs PASS',{queuePreserved:true,resumeAfterReconnect:true,identityGuard:true,files:200});
})().catch(e=>{console.error(e);process.exit(1)});
