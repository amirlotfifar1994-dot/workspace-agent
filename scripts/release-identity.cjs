const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {computeFingerprint}=require('./source-tree-fingerprint.cjs');
const {validatePolicy}=require('./dependency-source-policy.cjs');
const {validate:validateStablePolicy}=require('./stable-certification-policy.cjs');
const root=path.resolve(__dirname,'..');
function shaFile(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object'){const o={};for(const k of Object.keys(v).sort())o[k]=canonical(v[k]);return o}return v}
function stable(v){return JSON.stringify(canonical(v))}
function computeReleaseIdentity(base=root,{lockPath=''}={}){
  base=path.resolve(base);const pkg=JSON.parse(fs.readFileSync(path.join(base,'package.json'),'utf8'));const lock=path.resolve(lockPath||path.join(base,'package-lock.json'));
  if(!fs.existsSync(lock)){const e=new Error('PACKAGE_LOCK_REQUIRED');e.code='PACKAGE_LOCK_REQUIRED';throw e}
  const lockLstat=fs.lstatSync(lock);if(lockLstat.isSymbolicLink()||!lockLstat.isFile()){const e=new Error('PACKAGE_LOCK_REGULAR_FILE_REQUIRED');e.code='PACKAGE_LOCK_REGULAR_FILE_REQUIRED';throw e}
  const policy=validatePolicy(pkg);if(!policy.ok){const e=new Error('DEPENDENCY_SOURCE_POLICY_INVALID');e.code='DEPENDENCY_SOURCE_POLICY_INVALID';e.errors=policy.errors;throw e}
  const stablePolicy=validateStablePolicy(pkg);if(!stablePolicy.ok){const e=new Error('STABLE_CERTIFICATION_POLICY_INVALID');e.code='STABLE_CERTIFICATION_POLICY_INVALID';e.errors=stablePolicy.errors;throw e}
  const fp=computeFingerprint(base);const payload={schemaVersion:'workspace-agent-release-identity-v3',version:pkg.version,toolingRevision:pkg.workspaceAgentRelease?.toolingRevision||null,featureFreeze:pkg.workspaceAgentRelease?.featureFreeze===true,sourceFingerprint:{schemaVersion:fp.schemaVersion,scope:fp.scope,sha256:fp.sha256,files:fp.files},packageLock:{sha256:shaFile(lock),bytes:fs.statSync(lock).size},runtimePins:{node:pkg.engines?.node||null,npm:pkg.engines?.npm||null,packageManager:pkg.packageManager||null},dependencySourcePolicy:{...policy.policy,sha256:policy.sha256},stableCertificationPolicy:{...stablePolicy.policy,sha256:stablePolicy.sha256},architecture:'x64'};
  payload.releaseIdentitySha256=crypto.createHash('sha256').update(stable(payload)).digest('hex');return payload
}
function main(){try{const lockArg=process.argv.find(x=>x.startsWith('--lockfile='));const report=computeReleaseIdentity(root,{lockPath:lockArg?lockArg.slice(11):''});const outArg=process.argv.find(x=>x.startsWith('--out='));if(outArg){const out=path.resolve(root,outArg.slice(6));fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2))}console.log(JSON.stringify(report,null,2))}catch(e){console.error(JSON.stringify({ok:false,code:e.code||'RELEASE_IDENTITY_FAILED',message:String(e.message||e),errors:e.errors||undefined},null,2));process.exit(1)}}
if(require.main===module)main();
module.exports={computeReleaseIdentity,stable};
