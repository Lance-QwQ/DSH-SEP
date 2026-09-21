param([Parameter(Mandatory=$true)][string]$RequestPath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  $request = Get-Content -LiteralPath $RequestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $temporary = Join-Path ([string]$request.workingDirectory) 'tmp'
  [IO.Directory]::CreateDirectory($temporary) | Out-Null
  $env:TEMP = $temporary
  $env:TMP = $temporary
  $env:CRASH_DUMP_ENABLE = $null
  Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'JobBridge.cs')))
  $exitCode = [DshSep.OfficeJobBridge]::Run([string]$request.executablePath, [string[]]$request.arguments, [string]$request.workingDirectory)
  exit $exitCode
} catch {
  [Console]::Error.WriteLine('DSH_SEP_BRIDGE_FAILED: ' + $_.Exception.Message)
  exit 125
}
