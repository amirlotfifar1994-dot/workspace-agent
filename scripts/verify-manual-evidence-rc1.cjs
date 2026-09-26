const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const {validate:validateStablePolicy}=require('./stable-certification-policy.cjs');
const stablePolicy=validateStablePolicy(pkg);if(!stablePolicy.ok){console.error(JSON.stringify({status:'FAIL',code:'STABLE_CERTIFICATION_POLICY_INVALID',errors:stablePolicy.errors},null,2));process.exit(1)}
const file=process.argv[2];
const requireAll=process.argv.includes('--require-all');
const requireArtifactBinding=process.argv.includes('--require-artifact-binding');
const releaseManifestArg=process.argv.find(x=>x.startsWith('--release-manifest='));
const releaseManifestPath=releaseManifestArg?path.resolve(releaseManifestArg.slice('--release-manifest='.length)):'';
const executionArg=process.argv.find(x=>x.startsWith('--execution-id='));
const primaryReportArg=process.argv.find(x=>x.startsWith('--primary-report='));
const primaryReportPath=primaryReportArg?path.resolve(primaryReportArg.slice('--primary-report='.length)):'';
const expectedExecutionId=executionArg?executionArg.slice('--execution-id='.length):'';
const expectedVersion='1.0.0-rc1';
const schema='workspace-agent-manual-evidence-rc1-v4';
const keys=['physicalUsbDisconnectReconnect','actualDiskFullRecovery','realAclReadOnlyRecovery','uncleanShutdownPowerLoss','realUpgradeFrom0_9_8'];
function fail(code,extra={}){console.error(JSON.stringify({status:'FAIL',code,...extra},null,2));process.exit(1)}
function sha256(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}
function nonEmpty(v,min=1){return typeof v==='string'&&v.trim().length>=min}
function isoMs(v){const ms=Date.parse(String(v||''));return Number.isFinite(ms)?ms:null}
function validIso(v){const ms=isoMs(v);return ms!==null&&ms<=Date.now()+10*60*1000?new Date(ms).toISOString():null}
function hex64(v){return /^[a-f0-9]{64}$/i.test(String(v||''))}
function validExecutionId(v){return typeof v==='string'&&v.length>0&&v.length<=128&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v)&&v!=='.'&&v!=='..'}
function inside(base,target){const rel=path.relative(base,target);return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)}
function verifyAttachment(item,key,manualDir){
  const ref=String(item.attachment||'').trim();
  if(!ref)return{present:false,ok:true};
  if(path.isAbsolute(ref)||ref.includes('\0'))return{present:true,ok:false,code:`ATTACHMENT_PATH_INVALID:${key}`};
  const abs=path.resolve(manualDir,ref);
  if(!inside(manualDir,abs))return{present:true,ok:false,code:`ATTACHMENT_PATH_ESCAPE:${key}`};
  if(!fs.existsSync(abs))return{present:true,ok:false,code:`ATTACHMENT_MISSING:${key}`};const lst=fs.lstatSync(abs);if(lst.isSymbolicLink())return{present:true,ok:false,code:`ATTACHMENT_SYMLINK_REPARSE_FORBIDDEN:${key}`};if(!lst.isFile())return{present:true,ok:false,code:`ATTACHMENT_NOT_REGULAR_FILE:${key}`};
  if(!hex64(item.attachmentSha256))return{present:true,ok:false,code:`ATTACHMENT_SHA256_REQUIRED:${key}`};
  const st=fs.statSync(abs),actual=sha256(abs);
  if(String(item.attachmentSha256).toLowerCase()!==actual)return{present:true,ok:false,code:`ATTACHMENT_SHA256_MISMATCH:${key}`};
  if(!Number.isInteger(Number(item.attachmentBytes))||Number(item.attachmentBytes)!==st.size)return{present:true,ok:false,code:`ATTACHMENT_BYTES_MISMATCH:${key}`};
  return{present:true,ok:true,path:ref,sha256:actual,bytes:st.size};
}
if(!file||!fs.existsSync(file)){
  if(requireAll)fail('MANUAL_EVIDENCE_REQUIRED');
  console.log(JSON.stringify({status:'SKIP',code:'MANUAL_EVIDENCE_NOT_PROVIDED'}));process.exit(0);
}
const evidencePath=path.resolve(file),manualDir=path.dirname(evidencePath);
let d;try{d=JSON.parse(fs.readFileSync(evidencePath,'utf8'))}catch{fail('MANUAL_EVIDENCE_INVALID_JSON')}
if(d.schemaVersion!==schema||String(d.version)!==expectedVersion)fail('MANUAL_EVIDENCE_SCHEMA_MISMATCH',{schemaVersion:d.schemaVersion,version:d.version,expectedSchema:schema,expectedVersion});
const metadataErrors=[];
if(!nonEmpty(d.operator,2))metadataErrors.push('operator');
if(!nonEmpty(d.machine,2))metadataErrors.push('machine');
const createdAt=validIso(d.createdAt);if(!createdAt)metadataErrors.push('createdAt');
if(!validExecutionId(String(d.executionId||'')))metadataErrors.push('executionId');
if(expectedExecutionId&&String(d.executionId||'')!==String(expectedExecutionId))fail('MANUAL_EVIDENCE_EXECUTION_ID_MISMATCH',{expected:expectedExecutionId,actual:d.executionId||''});
const binding=d.binding||{};
for(const k of ['sourceFingerprint','packageLockSha256','releaseIdentitySha256','releaseManifestSha256','installerSha256','primaryCertificationReportSha256','primaryCertificationEvidenceId'])if(!hex64(binding[k]))metadataErrors.push(`binding.${k}`);
if(!['Windows10','Windows11'].includes(String(binding.primaryWindowsFamily||'')))metadataErrors.push('binding.primaryWindowsFamily');
if(metadataErrors.length)fail('MANUAL_EVIDENCE_METADATA_INVALID',{fields:metadataErrors});
const createdMs=isoMs(d.createdAt);
const pending=[],failed=[],weak=[],timing=[],attachments=[];
for(const k of keys){
  const item=d.evidence?.[k]||{};
  const s=String(item.status||'').toUpperCase();
  if(s==='FAIL')failed.push(k);
  else if(s!=='PASS')pending.push(k);
  else{
    const att=verifyAttachment(item,k,manualDir);if(!att.ok)fail('MANUAL_EVIDENCE_ATTACHMENT_INVALID',{item:k,reason:att.code});if(att.present)attachments.push({item:k,path:att.path,sha256:att.sha256,bytes:att.bytes});
    if(stablePolicy.policy.requireHashBoundAttachmentForManualPass===true&&!att.present)fail('MANUAL_EVIDENCE_ATTACHMENT_REQUIRED',{item:k,policySha256:stablePolicy.sha256});
    if(!att.present&&!nonEmpty(item.notes,24))weak.push(k);
    const observed=validIso(item.observedAt),observedMs=isoMs(item.observedAt);if(!observed||observedMs<createdMs-10*60*1000)timing.push(k);
  }
}
if(failed.length)fail('MANUAL_EVIDENCE_FAILED',{failed});
if(weak.length)fail('MANUAL_EVIDENCE_PROVENANCE_WEAK',{weak,message:'PASS evidence must include at least 24 characters of notes or a hash-bound attachment.'});
if(timing.length)fail('MANUAL_EVIDENCE_OBSERVED_AT_INVALID',{items:timing,message:'PASS observations must be timestamped no earlier than the prefill window and not materially in the future.'});
const up=d.evidence?.realUpgradeFrom0_9_8||{};
if(String(up.status||'').toUpperCase()==='PASS'){
  const upgradeErrors=[];
  if(String(up.fromVersion||'')!=='0.9.8')upgradeErrors.push('fromVersion');
  if(String(up.toVersion||'')!==expectedVersion)upgradeErrors.push('toVersion');
  if(!hex64(up.installerSha256))upgradeErrors.push('installerSha256');
  if(String(up.installerSha256||'').toLowerCase()!==String(binding.installerSha256||'').toLowerCase())upgradeErrors.push('installerSha256Binding');
  if(String(up.preSelfCheckOverall||'').toLowerCase()!=='pass')upgradeErrors.push('preSelfCheckOverall');
  if(String(up.postSelfCheckOverall||'').toLowerCase()!=='pass')upgradeErrors.push('postSelfCheckOverall');
  if(up.statePreserved!==true)upgradeErrors.push('statePreserved');
  if(upgradeErrors.length)fail('UPGRADE_EVIDENCE_STRUCTURE_INVALID',{fields:upgradeErrors});
}
if(requireAll&&pending.length)fail('MANUAL_EVIDENCE_INCOMPLETE',{pending});

