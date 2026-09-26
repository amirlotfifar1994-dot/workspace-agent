const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const {PersistentFileIndex}=require('../electron/services/persistent-file-index.cjs');
const {FileWatcherService}=require('../electron/services/file-watcher-service.cjs');
const {RootResilienceService}=require('../electron/services/root-resilience-service.cjs');
const {probeVolume}=require('../electron/services/windows-volume-probe.cjs');

(async()=>{
 if(process.platform!=='win32'){console.log('windows-system-resilience-v083.uat.cjs SKIP (Windows only)');return;}
 const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v083-sys-'));const root=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v083-root-'));let index,watcher,resilience;
 try{
  for(let i=0;i<500;i++)await fsp.writeFile(path.join(root,`فایل-${i}-😀.txt`),`row-${i}`);
  index=new PersistentFileIndex(path.join(base,'state'));let st=await index.scan(root,{resume:false,maxWallTimeMs:60000,dbBatchSize:100});while(st.status!=='completed')st=await index.scan(root,{resume:true,maxWallTimeMs:60000,dbBatchSize:100});
  watcher=new FileWatcherService(path.join(base,'watch'),{debounceMs:100});watcher.add(root,{title:'UAT'});
  resilience=new RootResilienceService({watcherService:watcher,index,intervalMs:60000});await resilience.probeNow();const rs=resilience.status().roots.find(x=>x.root===root);assert(rs?.available,'root must be available');assert(rs.identityKey,'Windows volume identity must be captured');assert(index.rootRuntime(root)?.lastProbeAt,'runtime state must persist');
  watcher.suspendAll('UAT_SLEEP_GAP');assert.strictEqual(watcher.status().suspended,true);assert.strictEqual(watcher.handles.size,0);watcher.resumeAll();assert.strictEqual(watcher.status().suspended,false);assert(watcher.status().needsFullRescan,'sleep/resume gap must force full-rescan warning');
  const fresh=await index.scan(root,{resume:false,maxWallTimeMs:60000,dbBatchSize:100});assert.strictEqual(fresh.status,'completed');const ack=await resilience.acknowledgeRoot(root);assert.strictEqual(ack.ok,true);assert.strictEqual(watcher.status().needsFullRescan,false);
  console.log('windows-system-resilience-v083.uat.cjs PASS',{identity:rs.identityKey,driveType:rs.driveType||'unknown',files:fresh.files,suspendResume:true});
 }finally{resilience?.stop();watcher?.stopAll();index?.close();await fsp.rm(base,{recursive:true,force:true});await fsp.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
