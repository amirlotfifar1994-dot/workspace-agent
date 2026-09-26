const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const cp=require('child_process');
const crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wa-rc1-envelope-'));
const {createBundle}=require('../scripts/certification-evidence-bundle.cjs');
function sh(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}
function makeReport(dir,pkg,fp,overrides={}){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'gate-fixture.log'),'PASS fixture\n');const b=createBundle(dir,path.join(dir,'evidence-bundle.json'));const report=path.join(dir,'certification-report.json');fs.writeFileSync(report,JSON.stringify({schemaVersion:'workspace-agent-windows-certification-v5',workspaceAgentVersion:pkg.version,toolingRevision:pkg.workspaceAgentRelease.toolingRevision,featureFreeze:true,overall:'PASS',evidenceId:'cert-evidence',sourceFingerprint:{sha256:fp.sha256},packageLockSha256:'',evidenceBundle:{file:'evidence-bundle.json',sha256:b.sha256,files:b.bundle.files,aggregateSha256:b.bundle.aggregateSha256},windowsFamily:'Windows11',os:{caption:'Microsoft Windows 11 Pro',build:'26100'},...overrides}));return{report,bundle:b}}
try{
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const fp=JSON.parse(cp.execFileSync(process.execPath,['scripts/source-tree-fingerprint.cjs'],{cwd:root,encoding:'utf8'}));
  const base=makeReport(path.join(tmp,'current'),pkg,fp);const report=base.report;
  const releaseDir=path.join(tmp,'release');fs.mkdirSync(releaseDir);
  const artifact=path.join(releaseDir,'Workspace-Agent-Setup-1.0.0-rc1-x64.exe');fs.writeFileSync(artifact,'fixture');
  const releaseManifest=path.join(releaseDir,'release-manifest.json');fs.writeFileSync(releaseManifest,JSON.stringify({version:pkg.version,toolingRevision:pkg.workspaceAgentRelease.toolingRevision,featureFreeze:true,sourceFingerprint:fp.sha256,packageLockSha256:'',artifacts:[{file:path.basename(artifact),sha256:sh(artifact)}],signatures:[{file:path.basename(artifact),status:'Valid'}]}));
  const lockless=!fs.existsSync(path.join(root,'package-lock.json'));
  let r;if(lockless){r=cp.spawnSync(process.execPath,['scripts/rc1-certification-envelope.cjs',`--report=${report}`,`--release-manifest=${releaseManifest}`],{cwd:root,encoding:'utf8'});
  assert.equal(r.status,2,'without package-lock the envelope must be INCOMPLETE, never PASS');assert(/INCOMPLETE/.test(r.stdout));
  const parsed=JSON.parse(r.stdout);assert.equal(parsed.checks.sourceFingerprintMatch,true);assert.equal(parsed.checks.currentEvidenceBundleOk,true);assert.equal(parsed.checks.lockPresent,false);assert(parsed.checks.incomplete.includes('PACKAGE_LOCK_MISSING'));}else console.log('SKIP lock-absent envelope block: package-lock.json is present (generated lockfile)');
  const incomplete=makeReport(path.join(tmp,'incomplete'),pkg,fp,{overall:'INCOMPLETE'}).report;
  r=cp.spawnSync(process.execPath,['scripts/rc1-certification-envelope.cjs',`--report=${incomplete}`,`--release-manifest=${releaseManifest}`],{cwd:root,encoding:'utf8'});if(lockless)assert.equal(r.status,2,'certification INCOMPLETE must remain INCOMPLETE, not become FAIL');
  const tampered=makeReport(path.join(tmp,'bad'),pkg,fp,{sourceFingerprint:{sha256:'deadbeef'}}).report;
  r=cp.spawnSync(process.execPath,['scripts/rc1-certification-envelope.cjs',`--report=${tampered}`,`--release-manifest=${releaseManifest}`],{cwd:root,encoding:'utf8'});assert.equal(r.status,1);assert(/REPORT_SOURCE_FINGERPRINT_MISMATCH/.test(r.stdout));
  fs.appendFileSync(path.join(path.dirname(report),'gate-fixture.log'),'tamper');
  r=cp.spawnSync(process.execPath,['scripts/rc1-certification-envelope.cjs',`--report=${report}`,`--release-manifest=${releaseManifest}`],{cwd:root,encoding:'utf8'});assert.equal(r.status,1);assert(/CURRENT_EVIDENCE_ENTRY_SHA256_MISMATCH/.test(r.stdout));
  console.log('rc1-certification-envelope.test.cjs PASS',{fingerprint:fp.sha256.slice(0,16),evidenceBundle:true,tamperDetected:true});
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
