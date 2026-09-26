const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const cp=require('child_process');
const {verifyBundle}=require('./certification-evidence-bundle.cjs');
const {computeReleaseIdentity}=require('./release-identity.cjs');
const root=path.resolve(__dirname,'..');
const MANUAL_KEYS=['physicalUsbDisconnectReconnect','actualDiskFullRecovery','realAclReadOnlyRecovery','uncleanShutdownPowerLoss','realUpgradeFrom0_9_8'];
function arg(name){const p=`--${name}=`;const v=process.argv.find(x=>x.startsWith(p));return v?v.slice(p.length):''}
function has(name){return process.argv.includes(`--${name}`)}
function shaBuf(buf){return crypto.createHash('sha256').update(buf).digest('hex')}
function shaFile(p){return shaBuf(fs.readFileSync(p))}
function readJson(p){return JSON.parse(fs.readFileSync(p,'utf8'))}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object'){const out={};for(const k of Object.keys(value).sort())out[k]=canonical(value[k]);return out}return value}
function stable(value){return JSON.stringify(canonical(value))}
function fileMeta(p){if(!p||!fs.existsSync(p))return null;const st=fs.statSync(p);return{path:path.relative(root,p).replace(/\\/g,'/'),bytes:st.size,sha256:shaFile(p)}}
function fail(code,message,extra={}){console.error(JSON.stringify({ok:false,code,message,...extra},null,2));process.exit(1)}
function detectWindowsFamily(report={}){
  const explicit=String(report.windowsFamily||'');if(explicit==='Windows10'||explicit==='Windows11')return explicit;
  const caption=String(report.os?.caption||'');if(/Windows\s+11/i.test(caption))return 'Windows11';if(/Windows\s+10/i.test(caption))return 'Windows10';
  const build=Number(report.os?.build||0);if(build>=22000)return 'Windows11';if(build>=10240)return 'Windows10';return 'UNKNOWN';
}
function sourceHash(report){return String(report?.sourceFingerprint?.sha256||report?.sourceFingerprint||'')}
function verifyReportEvidence(reportPath,report={}){
  const declared=report.evidenceBundle||{};const file=String(declared.file||'');
  if(!file)return{ok:false,errors:['REPORT_EVIDENCE_BUNDLE_REQUIRED'],meta:null};
  const sessionDir=path.dirname(path.resolve(reportPath));const bundlePath=path.resolve(sessionDir,file);
  const r=verifyBundle(bundlePath,{sessionDir,expectedSha256:String(declared.sha256||''),expectedFiles:declared.files??null,expectedAggregate:String(declared.aggregateSha256||'')});
  return{ok:r.ok,errors:r.errors||[],meta:r.ok?fileMeta(bundlePath):null,verification:r};
}
function validatePeerPair(current,peer,{fingerprint,lockSha,releaseIdentitySha256,version,toolingRevision}={}){
  if(!peer)return{complete:false,ok:true,currentFamily:detectWindowsFamily(current),peerFamily:null,reasons:['PEER_REPORT_REQUIRED']};
  const currentFamily=detectWindowsFamily(current),peerFamily=detectWindowsFamily(peer),reasons=[];
  if(!['Windows10','Windows11'].includes(currentFamily))reasons.push('CURRENT_WINDOWS_FAMILY_INVALID');
  if(!['Windows10','Windows11'].includes(peerFamily))reasons.push('PEER_WINDOWS_FAMILY_INVALID');
  if(currentFamily===peerFamily)reasons.push('WINDOWS_FAMILIES_NOT_DISTINCT');
  if(String(peer.overall||'').toUpperCase()!=='PASS')reasons.push('PEER_REPORT_NOT_PASS');
  if(version&&String(peer.workspaceAgentVersion||'')!==String(version))reasons.push('PEER_VERSION_MISMATCH');
  if(toolingRevision&&String(peer.toolingRevision||'')!==String(toolingRevision))reasons.push('PEER_TOOLING_MISMATCH');
  if(fingerprint&&sourceHash(peer)!==String(fingerprint))reasons.push('PEER_SOURCE_FINGERPRINT_MISMATCH');
  if(lockSha&&String(peer.packageLockSha256||'').toLowerCase()!==String(lockSha).toLowerCase())reasons.push('PEER_LOCK_HASH_MISMATCH');
  if(releaseIdentitySha256&&String(peer.releaseIdentitySha256||'').toLowerCase()!==String(releaseIdentitySha256).toLowerCase())reasons.push('PEER_RELEASE_IDENTITY_MISMATCH');
  return{complete:true,ok:reasons.length===0,currentFamily,peerFamily,reasons};
}
function verifyManual(manualPath,required,{releaseManifestPath='',primaryReportPath='',requireArtifactBinding=false,executionId=''}={}){
  if(!manualPath)return{provided:false,ok:!required,incomplete:required,meta:null,error:null};
  if(!fs.existsSync(manualPath))return{provided:true,ok:false,incomplete:false,meta:null,error:'MANUAL_EVIDENCE_FILE_MISSING'};
  try{
    const args=['scripts/verify-manual-evidence-rc1.cjs',manualPath];if(required)args.push('--require-all');if(executionId)args.push(`--execution-id=${executionId}`);if(requireArtifactBinding){args.push('--require-artifact-binding');if(releaseManifestPath)args.push(`--release-manifest=${releaseManifestPath}`);}if(primaryReportPath)args.push(`--primary-report=${primaryReportPath}`);
    const text=cp.execFileSync(process.execPath,args,{cwd:root,encoding:'utf8'});const meta=JSON.parse(text);
    return{provided:true,ok:meta.status==='PASS'||(!required&&meta.status==='INCOMPLETE'),incomplete:required&&meta.status!=='PASS',meta,error:null};
  }catch(e){return{provided:true,ok:false,incomplete:false,meta:null,error:String(e.stderr||e.message||'MANUAL_EVIDENCE_INVALID')}}
}

