param(
  [string]$RootA = $env:WA_CERT_ROOT_A,
  [string]$RootB = $env:WA_CERT_ROOT_B,
  [string]$ScaleRoot = $env:WA_CERT_SCALE_ROOT,
  [int]$ScaleFiles = 100000,
  [switch]$RunScale,
  [switch]$BuildArtifacts,
  [switch]$RequireSigning,
  [switch]$GenerateLockfile,
  [string]$ManualEvidenceFile = '',
  [switch]$RequireManualEvidence,
  [string]$OutputDir = 'certification'
)
$ErrorActionPreference='Continue'
if($env:OS -ne 'Windows_NT'){throw 'Windows certification v0.9.7 فقط روی Windows اجرا می‌شود.'}
Set-Location (Split-Path -Parent $PSScriptRoot)
$pkg=Get-Content package.json -Raw | ConvertFrom-Json
$stablePolicy=$pkg.workspaceAgentRelease.stableCertificationPolicy
$EffectiveRequireSigning=[bool]$RequireSigning -or [bool]$stablePolicy.requireAuthenticode
$RequiredScaleMatrix=@($stablePolicy.requiredScaleMatrix|ForEach-Object{[int]$_})
if($pkg.version -eq '1.0.0-rc1'){if($RequiredScaleMatrix.Count -gt 0 -and -not $RunScale){throw 'STABLE_POLICY_RUN_SCALE_REQUIRED'};if([bool]$stablePolicy.requireArtifacts -and -not $BuildArtifacts){throw 'STABLE_POLICY_BUILD_ARTIFACTS_REQUIRED'}}
$stamp=(Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss-fff')+'-'+$PID
$out=Join-Path (Get-Location) (Join-Path $OutputDir $stamp);New-Item -ItemType Directory -Path $out -Force | Out-Null
$gates=New-Object System.Collections.Generic.List[object]
function Add-Gate([string]$name,[string]$status,[bool]$required,[int]$exitCode,[string]$log,[object]$detail=$null){$gates.Add([pscustomobject]@{name=$name;status=$status;required=$required;exitCode=$exitCode;log=$log;detail=$detail})}
function Get-FileMeta([string]$p){if(-not $p -or -not (Test-Path -LiteralPath $p)){return $null};$f=Get-Item -LiteralPath $p;return [pscustomobject]@{bytes=[int64]$f.Length;sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}}
function Classify([int]$code,[string]$text,[bool]$required){
  if($code -eq 0){if($text -match '\bSKIP\b|PENDING_|PREREQ'){return $(if($required){'INCOMPLETE'}else{'SKIP'})};return 'PASS'}
  if($code -eq 3){return $(if($required){'INCOMPLETE'}else{'SKIP'})}
  if($text -match 'LOCKFILE_REQUIRED|MANUAL_EVIDENCE_INCOMPLETE'){return 'INCOMPLETE'}
  return 'FAIL'
}
function Run-NpmGate([string]$script,[bool]$required=$true,[hashtable]$envVars=@{},[string]$gateName=''){
  $name=if($gateName){$gateName}else{$script};$safe=$name.Replace(':','-').Replace('/','-').Replace('\\','-')
  $log=Join-Path $out ("gate-"+$safe+'.log');$old=@{}
  foreach($k in $envVars.Keys){$old[$k]=[Environment]::GetEnvironmentVariable($k,'Process');[Environment]::SetEnvironmentVariable($k,[string]$envVars[$k],'Process')}
  try{$lines=& npm run $script 2>&1;$code=$LASTEXITCODE;$text=($lines|Out-String);$lines|Set-Content $log -Encoding utf8;$status=Classify $code $text $required;$lm=Get-FileMeta $log;Add-Gate $name $status $required $code $log ([pscustomobject]@{logBytes=$lm.bytes;logSha256=$lm.sha256});Write-Host "$status $name" -ForegroundColor $(if($status -eq 'PASS'){'Green'}elseif($status -eq 'INCOMPLETE'){'Yellow'}else{'Red'});return $status}
  finally{foreach($k in $old.Keys){[Environment]::SetEnvironmentVariable($k,$old[$k],'Process')}}
}
function Run-NodeGate([string]$name,[string[]]$args,[bool]$required=$true){$log=Join-Path $out ("gate-"+$name+'.log');$lines=& node @args 2>&1;$code=$LASTEXITCODE;$text=($lines|Out-String);$lines|Set-Content $log -Encoding utf8;$status=Classify $code $text $required;$lm=Get-FileMeta $log;Add-Gate $name $status $required $code $log ([pscustomobject]@{logBytes=$lm.bytes;logSha256=$lm.sha256});return $status}

$expectedNode=(Get-Content .nvmrc -Raw).Trim();$actualNode=(node -p "process.versions.node").Trim();$expectedNpm=([string]$pkg.packageManager).Replace('npm@','');$actualNpm=(npm -v).Trim();$runtimeOk=($actualNode -eq $expectedNode -and $actualNpm -eq $expectedNpm);Add-Gate 'runtime-version' $(if($runtimeOk){'PASS'}else{'FAIL'}) $true $(if($runtimeOk){0}else{1}) '' ([pscustomobject]@{expectedNode=$expectedNode;actualNode=$actualNode;expectedNpm=$expectedNpm;actualNpm=$actualNpm})

Run-NpmGate 'check:dependency-pins' $true | Out-Null
Run-NpmGate 'check:source-hygiene' $true | Out-Null
if($GenerateLockfile){Run-NpmGate 'release:lock' $true | Out-Null}
Run-NpmGate 'check:release-inputs' $true | Out-Null
$lockProvenanceFile=Join-Path $out 'lockfile-provenance.json';Run-NodeGate 'lockfile-provenance' @('scripts/lockfile-provenance.cjs',"--out=$lockProvenanceFile") $true|Out-Null;$lockProvenance=$null;try{$lockProvenance=Get-Content $lockProvenanceFile -Raw|ConvertFrom-Json}catch{}
$allowedRegistries=@($pkg.workspaceAgentRelease.dependencySourcePolicy.allowedRegistryOrigins);$approvedRegistry=if($allowedRegistries.Count -eq 1){([string]$allowedRegistries[0]).TrimEnd('/')}else{''};$configuredRegistry=([string](npm config get registry)).Trim().TrimEnd('/');$registryOk=($approvedRegistry -and $configuredRegistry -eq $approvedRegistry);Add-Gate 'npm-registry-provenance' $(if($registryOk){'PASS'}else{'FAIL'}) $true $(if($registryOk){0}else{1}) '' ([pscustomobject]@{approved=$approvedRegistry;configured=$configuredRegistry})
$fpFile=Join-Path $out 'source-fingerprint.json';Run-NodeGate 'source-fingerprint' @('scripts/source-tree-fingerprint.cjs',"--out=$fpFile") $true | Out-Null
$sourceFingerprint=$null;try{$sourceFingerprint=Get-Content $fpFile -Raw|ConvertFrom-Json}catch{}
$packageLockSha256=$null
if(Test-Path package-lock.json){try{$packageLockSha256=(Get-FileHash package-lock.json -Algorithm SHA256).Hash.ToLowerInvariant()}catch{}}
$releaseIdentity=$null;$releaseIdentitySha256=$null
$identityFile=Join-Path $out 'release-identity.json';$identityLines=& node scripts/release-identity.cjs "--out=$identityFile" 2>&1;$identityCode=$LASTEXITCODE;$identityText=($identityLines|Out-String);$identityLines|Set-Content (Join-Path $out 'gate-release-identity.log') -Encoding utf8
if($identityCode -eq 0 -and (Test-Path $identityFile)){try{$releaseIdentity=Get-Content $identityFile -Raw|ConvertFrom-Json;$releaseIdentitySha256=[string]$releaseIdentity.releaseIdentitySha256;Add-Gate 'release-identity' 'PASS' $true 0 $identityFile ([pscustomobject]@{releaseIdentitySha256=$releaseIdentitySha256;sourceFingerprint=$releaseIdentity.sourceFingerprint.sha256;packageLockSha256=$releaseIdentity.packageLock.sha256})}catch{Add-Gate 'release-identity' 'FAIL' $true 1 $identityFile $_.Exception.Message}}else{Add-Gate 'release-identity' (Classify $identityCode $identityText $true) $true $identityCode $identityFile $identityText}
if(($gates|Where-Object{$_.name -eq 'check:release-inputs' -and $_.status -eq 'PASS'}).Count){
  $installLog=Join-Path $out 'gate-npm-ci.log';$lines=& npm ci --no-audit --no-fund --registry=$approvedRegistry 2>&1;$code=$LASTEXITCODE;$lines|Set-Content $installLog -Encoding utf8;Add-Gate 'npm-ci' $(if($code -eq 0){'PASS'}else{'FAIL'}) $true $code $installLog $null
}else{Add-Gate 'npm-ci' 'INCOMPLETE' $true 3 '' 'release inputs are not complete'}
Run-NpmGate 'check' $true | Out-Null

$uatEnv=@{WA_CERT_STRICT='1';WA_CERT_ROOT_A=$RootA;WA_CERT_ROOT_B=$RootB;WA_CERT_RESULT=(Join-Path $out 'windows-certification-v097-uat.json')}
Run-NpmGate 'test:windows-certification-v097-uat' $true $uatEnv | Out-Null
$nativeEnv=@{WA_CERT_STRICT='1';WA_CERT_ROOT_A=$RootA;WA_CERT_ROOT_B=$RootB;WA_CERT_RESULT=(Join-Path $out 'windows-native-edge-rc1-uat.json')}
Run-NpmGate 'test:windows-native-edge-rc1-uat' $true $nativeEnv | Out-Null
$transportEnv=@{WA_CERT_STRICT='1';WA_CERT_SAFE_HANDOFF_RESULT=(Join-Path $out 'windows-safe-handoff-transport-rc1-uat.json')}
Run-NpmGate 'test:windows-safe-handoff-transport-rc1-uat' $true $transportEnv | Out-Null
$ntfsEnv=@{WA_CERT_STRICT='1';WA_CERT_ROOT_A=$RootA;WA_CERT_ROOT_B=$RootB;WA_CERT_NTFS_RESULT=(Join-Path $out 'windows-ntfs-metadata-rc1-uat.json')}
Run-NpmGate 'test:windows-ntfs-metadata-rc1-uat' $true $ntfsEnv | Out-Null
$aiProvEnv=@{WA_CERT_STRICT='1';WA_LLAMA_SERVER_PATH=$env:WA_LLAMA_SERVER_PATH;WA_LLAMA_SERVER_EXPECTED_SHA256=$env:WA_LLAMA_SERVER_EXPECTED_SHA256;WA_LLAMA_SERVER_EXPECTED_SIGNER_THUMBPRINT=$env:WA_LLAMA_SERVER_EXPECTED_SIGNER_THUMBPRINT;WA_CERT_LOCAL_AI_PROVENANCE_RESULT=(Join-Path $out 'windows-local-ai-provenance-rc1-uat.json')}
Run-NpmGate 'test:windows-local-ai-provenance-rc1-uat' $true $aiProvEnv | Out-Null
$scaleMatrix=@()
if($RunScale){
  $scaleMatrix=if($pkg.version -eq '1.0.0-rc1'){$RequiredScaleMatrix}else{@([Math]::Max(10000,[Math]::Min(1000000,$ScaleFiles)))}
  foreach($count in $scaleMatrix){
    $label=if($count -ge 1000000){'1m'}elseif($count -ge 100000){'100k'}else{"$count"}
    $scaleEnv=@{WA_CERT_STRICT='1';WA_CERT_SCALE_ROOT=$(if($ScaleRoot){$ScaleRoot}else{$RootA});WA_CERT_SCALE_FILES=[string]$count;WA_CERT_RESULT=(Join-Path $out "windows-scale-v097-$label-uat.json")}
    Run-NpmGate 'test:windows-scale-v097-uat' $true $scaleEnv "test:windows-scale-v097-uat-$label" | Out-Null
  }
}else{Add-Gate 'test:windows-scale-v097-uat-100k' 'INCOMPLETE' $true 3 '' 'Run certification with -RunScale';if($pkg.version -eq '1.0.0-rc1'){Add-Gate 'test:windows-scale-v097-uat-1m' 'INCOMPLETE' $true 3 '' 'RC1 requires both 100k and 1M scale evidence'}}

if($ManualEvidenceFile){$log=Join-Path $out 'gate-manual-evidence.log';$manualVerifier=if($pkg.version -eq '1.0.0-rc1'){'scripts/verify-manual-evidence-rc1.cjs'}else{'scripts/verify-manual-evidence-v097.cjs'};$args=@($manualVerifier,$ManualEvidenceFile);if($RequireManualEvidence){$args+='--require-all'};$lines=& node @args 2>&1;$code=$LASTEXITCODE;$text=($lines|Out-String);$lines|Set-Content $log -Encoding utf8;$status=Classify $code $text $RequireManualEvidence;if(!$RequireManualEvidence -and $text -match 'INCOMPLETE'){$status='SKIP'};Add-Gate 'manual-evidence' $status ([bool]$RequireManualEvidence) $code $log $text}
else{Add-Gate 'manual-evidence' $(if($RequireManualEvidence){'INCOMPLETE'}else{'SKIP'}) ([bool]$RequireManualEvidence) 3 '' 'manual evidence file not provided'}

$artifacts=@();$signatures=@();$releaseManifestSha256=$null
if($BuildArtifacts){
  if(Test-Path release){Remove-Item release -Recurse -Force -ErrorAction Stop};Add-Gate 'artifact-clean-room' 'PASS' $true 0 '' 'release directory reset before packaging'
  Run-NpmGate 'build' $true | Out-Null;Run-NpmGate 'pack:win:dir' $true | Out-Null
  $worker=Join-Path (Get-Location) 'release\win-unpacked\resources\app.asar.unpacked\electron\services\hash-worker.cjs';if(Test-Path $worker){Run-NodeGate 'packaged-worker-smoke' @('tests/packaged-worker-smoke-v082.cjs',$worker) $true|Out-Null}else{Add-Gate 'packaged-worker-smoke' 'FAIL' $true 2 '' "missing $worker"}
  $exe=(Get-ChildItem 'release\win-unpacked' -Filter '*.exe' -File -ErrorAction SilentlyContinue|Select-Object -First 1).FullName;if($exe){Run-NodeGate 'packaged-app-smoke' @('tests/packaged-app-smoke-v084.cjs',$exe) $true|Out-Null}else{Add-Gate 'packaged-app-smoke' 'FAIL' $true 2 '' 'win-unpacked exe missing'}
  Run-NpmGate 'pack:win' $true | Out-Null
  $expected=@(
    [pscustomobject]@{kind='nsis';arch='x64';file="Workspace-Agent-Setup-$($pkg.version)-x64.exe"},
    [pscustomobject]@{kind='portable';arch='x64';file="Workspace-Agent-Portable-$($pkg.version)-x64.exe"}
  )
  $artifactErrors=@()
  foreach($e in $expected){
    $matches=@(Get-ChildItem release -File -ErrorAction SilentlyContinue|Where-Object{$_.Name -eq $e.file})
    if($matches.Count -ne 1){$artifactErrors += "$($e.kind): expected exactly one $($e.file), found $($matches.Count)";continue}
    $f=$matches[0];$h=Get-FileHash $f.FullName -Algorithm SHA256;$sig=Get-AuthenticodeSignature $f.FullName
    $artifacts += [pscustomobject]@{kind=$e.kind;arch=$e.arch;file=$f.Name;bytes=$f.Length;sha256=$h.Hash.ToLowerInvariant()}
    $signatures += [pscustomobject]@{file=$f.Name;status=[string]$sig.Status;subject=if($sig.SignerCertificate){$sig.SignerCertificate.Subject}else{$null};thumbprint=if($sig.SignerCertificate){$sig.SignerCertificate.Thumbprint}else{$null}}
  }
  if($artifactErrors.Count){Add-Gate 'artifact-contract' 'FAIL' $true 2 '' $artifactErrors}else{Add-Gate 'artifact-contract' 'PASS' $true 0 '' @{required=@($expected|ForEach-Object{$_.file})}}
  $sigOk=(!$EffectiveRequireSigning -or (($signatures|Where-Object{$_.status -ne 'Valid'}).Count -eq 0 -and $signatures.Count -eq $expected.Count));Add-Gate 'artifact-signature' $(if($sigOk){'PASS'}else{'FAIL'}) $true $(if($sigOk){0}else{1}) '' ([pscustomobject]@{requireSigning=[bool]$EffectiveRequireSigning;count=$signatures.Count})
  if(-not $artifactErrors.Count){
    $artifacts|ForEach-Object{"$($_.sha256)  $($_.file)"}|Set-Content 'release\SHA256SUMS.txt' -Encoding ascii
    $ro=$null;$rf='UNKNOWN';try{$ro=Get-CimInstance Win32_OperatingSystem;$rf=if([string]$ro.Caption -match 'Windows 11'){'Windows11'}elseif([string]$ro.Caption -match 'Windows 10'){'Windows10'}else{'UNKNOWN'}}catch{}
    $manifest=[ordered]@{
      schemaVersion='workspace-agent-release-v10';version=$pkg.version;toolingRevision=$pkg.workspaceAgentRelease.toolingRevision;featureFreeze=[bool]$pkg.workspaceAgentRelease.featureFreeze;createdAt=(Get-Date).ToUniversalTime().ToString('o');
      node=(node -v);npm=(npm -v);packageManager=$pkg.packageManager;packageLockSha256=$packageLockSha256;sourceFingerprint=if($sourceFingerprint){$sourceFingerprint.sha256}else{$null};sourceFiles=if($sourceFingerprint){$sourceFingerprint.files}else{0};releaseIdentitySha256=$releaseIdentitySha256;dependencySourcePolicy=$pkg.workspaceAgentRelease.dependencySourcePolicy;dependencySourcePolicySha256=if($lockProvenance){$lockProvenance.dependencySourcePolicySha256}else{$null};resolvedRegistryOrigins=if($lockProvenance){@($lockProvenance.resolvedOrigins)}else{@()};stableCertificationPolicy=$stablePolicy;stableCertificationPolicySha256=if($releaseIdentity){$releaseIdentity.stableCertificationPolicy.sha256}else{$null};electron=$pkg.devDependencies.electron;architecture='x64';
      builderWindowsFamily=$rf;builderOs=if($ro){[ordered]@{caption=$ro.Caption;version=$ro.Version;build=$ro.BuildNumber}}else{$null};scaleMatrix=$scaleMatrix;signingRequired=[bool]$EffectiveRequireSigning;signatures=$signatures;artifacts=$artifacts
    }
    $manifestPath=Join-Path (Get-Location) 'release\release-manifest.json';$manifest|ConvertTo-Json -Depth 10|Set-Content $manifestPath -Encoding utf8
    $manifestArgs=@('scripts/verify-release-manifest-rc1.cjs');if($EffectiveRequireSigning){$manifestArgs+='--require-signing'};Run-NodeGate 'release-manifest-contract' $manifestArgs $true|Out-Null
    if(Test-Path $manifestPath){$releaseManifestSha256=(Get-FileHash $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()}
  }else{Add-Gate 'release-manifest-contract' 'FAIL' $true 2 '' 'artifact contract failed before manifest generation'}
}else{Add-Gate 'packaged-release' 'INCOMPLETE' $true 3 '' 'Run certification with -BuildArtifacts'}

$evidenceBundlePath=Join-Path $out 'evidence-bundle.json';$bundleLines=& node scripts/certification-evidence-bundle.cjs --session=$out --out=$evidenceBundlePath 2>&1;$bundleCode=$LASTEXITCODE
$evidenceBundle=$null;if($bundleCode -eq 0 -and (Test-Path $evidenceBundlePath)){try{$bundleCli=($bundleLines|Out-String)|ConvertFrom-Json;$evidenceBundle=[ordered]@{file='evidence-bundle.json';bytes=[int64]$bundleCli.bytes;sha256=[string]$bundleCli.sha256;files=[int]$bundleCli.files;aggregateSha256=[string]$bundleCli.aggregateSha256};Add-Gate 'evidence-bundle' 'PASS' $true 0 $evidenceBundlePath $evidenceBundle}catch{Add-Gate 'evidence-bundle' 'FAIL' $true 1 $evidenceBundlePath $_.Exception.Message}}else{Add-Gate 'evidence-bundle' 'FAIL' $true $bundleCode $evidenceBundlePath ($bundleLines|Out-String)}
$requiredFail=@($gates|Where-Object{$_.required -and $_.status -eq 'FAIL'});$requiredIncomplete=@($gates|Where-Object{$_.required -and $_.status -in @('INCOMPLETE','SKIP','PENDING_MANUAL')});$overall=if($requiredFail.Count){'FAIL'}elseif($requiredIncomplete.Count){'INCOMPLETE'}else{'PASS'}
$osInfo=$null;$computer=$null;$volumes=@();$windowsFamily='UNKNOWN';try{$o=Get-CimInstance Win32_OperatingSystem;$osInfo=[pscustomobject]@{caption=$o.Caption;version=$o.Version;build=$o.BuildNumber;lastBoot=$o.LastBootUpTime};if([string]$o.Caption -match 'Windows 11'){$windowsFamily='Windows11'}elseif([string]$o.Caption -match 'Windows 10'){$windowsFamily='Windows10'}}catch{};try{$c=Get-CimInstance Win32_ComputerSystem;$computer=[pscustomobject]@{manufacturer=$c.Manufacturer;model=$c.Model;ramBytes=[int64]$c.TotalPhysicalMemory;processors=$c.NumberOfLogicalProcessors}}catch{};try{$volumes=Get-Volume|Select-Object DriveLetter,FileSystemLabel,FileSystem,DriveType,HealthStatus,OperationalStatus,UniqueId,Size,SizeRemaining}catch{}
$summary=[ordered]@{PASS=@($gates|Where-Object status -eq 'PASS').Count;FAIL=@($gates|Where-Object status -eq 'FAIL').Count;INCOMPLETE=@($gates|Where-Object status -eq 'INCOMPLETE').Count;SKIP=@($gates|Where-Object status -eq 'SKIP').Count}
$report=[ordered]@{schemaVersion='workspace-agent-windows-certification-v5';workspaceAgentVersion=$pkg.version;toolingRevision=$pkg.workspaceAgentRelease.toolingRevision;featureFreeze=[bool]$pkg.workspaceAgentRelease.featureFreeze;createdAt=(Get-Date).ToUniversalTime().ToString('o');overall=$overall;summary=$summary;sourceFingerprint=$sourceFingerprint;packageLockSha256=$packageLockSha256;releaseIdentitySha256=$releaseIdentitySha256;evidenceBundle=$evidenceBundle;windowsFamily=$windowsFamily;runtime=[ordered]@{node=$actualNode;npm=$actualNpm;electron=$pkg.devDependencies.electron;arch=$env:PROCESSOR_ARCHITECTURE};os=$osInfo;computer=$computer;volumes=$volumes;options=[ordered]@{rootA=$RootA;rootB=$RootB;runScale=[bool]$RunScale;scaleFilesRequested=$ScaleFiles;scaleMatrix=$scaleMatrix;buildArtifacts=[bool]$BuildArtifacts;requireSigning=[bool]$EffectiveRequireSigning;requireManualEvidence=[bool]$RequireManualEvidence};gates=$gates;artifacts=$artifacts;signatures=$signatures;releaseManifestSha256=$releaseManifestSha256}
$withoutId=$report|ConvertTo-Json -Depth 12 -Compress;$sha=[System.Security.Cryptography.SHA256]::Create();$bytes=[Text.Encoding]::UTF8.GetBytes($withoutId);$report['evidenceId']=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant();$sha.Dispose()
$json=Join-Path $out 'certification-report.json';$report|ConvertTo-Json -Depth 12|Set-Content $json -Encoding utf8
$md=Join-Path $out 'certification-report.md';$lines=@("# Workspace Agent Windows Certification","","- Version: $($pkg.version)","- Overall: **$overall**","- Windows family: **$windowsFamily**","- Evidence ID: $($report.evidenceId)","- Created: $($report.createdAt)","","## Gates","");foreach($g in $gates){$lines += "- $($g.status) — $($g.name)"};$lines += @("","## Rule","","A required SKIP/PENDING prerequisite is INCOMPLETE, never PASS. Actual destructive evidence is never auto-triggered.");$lines|Set-Content $md -Encoding utf8
Write-Host "Certification: $overall — $json" -ForegroundColor $(if($overall -eq 'PASS'){'Green'}elseif($overall -eq 'INCOMPLETE'){'Yellow'}else{'Red'})
if($overall -eq 'FAIL'){exit 1};if($overall -eq 'INCOMPLETE'){exit 2};exit 0
