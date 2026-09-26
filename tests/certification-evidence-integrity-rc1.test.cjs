const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {createBundle,verifyBundle}=require('../scripts/certification-evidence-bundle.cjs');
const {verifyReportEvidence}=require('../scripts/rc1-certification-envelope.cjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wa-evidence-bundle-'));
try{
  fs.writeFileSync(path.join(tmp,'gate-check.log'),'gate-pass\n');
  fs.writeFileSync(path.join(tmp,'windows-native-edge-rc1-uat.json'),JSON.stringify({overall:'PASS'}));
  const made=createBundle(tmp,path.join(tmp,'evidence-bundle.json'));
  let r=verifyBundle(made.path,{sessionDir:tmp,expectedSha256:made.sha256,expectedFiles:made.bundle.files,expectedAggregate:made.bundle.aggregateSha256});assert(r.ok,r.errors.join(','));
  const report=path.join(tmp,'certification-report.json');
  const reportJson={evidenceBundle:{file:'evidence-bundle.json',sha256:made.sha256,files:made.bundle.files,aggregateSha256:made.bundle.aggregateSha256}};fs.writeFileSync(report,JSON.stringify(reportJson));
  let bound=verifyReportEvidence(report,reportJson);assert(bound.ok,bound.errors.join(','));
  fs.appendFileSync(path.join(tmp,'gate-check.log'),'tampered\n');
  r=verifyBundle(made.path,{sessionDir:tmp,expectedSha256:made.sha256,expectedFiles:made.bundle.files,expectedAggregate:made.bundle.aggregateSha256});assert(!r.ok&&r.errors.some(x=>x.startsWith('EVIDENCE_ENTRY_')),'tampered evidence file must invalidate bundle');
  bound=verifyReportEvidence(report,reportJson);assert(!bound.ok,'report evidence binding must detect tampered gate evidence');
  console.log('certification-evidence-integrity-rc1.test.cjs PASS',{bundleFiles:made.bundle.files,tamperDetected:true});
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