let primaryBinding={checked:false,ok:false};
if(primaryReportPath){
  if(!fs.existsSync(primaryReportPath))fail('PRIMARY_CERTIFICATION_REPORT_REQUIRED_FOR_MANUAL_EVIDENCE_BINDING');
  const lst=fs.lstatSync(primaryReportPath);if(lst.isSymbolicLink()||!lst.isFile())fail('PRIMARY_CERTIFICATION_REPORT_REGULAR_FILE_REQUIRED');
  let pr;try{pr=JSON.parse(fs.readFileSync(primaryReportPath,'utf8'))}catch{fail('PRIMARY_CERTIFICATION_REPORT_INVALID_JSON')}
  const mismatches=[];const reportSha=sha256(primaryReportPath);const evidenceId=String(pr.evidenceId||'').toLowerCase();const family=String(pr.windowsFamily||'');
  if(String(pr.overall||'')!=='PASS')mismatches.push('primaryReportOverall');
  if(String(binding.primaryCertificationReportSha256||'').toLowerCase()!==reportSha)mismatches.push('primaryCertificationReportSha256');
  if(String(binding.primaryCertificationEvidenceId||'').toLowerCase()!==evidenceId)mismatches.push('primaryCertificationEvidenceId');
  if(String(binding.primaryWindowsFamily||'')!==family)mismatches.push('primaryWindowsFamily');
  if(String(binding.sourceFingerprint||'').toLowerCase()!==String(pr.sourceFingerprint?.sha256||pr.sourceFingerprint||'').toLowerCase())mismatches.push('primarySourceFingerprint');
  if(String(binding.packageLockSha256||'').toLowerCase()!==String(pr.packageLockSha256||'').toLowerCase())mismatches.push('primaryPackageLockSha256');
  if(String(binding.releaseIdentitySha256||'').toLowerCase()!==String(pr.releaseIdentitySha256||'').toLowerCase())mismatches.push('primaryReleaseIdentitySha256');
  if(mismatches.length)fail('MANUAL_EVIDENCE_PRIMARY_REPORT_BINDING_MISMATCH',{fields:mismatches,primaryReportSha256:reportSha});
  primaryBinding={checked:true,ok:true,primaryReportSha256:reportSha,evidenceId,family};
}else if(requireAll){fail('PRIMARY_CERTIFICATION_REPORT_REQUIRED_FOR_MANUAL_EVIDENCE_BINDING')}

