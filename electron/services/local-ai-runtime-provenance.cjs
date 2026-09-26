const fs=require('fs');
const crypto=require('crypto');
const {spawnSync}=require('child_process');

function normalizeSha256(v=''){const s=String(v||'').trim().toLowerCase();return/^[a-f0-9]{64}$/.test(s)?s:'';}
function normalizeThumbprint(v=''){return String(v||'').replace(/[^a-fA-F0-9]/g,'').toUpperCase().slice(0,128);}
function normalizeTrustMode(v='inspect'){const s=String(v||'inspect').trim().toLowerCase();return['inspect','hash-required','hash-and-signer-required'].includes(s)?s:'inspect';}
function fileIdentity(file){const s=fs.statSync(file,{bigint:true});return{size:String(s.size),mtimeNs:String(s.mtimeNs??BigInt(Math.trunc(Number(s.mtimeMs)*1e6))),ctimeNs:String(s.ctimeNs??BigInt(Math.trunc(Number(s.ctimeMs)*1e6))),dev:String(s.dev),ino:String(s.ino)};}
function sameIdentity(a,b){return Boolean(a&&b)&&['size','mtimeNs','ctimeNs','dev','ino'].every(k=>String(a[k])===String(b[k]));}
async function sha256FileStable(file){const before=fileIdentity(file);const hash=crypto.createHash('sha256');await new Promise((resolve,reject)=>{const s=fs.createReadStream(file,{highWaterMark:1024*1024});s.on('data',d=>hash.update(d));s.once('error',reject);s.once('end',resolve);});const after=fileIdentity(file);if(!sameIdentity(before,after))throw Object.assign(new Error('Runtime executable هنگام محاسبه fingerprint تغییر کرد.'),{code:'AI_RUNTIME_EXECUTABLE_MUTATED_DURING_HASH'});return{sha256:hash.digest('hex'),identity:after};}
function inspectAuthenticode(file,{platform=process.platform,spawnSyncImpl=spawnSync}={}){
  if(platform!=='win32')return{supported:false,status:'UNAVAILABLE_NON_WINDOWS',valid:false,subject:null,thumbprint:null,issuer:null,code:'AI_RUNTIME_AUTHENTICODE_WINDOWS_ONLY'};
  const script="$ErrorActionPreference='Stop';$s=Get-AuthenticodeSignature -LiteralPath $args[0];$c=$s.SignerCertificate;[pscustomobject]@{Status=[string]$s.Status;StatusMessage=[string]$s.StatusMessage;Subject=if($c){[string]$c.Subject}else{$null};Issuer=if($c){[string]$c.Issuer}else{$null};Thumbprint=if($c){[string]$c.Thumbprint}else{$null}}|ConvertTo-Json -Compress";
  let r;try{r=spawnSyncImpl('powershell.exe',['-NoProfile','-NonInteractive','-Command',script,file],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024});}catch(error){return{supported:false,status:'ERROR',valid:false,subject:null,thumbprint:null,issuer:null,code:'AI_RUNTIME_AUTHENTICODE_PROBE_FAILED',message:String(error.message||error).slice(0,500)};}
  if(r?.error||Number(r?.status)!==0)return{supported:false,status:'ERROR',valid:false,subject:null,thumbprint:null,issuer:null,code:'AI_RUNTIME_AUTHENTICODE_PROBE_FAILED',message:String(r?.error?.message||r?.stderr||'Authenticode probe failed').trim().slice(0,500)};
  try{const o=JSON.parse(String(r.stdout||'').replace(/^\uFEFF/,'').trim());const status=String(o.Status||'Unknown');return{supported:true,status,valid:status.toLowerCase()==='valid',subject:o.Subject||null,issuer:o.Issuer||null,thumbprint:normalizeThumbprint(o.Thumbprint||''),statusMessage:String(o.StatusMessage||'').slice(0,500)||null,code:status.toLowerCase()==='valid'?'AI_RUNTIME_AUTHENTICODE_VALID':'AI_RUNTIME_AUTHENTICODE_NOT_VALID'};}catch(error){return{supported:false,status:'ERROR',valid:false,subject:null,thumbprint:null,issuer:null,code:'AI_RUNTIME_AUTHENTICODE_PARSE_FAILED',message:String(error.message||error).slice(0,500)};}
}
async function inspectRuntimeProvenance(file,{platform=process.platform,spawnSyncImpl=spawnSync}={}){const resolved=fs.realpathSync(file);const h=await sha256FileStable(resolved);const signer=inspectAuthenticode(resolved,{platform,spawnSyncImpl});return{schemaVersion:'workspace-local-ai-runtime-provenance-v1',file:resolved,fileName:require('path').basename(resolved),sha256:h.sha256,identity:h.identity,signer,inspectedAt:new Date().toISOString()};}
function evaluateRuntimeTrust(provenance,cfg={}, {platform=process.platform}={}){
  const mode=normalizeTrustMode(cfg.runtimeTrustMode);const expectedSha256=normalizeSha256(cfg.runtimeExpectedSha256);const expectedSignerThumbprint=normalizeThumbprint(cfg.runtimeExpectedSignerThumbprint);const actualSha256=normalizeSha256(provenance?.sha256);const signer=provenance?.signer||{};const actualThumbprint=normalizeThumbprint(signer.thumbprint||'');
  const hashMatch=Boolean(expectedSha256&&actualSha256&&expectedSha256===actualSha256);const signerMatch=Boolean(expectedSignerThumbprint&&actualThumbprint&&expectedSignerThumbprint===actualThumbprint);
  let allowed=true,code='AI_RUNTIME_TRUST_INSPECTED';
  if(mode==='hash-required'){if(!expectedSha256){allowed=false;code='AI_RUNTIME_EXPECTED_SHA256_REQUIRED';}else if(!hashMatch){allowed=false;code='AI_RUNTIME_SHA256_MISMATCH';}else code='AI_RUNTIME_HASH_TRUSTED';}
  if(mode==='hash-and-signer-required'){
    if(!expectedSha256){allowed=false;code='AI_RUNTIME_EXPECTED_SHA256_REQUIRED';}
    else if(!hashMatch){allowed=false;code='AI_RUNTIME_SHA256_MISMATCH';}
    else if(platform!=='win32'){allowed=false;code='AI_RUNTIME_AUTHENTICODE_WINDOWS_REQUIRED';}
    else if(!expectedSignerThumbprint){allowed=false;code='AI_RUNTIME_EXPECTED_SIGNER_REQUIRED';}
    else if(!signer.supported||!signer.valid){allowed=false;code='AI_RUNTIME_AUTHENTICODE_INVALID';}
    else if(!signerMatch){allowed=false;code='AI_RUNTIME_SIGNER_MISMATCH';}
    else code='AI_RUNTIME_HASH_AND_SIGNER_TRUSTED';
  }
  return{schemaVersion:'workspace-local-ai-runtime-trust-v1',mode,allowed,code,sha256:actualSha256||null,expectedSha256:expectedSha256||null,hashMatch,signer:{supported:Boolean(signer.supported),valid:Boolean(signer.valid),status:signer.status||null,subject:signer.subject||null,issuer:signer.issuer||null,thumbprint:actualThumbprint||null,expectedThumbprint:expectedSignerThumbprint||null,thumbprintMatch:signerMatch},inspectedAt:provenance?.inspectedAt||null,identity:provenance?.identity||null};
}
module.exports={normalizeSha256,normalizeThumbprint,normalizeTrustMode,fileIdentity,sameIdentity,sha256FileStable,inspectAuthenticode,inspectRuntimeProvenance,evaluateRuntimeTrust};
