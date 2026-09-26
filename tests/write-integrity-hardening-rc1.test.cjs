const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const os=require('os');
const crypto=require('crypto');
const {ExplorerBatchStore}=require('../electron/services/explorer-batch-store.cjs');
const {buildBatchManifest,processBatchChunk,undoBatch}=require('../electron/services/explorer-batch-service.cjs');

async function write(p,text){await fsp.mkdir(path.dirname(p),{recursive:true});await fsp.writeFile(p,text);}
function sha256(text){return crypto.createHash('sha256').update(text).digest('hex');}
async function makeJob(store,id,plan,root,operation,conflictPolicy='skip',extra={}){
  return store.createJob({id,root,sourceRoot:extra.sourceRoot||root,destinationRoot:extra.destinationRoot||root,operation,destinationDir:plan.destinationDir||extra.destinationDir||path.join(root,'dest'),conflictPolicy,duplicateAware:extra.duplicateAware??false,crossVolume:Boolean(extra.crossVolume),items:plan.items||extra.items||[]});
}

(async()=>{
  const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-rc1-write-integrity-'));
  const root=path.join(base,'workspace');
  const destDir=path.join(root,'dest');
  await fsp.mkdir(destDir,{recursive:true});
  const store=new ExplorerBatchStore(base);

  // 1) Same-volume Move resume must not trust an unrelated destination merely because source disappeared.
  await write(path.join(root,'resume.txt'),'ORIGINAL');
  let plan=await buildBatchManifest({root,operation:'move',sourcesRelative:['resume.txt'],destinationDirRelative:'dest',conflictPolicy:'skip',duplicateAware:false});
  await makeJob(store,'resume-mismatch',plan,root,'move','skip');
  await fsp.rm(path.join(root,'resume.txt'));
  await write(path.join(destDir,'resume.txt'),'UNRELATED');
  await assert.rejects(()=>processBatchChunk(store,'resume-mismatch',{limit:2}),e=>e.code==='EXPLORER_BATCH_RESUME_DESTINATION_CHANGED');
  assert.equal(await fsp.readFile(path.join(destDir,'resume.txt'),'utf8'),'UNRELATED');

  // 2) Cross-volume resume requires persisted hash evidence; a bare destination is insufficient.
  const xDest=path.join(destDir,'cross.txt');
  await write(xDest,'CROSS-COMMIT');
  const xItem={kind:'file-xmove',source:path.join(root,'cross-source.txt'),destination:xDest,size:Buffer.byteLength('CROSS-COMMIT'),mtimeMs:0,meta:{crossVolume:true}};
  store.createJob({id:'xmove-no-evidence',root,sourceRoot:root,destinationRoot:root,operation:'move',destinationDir:destDir,conflictPolicy:'replace',duplicateAware:false,crossVolume:true,items:[xItem]});
  await assert.rejects(()=>processBatchChunk(store,'xmove-no-evidence',{limit:2}),e=>e.code==='EXPLORER_BATCH_RESUME_EVIDENCE_MISSING');
  assert.equal(await fsp.readFile(xDest,'utf8'),'CROSS-COMMIT');

  // Matching persisted destination hash is enough to finish the crash-resume path safely.
  const xDest2=path.join(destDir,'cross2.txt');
  await write(xDest2,'CROSS-VERIFIED');
  const xItem2={kind:'file-xmove',source:path.join(root,'cross-source2.txt'),destination:xDest2,size:Buffer.byteLength('CROSS-VERIFIED'),mtimeMs:0,meta:{crossVolume:true,...(process.platform==='win32'?{ntfsMetadata:await require('../electron/services/windows-ntfs-metadata.cjs').captureWindowsMetadata(xDest2)}:{})}};
  store.createJob({id:'xmove-with-evidence',root,sourceRoot:root,destinationRoot:root,operation:'move',destinationDir:destDir,conflictPolicy:'replace',duplicateAware:false,crossVolume:true,items:[xItem2]});
  store.updateItem('xmove-with-evidence',0,{state:'committed',destinationHash:sha256('CROSS-VERIFIED')});
  let out=await processBatchChunk(store,'xmove-with-evidence',{limit:2});
  assert.equal(out.status,'completed');
  assert.equal(store.item('xmove-with-evidence',0).state,'done');

  // 3) Move source is revalidated against Preview snapshot immediately before execution.
  await write(path.join(root,'changed.txt'),'BEFORE');
  plan=await buildBatchManifest({root,operation:'move',sourcesRelative:['changed.txt'],destinationDirRelative:'dest',conflictPolicy:'skip',duplicateAware:false});
  await makeJob(store,'source-changed',plan,root,'move','skip');
  await new Promise(r=>setTimeout(r,8));
  await write(path.join(root,'changed.txt'),'AFTER-DIFFERENT');
  await assert.rejects(()=>processBatchChunk(store,'source-changed',{limit:2}),e=>e.code==='EXPLORER_BATCH_SOURCE_CHANGED');
  assert.equal(await fsp.readFile(path.join(root,'changed.txt'),'utf8'),'AFTER-DIFFERENT');
  assert(!fs.existsSync(path.join(destDir,'changed.txt')));

  // 4) Undo of a completed Move refuses to move back a target that changed after commit.
  await write(path.join(root,'undo-move.txt'),'MOVE-ME');
  plan=await buildBatchManifest({root,operation:'move',sourcesRelative:['undo-move.txt'],destinationDirRelative:'dest',conflictPolicy:'skip',duplicateAware:false});
  await makeJob(store,'undo-move-changed',plan,root,'move','skip');
  out=await processBatchChunk(store,'undo-move-changed',{limit:2});
  assert.equal(out.status,'completed');
  await new Promise(r=>setTimeout(r,8));
  await write(path.join(destDir,'undo-move.txt'),'CHANGED-AFTER-MOVE');
  let undo=await undoBatch(store,'undo-move-changed');
  assert.equal(undo[0].ok,false);
  assert.equal(undo[0].error,'UNDO_MOVE_TARGET_CHANGED');
  assert(!fs.existsSync(path.join(root,'undo-move.txt')));
  assert.equal(await fsp.readFile(path.join(destDir,'undo-move.txt'),'utf8'),'CHANGED-AFTER-MOVE');

  // 5) Missing backup on replace-copy must fail before mutating the current destination.
  await write(path.join(root,'replace-copy.txt'),'NEW-COPY');
  await write(path.join(destDir,'replace-copy.txt'),'OLD-COPY');
  plan=await buildBatchManifest({root,operation:'copy',sourcesRelative:['replace-copy.txt'],destinationDirRelative:'dest',conflictPolicy:'replace',duplicateAware:false});
  await makeJob(store,'replace-copy-backup',plan,root,'copy','replace');
  out=await processBatchChunk(store,'replace-copy-backup',{limit:2});
  assert.equal(out.status,'completed');
  let item=store.item('replace-copy-backup',0);
  assert(item.backup_path&&fs.existsSync(item.backup_path));
  await fsp.rm(item.backup_path,{force:true});
  undo=await undoBatch(store,'replace-copy-backup');
  assert.equal(undo[0].ok,false);
  assert.equal(undo[0].error,'UNDO_BACKUP_MISSING');
  assert.equal(await fsp.readFile(path.join(destDir,'replace-copy.txt'),'utf8'),'NEW-COPY');
  assert.equal(await fsp.readFile(path.join(root,'replace-copy.txt'),'utf8'),'NEW-COPY');

  // 6) Missing backup on replace-move also fails before moving the new destination anywhere.
  await write(path.join(root,'replace-move.txt'),'NEW-MOVE');
  await write(path.join(destDir,'replace-move.txt'),'OLD-MOVE');
  plan=await buildBatchManifest({root,operation:'move',sourcesRelative:['replace-move.txt'],destinationDirRelative:'dest',conflictPolicy:'replace',duplicateAware:false});
  await makeJob(store,'replace-move-backup',plan,root,'move','replace');
  out=await processBatchChunk(store,'replace-move-backup',{limit:2});
  assert.equal(out.status,'completed');
  item=store.item('replace-move-backup',0);
  assert(item.backup_path&&fs.existsSync(item.backup_path));
  await fsp.rm(item.backup_path,{force:true});
  undo=await undoBatch(store,'replace-move-backup');
  assert.equal(undo[0].ok,false);
  assert.equal(undo[0].error,'UNDO_BACKUP_MISSING');
  assert(!fs.existsSync(path.join(root,'replace-move.txt')));
  assert.equal(await fsp.readFile(path.join(destDir,'replace-move.txt'),'utf8'),'NEW-MOVE');

  store.close();
  await fsp.rm(base,{recursive:true,force:true});
  console.log('write-integrity-hardening-rc1.test.cjs PASS',{resumeEvidence:true,sourceSnapshot:true,undoIntegrity:true,backupPrecheck:true});
})().catch(e=>{console.error(e);process.exit(1)});
