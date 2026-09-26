$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'این اسکریپت برای release workflow ویندوز نوشته شده است.' }
Set-Location (Split-Path -Parent $PSScriptRoot)
Write-Host 'Generating deterministic npm lockfile from exact top-level pins...' -ForegroundColor Cyan
node scripts/verify-release-inputs.cjs --pins-only
if ($LASTEXITCODE -ne 0) { throw 'Top-level dependency pins invalid هستند.' }
$pkg=Get-Content package.json -Raw|ConvertFrom-Json
$allowed=@($pkg.workspaceAgentRelease.dependencySourcePolicy.allowedRegistryOrigins)
if($allowed.Count -ne 1){throw 'cert-kit21 release lock lane requires exactly one approved npm registry origin.'}
$expectedRegistry=([string]$allowed[0]).TrimEnd('/')
$configuredRegistry=([string](npm config get registry)).Trim().TrimEnd('/')
if($LASTEXITCODE -ne 0 -or $configuredRegistry -ne $expectedRegistry){throw "npm registry provenance mismatch. Expected=$expectedRegistry Actual=$configuredRegistry"}
Write-Host "Approved npm registry: $configuredRegistry" -ForegroundColor Cyan
if (Test-Path node_modules) { Write-Warning 'node_modules موجود است؛ package-lock-only همچنان registry resolution را انجام می‌دهد اما برای baseline تمیز بهتر است CI/clean clone استفاده شود.' }
npm install --package-lock-only --ignore-scripts --no-audit --no-fund --registry=$expectedRegistry
if ($LASTEXITCODE -ne 0) { throw 'package-lock generation failed.' }
node scripts/verify-release-inputs.cjs
if ($LASTEXITCODE -ne 0) { throw 'Generated package-lock verification failed.' }
$h=(Get-FileHash package-lock.json -Algorithm SHA256).Hash.ToLowerInvariant()
node scripts/lockfile-provenance.cjs --out=certification/lockfile-provenance.json
if ($LASTEXITCODE -ne 0) { throw 'Lockfile provenance/integrity verification failed.' }
Write-Host "package-lock.json SHA256: $h" -ForegroundColor Green
Write-Host 'Lockfile ساخته شد. قبل از Release آن را review و commit کنید.' -ForegroundColor Green