function verifyReleaseManifest(manifestPath,requireSigning){
  if(!manifestPath||!fs.existsSync(manifestPath))return{ok:false,error:'RELEASE_MANIFEST_MISSING'};
  try{const args=['scripts/verify-release-manifest-rc1.cjs',`--manifest=${manifestPath}`];if(requireSigning)args.push('--require-signing');const text=cp.execFileSync(process.execPath,args,{cwd:root,encoding:'utf8'});return{ok:true,meta:JSON.parse(text),error:null};}catch(e){return{ok:false,meta:null,error:String(e.stderr||e.stdout||e.message||'RELEASE_MANIFEST_INVALID')}}
}
function main(){
  const pkg=readJson(path.join(root,'package.json'));
  if(pkg.version!=='1.0.0-rc1'||pkg.workspaceAgentRelease?.featureFreeze!==true)fail('RC1_CONTRACT_REQUIRED','Envelope فقط برای RC1 feature-frozen ساخته می‌شود.');
  const reportArg=arg('report');const reportPath=reportArg?path.resolve(root,reportArg):'';
  if(!reportArg||!fs.existsSync(reportPath))fail('CERTIFICATION_REPORT_REQUIRED','--report=<certification-report.json> لازم است.');
  const report=readJson(reportPath);
  const peerArg=arg('peer-report');const peerPath=peerArg?path.resolve(root,peerArg):'';const peer=peerPath&&fs.existsSync(peerPath)?readJson(peerPath):null;
  const lockPath=path.join(root,'package-lock.json');const lock=fileMeta(lockPath);const lockSha=lock?.sha256||'';
  let releaseIdentity=null;if(lock){try{releaseIdentity=computeReleaseIdentity(root)}catch{}}const releaseIdentitySha256=String(releaseIdentity?.releaseIdentitySha256||'');
  const releaseManifestPath=path.resolve(root,arg('release-manifest')||'release/release-manifest.json');const releaseManifest=fs.existsSync(releaseManifestPath)?readJson(releaseManifestPath):null;
  const manualPath=arg('manual-evidence')?path.resolve(root,arg('manual-evidence')):'';const executionId=arg('execution-id');const requireExecutionBinding=has('require-execution-binding');
  let fp={};try{fp=JSON.parse(cp.execFileSync(process.execPath,['scripts/source-tree-fingerprint.cjs'],{cwd:root,encoding:'utf8'}))}catch(e){fail('SOURCE_FINGERPRINT_FAILED',e.message)}
  const hardFailures=[],incomplete=[];if(requireExecutionBinding&&!executionId)hardFailures.push('EXECUTION_ID_REQUIRED');
  const reportStatus=String(report.overall||'').toUpperCase();
  if(reportStatus==='FAIL')hardFailures.push('CERTIFICATION_REPORT_FAILED');else if(reportStatus!=='PASS')incomplete.push('CERTIFICATION_REPORT_NOT_PASS');
  if(String(report.workspaceAgentVersion||'')!==String(pkg.version))hardFailures.push('REPORT_VERSION_MISMATCH');
  if(String(report.toolingRevision||'')!==String(pkg.workspaceAgentRelease?.toolingRevision||''))hardFailures.push('REPORT_TOOLING_MISMATCH');
  if(report.featureFreeze!==true)hardFailures.push('REPORT_FEATURE_FREEZE_MISMATCH');
  if(sourceHash(report)!==String(fp.sha256))hardFailures.push('REPORT_SOURCE_FINGERPRINT_MISMATCH');
  if(!lock)incomplete.push('PACKAGE_LOCK_MISSING');
  else if(String(report.packageLockSha256||'').toLowerCase()!==lockSha.toLowerCase())hardFailures.push('REPORT_LOCK_HASH_MISMATCH');
  if(lock&&!releaseIdentity)hardFailures.push('RELEASE_IDENTITY_COMPUTE_FAILED');
  else if(lock&&String(report.releaseIdentitySha256||'').toLowerCase()!==releaseIdentitySha256.toLowerCase())hardFailures.push('REPORT_RELEASE_IDENTITY_MISMATCH');
  if(!['Windows10','Windows11'].includes(detectWindowsFamily(report)))hardFailures.push('REPORT_WINDOWS_FAMILY_INVALID');
  const currentEvidence=verifyReportEvidence(reportPath,report);if(!currentEvidence.ok)hardFailures.push(...currentEvidence.errors.map(x=>`CURRENT_${x}`));

  const artifactRows=[];
  if(!releaseManifest)incomplete.push('RELEASE_MANIFEST_MISSING');
  else{
    if(String(releaseManifest.version||'')!==String(pkg.version))hardFailures.push('RELEASE_MANIFEST_VERSION_MISMATCH');
    if(String(releaseManifest.toolingRevision||'')!==String(pkg.workspaceAgentRelease?.toolingRevision||''))hardFailures.push('RELEASE_MANIFEST_TOOLING_MISMATCH');
    if(releaseManifest.featureFreeze!==true)hardFailures.push('RELEASE_MANIFEST_FEATURE_FREEZE_MISMATCH');
    if(String(releaseManifest.sourceFingerprint||'')!==String(fp.sha256))hardFailures.push('RELEASE_MANIFEST_SOURCE_FINGERPRINT_MISMATCH');
    if(lock&&String(releaseManifest.packageLockSha256||'').toLowerCase()!==lockSha.toLowerCase())hardFailures.push('RELEASE_MANIFEST_LOCK_HASH_MISMATCH');
    if(lock&&String(releaseManifest.releaseIdentitySha256||'').toLowerCase()!==releaseIdentitySha256.toLowerCase())hardFailures.push('RELEASE_MANIFEST_RELEASE_IDENTITY_MISMATCH');
    if(Array.isArray(releaseManifest.artifacts)){
      const artifactDir=path.dirname(releaseManifestPath);
      for(const a of releaseManifest.artifacts){const p=path.join(artifactDir,String(a.file||''));artifactRows.push({file:String(a.file||''),manifestSha256:String(a.sha256||'').toLowerCase(),actual:fs.existsSync(p)?fileMeta(p):null,match:fs.existsSync(p)&&String(a.sha256||'').toLowerCase()===shaFile(p)})}
    }
  }
  const requiredArtifacts=has('require-artifacts');
  const requireSigning=has('require-signing');
  const releaseContract=(requiredArtifacts||requireSigning)?verifyReleaseManifest(releaseManifestPath,requireSigning):{ok:true,meta:null,error:null};
  if(requiredArtifacts){if(!releaseManifest||artifactRows.length===0)incomplete.push('ARTIFACTS_REQUIRED');else if(artifactRows.some(x=>!x.actual||!x.match))hardFailures.push('ARTIFACT_INTEGRITY_MISMATCH');if(releaseManifest&&!releaseContract.ok)hardFailures.push('RELEASE_MANIFEST_CONTRACT_FAILED')}
  if(requireSigning){const sigs=releaseManifest?.signatures;if(!Array.isArray(sigs)||sigs.length===0)incomplete.push('SIGNATURES_REQUIRED');else if(sigs.some(x=>String(x.status)!=='Valid'))hardFailures.push('SIGNATURE_INVALID');if(releaseManifest&&!releaseContract.ok&&!hardFailures.includes('RELEASE_MANIFEST_CONTRACT_FAILED'))hardFailures.push('RELEASE_MANIFEST_CONTRACT_FAILED')}
  const releaseManifestMeta=releaseManifest?fileMeta(releaseManifestPath):null;
  let reportArtifactBindingOk=!requiredArtifacts;
  if(requiredArtifacts&&releaseManifest){
    if(!/^[a-f0-9]{64}$/i.test(String(report.releaseManifestSha256||'')))hardFailures.push('REPORT_RELEASE_MANIFEST_HASH_REQUIRED');
    else if(String(report.releaseManifestSha256).toLowerCase()!==String(releaseManifestMeta?.sha256||'').toLowerCase())hardFailures.push('REPORT_RELEASE_MANIFEST_HASH_MISMATCH');
    const rr=Array.isArray(report.artifacts)?report.artifacts:[],mm=Array.isArray(releaseManifest.artifacts)?releaseManifest.artifacts:[];const rmap=new Map(rr.map(x=>[String(x.file||''),x]));
    const artifactBindingErrors=[];for(const m of mm){const r=rmap.get(String(m.file||''));if(!r)artifactBindingErrors.push(`REPORT_ARTIFACT_MISSING:${String(m.file||'')}`);else if(String(r.sha256||'').toLowerCase()!==String(m.sha256||'').toLowerCase()||Number(r.bytes)!==Number(m.bytes))artifactBindingErrors.push(`REPORT_ARTIFACT_MISMATCH:${String(m.file||'')}`)}
    if(rr.length!==mm.length)artifactBindingErrors.push(`REPORT_ARTIFACT_COUNT_MISMATCH:${rr.length}:${mm.length}`);if(artifactBindingErrors.length)hardFailures.push(...artifactBindingErrors);reportArtifactBindingOk=artifactBindingErrors.length===0&&String(report.releaseManifestSha256||'').toLowerCase()===String(releaseManifestMeta?.sha256||'').toLowerCase();
  }

  const manualRequired=has('require-manual-evidence');const manualCheck=verifyManual(manualPath,manualRequired,{releaseManifestPath,primaryReportPath:reportPath,requireArtifactBinding:manualRequired&&has('require-artifacts'),executionId:requireExecutionBinding?executionId:''});
  if(manualCheck.error)hardFailures.push('MANUAL_EVIDENCE_INVALID');else if(manualCheck.incomplete)incomplete.push('MANUAL_EVIDENCE_REQUIRED');
  const requireDual=has('require-dual-windows');
  const pair=validatePeerPair(report,peer,{fingerprint:fp.sha256,lockSha,releaseIdentitySha256,version:pkg.version,toolingRevision:pkg.workspaceAgentRelease?.toolingRevision});
  if(peerArg&&!peer)hardFailures.push('PEER_REPORT_FILE_MISSING');
  const peerEvidence=peer?verifyReportEvidence(peerPath,peer):null;if(peerEvidence&&!peerEvidence.ok)hardFailures.push(...peerEvidence.errors.map(x=>`PEER_${x}`));
  if(requireDual){if(!pair.complete)incomplete.push('DUAL_WINDOWS_EVIDENCE_REQUIRED');else if(!pair.ok)hardFailures.push(...pair.reasons)}
  else if(peer&& !pair.ok)hardFailures.push(...pair.reasons);

  let overall='PASS';if(hardFailures.length)overall='FAIL';else if(incomplete.length)overall='INCOMPLETE';
  const checks={reportStatus,currentEvidenceBundleOk:currentEvidence.ok,peerEvidenceBundleOk:peerEvidence?peerEvidence.ok:null,sourceFingerprintMatch:sourceHash(report)===String(fp.sha256),lockPresent:Boolean(lock),reportLockHashMatch:Boolean(lock)&&String(report.packageLockSha256||'').toLowerCase()===lockSha.toLowerCase(),releaseManifestPresent:Boolean(releaseManifest),releaseManifestFingerprintMatch:Boolean(releaseManifest)&&String(releaseManifest.sourceFingerprint||'')===String(fp.sha256),releaseManifestLockHashMatch:Boolean(releaseManifest&&lock)&&String(releaseManifest.packageLockSha256||'').toLowerCase()===lockSha.toLowerCase(),releaseIdentityPresent:Boolean(releaseIdentitySha256),reportReleaseIdentityMatch:Boolean(lock)&&String(report.releaseIdentitySha256||'').toLowerCase()===releaseIdentitySha256.toLowerCase(),releaseManifestReleaseIdentityMatch:Boolean(releaseManifest&&lock)&&String(releaseManifest.releaseIdentitySha256||'').toLowerCase()===releaseIdentitySha256.toLowerCase(),peerReleaseIdentityMatch:peer?String(peer.releaseIdentitySha256||'').toLowerCase()===releaseIdentitySha256.toLowerCase():null,artifactsOk:!requiredArtifacts||(artifactRows.length>0&&artifactRows.every(x=>x.actual&&x.match)&&releaseContract.ok),releaseManifestContractOk:releaseContract.ok,reportArtifactBindingOk,signingOk:!requireSigning||Boolean(releaseManifest?.signatures?.length)&&releaseManifest.signatures.every(x=>String(x.status)==='Valid'),manualEvidenceOk:manualCheck.ok,dualWindowsOk:!requireDual||(pair.complete&&pair.ok),windowsFamilies:{current:pair.currentFamily,peer:pair.peerFamily},hardFailures,incomplete};
  const manualMeta=manualPath&&fs.existsSync(manualPath)?fileMeta(manualPath):null;
  const envelope={schemaVersion:'workspace-agent-rc1-certification-envelope-v4',version:pkg.version,toolingRevision:pkg.workspaceAgentRelease?.toolingRevision||null,createdAt:new Date().toISOString(),overall,checks,source:{fingerprint:String(fp.sha256||''),files:Number(fp.files||0),scope:String(fp.scope||'')},releaseIdentity:{sha256:releaseIdentitySha256,sourceFingerprint:String(fp.sha256||''),packageLockSha256:lockSha},inputs:{certificationReport:fileMeta(reportPath),certificationEvidenceBundle:currentEvidence.meta,peerWindowsReport:peer?fileMeta(peerPath):null,peerEvidenceBundle:peerEvidence?.meta||null,packageLock:lock,releaseManifest:releaseManifestMeta,manualEvidence:manualMeta},certification:{overall:report.overall||null,evidenceId:report.evidenceId||null,schemaVersion:report.schemaVersion||null,windowsFamily:detectWindowsFamily(report),peerEvidenceId:peer?.evidenceId||null,peerWindowsFamily:peer?detectWindowsFamily(peer):null},release:{releaseIdentitySha256,artifacts:artifactRows,signatures:releaseManifest?.signatures||[],contract:releaseContract.meta,error:releaseContract.error},manualEvidence:{required:manualRequired,requiredKeys:MANUAL_KEYS,verifier:manualCheck.meta},execution:{bindingRequired:requireExecutionBinding,executionId:executionId||null}};
  const noId=JSON.parse(JSON.stringify(envelope));envelope.evidenceId=shaBuf(Buffer.from(stable(noId)));
  const out=arg('out')?path.resolve(root,arg('out')):path.join(path.dirname(reportPath),'rc1-certification-envelope.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(envelope,null,2));
  console.log(JSON.stringify({ok:overall==='PASS',overall,evidenceId:envelope.evidenceId,out:path.relative(root,out).replace(/\\/g,'/'),checks},null,2));
  if(overall==='FAIL')process.exit(1);if(overall==='INCOMPLETE')process.exit(2);
}
if(require.main===module)main();
module.exports={detectWindowsFamily,validatePeerPair,verifyManual,verifyReportEvidence,MANUAL_KEYS};
