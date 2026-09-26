const {atomicWriteJsonSync}=require('./durable-state.cjs');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

const SCHEMA='workspace-local-ai-config-v2';
const DEFAULTS=Object.freeze({
  schemaVersion:SCHEMA,
  enabled:false,
  provider:'local-openai-compatible',
  baseUrl:'http://127.0.0.1:8080/v1',
  model:'',
  timeoutMs:60000,
  maxOutputTokens:1400,
  temperature:0.1,
  maxPlanNodes:12,
  maxPromptChars:24000,
  callsPerMinute:10,
  breakerFailures:3,
  breakerCooldownMs:60000,
  allowVision:false,
  maxVisionBytes:8*1024*1024,
  storeRawPrompts:false,
  networkPolicy:'loopback-only',
  managedRuntime:false,
  runtimeExecutablePath:'',
  runtimeModelPath:'',
  runtimePort:8080,
  runtimeAlias:'workspace-local-model',
  runtimeContextSize:8192,
  runtimeThreads:0,
  runtimeGpuLayers:'auto',
  runtimeStartupTimeoutMs:120000,
  runtimeStartOnLaunch:false,
  runtimeTrustMode:'inspect',
  runtimeExpectedSha256:'',
  runtimeExpectedSignerThumbprint:''
});

function clone(v){return JSON.parse(JSON.stringify(v));}
function atomicWrite(file,value){return atomicWriteJsonSync(file,value);}
function isLoopbackHost(hostname=''){const h=String(hostname||'').toLowerCase().replace(/^\[|\]$/g,'');return h==='localhost'||h==='127.0.0.1'||h==='::1'||h==='0:0:0:0:0:0:0:1';}
function validateBaseUrl(value){let u;try{u=new URL(String(value||''));}catch{throw Object.assign(new Error('آدرس Local AI معتبر نیست.'),{code:'AI_BASE_URL_INVALID'});}if(!['http:','https:'].includes(u.protocol))throw Object.assign(new Error('فقط HTTP/HTTPS برای Local AI پشتیبانی می‌شود.'),{code:'AI_PROTOCOL_BLOCKED'});if(u.username||u.password)throw Object.assign(new Error('Credential داخل URL مجاز نیست.'),{code:'AI_URL_CREDENTIAL_BLOCKED'});if(!isLoopbackHost(u.hostname))throw Object.assign(new Error('Local AI فقط endpoint محلی loopback را می‌پذیرد.'),{code:'AI_NON_LOOPBACK_BLOCKED'});u.hash='';u.search='';u.pathname=u.pathname.replace(/\/+$/,'')||'/v1';if(!u.pathname.endsWith('/v1'))throw Object.assign(new Error('Base URL باید به مسیر OpenAI-compatible /v1 ختم شود.'),{code:'AI_BASE_PATH_BLOCKED'});return u.toString().replace(/\/$/,'');}
function cleanPath(v,max=4096){return String(v||'').trim().slice(0,max);}
function normalizeSha(v){const s=String(v||'').trim().toLowerCase();return/^[a-f0-9]{64}$/.test(s)?s:'';}
function normalizeThumbprint(v){return String(v||'').replace(/[^a-fA-F0-9]/g,'').toUpperCase().slice(0,128);}
function normalizeTrustMode(v){const s=String(v||'inspect').trim().toLowerCase();return['inspect','hash-required','hash-and-signer-required'].includes(s)?s:'inspect';}
function normalizeGpuLayers(v){const s=String(v??'auto').trim().toLowerCase();if(['auto','all','0'].includes(s))return s;if(/^\d{1,3}$/.test(s))return String(Math.min(999,Number(s)));return'auto';}
function normalize(input={}){const v={...DEFAULTS,...input,schemaVersion:SCHEMA};v.enabled=Boolean(v.enabled);v.allowVision=Boolean(v.allowVision);v.storeRawPrompts=false;v.baseUrl=validateBaseUrl(v.baseUrl);v.provider='local-openai-compatible';v.model=String(v.model||'').trim().slice(0,200);v.timeoutMs=Math.max(5000,Math.min(180000,Number(v.timeoutMs)||DEFAULTS.timeoutMs));v.maxOutputTokens=Math.max(128,Math.min(4096,Number(v.maxOutputTokens)||DEFAULTS.maxOutputTokens));{const t=Number(v.temperature);v.temperature=Number.isFinite(t)?Math.max(0,Math.min(1,t)):DEFAULTS.temperature;}v.maxPlanNodes=Math.max(1,Math.min(24,Number(v.maxPlanNodes)||DEFAULTS.maxPlanNodes));v.maxPromptChars=Math.max(4000,Math.min(64000,Number(v.maxPromptChars)||DEFAULTS.maxPromptChars));v.callsPerMinute=Math.max(1,Math.min(60,Number(v.callsPerMinute)||DEFAULTS.callsPerMinute));v.breakerFailures=Math.max(2,Math.min(10,Number(v.breakerFailures)||DEFAULTS.breakerFailures));v.breakerCooldownMs=Math.max(10000,Math.min(10*60*1000,Number(v.breakerCooldownMs)||DEFAULTS.breakerCooldownMs));v.maxVisionBytes=Math.max(256*1024,Math.min(16*1024*1024,Number(v.maxVisionBytes)||DEFAULTS.maxVisionBytes));v.networkPolicy='loopback-only';
 v.managedRuntime=Boolean(v.managedRuntime);v.runtimeExecutablePath=cleanPath(v.runtimeExecutablePath);v.runtimeModelPath=cleanPath(v.runtimeModelPath);v.runtimePort=Math.max(1024,Math.min(65535,Number(v.runtimePort)||8080));v.runtimeAlias=/^[A-Za-z0-9._-]{1,80}$/.test(String(v.runtimeAlias||''))?String(v.runtimeAlias):DEFAULTS.runtimeAlias;v.runtimeContextSize=Math.max(2048,Math.min(65536,Number(v.runtimeContextSize)||DEFAULTS.runtimeContextSize));v.runtimeThreads=Math.max(0,Math.min(64,Number(v.runtimeThreads)||0));v.runtimeGpuLayers=normalizeGpuLayers(v.runtimeGpuLayers);v.runtimeStartupTimeoutMs=Math.max(10000,Math.min(180000,Number(v.runtimeStartupTimeoutMs)||DEFAULTS.runtimeStartupTimeoutMs));v.runtimeStartOnLaunch=Boolean(v.runtimeStartOnLaunch);v.runtimeTrustMode=normalizeTrustMode(v.runtimeTrustMode);v.runtimeExpectedSha256=normalizeSha(v.runtimeExpectedSha256);v.runtimeExpectedSignerThumbprint=normalizeThumbprint(v.runtimeExpectedSignerThumbprint);return v;}
