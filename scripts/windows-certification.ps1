param(
  [switch]$RunScale,
  [switch]$BuildPackaged,
  [switch]$VerifyArtifacts,
  [switch]$RequireSigning,
  [string]$OutputDir = 'certification'
)
$ErrorActionPreference='Continue'
if($env:OS -ne 'Windows_NT'){throw 'Windows certification harness فقط روی Windows اجرا می‌شود.'}
Set-Location (Split-Path -Parent $PSScriptRoot)
$pkg=Get-Content package.json -Raw | ConvertFrom-Json
$stamp=(Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
$out=Join-Path (Get-Location) (Join-Path $OutputDir $stamp)
New-Item -ItemType Directory -Path $out -Force | Out-Null
$gates=New-Object System.Collections.Generic.List[object]
function Add-Gate([string]$name,[string]$status,[int]$exitCode,[string]$log,[bool]$required=$true,[object]$detail=$null){$gates.Add([pscustomobject]@{name=$name;status=$status;exitCode=$exitCode;required=$required;log=$log;detail=$detail})}
function Run-Npm([string]$script,[bool]$required=$true){$log=Join-Path $out ("gate-"+$script.Replace(':','-')+'.log'); & npm run $script *>&1 | Tee-Object -FilePath $log; $code=$LASTEXITCODE; Add-Gate $script ($(if($code -eq 0){'PASS'}else{'FAIL'})) $code $log $required $null; return $code}
function Run-Node([string]$name,[string[]]$args,[bool]$required=$true){$log=Join-Path $out ("gate-"+$name+'.log'); & node @args *>&1 | Tee-Object -FilePath $log; $code=$LASTEXITCODE; Add-Gate $name ($(if($code -eq 0){'PASS'}else{'FAIL'})) $code $log $required $null; return $code}
$expectedNode=(Get-Content .nvmrc -Raw).Trim();$actualNode=(node -p "process.versions.node").Trim();$expectedNpm=([string]$pkg.packageManager).Replace('npm@','');$actualNpm=(npm -v).Trim();
$runtimeOk=($actualNode -eq $expectedNode -and $actualNpm -eq $expectedNpm);Add-Gate 'runtime-version' ($(if($runtimeOk){'PASS'}else{'FAIL'})) ($(if($runtimeOk){0}else{1})) '' $true ([pscustomobject]@{expectedNode=$expectedNode;actualNode=$actualNode;expectedNpm=$expectedNpm;actualNpm=$actualNpm})
Run-Npm 'check:release-inputs' $true | Out-Null
Run-Npm 'check' $true | Out-Null
$uat=@('test:windows-uia-uat','test:windows-index-uat','test:windows-production-uat','test:windows-verification-uat','test:windows-system-resilience-uat','test:windows-removable-uat','test:windows-multiroot-uat')
foreach($u in $uat){Run-Npm $u $true | Out-Null}
if($RunScale){Run-Npm 'test:windows-scale-resilience-uat' $true | Out-Null}else{Add-Gate 'test:windows-scale-resilience-uat' 'SKIP' 0 '' $false 'Run with -RunScale'}
$packagedExe=$null
if($BuildPackaged){
 Run-Npm 'build' $true | Out-Null;Run-Npm 'pack:win:dir' $true | Out-Null
 $worker=Join-Path (Get-Location) 'release\win-unpacked\resources\app.asar.unpacked\electron\services\hash-worker.cjs'
 if(Test-Path $worker){Run-Node 'packaged-worker-smoke' @('tests/packaged-worker-smoke-v082.cjs',$worker) $true | Out-Null}else{Add-Gate 'packaged-worker-smoke' 'FAIL' 2 '' $true "missing $worker"}
 $packagedExe=(Get-ChildItem 'release\win-unpacked' -Filter '*.exe' -File | Select-Object -First 1).FullName
 if($packagedExe){Run-Node 'packaged-app-smoke' @('tests/packaged-app-smoke-v084.cjs',$packagedExe) $true | Out-Null}else{Add-Gate 'packaged-app-smoke' 'FAIL' 2 '' $true 'win-unpacked exe not found'}
}else{Add-Gate 'packaged-build' 'SKIP' 0 '' $false 'Run with -BuildPackaged'}
$artifacts=@();$signatures=@()
if($VerifyArtifacts){
 if(-not (Test-Path release)){Add-Gate 'artifact-verification' 'FAIL' 2 '' $true 'release directory missing'}else{
  $files=Get-ChildItem release -File | Where-Object{$_.Extension -in '.exe','.msi','.zip'} | Sort-Object Name
  foreach($f in $files){$h=Get-FileHash $f.FullName -Algorithm SHA256;$sig=Get-AuthenticodeSignature $f.FullName;$artifacts += [pscustomobject]@{file=$f.Name;bytes=$f.Length;sha256=$h.Hash.ToLowerInvariant()};$signatures += [pscustomobject]@{file=$f.Name;status=[string]$sig.Status;subject=if($sig.SignerCertificate){$sig.SignerCertificate.Subject}else{$null};thumbprint=if($sig.SignerCertificate){$sig.SignerCertificate.Thumbprint}else{$null}}}
  $sigOk=(!$RequireSigning -or (($signatures|Where-Object{$_.status -ne 'Valid'}).Count -eq 0 -and $signatures.Count -gt 0));Add-Gate 'artifact-verification' ($(if($sigOk){'PASS'}else{'FAIL'})) ($(if($sigOk){0}else{1})) '' $true ([pscustomobject]@{artifacts=$artifacts.Count;requireSigning=[bool]$RequireSigning})
 }
}else{Add-Gate 'artifact-verification' 'SKIP' 0 '' $false 'Run with -VerifyArtifacts'}
$osInfo=$null;$computer=$null;$volumes=@();try{$o=Get-CimInstance Win32_OperatingSystem;$osInfo=[pscustomobject]@{caption=$o.Caption;version=$o.Version;build=$o.BuildNumber;lastBoot=$o.LastBootUpTime}}catch{};try{$c=Get-CimInstance Win32_ComputerSystem;$computer=[pscustomobject]@{manufacturer=$c.Manufacturer;model=$c.Model;ramBytes=[int64]$c.TotalPhysicalMemory;processors=$c.NumberOfLogicalProcessors}}catch{};try{$volumes=Get-Volume | Select-Object DriveLetter,FileSystemLabel,FileSystem,DriveType,HealthStatus,OperationalStatus,UniqueId,Size,SizeRemaining}catch{}
$requiredFailures=@($gates|Where-Object{$_.required -and $_.status -eq 'FAIL'});$overall=if($requiredFailures.Count){'FAIL'}else{'PASS'}
$report=[ordered]@{schemaVersion='workspace-agent-windows-certification-v1';workspaceAgentVersion=$pkg.version;createdAt=(Get-Date).ToUniversalTime().ToString('o');overall=$overall;runtime=[ordered]@{node=$actualNode;npm=$actualNpm;electron=$pkg.devDependencies.electron;arch=$env:PROCESSOR_ARCHITECTURE};os=$osInfo;computer=$computer;volumes=$volumes;options=[ordered]@{runScale=[bool]$RunScale;buildPackaged=[bool]$BuildPackaged;verifyArtifacts=[bool]$VerifyArtifacts;requireSigning=[bool]$RequireSigning};gates=$gates;artifacts=$artifacts;signatures=$signatures;manualEvidence=[ordered]@{actualPowerLoss='PENDING_MANUAL';sleepResume='covered-by-UAT';twoPhysicalVolumes=if($env:WA_CERT_ROOT_A -and $env:WA_CERT_ROOT_B){'REQUESTED'}else{'PENDING_ENV_ROOTS'}}}
$json=Join-Path $out 'certification-report.json';$report|ConvertTo-Json -Depth 10|Set-Content $json -Encoding utf8
$md=Join-Path $out 'certification-report.md';$lines=@("# Workspace Agent Windows Certification","","- Version: $($pkg.version)","- Overall: **$overall**","- Created: $($report.createdAt)","- Node/npm: $actualNode / $actualNpm","","## Gates","");foreach($g in $gates){$lines += "- $($g.status) — $($g.name)"};$lines += @("","## Boundary","","Actual hard power-loss remains manual evidence and is never triggered automatically by this harness.");$lines|Set-Content $md -Encoding utf8
Write-Host "Certification report: $json" -ForegroundColor Cyan
if($overall -ne 'PASS'){exit 1}
