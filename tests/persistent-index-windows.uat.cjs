const assert=require('assert');const fs=require('fs');const os=require('os');const path=require('path');
const {PersistentFileIndex}=require('../electron/services/persistent-file-index.cjs');const {FileWatcherService}=require('../electron/services/file-watcher-service.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function waitUntil(fn,{timeoutMs=5000,intervalMs=100}={}){const end=Date.now()+timeoutMs;while(Date.now()<end){if(await fn())return true;await wait(intervalMs)}return false;}
(async()=>{
 if(process.platform!=='win32'){console.log('persistent-index-windows.uat.cjs SKIP (Windows only)');return;}
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'wa-index-win-base-'));const root=fs.mkdtempSync(path.join(os.tmpdir(),'wa-index-win-root-'));
 try{
   for(let d=0;d<40;d++){const dir=path.join(root,`folder-${d}`);fs.mkdirSync(dir);for(let i=0;i<125;i++)fs.writeFileSync(path.join(dir,`file-${i}.txt`),`d${d}-i${i}`)}
   let index=new PersistentFileIndex(base);const partial=await index.scan(root,{resume:false,maxDirsSession:5,maxWallTimeMs:20000});assert.equal(partial.status,'paused');assert(partial.queue>0);index.close();
   index=new PersistentFileIndex(base);const resumed=await index.scan(root,{resume:true,maxDirsSession:200,maxWallTimeMs:60000});assert.equal(resumed.status,'completed');assert.equal(resumed.files,5000);
   const watcher=new FileWatcherService(base,{debounceMs:120,onBatch:batch=>index.reconcileBatch(batch)});const watch=watcher.add(root,{title:'Index UAT'});assert(watch.id);
   const added=path.join(root,'folder-0','watch-added.txt');fs.writeFileSync(added,'watch');assert(await waitUntil(()=>index.search({root,query:'watch-added.txt'}).total===1,{timeoutMs:8000}),'watch add was not reconciled');
   fs.rmSync(added);assert(await waitUntil(()=>index.search({root,query:'watch-added.txt'}).total===0,{timeoutMs:8000}),'watch delete was not reconciled');
   watcher.stopAll();index.close();console.log('persistent-index-windows.uat.cjs PASS',{files:resumed.files});
 }finally{fs.rmSync(base,{recursive:true,force:true});fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
