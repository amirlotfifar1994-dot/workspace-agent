const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {computeFingerprint}=require('./source-tree-fingerprint.cjs');
const {computeReleaseIdentity}=require('./release-identity.cjs');
const {verifyBundle}=require('./certification-evidence-bundle.cjs');
const root=path.resolve(__dirname,'..');
function arg(name){const p=`--${name}=`;const v=process.argv.find(x=>x.startsWith(p));return v?v.slice(p.length):'';}
function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return null;}}
function shaFile(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function resolveRecorded(value,base){if(!value)return'';return path.isAbsolute(String(value))?path.resolve(String(value)):path.resolve(base,String(value));}
function allowedIncomplete(role){return new Set(role==='primary'?['DUAL_WINDOWS_EVIDENCE_REQUIRED','MANUAL_EVIDENCE_REQUIRED']:role==='peer'?['MANUAL_EVIDENCE_REQUIRED']:[]);}
function evaluatePhase({resultPath,role,projectRoot=root,expectedReleaseIdentity}={}){
  if(!['primary','peer'].includes(role))return{ok:false,errors:['PHASE_ROLE_INVALID']};
  if(!resultPath||!fs.existsSync(resultPath))return{ok:false,errors:['PHASE_RESULT_MISSING'],resultPath};
  const pkg=readJson(path.join(projectRoot,'package.json'));const result=readJson(resultPath);if(!pkg||!result)return{ok:false,errors:['PHASE_RESULT_OR_PACKAGE_INVALID_JSON'],resultPath};
  const errors=[],warnings=[];let identity=expectedReleaseIdentity;
  if(identity===undefined){try{identity=computeReleaseIdentity(projectRoot).releaseIdentitySha256;}catch{identity='';}}
  const fp=computeFingerprint(projectRoot);const resultDir=path.dirname(path.resolve(resultPath));
  if(String(result.version||'')!==String(pkg.version||''))errors.push('RESULT_VERSION_MISMATCH');
  if(String(result.toolingRevision||'')!==String(pkg.workspaceAgentRelease?.toolingRevision||''))errors.push('RESULT_TOOLING_MISMATCH');
  if(!['PASS','INCOMPLETE'].includes(String(result.overall||'')))errors.push(`RESULT_STATUS_INVALID:${String(result.overall||'')}`);
  if(!identity)errors.push('CURRENT_RELEASE_IDENTITY_UNAVAILABLE');else if(String(result.releaseIdentitySha256||'').toLowerCase()!==String(identity).toLowerCase())errors.push('RESULT_RELEASE_IDENTITY_MISMATCH');
  const reportPath=resolveRecorded(result.certificationReport,resultDir);const report=reportPath&&fs.existsSync(reportPath)?readJson(reportPath):null;
  if(!report)errors.push('CERTIFICATION_REPORT_MISSING_OR_INVALID');else{
    if(String(report.overall||'')!=='PASS')errors.push(`REPORT_NOT_PASS:${String(report.overall||'')}`);
    if(String(report.workspaceAgentVersion||'')!==String(pkg.version||''))errors.push('REPORT_VERSION_MISMATCH');
    if(String(report.toolingRevision||'')!==String(pkg.workspaceAgentRelease?.toolingRevision||''))errors.push('REPORT_TOOLING_MISMATCH');
    if(report.featureFreeze!==true)errors.push('REPORT_FEATURE_FREEZE_MISMATCH');
    if(String(report.sourceFingerprint?.sha256||report.sourceFingerprint||'')!==String(fp.sha256||''))errors.push('REPORT_SOURCE_FINGERPRINT_MISMATCH');
    if(identity&&String(report.releaseIdentitySha256||'').toLowerCase()!==String(identity).toLowerCase())errors.push('REPORT_RELEASE_IDENTITY_MISMATCH');
  }
  if(report&&result.certificationEvidenceId&&report.evidenceId&&String(result.certificationEvidenceId)!==String(report.evidenceId))errors.push('CERTIFICATION_EVIDENCE_ID_MISMATCH');
  const lockPath=path.join(projectRoot,'package-lock.json');if(fs.existsSync(lockPath)){const lockSha=shaFile(lockPath);if(result.packageLockSha256&&String(result.packageLockSha256).toLowerCase()!==lockSha)errors.push('RESULT_LOCK_HASH_MISMATCH');if(report?.packageLockSha256&&String(report.packageLockSha256).toLowerCase()!==lockSha)errors.push('REPORT_LOCK_HASH_MISMATCH');}
  const bundlePath=resolveRecorded(result.certificationEvidenceBundle,resultDir);let bundleVerification=null;
  if(!bundlePath||!fs.existsSync(bundlePath))errors.push('CERTIFICATION_EVIDENCE_BUNDLE_MISSING');else{
    const declared=report?.evidenceBundle||{};const reportDir=reportPath?path.dirname(reportPath):path.dirname(bundlePath);const declaredPath=declared.file?path.resolve(reportDir,String(declared.file)):bundlePath;if(path.resolve(bundlePath)!==declaredPath)errors.push('RESULT_REPORT_EVIDENCE_BUNDLE_PATH_MISMATCH');
    bundleVerification=verifyBundle(bundlePath,{sessionDir:reportDir,expectedSha256:String(declared.sha256||''),expectedFiles:declared.files??null,expectedAggregate:String(declared.aggregateSha256||'')});if(!bundleVerification.ok)errors.push(...bundleVerification.errors.map(x=>`EVIDENCE_${x}`));
  }
  const envelopePath=resolveRecorded(result.envelope,resultDir);const envelope=envelopePath&&fs.existsSync(envelopePath)?readJson(envelopePath):null;
  if(!envelope)errors.push('RC1_ENVELOPE_MISSING_OR_INVALID');else{
    if(String(envelope.version||'')!==String(pkg.version||''))errors.push('ENVELOPE_VERSION_MISMATCH');
    if(String(envelope.toolingRevision||'')!==String(pkg.workspaceAgentRelease?.toolingRevision||''))errors.push('ENVELOPE_TOOLING_MISMATCH');
    if(identity&&String(envelope.releaseIdentity?.sha256||'').toLowerCase()!==String(identity).toLowerCase())errors.push('ENVELOPE_RELEASE_IDENTITY_MISMATCH');
    if(String(result.overall||'')!==String(envelope.overall||''))errors.push('RESULT_ENVELOPE_STATUS_MISMATCH');
    if(envelope.inputs?.certificationReport?.sha256&&reportPath&&String(envelope.inputs.certificationReport.sha256).toLowerCase()!==shaFile(reportPath))errors.push('ENVELOPE_REPORT_HASH_MISMATCH');
    if(envelope.inputs?.certificationEvidenceBundle?.sha256&&bundlePath&&String(envelope.inputs.certificationEvidenceBundle.sha256).toLowerCase()!==shaFile(bundlePath))errors.push('ENVELOPE_EVIDENCE_HASH_MISMATCH');
    const hard=Array.isArray(envelope.checks?.hardFailures)?envelope.checks.hardFailures:[];if(hard.length)errors.push(...hard.map(x=>`ENVELOPE_HARD_FAILURE:${x}`));
    const inc=Array.isArray(envelope.checks?.incomplete)?envelope.checks.incomplete:[];const allowed=allowedIncomplete(role);for(const reason of inc)if(!allowed.has(String(reason)))errors.push(`UNEXPECTED_INCOMPLETE:${reason}`);
    if(role==='primary'&&String(envelope.overall||'')==='INCOMPLETE'&&!inc.includes('DUAL_WINDOWS_EVIDENCE_REQUIRED'))warnings.push('PRIMARY_ENVELOPE_WITHOUT_DUAL_WINDOWS_MARKER');
    if(!['PASS','INCOMPLETE'].includes(String(envelope.overall||'')))errors.push(`ENVELOPE_STATUS_INVALID:${String(envelope.overall||'')}`);
  }
  const ready=errors.length===0;return{ok:ready,status:ready?'READY_FOR_HANDOFF':'BLOCKED',role,resultPath:path.resolve(resultPath),reportPath,envelopePath,bundlePath,releaseIdentitySha256:identity||null,sourceFingerprint:fp.sha256,resultOverall:result?.overall||null,envelopeOverall:envelope?.overall||null,expectedIncomplete:[...allowedIncomplete(role)],actualIncomplete:Array.isArray(envelope?.checks?.incomplete)?envelope.checks.incomplete:[],warnings,errors,resultSha256:shaFile(resultPath),reportSha256:reportPath&&fs.existsSync(reportPath)?shaFile(reportPath):null,bundleVerification};
}
function main(){try{const result=arg('result'),role=arg('role');const r=evaluatePhase({resultPath:path.resolve(result),role});const out=arg('out');if(out){const p=path.resolve(out);fs.mkdirSync(path.dirname(p),{recursive:true});const tmp=p+'.tmp-'+process.pid+'-'+Date.now();fs.writeFileSync(tmp,JSON.stringify(r,null,2));fs.renameSync(tmp,p);}console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=2;}catch(e){console.error(JSON.stringify({ok:false,status:'BLOCKED',errors:['PHASE_READINESS_EXCEPTION'],message:String(e.message||e)},null,2));process.exitCode=1;}}
if(require.main===module)main();
module.exports={evaluatePhase,allowedIncomplete};
