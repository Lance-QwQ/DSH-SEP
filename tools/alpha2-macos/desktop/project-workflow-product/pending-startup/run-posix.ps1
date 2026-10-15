param([Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9-]{1,40}$')][string]$Label)
$ErrorActionPreference='Stop'
$sourceRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$evidence=Join-Path 'D:\AIData\ProjectWork\DSH\alpha2-macos-package-20261014-r1\desktop' ('project-pending-'+$Label)
if(Test-Path -LiteralPath $evidence){throw 'Evidence already exists'}
$names=@()
foreach($name in 'runtime-inputs','image-runtime-inputs','document-runtime-inputs','product-runtime-inputs'){$names+=@(Get-Content -Raw -LiteralPath (Join-Path $sourceRoot "package/$name.json")|ConvertFrom-Json).files}
$map=Get-Content -Raw -LiteralPath (Join-Path $sourceRoot 'desktop/project-workflow-product/EXPORT-MAP.json')|ConvertFrom-Json
$names+=@($map.runtime|ForEach-Object source)
$names+='business/fixture.mjs'
$names+=@(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.mjs' -File|ForEach-Object {[IO.Path]::GetRelativePath($sourceRoot,$_.FullName).Replace('\','/')})
$packet=@{label=$Label;files=@{};hashes=@{};excludedUnusedLauncherFiles=@('captured/owner-lease.mjs','captured/owner-posix.mjs')}
foreach($name in ($names|Sort-Object -Unique)){
 if($packet.excludedUnusedLauncherFiles -contains $name){continue}
 $path=Join-Path $sourceRoot $name
 $packet.files[$name]=[Convert]::ToBase64String([IO.File]::ReadAllBytes($path))
 $packet.hashes[$name]=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
}
New-Item -ItemType Directory -Path $evidence|Out-Null
$serialized=$packet|ConvertTo-Json -Depth 5 -Compress
[IO.File]::WriteAllText((Join-Path $evidence 'SOURCE.json'),$serialized,[Text.UTF8Encoding]::new($false))
$serialized|wsl.exe -d DSH-SEP-Linux-RC -u sep-rc -- python3 -c @'
import sys,json,pathlib,base64,hashlib,subprocess,os
p=json.load(sys.stdin);root=pathlib.Path('/home/sep-rc/project-pending-'+p['label']);root.mkdir(mode=0o700)
for name,encoded in p['files'].items():
    assert not name.startswith('/') and '..' not in pathlib.PurePosixPath(name).parts
    raw=base64.b64decode(encoded);assert hashlib.sha256(raw).hexdigest()==p['hashes'][name]
    dest=root/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(raw)
env=dict(os.environ,SEP_PENDING_CANDIDATE='1',SEP_MAC_TREE_HELPER='/home/sep-rc/mac-transactions-src-20261014/native-tree-posix',SEP_MAC_BUSINESS_TEST_ROOT=str(root/'testdata'),SEP_PENDING_REPRO_OUTPUT=str(root/'evidence'),SEP_OFFICIAL_HARNESS='/opt/dsh-sep-cross-platform/alpha2-portable-20261012-r1/host',SEP_MAC_BUNDLE_ROOT='/home/sep-rc/mac-business-capture-alpha2-r2-20261014')
child=subprocess.Popen(['/opt/dsh-sep-cross-platform/runtime/bin/node','--test','--test-reporter=tap',str(root/'desktop/project-workflow-product/pending-startup/loader-repro.test.mjs'),str(root/'desktop/project-workflow-product/pending-startup/layout.test.mjs')],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
    stdout,stderr=child.communicate(timeout=60)
    receipt=json.loads((root/'evidence/LOADER-REPRO.json').read_text()) if (root/'evidence/LOADER-REPRO.json').exists() else None
    receipts={f.name:json.loads(f.read_text()) for f in (root/'evidence').glob('*.json')}
    print(json.dumps({'exit':child.returncode,'stdout':stdout,'stderr':stderr,'receipt':receipt,'receipts':receipts}))
except subprocess.TimeoutExpired:
    print(json.dumps({'status':'blocked','code':'SEP_TEST_DEADLINE','pid':child.pid,'forcedTermination':False}))
'@ | Set-Content -LiteralPath (Join-Path $evidence 'RUN.json') -Encoding utf8NoBOM
$result=Get-Content -Raw -LiteralPath (Join-Path $evidence 'RUN.json')|ConvertFrom-Json
foreach($name in 'stdout','stderr'){if($null -ne $result.$name){[IO.File]::WriteAllText((Join-Path $evidence ("test.$name")),$result.$name,[Text.UTF8Encoding]::new($false))}}
if($result.receipt){[IO.File]::WriteAllText((Join-Path $evidence 'LOADER-REPRO.json'),($result.receipt|ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))}
if($result.receipts){foreach($item in $result.receipts.PSObject.Properties){[IO.File]::WriteAllText((Join-Path $evidence $item.Name),($item.Value|ConvertTo-Json -Depth 30),[Text.UTF8Encoding]::new($false))}}
@{exit=$result.exit;status=$result.status;evidence=$evidence;counts=@($result.stdout -split "`n"|Where-Object {$_ -match '^# (tests|pass|fail|skipped) |^not ok '})}|ConvertTo-Json -Depth 5
