param(
  [Parameter(Mandatory=$true)][string]$Archive,
  [Parameter(Mandatory=$true)][string]$Destination,
  [int]$MaxEntries=20000,
  [Int64]$MaxArchiveBytes=4294967296,
  [Int64]$MaxTotalUncompressedBytes=8589934592,
  [Int64]$MaxSingleEntryBytes=2147483648
)
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){Write-Error 'Safe archive expansion فقط روی Windows اجرا می‌شود.';exit 3}
Add-Type -AssemblyName System.IO.Compression -ErrorAction Stop
Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
function Fail([string]$code,[string]$message,[object]$detail=$null){
  $e=[ordered]@{ok=$false;code=$code;message=$message;detail=$detail};$e|ConvertTo-Json -Depth 8|Write-Error;throw $code
}
function Is-Reparse([IO.FileSystemInfo]$item){return (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)}
function Is-Reserved([string]$segment){
  $base=($segment.TrimEnd(' ','.').Split('.')[0]).ToUpperInvariant()
  if($base -in @('CON','PRN','AUX','NUL')){return $true}
  if($base -match '^COM[1-9]$' -or $base -match '^LPT[1-9]$'){return $true}
  return $false
}
function Normalize-EntryName([string]$name,[bool]$isDirectory){
  if($null -eq $name){Fail 'ARCHIVE_ENTRY_NAME_INVALID' 'ZIP entry name is null.'}
  $n=$name.Replace('\','/')
  if($n.IndexOf([char]0) -ge 0 -or $n -match '[\x00-\x1F]'){Fail 'ARCHIVE_ENTRY_CONTROL_CHAR_FORBIDDEN' 'ZIP entry contains a control character.' @{entry=$name}}
  if($n.StartsWith('/') -or $n.StartsWith('//') -or $n -match '^[A-Za-z]:'){Fail 'ARCHIVE_ENTRY_ABSOLUTE_PATH_FORBIDDEN' 'Absolute/drive/UNC ZIP paths are forbidden.' @{entry=$name}}
  if($isDirectory){$n=$n.TrimEnd('/')}
  if(-not $n){Fail 'ARCHIVE_ENTRY_EMPTY_PATH_FORBIDDEN' 'Empty/root ZIP entries are forbidden.' @{entry=$name}}
  $parts=@($n.Split('/'))
  foreach($part in $parts){
    if(-not $part -or $part -eq '.' -or $part -eq '..'){Fail 'ARCHIVE_ENTRY_TRAVERSAL_FORBIDDEN' 'ZIP traversal/dot/empty segments are forbidden.' @{entry=$name;segment=$part}}
    if($part.Length -gt 255){Fail 'ARCHIVE_ENTRY_SEGMENT_TOO_LONG' 'ZIP path segment exceeds 255 characters.' @{entry=$name;segmentLength=$part.Length}}
    if($part.EndsWith(' ') -or $part.EndsWith('.')){Fail 'ARCHIVE_ENTRY_WINDOWS_ALIAS_FORBIDDEN' 'Trailing dot/space Windows aliases are forbidden.' @{entry=$name;segment=$part}}
    if($part.Contains(':')){Fail 'ARCHIVE_ENTRY_ADS_FORBIDDEN' 'NTFS ADS/colon paths are forbidden.' @{entry=$name;segment=$part}}
    if(Is-Reserved $part){Fail 'ARCHIVE_ENTRY_DEVICE_NAME_FORBIDDEN' 'Windows device names are forbidden in ZIP paths.' @{entry=$name;segment=$part}}
  }
  if($n.Length -gt 2048){Fail 'ARCHIVE_ENTRY_PATH_TOO_LONG' 'ZIP relative path exceeds certification bound.' @{entry=$name;length=$n.Length}}
  return $n
}
$archiveFull=[IO.Path]::GetFullPath($Archive);$destFull=[IO.Path]::GetFullPath($Destination)
if(-not(Test-Path -LiteralPath $archiveFull -PathType Leaf)){Fail 'ARCHIVE_NOT_FOUND' 'Input archive must be an existing file.' @{archive=$archiveFull}}
$archiveItem=Get-Item -LiteralPath $archiveFull -Force
if(Is-Reparse $archiveItem){Fail 'ARCHIVE_REPARSE_FORBIDDEN' 'Input archive cannot be a reparse/symlink file.' @{archive=$archiveFull}}
if([Int64]$archiveItem.Length -gt $MaxArchiveBytes){Fail 'ARCHIVE_COMPRESSED_SIZE_LIMIT' 'Archive exceeds compressed-size certification limit.' @{bytes=[Int64]$archiveItem.Length;limit=$MaxArchiveBytes}}
if(Test-Path -LiteralPath $destFull){$di=Get-Item -LiteralPath $destFull -Force;if(Is-Reparse $di){Fail 'DESTINATION_REPARSE_FORBIDDEN' 'Destination cannot be a reparse point.' @{destination=$destFull}}}
$zip=$null;$rows=New-Object System.Collections.Generic.List[object];$keys=@{};$total=[Int64]0
try{
  $zip=[IO.Compression.ZipFile]::OpenRead($archiveFull)
  if($zip.Entries.Count -gt $MaxEntries){Fail 'ARCHIVE_ENTRY_COUNT_LIMIT' 'Archive contains too many entries.' @{entries=$zip.Entries.Count;limit=$MaxEntries}}
  foreach($entry in $zip.Entries){
    $raw=[string]$entry.FullName;$isDir=$raw.EndsWith('/') -or $raw.EndsWith('\')
    $rel=Normalize-EntryName $raw $isDir
    $key=$rel.Normalize([Text.NormalizationForm]::FormC).ToLowerInvariant()
    if($keys.ContainsKey($key)){Fail 'ARCHIVE_DUPLICATE_CANONICAL_PATH' 'Duplicate/case-alias ZIP path is forbidden.' @{entry=$raw;previous=$keys[$key].raw}}
    $unixMode=(($entry.ExternalAttributes -shr 16) -band 0xFFFF);$unixType=($unixMode -band 0xF000)
    if($unixType -eq 0xA000 -or (($entry.ExternalAttributes -band [int][IO.FileAttributes]::ReparsePoint) -ne 0)){Fail 'ARCHIVE_LINK_REPARSE_ENTRY_FORBIDDEN' 'Archive symlink/reparse entries are forbidden.' @{entry=$raw;externalAttributes=$entry.ExternalAttributes}}
    if(-not $isDir){
      if([Int64]$entry.Length -gt $MaxSingleEntryBytes){Fail 'ARCHIVE_SINGLE_ENTRY_SIZE_LIMIT' 'Archive entry exceeds size limit.' @{entry=$raw;bytes=[Int64]$entry.Length;limit=$MaxSingleEntryBytes}}
      $total=[Int64]($total+[Int64]$entry.Length);if($total -gt $MaxTotalUncompressedBytes){Fail 'ARCHIVE_TOTAL_SIZE_LIMIT' 'Archive exceeds total uncompressed-size limit.' @{bytes=$total;limit=$MaxTotalUncompressedBytes}}
    }
    $row=[pscustomobject]@{raw=$raw;rel=$rel;key=$key;isDirectory=[bool]$isDir;length=[Int64]$entry.Length;compressedLength=[Int64]$entry.CompressedLength;entry=$entry};$rows.Add($row);$keys[$key]=$row
  }
  foreach($row in $rows){
    $parts=@($row.rel.Split('/'));if($parts.Count -gt 1){for($i=1;$i -lt $parts.Count;$i++){$parent=([string]::Join('/', $parts[0..($i-1)])).Normalize([Text.NormalizationForm]::FormC).ToLowerInvariant();if($keys.ContainsKey($parent) -and -not [bool]$keys[$parent].isDirectory){Fail 'ARCHIVE_FILE_DIRECTORY_COLLISION' 'A file shadows a parent directory path.' @{entry=$row.raw;parent=$keys[$parent].raw}}}}
  }
  $parent=Split-Path -Parent $destFull;if(-not $parent){Fail 'DESTINATION_PARENT_INVALID' 'Destination parent is invalid.' @{destination=$destFull}}
  New-Item -ItemType Directory -Path $parent -Force|Out-Null
  $stage=Join-Path $parent ((Split-Path -Leaf $destFull)+'.extracting-'+[guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $stage -Force|Out-Null
  try{
    $stagePrefix=[IO.Path]::GetFullPath($stage).TrimEnd('\')+'\'
    foreach($row in $rows){
      $target=[IO.Path]::GetFullPath((Join-Path $stage ($row.rel.Replace('/','\'))))
      if(-not $target.StartsWith($stagePrefix,[StringComparison]::OrdinalIgnoreCase)){Fail 'ARCHIVE_TARGET_ESCAPE' 'Calculated extraction target escaped staging directory.' @{entry=$row.raw;target=$target}}
      if($row.isDirectory){New-Item -ItemType Directory -Path $target -Force|Out-Null;continue}
      $td=Split-Path -Parent $target;if($td){New-Item -ItemType Directory -Path $td -Force|Out-Null}
      $input=$null;$output=$null
      try{$input=$row.entry.Open();$output=New-Object IO.FileStream($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);$input.CopyTo($output)}finally{if($output){$output.Dispose()};if($input){$input.Dispose()}}
      $written=Get-Item -LiteralPath $target -Force;if(Is-Reparse $written){Fail 'ARCHIVE_EXTRACTED_REPARSE_FORBIDDEN' 'Extractor produced a reparse point unexpectedly.' @{entry=$row.raw}};if([Int64]$written.Length -ne [Int64]$row.length){Fail 'ARCHIVE_EXTRACTED_LENGTH_MISMATCH' 'Extracted file length differs from central directory.' @{entry=$row.raw;expected=$row.length;actual=[Int64]$written.Length}}
    }
    foreach($item in Get-ChildItem -LiteralPath $stage -Force -Recurse){if(Is-Reparse $item){Fail 'ARCHIVE_EXTRACTED_REPARSE_FORBIDDEN' 'Extracted tree contains a reparse point.' @{path=$item.FullName}}}
    if(Test-Path -LiteralPath $destFull){Remove-Item -LiteralPath $destFull -Recurse -Force}
    Move-Item -LiteralPath $stage -Destination $destFull -Force
  }catch{if($stage -and (Test-Path -LiteralPath $stage)){Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue};throw}
}finally{if($zip){$zip.Dispose()}}
[ordered]@{ok=$true;status='SAFE_ARCHIVE_EXPAND_PASS';archive=$archiveFull;destination=$destFull;entries=$rows.Count;totalUncompressedBytes=$total;limits=[ordered]@{maxEntries=$MaxEntries;maxArchiveBytes=$MaxArchiveBytes;maxTotalUncompressedBytes=$MaxTotalUncompressedBytes;maxSingleEntryBytes=$MaxSingleEntryBytes}}|ConvertTo-Json -Depth 6
