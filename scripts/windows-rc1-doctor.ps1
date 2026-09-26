param(
  [string]$RootA = $env:WA_CERT_ROOT_A,
  [string]$RootB = $env:WA_CERT_ROOT_B,
  [string]$ScaleRoot = $env:WA_CERT_SCALE_ROOT,
  [switch]$SkipScale,
  [switch]$RequireSigning,
  [string]$OutputFile = ''
)
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){Write-Error 'Windows RC1 Doctor فقط روی Windows اجرا می‌شود.';exit 3}
Set-Location (Split-Path -Parent $PSScriptRoot)
$project=(Get-Location).Path
$pkg=Get-Content package.json -Raw|ConvertFrom-Json
$stablePolicy=$pkg.workspaceAgentRelease.stableCertificationPolicy
$EffectiveRequireSigning=[bool]$RequireSigning -or [bool]$stablePolicy.requireAuthenticode
$RequiredScaleMatrix=@($stablePolicy.requiredScaleMatrix|ForEach-Object{[int]$_})
if($SkipScale -and $RequiredScaleMatrix.Count -gt 0){throw 'STABLE_POLICY_SKIP_SCALE_FORBIDDEN'}
if($pkg.version -ne '1.0.0-rc1' -or $pkg.workspaceAgentRelease.toolingRevision -ne 'cert-kit21'){throw 'Doctor فقط برای v1.0.0-rc1 / cert-kit21 معتبر است.'}
$checks=New-Object System.Collections.Generic.List[object]
function Add-Check([string]$name,[string]$status,[object]$detail=$null){
  $checks.Add([pscustomobject]@{name=$name;status=$status;detail=$detail})
  Write-Host "$status $name" -ForegroundColor $(if($status -eq 'PASS'){'Green'}elseif($status -eq 'INCOMPLETE'){'Yellow'}else{'Red'})
}
function Fail-Check([string]$name,[string]$message,[object]$detail=$null){Add-Check $name 'FAIL' $(if($detail){$detail}else{@{message=$message}});throw $message}
function Canonical([string]$p){return [IO.Path]::GetFullPath($p).TrimEnd('\')}
function Is-Overlap([string]$a,[string]$b){
  $aa=(Canonical $a)+'\';$bb=(Canonical $b)+'\'
  return $aa.StartsWith($bb,[StringComparison]::OrdinalIgnoreCase) -or $bb.StartsWith($aa,[StringComparison]::OrdinalIgnoreCase)
}
function Resolve-NtfsRoot([string]$p,[string]$label){
  if(-not $p){Fail-Check $label "$label لازم است."}
  if(-not (Test-Path -LiteralPath $p -PathType Container)){Fail-Check $label "$label باید یک پوشه موجود باشد." @{input=$p}}
  $rp=(Resolve-Path -LiteralPath $p -ErrorAction Stop).Path
  $driveRoot=[IO.Path]::GetPathRoot($rp)
  if(-not $driveRoot -or $driveRoot -notmatch '^[A-Za-z]:\\$'){Fail-Check $label "$label باید روی Drive Letter محلی Windows باشد." @{resolved=$rp}}
  $letter=$driveRoot.Substring(0,1);$v=Get-Volume -DriveLetter $letter -ErrorAction Stop
  if([string]$v.FileSystem -ne 'NTFS'){Fail-Check $label "$label باید NTFS باشد." @{resolved=$rp;fileSystem=$v.FileSystem}}
  if(-not $v.UniqueId){Fail-Check $label "$label Volume UniqueId ندارد." @{resolved=$rp}}
  $probe=Join-Path $rp ('.wa-doctor-'+[guid]::NewGuid().ToString('N')+'.tmp')
  try{'workspace-agent-doctor'|Set-Content -LiteralPath $probe -Encoding ascii -NoNewline;if(-not(Test-Path -LiteralPath $probe -PathType Leaf)){throw 'probe file missing after write'}}catch{Fail-Check "$label-writable" "$label writable probe failed." @{resolved=$rp;error=$_.Exception.Message}}finally{Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue}
  Add-Check "$label-writable" 'PASS' @{resolved=$rp}
  return [pscustomobject]@{input=$p;resolved=$rp;drive=$letter;uniqueId=[string]$v.UniqueId;fileSystem=[string]$v.FileSystem;driveType=[string]$v.DriveType;healthStatus=[string]$v.HealthStatus;operationalStatus=@($v.OperationalStatus|ForEach-Object{[string]$_});size=[int64]$v.Size;free=[int64]$v.SizeRemaining}
}
function Save-Report([string]$overall,[string]$family,[object]$a,[object]$b,[object]$s){
  $report=[ordered]@{schemaVersion='workspace-agent-rc1-windows-doctor-v2';version=$pkg.version;toolingRevision=$pkg.workspaceAgentRelease.toolingRevision;createdAt=(Get-Date).ToUniversalTime().ToString('o');overall=$overall;windowsFamily=$family;project=$project;rootA=$a;rootB=$b;scaleRoot=$s;checks=$checks}
  if(-not $OutputFile){$script:OutputFile=Join-Path $project 'rc1-execution\doctor-report.json'}
  $target=[IO.Path]::GetFullPath($OutputFile);$dir=Split-Path -Parent $target;if($dir){New-Item -ItemType Directory -Path $dir -Force|Out-Null}
  $tmp=$target+'.tmp-'+[guid]::NewGuid().ToString('N');$report|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $tmp -Encoding utf8;Move-Item -LiteralPath $tmp -Destination $target -Force
  Write-Host "Doctor report: $target";return $target
}
$family='UNKNOWN';$a=$null;$b=$null;$s=$null
try{
  & node scripts/verify-rc1-source.cjs|Out-Host;if($LASTEXITCODE -ne 0){Fail-Check 'rc1-source-contract' 'RC1 source contract failed.'};Add-Check 'rc1-source-contract' 'PASS'
  $expectedNode=(Get-Content .nvmrc -Raw).Trim();$actualNode=(node -p "process.versions.node").Trim();$expectedNpm=([string]$pkg.packageManager).Replace('npm@','');$actualNpm=(npm -v).Trim()
  if($actualNode -ne $expectedNode -or $actualNpm -ne $expectedNpm){Fail-Check 'runtime-pins' 'Node/npm release lane mismatch.' @{expectedNode=$expectedNode;actualNode=$actualNode;expectedNpm=$expectedNpm;actualNpm=$actualNpm}};Add-Check 'runtime-pins' 'PASS' @{node=$actualNode;npm=$actualNpm}
  if([string]$env:PROCESSOR_ARCHITECTURE -notmatch '^(AMD64|x86_64)$'){Fail-Check 'architecture' 'RC1 Windows release lane باید x64 باشد.' @{architecture=$env:PROCESSOR_ARCHITECTURE}};Add-Check 'architecture' 'PASS' @{architecture=$env:PROCESSOR_ARCHITECTURE}
  $os=Get-CimInstance Win32_OperatingSystem -ErrorAction Stop;$family=if([string]$os.Caption -match 'Windows 11'){'Windows11'}elseif([string]$os.Caption -match 'Windows 10'){'Windows10'}else{'UNKNOWN'}
  if($family -eq 'UNKNOWN'){Fail-Check 'windows-family' 'فقط Windows 10/11 client پذیرفته می‌شود.' @{caption=$os.Caption;build=$os.BuildNumber}};Add-Check 'windows-family' 'PASS' @{family=$family;caption=$os.Caption;build=$os.BuildNumber;version=$os.Version}
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent();$principal=New-Object Security.Principal.WindowsPrincipal($identity);$elevated=$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator);Add-Check 'operator-elevation' 'PASS' @{elevated=[bool]$elevated;note=$(if($elevated){'elevated'}else{'not elevated; UAT must still prove junction/ACL capabilities'})}
  $a=Resolve-NtfsRoot $RootA 'rootA';$b=Resolve-NtfsRoot $RootB 'rootB';if($a.uniqueId -eq $b.uniqueId){Fail-Check 'distinct-ntfs-volumes' 'RootA و RootB باید روی دو Volume واقعی متفاوت باشند.' @{rootA=$a;rootB=$b}};if((Canonical $a.resolved) -eq (Canonical $b.resolved)){Fail-Check 'distinct-root-paths' 'RootA و RootB نباید یک مسیر باشند.'};Add-Check 'distinct-ntfs-volumes' 'PASS' @{rootA=$a.uniqueId;rootB=$b.uniqueId}
  if(Is-Overlap $project $a.resolved){Fail-Check 'rootA-source-isolation' 'RootA نباید داخل Source tree باشد و Source tree نیز نباید داخل RootA باشد.' @{project=$project;rootA=$a.resolved}};Add-Check 'rootA-source-isolation' 'PASS'
  if(Is-Overlap $project $b.resolved){Fail-Check 'rootB-source-isolation' 'RootB نباید داخل Source tree باشد و Source tree نیز نباید داخل RootB باشد.' @{project=$project;rootB=$b.resolved}};Add-Check 'rootB-source-isolation' 'PASS'
  if(-not $ScaleRoot){$ScaleRoot=$RootA};$s=Resolve-NtfsRoot $ScaleRoot 'scaleRoot';if(Is-Overlap $project $s.resolved){Fail-Check 'scale-source-isolation' 'ScaleRoot نباید با Source tree overlap داشته باشد.' @{project=$project;scaleRoot=$s.resolved}};Add-Check 'scale-source-isolation' 'PASS'
  $minFree=30GB;if(-not $SkipScale -and $s.free -lt $minFree){Fail-Check 'scale-free-space' 'برای 100k + 1M حداقل 30GB فضای آزاد لازم است.' @{requiredBytes=$minFree;freeBytes=$s.free}};Add-Check 'scale-free-space' 'PASS' @{requiredBytes=$(if($SkipScale){0}else{$minFree});freeBytes=$s.free;skipScale=[bool]$SkipScale}
  $server=[string]$env:WA_LLAMA_SERVER_PATH;$expectedSha=([string]$env:WA_LLAMA_SERVER_EXPECTED_SHA256).Trim().ToLowerInvariant();$expectedSigner=(([string]$env:WA_LLAMA_SERVER_EXPECTED_SIGNER_THUMBPRINT)-replace '[^A-Fa-f0-9]','').ToUpperInvariant()
  if(-not $server -or -not(Test-Path -LiteralPath $server -PathType Leaf) -or [IO.Path]::GetFileName($server).ToLowerInvariant() -ne 'llama-server.exe'){Fail-Check 'local-ai-runtime-path' 'WA_LLAMA_SERVER_PATH باید به llama-server.exe واقعی اشاره کند.' @{path=$server}};Add-Check 'local-ai-runtime-path' 'PASS' @{path=(Resolve-Path -LiteralPath $server).Path}
  if($expectedSha -notmatch '^[a-f0-9]{64}$'){Fail-Check 'local-ai-runtime-sha256' 'WA_LLAMA_SERVER_EXPECTED_SHA256 لازم و باید SHA-256 معتبر باشد.'};$actualSha=(Get-FileHash -LiteralPath $server -Algorithm SHA256).Hash.ToLowerInvariant();if($actualSha -ne $expectedSha){Fail-Check 'local-ai-runtime-sha256' 'llama-server.exe SHA-256 با مقدار pin شده تطابق ندارد.' @{expected=$expectedSha;actual=$actualSha}};Add-Check 'local-ai-runtime-sha256' 'PASS' @{sha256=$actualSha}
  $sig=Get-AuthenticodeSignature -LiteralPath $server;if($expectedSigner){$actualSigner=if($sig.SignerCertificate){(($sig.SignerCertificate.Thumbprint)-replace '[^A-Fa-f0-9]','').ToUpperInvariant()}else{''};if([string]$sig.Status -ne 'Valid' -or $actualSigner -ne $expectedSigner){Fail-Check 'local-ai-runtime-signer' 'Signer pin برای llama-server.exe تطابق ندارد.' @{status=[string]$sig.Status;expected=$expectedSigner;actual=$actualSigner}};Add-Check 'local-ai-runtime-signer' 'PASS' @{status=[string]$sig.Status;thumbprint=$actualSigner}}else{Add-Check 'local-ai-runtime-signer' 'PASS' @{required=$false;status=[string]$sig.Status}}
  if($EffectiveRequireSigning -and -not($env:CSC_LINK -or $env:WIN_CSC_LINK)){Fail-Check 'artifact-signing-config' 'RequireSigning فعال است ولی CSC_LINK/WIN_CSC_LINK وجود ندارد.'};Add-Check 'artifact-signing-config' 'PASS' @{required=[bool]$EffectiveRequireSigning;configured=[bool]($env:CSC_LINK -or $env:WIN_CSC_LINK)}
  $allowedRegistries=@($pkg.workspaceAgentRelease.dependencySourcePolicy.allowedRegistryOrigins);if($allowedRegistries.Count -ne 1){Fail-Check 'npm-registry-provenance' 'Dependency source policy must define exactly one approved npm registry origin.'};$approvedRegistry=([string]$allowedRegistries[0]).TrimEnd('/');$configuredRegistry=([string](npm config get registry)).Trim().TrimEnd('/');if($configuredRegistry -ne $approvedRegistry){Fail-Check 'npm-registry-provenance' 'Configured npm registry does not match the approved release registry.' @{approved=$approvedRegistry;configured=$configuredRegistry}};Add-Check 'npm-registry-provenance' 'PASS' @{approved=$approvedRegistry;configured=$configuredRegistry}
  if(Test-Path package-lock.json){& node scripts/verify-release-inputs.cjs|Out-Host;if($LASTEXITCODE -ne 0){Fail-Check 'release-inputs' 'package-lock موجود ولی gate را پاس نکرد.'};Add-Check 'release-inputs' 'PASS' @{lockfile='present-and-valid';registry=$approvedRegistry}}else{$ping=& npm ping --registry $approvedRegistry --fetch-retries=0 --fetch-timeout=10000 2>&1;if($LASTEXITCODE -ne 0){Fail-Check 'release-inputs' 'package-lock موجود نیست و npm registry مورد تأیید هم در دسترس نیست.' @{registry=$approvedRegistry}};Add-Check 'release-inputs' 'PASS' @{lockfile='pending';registry=$approvedRegistry;note='Primary may generate the official lockfile only from the approved registry'}}
  Save-Report 'PASS' $family $a $b $s|Out-Null;Write-Host 'WINDOWS_RC1_DOCTOR_PASS' -ForegroundColor Green;exit 0
}catch{
  if(($checks|Where-Object status -eq 'FAIL').Count -eq 0){Add-Check 'doctor' 'FAIL' @{error=$_.Exception.Message}}
  try{Save-Report 'FAIL' $family $a $b $s|Out-Null}catch{}
  Write-Error $_.Exception.Message;exit 1
}
