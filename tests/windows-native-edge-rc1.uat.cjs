const assert=require('assert');
const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const {spawn,spawnSync}=require('child_process');
const {buildWritePlan,executeWritePlan,verifyCompleted,undoCompleted,assertCanonicalSiblingAvailable}=require('../electron/services/file-explorer-service.cjs');
const {classifyIoError}=require('../electron/services/explorer-storage-guard.cjs');
const {probeVolume}=require('../electron/services/windows-volume-probe.cjs');

const resultFile=String(process.env.WA_CERT_RESULT||'').trim();
function writeResult(data){if(!resultFile)return;fs.mkdirSync(path.dirname(path.resolve(resultFile)),{recursive:true});fs.writeFileSync(path.resolve(resultFile),JSON.stringify({schemaVersion:'workspace-agent-windows-native-edge-uat-v2',createdAt:new Date().toISOString(),...data},null,2));}
function prereq(message){writeResult({overall:'INCOMPLETE',reason:message,checks:{}});console.log(`windows-native-edge-rc1.uat.cjs SKIP (${message})`);if(process.env.WA_CERT_STRICT==='1')process.exit(3);process.exit(0);}
function waitForLine(child,needle,timeoutMs=8000){return new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(new Error(`LOCK_HELPER_TIMEOUT ${out}`)),timeoutMs);child.stdout.on('data',d=>{out+=String(d);if(out.includes(needle)){clearTimeout(timer);resolve(out)}});child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('exit',code=>{if(!out.includes(needle)){clearTimeout(timer);reject(new Error(`LOCK_HELPER_EXIT_${code} ${out}`))}});});}
function runPs(command,env={}){const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,env:{...process.env,...env},encoding:'utf8'});if(r.status!==0)throw Object.assign(new Error(`POWERSHELL_UAT_FAILED: ${String(r.stderr||r.stdout||'').trim()}`),{code:'POWERSHELL_UAT_FAILED',exitCode:r.status});return String(r.stdout||'').trim();}

