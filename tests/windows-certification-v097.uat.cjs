const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const os=require('os');
const crypto=require('crypto');
const {ExplorerBatchStore}=require('../electron/services/explorer-batch-store.cjs');
const {buildBatchManifest,processBatchChunk,undoBatch}=require('../electron/services/explorer-batch-service.cjs');
const {probeVolume}=require('../electron/services/windows-volume-probe.cjs');
const {statfsBytes}=require('../electron/services/explorer-storage-guard.cjs');
const {sha256File}=require('../electron/services/file-explorer-service.cjs');

function prereq(msg){console.log(`windows-certification-v097.uat.cjs SKIP (${msg})`);if(process.env.WA_CERT_STRICT==='1')process.exit(3);process.exit(0);}
async function write(p,bytes,seed=0x41){await fsp.mkdir(path.dirname(p),{recursive:true});const buf=Buffer.alloc(Math.min(bytes,1024*1024),seed);const fh=await fsp.open(p,'w');try{let left=bytes;while(left>0){const n=Math.min(left,buf.length);await fh.write(buf,0,n);left-=n;}await fh.sync();}finally{await fh.close();}}
async function finish(store,id,rootGate){let r;for(let i=0;i<5000;i++){r=await processBatchChunk(store,id,{limit:8,rootGate});if(r.status==='completed'||r.status==='cancelled')return r;if(r.blocker)throw Object.assign(new Error(r.blocker.message),{code:r.blocker.code});}throw new Error('BATCH_RUNAWAY');}
(async()=>{
 if(process.platform!=='win32')prereq('Windows only');
 const rootA=String(process.env.WA_CERT_ROOT_A||'').trim(),rootB=String(process.env.WA_CERT_ROOT_B||'').trim();
 if(!rootA||!rootB)prereq('set WA_CERT_ROOT_A and WA_CERT_ROOT_B');
 const [a,b]=await Promise.all([probeVolume(rootA),probeVolume(rootB)]);assert(a.available&&b.available,'both certification roots must be available');
 assert(a.volume?.uniqueId&&b.volume?.uniqueId,'Volume UniqueId required');assert.equal(String(a.volume.fileSystem).toUpperCase(),'NTFS','root A must be NTFS');assert.equal(String(b.volume.fileSystem).toUpperCase(),'NTFS','root B must be NTFS');
 if(process.env.WA_CERT_ALLOW_SAME_VOLUME!=='1')assert.notEqual(a.volume.uniqueId,b.volume.uniqueId,'two distinct volumes required for certification');
 const id=`wa-v097-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;const src=path.join(rootA,id,'src'),dst=path.join(rootB,id,'dst'),state=path.join(os.tmpdir(),id,'state');
 await fsp.mkdir(src,{recursive:true});await fsp.mkdir(path.join(dst,'out'),{recursive:true});let store;
 try{
   const unicode='داده-آزمایشی-🧪';await write(path.join(src,'tree',unicode,'a.bin'),3*1024*1024,0x51);await write(path.join(src,'tree','nested','b.bin'),2*1024*1024,0x52);await write(path.join(src,'same.txt'),128*1024,0x33);
   await fsp.copyFile(path.join(src,'same.txt'),path.join(dst,'out','same.txt'));
   const plan=await buildBatchManifest({sourceRoot:src,destinationRoot:dst,operation:'move',sourcesRelative:['tree','same.txt'],destinationDirRelative:'out',conflictPolicy:'rename',duplicateAware:true,reserveBytes:32*1024*1024});
   assert.equal(plan.crossVolume,a.volume.uniqueId!==b.volume.uniqueId);assert(plan.items.some(x=>x.kind==='file-xmove')||!plan.crossVolume);assert(plan.items.some(x=>x.kind==='skip-file'),'duplicate-aware same file should skip');
   store=new ExplorerBatchStore(state);store.createJob({id:'cert',root:src,sourceRoot:src,destinationRoot:dst,sourceIdentity:a.identityKey,destinationIdentity:b.identityKey,operation:'move',destinationDir:plan.destinationDir,conflictPolicy:plan.conflictPolicy,duplicateAware:true,reserveBytes:plan.reserveBytes,crossVolume:plan.crossVolume,items:plan.items});
   const rootGate=async()=>{const [aa,bb]=await Promise.all([probeVolume(src),probeVolume(dst)]);return aa.available&&bb.available&&aa.identityKey===a.identityKey&&bb.identityKey===b.identityKey?{ok:true}:{ok:false,code:'EXPLORER_BATCH_ROOT_IDENTITY_CHANGED',message:'certification root identity changed'};};
   const result=await finish(store,'cert',rootGate);assert.equal(result.status,'completed');
   const moved=path.join(dst,'out','tree',unicode,'a.bin');assert.equal((await fsp.stat(moved)).size,3*1024*1024);assert(!fs.existsSync(path.join(src,'tree')));assert.notEqual(await sha256File(moved),await sha256File(path.join(dst,'out','tree','nested','b.bin')),'distinct payloads must retain distinct hashes');
   const undo=await undoBatch(store,'cert');assert(undo.every(x=>x.ok!==false));assert(fs.existsSync(path.join(src,'tree',unicode,'a.bin')));assert(!fs.existsSync(path.join(dst,'out','tree')));
   const [spaceA,spaceB]=await Promise.all([statfsBytes(src),statfsBytes(dst)]);
   const report={schemaVersion:'workspace-agent-windows-cert-v097-uat-v1',status:'PASS',at:new Date().toISOString(),rootA:{drive:a.driveLetter,fileSystem:a.volume.fileSystem,driveType:a.volume.driveType,uniqueId:a.volume.uniqueId,freeBytes:spaceA.freeBytes},rootB:{drive:b.driveLetter,fileSystem:b.volume.fileSystem,driveType:b.volume.driveType,uniqueId:b.volume.uniqueId,freeBytes:spaceB.freeBytes},distinctVolumes:a.volume.uniqueId!==b.volume.uniqueId,crossVolume:plan.crossVolume,items:plan.totalItems,bytes:plan.totalBytes,unicode:true,duplicateAware:true,undo:true};
   if(process.env.WA_CERT_RESULT)await fsp.writeFile(path.resolve(process.env.WA_CERT_RESULT),JSON.stringify(report,null,2));console.log('windows-certification-v097.uat.cjs PASS',report);
 }finally{store?.close();await fsp.rm(path.join(rootA,id),{recursive:true,force:true}).catch(()=>{});await fsp.rm(path.join(rootB,id),{recursive:true,force:true}).catch(()=>{});await fsp.rm(path.join(os.tmpdir(),id),{recursive:true,force:true}).catch(()=>{});}
})().catch(e=>{console.error(e);process.exit(1)});
