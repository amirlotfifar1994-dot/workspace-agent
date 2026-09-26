param(
  [switch]$RequireSigning,
  [switch]$SkipInstall,
  [switch]$RunScaleUat,
  [string]$ManualEvidenceFile = '',
  [string]$PrimaryCertificationReport = '',
  [switch]$RequireManualEvidence
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'این release script فقط روی Windows اجرا می‌شود.' }
Set-Location (Split-Path -Parent $PSScriptRoot)
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$stablePolicy=$pkg.workspaceAgentRelease.stableCertificationPolicy
$EffectiveRequireSigning=[bool]$RequireSigning -or [bool]$stablePolicy.requireAuthenticode
$RequiredScaleMatrix=@($stablePolicy.requiredScaleMatrix|ForEach-Object{[int]$_})
$EffectiveRunScaleUat=[bool]$RunScaleUat -or $RequiredScaleMatrix.Count -gt 0
Write-Host "Workspace Agent $($pkg.version) reproducible release gate" -ForegroundColor Cyan
Write-Host "Node: $(node -v) / npm: $(npm -v)"
$expectedNode=(Get-Content .nvmrc -Raw).Trim()
$actualNode=(node -p "process.versions.node").Trim()
$expectedNpm=([string]$pkg.packageManager).Replace('npm@','')
$actualNpm=(npm -v).Trim()
if($actualNode -ne $expectedNode){throw "Release Node mismatch: expected $expectedNode, got $actualNode"}
if($actualNpm -ne $expectedNpm){throw "Release npm mismatch: expected $expectedNpm, got $actualNpm"}
node scripts/verify-rc1-source.cjs
if ($LASTEXITCODE -ne 0) { throw 'RC1 source contract verification failed.' }
node scripts/verify-release-inputs.cjs
if ($LASTEXITCODE -ne 0) { throw 'Release inputs/lockfile verification failed.' }
$allowedRegistries=@($pkg.workspaceAgentRelease.dependencySourcePolicy.allowedRegistryOrigins);if($allowedRegistries.Count -ne 1){throw 'cert-kit21 requires exactly one approved npm registry origin.'}
$approvedRegistry=([string]$allowedRegistries[0]).TrimEnd('/');$configuredRegistry=([string](npm config get registry)).Trim().TrimEnd('/');if($LASTEXITCODE -ne 0 -or $configuredRegistry -ne $approvedRegistry){throw "npm registry provenance mismatch. Expected=$approvedRegistry Actual=$configuredRegistry"}
node scripts/lockfile-provenance.cjs --out=certification/lockfile-provenance.json
if($LASTEXITCODE -ne 0){throw 'Lockfile dependency provenance verification failed.'}
$lockProvenance=Get-Content certification/lockfile-provenance.json -Raw|ConvertFrom-Json
if (-not $SkipInstall) {
  npm ci --no-audit --no-fund --registry=$approvedRegistry
  if ($LASTEXITCODE -ne 0) { throw 'npm ci dependency install failed.' }
}
if ($EffectiveRequireSigning -and -not ($env:CSC_LINK -or $env:WIN_CSC_LINK)) { throw 'Code signing required است ولی CSC_LINK/WIN_CSC_LINK تنظیم نشده.' }
if ($RequireManualEvidence) {
  if (-not $ManualEvidenceFile) { throw 'Manual certification evidence file is required.' }
  if ($pkg.version -eq '1.0.0-rc1' -and -not $PrimaryCertificationReport) { throw 'Primary certification report is required for RC1 manual evidence binding.' }
  $manualVerifier=if($pkg.version -eq '1.0.0-rc1'){'scripts/verify-manual-evidence-rc1.cjs'}else{'scripts/verify-manual-evidence-v097.cjs'}
  if($pkg.version -eq '1.0.0-rc1'){ node $manualVerifier $ManualEvidenceFile --require-all "--primary-report=$PrimaryCertificationReport" } else { node $manualVerifier $ManualEvidenceFile --require-all }
  if ($LASTEXITCODE -ne 0) { throw 'Manual certification evidence is incomplete/failed.' }
}
if (Test-Path release) { Remove-Item release -Recurse -Force }
npm run check; if ($LASTEXITCODE -ne 0) { throw 'Regression gate failed.' }
npm run test:windows-uia-uat; if ($LASTEXITCODE -ne 0) { throw 'Windows UIA UAT failed.' }
npm run test:windows-index-uat; if ($LASTEXITCODE -ne 0) { throw 'Windows Index UAT failed.' }
npm run test:windows-production-uat; if ($LASTEXITCODE -ne 0) { throw 'Windows Production UAT failed.' }
npm run test:windows-verification-uat; if ($LASTEXITCODE -ne 0) { throw 'Windows long-path/reparse/package verification UAT failed.' }
npm run test:windows-system-resilience-uat; if ($LASTEXITCODE -ne 0) { throw 'Windows system/volume resilience UAT failed.' }
npm run test:windows-multiroot-uat; if ($LASTEXITCODE -ne 0) { throw 'Windows multi-root UAT failed.' }