class LocalAIConfigStore{
  constructor(userData){this.file=path.join(userData,'local-ai-settings.json');this.value=this.load();}
  load(){try{const raw=JSON.parse(fs.readFileSync(this.file,'utf8'));return normalize(raw);}catch{return normalize(DEFAULTS);}}
  get(){return clone(this.value);}
  replace(input={}){const forbidden=['apiKey','token','secret','password','runtimeArgs','extraArgs','environment','env'];for(const key of forbidden)if(Object.prototype.hasOwnProperty.call(input,key))throw Object.assign(new Error('ذخیره Credential/Raw Runtime Args در Local AI پشتیبانی نمی‌شود.'),{code:'AI_SECRET_STORAGE_BLOCKED'});this.value=normalize(input);atomicWrite(this.file,this.value);return this.get();}
  update(patch={}){const forbidden=['apiKey','token','secret','password','runtimeArgs','extraArgs','environment','env'];for(const key of forbidden)if(Object.prototype.hasOwnProperty.call(patch,key))throw Object.assign(new Error('ذخیره Credential/Raw Runtime Args در Local AI پشتیبانی نمی‌شود.'),{code:'AI_SECRET_STORAGE_BLOCKED'});this.value=normalize({...this.value,...patch});atomicWrite(this.file,this.value);return this.get();}
  reset(){this.value=normalize(DEFAULTS);atomicWrite(this.file,this.value);return this.get();}
}
module.exports={SCHEMA,DEFAULTS,LocalAIConfigStore,validateBaseUrl,isLoopbackHost,normalize,normalizeGpuLayers,normalizeTrustMode,normalizeSha,normalizeThumbprint};
