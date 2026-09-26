param(
  [string]$RootA = $env:WA_CERT_ROOT_A,
  [string]$RootB = $env:WA_CERT_ROOT_B,
  [string]$ScaleRoot = $env:WA_CERT_SCALE_ROOT,
  [ValidateRange(10000,1000000)][int]$ScaleFiles = 1000000,
  [switch]$SkipScale,
  [switch]$NoBuildArtifacts,
  [switch]$RequireSigning,
  [string]$ManualEvidenceFile = '',
  [switch]$RequireManualEvidence,
  [string]$PeerWindowsReport = '',
  [switch]$PreflightOnly,
  [switch]$NoGenerateLockfile,
  [string]$OutputDir = 'certification-rc1'
)
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){Write-Error 'RC1 Certification Kit فقط روی Windows اجرا می‌شود.';exit 3}
Set-Location (Split-Path -Parent $PSScriptRoot)
$pkg=Get-Content package.json -Raw | ConvertFrom-Json
$stablePolicy=$pkg.workspaceAgentRelease.stableCertificationPolicy
$EffectiveRequireSigning=[bool]$RequireSigning -or [bool]$stablePolicy.requireAuthenticode
$RequiredScaleMatrix=@($stablePolicy.requiredScaleMatrix|ForEach-Object{[int]$_})
if($stablePolicy.mode -ne 'fail-closed' -or -not [bool]$stablePolicy.requireArtifacts -or -not [bool]$stablePolicy.requireDualWindows -or -not [bool]$stablePolicy.requireManualEvidence -or -not [bool]$stablePolicy.requireFinalBundle){throw 'Stable certification policy نامعتبر است.'}
if($SkipScale -and $RequiredScaleMatrix.Count -gt 0){throw 'STABLE_POLICY_SKIP_SCALE_FORBIDDEN'}
if($NoBuildArtifacts -and [bool]$stablePolicy.requireArtifacts){throw 'STABLE_POLICY_NO_BUILD_ARTIFACTS_FORBIDDEN'}
$stamp=(Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss-fff')+'-'+$PID
$sessionRel=Join-Path $OutputDir $stamp
$session=Join-Path (Get-Location) $sessionRel
New-Item -ItemType Directory -Path $session -Force | Out-Null
$transcript=Join-Path $session 'operator-transcript.log'
try{Start-Transcript -Path $transcript -Force | Out-Null}catch{}
$checks=New-Object System.Collections.Generic.List[object]
function Add-Check([string]$name,[string]$status,[object]$detail=$null){$checks.Add([pscustomobject]@{name=$name;status=$status;detail=$detail});Write-Host "$status $name" -ForegroundColor $(if($status -eq 'PASS'){'Green'}elseif($status -eq 'INCOMPLETE'){'Yellow'}else{'Red'})}
function Save-Preflight([string]$overall){
  $r=[ordered]@{schemaVersion='workspace-agent-rc1-certification-preflight-v2';version=$pkg.version;toolingRevision=$pkg.workspaceAgentRelease.toolingRevision;createdAt=(Get-Date).ToUniversalTime().ToString('o');overall=$overall;rootA=$RootA;rootB=$RootB;scaleRoot=$ScaleRoot;scaleMatrix=$RequiredScaleMatrix;checks=$checks}
  $p=Join-Path $session 'preflight-report.json';$r|ConvertTo-Json -Depth 8|Set-Content $p -Encoding utf8;return $p
}
function Resolve-NtfsRoot([string]$p,[string]$label){
  if(-not $p){throw "$label لازم است."}
  $rp=(Resolve-Path -LiteralPath $p -ErrorAction Stop).Path
  $root=[IO.Path]::GetPathRoot($rp)
  if(-not $root -or $root -notmatch '^[A-Za-z]:\\$'){throw "$label باید روی Drive Letter محلی Windows باشد: $rp"}
  $letter=$root.Substring(0,1)
  $v=Get-Volume -DriveLetter $letter -ErrorAction Stop
  if([string]$v.FileSystem -ne 'NTFS'){throw "$label باید NTFS باشد؛ فعلی: $($v.FileSystem)"}
  if(-not $v.UniqueId){throw "$label Volume UniqueId ندارد."}
  return [pscustomobject]@{input=$p;resolved=$rp;drive=$letter;uniqueId=[string]$v.UniqueId;fileSystem=[string]$v.FileSystem;driveType=[string]$v.DriveType;size=[int64]$v.Size;free=[int64]$v.SizeRemaining}
}
try{
  node scripts/verify-rc1-source.cjs | Out-Host
  if($LASTEXITCODE -ne 0){throw 'RC1 source contract failed.'}
  Add-Check 'rc1-source-contract' 'PASS'
  $expectedNode=(Get-Content .nvmrc -Raw).Trim();$actualNode=(node -p "process.versions.node").Trim();$expectedNpm=([string]$pkg.packageManager).Replace('npm@','');$actualNpm=(npm -v).Trim()
  if($actualNode -ne $expectedNode -or $actualNpm -ne $expectedNpm){Add-Check 'runtime-pins' 'FAIL' @{expectedNode=$expectedNode;actualNode=$actualNode;expectedNpm=$expectedNpm;actualNpm=$actualNpm};throw 'Node/npm release lane mismatch.'}
  Add-Check 'runtime-pins' 'PASS' @{node=$actualNode;npm=$actualNpm}
  $os=Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  $windowsFamily=if([string]$os.Caption -match 'Windows 11'){'Windows11'}elseif([string]$os.Caption -match 'Windows 10'){'Windows10'}else{'UNKNOWN'}
  if($windowsFamily -eq 'UNKNOWN'){Add-Check 'windows-family' 'FAIL' @{caption=$os.Caption;build=$os.BuildNumber};throw 'RC1 release matrix فقط Windows 10 و Windows 11 client را می‌پذیرد.'}
  Add-Check 'windows-family' 'PASS' @{family=$windowsFamily;caption=$os.Caption;build=$os.BuildNumber}
  $a=Resolve-NtfsRoot $RootA 'RootA';$b=Resolve-NtfsRoot $RootB 'RootB'
  if($a.uniqueId -eq $b.uniqueId){Add-Check 'distinct-ntfs-volumes' 'FAIL' @{rootA=$a;rootB=$b};throw 'RootA و RootB باید روی دو Volume واقعی متفاوت باشند.'}
  Add-Check 'distinct-ntfs-volumes' 'PASS' @{rootA=$a;rootB=$b}
  if(-not $ScaleRoot){$ScaleRoot=$RootA}
  $s=Resolve-NtfsRoot $ScaleRoot 'ScaleRoot'
  $minScaleFree=30GB
  if(-not $SkipScale -and $s.free -lt $minScaleFree){Add-Check 'scale-free-space' 'FAIL' @{requiredBytes=$minScaleFree;freeBytes=$s.free;matrix=$RequiredScaleMatrix};throw 'فضای آزاد ScaleRoot برای ماتریس 100k + 1M کافی نیست.'}
  Add-Check 'scale-free-space' 'PASS' @{requiredBytes=if($SkipScale){0}else{$minScaleFree};freeBytes=$s.free;matrix=if($SkipScale){@()}else{$RequiredScaleMatrix}}
  if($EffectiveRequireSigning -and -not ($env:CSC_LINK -or $env:WIN_CSC_LINK)){Add-Check 'signing-config' 'FAIL';throw 'RequireSigning فعال است ولی CSC_LINK/WIN_CSC_LINK وجود ندارد.'}
  Add-Check 'signing-config' 'PASS' @{required=[bool]$EffectiveRequireSigning;configured=[bool]($env:CSC_LINK -or $env:WIN_CSC_LINK)}
  if($RequireManualEvidence){
    if(-not $ManualEvidenceFile){Add-Check 'manual-evidence' 'FAIL';throw 'ManualEvidenceFile لازم است.'}
    node scripts/verify-manual-evidence-rc1.cjs $ManualEvidenceFile --require-all | Out-Host
    if($LASTEXITCODE -ne 0){Add-Check 'manual-evidence' 'FAIL';throw 'Manual evidence RC1 ناقص یا نامعتبر است.'}
    Add-Check 'manual-evidence' 'PASS' @{file=$ManualEvidenceFile}
  }else{Add-Check 'manual-evidence' 'PASS' @{required=$false}}
  if($PeerWindowsReport){if(-not (Test-Path -LiteralPath $PeerWindowsReport)){Add-Check 'peer-windows-report' 'FAIL' @{file=$PeerWindowsReport};throw 'Peer Windows certification report پیدا نشد.'};Add-Check 'peer-windows-report' 'PASS' @{file=$PeerWindowsReport}}
  else{Add-Check 'peer-windows-report' 'PASS' @{provided=$false;note='First OS run can proceed, but final envelope remains INCOMPLETE until the other Windows family report is supplied.'}}
  $fpBefore=(node scripts/source-tree-fingerprint.cjs | ConvertFrom-Json)
  if(-not $fpBefore.sha256){Add-Check 'frozen-source-fingerprint' 'FAIL';throw 'Source fingerprint generation failed before lockfile resolution.'}
  Add-Check 'frozen-source-fingerprint' 'PASS' @{schemaVersion=$fpBefore.schemaVersion;scope=$fpBefore.scope;sha256=$fpBefore.sha256;files=$fpBefore.files}
  if(-not (Test-Path package-lock.json)){
    if($NoGenerateLockfile){Add-Check 'package-lock' 'INCOMPLETE' 'package-lock.json missing and generation disabled';$pre=Save-Preflight 'INCOMPLETE';Write-Host "Preflight INCOMPLETE: $pre" -ForegroundColor Yellow;exit 2}
    $registry=(npm config get registry).Trim();$ping=& npm ping --registry $registry --fetch-retries=0 --fetch-timeout=10000 2>&1;$pingCode=$LASTEXITCODE;$ping|Set-Content (Join-Path $session 'npm-registry-ping.log') -Encoding utf8
    if($pingCode -ne 0){Add-Check 'npm-registry' 'INCOMPLETE' @{registry=$registry};$pre=Save-Preflight 'INCOMPLETE';Write-Host "npm registry unavailable. $pre" -ForegroundColor Yellow;exit 2}
    Add-Check 'npm-registry' 'PASS' @{registry=$registry}
    npm run release:lock | Out-Host
    if($LASTEXITCODE -ne 0){Add-Check 'package-lock' 'FAIL';throw 'package-lock generation failed.'}
  }
  node scripts/verify-release-inputs.cjs | Out-Host
  if($LASTEXITCODE -ne 0){Add-Check 'package-lock' 'FAIL';throw 'package-lock integrity gate failed.'}
  $lockHash=(Get-FileHash package-lock.json -Algorithm SHA256).Hash.ToLowerInvariant();Add-Check 'package-lock' 'PASS' @{sha256=$lockHash}
  $fpAfter=(node scripts/source-tree-fingerprint.cjs | ConvertFrom-Json)
  if([string]$fpAfter.sha256 -ne [string]$fpBefore.sha256 -or [int]$fpAfter.files -ne [int]$fpBefore.files){Add-Check 'source-lockfile-invariance' 'FAIL' @{before=$fpBefore;after=$fpAfter};throw 'Frozen Source fingerprint changed after package-lock resolution.'}
  Add-Check 'source-lockfile-invariance' 'PASS' @{sha256=$fpAfter.sha256;files=$fpAfter.files;lockfileExcluded=$true}
  $identityPath=Join-Path $session 'release-identity.json';$identityLines=& node scripts/release-identity.cjs "--out=$identityPath" 2>&1;$identityCode=$LASTEXITCODE;$identityLines|Set-Content (Join-Path $session 'release-identity.log') -Encoding utf8
  if($identityCode -ne 0 -or -not(Test-Path $identityPath)){Add-Check 'release-identity' 'FAIL' @{log=(Join-Path $session 'release-identity.log')};throw 'Release identity generation failed.'}
  $releaseIdentity=Get-Content $identityPath -Raw|ConvertFrom-Json
  if([string]$releaseIdentity.sourceFingerprint.sha256 -ne [string]$fpBefore.sha256 -or [string]$releaseIdentity.packageLock.sha256 -ne [string]$lockHash){Add-Check 'release-identity' 'FAIL' @{identity=$releaseIdentity};throw 'Release identity does not bind the exact frozen source and package-lock.'}
  Add-Check 'release-identity' 'PASS' @{releaseIdentitySha256=$releaseIdentity.releaseIdentitySha256;sourceFingerprint=$fpBefore.sha256;packageLockSha256=$lockHash}
  $pre=Save-Preflight 'PASS';Write-Host "Preflight PASS: $pre" -ForegroundColor Green
  if($PreflightOnly){exit 0}
  $certOut=Join-Path $sessionRel 'windows-runs'
  $args=@('-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/windows-certification-v097.ps1','-RootA',$a.resolved,'-RootB',$b.resolved,'-ScaleRoot',$s.resolved,'-ScaleFiles',[string]$ScaleFiles,'-OutputDir',$certOut)
  if(-not $SkipScale){$args+='-RunScale'}
  if(-not $NoBuildArtifacts){$args+='-BuildArtifacts'}
  if($EffectiveRequireSigning){$args+='-RequireSigning'}
  if($ManualEvidenceFile){$args+=@('-ManualEvidenceFile',$ManualEvidenceFile)}
  if($RequireManualEvidence){$args+='-RequireManualEvidence'}
  $certLog=Join-Path $session 'windows-certification.log'
  $certLines=& powershell.exe @args 2>&1;$certCode=$LASTEXITCODE;$certLines|Set-Content $certLog -Encoding utf8
  $certRoot=Join-Path (Get-Location) $certOut
  $report=Get-ChildItem $certRoot -Recurse -Filter 'certification-report.json' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  if(-not $report){Add-Check 'windows-certification' 'FAIL' @{exitCode=$certCode;log=$certLog;certRoot=$certRoot};throw 'Certification report همین session پیدا نشد.'}
  $certJson=Get-Content $report.FullName -Raw|ConvertFrom-Json
  $certStatus=[string]$certJson.overall
  Add-Check 'windows-certification' $certStatus @{exitCode=$certCode;report=$report.FullName;evidenceId=$certJson.evidenceId;windowsFamily=$certJson.windowsFamily}
  $releaseManifest=Join-Path (Get-Location) 'release\release-manifest.json'
  if(-not $NoBuildArtifacts){$rmArgs=@('scripts/verify-release-manifest-rc1.cjs');if($EffectiveRequireSigning){$rmArgs+='--require-signing'};$rmLines=& node @rmArgs 2>&1;$rmCode=$LASTEXITCODE;$rmLines|Set-Content (Join-Path $session 'release-manifest-verification.log') -Encoding utf8;if($rmCode -ne 0){Add-Check 'release-manifest' 'FAIL' @{file=$releaseManifest};throw 'Release manifest/artifact contract verification failed in RC1 orchestrator.'};Add-Check 'release-manifest' 'PASS' @{file=$releaseManifest}}
  $envOut=Join-Path $session 'rc1-certification-envelope.json'
  $envArgs=@('scripts/rc1-certification-envelope.cjs',"--report=$($report.FullName)","--out=$envOut",'--require-dual-windows')
  if(-not $NoBuildArtifacts){$envArgs+="--release-manifest=$releaseManifest"}
  if($PeerWindowsReport){$envArgs+="--peer-report=$PeerWindowsReport"}
  if(-not $NoBuildArtifacts){$envArgs+='--require-artifacts'}
  if($EffectiveRequireSigning){$envArgs+='--require-signing'}
  if($ManualEvidenceFile){$envArgs+="--manual-evidence=$ManualEvidenceFile"}
  $envArgs+='--require-manual-evidence'
  $envLines=& node @envArgs 2>&1;$envCode=$LASTEXITCODE;$envLines|Set-Content (Join-Path $session 'envelope.log') -Encoding utf8
  $envelope=if(Test-Path $envOut){Get-Content $envOut -Raw|ConvertFrom-Json}else{$null}
  $releaseManifestSnapshot=$null;$shaSumsSnapshot=$null;$peerSnapshot=$null;$peerSnapshotDir=$null;$currentEvidenceBundle=Join-Path $report.Directory.FullName 'evidence-bundle.json'
  if(Test-Path $releaseManifest){$releaseManifestSnapshot=Join-Path $session 'release-manifest.snapshot.json';Copy-Item -LiteralPath $releaseManifest -Destination $releaseManifestSnapshot -Force}
  $shaSums=Join-Path (Get-Location) 'release\SHA256SUMS.txt';if(Test-Path $shaSums){$shaSumsSnapshot=Join-Path $session 'SHA256SUMS.snapshot.txt';Copy-Item -LiteralPath $shaSums -Destination $shaSumsSnapshot -Force}
  if($PeerWindowsReport -and (Test-Path -LiteralPath $PeerWindowsReport)){$peerSourceDir=Split-Path -Parent (Resolve-Path -LiteralPath $PeerWindowsReport).Path;$peerSnapshotDir=Join-Path $session 'peer-windows-evidence';New-Item -ItemType Directory -Path $peerSnapshotDir -Force|Out-Null;Copy-Item -Path (Join-Path $peerSourceDir '*') -Destination $peerSnapshotDir -Recurse -Force;$peerSnapshot=Join-Path $peerSnapshotDir (Split-Path -Leaf $PeerWindowsReport)}
  $overall=if($certCode -eq 1 -or $envCode -eq 1){'FAIL'}elseif($certCode -ne 0 -or $envCode -ne 0){'INCOMPLETE'}else{'PASS'}
  $final=[ordered]@{schemaVersion='workspace-agent-rc1-certification-kit-result-v4';version=$pkg.version;toolingRevision=$pkg.workspaceAgentRelease.toolingRevision;createdAt=(Get-Date).ToUniversalTime().ToString('o');overall=$overall;windowsFamily=$windowsFamily;peerWindowsReport=if($PeerWindowsReport){$PeerWindowsReport}else{$null};peerWindowsReportSnapshot=$peerSnapshot;peerWindowsEvidenceSnapshotDir=$peerSnapshotDir;preflight=$pre;certificationReport=$report.FullName;certificationEvidenceBundle=if(Test-Path $currentEvidenceBundle){$currentEvidenceBundle}else{$null};certificationEvidenceId=$certJson.evidenceId;envelope=$envOut;envelopeEvidenceId=if($envelope){$envelope.evidenceId}else{$null};packageLockSha256=$lockHash;releaseIdentitySha256=$releaseIdentity.releaseIdentitySha256;releaseManifest=if(Test-Path $releaseManifest){$releaseManifest}else{$null};releaseManifestSnapshot=$releaseManifestSnapshot;sha256SumsSnapshot=$shaSumsSnapshot;transcript=$transcript}
  $finalPath=Join-Path $session 'rc1-certification-result.json';$final|ConvertTo-Json -Depth 8|Set-Content $finalPath -Encoding utf8
  Write-Host "RC1 Certification Kit: $overall" -ForegroundColor $(if($overall -eq 'PASS'){'Green'}elseif($overall -eq 'INCOMPLETE'){'Yellow'}else{'Red'})
  Write-Host "Result: $finalPath"
  if($overall -eq 'FAIL'){exit 1};if($overall -eq 'INCOMPLETE'){exit 2};exit 0
}catch{
  $err=$_.Exception.Message;Add-Check 'orchestrator' 'FAIL' @{error=$err};$pre=Save-Preflight 'FAIL';Write-Error "$err`nReport: $pre";exit 1
}finally{try{Stop-Transcript|Out-Null}catch{}}
