param([Parameter(Mandatory=$true)][ValidatePattern('^audit-r[0-9]+$')][string]$Tag)
$ErrorActionPreference='Stop'
$outRoot='D:\AIData\ProjectWork\DSH\alpha2-linux-context-20261013-r1'
$archive=Join-Path $outRoot ($Tag+'.tar')
if(Test-Path -LiteralPath $archive){throw 'OUTPUT_ALREADY_EXISTS'}
$node='D:\AIData\ProjectWork\DSH\release-beta2-20261007\bundle-full\runtime\node\node.exe'
$destination='/opt/dsh-sep-cross-platform/alpha2-portable-context-'+$Tag
& C:\Windows\System32\tar.exe -cf $archive -C $PSScriptRoot .
if($LASTEXITCODE -ne 0){throw 'TAR_FAILED'}
& $node (Join-Path $PSScriptRoot 'transfer.mjs') $archive $destination
if($LASTEXITCODE -ne 0){throw 'TRANSFER_FAILED'}
& wsl.exe --distribution DSH-SEP-Linux-RC --user sep-rc --cd $destination --exec /usr/bin/env SEP_PORTABLE_ROOT=/opt/dsh-sep-cross-platform/alpha2-portable-20261012-r1 /opt/dsh-sep-cross-platform/runtime/bin/node finalize-context.mjs
exit $LASTEXITCODE
