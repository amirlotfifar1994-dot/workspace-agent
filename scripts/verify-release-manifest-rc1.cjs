const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const cp=require('child_process');
const {computeReleaseIdentity}=require('./release-identity.cjs');
const {validateLockSources,validatePolicy,stable:policyStable}=require('./dependency-source-policy.cjs');
const {validate:validateStablePolicy,stable:stablePolicyStable}=require('./stable-certification-policy.cjs');
const root=path.resolve(__dirname,'..');
function shaFile(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
function fail(code,message,extra={}){const out={ok:false,code,message,...extra};console.error(JSON.stringify(out,null,2));process.exitCode=1;return out;}
function exactArtifactNames(pkg){
  const v=String(pkg.version||'');
  return {
    nsis:`Workspace-Agent-Setup-${v}-x64.exe`,
    portable:`Workspace-Agent-Portable-${v}-x64.exe`
  };
}
function validateArtifactRows({pkg,manifest,manifestDir,requireSigning=false,readFileMeta=true}){
  const errors=[];const expected=exactArtifactNames(pkg);const rows=Array.isArray(manifest?.artifacts)?manifest.artifacts:[];
  const expectedFiles=new Set(Object.values(expected));if(rows.length!==expectedFiles.size)errors.push(`ARTIFACT_TOTAL_COUNT:${rows.length}`);for(const row of rows)if(!expectedFiles.has(String(row?.file||'')))errors.push(`ARTIFACT_UNEXPECTED:${String(row?.file||'')}`);
  const seen=new Set();
  for(const row of rows){const f=String(row?.file||'');if(!f||seen.has(f))errors.push(`ARTIFACT_DUPLICATE_OR_EMPTY:${f}`);seen.add(f);}
  for(const [kind,name] of Object.entries(expected)){
    const matches=rows.filter(x=>String(x?.file||'')===name);
    if(matches.length!==1){errors.push(`ARTIFACT_${kind.toUpperCase()}_COUNT:${matches.length}`);continue;}
    const row=matches[0];
    if(String(row.kind||'')!==kind)errors.push(`ARTIFACT_${kind.toUpperCase()}_KIND_MISMATCH`);
    if(String(row.arch||'')!=='x64')errors.push(`ARTIFACT_${kind.toUpperCase()}_ARCH_MISMATCH`);
    if(readFileMeta){
      const p=path.join(manifestDir,name);
      if(!fs.existsSync(p)){errors.push(`ARTIFACT_${kind.toUpperCase()}_MISSING_FILE`);continue;}
      const lst=fs.lstatSync(p);if(lst.isSymbolicLink()){errors.push(`ARTIFACT_${kind.toUpperCase()}_SYMLINK_REPARSE_FORBIDDEN`);continue}if(!lst.isFile()){errors.push(`ARTIFACT_${kind.toUpperCase()}_NOT_REGULAR_FILE`);continue}
      const st=fs.statSync(p),sha=shaFile(p);
      if(Number(row.bytes)!==Number(st.size))errors.push(`ARTIFACT_${kind.toUpperCase()}_SIZE_MISMATCH`);
      if(String(row.sha256||'').toLowerCase()!==sha)errors.push(`ARTIFACT_${kind.toUpperCase()}_SHA_MISMATCH`);
    }
  }
  const sigs=Array.isArray(manifest?.signatures)?manifest.signatures:[];if(sigs.length!==expectedFiles.size)errors.push(`SIGNATURE_TOTAL_COUNT:${sigs.length}`);for(const sig of sigs)if(!expectedFiles.has(String(sig?.file||'')))errors.push(`SIGNATURE_UNEXPECTED:${String(sig?.file||'')}`);
  for(const name of Object.values(expected)){
    const s=sigs.filter(x=>String(x?.file||'')===name);
    if(s.length!==1)errors.push(`SIGNATURE_ROW_COUNT:${name}:${s.length}`);
    else if(requireSigning&&String(s[0]?.status||'')!=='Valid')errors.push(`SIGNATURE_INVALID:${name}:${String(s[0]?.status||'')}`);
  }
  return{ok:errors.length===0,errors,expected,artifactCount:rows.length,signatureCount:sigs.length};
}

function liveAuthenticode(file){
  if(process.platform!=='win32')return{ok:false,error:'WINDOWS_REQUIRED'};
  const ps=`$s=Get-AuthenticodeSignature -LiteralPath $env:WA_VERIFY_SIG_FILE; [pscustomobject]@{status=[string]$s.Status;subject=if($s.SignerCertificate){$s.SignerCertificate.Subject}else{$null};thumbprint=if($s.SignerCertificate){$s.SignerCertificate.Thumbprint}else{$null}} | ConvertTo-Json -Compress`;
  const r=cp.spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',ps],{encoding:'utf8',env:{...process.env,WA_VERIFY_SIG_FILE:path.resolve(file)}});
  if(r.status!==0)return{ok:false,error:'AUTHENTICODE_QUERY_FAILED',stderr:String(r.stderr||'')};
  try{const d=JSON.parse(String(r.stdout||'').trim());return{ok:true,status:String(d.status||''),subject:d.subject||null,thumbprint:String(d.thumbprint||'').replace(/[^A-Fa-f0-9]/g,'').toUpperCase()};}catch{return{ok:false,error:'AUTHENTICODE_QUERY_INVALID_JSON'}}
}

function main(){
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const arg=(name)=>{const p=process.argv.find(x=>x.startsWith(`--${name}=`));return p?p.slice(name.length+3):''};
  const stablePolicyCheck=validateStablePolicy(pkg);
  const requireSigning=process.argv.includes('--require-signing');
  const signatureContractRequired=requireSigning||stablePolicyCheck.policy?.requireAuthenticode===true;
  const manifestPath=path.resolve(root,arg('manifest')||'release/release-manifest.json');
  const lockPath=path.join(root,'package-lock.json');
  if(!fs.existsSync(manifestPath))return fail('RELEASE_MANIFEST_REQUIRED','release-manifest.json پیدا نشد.',{manifestPath});
  const manifestLstat=fs.lstatSync(manifestPath);if(manifestLstat.isSymbolicLink()||!manifestLstat.isFile())return fail('RELEASE_MANIFEST_REGULAR_FILE_REQUIRED','release-manifest.json must be a regular non-reparse file.',{manifestPath});
  if(!fs.existsSync(lockPath))return fail('PACKAGE_LOCK_REQUIRED','package-lock.json برای verify manifest لازم است.');
  let manifest;try{manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'))}catch{return fail('RELEASE_MANIFEST_INVALID_JSON','release-manifest.json معتبر نیست.');}
  const errors=[];
  if(String(manifest.schemaVersion||'')!=='workspace-agent-release-v10')errors.push('MANIFEST_SCHEMA_MISMATCH');
  if(String(manifest.version||'')!==String(pkg.version||''))errors.push('MANIFEST_VERSION_MISMATCH');
  if(String(manifest.toolingRevision||'')!==String(pkg.workspaceAgentRelease?.toolingRevision||''))errors.push('MANIFEST_TOOLING_MISMATCH');
  if(manifest.featureFreeze!==true)errors.push('MANIFEST_FEATURE_FREEZE_MISMATCH');
  const lockSha=shaFile(lockPath);if(String(manifest.packageLockSha256||'').toLowerCase()!==lockSha)errors.push('MANIFEST_LOCK_HASH_MISMATCH');
  let lockJson=null;try{lockJson=JSON.parse(fs.readFileSync(lockPath,'utf8'))}catch{errors.push('LOCKFILE_INVALID_JSON')}
  const policyCheck=validatePolicy(pkg);if(!policyCheck.ok)errors.push(...policyCheck.errors);if(!stablePolicyCheck.ok)errors.push(...stablePolicyCheck.errors);const sourceCheck=lockJson?validateLockSources(lockJson,pkg):null;if(sourceCheck&&!sourceCheck.ok)errors.push(...sourceCheck.errors.map(x=>`MANIFEST_DEPENDENCY_SOURCE:${x}`));
  if(policyCheck.ok&&policyStable(manifest.dependencySourcePolicy||{})!==policyStable(policyCheck.policy))errors.push('MANIFEST_DEPENDENCY_SOURCE_POLICY_MISMATCH');
  if(policyCheck.ok&&String(manifest.dependencySourcePolicySha256||'').toLowerCase()!==String(policyCheck.sha256||'').toLowerCase())errors.push('MANIFEST_DEPENDENCY_SOURCE_POLICY_HASH_MISMATCH');
  if(sourceCheck){const declaredOrigins=Array.isArray(manifest.resolvedRegistryOrigins)?manifest.resolvedRegistryOrigins.map(x=>String(x).toLowerCase()).sort():[];if(policyStable(declaredOrigins)!==policyStable(sourceCheck.resolvedOrigins))errors.push('MANIFEST_RESOLVED_REGISTRY_ORIGINS_MISMATCH');}
  if(stablePolicyCheck.ok&&stablePolicyStable(manifest.stableCertificationPolicy||{})!==stablePolicyStable(stablePolicyCheck.policy))errors.push('MANIFEST_STABLE_CERTIFICATION_POLICY_MISMATCH');
  if(stablePolicyCheck.ok&&String(manifest.stableCertificationPolicySha256||'').toLowerCase()!==String(stablePolicyCheck.sha256||'').toLowerCase())errors.push('MANIFEST_STABLE_CERTIFICATION_POLICY_HASH_MISMATCH');
  if(stablePolicyCheck.policy?.requireAuthenticode===true&&manifest.signingRequired!==true)errors.push('MANIFEST_SIGNING_POLICY_DOWNGRADE');
  const declaredScale=Array.isArray(manifest.scaleMatrix)?manifest.scaleMatrix.map(Number):[];if(JSON.stringify(declaredScale)!==JSON.stringify(stablePolicyCheck.policy?.requiredScaleMatrix||[]))errors.push('MANIFEST_SCALE_POLICY_MISMATCH');
  let fp={};try{fp=JSON.parse(cp.execFileSync(process.execPath,['scripts/source-tree-fingerprint.cjs'],{cwd:root,encoding:'utf8'}))}catch{errors.push('SOURCE_FINGERPRINT_FAILED');}
  if(String(manifest.sourceFingerprint||'')!==String(fp.sha256||''))errors.push('MANIFEST_SOURCE_FINGERPRINT_MISMATCH');
  let identity=null;try{identity=computeReleaseIdentity(root)}catch{errors.push('RELEASE_IDENTITY_FAILED');}
  if(!identity||String(manifest.releaseIdentitySha256||'').toLowerCase()!==String(identity.releaseIdentitySha256||'').toLowerCase())errors.push('MANIFEST_RELEASE_IDENTITY_MISMATCH');
  if(Number(manifest.sourceFiles||0)!==Number(fp.files||0))errors.push('MANIFEST_SOURCE_FILE_COUNT_MISMATCH');
  if(String(manifest.architecture||'')!=='x64')errors.push('MANIFEST_ARCH_MISMATCH');
  const artifactCheck=validateArtifactRows({pkg,manifest,manifestDir:path.dirname(manifestPath),requireSigning:signatureContractRequired,readFileMeta:true});errors.push(...artifactCheck.errors);
  const liveSignatures=[];if(requireSigning){if(process.platform!=='win32')errors.push('AUTHENTICODE_LIVE_RECHECK_WINDOWS_REQUIRED');else{for(const name of Object.values(artifactCheck.expected)){const file=path.join(path.dirname(manifestPath),name);const live=liveAuthenticode(file);liveSignatures.push({file:name,...live});if(!live.ok||live.status!=='Valid'){errors.push(`AUTHENTICODE_LIVE_INVALID:${name}:${live.error||live.status}`);continue}const declared=(manifest.signatures||[]).find(x=>String(x.file||'')===name);const declaredThumb=String(declared?.thumbprint||'').replace(/[^A-Fa-f0-9]/g,'').toUpperCase();if(!declaredThumb||declaredThumb!==live.thumbprint)errors.push(`AUTHENTICODE_THUMBPRINT_MISMATCH:${name}`);}}}
  const sumsPath=path.join(path.dirname(manifestPath),'SHA256SUMS.txt');
  if(!fs.existsSync(sumsPath))errors.push('SHA256SUMS_MISSING');
  else{
    const map=new Map(fs.readFileSync(sumsPath,'utf8').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{const m=line.match(/^([a-fA-F0-9]{64})\s{2}(.+)$/);return m?[m[2],m[1].toLowerCase()]:['',''];}));
    for(const row of manifest.artifacts||[])if(map.get(String(row.file||''))!==String(row.sha256||'').toLowerCase())errors.push(`SHA256SUMS_MISMATCH:${String(row.file||'')}`);
  }
  if(errors.length)return fail('RELEASE_MANIFEST_INVALID','Release manifest contract failed.',{errors,manifestPath});
  const out={ok:true,version:pkg.version,toolingRevision:pkg.workspaceAgentRelease.toolingRevision,manifestSha256:shaFile(manifestPath),packageLockSha256:lockSha,sourceFingerprint:fp.sha256,releaseIdentitySha256:identity?.releaseIdentitySha256||null,dependencySourcePolicySha256:policyCheck.sha256,stableCertificationPolicySha256:stablePolicyCheck.sha256,resolvedRegistryOrigins:sourceCheck?.resolvedOrigins||[],artifacts:manifest.artifacts.map(x=>({kind:x.kind,file:x.file,sha256:x.sha256,bytes:x.bytes})),signingRequired:signatureContractRequired,liveAuthenticodeRecheck:requireSigning?{platform:process.platform,signatures:liveSignatures}:null};
  console.log(JSON.stringify(out,null,2));
}
if(require.main===module)main();
module.exports={exactArtifactNames,validateArtifactRows,liveAuthenticode};