$oldStrict=$env:WA_CERT_STRICT;$env:WA_CERT_STRICT='1'
try {
  npm run test:windows-certification-v097-uat; if ($LASTEXITCODE -ne 0) { throw 'Windows v0.9.7 two-volume NTFS certification UAT failed/incomplete.' }
} finally { $env:WA_CERT_STRICT=$oldStrict }
$scaleUatCounts=@()
if ($EffectiveRunScaleUat) {
  $oldStrict2=$env:WA_CERT_STRICT; $oldScale=$env:WA_CERT_SCALE_FILES; $env:WA_CERT_STRICT='1'
  try {
    $scaleUatCounts=if($pkg.version -eq '1.0.0-rc1'){$RequiredScaleMatrix}else{@(100000)}
    foreach($count in $scaleUatCounts){
      $env:WA_CERT_SCALE_FILES=[string]$count
      npm run test:windows-scale-v097-uat; if ($LASTEXITCODE -ne 0) { throw "Windows scale UAT failed/incomplete for $count files." }
    }
  } finally { $env:WA_CERT_STRICT=$oldStrict2; $env:WA_CERT_SCALE_FILES=$oldScale }
}
npm run build; if ($LASTEXITCODE -ne 0) { throw 'Vite build failed.' }
npm run pack:win:dir; if ($LASTEXITCODE -ne 0) { throw 'win-unpacked build failed.' }
$workerPath = Join-Path (Get-Location) 'release\win-unpacked\resources\app.asar.unpacked\electron\services\hash-worker.cjs'
if (-not (Test-Path $workerPath)) { throw "Packaged worker missing: $workerPath" }
node tests/packaged-worker-smoke-v082.cjs $workerPath; if ($LASTEXITCODE -ne 0) { throw 'Packaged Worker smoke test failed.' }
$packagedExe=(Get-ChildItem 'release\win-unpacked' -Filter '*.exe' -File | Select-Object -First 1).FullName
if (-not $packagedExe) { throw 'Packaged app executable not found.' }
node tests/packaged-app-smoke-v084.cjs $packagedExe; if ($LASTEXITCODE -ne 0) { throw 'Packaged application startup smoke failed.' }
npm run pack:win; if ($LASTEXITCODE -ne 0) { throw 'Windows NSIS/Portable build failed.' }
$expectedArtifacts=@(
  [pscustomobject]@{kind='nsis';arch='x64';file="Workspace-Agent-Setup-$($pkg.version)-x64.exe"},
  [pscustomobject]@{kind='portable';arch='x64';file="Workspace-Agent-Portable-$($pkg.version)-x64.exe"}
)
$artifacts=@()
foreach($e in $expectedArtifacts){
  $m=@(Get-ChildItem release -File -ErrorAction SilentlyContinue|Where-Object{$_.Name -eq $e.file})
  if($m.Count -ne 1){throw "Release artifact contract failed for $($e.kind): expected exactly one $($e.file), got $($m.Count)"}
  $artifacts += [pscustomobject]@{kind=$e.kind;arch=$e.arch;file=$m[0].Name;path=$m[0].FullName;bytes=$m[0].Length}
}
$signatures=@();
foreach($a in $artifacts){
  $sig=Get-AuthenticodeSignature $a.path
  $signatures += [pscustomobject]@{file=$a.file;status=[string]$sig.Status;subject=if($sig.SignerCertificate){$sig.SignerCertificate.Subject}else{$null};thumbprint=if($sig.SignerCertificate){$sig.SignerCertificate.Thumbprint}else{$null}}
  if($EffectiveRequireSigning -and $sig.Status -ne 'Valid'){throw "Signature verification failed: $($a.file) => $($sig.Status)"}
}
$rows = foreach ($a in $artifacts) { $h=Get-FileHash $a.path -Algorithm SHA256; [pscustomobject]@{kind=$a.kind;arch=$a.arch;file=$a.file;bytes=$a.bytes;sha256=$h.Hash.ToLowerInvariant()} }
$rows | ForEach-Object { "$($_.sha256)  $($_.file)" } | Set-Content release\SHA256SUMS.txt -Encoding ascii
$lockHash=(Get-FileHash package-lock.json -Algorithm SHA256).Hash.ToLowerInvariant()
$fpJson=(node scripts/source-tree-fingerprint.cjs | ConvertFrom-Json)
$releaseIdentity=(node scripts/release-identity.cjs | ConvertFrom-Json)
if(-not $releaseIdentity.releaseIdentitySha256){throw 'Release identity generation failed.'}
$os=$null;$wf='UNKNOWN';try{$os=Get-CimInstance Win32_OperatingSystem;$wf=if([string]$os.Caption -match 'Windows 11'){'Windows11'}elseif([string]$os.Caption -match 'Windows 10'){'Windows10'}else{'UNKNOWN'}}catch{}
$manifest=[ordered]@{
  schemaVersion='workspace-agent-release-v10';version=$pkg.version;toolingRevision=$pkg.workspaceAgentRelease.toolingRevision;featureFreeze=[bool]$pkg.workspaceAgentRelease.featureFreeze;createdAt=(Get-Date).ToUniversalTime().ToString('o');
  node=(node -v);npm=(npm -v);packageManager=$pkg.packageManager;packageLockSha256=$lockHash;sourceFingerprint=$fpJson.sha256;sourceFiles=$fpJson.files;releaseIdentitySha256=$releaseIdentity.releaseIdentitySha256;dependencySourcePolicy=$pkg.workspaceAgentRelease.dependencySourcePolicy;dependencySourcePolicySha256=$lockProvenance.dependencySourcePolicySha256;stableCertificationPolicy=$stablePolicy;stableCertificationPolicySha256=$releaseIdentity.stableCertificationPolicy.sha256;resolvedRegistryOrigins=@($lockProvenance.resolvedOrigins);scaleMatrix=$RequiredScaleMatrix;electron=$pkg.devDependencies.electron;architecture='x64';builderWindowsFamily=$wf;builderOs=if($os){[ordered]@{caption=$os.Caption;version=$os.Version;build=$os.BuildNumber}}else{$null};
  signingRequired=[bool]$EffectiveRequireSigning;signingConfigured=[bool]($env:CSC_LINK -or $env:WIN_CSC_LINK);systemResilienceUat=$true;twoVolumeCertUat=$true;scaleUat=[bool]$EffectiveRunScaleUat;scaleUatCounts=$scaleUatCounts;manualEvidenceRequired=[bool]$RequireManualEvidence;signatures=$signatures;artifacts=$rows
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content release\release-manifest.json -Encoding utf8
$verifyArgs=@('scripts/verify-release-manifest-rc1.cjs');if($EffectiveRequireSigning){$verifyArgs+='--require-signing'}
node @verifyArgs
if($LASTEXITCODE -ne 0){throw 'Release manifest/artifact contract verification failed.'}
Write-Host 'Artifact release gate PASS (Stable promotion still requires dual-Windows + manual evidence + final bundle).' -ForegroundColor Green
$rows | Format-Table -AutoSize
$signatures | Format-Table -AutoSize
