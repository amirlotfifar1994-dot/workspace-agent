const {execFile}=require('child_process');
function runPowerShell(script,{timeout=20000}={}){
  return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',script],{windowsHide:true,timeout,maxBuffer:4*1024*1024},(error,stdout,stderr)=>{
    if(error)return reject(Object.assign(new Error(stderr?.trim()||error.message),{code:error.killed?'WINDOWS_INSPECT_TIMEOUT':error.code||'WINDOWS_INSPECT_FAILED'}));resolve(String(stdout||'').trim());
  }));
}
function arr(v){if(v==null)return[];return Array.isArray(v)?v:[v];}
async function inspectWindowsSystem(){
  if(process.platform!=='win32')return{supported:false,platform:process.platform,reason:'Windows inspection is available only on Windows runtime.'};
  const script=`
$ErrorActionPreference='Stop'
$os=Get-CimInstance Win32_OperatingSystem
$cs=Get-CimInstance Win32_ComputerSystem
$cpu=Get-CimInstance Win32_Processor | Select-Object -First 1
$disks=Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,VolumeName,FileSystem,Size,FreeSpace
$startup=Get-CimInstance Win32_StartupCommand | Select-Object -First 80 Name,Command,Location,User
$proc=Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 20 Name,Id,CPU,WorkingSet64,Path
$result=[ordered]@{
 computer=[ordered]@{name=$env:COMPUTERNAME;manufacturer=$cs.Manufacturer;model=$cs.Model;ramBytes=[int64]$cs.TotalPhysicalMemory}
 os=[ordered]@{caption=$os.Caption;version=$os.Version;build=$os.BuildNumber;architecture=$os.OSArchitecture;lastBoot=$os.LastBootUpTime;freeMemoryKB=[int64]$os.FreePhysicalMemory}
 cpu=[ordered]@{name=$cpu.Name;cores=$cpu.NumberOfCores;logicalProcessors=$cpu.NumberOfLogicalProcessors;maxClockMHz=$cpu.MaxClockSpeed}
 disks=$disks
 startup=$startup
 topProcesses=$proc
}
$result | ConvertTo-Json -Depth 5 -Compress`;
  const raw=await runPowerShell(script);const data=JSON.parse(raw||'{}');
  data.disks=arr(data.disks).map(d=>({...d,Size:Number(d.Size||0),FreeSpace:Number(d.FreeSpace||0)}));
  data.startup=arr(data.startup);data.topProcesses=arr(data.topProcesses).map(p=>({...p,Id:Number(p.Id||0),CPU:Number(p.CPU||0),WorkingSet64:Number(p.WorkingSet64||0)}));
  return{supported:true,platform:'win32',capturedAt:new Date().toISOString(),...data};
}
module.exports={inspectWindowsSystem,runPowerShell};
