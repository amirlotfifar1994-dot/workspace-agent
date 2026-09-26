const assert=require('assert');
const {EventEmitter}=require('events');
const {PassThrough}=require('stream');
const {driveLetterFor,volumeRootFor,runPowerShell,normalizeVolume}=require('../electron/services/windows-volume-probe.cjs');

(async()=>{
 assert.strictEqual(driveLetterFor('e:\\Work\\Data',{platform:'win32'}),'E');
 assert.strictEqual(volumeRootFor('e:\\Work\\Data',{platform:'win32'}),'E:\\');
 assert.strictEqual(driveLetterFor('\\\\server\\share\\x',{platform:'win32'}),'');
 const captured={};
 function fakeSpawn(file,args,opts){captured.file=file;captured.args=args;captured.env=opts.env;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};process.nextTick(()=>{child.stdout.end(JSON.stringify({DriveLetter:'E',FileSystemLabel:'USB',FileSystem:'NTFS',DriveType:'Removable',HealthStatus:'Healthy',Size:1000,SizeRemaining:500,UniqueId:'VOL-A',Path:'\\\\?\\Volume{abc}\\'}));child.emit('close',0)});return child;}
 const r=await runPowerShell('Write-Output test',{env:{WA_DRIVE_LETTER:'E'},spawnImpl:fakeSpawn,timeoutMs:1000});assert.strictEqual(r.ok,true);assert.strictEqual(captured.file,'powershell.exe');assert.deepStrictEqual(captured.args.slice(0,2),['-NoProfile','-NonInteractive']);assert.strictEqual(captured.env.WA_DRIVE_LETTER,'E');
 const v=normalizeVolume(JSON.parse(r.stdout));assert.strictEqual(v.uniqueId,'VOL-A');assert.strictEqual(v.driveType,'Removable');assert.strictEqual(v.driveLetter,'E');
 console.log('windows-volume-probe-v083.test.cjs PASS',{envOnlyInput:true,volumeIdentity:true});
})().catch(e=>{console.error(e);process.exit(1)});
