const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {atomicWriteJsonSync}=require('./durable-state.cjs');

const SCHEMA='workspace-agent-update-guard-v1';
const DATA_EPOCH=1;
function now(){return new Date().toISOString();}
function atomic(file,value){return atomicWriteJsonSync(file,value);}
function read(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
function parseVersion(v='0.0.0'){
 const raw=String(v||'').trim();
 const m=raw.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/);
 if(!m)return{valid:false,raw,major:0,minor:0,patch:0,pre:[]};
 const pre=m[4]?m[4].split('.'):[];
 if(pre.some(x=>/^\d+$/.test(x)&&x.length>1&&x.startsWith('0')))return{valid:false,raw,major:0,minor:0,patch:0,pre:[]};
 return{valid:true,raw,major:Number(m[1]),minor:Number(m[2]),patch:Number(m[3]),pre};
}
function semverError(a,b){return Object.assign(new Error('Version string must be valid SemVer.'),{code:'VERSION_SEMVER_INVALID',versions:[String(a||''),String(b||'')]});}
function compareIdentifiers(a,b){const an=/^\d+$/.test(a),bn=/^\d+$/.test(b);if(an&&bn)return Number(a)-Number(b);if(an&&!bn)return-1;if(!an&&bn)return 1;return a===b?0:(String(a)<String(b)?-1:1);}
function compareVersions(a,b){const x=parseVersion(a),y=parseVersion(b);if(!x.valid||!y.valid)throw semverError(a,b);for(const k of ['major','minor','patch'])if(x[k]!==y[k])return x[k]>y[k]?1:-1;if(!x.pre.length&&!y.pre.length)return 0;if(!x.pre.length)return 1;if(!y.pre.length)return-1;const n=Math.max(x.pre.length,y.pre.length);for(let i=0;i<n;i++){if(x.pre[i]===undefined)return-1;if(y.pre[i]===undefined)return 1;const c=compareIdentifiers(x.pre[i],y.pre[i]);if(c)return c>0?1:-1;}return 0;}
function validSha(v=''){return /^[a-f0-9]{64}$/i.test(String(v||''));}
class VersionUpdateGuard{
 constructor(baseDir,{currentVersion='0.0.0',journal=null,observeBoot=true}={}){this.dir=path.join(baseDir,'runtime');this.file=path.join(this.dir,'update-guard.json');this.currentVersion=String(currentVersion||'0.0.0');this.journal=journal;this.state=this._load();if(observeBoot)this._observeBoot();}
 _load(){const v=read(this.file);if(v?.schemaVersion===SCHEMA){if(!Number.isInteger(v.dataEpoch))v.dataEpoch=DATA_EPOCH;return v;}return{schemaVersion:SCHEMA,dataEpoch:DATA_EPOCH,stableVersion:null,lastSeenVersion:null,lastBootAt:null,pending:null,lastSelfCheck:null,rollbackRecommended:false,writeBlocked:false,blockCode:null,history:[]};}
 _save(){this.state.history=(this.state.history||[]).slice(-60);atomic(this.file,this.state);}
 _history(type,payload={}){this.state.history=this.state.history||[];this.state.history.push({at:now(),type,...payload});}
 _observeBoot(){const prev=this.state.lastSeenVersion;this.state.lastSeenVersion=this.currentVersion;this.state.lastBootAt=now();this.state.rollbackRecommended=false;this.state.writeBlocked=false;this.state.blockCode=null;
   if(Number(this.state.dataEpoch||DATA_EPOCH)>DATA_EPOCH){this.state.writeBlocked=true;this.state.rollbackRecommended=true;this.state.blockCode='STATE_DATA_EPOCH_TOO_NEW';this._history('STATE_DATA_EPOCH_BLOCKED',{found:Number(this.state.dataEpoch),supported:DATA_EPOCH});}
   const currentParsed=parseVersion(this.currentVersion),previousParsed=prev?parseVersion(prev):null;if(!currentParsed.valid||previousParsed&&!previousParsed.valid){this.state.writeBlocked=true;this.state.rollbackRecommended=true;this.state.blockCode='VERSION_STATE_INVALID';this._history('VERSION_STATE_INVALID',{previousVersion:prev||null,currentVersion:this.currentVersion});}
   else if(prev&&compareVersions(prev,this.currentVersion)>0&&!this.state.writeBlocked){this.state.writeBlocked=true;this.state.rollbackRecommended=true;this.state.blockCode='APP_DOWNGRADE_DETECTED';this._history('DOWNGRADE_DETECTED',{from:prev,to:this.currentVersion});}
   if(this.state.pending&&this.state.pending.targetVersion===this.currentVersion&&!this.state.pending.firstBootAt){this.state.pending.firstBootAt=now();this._history('PENDING_UPDATE_FIRST_BOOT',{targetVersion:this.currentVersion});}
   this._save();this.journal?.append('UPDATE_GUARD_BOOT',{payload:{currentVersion:this.currentVersion,previousVersion:prev||null,writeBlocked:this.state.writeBlocked,blockCode:this.state.blockCode,pendingTarget:this.state.pending?.targetVersion||null}});
 }
 status(){return JSON.parse(JSON.stringify({...this.state,currentVersion:this.currentVersion,schemaVersion:SCHEMA,deliveryContract:'manual-verified-v1',automaticDownloader:false,automaticInstaller:false}));}
 prepareUpdate({targetVersion,artifactSha256,backupFile=null}={}){const target=String(targetVersion||'').trim();if(!parseVersion(target).valid||!parseVersion(this.currentVersion).valid)throw Object.assign(new Error('Version هدف Update باید SemVer معتبر باشد.'),{code:'UPDATE_TARGET_SEMVER_INVALID'});if(compareVersions(target,this.currentVersion)<=0)throw Object.assign(new Error('نسخه هدف Update باید از نسخه فعلی جدیدتر باشد.'),{code:'UPDATE_TARGET_NOT_NEWER'});if(!validSha(artifactSha256))throw Object.assign(new Error('SHA256 artifact برای Update Guard نامعتبر است.'),{code:'UPDATE_ARTIFACT_SHA_REQUIRED'});this.state.pending={targetVersion:target,artifactSha256:String(artifactSha256).toLowerCase(),backupFile:backupFile?path.basename(String(backupFile)):null,preparedAt:now(),firstBootAt:null,lastCheckAt:null};this._history('UPDATE_PREPARED',{targetVersion:target,artifactSha256:String(artifactSha256).toLowerCase()});this._save();this.journal?.append('UPDATE_PREPARED',{payload:{targetVersion:target,artifactSha256:String(artifactSha256).toLowerCase(),backupFile:this.state.pending.backupFile}});return this.status();}
 recordSelfCheck(report){const overall=String(report?.overall||'block').toLowerCase();const warningCodes=(report?.checks||[]).filter(x=>x.status==='warn').map(x=>x.code);const effectiveOverall=overall==='warn'&&warningCodes.length>0&&warningCodes.every(x=>x==='UPDATE_PENDING_VALIDATION')?'pass':overall;this.state.lastSelfCheck={at:report?.at||now(),version:this.currentVersion,overall,effectiveOverall,blocks:Number(report?.summary?.block||0),warnings:Number(report?.summary?.warn||0)};if(this.state.pending?.targetVersion===this.currentVersion){this.state.pending.lastCheckAt=now();if(effectiveOverall==='block'){this.state.rollbackRecommended=true;this.state.writeBlocked=true;this.state.blockCode='UPDATE_SELF_CHECK_BLOCKED';this._history('UPDATE_BOOT_BLOCKED',{targetVersion:this.currentVersion});}else if(effectiveOverall==='pass'){this.state.stableVersion=this.currentVersion;this.state.pending=null;this.state.rollbackRecommended=false;this.state.writeBlocked=false;this.state.blockCode=null;this._history('UPDATE_MARKED_STABLE',{version:this.currentVersion});}else{this.state.rollbackRecommended=false;this.state.writeBlocked=false;this.state.blockCode=null;this._history('UPDATE_BOOT_WARNING',{targetVersion:this.currentVersion});}}
   else if(overall==='block'&&this.state.blockCode==='APP_DOWNGRADE_DETECTED'){this.state.writeBlocked=true;this.state.rollbackRecommended=true;}
   else if(!this.state.pending&&effectiveOverall==='pass'&&!this.state.writeBlocked){this.state.stableVersion=this.currentVersion;}
   this._save();this.journal?.append('UPDATE_GUARD_SELF_CHECK',{payload:{version:this.currentVersion,overall,writeBlocked:this.state.writeBlocked,rollbackRecommended:this.state.rollbackRecommended,pendingTarget:this.state.pending?.targetVersion||null}});return this.status();}
 assertWriteAllowed(){if(this.state.writeBlocked)return{ok:false,code:this.state.blockCode||'UPDATE_GUARD_WRITE_BLOCKED',message:'Writeها به‌دلیل Version/Update Guard تا بررسی وضعیت نسخه مسدود هستند.',rollbackRecommended:Boolean(this.state.rollbackRecommended)};return{ok:true};}
 clearPending({reason='manual-clear'}={}){this._history('UPDATE_PENDING_CLEARED',{reason:String(reason||'manual-clear')});this.state.pending=null;if(this.state.blockCode==='UPDATE_SELF_CHECK_BLOCKED'){this.state.writeBlocked=false;this.state.rollbackRecommended=false;this.state.blockCode=null;}this._save();return this.status();}
}
module.exports={VersionUpdateGuard,compareVersions,parseVersion,SCHEMA,DATA_EPOCH};
