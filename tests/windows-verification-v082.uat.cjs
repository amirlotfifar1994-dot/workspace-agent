const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const {PersistentFileIndex}=require('../electron/services/persistent-file-index.cjs');
const {findExactDuplicatesFromIndex}=require('../electron/services/indexed-duplicate-finder.cjs');
const {toFsPath,pathDiagnostics}=require('../electron/services/windows-path-utils.cjs');

(async()=>{
  if(process.platform!=='win32'){console.log('windows-verification-v082.uat.cjs SKIP (Windows only)');return;}
  const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v082-base-'));
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v082-root-'));
  const outside=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v082-outside-'));
  let index;let junctionCreated=false;
  try{
    let deep=root;let n=0;while(deep.length<310){deep=path.join(deep,`segment-${String(n++).padStart(2,'0')}-${'x'.repeat(20)}`);}await fsp.mkdir(toFsPath(deep),{recursive:true});
    const unicodeName='فایل-آزمایش-😀.txt';const unicodeFile=path.join(deep,unicodeName);await fsp.writeFile(toFsPath(unicodeFile),'duplicate-long-path-content');
    const dupFile=path.join(deep,'duplicate-copy.bin');await fsp.writeFile(toFsPath(dupFile),'duplicate-long-path-content');
    assert(pathDiagnostics(unicodeFile).displayLength>260,'test path must exceed legacy MAX_PATH');
    await fsp.writeFile(path.join(outside,'outside-sentinel.txt'),'must-not-be-indexed');
    const junction=path.join(root,'junction-outside');try{await fsp.symlink(outside,junction,'junction');junctionCreated=true;}catch(error){if(!['EPERM','EACCES','UNKNOWN'].includes(error.code))throw error;}
    index=new PersistentFileIndex(base);let st=await index.scan(root,{resume:false,maxWallTimeMs:60000,dbBatchSize:100});while(st.status!=='completed')st=await index.scan(root,{resume:true,maxWallTimeMs:60000,dbBatchSize:100});
    assert.strictEqual(index.search({root,query:unicodeName}).total,1,'Unicode long path must be searchable');
    assert.strictEqual(index.search({root,query:'outside-sentinel.txt'}).total,0,'junction target must never be traversed');
    if(junctionCreated)assert(index.recentErrors(root,{limit:500}).some(e=>e.code==='SYMLINK_SKIPPED'),'junction/reparse skip must be auditable');
    const dup=await findExactDuplicatesFromIndex(index,root,{concurrency:2,maxCandidateFiles:200});assert(dup.groups.some(g=>g.files.some(f=>f.path===unicodeFile)&&g.files.some(f=>f.path===dupFile)),'long-path duplicate hashing must work');
    assert.strictEqual(index.health().ok,true);
    console.log('windows-verification-v082.uat.cjs PASS',{pathLength:unicodeFile.length,junction:junctionCreated?'PASS':'SKIP_PERMISSION',files:st.files,duplicateGroups:dup.groupsTotal});
  }finally{try{index?.close()}catch{}await fsp.rm(base,{recursive:true,force:true});await fsp.rm(root,{recursive:true,force:true});await fsp.rm(outside,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
