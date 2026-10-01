param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Destination,[long]$MaxBytes=2147483648,[int]$MaxEntries=20000)
$ErrorActionPreference='Stop'
[AppContext]::SetSwitch('Switch.System.IO.UseLegacyPathHandling',$false)
[AppContext]::SetSwitch('Switch.System.IO.BlockLongPaths',$false)
function NativePath([string]$path) { $full=[IO.Path]::GetFullPath($path); if ($full.StartsWith('\\?\')) { return $full }; if ($full.StartsWith('\\')) { return '\\?\UNC\'+$full.Substring(2) }; return '\\?\'+$full }
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Demand($condition,$code) { if (!$condition) { throw $code } }
$zipAttributes=[IO.File]::GetAttributes((NativePath $Archive))
Demand (!($zipAttributes -band [IO.FileAttributes]::Directory) -and !($zipAttributes -band [IO.FileAttributes]::ReparsePoint)) 'SEP_ARCHIVE_IDENTITY'
Demand (![IO.File]::Exists((NativePath $Destination)) -and ![IO.Directory]::Exists((NativePath $Destination))) 'SEP_ARCHIVE_DESTINATION_EXISTS'
$parentAttributes=[IO.File]::GetAttributes((NativePath ([IO.Path]::GetDirectoryName($Destination))))
Demand (($parentAttributes -band [IO.FileAttributes]::Directory) -and !($parentAttributes -band [IO.FileAttributes]::ReparsePoint)) 'SEP_ARCHIVE_REDIRECTED'
$zip=[IO.Compression.ZipFile]::OpenRead((NativePath $Archive))
try {
  Demand ($zip.Entries.Count -gt 0 -and $zip.Entries.Count -le $MaxEntries) 'SEP_ARCHIVE_COUNT'
  $names=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  [long]$total=0
  foreach ($entry in $zip.Entries) {
    Demand ($entry.FullName -cmatch '^(sep-package\.json|base-graph\.json|target-graph\.json|payload/[a-f0-9]{64})$') 'SEP_ARCHIVE_PATH'
    Demand ($names.Add($entry.FullName)) 'SEP_ARCHIVE_DUPLICATE'
    $mode=($entry.ExternalAttributes -shr 16) -band 61440
    Demand ($mode -eq 0 -or $mode -eq 32768) 'SEP_ARCHIVE_LINK'
    Demand (($entry.ExternalAttributes -band 1040) -eq 0) 'SEP_ARCHIVE_ATTRIBUTES'
    Demand ($entry.Length -ge 0 -and $entry.Length -le $MaxBytes -and $total -le $MaxBytes-$entry.Length) 'SEP_ARCHIVE_SIZE'
    $total+=$entry.Length
    if (!$entry.FullName.StartsWith('payload/')) { Demand ($entry.Length -le 16777216) 'SEP_ARCHIVE_METADATA_SIZE' }
  }
  foreach ($required in @('sep-package.json','base-graph.json','target-graph.json')) { Demand ($names.Contains($required)) 'SEP_ARCHIVE_METADATA_MISSING' }
  [IO.Directory]::CreateDirectory((NativePath $Destination)) | Out-Null
  [IO.Directory]::CreateDirectory((NativePath (Join-Path $Destination 'payload'))) | Out-Null
  [long]$written=0
  $buffer=New-Object byte[] 65536
  foreach ($entry in $zip.Entries) {
    $target=Join-Path $Destination $entry.FullName
    foreach ($dir in @($Destination,[IO.Path]::GetDirectoryName($target))) { Demand (!([IO.File]::GetAttributes((NativePath $dir)) -band [IO.FileAttributes]::ReparsePoint)) 'SEP_ARCHIVE_REDIRECTED' }
    $inputStream=$entry.Open();$outputStream=$null
    try {
      $outputStream=[IO.File]::Open((NativePath $target),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
      [long]$count=0
      while (($read=$inputStream.Read($buffer,0,$buffer.Length)) -gt 0) {
        $count+=$read;$written+=$read
        Demand ($count -le $entry.Length -and $written -le $MaxBytes) 'SEP_ARCHIVE_SIZE'
        $outputStream.Write($buffer,0,$read)
      }
      Demand ($count -eq $entry.Length) 'SEP_ARCHIVE_TRUNCATED'
      $outputStream.Flush($true)
    } finally { if ($outputStream) { $outputStream.Dispose() };$inputStream.Dispose() }
  }
  @{status='pass';files=$zip.Entries.Count;bytes=$written}|ConvertTo-Json -Compress
} finally { $zip.Dispose() }
