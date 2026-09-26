const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {computeFingerprint}=require('./source-tree-fingerprint.cjs');
const {computeReleaseIdentity}=require('./release-identity.cjs');
const {evaluatePhase}=require('./rc1-phase-readiness.cjs');
const {verifyHandoff}=require('./rc1-execution-handoff.cjs');
const {evaluateVerdict}=require('./rc1-stable-readiness.cjs');
const {verifyFinalBundle}=require('./rc1-final-bundle.cjs');

const root=path.resolve(__dirname,'..');
const PLAN_SCHEMA='workspace-agent-rc1-execution-recovery-plan-v1';

function arg(name){const p=`--${name}=`;const v=process.argv.find(x=>x.startsWith(p));return v?v.slice(p.length):'';}
function shaText(text){return crypto.createHash('sha256').update(text,'utf8').digest('hex');}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object'){const o={};for(const k of Object.keys(v).sort())o[k]=canonical(v[k]);return o;}return v;}
function stable(v){return JSON.stringify(canonical(v));}
function shaFile(file){const h=crypto.createHash('sha256');const fd=fs.openSync(file,'r');try{const b=Buffer.allocUnsafe(1024*1024);let n;while((n=fs.readSync(fd,b,0,b.length,null))>0)h.update(b.subarray(0,n));}finally{fs.closeSync(fd);}return h.digest('hex');}
function hashState(state){const copy={...state};delete copy.stateSha256;return shaText(stable(copy));}
function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return null;}}
function inside(base,target){const b=path.resolve(base)+path.sep;const t=path.resolve(target);return t===path.resolve(base)||t.startsWith(b);}
function latestFile(dir,name){if(!fs.existsSync(dir))return null;let best=null;const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(e.isFile()&&e.name===name){const s=fs.statSync(p);if(!best||s.mtimeMs>best.mtimeMs)best={file:p,mtimeMs:s.mtimeMs};}}};walk(dir);return best?.file||null;}
function verifyStateChain(execDir){
  const history=path.join(execDir,'execution-history.jsonl'),latest=path.join(execDir,'execution-state.json');
  if(!fs.existsSync(history)||!fs.existsSync(latest))return{ok:false,errors:['EXECUTION_STATE_OR_HISTORY_MISSING'],states:[]};
  const lines=fs.readFileSync(history,'utf8').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const states=[],errors=[];let previous=null;
  for(let i=0;i<lines.length;i++){
    let s;try{s=JSON.parse(lines[i]);}catch{errors.push(`HISTORY_JSON_INVALID:${i+1}`);continue;}
    const expected=hashState(s);if(String(s.stateSha256||'').toLowerCase()!==expected)errors.push(`STATE_HASH_INVALID:${i+1}`);
    const declared=s.previousStateSha256==null?null:String(s.previousStateSha256).toLowerCase();
    if((previous==null?declared!==null:declared!==previous))errors.push(`STATE_CHAIN_INVALID:${i+1}`);
    previous=String(s.stateSha256||'').toLowerCase();states.push(s);
  }
  const l=readJson(latest);if(!l)errors.push('LATEST_STATE_INVALID_JSON');else{if(String(l.stateSha256||'').toLowerCase()!==hashState(l))errors.push('LATEST_STATE_HASH_INVALID');if(previous!==String(l.stateSha256||'').toLowerCase())errors.push('LATEST_STATE_NOT_HISTORY_TAIL');}
  return{ok:errors.length===0,errors,states,latest:l};
}
function findRecordedPath(states,key){for(let i=states.length-1;i>=0;i--){const v=states[i]?.paths?.[key];if(v)return String(v);}return'';}
function validateCertificationResult({phaseDir,role,projectRoot=root,expectedIdentity}){
  const resultPath=latestFile(phaseDir,'rc1-certification-result.json');if(!resultPath)return{ok:false,errors:['CERTIFICATION_RESULT_MISSING']};
  return evaluatePhase({resultPath,role,projectRoot,expectedReleaseIdentity:expectedIdentity});
}
function validateHandoffDir(dir,role,executionId,expectedIdentity){
  const mpath=path.join(dir,'handoff-manifest.json');if(!fs.existsSync(mpath))return{ok:false,reason:'HANDOFF_MANIFEST_MISSING'};
  const verified=verifyHandoff({dir,manifestPath:mpath,requireCurrentSource:true});const errors=[...(verified.errors||[])];
  if(String(verified.role||'')!==role)errors.push('HANDOFF_ROLE_MISMATCH');if(String(verified.executionId||'')!==String(executionId))errors.push('HANDOFF_EXECUTION_ID_MISMATCH');
  const m=readJson(mpath);if(expectedIdentity&&String(m?.releaseIdentitySha256||'').toLowerCase()!==String(expectedIdentity).toLowerCase())errors.push('HANDOFF_RELEASE_IDENTITY_MISMATCH');
  return{ok:errors.length===0,errors,manifestPath:mpath,handoffId:verified.handoffId||m?.handoffId||null};
}
function validateFinal(execDir,executionId,states,projectRoot,identity,sourceFingerprint){
  const finalDir=path.join(execDir,'final-certification');const decisionPath=path.join(finalDir,'stable-promotion-decision.json');const verdictPath=path.join(finalDir,'rc1-final-verdict.json');if(!fs.existsSync(decisionPath)||!fs.existsSync(verdictPath))return{ok:false,reason:'FINAL_DECISION_OR_VERDICT_MISSING'};const decision=readJson(decisionPath),verdict=readJson(verdictPath);if(!decision||!verdict)return{ok:false,reason:'FINAL_JSON_INVALID'};const pkg=readJson(path.join(projectRoot,'package.json'));const errors=[];
  if(String(decision.decision||'')!=='PROMOTE_ALLOWED'||decision.ok!==true)errors.push('FINAL_DECISION_NOT_ALLOW');if(String(decision.schemaVersion||'')!=='workspace-agent-stable-promotion-decision-v3')errors.push('FINAL_DECISION_SCHEMA_MISMATCH');if(String(decision.version||'')!==String(pkg.version||''))errors.push('FINAL_DECISION_VERSION_MISMATCH');if(String(decision.toolingRevision||'')!==String(pkg.workspaceAgentRelease?.toolingRevision||''))errors.push('FINAL_DECISION_TOOLING_MISMATCH');if(String(decision.executionId||'')!==String(executionId))errors.push('FINAL_DECISION_EXECUTION_ID_MISMATCH');if(String(verdict.executionId||'')!==String(executionId))errors.push('FINAL_VERDICT_EXECUTION_ID_MISMATCH');if(String(decision.sourceFingerprint||'')!==String(sourceFingerprint||''))errors.push('FINAL_DECISION_SOURCE_MISMATCH');if(identity&&String(decision.releaseIdentitySha256||'').toLowerCase()!==String(identity).toLowerCase())errors.push('FINAL_DECISION_RELEASE_IDENTITY_MISMATCH');
  if(decision.verdict?.sha256&&String(decision.verdict.sha256).toLowerCase()!==shaFile(verdictPath))errors.push('FINAL_VERDICT_HASH_MISMATCH');const envelopePath=decision.envelope?.path?path.resolve(String(decision.envelope.path)):'';if(!envelopePath||!fs.existsSync(envelopePath))errors.push('FINAL_ENVELOPE_MISSING');else if(decision.envelope?.sha256&&String(decision.envelope.sha256).toLowerCase()!==shaFile(envelopePath))errors.push('FINAL_ENVELOPE_HASH_MISMATCH');
  if(envelopePath&&fs.existsSync(envelopePath)){const envelope=readJson(envelopePath);if(String(envelope?.execution?.executionId||'')!==String(executionId))errors.push('FINAL_ENVELOPE_EXECUTION_ID_MISMATCH');const ev=evaluateVerdict(verdict,{expectedVersion:pkg.version,expectedTooling:pkg.workspaceAgentRelease?.toolingRevision||'',envelope,currentFingerprint:sourceFingerprint,currentReleaseIdentity:identity||''});if(!ev.ok)errors.push(...ev.reasons.map(x=>`FINAL_VERDICT_RECHECK:${x}`));}
  const bundleDir=findRecordedPath(states,'finalBundle'),bundleManifest=findRecordedPath(states,'finalBundleManifest');if(!bundleDir||!bundleManifest||!fs.existsSync(bundleDir)||!fs.existsSync(bundleManifest))errors.push('FINAL_BUNDLE_STATE_BINDING_MISSING');else{try{const br=verifyFinalBundle(bundleDir,{requireSigning:verdict.signingRequired===true});if(!br.ok)errors.push(...br.errors.map(x=>`FINAL_BUNDLE_RECHECK:${x}`))}catch(e){errors.push(`FINAL_BUNDLE_RECHECK_FAILED:${e.code||e.message}`)}}
  const delivery=findRecordedPath(states,'finalDelivery'),expectedDeliverySha=findRecordedPath(states,'finalDeliverySha256');if(!delivery||!expectedDeliverySha||!fs.existsSync(delivery))errors.push('FINAL_DELIVERY_STATE_BINDING_MISSING');else if(shaFile(delivery)!==String(expectedDeliverySha).toLowerCase())errors.push('FINAL_DELIVERY_HASH_MISMATCH');
  if(errors.length)return{ok:false,reason:'FINAL_REVALIDATION_FAILED',errors};return{ok:true,decisionPath,verdictPath,envelopePath,delivery,deliverySha256:shaFile(delivery)};
}
function inspectExecution({executionDir,projectRoot=root,expectedReleaseIdentity,requireCurrentIdentity=true}={}){
  if(!executionDir)throw new Error('EXECUTION_DIR_REQUIRED');const execDir=path.resolve(executionDir);if(!fs.existsSync(execDir)||!fs.statSync(execDir).isDirectory())throw new Error('EXECUTION_DIR_NOT_FOUND');
  const pkg=JSON.parse(fs.readFileSync(path.join(projectRoot,'package.json'),'utf8'));const fp=computeFingerprint(projectRoot);let identity=expectedReleaseIdentity===undefined?null:expectedReleaseIdentity;
  if(expectedReleaseIdentity===undefined){try{identity=computeReleaseIdentity(projectRoot).releaseIdentitySha256;}catch{identity=null;}}
  const chain=verifyStateChain(execDir);const executionId=chain.latest?.executionId||path.basename(execDir);const base={schemaVersion:PLAN_SCHEMA,version:pkg.version,toolingRevision:pkg.workspaceAgentRelease?.toolingRevision||null,executionId,createdAt:new Date().toISOString(),sourceFingerprint:fp.sha256,releaseIdentitySha256:identity||null,stateChain:{ok:chain.ok,errors:chain.errors,latestStage:chain.latest?.stage||null,latestStateSha256:chain.latest?.stateSha256||null},action:'BLOCK',reason:'UNKNOWN',resumeRole:null,invalidatePaths:[],context:{}};
  if(!chain.ok){base.action='BLOCK_STATE_CHAIN_INVALID';base.reason='Execution state/history integrity failed; do not trust recorded paths or reuse evidence.';return sealPlan(base);}
  if(requireCurrentIdentity&&!identity){base.action='RERUN_PRIMARY_CERTIFICATION';base.reason='Current release identity is unavailable; PASS evidence cannot be reused safely.';base.resumeRole='primary';const p=path.join(execDir,'primary-certification');if(fs.existsSync(p))base.invalidatePaths.push(p);return sealPlan(base);}
  const final=validateFinal(execDir,executionId,chain.states,projectRoot,identity,fp.sha256);if(final.ok){base.action='PROMOTION_COMPLETE';base.reason='Final promotion evidence and delivery are already complete.';base.context={...base.context,...final};return sealPlan(base);}
  const recordedFinalizePrimary=findRecordedPath(chain.states,'primaryHandoff'),recordedFinalizePeer=findRecordedPath(chain.states,'peerReturn'),recordedManual=findRecordedPath(chain.states,'manualEvidence');
  if(recordedFinalizePrimary&&recordedFinalizePeer&&recordedManual&&String(chain.latest?.stage||'').match(/^(FINALIZE|PROMOTION)/)){base.action='RESUME_FINALIZE';base.reason='A finalization attempt was interrupted; rerun only deterministic final verification/promotion from the recorded inputs.';base.resumeRole='finalize';base.context={primaryHandoff:recordedFinalizePrimary,peerReturn:recordedFinalizePeer,manualEvidence:recordedManual};return sealPlan(base);}
  const primaryHandoffDir=path.join(execDir,'primary-handoff');const primaryHandoff=validateHandoffDir(primaryHandoffDir,'primary',executionId,identity);const recordedPrimaryZip=findRecordedPath(chain.states,'primaryHandoff');
  const peerReturnDir=path.join(execDir,'peer-return');const peerReturn=validateHandoffDir(peerReturnDir,'peer',executionId,identity);const recordedPeerZip=findRecordedPath(chain.states,'peerReturn');
  const finalPrimaryImport=path.join(execDir,'final-primary-import'),finalPeerImport=path.join(execDir,'final-peer-import');
  if(fs.existsSync(finalPrimaryImport)&&fs.existsSync(finalPeerImport)){base.action='RESUME_FINALIZE';base.reason='Finalization imports exist but promotion is incomplete; rerun only deterministic final verification/promotion.';base.resumeRole='finalize';base.context={primaryHandoff:findRecordedPath(chain.states,'primaryHandoff')||'',peerReturn:findRecordedPath(chain.states,'peerReturn')||'',manualEvidence:findRecordedPath(chain.states,'manualEvidence')||''};return sealPlan(base);}
  if(peerReturn.ok){base.action='PEER_COMPLETE_RETURN_TO_PRIMARY';base.reason='Peer return package is complete; no peer certification rerun is needed.';base.resumeRole='peer';base.context={peerReturn:recordedPeerZip||'',peerReturnDir};return sealPlan(base);}
  const peerCert=validateCertificationResult({phaseDir:path.join(execDir,'peer-certification'),role:'peer',projectRoot,expectedIdentity:identity});
  if(peerCert.ok){base.action='RESUME_PEER_RETURN';base.reason='Peer certification PASS is complete; reuse it and rebuild only peer return packaging.';base.resumeRole='peer';base.context={primaryHandoff:recordedPrimaryZip||findRecordedPath(chain.states,'primaryHandoff')||'',peerResult:peerCert.resultPath,peerReport:peerCert.reportPath};return sealPlan(base);}
  if(primaryHandoff.ok){base.action='PRIMARY_COMPLETE_AWAIT_PEER';base.reason='Primary handoff is complete; no Primary rerun is needed. Move the handoff to the other Windows family.';base.resumeRole='primary';base.context={primaryHandoff:recordedPrimaryZip||'',primaryHandoffDir};return sealPlan(base);}
  if(findRecordedPath(chain.states,'primaryHandoff')){
    const p=path.join(execDir,'peer-certification');if(fs.existsSync(p))base.invalidatePaths.push(p);base.action='RERUN_PEER_CERTIFICATION';base.reason='Primary handoff was imported but peer PASS evidence is absent/invalid; archive partial peer evidence and rerun peer certification only.';base.resumeRole='peer';base.context={primaryHandoff:recordedPrimaryZip||''};return sealPlan(base);
  }
  const primaryCert=validateCertificationResult({phaseDir:path.join(execDir,'primary-certification'),role:'primary',projectRoot,expectedIdentity:identity});
  if(primaryCert.ok){base.action='RESUME_PRIMARY_HANDOFF';base.reason='Primary certification PASS is complete; reuse it and rebuild only handoff packaging.';base.resumeRole='primary';base.context={primaryResult:primaryCert.resultPath,primaryReport:primaryCert.reportPath};return sealPlan(base);}
  const p=path.join(execDir,'primary-certification');if(fs.existsSync(p))base.invalidatePaths.push(p);base.action='RERUN_PRIMARY_CERTIFICATION';base.reason='No reusable Primary PASS boundary exists; archive partial Primary evidence and rerun certification.';base.resumeRole='primary';return sealPlan(base);
}
function sealPlan(plan){const copy={...plan};delete copy.planSha256;plan.planSha256=shaText(stable(copy));return plan;}
function main(){try{const hashFile=arg('hash-state-file');if(hashFile){const state=readJson(path.resolve(hashFile));if(!state)throw new Error('HASH_STATE_FILE_INVALID');console.log(hashState(state));return;}const dir=arg('dir');if(!dir)throw new Error('Use --dir=<execution-directory>');const plan=inspectExecution({executionDir:path.resolve(dir)});const out=arg('out');if(out){const p=path.resolve(out);fs.mkdirSync(path.dirname(p),{recursive:true});const tmp=p+'.tmp-'+process.pid+'-'+Date.now();fs.writeFileSync(tmp,JSON.stringify(plan,null,2));fs.renameSync(tmp,p);}console.log(JSON.stringify(plan,null,2));if(String(plan.action).startsWith('BLOCK_'))process.exitCode=1;}catch(e){console.error(JSON.stringify({ok:false,code:'RECOVERY_INSPECTION_FAILED',message:String(e.message||e)},null,2));process.exitCode=1;}}
if(require.main===module)main();
module.exports={PLAN_SCHEMA,hashState,verifyStateChain,validateCertificationResult,inspectExecution,sealPlan};
