const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const cp=require('child_process');
const crypto=require('crypto');
const cwd=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wa-rc1-evidence-'));
const file=path.join(dir,'e.json'),manifest=path.join(dir,'release-manifest.json'),primaryReport=path.join(dir,'primary-report.json');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const now=()=>new Date().toISOString();
const installerSha='a'.repeat(64),source='b'.repeat(64),lock='c'.repeat(64),rid='d'.repeat(64),evidenceId='e'.repeat(64),executionId='exec-20260816-win11';
function makeAttachment(key){const name=`${key}.txt`,p=path.join(dir,name);fs.writeFileSync(p,`hash-bound physical evidence for ${key}`);return{status:'PASS',observedAt:now(),notes:'Observed on controlled Windows certification hardware.',attachment:name,attachmentSha256:sha(p),attachmentBytes:fs.statSync(p).size}}
try{
  const manifestData={schemaVersion:'workspace-agent-release-v10',version:'1.0.0-rc1',toolingRevision:'cert-kit21',sourceFingerprint:source,packageLockSha256:lock,releaseIdentitySha256:rid,artifacts:[{kind:'nsis',file:'Workspace-Agent-Setup-1.0.0-rc1-x64.exe',sha256:installerSha}]};
  fs.writeFileSync(manifest,JSON.stringify(manifestData));
  fs.writeFileSync(primaryReport,JSON.stringify({overall:'PASS',evidenceId,windowsFamily:'Windows11',sourceFingerprint:{sha256:source},packageLockSha256:lock,releaseIdentitySha256:rid}));
  const base={schemaVersion:'workspace-agent-manual-evidence-rc1-v4',version:'1.0.0-rc1',executionId,operator:'qa-operator',machine:'win11-cert',createdAt:now(),binding:{sourceFingerprint:source,packageLockSha256:lock,releaseIdentitySha256:rid,releaseManifestSha256:sha(manifest),installerSha256:installerSha,primaryCertificationReportSha256:sha(primaryReport),primaryCertificationEvidenceId:evidenceId,primaryWindowsFamily:'Windows11'},evidence:{physicalUsbDisconnectReconnect:makeAttachment('usb'),actualDiskFullRecovery:makeAttachment('disk-full'),realAclReadOnlyRecovery:makeAttachment('acl'),uncleanShutdownPowerLoss:makeAttachment('power-loss'),realUpgradeFrom0_9_8:{...makeAttachment('upgrade'),fromVersion:'0.9.8',toVersion:'1.0.0-rc1',installerSha256:installerSha,preSelfCheckOverall:'pass',postSelfCheckOverall:'pass',statePreserved:true}}};
  fs.writeFileSync(file,JSON.stringify(base));
  let r=JSON.parse(cp.execFileSync(process.execPath,['scripts/verify-manual-evidence-rc1.cjs',file,'--require-all',`--primary-report=${primaryReport}`,`--execution-id=${executionId}`],{cwd,encoding:'utf8'}));
  assert.equal(r.status,'PASS');assert.equal(r.attachments.length,5);assert.equal(r.primaryBinding.ok,true);
  r=JSON.parse(cp.execFileSync(process.execPath,['scripts/verify-manual-evidence-rc1.cjs',file,'--require-all','--require-artifact-binding',`--release-manifest=${manifest}`,`--primary-report=${primaryReport}`,`--execution-id=${executionId}`],{cwd,encoding:'utf8'}));
  assert.equal(r.artifactBinding.ok,true);assert.equal(r.artifactBinding.releaseIdentitySha256,rid);
  let failed=false;try{cp.execFileSync(process.execPath,['scripts/verify-manual-evidence-rc1.cjs',file,'--require-all',`--primary-report=${primaryReport}`,`--execution-id=other-exec`],{cwd,stdio:'pipe'})}catch(e){failed=true;assert(String(e.stderr).includes('MANUAL_EVIDENCE_EXECUTION_ID_MISMATCH'))}assert(failed);
  const saved=base.evidence.actualDiskFullRecovery;base.evidence.actualDiskFullRecovery={status:'PASS',observedAt:now(),notes:'text alone is no longer sufficient',attachment:'',attachmentSha256:'',attachmentBytes:0};fs.writeFileSync(file,JSON.stringify(base));failed=false;try{cp.execFileSync(process.execPath,['scripts/verify-manual-evidence-rc1.cjs',file,'--require-all',`--primary-report=${primaryReport}`,`--execution-id=${executionId}`],{cwd,stdio:'pipe'})}catch(e){failed=true;assert(String(e.stderr).includes('MANUAL_EVIDENCE_ATTACHMENT_REQUIRED'))}assert(failed);base.evidence.actualDiskFullRecovery=saved;
  base.binding.primaryCertificationEvidenceId='f'.repeat(64);fs.writeFileSync(file,JSON.stringify(base));failed=false;try{cp.execFileSync(process.execPath,['scripts/verify-manual-evidence-rc1.cjs',file,'--require-all',`--primary-report=${primaryReport}`,`--execution-id=${executionId}`],{cwd,stdio:'pipe'})}catch(e){failed=true;assert(String(e.stderr).includes('MANUAL_EVIDENCE_PRIMARY_REPORT_BINDING_MISMATCH'))}assert(failed);
  console.log('manual-evidence-rc1.test.cjs PASS',{schema:'v4',executionBound:true,primaryReportBound:true,allPassAttachmentsRequired:true,releaseBound:true});
}finally{fs.rmSync(dir,{recursive:true,force:true});}
