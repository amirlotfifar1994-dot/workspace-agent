const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const cp=require('child_process');
const {verifyHandoff,shaFile:handoffShaFile}=require('./rc1-execution-handoff.cjs');
const {validate:validateStablePolicy}=require('./stable-certification-policy.cjs');
const root=path.resolve(__dirname,'..');
function arg(name){const p=process.argv.find(x=>x.startsWith(`--${name}=`));return p?p.slice(name.length+3):''}
function shaFile(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}
function meta(p){const a=path.resolve(root,p),ls=fs.lstatSync(a);if(ls.isSymbolicLink())fail('FINAL_INPUT_SYMLINK_REPARSE_FORBIDDEN','Finalization input cannot be a symlink/reparse-backed file.',{path:a});if(!ls.isFile())fail('FINAL_INPUT_REGULAR_FILE_REQUIRED','Finalization input must be a regular file.',{path:a});const s=fs.statSync(a);return{path:a,bytes:s.size,sha256:shaFile(a)}}
function fail(code,message,extra={}){console.error(JSON.stringify({ok:false,code,message,...extra},null,2));process.exit(1)}
function validExecutionId(v){return typeof v==='string'&&v.length>0&&v.length<=128&&/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v)&&v!=='.'&&v!=='..'}
function samePath(a,b){return path.resolve(a)===path.resolve(b)}
function inside(base,target){const rel=path.relative(base,target);return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)}
function readJson(p){return JSON.parse(fs.readFileSync(p,'utf8'))}
function verifyBoundHandoff({manifestPath,role,executionId,reportPath,releaseManifestPath=''}){
  const mp=path.resolve(root,manifestPath);if(!fs.existsSync(mp))fail('HANDOFF_MANIFEST_REQUIRED',`${role} handoff manifest missing.`,{manifestPath:mp});const dir=path.dirname(mp);
  const r=verifyHandoff({dir,manifestPath:mp,requireCurrentSource:true});if(!r.ok)fail('HANDOFF_MANIFEST_INVALID',`${role} handoff failed integrity/source verification.`,{role,errors:r.errors,manifestPath:mp});
  if(String(r.role)!==role)fail('HANDOFF_ROLE_MISMATCH','Handoff role mismatch.',{expected:role,actual:r.role});if(String(r.executionId)!==String(executionId))fail('HANDOFF_EXECUTION_ID_MISMATCH','Handoff execution id mismatch.',{role,expected:executionId,actual:r.executionId});
  const manifest=readJson(mp);const pointerRel=String(manifest.pointer?.path||'');if(!pointerRel)fail('HANDOFF_POINTER_REQUIRED','Handoff pointer metadata is required.',{role});const pointerPath=path.resolve(dir,pointerRel);if(!inside(dir,pointerPath)||!fs.existsSync(pointerPath))fail('HANDOFF_POINTER_INVALID','Handoff pointer path is invalid.',{role,pointerRel});if(manifest.pointer?.sha256&&String(manifest.pointer.sha256).toLowerCase()!==handoffShaFile(pointerPath))fail('HANDOFF_POINTER_HASH_MISMATCH','Handoff pointer hash mismatch.',{role});
  const pointer=readJson(pointerPath);if(String(pointer.executionId||'')!==String(executionId))fail('POINTER_EXECUTION_ID_MISMATCH','Pointer execution id mismatch.',{role,expected:executionId,actual:pointer.executionId||''});
  const expectedReport=path.resolve(dir,String(pointer.certificationReport||''));if(!inside(dir,expectedReport)||!samePath(expectedReport,reportPath))fail('HANDOFF_REPORT_BINDING_MISMATCH','Final report is not the report declared by the verified handoff pointer.',{role,expectedReport,reportPath:path.resolve(reportPath)});
  if(role==='primary'){
    const expectedManifest=path.resolve(dir,String(pointer.releaseManifest||''));if(!inside(dir,expectedManifest)||!samePath(expectedManifest,releaseManifestPath))fail('HANDOFF_RELEASE_MANIFEST_BINDING_MISMATCH','Release manifest is not the manifest declared by the Primary handoff pointer.',{expectedManifest,releaseManifestPath:path.resolve(releaseManifestPath)});
  }
  return{manifest:meta(mp),handoffId:String(manifest.handoffId||''),pointer:meta(pointerPath),role,executionId};
}
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(pkg.version!=='1.0.0-rc1'||pkg.workspaceAgentRelease?.toolingRevision!=='cert-kit21'||pkg.workspaceAgentRelease?.featureFreeze!==true)fail('CERT_KIT21_RC1_REQUIRED','Finalizer فقط برای RC1 / cert-kit21 معتبر است.');const stablePolicy=validateStablePolicy(pkg);if(!stablePolicy.ok)fail('STABLE_CERTIFICATION_POLICY_INVALID','Stable certification policy invalid.',{errors:stablePolicy.errors});
const artifactReport=arg('artifact-report'),peerReport=arg('peer-report'),releaseManifest=arg('release-manifest'),manualEvidence=arg('manual-evidence'),executionId=arg('execution-id'),primaryHandoffManifest=arg('primary-handoff-manifest'),peerHandoffManifest=arg('peer-handoff-manifest');
for(const [name,value] of Object.entries({artifactReport,peerReport,releaseManifest,manualEvidence,primaryHandoffManifest,peerHandoffManifest}))if(!value||!fs.existsSync(path.resolve(root,value)))fail('FINALIZATION_INPUT_REQUIRED',`${name} معتبر لازم است.`,{name,value});
if(!validExecutionId(executionId))fail('FINALIZATION_EXECUTION_ID_REQUIRED','--execution-id معتبر برای Finalization لازم است.',{executionId});
const primaryBinding=verifyBoundHandoff({manifestPath:primaryHandoffManifest,role:'primary',executionId,reportPath:path.resolve(root,artifactReport),releaseManifestPath:path.resolve(root,releaseManifest)});
const peerBinding=verifyBoundHandoff({manifestPath:peerHandoffManifest,role:'peer',executionId,reportPath:path.resolve(root,peerReport)});
const requireSigning=process.argv.includes('--require-signing')||stablePolicy.policy.requireAuthenticode===true;
const out=path.resolve(root,arg('out')||'final-certification/rc1-final-envelope.json');fs.mkdirSync(path.dirname(out),{recursive:true});
const envArgs=['scripts/rc1-certification-envelope.cjs',`--report=${path.resolve(root,artifactReport)}`,`--peer-report=${path.resolve(root,peerReport)}`,`--release-manifest=${path.resolve(root,releaseManifest)}`,`--manual-evidence=${path.resolve(root,manualEvidence)}`,`--execution-id=${executionId}`,`--out=${out}`,'--require-dual-windows','--require-artifacts','--require-manual-evidence','--require-execution-binding'];if(requireSigning)envArgs.push('--require-signing');
const r=cp.spawnSync(process.execPath,envArgs,{cwd:root,encoding:'utf8'});if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);if(r.status!==0)process.exit(r.status||1);
const envelope=JSON.parse(fs.readFileSync(out,'utf8'));if(envelope.overall!=='PASS')fail('FINAL_ENVELOPE_NOT_PASS','Final Envelope باید PASS باشد.',{overall:envelope.overall});if(String(envelope.execution?.executionId||'')!==executionId)fail('FINAL_ENVELOPE_EXECUTION_ID_MISMATCH','Final envelope execution binding mismatch.');
const verdict={schemaVersion:'workspace-agent-rc1-final-verdict-v4',version:pkg.version,toolingRevision:pkg.workspaceAgentRelease.toolingRevision,createdAt:new Date().toISOString(),executionId,overall:'PASS',envelope:{path:out,sha256:shaFile(out),evidenceId:envelope.evidenceId},inputs:{artifactReport:meta(artifactReport),artifactEvidenceBundle:envelope.inputs?.certificationEvidenceBundle||null,peerReport:meta(peerReport),peerEvidenceBundle:envelope.inputs?.peerEvidenceBundle||null,releaseManifest:meta(releaseManifest),manualEvidence:meta(manualEvidence),primaryHandoffManifest:primaryBinding.manifest,peerHandoffManifest:peerBinding.manifest},handoffs:{primary:{handoffId:primaryBinding.handoffId,pointer:primaryBinding.pointer},peer:{handoffId:peerBinding.handoffId,pointer:peerBinding.pointer}},windowsFamilies:envelope.checks?.windowsFamilies||null,releaseIdentitySha256:envelope.releaseIdentity?.sha256||null,signingRequired:requireSigning,dependencySourcePolicySha256:readJson(path.resolve(root,releaseManifest)).dependencySourcePolicySha256||null,stableCertificationPolicySha256:stablePolicy.sha256,finalBundleRequired:true};
const stable=JSON.stringify(verdict);verdict.finalizationId=crypto.createHash('sha256').update(stable).digest('hex');const verdictPath=path.join(path.dirname(out),'rc1-final-verdict.json');fs.writeFileSync(verdictPath,JSON.stringify(verdict,null,2));
console.log(JSON.stringify({ok:true,overall:'PASS',executionId,finalizationId:verdict.finalizationId,primaryHandoffId:primaryBinding.handoffId,peerHandoffId:peerBinding.handoffId,envelope:out,verdict:verdictPath},null,2));
