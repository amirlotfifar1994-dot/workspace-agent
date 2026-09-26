const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {hashState,inspectExecution}=require('../scripts/rc1-execution-recovery.cjs');
const {createBundle}=require('../scripts/certification-evidence-bundle.cjs');
const {computeFingerprint}=require('../scripts/source-tree-fingerprint.cjs');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
assert.equal(hashState({b:1,a:2}),hashState({a:2,b:1}),'state hash must be canonical across serializer key order');
function mk(){return fs.mkdtempSync(path.join(os.tmpdir(),'wa-recovery-'));}
function writeState(exec,stage,paths={}){
  const base={schemaVersion:'workspace-agent-rc1-execution-state-v2',executionId:'EXEC-1',version:pkg.version,toolingRevision:pkg.workspaceAgentRelease.toolingRevision,updatedAt:new Date().toISOString(),windowsFamily:'Windows11',stage,overall:'INCOMPLETE',previousStateSha256:null,nextStep:'test',paths,detail:null};
  base.stateSha256=hashState(base);
  fs.writeFileSync(path.join(exec,'execution-state.json'),JSON.stringify(base,null,2));
  fs.writeFileSync(path.join(exec,'execution-history.jsonl'),JSON.stringify(base)+'\n');
  return base;
}
function passCert(exec,role,identity='RID'){
  // Mirror the real orchestrator layout: raw Windows evidence has its own
  // session directory, while RC1 envelope/result live one level above it.
  const orchestration=path.join(exec,`${role}-certification`,'session');
  const phase=path.join(orchestration,'windows-runs','run-1');
  fs.mkdirSync(phase,{recursive:true});fs.writeFileSync(path.join(phase,'gate.log'),'PASS\n');
  const bundle=createBundle(phase,path.join(phase,'evidence-bundle.json'));const fp=computeFingerprint(root);
  const report=path.join(phase,'certification-report.json');fs.writeFileSync(report,JSON.stringify({schemaVersion:'workspace-agent-windows-certification-v5',workspaceAgentVersion:pkg.version,toolingRevision:pkg.workspaceAgentRelease.toolingRevision,featureFreeze:true,overall:'PASS',evidenceId:`E-${role}`,sourceFingerprint:{sha256:fp.sha256},releaseIdentitySha256:identity,evidenceBundle:{file:'evidence-bundle.json',sha256:bundle.sha256,files:bundle.bundle.files,aggregateSha256:bundle.bundle.aggregateSha256}}));
  const incomplete=role==='primary'?['DUAL_WINDOWS_EVIDENCE_REQUIRED','MANUAL_EVIDENCE_REQUIRED']:['MANUAL_EVIDENCE_REQUIRED'];
  const envelope=path.join(orchestration,'rc1-certification-envelope.json');fs.writeFileSync(envelope,JSON.stringify({version:pkg.version,toolingRevision:pkg.workspaceAgentRelease.toolingRevision,overall:'INCOMPLETE',releaseIdentity:{sha256:identity},checks:{hardFailures:[],incomplete}}));
  const result=path.join(orchestration,'rc1-certification-result.json');fs.writeFileSync(result,JSON.stringify({version:pkg.version,toolingRevision:pkg.workspaceAgentRelease.toolingRevision,overall:'INCOMPLETE',releaseIdentitySha256:identity,certificationReport:report,certificationEvidenceBundle:path.join(phase,'evidence-bundle.json'),certificationEvidenceId:`E-${role}`,envelope}));
  return {report,result,envelope};
}
{
  const exec=mk();writeState(exec,'PRIMARY_RUNNING');fs.mkdirSync(path.join(exec,'primary-certification'),{recursive:true});fs.writeFileSync(path.join(exec,'primary-certification','partial.txt'),'partial');
  const plan=inspectExecution({executionDir:exec,projectRoot:root,expectedReleaseIdentity:'RID',requireCurrentIdentity:false});
  assert.equal(plan.action,'RERUN_PRIMARY_CERTIFICATION');assert.equal(plan.invalidatePaths.length,1);assert(plan.invalidatePaths[0].endsWith('primary-certification'));
  fs.rmSync(exec,{recursive:true,force:true});
}
{
  const exec=mk();writeState(exec,'PRIMARY_RUNNING');passCert(exec,'primary');
  const plan=inspectExecution({executionDir:exec,projectRoot:root,expectedReleaseIdentity:'RID',requireCurrentIdentity:false});
  assert.equal(plan.action,'RESUME_PRIMARY_HANDOFF');assert(plan.context.primaryResult.endsWith('rc1-certification-result.json'));
  fs.rmSync(exec,{recursive:true,force:true});
}
{
  const exec=mk();writeState(exec,'PEER_RUNNING',{primaryHandoff:'C:\\handoff\\primary.zip'});passCert(exec,'peer');
  const plan=inspectExecution({executionDir:exec,projectRoot:root,expectedReleaseIdentity:'RID',requireCurrentIdentity:false});
  assert.equal(plan.action,'RESUME_PEER_RETURN');assert.equal(plan.context.primaryHandoff,'C:\\handoff\\primary.zip');
  fs.rmSync(exec,{recursive:true,force:true});
}
{
  const exec=mk();writeState(exec,'FINALIZE_RUNNING',{primaryHandoff:'C:\\p.zip',peerReturn:'C:\\q.zip',manualEvidence:'C:\\e.json'});
  const plan=inspectExecution({executionDir:exec,projectRoot:root,expectedReleaseIdentity:'RID',requireCurrentIdentity:false});
  assert.equal(plan.action,'RESUME_FINALIZE');assert.equal(plan.context.manualEvidence,'C:\\e.json');
  fs.rmSync(exec,{recursive:true,force:true});
}
{
  const exec=mk();const s=writeState(exec,'PRIMARY_RUNNING');s.stage='TAMPERED';fs.writeFileSync(path.join(exec,'execution-state.json'),JSON.stringify(s,null,2));
  const plan=inspectExecution({executionDir:exec,projectRoot:root,expectedReleaseIdentity:'RID',requireCurrentIdentity:false});
  assert.equal(plan.action,'BLOCK_STATE_CHAIN_INVALID');assert.equal(plan.stateChain.ok,false);
  fs.rmSync(exec,{recursive:true,force:true});
}
console.log('rc1-execution-recovery-resume PASS');
