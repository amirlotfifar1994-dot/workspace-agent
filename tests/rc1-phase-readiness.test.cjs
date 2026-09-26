const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {createBundle}=require('../scripts/certification-evidence-bundle.cjs');
const {computeFingerprint}=require('../scripts/source-tree-fingerprint.cjs');
const {evaluatePhase}=require('../scripts/rc1-phase-readiness.cjs');
const root=path.resolve(__dirname,'..');const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));const fp=computeFingerprint(root);
function fixture(role,incomplete){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wa-phase-'));
  const cert=path.join(dir,'windows-runs','run-1');fs.mkdirSync(cert,{recursive:true});
  fs.writeFileSync(path.join(cert,'gate.log'),'PASS\n');
  const b=createBundle(cert,path.join(cert,'evidence-bundle.json'));
  const report=path.join(cert,'certification-report.json');fs.writeFileSync(report,JSON.stringify({schemaVersion:'workspace-agent-windows-certification-v5',workspaceAgentVersion:pkg.version,toolingRevision:pkg.workspaceAgentRelease.toolingRevision,featureFreeze:true,overall:'PASS',evidenceId:'E1',sourceFingerprint:{sha256:fp.sha256},releaseIdentitySha256:'RID',evidenceBundle:{file:'evidence-bundle.json',sha256:b.sha256,files:b.bundle.files,aggregateSha256:b.bundle.aggregateSha256}}));
  const env=path.join(dir,'rc1-certification-envelope.json');fs.writeFileSync(env,JSON.stringify({version:pkg.version,toolingRevision:pkg.workspaceAgentRelease.toolingRevision,overall:incomplete.length?'INCOMPLETE':'PASS',releaseIdentity:{sha256:'RID'},checks:{hardFailures:[],incomplete}}));
  const result=path.join(dir,'rc1-certification-result.json');fs.writeFileSync(result,JSON.stringify({version:pkg.version,toolingRevision:pkg.workspaceAgentRelease.toolingRevision,overall:incomplete.length?'INCOMPLETE':'PASS',releaseIdentitySha256:'RID',certificationReport:report,certificationEvidenceBundle:path.join(cert,'evidence-bundle.json'),certificationEvidenceId:'E1',envelope:env}));
  return{dir,result,bundle:b};
}
{
 const f=fixture('primary',['DUAL_WINDOWS_EVIDENCE_REQUIRED','MANUAL_EVIDENCE_REQUIRED']);const r=evaluatePhase({resultPath:f.result,role:'primary',projectRoot:root,expectedReleaseIdentity:'RID'});assert.equal(r.ok,true);assert.equal(r.status,'READY_FOR_HANDOFF');fs.rmSync(f.dir,{recursive:true,force:true});
}
{
 const f=fixture('peer',['MANUAL_EVIDENCE_REQUIRED']);const r=evaluatePhase({resultPath:f.result,role:'peer',projectRoot:root,expectedReleaseIdentity:'RID'});assert.equal(r.ok,true);fs.rmSync(f.dir,{recursive:true,force:true});
}
{
 const f=fixture('primary',['PACKAGE_LOCK_MISSING']);const r=evaluatePhase({resultPath:f.result,role:'primary',projectRoot:root,expectedReleaseIdentity:'RID'});assert.equal(r.ok,false);assert(r.errors.includes('UNEXPECTED_INCOMPLETE:PACKAGE_LOCK_MISSING'));fs.rmSync(f.dir,{recursive:true,force:true});
}
{
 const f=fixture('peer',['MANUAL_EVIDENCE_REQUIRED']);fs.appendFileSync(path.join(f.dir,'windows-runs','run-1','gate.log'),'TAMPER\n');const r=evaluatePhase({resultPath:f.result,role:'peer',projectRoot:root,expectedReleaseIdentity:'RID'});assert.equal(r.ok,false);assert(r.errors.some(x=>x.includes('EVIDENCE_ENTRY_BYTES_MISMATCH')||x.includes('EVIDENCE_ENTRY_SHA256_MISMATCH')));fs.rmSync(f.dir,{recursive:true,force:true});
}
console.log('rc1-phase-readiness PASS');
