const assert=require('assert');
const fs=require('fs');const os=require('os');const path=require('path');const cp=require('child_process');
const root=path.resolve(__dirname,'..');const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const {createHandoff,verifyHandoff}=require('../scripts/rc1-execution-handoff.cjs');
const lockPath=path.join(root,'package-lock.json'),had=fs.existsSync(lockPath),old=had?fs.readFileSync(lockPath):null,tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wa-staged-handoff-'));
function lockFixture(){const rp={name:pkg.name,version:pkg.version};for(const g of ['dependencies','devDependencies','optionalDependencies'])if(pkg[g]&&Object.keys(pkg[g]).length)rp[g]=pkg[g];return{name:pkg.name,version:pkg.version,lockfileVersion:3,requires:true,packages:{'':rp}}}
try{
  fs.writeFileSync(lockPath,JSON.stringify(lockFixture(),null,2));
  fs.copyFileSync(lockPath,path.join(tmp,'package-lock.json'));fs.writeFileSync(path.join(tmp,'payload.txt'),'trusted staged payload\n');
  const pointer=path.join(tmp,'primary-pointer.json');fs.writeFileSync(pointer,JSON.stringify({schemaVersion:'workspace-agent-rc1-primary-pointer-v1',executionId:'exec-staged',certificationReport:'payload.txt',evidenceBundle:'payload.txt',releaseManifest:'payload.txt',sha256Sums:'payload.txt',manualEvidenceTemplate:'payload.txt',packageLock:'package-lock.json'},null,2));
  const manifest=path.join(tmp,'handoff-manifest.json');createHandoff({dir:tmp,out:manifest,role:'primary',executionId:'exec-staged',pointer});
  fs.rmSync(lockPath,{force:true});assert(!fs.existsSync(lockPath),'source lock must be absent before staged verification');
  const stagedLock=path.join(tmp,'package-lock.json');
  const gate=cp.spawnSync(process.execPath,['scripts/verify-release-inputs.cjs',`--lockfile=${stagedLock}`],{cwd:root,encoding:'utf8'});assert.equal(gate.status,0,gate.stderr||gate.stdout);
  let v=verifyHandoff({dir:tmp,manifestPath:manifest,requireCurrentSource:true,lockPath:stagedLock});assert(v.ok,JSON.stringify(v.errors));assert(!fs.existsSync(lockPath),'staged verification must not mutate source package-lock');
  const bad=lockFixture();bad.identityMutation=true;fs.writeFileSync(stagedLock,JSON.stringify(bad,null,2));v=verifyHandoff({dir:tmp,manifestPath:manifest,requireCurrentSource:true,lockPath:stagedLock});assert(!v.ok);assert(v.errors.includes('HANDOFF_CURRENT_LOCK_MISMATCH'));assert(v.errors.includes('HANDOFF_CURRENT_RELEASE_IDENTITY_MISMATCH'));assert(!fs.existsSync(lockPath),'failed staged verification must remain side-effect free');
  const exec=fs.readFileSync(path.join(root,'scripts/windows-rc1-execution.ps1'),'utf8');assert(exec.includes('windows-safe-archive-expand.ps1'));assert(!exec.includes('Expand-Archive -LiteralPath $zip'));assert(exec.includes('Verify-Staged-Handoff $bootstrap;Ensure-ImportedLock $bootstrap;Verify-Handoff $bootstrap'));assert(exec.includes('Verify-Staged-Handoff $primaryImport;Ensure-ImportedLock $primaryImport;Verify-Handoff $primaryImport'));assert(exec.includes('Verify-Staged-Handoff $peerImport;Verify-Handoff $peerImport'));assert(exec.includes('.package-lock.importing-'));
  const safe=fs.readFileSync(path.join(root,'scripts/windows-safe-archive-expand.ps1'),'utf8');for(const token of ['ZipFile]::OpenRead','ARCHIVE_ENTRY_TRAVERSAL_FORBIDDEN','ARCHIVE_ENTRY_ADS_FORBIDDEN','ARCHIVE_ENTRY_DEVICE_NAME_FORBIDDEN','ARCHIVE_DUPLICATE_CANONICAL_PATH','ARCHIVE_LINK_REPARSE_ENTRY_FORBIDDEN','ARCHIVE_TOTAL_SIZE_LIMIT','.extracting-','CreateNew'])assert(safe.includes(token),token);
  console.log('rc1-staged-handoff-import-rc1 PASS',{preverifySourceMutationBlocked:true,externalLockIdentity:true,safeArchiveBoundary:true});
}finally{fs.rmSync(tmp,{recursive:true,force:true});if(had)fs.writeFileSync(lockPath,old);else fs.rmSync(lockPath,{force:true})}
