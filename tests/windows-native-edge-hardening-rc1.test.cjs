const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const {uncShareRootFor,volumeRootFor}=require('../electron/services/windows-volume-probe.cjs');
const {canonicalNameKey}=require('../electron/services/windows-path-utils.cjs');
const {canonicalSiblingCollision,assertCanonicalSiblingAvailable,localStagePath,isUnicodeCanonicalOnlyNameChange}=require('../electron/services/file-explorer-service.cjs');
const {defaultVolumeIdentity,validateJobRoots}=require('../electron/services/explorer-batch-service.cjs');
const {RootResilienceService,strongIdentity}=require('../electron/services/root-resilience-service.cjs');

(async()=>{
  // UNC identity must be anchored to the share, not to an arbitrary subdirectory.
  assert.strictEqual(uncShareRootFor('\\\\server\\share\\a\\b',{platform:'win32'}),'\\\\server\\share\\');
  assert.strictEqual(volumeRootFor('\\\\server\\share\\a\\b',{platform:'win32'}),'\\\\server\\share\\');
  assert.strictEqual(uncShareRootFor('C:\\Data',{platform:'win32'}),'');
  assert.strictEqual(strongIdentity('unc:server-share'),true);

  // Windows batch volume identity should prefer a strong probe identity when available.
  let probes=0;
  const fakeProbe=async p=>({available:true,identityKey:'volume:VOL-123',root:p,volume:{uniqueId:'VOL-123'}});
  const idA=await defaultVolumeIdentity('C:\\Data\\A',{platform:'win32',probe:async p=>{probes++;return fakeProbe(p)}});
  const idB=await defaultVolumeIdentity('C:\\Data\\B',{platform:'win32',probe:async p=>{probes++;return fakeProbe(p)}});
  assert.strictEqual(idA,'volume:VOL-123');assert.strictEqual(idB,'volume:VOL-123');assert.strictEqual(probes,2);

  // Canonically equivalent Unicode names are intentionally treated as ambiguous on Windows.
  assert.strictEqual(canonicalNameKey('CAFÉ.txt',{platform:'win32'}),canonicalNameKey('cafe\u0301.TXT',{platform:'win32'}));
  assert.strictEqual(isUnicodeCanonicalOnlyNameChange('C:\\x\\cafe\u0301.txt','C:\\x\\caf\u00e9.txt',{platform:'win32'}),true);
  assert.strictEqual(isUnicodeCanonicalOnlyNameChange('C:\\x\\File.TXT','C:\\x\\file.txt',{platform:'win32'}),false);
  const base=await fsp.mkdtemp(path.join(os.tmpdir(),'wa-native-edge-'));
  try{
    const existing=path.join(base,'cafe\u0301.txt');await fsp.writeFile(existing,'x');
    const desired=path.join(base,'café.txt');
    const hit=await canonicalSiblingCollision(desired,{platform:'win32'});assert(hit);assert.strictEqual(hit.name,'cafe\u0301.txt');
    await assert.rejects(()=>assertCanonicalSiblingAvailable(desired,{platform:'win32'}),e=>e.code==='EXPLORER_UNICODE_CANONICAL_COLLISION');

    // Copy staging is destination-local so a Windows-created staging file inherits the destination parent context.
    const staged=localStagePath(path.join(base,'dest','file.txt'),'cycle-1');
    assert.strictEqual(path.dirname(staged),path.join(base,'dest'));
    assert(path.basename(staged).startsWith('.workspace-agent-stage-cycle-1-'));

    // Per-item batch guards must be able to use a fast availability/cached identity pass.
    const src=path.join(base,'src'),dst=path.join(base,'dst');await fsp.mkdir(src);await fsp.mkdir(dst);const out=path.join(dst,'out');await fsp.mkdir(out);
    const observed=[];const job={root:src,source_root:src,destination_root:dst,destination_dir:out,source_identity:'volume:S',destination_identity:'volume:D'};
    const rootGate=async args=>(observed.push(args.forceIdentity),{ok:true});
    await validateJobRoots(job,rootGate,{forceIdentity:true});await validateJobRoots(job,rootGate,{forceIdentity:false});
    assert.deepStrictEqual(observed,[true,false]);
  }finally{await fsp.rm(base,{recursive:true,force:true});}

  // A drive-letter relocation candidate must surface its specific blocker, not collapse to ROOT_UNAVAILABLE.
  const watcher={configs:()=>[{id:'x',root:'E:\\Workspace',enabled:true}],blockRoot:()=>{},unblockRoot:()=>{},startRoot:()=>{},_markDirty:()=>{}};
  const index={listRoots:()=>[],rootRuntime:()=>({available:true,status:'available',identityKey:'volume:USB-X',volumeUniqueId:'USB-X',driveLetter:'E',identityChanged:false}),setRootRuntime:()=>{}};
  const resilience=new RootResilienceService({watcherService:watcher,index,platform:'win32',probe:async()=>({available:false,root:'E:\\Workspace',code:'ENOENT'}),locate:async()=>({found:true,driveRoot:'F:\\',volume:{driveLetter:'F',uniqueId:'USB-X'}})});
  const gate=await resilience.validateRoot('E:\\Workspace');
  assert.strictEqual(gate.ok,false);assert.strictEqual(gate.code,'ROOT_RELOCATED_CANDIDATE');assert.strictEqual(gate.candidate.root,'F:\\Workspace');

  console.log('windows-native-edge-hardening-rc1.test.cjs PASS',{uncShareIdentity:true,strongVolumeIdentity:true,unicodeCollision:true,destinationLocalStage:true,batchedIdentityCadence:true,relocationSignal:true});
})().catch(e=>{console.error(e);process.exit(1)});