(async()=>{
  if(process.platform!=='win32')prereq('Windows only');
  const certRoot=String(process.env.WA_CERT_ROOT_A||'').trim();
  if(!certRoot)prereq('WA_CERT_ROOT_A required');
  const root=path.join(certRoot,`wa-native-edge-${Date.now()}-${process.pid}`);
  const outside=path.join(certRoot,`wa-native-edge-outside-${Date.now()}-${process.pid}`);
  await fsp.mkdir(root,{recursive:true});await fsp.mkdir(outside,{recursive:true});
  let lockChild=null;const checks={};
  try{
    const volume=await probeVolume(root);assert(volume.available,'cert root must be available');assert(String(volume.volume?.fileSystem||'').toUpperCase()==='NTFS','native edge UAT requires NTFS');checks.ntfs={status:'PASS',identityKey:volume.identityKey,driveLetter:volume.driveLetter};

    await fsp.mkdir(path.join(root,'dest'));
    const unicodeSource='طرح-آزمایشی-😀.txt';await fsp.writeFile(path.join(root,unicodeSource),'unicode-safe');
    let p=await buildWritePlan({action:'copy',root,sourceRelative:unicodeSource,destinationRelative:path.join('dest','کپی-طرح-😀.txt')});
    let c=await executeWritePlan(p,{cycleId:'native-unicode'});assert((await verifyCompleted(c)).ok);assert((await undoCompleted(c))[0].ok);checks.unicodePersianEmoji={status:'PASS'};

    await fsp.writeFile(path.join(root,'dest','cafe\u0301.txt'),'x');
    await assert.rejects(()=>assertCanonicalSiblingAvailable(path.join(root,'dest','café.txt'),{platform:'win32'}),e=>e.code==='EXPLORER_UNICODE_CANONICAL_COLLISION');checks.canonicalUnicodeCollision={status:'PASS'};

    const segments=[];let longParent=root;while(longParent.length<310){segments.push(`بخش-${String(segments.length).padStart(2,'0')}-${'x'.repeat(28)}`);longParent=path.join(root,...segments)}
    await fsp.mkdir(longParent,{recursive:true});await fsp.writeFile(path.join(root,'long-source.txt'),'long-path-data');
    const relLong=path.join(...segments,'نتیجه-طولانی.txt');assert(path.join(root,relLong).length>300);
    p=await buildWritePlan({action:'copy',root,sourceRelative:'long-source.txt',destinationRelative:relLong});c=await executeWritePlan(p,{cycleId:'native-longpath'});assert((await verifyCompleted(c)).ok);assert((await undoCompleted(c))[0].ok);checks.longPath={status:'PASS',displayPathLength:path.join(root,relLong).length};

    await fsp.writeFile(path.join(root,'CaseFile.TXT'),'case-only');
    p=await buildWritePlan({action:'rename',root,sourceRelative:'CaseFile.TXT',newName:'casefile.txt'});c=await executeWritePlan(p,{cycleId:'native-case'});assert(c.caseOnlyRename);assert((await verifyCompleted(c)).ok);assert((await undoCompleted(c))[0].ok);checks.caseOnlyRenameUndo={status:'PASS'};

    const junction=path.join(root,'junction-out');await fsp.symlink(outside,junction,'junction');
    await assert.rejects(()=>buildWritePlan({action:'new-folder',root,destinationRelative:path.join('junction-out','blocked')}),e=>['EXPLORER_REPARSE_PATH_BLOCKED','EXPLORER_REPARSE_ROOT_BLOCKED'].includes(e.code));checks.realNtfsJunctionFence={status:'PASS'};

    const aclParent=path.join(root,'acl-parent');await fsp.mkdir(aclParent);
    const aclSet=`$ErrorActionPreference='Stop';$p=$env:WA_ACL_PARENT;$acl=Get-Acl -LiteralPath $p;$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'Modify','ContainerInherit,ObjectInherit','None','Allow');$acl.SetAccessRule($rule);Set-Acl -LiteralPath $p -AclObject $acl;[Console]::Out.Write($sid.Value)`;
    const sid=runPs(aclSet,{WA_ACL_PARENT:aclParent});assert(sid,'current user SID required for ACL UAT');
    const aclChild=path.join(aclParent,'child');await fsp.mkdir(aclChild);await fsp.writeFile(path.join(aclChild,'probe.txt'),'acl');
    const aclCheck=`$ErrorActionPreference='Stop';$sid=$env:WA_ACL_SID;$acl=Get-Acl -LiteralPath $env:WA_ACL_CHILD;$ok=$false;foreach($r in $acl.Access){try{$s=$r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;if($s -eq $sid -and $r.IsInherited){$ok=$true;break}}catch{}};[pscustomobject]@{Inherited=$ok;Protected=$acl.AreAccessRulesProtected}|ConvertTo-Json -Compress`;
    const aclMeta=JSON.parse(runPs(aclCheck,{WA_ACL_CHILD:aclChild,WA_ACL_SID:sid}));assert.equal(Boolean(aclMeta.Inherited),true,'child must inherit current-user ACL rule from parent');checks.ntfsAclInheritance={status:'PASS',childProtected:Boolean(aclMeta.Protected)};

    const locked=path.join(root,'locked-by-editor.txt');await fsp.writeFile(locked,'locked');
    const lockCmd="$ErrorActionPreference='Stop'; $fs=[System.IO.File]::Open($env:WA_LOCK_FILE,[System.IO.FileMode]::Open,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None); [Console]::Out.WriteLine('LOCKED'); [Console]::Out.Flush(); Start-Sleep -Seconds 20; $fs.Dispose()";
    lockChild=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',lockCmd],{windowsHide:true,env:{...process.env,WA_LOCK_FILE:locked},stdio:['ignore','pipe','pipe']});
    await waitForLine(lockChild,'LOCKED');
    p=await buildWritePlan({action:'move',root,sourceRelative:'locked-by-editor.txt',destinationRelative:path.join('dest','locked-by-editor.txt')});let lockError=null;try{await executeWritePlan(p,{cycleId:'native-lock'});}catch(e){lockError=e;}assert(lockError,'locked file move must fail');const cls=classifyIoError(lockError);assert(cls.recoverable,'locked file failure must be recoverable');assert(['locked','permission-or-lock','permission'].includes(cls.category),`unexpected lock category ${cls.category}/${lockError.code}`);assert(fs.existsSync(locked),'source must remain after locked move failure');checks.realWindowsShareModeLock={status:'PASS',category:cls.category,code:lockError.code||null};
    try{lockChild.kill();}catch{}lockChild=null;

    writeResult({overall:'PASS',root,volumeIdentity:volume.identityKey,checks});
    console.log('windows-native-edge-rc1.uat.cjs PASS',{ntfs:true,unicode:true,longPath:true,caseOnlyRename:true,realJunction:true,aclInheritance:true,realShareModeLock:true,displayPathLength:path.join(root,relLong).length,volumeIdentity:volume.identityKey});
  }catch(e){writeResult({overall:'FAIL',error:{code:e.code||'UAT_FAILED',message:e.message,stack:String(e.stack||'').split('\n').slice(0,8)},checks});throw e;}
  finally{if(lockChild){try{lockChild.kill()}catch{}}await fsp.rm(root,{recursive:true,force:true}).catch(()=>{});await fsp.rm(outside,{recursive:true,force:true}).catch(()=>{});}
})().catch(e=>{console.error(e);process.exit(1)});
