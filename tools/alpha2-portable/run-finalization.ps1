param([Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9-]+$')][string]$Tag,[string[]]$Tests=@(),[switch]$Build)
$ErrorActionPreference='Stop'
$outRoot='D:\AIData\ProjectWork\DSH\alpha2-linux-finalization-20261013-r1'
New-Item -ItemType Directory -Path $outRoot -Force | Out-Null
$archive=Join-Path $outRoot ($Tag+'.tar')
if(Test-Path -LiteralPath $archive){throw 'OUTPUT_ALREADY_EXISTS'}
$node='D:\AIData\ProjectWork\DSH\release-beta2-20261007\bundle-full\runtime\node\node.exe'
$destination='/opt/dsh-sep-cross-platform/alpha2-portable-finalization-'+$Tag
if($Tests.Count -eq 0){$Tests=@(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.test.mjs' -File | ForEach-Object Name)}
foreach($testFile in $Tests){if($testFile -notmatch '^[a-z-]+\.test\.mjs$'){throw 'TEST_SCOPE'}}
& C:\Windows\System32\tar.exe -cf $archive -C $PSScriptRoot .
if($LASTEXITCODE -ne 0){throw 'TAR_FAILED'}
& $node (Join-Path $PSScriptRoot 'transfer.mjs') $archive $destination
if($LASTEXITCODE -ne 0){throw 'TRANSFER_FAILED'}
$command='umask 077; mkdir samples; export SEP_PORTABLE_ROOT=/opt/dsh-sep-cross-platform/alpha2-portable-20261012-r1 SEP_BUNDLE_TEST_ROOT=$PWD/samples SEP_BWRAP_SHA256=e318903862396f96de3df57264e0158682b952fd3fb53ac23d876413e7b30f71; /opt/dsh-sep-cross-platform/runtime/bin/node --test --test-timeout=45000 --test-concurrency=1 --test-reporter=tap '+($Tests -join ' ')+' > result.tap 2>&1; result=$?; tail -n 18 result.tap; if [ "$result" -ne 0 ]; then exit "$result"; fi'
if($Build){$command+='; exec /opt/dsh-sep-cross-platform/runtime/bin/node build-linux-payload.mjs /opt/dsh-sep-cross-platform/alpha2-portable-closeout-package-finalization-'+$Tag+'-build'}
& wsl.exe --distribution DSH-SEP-Linux-RC --user sep-rc --cd $destination --exec /bin/sh -c $command
exit $LASTEXITCODE
