const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {computeReleaseIdentity}=require('../scripts/release-identity.cjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wa-release-id-'));
const dependencySourcePolicy={schemaVersion:'workspace-agent-dependency-source-policy-v1',mode:'allowlist',allowedRegistryOrigins:['https://registry.npmjs.org'],allowedResolvedProtocols:['https:'],forbidLinks:true,forbidGit:true,forbidFile:true,requireIntegrityForRegistryArtifacts:true};
const stableCertificationPolicy={schemaVersion:'workspace-agent-stable-certification-policy-v1',mode:'fail-closed',requireAuthenticode:true,requireArtifacts:true,requireDualWindows:true,requireManualEvidence:true,requireFinalBundle:true,requiredScaleMatrix:[100000,1000000],requireHashBoundAttachmentForManualPass:true,requiredManualEvidenceKeys:['physicalUsbDisconnectReconnect','actualDiskFullRecovery','realAclReadOnlyRecovery','uncleanShutdownPowerLoss','realUpgradeFrom0_9_8']};
try{
  const pkg={version:'1.0.0-rc1',workspaceAgentRelease:{toolingRevision:'cert-kit21',featureFreeze:true,dependencySourcePolicy,stableCertificationPolicy},engines:{node:'24.14.1',npm:'11.11.0'},packageManager:'npm@11.11.0'};
  fs.writeFileSync(path.join(tmp,'package.json'),JSON.stringify(pkg));fs.mkdirSync(path.join(tmp,'src'));fs.writeFileSync(path.join(tmp,'src','a.js'),'x\n');
  fs.writeFileSync(path.join(tmp,'package-lock.json'),JSON.stringify({name:'x',version:'1.0.0-rc1',lockfileVersion:3,packages:{}}));
  const a=computeReleaseIdentity(tmp),b=computeReleaseIdentity(tmp);assert.equal(a.schemaVersion,'workspace-agent-release-identity-v3');assert.equal(a.releaseIdentitySha256,b.releaseIdentitySha256);assert.equal(a.sourceFingerprint.scope,'frozen-source-excluding-release-lockfile');assert(/^[a-f0-9]{64}$/.test(a.dependencySourcePolicy.sha256));assert(/^[a-f0-9]{64}$/.test(a.stableCertificationPolicy.sha256));assert.equal(a.stableCertificationPolicy.requireAuthenticode,true);
  fs.writeFileSync(path.join(tmp,'package-lock.json'),JSON.stringify({name:'x',version:'1.0.0-rc1',lockfileVersion:3,packages:{},changed:true}));
  const c=computeReleaseIdentity(tmp);assert.equal(a.sourceFingerprint.sha256,c.sourceFingerprint.sha256);assert.notEqual(a.packageLock.sha256,c.packageLock.sha256);assert.notEqual(a.releaseIdentitySha256,c.releaseIdentitySha256);
  fs.writeFileSync(path.join(tmp,'src','a.js'),'y\n');const d=computeReleaseIdentity(tmp);assert.notEqual(c.sourceFingerprint.sha256,d.sourceFingerprint.sha256);assert.notEqual(c.releaseIdentitySha256,d.releaseIdentitySha256);
  const weakened=JSON.parse(JSON.stringify(pkg));weakened.workspaceAgentRelease.stableCertificationPolicy.requireAuthenticode=false;fs.writeFileSync(path.join(tmp,'package.json'),JSON.stringify(weakened));let blocked=false;try{computeReleaseIdentity(tmp)}catch(e){blocked=true;assert.equal(e.code,'STABLE_CERTIFICATION_POLICY_INVALID')}assert(blocked);
  console.log('release-identity-chain-rc1.test.cjs PASS',{sourceLockSeparation:true,identityBindsStablePolicy:true,weakenedPolicyBlocked:true});
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
