param(
  [ValidateSet('Status','Doctor','Recover','Resume','Primary','Peer','PrepareEvidence','Finalize')][string]$Mode='Status',
  [string]$RootA=$env:WA_CERT_ROOT_A,
  [string]$RootB=$env:WA_CERT_ROOT_B,
  [string]$ScaleRoot=$env:WA_CERT_SCALE_ROOT,
  [string]$ExecutionId='',
  [string]$ExecutionRoot='rc1-execution',
  [string]$HandoffZip='',
  [string]$PeerReturnZip='',
  [string]$ManualEvidenceFile='',
  [string]$EvidenceOut='',
  [string]$Operator='',
  [switch]$SkipScale,
  [switch]$RequireSigning,
  [switch]$NoGenerateLockfile
)
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){Write-Error 'Windows RC1 Execution Kit فقط روی Windows اجرا می‌شود.';exit 3}
Set-Location (Split-Path -Parent $PSScriptRoot)
$project=(Get-Location).Path
$pkg=Get-Content package.json -Raw|ConvertFrom-Json
if($pkg.version -ne '1.0.0-rc1' -or $pkg.workspaceAgentRelease.toolingRevision -ne 'cert-kit21'){throw 'Execution Kit فقط برای v1.0.0-rc1 / cert-kit21 معتبر است.'}
$stablePolicy=$pkg.workspaceAgentRelease.stableCertificationPolicy
$EffectiveRequireSigning=[bool]$RequireSigning -or [bool]$stablePolicy.requireAuthenticode
$RequiredScaleMatrix=@($stablePolicy.requiredScaleMatrix|ForEach-Object{[int]$_})
if($SkipScale -and $RequiredScaleMatrix.Count -gt 0){throw 'STABLE_POLICY_SKIP_SCALE_FORBIDDEN'}
function New-ExecutionId { return (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss-fff')+'-'+$env:COMPUTERNAME }
function Assert-ExecutionId([string]$id){if(-not $id -or $id.Length -gt 128 -or $id -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$' -or $id -in @('.','..')){throw 'ExecutionId نامعتبر است؛ فقط A-Z/a-z/0-9/._- و حداکثر 128 کاراکتر مجاز است.'};return $id}
function Get-WindowsFamily { $o=Get-CimInstance Win32_OperatingSystem -ErrorAction Stop; if([string]$o.Caption -match 'Windows 11'){return 'Windows11'};if([string]$o.Caption -match 'Windows 10'){return 'Windows10'};return 'UNKNOWN' }
function Resolve-ExecutionRoot([string]$value){
  if(-not $value){$value='rc1-execution'}
  $candidate=if([IO.Path]::IsPathRooted($value)){[IO.Path]::GetFullPath($value)}else{[IO.Path]::GetFullPath((Join-Path $project $value))}
  $projectFull=[IO.Path]::GetFullPath($project).TrimEnd('\');$candidateFull=$candidate.TrimEnd('\');$allowedInside=Join-Path $project 'rc1-execution'
  $guardLines=& node scripts/path-trust-boundary.cjs "--source-root=$projectFull" "--target=$candidateFull" "--allow-inside-exact=$allowedInside" 2>&1;$guardCode=$LASTEXITCODE
  if($guardCode -ne 0){throw "ExecutionRoot trust-boundary failed: $($guardLines|Out-String)"}
  return $candidateFull
}
function Write-State([string]$dir,[string]$stage,[string]$overall,[string]$next,[hashtable]$paths=@{},[object]$detail=$null){
  New-Item -ItemType Directory -Path $dir -Force|Out-Null
  $previousStateSha256=$null;$existing=Join-Path $dir 'execution-state.json';if(Test-Path -LiteralPath $existing){try{$previousStateSha256=[string]((Get-Content -LiteralPath $existing -Raw|ConvertFrom-Json).stateSha256)}catch{$previousStateSha256=$null}}
  $state=[ordered]@{schemaVersion='workspace-agent-rc1-execution-state-v2';executionId=$ExecutionId;version=$pkg.version;toolingRevision=$pkg.workspaceAgentRelease.toolingRevision;updatedAt=(Get-Date).ToUniversalTime().ToString('o');windowsFamily=Get-WindowsFamily;stage=$stage;overall=$overall;previousStateSha256=$previousStateSha256;nextStep=$next;paths=$paths;detail=$detail}
  $hashInput=Join-Path $dir ('.execution-state-hash-'+[guid]::NewGuid().ToString('N')+'.json');try{$state|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $hashInput -Encoding utf8;$stateSha=(& node scripts/rc1-execution-recovery.cjs "--hash-state-file=$hashInput").Trim();if($LASTEXITCODE -ne 0 -or $stateSha -notmatch '^[a-f0-9]{64}$'){throw 'Canonical execution state hashing failed.'};$state['stateSha256']=$stateSha}finally{Remove-Item -LiteralPath $hashInput -Force -ErrorAction SilentlyContinue}
  $p=Join-Path $dir 'execution-state.json';$tmp=$p+'.tmp-'+[guid]::NewGuid().ToString('N');$state|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $tmp -Encoding utf8;Move-Item -LiteralPath $tmp -Destination $p -Force
  $history=Join-Path $dir 'execution-history.jsonl';($state|ConvertTo-Json -Depth 12 -Compress)|Add-Content -LiteralPath $history -Encoding utf8
  Write-Host "[$overall] $stage" -ForegroundColor $(if($overall -eq 'PASS'){'Green'}elseif($overall -eq 'INCOMPLETE'){'Yellow'}else{'Red'});Write-Host "State: $p";return $p
}
function Run-Doctor([string]$report){
  $args=@('-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/windows-rc1-doctor.ps1','-RootA',$RootA,'-RootB',$RootB,'-OutputFile',$report)
  if($ScaleRoot){$args+=@('-ScaleRoot',$ScaleRoot)};if($SkipScale){$args+='-SkipScale'};if($EffectiveRequireSigning){$args+='-RequireSigning'}
  & powershell.exe @args;return $LASTEXITCODE
}
function Zip-Directory([string]$source,[string]$zip){if(Test-Path $zip){Remove-Item $zip -Force};Compress-Archive -Path (Join-Path $source '*') -DestinationPath $zip -CompressionLevel Optimal -Force;$hash=(Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant();Set-Content ($zip+'.sha256') "$hash  $(Split-Path -Leaf $zip)" -Encoding ascii;return $hash}
function Expand-Clean([string]$zip,[string]$dest){
  if(-not (Test-Path -LiteralPath $zip -PathType Leaf)){throw "ZIP پیدا نشد: $zip"}
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows-safe-archive-expand.ps1 -Archive $zip -Destination $dest|Out-Host
  if($LASTEXITCODE -ne 0){throw 'Safe Handoff ZIP expansion failed before trust verification.'}
}
function Verify-Staged-Handoff([string]$dir){
  $manifest=Join-Path $dir 'handoff-manifest.json';$incoming=Join-Path $dir 'package-lock.json'
  if(-not(Test-Path -LiteralPath $incoming -PathType Leaf)){throw 'Handoff package-lock.json ندارد.'}
  node scripts/rc1-execution-handoff.cjs --verify "--dir=$dir" "--manifest=$manifest" --no-source-check|Out-Host
  if($LASTEXITCODE -ne 0){throw 'Handoff internal integrity/pointer verification failed before any Source mutation.'}
  node scripts/verify-release-inputs.cjs "--lockfile=$incoming"|Out-Host
  if($LASTEXITCODE -ne 0){throw 'Staged Handoff package-lock release-input gate را پاس نکرد.'}
  node scripts/rc1-execution-handoff.cjs --verify "--dir=$dir" "--manifest=$manifest" "--lockfile=$incoming"|Out-Host
  if($LASTEXITCODE -ne 0){throw 'Handoff source/release identity verification with staged lock failed before Source mutation.'}
}
function Ensure-ImportedLock([string]$importDir){
  $incoming=Join-Path $importDir 'package-lock.json';if(-not (Test-Path -LiteralPath $incoming -PathType Leaf)){throw 'Handoff package-lock.json ندارد.'}
  $target=Join-Path $project 'package-lock.json'
  if(Test-Path -LiteralPath $target){
    $ti=Get-Item -LiteralPath $target -Force;if(($ti.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Source package-lock.json نمی‌تواند reparse/symlink باشد.'}
    $a=(Get-FileHash -LiteralPath $incoming -Algorithm SHA256).Hash;$b=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash;if($a -ne $b){throw 'package-lock موجود با Handoff یکسان نیست.'}
  }else{
    $tmp=Join-Path $project ('.package-lock.importing-'+[guid]::NewGuid().ToString('N')+'.json')
    try{Copy-Item -LiteralPath $incoming -Destination $tmp -Force;node scripts/verify-release-inputs.cjs "--lockfile=$tmp"|Out-Host;if($LASTEXITCODE -ne 0){throw 'Atomic staged package-lock validation failed.'};Move-Item -LiteralPath $tmp -Destination $target -Force}finally{Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue}
  }
  node scripts/verify-release-inputs.cjs|Out-Host;if($LASTEXITCODE -ne 0){throw 'Imported package-lock release-input gate را پاس نکرد.'}
}
function Verify-Handoff([string]$dir){node scripts/rc1-execution-handoff.cjs --verify "--dir=$dir" "--manifest=$(Join-Path $dir 'handoff-manifest.json')"|Out-Host;if($LASTEXITCODE -ne 0){throw 'Handoff integrity/source verification failed.'}}
function Find-Pointer([string]$dir,[string]$name){$p=Join-Path $dir $name;if(-not(Test-Path $p)){throw "Pointer پیدا نشد: $p"};return (Get-Content $p -Raw|ConvertFrom-Json)}
function Rel([string]$base,[string]$target){$b=[IO.Path]::GetFullPath($base);if(-not $b.EndsWith('\')){$b+='\'};$t=[IO.Path]::GetFullPath($target);$bu=New-Object -TypeName System.Uri -ArgumentList $b;$tu=New-Object -TypeName System.Uri -ArgumentList $t;return [Uri]::UnescapeDataString($bu.MakeRelativeUri($tu).ToString()).Replace('/','\')}
function Copy-ManualEvidenceBundle([string]$manualFile,[string]$finalDir){
  $manualAbs=(Resolve-Path -LiteralPath $manualFile).Path;$manualBase=Split-Path -Parent $manualAbs;$bundle=Join-Path $finalDir 'manual-evidence';if(Test-Path -LiteralPath $bundle){Remove-Item -LiteralPath $bundle -Recurse -Force};New-Item -ItemType Directory -Path $bundle -Force|Out-Null
  Copy-Item -LiteralPath $manualAbs -Destination (Join-Path $bundle 'MANUAL_EVIDENCE.final.json') -Force
  $doc=Get-Content -LiteralPath $manualAbs -Raw|ConvertFrom-Json;$copied=@()
  foreach($prop in $doc.evidence.PSObject.Properties){$ref=[string]$prop.Value.attachment;if(-not $ref){continue};if([IO.Path]::IsPathRooted($ref)){throw 'Manual evidence attachment باید relative باشد.'};$src=[IO.Path]::GetFullPath((Join-Path $manualBase $ref));$baseFull=[IO.Path]::GetFullPath($manualBase).TrimEnd('\')+'\';if(-not $src.StartsWith($baseFull,[StringComparison]::OrdinalIgnoreCase)){throw 'Manual evidence attachment از evidence directory خارج می‌شود.'};if(-not(Test-Path -LiteralPath $src -PathType Leaf)){throw "Manual evidence attachment پیدا نشد: $ref"};$dst=[IO.Path]::GetFullPath((Join-Path $bundle $ref));$bundleFull=[IO.Path]::GetFullPath($bundle).TrimEnd('\')+'\';if(-not $dst.StartsWith($bundleFull,[StringComparison]::OrdinalIgnoreCase)){throw 'Manual evidence attachment destination نامعتبر است.'};New-Item -ItemType Directory -Path (Split-Path -Parent $dst) -Force|Out-Null;Copy-Item -LiteralPath $src -Destination $dst -Force;$copied+=$ref}
  return [pscustomobject]@{directory=$bundle;attachments=$copied}
}
function Test-PhaseReadiness([string]$result,[ValidateSet('primary','peer')][string]$role,[string]$out){
  & node scripts/rc1-phase-readiness.cjs "--result=$result" "--role=$role" "--out=$out"|Out-Host
  return $LASTEXITCODE
}
function Get-RecoveryPlan([string]$exec){
  $planPath=Join-Path $exec 'recovery-plan.json'
  & node scripts/rc1-execution-recovery.cjs "--dir=$exec" "--out=$planPath"|Out-Host
  $code=$LASTEXITCODE;if(-not(Test-Path -LiteralPath $planPath)){throw 'Recovery plan ساخته نشد.'}
  $plan=Get-Content -LiteralPath $planPath -Raw|ConvertFrom-Json
  return [pscustomobject]@{code=$code;path=$planPath;plan=$plan}
}
function Archive-RecoveryInvalidations([string]$exec,[object]$plan){
  $items=@($plan.invalidatePaths);if($items.Count -eq 0){return}
  $execFull=[IO.Path]::GetFullPath($exec).TrimEnd('\')+'\';$stamp=(Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss-fff');$archiveRoot=Join-Path $exec ('recovery-invalidated\'+$stamp);New-Item -ItemType Directory -Path $archiveRoot -Force|Out-Null
  foreach($item in $items){if(-not $item){continue};$full=[IO.Path]::GetFullPath([string]$item);if(-not $full.StartsWith($execFull,[StringComparison]::OrdinalIgnoreCase)){throw 'Recovery invalidation path خارج Execution root است.'};$leaf=Split-Path -Leaf $full;if($leaf -notin @('primary-certification','peer-certification')){throw "Recovery فقط phase output شناخته‌شده را archive می‌کند: $leaf"};if(Test-Path -LiteralPath $full){Move-Item -LiteralPath $full -Destination (Join-Path $archiveRoot $leaf) -Force}}
  Write-State $exec 'RECOVERY_INVALIDATED_PARTIAL' 'INCOMPLETE' 'Rerun only the invalidated certification phase.' @{archiveRoot=$archiveRoot} @{planSha256=$plan.planSha256;invalidated=@($items)}|Out-Null
}

$rootAbs=Resolve-ExecutionRoot $ExecutionRoot;New-Item -ItemType Directory -Path $rootAbs -Force|Out-Null
if($ExecutionId){Assert-ExecutionId $ExecutionId|Out-Null}
if($Mode -eq 'Doctor'){
  if(-not $ExecutionId){$ExecutionId=New-ExecutionId};Assert-ExecutionId $ExecutionId|Out-Null;$exec=Join-Path $rootAbs $ExecutionId;New-Item -ItemType Directory -Path $exec -Force|Out-Null
  $doctorReport=Join-Path $exec 'doctor-report.json';Write-State $exec 'DOCTOR_RUNNING' 'INCOMPLETE' 'Validate Windows certification prerequisites.' @{doctorReport=$doctorReport} $null|Out-Null
  $code=Run-Doctor $doctorReport
  if($code -eq 0){Write-State $exec 'DOCTOR_READY' 'PASS' 'Run Primary on this Windows family.' @{doctorReport=$doctorReport} $null|Out-Null;exit 0}
  Write-State $exec 'DOCTOR_BLOCKED' $(if($code -eq 2){'INCOMPLETE'}else{'FAIL'}) 'Fix Doctor findings before Primary.' @{doctorReport=$doctorReport} @{exitCode=$code}|Out-Null;exit $(if($code -eq 2){2}else{1})
}

if($Mode -eq 'Status'){
  $state=$null
  if($ExecutionId){$p=Join-Path (Join-Path $rootAbs $ExecutionId) 'execution-state.json';if(Test-Path $p){$state=$p}}
  else{$state=(Get-ChildItem $rootAbs -Recurse -Filter execution-state.json -File -ErrorAction SilentlyContinue|Sort-Object LastWriteTimeUtc -Descending|Select-Object -First 1).FullName}
  if(-not $state){Write-Host 'هیچ Execution State پیدا نشد.' -ForegroundColor Yellow;exit 2};Get-Content $state -Raw|Write-Host;exit 0
}

$resumeAction=''
if($Mode -in @('Recover','Resume')){
  if(-not $ExecutionId){throw '-ExecutionId برای Recover/Resume لازم است.'};Assert-ExecutionId $ExecutionId|Out-Null;$exec=Join-Path $rootAbs $ExecutionId;if(-not(Test-Path -LiteralPath $exec -PathType Container)){throw "Execution پیدا نشد: $exec"}
  $recovery=Get-RecoveryPlan $exec;$plan=$recovery.plan
  if($Mode -eq 'Recover'){Get-Content -LiteralPath $recovery.path -Raw|Write-Host;exit $(if($recovery.code -eq 0){0}else{1})}
  if([string]$plan.action -like 'BLOCK_*'){Write-State $exec 'RECOVERY_BLOCKED' 'FAIL' 'Repair execution-state/history integrity before any resume.' @{recoveryPlan=$recovery.path} @{action=$plan.action;reason=$plan.reason;planSha256=$plan.planSha256}|Out-Null;exit 1}
  Write-State $exec 'RECOVERY_PLANNED' 'INCOMPLETE' 'Apply the bounded recovery plan.' @{recoveryPlan=$recovery.path} @{action=$plan.action;reason=$plan.reason;planSha256=$plan.planSha256}|Out-Null
  switch([string]$plan.action){
    'PROMOTION_COMPLETE' { Write-State $exec 'PROMOTE_ALLOWED' 'PASS' 'Final promotion evidence was already complete and was recovered without rerunning certification.' @{decision=$plan.context.decisionPath;verdict=$plan.context.verdictPath;finalDelivery=$plan.context.delivery;finalDeliverySha256=$plan.context.deliverySha256} @{recovered=$true;planSha256=$plan.planSha256}|Out-Null;exit 0 }
    'PRIMARY_COMPLETE_AWAIT_PEER' { Write-State $exec 'PRIMARY_READY' 'PASS' 'Primary handoff is already complete; continue on the other Windows family.' @{primaryHandoff=$plan.context.primaryHandoff;primaryHandoffDir=$plan.context.primaryHandoffDir} @{recovered=$true;planSha256=$plan.planSha256}|Out-Null;exit 0 }
    'PEER_COMPLETE_RETURN_TO_PRIMARY' { Write-State $exec 'PEER_READY' 'PASS' 'Peer return is already complete; return it to the Primary machine.' @{peerReturn=$plan.context.peerReturn;peerReturnDir=$plan.context.peerReturnDir} @{recovered=$true;planSha256=$plan.planSha256}|Out-Null;exit 0 }
    'RESUME_PRIMARY_HANDOFF' { $resumeAction='RESUME_PRIMARY_HANDOFF';$Mode='Primary' }
    'RERUN_PRIMARY_CERTIFICATION' { Archive-RecoveryInvalidations $exec $plan;$resumeAction='RERUN_PRIMARY_CERTIFICATION';$Mode='Primary' }
    'RESUME_PEER_RETURN' { if(-not $HandoffZip){$HandoffZip=[string]$plan.context.primaryHandoff};if(-not $HandoffZip){throw 'Recovery plan برای Peer مسیر Primary handoff ندارد.'};$resumeAction='RESUME_PEER_RETURN';$Mode='Peer' }
    'RERUN_PEER_CERTIFICATION' { if(-not $HandoffZip){$HandoffZip=[string]$plan.context.primaryHandoff};if(-not $HandoffZip){throw 'Recovery plan برای Peer مسیر Primary handoff ندارد.'};Archive-RecoveryInvalidations $exec $plan;$resumeAction='RERUN_PEER_CERTIFICATION';$Mode='Peer' }
    'RESUME_FINALIZE' { if(-not $HandoffZip){$HandoffZip=[string]$plan.context.primaryHandoff};if(-not $PeerReturnZip){$PeerReturnZip=[string]$plan.context.peerReturn};if(-not $ManualEvidenceFile){$ManualEvidenceFile=[string]$plan.context.manualEvidence};if(-not $HandoffZip -or -not $PeerReturnZip -or -not $ManualEvidenceFile){throw 'Recovery plan برای Finalize ورودی‌های کامل ثبت‌شده ندارد.'};$resumeAction='RESUME_FINALIZE';$Mode='Finalize' }
    default { throw "Recovery action پشتیبانی نمی‌شود: $($plan.action)" }
  }
}

if($Mode -eq 'Primary'){
  if(-not $ExecutionId){$ExecutionId=New-ExecutionId};Assert-ExecutionId $ExecutionId|Out-Null;$exec=Join-Path $rootAbs $ExecutionId;New-Item -ItemType Directory -Path $exec -Force|Out-Null
  $doctorReport=Join-Path $exec 'doctor-primary.json'
  if($resumeAction -eq 'RESUME_PRIMARY_HANDOFF'){Write-State $exec 'PRIMARY_CERTIFICATION_REUSED' 'PASS' 'Reuse the already complete Primary PASS boundary; rebuild only handoff packaging.' @{} @{recovery=$true}|Out-Null}
  else{
    $doctorCode=Run-Doctor $doctorReport;if($doctorCode -ne 0){Write-State $exec 'PRIMARY_BLOCKED_DOCTOR' $(if($doctorCode -eq 2){'INCOMPLETE'}else{'FAIL'}) 'Fix Doctor findings before Primary.' @{doctorReport=$doctorReport} @{exitCode=$doctorCode}|Out-Null;exit $(if($doctorCode -eq 2){2}else{1})}
    Write-State $exec 'PRIMARY_RUNNING' 'INCOMPLETE' 'Wait for primary Windows certification.' @{doctorReport=$doctorReport} $null|Out-Null
    $outRel=Rel $project (Join-Path $exec 'primary-certification')
    $args=@('-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/windows-rc1-certify.ps1','-RootA',$RootA,'-RootB',$RootB,'-OutputDir',$outRel)
    if($ScaleRoot){$args+=@('-ScaleRoot',$ScaleRoot)};if($SkipScale){$args+='-SkipScale'};if($EffectiveRequireSigning){$args+='-RequireSigning'};if($NoGenerateLockfile){$args+='-NoGenerateLockfile'}
    & powershell.exe @args;$code=$LASTEXITCODE;if($code -eq 1){Write-State $exec 'PRIMARY_FAILED' 'FAIL' 'Fix the failed gate and rerun Primary.' @{} @{exitCode=$code}|Out-Null;exit 1};if($code -notin @(0,2)){Write-State $exec 'PRIMARY_FAILED' 'FAIL' 'Unexpected certification exit code.' @{} @{exitCode=$code}|Out-Null;exit 1}
  }
  $result=Get-ChildItem (Join-Path $exec 'primary-certification') -Recurse -Filter 'rc1-certification-result.json' -File|Sort-Object LastWriteTimeUtc -Descending|Select-Object -First 1;if(-not $result){throw 'Primary rc1-certification-result.json پیدا نشد.'}
  $phaseReadiness=Join-Path $exec 'primary-phase-readiness.json';$phaseCode=Test-PhaseReadiness $result.FullName 'primary' $phaseReadiness;if($phaseCode -ne 0){Write-State $exec 'PRIMARY_INCOMPLETE' 'INCOMPLETE' 'Primary phase is not safely handoff-ready; only expected dual/manual incompleteness is allowed.' @{phaseReadiness=$phaseReadiness} @{orchestratorExitCode=$code;phaseExitCode=$phaseCode}|Out-Null;exit 2};Write-State $exec 'PRIMARY_PHASE_READY' 'PASS' 'Primary certification report/evidence are PASS; expected Final-only incompleteness does not block Handoff.' @{phaseReadiness=$phaseReadiness} @{orchestratorExitCode=$code}|Out-Null
  $rj=Get-Content $result.FullName -Raw|ConvertFrom-Json;$report=[string]$rj.certificationReport;if(-not(Test-Path $report)){throw 'Primary certification report missing.'};$cj=Get-Content $report -Raw|ConvertFrom-Json;if([string]$cj.overall -ne 'PASS'){throw "Primary certification report باید PASS باشد؛ فعلی: $($cj.overall)"}
  $releaseManifest=Join-Path $project 'release\release-manifest.json';if(-not(Test-Path $releaseManifest)){throw 'Primary release-manifest.json پیدا نشد.'}
  $rmArgs=@('scripts/verify-release-manifest-rc1.cjs',"--manifest=$releaseManifest");if($EffectiveRequireSigning){$rmArgs+='--require-signing'};& node @rmArgs|Out-Host;if($LASTEXITCODE -ne 0){Write-State $exec 'PRIMARY_RELEASE_MANIFEST_INVALID' 'FAIL' 'Release manifest/artifacts changed or failed verification after certification; do not build Handoff.' @{releaseManifest=$releaseManifest;phaseReadiness=$phaseReadiness} $null|Out-Null;exit 1}
  $handoff=Join-Path $exec 'primary-handoff';if(Test-Path $handoff){Remove-Item $handoff -Recurse -Force};New-Item -ItemType Directory -Path $handoff -Force|Out-Null
  $evidenceDir=Join-Path $handoff 'primary-evidence';Copy-Item -Path (Join-Path (Split-Path -Parent $report) '*') -Destination (New-Item -ItemType Directory -Path $evidenceDir -Force).FullName -Recurse -Force
  $releaseDir=Join-Path $handoff 'release';New-Item -ItemType Directory -Path $releaseDir -Force|Out-Null;Get-ChildItem (Join-Path $project 'release') -File|Where-Object{$_.Extension -eq '.exe' -or $_.Name -in @('release-manifest.json','SHA256SUMS.txt')}|Copy-Item -Destination $releaseDir -Force
  Copy-Item (Join-Path $project 'package-lock.json') (Join-Path $handoff 'package-lock.json') -Force
  $manual=Join-Path $handoff 'MANUAL_EVIDENCE.prefilled.json';$prefillArgs=@('scripts/prefill-manual-evidence-rc1.cjs',"--release-manifest=$(Join-Path $releaseDir 'release-manifest.json')","--primary-report=$report","--out=$manual","--execution-id=$ExecutionId");if($Operator){$prefillArgs+="--operator=$Operator"};& node @prefillArgs|Out-Host;if($LASTEXITCODE -ne 0){throw 'Manual evidence prefill failed.'}
  $pointer=[ordered]@{schemaVersion='workspace-agent-rc1-primary-pointer-v1';executionId=$ExecutionId;windowsFamily=$cj.windowsFamily;createdAt=(Get-Date).ToUniversalTime().ToString('o');certificationReport=Rel $handoff (Join-Path $evidenceDir 'certification-report.json');evidenceBundle=Rel $handoff (Join-Path $evidenceDir 'evidence-bundle.json');releaseManifest='release/release-manifest.json';sha256Sums='release/SHA256SUMS.txt';manualEvidenceTemplate='MANUAL_EVIDENCE.prefilled.json';packageLock='package-lock.json';certificationEvidenceId=$cj.evidenceId}
  $pointerPath=Join-Path $handoff 'primary-pointer.json';$pointer|ConvertTo-Json -Depth 8|Set-Content $pointerPath -Encoding utf8
  & node scripts/rc1-execution-handoff.cjs --create "--dir=$handoff" "--out=$(Join-Path $handoff 'handoff-manifest.json')" --role=primary "--execution-id=$ExecutionId" "--pointer=$pointerPath"|Out-Host;if($LASTEXITCODE -ne 0){throw 'Primary handoff manifest creation failed.'}
  $zip=Join-Path $exec "RC1-$ExecutionId-PRIMARY-HANDOFF.zip";$zipHash=Zip-Directory $handoff $zip
  Write-State $exec 'PRIMARY_READY' 'PASS' 'Complete real manual evidence using MANUAL_EVIDENCE.prefilled.json, then run Peer on the other Windows family.' @{primaryHandoff=$zip;primaryHandoffSha256=$zipHash;manualEvidenceTemplate=$manual;primaryReport=$report} @{windowsFamily=$cj.windowsFamily;evidenceId=$cj.evidenceId}|Out-Null
  Write-Host "PRIMARY HANDOFF READY: $zip" -ForegroundColor Green;exit 0
}

if($Mode -eq 'PrepareEvidence'){
  if(-not $HandoffZip){throw '-HandoffZip primary handoff لازم است.'};$bootstrap=Join-Path $rootAbs ('evidence-bootstrap-'+[guid]::NewGuid().ToString('N'));Expand-Clean $HandoffZip $bootstrap;Verify-Staged-Handoff $bootstrap;Ensure-ImportedLock $bootstrap;Verify-Handoff $bootstrap;$p=Find-Pointer $bootstrap 'primary-pointer.json';if(-not $ExecutionId){$ExecutionId=[string]$p.executionId};Assert-ExecutionId $ExecutionId|Out-Null;if([string]$p.executionId -ne [string]$ExecutionId){throw 'ExecutionId با Primary handoff تطابق ندارد.'};$exec=Join-Path $rootAbs $ExecutionId;New-Item -ItemType Directory -Path $exec -Force|Out-Null;$import=Join-Path $exec 'evidence-primary-import';if(Test-Path $import){Remove-Item $import -Recurse -Force};Move-Item $bootstrap $import;$p=Find-Pointer $import 'primary-pointer.json';$manifest=Join-Path $import ([string]$p.releaseManifest);$primaryReport=Join-Path $import ([string]$p.certificationReport);if(-not $EvidenceOut){$EvidenceOut=Join-Path $exec 'MANUAL_EVIDENCE.prefilled.json'};$args=@('scripts/prefill-manual-evidence-rc1.cjs',"--release-manifest=$manifest","--primary-report=$primaryReport","--out=$EvidenceOut","--execution-id=$ExecutionId");if($Operator){$args+="--operator=$Operator"};& node @args|Out-Host;if($LASTEXITCODE -ne 0){throw 'Prefill failed.'};Write-State $exec 'MANUAL_EVIDENCE_PREPARED' 'INCOMPLETE' 'Perform each real manual test; mark PASS only with observedAt and a hash-bound attachment.' @{evidence=$EvidenceOut;primaryHandoff=$HandoffZip} $null|Out-Null;exit 0
}

if($Mode -eq 'Peer'){
  if(-not $HandoffZip){throw '-HandoffZip primary handoff لازم است.'};$bootstrap=Join-Path $rootAbs ('peer-bootstrap-'+[guid]::NewGuid().ToString('N'));Expand-Clean $HandoffZip $bootstrap;Verify-Staged-Handoff $bootstrap;Ensure-ImportedLock $bootstrap;Verify-Handoff $bootstrap;$primaryPointer=Find-Pointer $bootstrap 'primary-pointer.json';if(-not $ExecutionId){$ExecutionId=[string]$primaryPointer.executionId};Assert-ExecutionId $ExecutionId|Out-Null;if([string]$primaryPointer.executionId -ne [string]$ExecutionId){throw 'ExecutionId با Primary handoff تطابق ندارد.'};$exec=Join-Path $rootAbs $ExecutionId;New-Item -ItemType Directory -Path $exec -Force|Out-Null;$import=Join-Path $exec 'primary-import';if(Test-Path $import){Remove-Item $import -Recurse -Force};Move-Item $bootstrap $import
  $primaryPointer=Find-Pointer $import 'primary-pointer.json';if([string]$primaryPointer.executionId -ne [string]$ExecutionId){throw 'ExecutionId با Primary handoff تطابق ندارد.'};$primaryReport=Join-Path $import ([string]$primaryPointer.certificationReport);$primaryJson=Get-Content $primaryReport -Raw|ConvertFrom-Json;$currentFamily=Get-WindowsFamily;if($currentFamily -eq [string]$primaryJson.windowsFamily){throw "Peer باید Windows family متفاوت باشد. Primary=$($primaryJson.windowsFamily), Current=$currentFamily"}
  $doctorReport=Join-Path $exec 'doctor-peer.json'
  if($resumeAction -eq 'RESUME_PEER_RETURN'){Write-State $exec 'PEER_CERTIFICATION_REUSED' 'PASS' 'Reuse the already complete Peer PASS boundary; rebuild only peer return packaging.' @{primaryHandoff=$HandoffZip;primaryReport=$primaryReport} @{recovery=$true}|Out-Null}
  else{
    $doctorCode=Run-Doctor $doctorReport;if($doctorCode -ne 0){Write-State $exec 'PEER_BLOCKED_DOCTOR' $(if($doctorCode -eq 2){'INCOMPLETE'}else{'FAIL'}) 'Fix Doctor findings before Peer.' @{doctorReport=$doctorReport;primaryReport=$primaryReport} @{exitCode=$doctorCode}|Out-Null;exit $(if($doctorCode -eq 2){2}else{1})}
    Write-State $exec 'PEER_RUNNING' 'INCOMPLETE' 'Wait for peer Windows certification.' @{primaryHandoff=$HandoffZip;primaryReport=$primaryReport;doctorReport=$doctorReport} $null|Out-Null
    $outRel=Rel $project (Join-Path $exec 'peer-certification');$args=@('-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/windows-rc1-certify.ps1','-RootA',$RootA,'-RootB',$RootB,'-OutputDir',$outRel,'-PeerWindowsReport',$primaryReport);if($ScaleRoot){$args+=@('-ScaleRoot',$ScaleRoot)};if($SkipScale){$args+='-SkipScale'};if($EffectiveRequireSigning){$args+='-RequireSigning'};$args+='-NoGenerateLockfile'
    & powershell.exe @args;$code=$LASTEXITCODE;if($code -eq 1){Write-State $exec 'PEER_FAILED' 'FAIL' 'Fix peer certification failure and rerun Peer.' @{primaryReport=$primaryReport} @{exitCode=$code}|Out-Null;exit 1};if($code -notin @(0,2)){Write-State $exec 'PEER_FAILED' 'FAIL' 'Unexpected peer certification exit code.' @{primaryReport=$primaryReport} @{exitCode=$code}|Out-Null;exit 1}
  }
  $result=Get-ChildItem (Join-Path $exec 'peer-certification') -Recurse -Filter 'rc1-certification-result.json' -File|Sort-Object LastWriteTimeUtc -Descending|Select-Object -First 1;if(-not $result){throw 'Peer result missing.'};$phaseReadiness=Join-Path $exec 'peer-phase-readiness.json';$phaseCode=Test-PhaseReadiness $result.FullName 'peer' $phaseReadiness;if($phaseCode -ne 0){Write-State $exec 'PEER_INCOMPLETE' 'INCOMPLETE' 'Peer phase is not safely return-ready; only expected manual-evidence incompleteness is allowed.' @{primaryReport=$primaryReport;phaseReadiness=$phaseReadiness} @{orchestratorExitCode=$code;phaseExitCode=$phaseCode}|Out-Null;exit 2};Write-State $exec 'PEER_PHASE_READY' 'PASS' 'Peer certification report/evidence are PASS; expected Final-only manual incompleteness does not block Peer Return.' @{primaryReport=$primaryReport;phaseReadiness=$phaseReadiness} @{orchestratorExitCode=$code}|Out-Null;$rj=Get-Content $result.FullName -Raw|ConvertFrom-Json;$peerReport=[string]$rj.certificationReport;$peerJson=Get-Content $peerReport -Raw|ConvertFrom-Json;if([string]$peerJson.overall -ne 'PASS'){throw "Peer certification report باید PASS باشد؛ فعلی: $($peerJson.overall)"}
  $returnDir=Join-Path $exec 'peer-return';if(Test-Path $returnDir){Remove-Item $returnDir -Recurse -Force};New-Item -ItemType Directory -Path $returnDir -Force|Out-Null;$peerEvidence=Join-Path $returnDir 'peer-evidence';Copy-Item -Path (Join-Path (Split-Path -Parent $peerReport) '*') -Destination (New-Item -ItemType Directory -Path $peerEvidence -Force).FullName -Recurse -Force;Copy-Item (Join-Path $project 'package-lock.json') (Join-Path $returnDir 'package-lock.json') -Force
  $pointer=[ordered]@{schemaVersion='workspace-agent-rc1-peer-pointer-v1';executionId=$ExecutionId;windowsFamily=$peerJson.windowsFamily;primaryWindowsFamily=$primaryJson.windowsFamily;createdAt=(Get-Date).ToUniversalTime().ToString('o');certificationReport='peer-evidence/certification-report.json';evidenceBundle='peer-evidence/evidence-bundle.json';certificationEvidenceId=$peerJson.evidenceId;packageLock='package-lock.json'};$pointerPath=Join-Path $returnDir 'peer-pointer.json';$pointer|ConvertTo-Json -Depth 8|Set-Content $pointerPath -Encoding utf8
  & node scripts/rc1-execution-handoff.cjs --create "--dir=$returnDir" "--out=$(Join-Path $returnDir 'handoff-manifest.json')" --role=peer "--execution-id=$ExecutionId" "--pointer=$pointerPath"|Out-Host;if($LASTEXITCODE -ne 0){throw 'Peer-return manifest creation failed.'};$zip=Join-Path $exec "RC1-$ExecutionId-PEER-RETURN.zip";$zipHash=Zip-Directory $returnDir $zip
  Write-State $exec 'PEER_READY' 'PASS' 'Return PEER-RETURN.zip to the Primary machine, complete manual evidence, then run Finalize.' @{peerReturn=$zip;peerReturnSha256=$zipHash;peerReport=$peerReport;primaryHandoff=$HandoffZip} @{windowsFamily=$peerJson.windowsFamily;evidenceId=$peerJson.evidenceId}|Out-Null;Write-Host "PEER RETURN READY: $zip" -ForegroundColor Green;exit 0
}

if($Mode -eq 'Finalize'){
  if(-not $HandoffZip){throw '-HandoffZip primary handoff لازم است.'};if(-not $PeerReturnZip){throw '-PeerReturnZip لازم است.'};if(-not $ManualEvidenceFile -or -not(Test-Path $ManualEvidenceFile)){throw '-ManualEvidenceFile کامل لازم است.'}
  if(-not $ExecutionId){$bootstrap=Join-Path $rootAbs ('finalize-bootstrap-'+[guid]::NewGuid().ToString('N'));Expand-Clean $HandoffZip $bootstrap;Verify-Staged-Handoff $bootstrap;Ensure-ImportedLock $bootstrap;Verify-Handoff $bootstrap;$bootPointer=Find-Pointer $bootstrap 'primary-pointer.json';$ExecutionId=[string]$bootPointer.executionId;Assert-ExecutionId $ExecutionId|Out-Null;$exec=Join-Path $rootAbs $ExecutionId;New-Item -ItemType Directory -Path $exec -Force|Out-Null;$primaryImport=Join-Path $exec 'final-primary-import';if(Test-Path $primaryImport){Remove-Item $primaryImport -Recurse -Force};Move-Item $bootstrap $primaryImport}else{$exec=Join-Path $rootAbs $ExecutionId;New-Item -ItemType Directory -Path $exec -Force|Out-Null;$primaryImport=Join-Path $exec 'final-primary-import';Expand-Clean $HandoffZip $primaryImport;Verify-Staged-Handoff $primaryImport;Ensure-ImportedLock $primaryImport;Verify-Handoff $primaryImport}
  Assert-ExecutionId $ExecutionId|Out-Null
  Write-State $exec 'FINALIZE_RUNNING' 'INCOMPLETE' 'Verify immutable Primary/Peer/manual evidence and compute final Stable decision.' @{primaryHandoff=$HandoffZip;peerReturn=$PeerReturnZip;manualEvidence=$ManualEvidenceFile} @{recovery=$($resumeAction -eq 'RESUME_FINALIZE')}|Out-Null
  $peerImport=Join-Path $exec 'final-peer-import';Expand-Clean $PeerReturnZip $peerImport;Verify-Staged-Handoff $peerImport;Verify-Handoff $peerImport
  $pp=Find-Pointer $primaryImport 'primary-pointer.json';$qp=Find-Pointer $peerImport 'peer-pointer.json';if([string]$pp.executionId -ne [string]$qp.executionId){throw 'Primary/Peer executionId mismatch.'};if([string]$pp.executionId -ne [string]$ExecutionId){throw 'ExecutionId با Primary handoff تطابق ندارد.'}
  $primaryReport=Join-Path $primaryImport ([string]$pp.certificationReport);$peerReport=Join-Path $peerImport ([string]$qp.certificationReport);$releaseManifest=Join-Path $primaryImport ([string]$pp.releaseManifest)
  & node scripts/verify-manual-evidence-rc1.cjs $ManualEvidenceFile --require-all --require-artifact-binding "--release-manifest=$releaseManifest" "--primary-report=$primaryReport" "--execution-id=$ExecutionId"|Out-Host;if($LASTEXITCODE -ne 0){Write-State $exec 'FINALIZE_BLOCKED_MANUAL' 'FAIL' 'Correct manual evidence; do not promote Stable.' @{manualEvidence=$ManualEvidenceFile} $null|Out-Null;exit 1}
  $finalDir=Join-Path $exec 'final-certification';New-Item -ItemType Directory -Path $finalDir -Force|Out-Null;$envelope=Join-Path $finalDir 'rc1-final-envelope.json';$args=@('scripts/rc1-finalize.cjs',"--artifact-report=$primaryReport","--peer-report=$peerReport","--release-manifest=$releaseManifest","--manual-evidence=$ManualEvidenceFile","--execution-id=$ExecutionId","--primary-handoff-manifest=$(Join-Path $primaryImport 'handoff-manifest.json')","--peer-handoff-manifest=$(Join-Path $peerImport 'handoff-manifest.json')","--out=$envelope");if($EffectiveRequireSigning){$args+='--require-signing'};& node @args|Out-Host;if($LASTEXITCODE -ne 0){Write-State $exec 'FINALIZE_BLOCKED' 'FAIL' 'Final envelope failed; do not promote Stable.' @{primaryReport=$primaryReport;peerReport=$peerReport;releaseManifest=$releaseManifest} $null|Out-Null;exit 1}
  $verdict=Join-Path $finalDir 'rc1-final-verdict.json';$decision=Join-Path $finalDir 'stable-promotion-decision.json';& node scripts/rc1-stable-readiness.cjs "--verdict=$verdict" "--out=$decision"|Out-Host;if($LASTEXITCODE -ne 0){Write-State $exec 'PROMOTION_BLOCKED' 'FAIL' 'Stable promotion decision is BLOCKED.' @{verdict=$verdict;decision=$decision} $null|Out-Null;exit 1}
  $bundleDir=Join-Path $exec 'final-certification-bundle';$bundleArgs=@('scripts/rc1-final-bundle.cjs',"--out-dir=$bundleDir","--verdict=$verdict","--decision=$decision","--primary-handoff-dir=$primaryImport","--peer-handoff-dir=$peerImport","--manual-evidence=$ManualEvidenceFile");& node @bundleArgs|Out-Host;if($LASTEXITCODE -ne 0){Write-State $exec 'FINAL_BUNDLE_BLOCKED' 'FAIL' 'Self-contained final certification bundle creation/verification failed.' @{bundleDir=$bundleDir;decision=$decision;verdict=$verdict} $null|Out-Null;exit 1}
  $bundleVerifyArgs=@('scripts/rc1-final-bundle.cjs','--verify',"--dir=$bundleDir");if($EffectiveRequireSigning){$bundleVerifyArgs+='--require-signing'};& node @bundleVerifyArgs|Out-Host;if($LASTEXITCODE -ne 0){Write-State $exec 'FINAL_BUNDLE_BLOCKED' 'FAIL' 'Self-contained final certification bundle failed independent verification.' @{bundleDir=$bundleDir} $null|Out-Null;exit 1}
  $bundleManifest=Join-Path $bundleDir 'final-bundle-manifest.json';$delivery=Join-Path $exec "RC1-$ExecutionId-FINAL-CERTIFICATION.zip";$deliveryHash=Zip-Directory $bundleDir $delivery;Write-State $exec 'PROMOTE_ALLOWED' 'PASS' 'RC1 certification is complete. Stable promotion is allowed only with the verified self-contained final certification bundle.' @{decision=$decision;verdict=$verdict;envelope=$envelope;finalBundle=$bundleDir;finalBundleManifest=$bundleManifest;finalDelivery=$delivery;finalDeliverySha256=$deliveryHash} $null|Out-Null;Write-Host 'PROMOTE_ALLOWED' -ForegroundColor Green;Write-Host "Final delivery: $delivery";exit 0
}
