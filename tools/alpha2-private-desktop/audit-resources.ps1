$ErrorActionPreference = 'Stop'
$phase = 'D:\AIData\ProjectWork\DSH\alpha2-desktop-continuation-20261012'
$parent = Join-Path $phase 'private-working-root'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowed = @($sid,'S-1-5-18','S-1-5-32-544') | Sort-Object
$items = @((Get-Item -LiteralPath $parent)) + @(Get-ChildItem -LiteralPath $parent -Force -Recurse | Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0 })
foreach ($item in $items) {
  $acl = Get-Acl -LiteralPath $item.FullName
  $actual = @($acl.Access | ForEach-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } | Sort-Object -Unique)
  if (Compare-Object $allowed $actual) { throw 'PRIVATE_COPY_ACL_CHANGED' }
  if (@($acl.Access | Where-Object { $_.AccessControlType -ne 'Allow' }).Count) { throw 'PRIVATE_COPY_ACL_CHANGED' }
}
$processes = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(node|electron|python|python3)\.exe$' -and $_.CommandLine -and $_.CommandLine.IndexOf($phase,[StringComparison]::OrdinalIgnoreCase) -ge 0 } | Select-Object ProcessId,Name)
$locks = @(Get-ChildItem -LiteralPath $parent -Recurse -Force -File -Filter 'owner.lock' | Select-Object FullName)
if ($processes.Count -or $locks.Count) { throw 'PHASE_RESOURCES_RETAINED' }
$result = [pscustomobject]@{schema=1;status='pass';privateAclEntriesVerified=$items.Count;allowedSubjects=@('current-user','SYSTEM','Administrators');phaseProcesses=0;privateP2OwnerLocks=0;cleanupAttribution='Integrated private desktop r3 completed both normal Electron and Host exits. The operator runner exited after its bounded leftover deadline timers expired; failed r1/r2 used recorded fixture cleanup. This final scan does not rewrite those failed outcomes.';scope='only process command lines referencing this phase; no global handles or socket audit; resolver junction targets excluded from private ACL audit'}
$result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $phase 'FINAL-RESOURCES-ACL-r3.json') -Encoding UTF8
$result | ConvertTo-Json -Compress
