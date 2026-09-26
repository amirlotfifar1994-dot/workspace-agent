const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const os=require('os');
const {ExplorerBatchStore}=require('../electron/services/explorer-batch-store.cjs');
const {buildBatchManifest,processBatchChunk,undoBatch,defaultVolumeIdentity}=require('../electron/services/explorer-batch-service.cjs');
const {statfsBytes}=require('../electron/services/explorer-storage-guard.cjs');

async function write(p,size=1024){
  await fsp.mkdir(path.dirname(p),{recursive:true});
  const b=Buffer.alloc(Math.min(size,1024*1024),0x5a);
  const fh=await fsp.open(p,'w');
  try{let left=size;while(left>0){const n=Math.min(left,b.length);await fh.write(b,0,n);left-=n;}await fh.sync();}
  finally{await fh.close();}
}

(async()=>{
  if(process.platform!=='win32'){
    console.log('windows-file-explorer-v096.uat.cjs SKIP (Windows only)');
    return;
  }
  const sourceBase=String(process.env.WA_V096_SOURCE_ROOT||'');
  const destinationBase=String(process.env.WA_V096_DEST_ROOT||'');
  if(!sourceBase||!destinationBase){
    console.log('windows-file-explorer-v096.uat.cjs SKIP (set WA_V096_SOURCE_ROOT and WA_V096_DEST_ROOT)');
    return;
  }
  const [ss,ds]=await Promise.all([fsp.stat(sourceBase),fsp.stat(destinationBase)]);
  assert(ss.isDirectory()&&ds.isDirectory());
  const id=`wa-v096-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const srcRoot=path.join(sourceBase,id,'source');
  const dstRoot=path.join(destinationBase,id,'destination');
  const state=path.join(os.tmpdir(),id,'state');
  await fsp.mkdir(srcRoot,{recursive:true});
  await fsp.mkdir(path.join(dstRoot,'out'),{recursive:true});
  try{
    await write(path.join(srcRoot,'tree','a.bin'),4*1024*1024);
    await write(path.join(srcRoot,'tree','nested','b.bin'),2*1024*1024);
    const [sv,dv]=await Promise.all([defaultVolumeIdentity(srcRoot),defaultVolumeIdentity(dstRoot)]);
    const plan=await buildBatchManifest({
      sourceRoot:srcRoot,
      destinationRoot:dstRoot,
      operation:'move',
      sourcesRelative:['tree'],
      destinationDirRelative:'out',
      conflictPolicy:'rename',
      duplicateAware:true,
      reserveBytes:64*1024*1024,
    });
    const driveDifferent=path.parse(srcRoot).root.toLowerCase()!==path.parse(dstRoot).root.toLowerCase();
    if(driveDifferent)assert.equal(plan.crossVolume,true);
    const store=new ExplorerBatchStore(state);
    store.createJob({
      id:'uat',root:srcRoot,sourceRoot:srcRoot,destinationRoot:dstRoot,
      sourceIdentity:sv,destinationIdentity:dv,operation:'move',destinationDir:plan.destinationDir,
      conflictPolicy:plan.conflictPolicy,duplicateAware:true,reserveBytes:plan.reserveBytes,
      crossVolume:plan.crossVolume,items:plan.items,
    });
    let result;
    for(let i=0;i<1000;i++){
      result=await processBatchChunk(store,'uat',{
        limit:4,
        rootGate:async({sourceIdentity,destinationIdentity})=>{
          const [a,b]=await Promise.all([defaultVolumeIdentity(srcRoot),defaultVolumeIdentity(dstRoot)]);
          return a===sourceIdentity&&b===destinationIdentity
            ? {ok:true}
            : {ok:false,code:'EXPLORER_BATCH_ROOT_IDENTITY_CHANGED',message:'volume changed'};
        },
      });
      if(result.status==='completed')break;
      if(result.blocker)throw Object.assign(new Error(result.blocker.message),{code:result.blocker.code});
    }
    assert.equal(result.status,'completed');
    assert(!fs.existsSync(path.join(srcRoot,'tree')));
    assert.equal((await fsp.stat(path.join(dstRoot,'out','tree','a.bin'))).size,4*1024*1024);
    const undo=await undoBatch(store,'uat');
    assert(undo.every(x=>x.ok!==false));
    assert.equal((await fsp.stat(path.join(srcRoot,'tree','nested','b.bin'))).size,2*1024*1024);
    assert(!fs.existsSync(path.join(dstRoot,'out','tree')));
    const storage=await statfsBytes(dstRoot);
    store.close();
    console.log('windows-file-explorer-v096.uat.cjs PASS',{
      sourceDrive:path.parse(srcRoot).root,
      destinationDrive:path.parse(dstRoot).root,
      crossVolume:plan.crossVolume,
      driveDifferent,
      sourceVolume:sv,
      destinationVolume:dv,
      freeBytes:storage.freeBytes,
      items:plan.totalItems,
      bytes:plan.totalBytes,
    });
  }finally{
    await fsp.rm(path.join(sourceBase,id),{recursive:true,force:true}).catch(()=>{});
    await fsp.rm(path.join(destinationBase,id),{recursive:true,force:true}).catch(()=>{});
    await fsp.rm(path.join(os.tmpdir(),id),{recursive:true,force:true}).catch(()=>{});
  }
})().catch(e=>{console.error(e);process.exit(1)});
