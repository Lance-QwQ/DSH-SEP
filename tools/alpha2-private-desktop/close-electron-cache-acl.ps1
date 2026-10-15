$ErrorActionPreference='Stop'
$taskRoot='D:\AIData\ProjectWork\DSH\alpha2-desktop-continuation-20261012\private-working-root\desktop-X1njvL\electron-data'
$taskPrivateParent='D:\AIData\ProjectWork\DSH\alpha2-desktop-continuation-20261012\private-working-root\desktop-X1njvL'
$taskResolved=(Get-Item -LiteralPath $taskRoot).FullName
if($taskResolved -ne $taskRoot -or -not $taskResolved.StartsWith($taskPrivateParent+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'PRIVATE_ACL_SCOPE'}
$taskLive=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -in @('electron.exe','node.exe') -and $_.CommandLine -and $_.CommandLine.IndexOf($taskPrivateParent,[StringComparison]::OrdinalIgnoreCase) -ge 0})
if($taskLive.Count){throw 'PRIVATE_COPY_STILL_RUNNING'}
$taskCapability='S-1-15-3-1024-395641907-2340533657-1796656376-1949871151-3167452726-3934347287-2361051074-3061173417'
$taskChanges=@()
foreach($taskItem in @((Get-Item -LiteralPath $taskRoot))+@(Get-ChildItem -LiteralPath $taskRoot -Force -Recurse)){
 if(($taskItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'PRIVATE_ACL_ALIAS'}
 $taskAcl=Get-Acl -LiteralPath $taskItem.FullName
 $taskRules=@($taskAcl.Access | Where-Object {-not $_.IsInherited -and $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq $taskCapability})
 if(-not $taskRules.Count){continue}
 $taskChanges += [pscustomobject]@{path=$taskItem.FullName;before=$taskAcl.Sddl;removedExplicitCapabilityRules=$taskRules.Count}
 foreach($taskRule in $taskRules){$taskAcl.RemoveAccessRuleSpecific($taskRule)}
 Set-Acl -LiteralPath $taskItem.FullName -AclObject $taskAcl
}
[pscustomobject]@{status='pass';scope=$taskRoot;changes=$taskChanges;originalAclChanged=$false;timing='after all owned desktop/host processes exited'} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskPrivateParent 'ELECTRON-CACHE-ACL-CLOSEOUT.json') -Encoding utf8
[pscustomobject]@{status='pass';changedEntries=$taskChanges.Count;scope='only this new isolated Electron cache';originalAclChanged=$false} | ConvertTo-Json -Compress
