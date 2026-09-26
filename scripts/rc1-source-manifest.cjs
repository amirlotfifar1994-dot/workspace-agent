const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const cp=require('child_process');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
let fp={};try{fp=JSON.parse(cp.execFileSync(process.execPath,['scripts/source-tree-fingerprint.cjs'],{cwd:root,encoding:'utf8'}));}catch(error){fp={error:error.message};}
const lock=path.join(root,'package-lock.json');
let releaseIdentity=null;if(fs.existsSync(lock)){try{releaseIdentity=require('./release-identity.cjs').computeReleaseIdentity(root)}catch{}}
const report={schemaVersion:'workspace-agent-rc-source-manifest-v2',version:pkg.version,channel:pkg.workspaceAgentRelease?.channel||null,releaseCandidate:pkg.workspaceAgentRelease?.releaseCandidate||null,toolingRevision:pkg.workspaceAgentRelease?.toolingRevision||null,featureFreeze:Boolean(pkg.workspaceAgentRelease?.featureFreeze),baselineVersion:pkg.workspaceAgentRelease?.baselineVersion||null,dataEpoch:Number(pkg.workspaceAgentRelease?.dataEpoch||0),createdAt:new Date().toISOString(),sourceFingerprint:fp.sha256||null,sourceFingerprintSchema:fp.schemaVersion||null,sourceFingerprintScope:fp.scope||null,sourceFiles:fp.files||null,packageLock:fs.existsSync(lock)?{status:'PRESENT',sha256:sha(lock)}:{status:'PENDING_REGISTRY_ENVIRONMENT'},releaseIdentity:releaseIdentity?{status:'PRESENT',sha256:releaseIdentity.releaseIdentitySha256}:{status:'PENDING_OFFICIAL_LOCKFILE'},windowsCertification:'PENDING_WINDOWS',binaryArtifacts:'PENDING_WINDOWS_BUILD',authenticode:'PENDING_CERTIFICATE',certificationKit:'READY_SOURCE_TESTED'};
const outArg=process.argv.find(x=>x.startsWith('--out='));if(outArg){const out=path.resolve(root,outArg.slice(6));fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
