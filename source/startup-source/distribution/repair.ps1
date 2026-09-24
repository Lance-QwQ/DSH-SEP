param(
  [Parameter(Mandatory=$true)][string]$Target,
  [string]$PlanPath,
  [switch]$Apply,
  [switch]$Recover
)
$ErrorActionPreference = 'Stop'
$bundle = $PSScriptRoot
$node = Join-Path $bundle 'runtime\node\node.exe'
$cli = Join-Path $bundle 'repair\repair-cli.mjs'
if (-not (Test-Path -LiteralPath $node -PathType Leaf) -or -not (Test-Path -LiteralPath $cli -PathType Leaf)) { throw 'Repair bundle is incomplete.' }
if (-not [IO.Path]::IsPathRooted($Target)) { throw 'Target must be an absolute installation directory.' }
if ($Recover -and (-not $Apply -or -not $PlanPath)) { throw 'Recover requires -Apply and the original -PlanPath.' }
if (-not $PlanPath) {
  $text = & $node --no-warnings $cli prepare --bundle $bundle --target $Target | Out-String
  if ($LASTEXITCODE -ne 0) { throw 'Repair preparation was blocked. Keep the displayed error code and original files.' }
  $prepared = $text | ConvertFrom-Json
  if ($prepared.status -ne 'prepared') { throw 'No prepared repair plan was returned.' }
  $PlanPath = $prepared.planPath
  Write-Host ('Prepared plan SHA-256: ' + $prepared.planHash)
  Write-Host ('Target program graph: ' + $prepared.graphHash)
  Write-Host ('Files to publish: ' + $prepared.files)
  Write-Host ('Plan: ' + $PlanPath)
} else {
  if (-not [IO.Path]::IsPathRooted($PlanPath)) { throw 'PlanPath must be absolute.' }
  $prepared = Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json
  Write-Host ('Prepared plan SHA-256: ' + $prepared.hash)
  Write-Host ('Plan: ' + $PlanPath)
}
if (-not $Apply) {
  Write-Host 'Preview only. To publish this plan, run repair.ps1 again with -Target, -PlanPath and -Apply.'
  exit 0
}
$mode = if ($Recover) { 'recover' } else { 'apply' }
& $node --no-warnings $cli $mode --bundle $bundle --target $Target --plan $PlanPath
if ($LASTEXITCODE -ne 0) { throw 'Repair did not complete. Do not delete locks or restore old data; retain this plan for controlled recovery.' }
Write-Host 'Program/startup repair committed. Start the existing shortcut and verify the application. No data rollback was performed.'
