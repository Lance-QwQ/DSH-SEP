$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
& (Join-Path $PSScriptRoot 'runtime\node\node.exe') (Join-Path $PSScriptRoot 'launch.mjs')
exit $LASTEXITCODE
