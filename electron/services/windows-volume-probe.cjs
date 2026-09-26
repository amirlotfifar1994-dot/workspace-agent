const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const {spawn}=require('child_process');
const {normalizeDisplayPath,toFsPath,keyPath}=require('./windows-path-utils.cjs');

function driveLetterFor(root,{platform=process.platform}={}){
  if(platform!=='win32')return'';
  const p=normalizeDisplayPath(String(root||''),{platform});
  const m=/^([A-Za-z]):(?:\\|\/|$)/.exec(p);return m?m[1].toUpperCase():'';
}
function uncShareRootFor(root,{platform=process.platform}={}){
  if(platform!=='win32')return'';
  const p=normalizeDisplayPath(String(root||''),{platform});
  if(!p.startsWith('\\\\'))return'';
  const parts=p.split('\\');
  return parts.length>=4&&parts[2]&&parts[3]?`\\\\${parts[2]}\\${parts[3]}\\`:'';
}
function volumeRootFor(root,{platform=process.platform}={}){
  if(platform!=='win32')return normalizeDisplayPath(String(root||''),{platform});
  const letter=driveLetterFor(root,{platform});if(letter)return`${letter}:\\`;
  return uncShareRootFor(root,{platform})||normalizeDisplayPath(String(root||''),{platform});
}
function safeJson(text){try{return JSON.parse(String(text||'').trim())}catch{return null}}
function runPowerShell(command,{env={},timeoutMs=6000,spawnImpl=spawn}={}){
  return new Promise(resolve=>{
    let settled=false,stdout='',stderr='';
    let child;try{child=spawnImpl('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});}
    catch(error){resolve({ok:false,code:error.code||'POWERSHELL_SPAWN_FAILED',message:error.message});return;}
    const done=result=>{if(settled)return;settled=true;clearTimeout(timer);resolve(result)};
    child.stdout?.on('data',d=>{stdout+=String(d);if(stdout.length>1024*1024)stdout=stdout.slice(-1024*1024)});
    child.stderr?.on('data',d=>{stderr+=String(d);if(stderr.length>256*1024)stderr=stderr.slice(-256*1024)});
    child.on('error',error=>done({ok:false,code:error.code||'POWERSHELL_FAILED',message:error.message}));
    child.on('close',code=>done(code===0?{ok:true,stdout}:{ok:false,code:'POWERSHELL_EXIT',exitCode:code,stderr:stderr.trim().slice(0,1000)}));
    const timer=setTimeout(()=>{try{child.kill()}catch{}done({ok:false,code:'POWERSHELL_TIMEOUT'})},Math.max(500,Number(timeoutMs)||6000));
  });
}
const GET_VOLUME_COMMAND=`$ErrorActionPreference='Stop'; $v=Get-Volume -DriveLetter $env:WA_DRIVE_LETTER -ErrorAction Stop | Select-Object -First 1; [pscustomobject]@{ DriveLetter=[string]$v.DriveLetter; FileSystemLabel=[string]$v.FileSystemLabel; FileSystem=[string]$v.FileSystem; DriveType=[string]$v.DriveType; HealthStatus=[string]$v.HealthStatus; Size=[uint64]$v.Size; SizeRemaining=[uint64]$v.SizeRemaining; UniqueId=[string]$v.UniqueId; Path=[string]$v.Path } | ConvertTo-Json -Compress`;
const FIND_VOLUME_COMMAND=`$ErrorActionPreference='Stop'; $v=Get-Volume -UniqueId $env:WA_VOLUME_UNIQUE_ID -ErrorAction Stop | Select-Object -First 1; [pscustomobject]@{ DriveLetter=[string]$v.DriveLetter; FileSystemLabel=[string]$v.FileSystemLabel; FileSystem=[string]$v.FileSystem; DriveType=[string]$v.DriveType; HealthStatus=[string]$v.HealthStatus; Size=[uint64]$v.Size; SizeRemaining=[uint64]$v.SizeRemaining; UniqueId=[string]$v.UniqueId; Path=[string]$v.Path } | ConvertTo-Json -Compress`;
function normalizeVolume(v){if(!v||typeof v!=='object')return null;return{driveLetter:String(v.DriveLetter||v.driveLetter||'').toUpperCase(),label:String(v.FileSystemLabel||v.label||''),fileSystem:String(v.FileSystem||v.fileSystem||''),driveType:String(v.DriveType||v.driveType||''),healthStatus:String(v.HealthStatus||v.healthStatus||''),size:Number(v.Size||v.size||0),sizeRemaining:Number(v.SizeRemaining||v.sizeRemaining||0),uniqueId:String(v.UniqueId||v.uniqueId||''),volumePath:String(v.Path||v.volumePath||'')};}
async function basicAvailability(root,{platform=process.platform}={}){
  const rr=normalizeDisplayPath(String(root||''),{platform});
  try{const st=await fsp.stat(toFsPath(rr,{platform}));if(!st.isDirectory())return{available:false,code:'ROOT_NOT_DIRECTORY',root:rr};let statfs=null;try{const s=await fsp.statfs(toFsPath(rr,{platform}));statfs={type:Number(s.type||0),bsize:Number(s.bsize||0),blocks:Number(s.blocks||0),bfree:Number(s.bfree||0),bavail:Number(s.bavail||0)}}catch{}return{available:true,root:rr,statfs};}
  catch(error){return{available:false,root:rr,code:error.code||'ROOT_UNAVAILABLE'};}
}
async function probeVolume(root,{platform=process.platform,spawnImpl=spawn,timeoutMs=6000}={}){
  const base=await basicAvailability(root,{platform});
  if(!base.available)return{...base,identityKey:'',volume:null,driveLetter:driveLetterFor(root,{platform})};
  if(platform!=='win32')return{...base,identityKey:`root:${keyPath(base.root,{platform})}`,volume:{driveLetter:'',label:'',fileSystem:'',driveType:'',healthStatus:'',size:0,sizeRemaining:0,uniqueId:'',volumePath:''},driveLetter:''};
  const driveLetter=driveLetterFor(base.root,{platform});
  if(!driveLetter){const uncRoot=uncShareRootFor(base.root,{platform});return{...base,identityKey:uncRoot?`unc:${keyPath(uncRoot,{platform})}`:`root:${keyPath(base.root,{platform})}`,volume:null,driveLetter:'',uncRoot:uncRoot||''};}
  const ps=await runPowerShell(GET_VOLUME_COMMAND,{env:{WA_DRIVE_LETTER:driveLetter},timeoutMs,spawnImpl});
  if(!ps.ok)return{...base,driveLetter,identityKey:`drive:${driveLetter}`,volume:null,probeWarning:ps.code};
  const volume=normalizeVolume(safeJson(ps.stdout));
  const identityKey=volume?.uniqueId?`volume:${volume.uniqueId}`:(volume?.volumePath?`path:${volume.volumePath}`:`drive:${driveLetter}`);
  return{...base,driveLetter,identityKey,volume};
}
async function locateVolumeByUniqueId(uniqueId,{platform=process.platform,spawnImpl=spawn,timeoutMs=6000}={}){
  const id=String(uniqueId||'').trim();if(!id||platform!=='win32')return{found:false,code:'VOLUME_LOOKUP_UNAVAILABLE'};
  const ps=await runPowerShell(FIND_VOLUME_COMMAND,{env:{WA_VOLUME_UNIQUE_ID:id},timeoutMs,spawnImpl});if(!ps.ok)return{found:false,code:ps.code};
  const volume=normalizeVolume(safeJson(ps.stdout));if(!volume)return{found:false,code:'VOLUME_LOOKUP_PARSE_FAILED'};
  return{found:true,volume,driveRoot:volume.driveLetter?`${volume.driveLetter}:\\`:''};
}
module.exports={driveLetterFor,uncShareRootFor,volumeRootFor,basicAvailability,probeVolume,locateVolumeByUniqueId,normalizeVolume,runPowerShell,GET_VOLUME_COMMAND,FIND_VOLUME_COMMAND};
