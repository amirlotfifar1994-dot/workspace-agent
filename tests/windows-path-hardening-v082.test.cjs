const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const {normalizeDisplayPath,toFsPath,keyPath,inside,stripNamespacePrefix,pathDiagnostics}=require('../electron/services/windows-path-utils.cjs');
const {resolveWorkerScript}=require('../electron/services/hash-worker-pool.cjs');
const {hashFileStable}=require('../electron/services/duplicate-finder.cjs');
const {PersistentFileIndex}=require('../electron/services/persistent-file-index.cjs');

(async()=>{
  const cwd='C:\\Workspace';
  const display=normalizeDisplayPath('C:\\Workspace\\deep\\..\\فایل-😀.txt',{platform:'win32',cwd});
  assert.strictEqual(display,'C:\\Workspace\\فایل-😀.txt');
  const fsPath=toFsPath(display,{platform:'win32',cwd});
  assert.strictEqual(fsPath,'\\\\?\\C:\\Workspace\\فایل-😀.txt');
  assert.strictEqual(stripNamespacePrefix(fsPath,'win32'),display);
  const unc='\\\\server\\share\\folder\\file.txt';
  assert.strictEqual(toFsPath(unc,{platform:'win32',cwd}),'\\\\?\\UNC\\server\\share\\folder\\file.txt');
  assert.strictEqual(stripNamespacePrefix('\\\\?\\UNC\\server\\share\\folder\\file.txt','win32'),unc);
  assert.strictEqual(keyPath('C:\\Data\\Case.TXT',{platform:'win32',cwd}),keyPath('c:\\data\\case.txt',{platform:'win32',cwd}));
  assert.strictEqual(inside('C:\\Data','\\\\?\\C:\\Data\\nested\\x.txt',{platform:'win32',cwd}),true);
  assert.strictEqual(inside('C:\\Data','C:\\Other\\x.txt',{platform:'win32',cwd}),false);
  const diag=pathDiagnostics('C:\\'+('a'.repeat(250)),{platform:'win32',cwd});assert(diag.longPathCandidate);assert(diag.isNamespaced);

  const rawWin='C:\\Program Files\\Workspace Agent\\resources\\app.asar\\electron\\services\\hash-worker.cjs';
  const expectedWin='C:\\Program Files\\Workspace Agent\\resources\\app.asar.unpacked\\electron\\services\\hash-worker.cjs';
  assert.strictEqual(resolveWorkerScript(rawWin,{sep:'\\',exists:p=>p===expectedWin}),expectedWin);
  const rawPosix='/opt/app/resources/app.asar/electron/services/hash-worker.cjs';const expectedPosix='/opt/app/resources/app.asar.unpacked/electron/services/hash-worker.cjs';
  assert.strictEqual(resolveWorkerScript(rawPosix,{sep:'/',exists:p=>p===expectedPosix}),expectedPosix);

  const state=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v082-state-'));const workspace=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v082-work-'));const outside=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-v082-out-'));let index;try{
    const real=path.join(workspace,'real.txt');const link=path.join(workspace,'link.txt');await fsp.writeFile(real,'safe-content');await fsp.symlink(real,link);
    await fsp.writeFile(path.join(outside,'outside-sentinel.txt'),'outside');const dirLink=path.join(workspace,'outside-link');await fsp.symlink(outside,dirLink,'dir');
    await assert.rejects(()=>hashFileStable({path:link,size:12,mtimeMs:0}),e=>e.code==='HASH_LINK_BLOCKED');
    const st=await fsp.stat(real);const hashed=await hashFileStable({path:real,size:st.size,mtimeMs:st.mtimeMs});assert.strictEqual(hashed.hash.length,64);
    index=new PersistentFileIndex(state);let scan=await index.scan(workspace,{resume:false,maxWallTimeMs:30000});while(scan.status!=='completed')scan=await index.scan(workspace,{resume:true,maxWallTimeMs:30000});
    assert.strictEqual(index.search({root:workspace,query:'outside-sentinel.txt'}).total,0);assert(index.recentErrors(workspace,{limit:50}).filter(e=>e.code==='SYMLINK_SKIPPED').length>=2);
  }finally{try{index?.close()}catch{}await fsp.rm(state,{recursive:true,force:true});await fsp.rm(workspace,{recursive:true,force:true});await fsp.rm(outside,{recursive:true,force:true});}
  console.log('windows-path-hardening-v082.test.cjs PASS',{longPathPrefix:true,unc:true,reparseHashBlocked:true,packagedWorker:true});
})().catch(e=>{console.error(e);process.exit(1)});
