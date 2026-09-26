const fs=require('fs');const path=require('path');const crypto=require('crypto');
const {validateLockSources}=require('./dependency-source-policy.cjs');
const root=path.resolve(__dirname,'..'),lockPath=path.join(root,'package-lock.json'),pkgPath=path.join(root,'package.json');
if(!fs.existsSync(lockPath)){console.error('LOCKFILE_REQUIRED');process.exit(1)}
const lockLstat=fs.lstatSync(lockPath);if(lockLstat.isSymbolicLink()||!lockLstat.isFile()){console.error('LOCKFILE_REGULAR_FILE_REQUIRED');process.exit(1)}
const lock=JSON.parse(fs.readFileSync(lockPath,'utf8')),pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8')),buf=fs.readFileSync(lockPath);let packages=0,integrity=0,resolved=0;
for(const [name,p] of Object.entries(lock.packages||{})){if(!name)continue;packages++;if(p?.resolved)resolved++;if(p?.integrity)integrity++}
const sourceCheck=validateLockSources(lock,pkg);if(!sourceCheck.ok){console.error(JSON.stringify({code:'LOCKFILE_DEPENDENCY_SOURCE_POLICY_FAILED',errors:sourceCheck.errors.slice(0,80),count:sourceCheck.errors.length},null,2));process.exit(1)}
const report={schemaVersion:'workspace-agent-lockfile-provenance-v2',version:String(lock.version||lock.packages?.['']?.version||''),lockfileVersion:lock.lockfileVersion,sha256:crypto.createHash('sha256').update(buf).digest('hex'),packages,resolved,integrity,dependencySourcePolicy:sourceCheck.policy,dependencySourcePolicySha256:sourceCheck.policySha256,resolvedOrigins:sourceCheck.resolvedOrigins,resolvedProtocols:sourceCheck.resolvedProtocols,generatedAt:new Date().toISOString(),node:process.version,npmUserAgent:process.env.npm_config_user_agent||'',npmConfiguredRegistry:process.env.npm_config_registry||null};
const arg=process.argv.find(x=>x.startsWith('--out='));if(arg){const out=path.resolve(root,arg.slice(6));fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2))}
console.log(JSON.stringify(report,null,2));