let artifactBinding={required:requireArtifactBinding,checked:false,ok:!requireArtifactBinding,releaseManifestSha256:null};
if(requireArtifactBinding){
  if(!releaseManifestPath||!fs.existsSync(releaseManifestPath))fail('RELEASE_MANIFEST_REQUIRED_FOR_MANUAL_EVIDENCE_BINDING');
  let m;try{m=JSON.parse(fs.readFileSync(releaseManifestPath,'utf8'))}catch{fail('RELEASE_MANIFEST_INVALID_FOR_MANUAL_EVIDENCE_BINDING')}
  const setup=(m.artifacts||[]).find(x=>String(x.kind||'')==='nsis');
  if(!setup||!hex64(setup.sha256))fail('NSIS_ARTIFACT_REQUIRED_FOR_UPGRADE_BINDING');
  if(String(up.status||'').toUpperCase()!=='PASS')fail('UPGRADE_EVIDENCE_REQUIRED_FOR_ARTIFACT_BINDING');
  const manifestSha=sha256(releaseManifestPath);
  const mismatches=[];
  if(String(binding.releaseManifestSha256).toLowerCase()!==manifestSha)mismatches.push('releaseManifestSha256');
  if(String(binding.sourceFingerprint).toLowerCase()!==String(m.sourceFingerprint||'').toLowerCase())mismatches.push('sourceFingerprint');
  if(String(binding.packageLockSha256).toLowerCase()!==String(m.packageLockSha256||'').toLowerCase())mismatches.push('packageLockSha256');
  if(String(binding.releaseIdentitySha256).toLowerCase()!==String(m.releaseIdentitySha256||'').toLowerCase())mismatches.push('releaseIdentitySha256');
  if(String(binding.installerSha256).toLowerCase()!==String(setup.sha256).toLowerCase())mismatches.push('binding.installerSha256');
  if(String(up.installerSha256||'').toLowerCase()!==String(setup.sha256).toLowerCase())mismatches.push('upgrade.installerSha256');
  if(mismatches.length)fail('MANUAL_EVIDENCE_RELEASE_BINDING_MISMATCH',{fields:mismatches,releaseManifestSha256:manifestSha});
  artifactBinding={required:true,checked:true,ok:true,releaseManifestSha256:manifestSha,sourceFingerprint:m.sourceFingerprint,packageLockSha256:m.packageLockSha256,releaseIdentitySha256:m.releaseIdentitySha256,installerFile:setup.file,installerSha256:setup.sha256};
}
console.log(JSON.stringify({status:pending.length?'INCOMPLETE':'PASS',pending,operator:String(d.operator||''),machine:String(d.machine||''),createdAt,executionId:d.executionId,sha256:sha256(evidencePath),requiredKeys:keys,attachments,primaryBinding,artifactBinding,stableCertificationPolicySha256:stablePolicy.sha256},null,2));
