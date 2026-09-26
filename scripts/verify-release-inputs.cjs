const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {validatePolicy,validateLockSources}=require('./dependency-source-policy.cjs');
const root=path.resolve(__dirname,'..');
const pkgPath=path.join(root,'package.json');
const lockArg=process.argv.find(x=>x.startsWith('--lockfile='));
const lockPath=path.resolve(lockArg?lockArg.slice(11):path.join(root,'package-lock.json'));
const pinsOnly=process.argv.includes('--pins-only');
function fail(code,message,extra={}){console.error(JSON.stringify({ok:false,code,message,...extra},null,2));process.exit(1)}
function exactVersion(v){return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(v||''))}
function sha256(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
const policyCheck=validatePolicy(pkg);if(!policyCheck.ok)fail('DEPENDENCY_SOURCE_POLICY_INVALID','Dependency source policy is invalid.',{errors:policyCheck.errors});
const groups={dependencies:pkg.dependencies||{},devDependencies:pkg.devDependencies||{},optionalDependencies:pkg.optionalDependencies||{}};
const floating=[];for(const [group,items] of Object.entries(groups))for(const [name,version] of Object.entries(items))if(!exactVersion(version))floating.push({group,name,version});
if(floating.length)fail('FLOATING_DEPENDENCY_VERSION','Release dependency باید exact semver باشد.',{floating});
if(!/^npm@\d+\.\d+\.\d+$/.test(String(pkg.packageManager||'')))fail('PACKAGE_MANAGER_NOT_PINNED','packageManager باید npm@x.y.z دقیق باشد.');
const unpack=new Set(pkg.build?.asarUnpack||[]);for(const required of ['electron/services/hash-worker.cjs','electron/services/windows-path-utils.cjs'])if(!unpack.has(required))fail('PACKAGED_WORKER_DEP_MISSING','Worker و dependency محلی آن باید asarUnpack شوند.',{required});
if(pinsOnly){console.log(JSON.stringify({ok:true,status:'PASS_PINS_ONLY',version:pkg.version,packageManager:pkg.packageManager,pinned:Object.values(groups).reduce((n,g)=>n+Object.keys(g).length,0),dependencySourcePolicy:policyCheck.policy,dependencySourcePolicySha256:policyCheck.sha256},null,2));process.exit(0)}
if(!fs.existsSync(lockPath))fail('LOCKFILE_REQUIRED','package-lock.json برای Release رسمی اجباری است. ابتدا npm run release:lock را روی محیط آنلاین اجرا و lockfile را commit کنید.',{lockPath});
const lockLstat=fs.lstatSync(lockPath);if(lockLstat.isSymbolicLink()||!lockLstat.isFile())fail('LOCKFILE_REGULAR_FILE_REQUIRED','package-lock.json باید regular file واقعی و غیر-reparse باشد.');
const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));if(![2,3].includes(Number(lock.lockfileVersion)))fail('LOCKFILE_VERSION_UNSUPPORTED','lockfileVersion باید 2 یا 3 باشد.',{lockfileVersion:lock.lockfileVersion});
const rootPkg=lock.packages?.[''];if(!rootPkg)fail('LOCKFILE_ROOT_MISSING','Root package در package-lock.json وجود ندارد.');
if(String(rootPkg.version||'')!==String(pkg.version||''))fail('LOCKFILE_PROJECT_VERSION_MISMATCH','Version پروژه بین package.json و package-lock.json یکسان نیست.',{packageVersion:pkg.version,lockVersion:rootPkg.version});
for(const group of ['dependencies','devDependencies','optionalDependencies']){const a=groups[group]||{},b=rootPkg[group]||{};const names=new Set([...Object.keys(a),...Object.keys(b)]);const mismatches=[];for(const name of names)if(String(a[name]||'')!==String(b[name]||''))mismatches.push({name,package:a[name]||null,lock:b[name]||null});if(mismatches.length)fail('LOCKFILE_ROOT_DEPENDENCY_MISMATCH',`Root ${group} با package.json تطابق ندارد.`,{group,mismatches})}
const sourceCheck=validateLockSources(lock,pkg);if(!sourceCheck.ok)fail('LOCKFILE_DEPENDENCY_SOURCE_POLICY_FAILED','package-lock dependency source provenance violates the release allowlist.',{errors:sourceCheck.errors.slice(0,80),count:sourceCheck.errors.length,policy:sourceCheck.policy});
console.log(JSON.stringify({ok:true,status:'PASS',version:pkg.version,lockfileVersion:lock.lockfileVersion,lockSha256:sha256(lockPath),packageManager:pkg.packageManager,dependencySourcePolicy:sourceCheck.policy,dependencySourcePolicySha256:sourceCheck.policySha256,resolvedOrigins:sourceCheck.resolvedOrigins,resolvedProtocols:sourceCheck.resolvedProtocols,resolvedCount:sourceCheck.resolvedCount},null,2));
