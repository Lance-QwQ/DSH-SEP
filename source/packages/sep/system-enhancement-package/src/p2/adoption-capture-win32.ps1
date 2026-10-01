$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.AccessControl;
using Microsoft.Win32.SafeHandles;
public sealed class AdoptionCaptureHandles : IDisposable {
  [StructLayout(LayoutKind.Sequential)] public struct Info {public uint Attributes;public System.Runtime.InteropServices.ComTypes.FILETIME Created,Accessed,Written;public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct FindData {public uint Attributes;public System.Runtime.InteropServices.ComTypes.FILETIME Created,Accessed,Written;public uint SizeHigh,SizeLow,Reserved0,Reserved1;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]public string Name;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=14)]public string AlternateName;}
  public sealed class Identity {public string path,finalPath,volume,fileId,sha256,name;public long size;}
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string p,uint a,uint s,IntPtr sec,uint creation,uint flags,IntPtr template);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info i);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandleW(SafeFileHandle h,StringBuilder p,uint len,uint flags);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFullPathNameW(string path,uint size,StringBuilder output,IntPtr filePart);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFileAttributesW(string path);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr FindFirstFileW(string pattern,out FindData data);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool FindNextFileW(IntPtr handle,out FindData data);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool FindClose(IntPtr handle);
  [DllImport("advapi32.dll",SetLastError=true)] static extern uint GetSecurityInfo(SafeFileHandle handle,int objectType,uint info,out IntPtr owner,out IntPtr group,out IntPtr dacl,out IntPtr sacl,out IntPtr descriptor);
  [DllImport("advapi32.dll",SetLastError=true)] static extern uint SetSecurityInfo(SafeFileHandle handle,int objectType,uint info,IntPtr owner,IntPtr group,IntPtr dacl,IntPtr sacl);
  [DllImport("advapi32.dll",SetLastError=true)] static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetSecurityDescriptorDacl(IntPtr descriptor,out bool present,out IntPtr dacl,out bool defaulted);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
  readonly Dictionary<string,SafeFileHandle> handles=new Dictionary<string,SafeFileHandle>(StringComparer.OrdinalIgnoreCase);
  readonly Dictionary<string,bool> directories=new Dictionary<string,bool>(StringComparer.OrdinalIgnoreCase);
  readonly Dictionary<string,Identity> baseline=new Dictionary<string,Identity>(StringComparer.OrdinalIgnoreCase);
  readonly long maximum;
  public AdoptionCaptureHandles(long limit){maximum=limit;}
  static void Win32(int error){throw new System.ComponentModel.Win32Exception(error);}
  // Keep public identity paths unchanged. Only native I/O receives the extended local path.
  static string Extended(string path){return @"\\?\"+path;}
  public static string Parent(string path){if(path.Length<=3)return null;int index=path.TrimEnd('\\').LastIndexOf('\\');return index==2?path.Substring(0,3):path.Substring(0,index);}
  public static string SafePath(string path){
    if(path==null||path.Length<3||!Char.IsLetter(path[0])||path[1]!=':'||path[2]!='\\'||path.IndexOf(':',2)>=0||path.IndexOf('\0')>=0)throw new IOException("P2_ADOPTION_CAPTURE_PATH");
    var buffer=new StringBuilder(32768);uint count=GetFullPathNameW(path,(uint)buffer.Capacity,buffer,IntPtr.Zero);
    if(count==0)Win32(Marshal.GetLastWin32Error());if(count>=buffer.Capacity-4)throw new IOException("P2_ADOPTION_CAPTURE_PATH_TOO_LONG");
    string full=buffer.ToString();if(full.Length>3)full=full.TrimEnd('\\');
    for(string p=full;p!=null;p=Parent(p)){uint attributes=GetFileAttributesW(Extended(p));if(attributes==0xffffffff)Win32(Marshal.GetLastWin32Error());if((attributes&0x400)!=0)throw new IOException("P2_ADOPTION_CAPTURE_LINK");}
    return full;
  }
  public static string[] Entries(string path){
    FindData data;IntPtr h=FindFirstFileW(Extended(path.TrimEnd('\\')+@"\*"),out data);
    if(h==new IntPtr(-1)){int error=Marshal.GetLastWin32Error();if(error==2)return new string[0];Win32(error);}
    var names=new List<string>();try{do{if(data.Name!="."&&data.Name!="..")names.Add(data.Name);}while(FindNextFileW(h,out data));int error=Marshal.GetLastWin32Error();if(error!=18)Win32(error);}finally{FindClose(h);}return names.ToArray();
  }
  SafeFileHandle Open(string path,bool directory){
    var h=CreateFileW(Extended(path),0x80060000u,1u,IntPtr.Zero,3,0x00200000u|(directory?0x02000000u:0u),IntPtr.Zero);
    if(h.IsInvalid){int e=Marshal.GetLastWin32Error();h.Dispose();Win32(e);}
    Info i;if(!GetFileInformationByHandle(h,out i)){int e=Marshal.GetLastWin32Error();h.Dispose();Win32(e);}
    if((i.Attributes&0x400)!=0){h.Dispose();throw new IOException("P2_ADOPTION_CAPTURE_LINK");}
    if(((i.Attributes&0x10)!=0)!=directory){h.Dispose();throw new IOException("P2_ADOPTION_CAPTURE_PATH");}
    if(!directory&&i.Links!=1){h.Dispose();throw new IOException("P2_ADOPTION_CAPTURE_LINK");}return h;
  }
  Identity Describe(SafeFileHandle h,string path){Info i;if(!GetFileInformationByHandle(h,out i))Win32(Marshal.GetLastWin32Error());var p=new StringBuilder(32768);uint n=GetFinalPathNameByHandleW(h,p,(uint)p.Capacity,0);if(n==0||n>=p.Capacity)throw new IOException("P2_ADOPTION_CAPTURE_IDENTITY");return new Identity{path=path,finalPath=p.ToString(),volume=i.Volume.ToString("x8"),fileId=i.IndexHigh.ToString("x8")+i.IndexLow.ToString("x8"),size=((long)i.SizeHigh<<32)|i.SizeLow,name=path.Substring(path.LastIndexOf('\\')+1)};}
  static FileStream ReadHandle(SafeFileHandle handle){return new FileStream(new SafeFileHandle(handle.DangerousGetHandle(),false),FileAccess.Read);}
  FileStream Read(string path){return ReadHandle(handles[path]);}
  static string Hash(FileStream stream){using(var hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}
  public void Acquire(string path,bool directory){if(handles.ContainsKey(path))return;var h=Open(path,directory);handles.Add(path,h);directories.Add(path,directory);baseline.Add(path,Describe(h,path));if(!directory&&baseline[path].size>maximum)throw new IOException("P2_ADOPTION_CAPTURE_OVERSIZED");}
  public Identity Describe(string path){var identity=Describe(handles[path],path);if(!directories[path]){using(var stream=Read(path)){stream.Position=0;identity.sha256=Hash(stream);}}return identity;}
  public void Revalidate(){foreach(var pair in handles){using(var current=Open(pair.Key,directories[pair.Key])){var now=Describe(current,pair.Key);var prior=baseline[pair.Key];if(now.volume!=prior.volume||now.fileId!=prior.fileId||!String.Equals(now.finalPath,prior.finalPath,StringComparison.OrdinalIgnoreCase))throw new IOException("P2_ADOPTION_CAPTURE_CHANGED");}}}
  public Identity Copy(string path,string output){var identity=Describe(path);using(var source=Read(path)){source.Position=0;using(var h=CreateFileW(Extended(output),0x40000000u,1u,IntPtr.Zero,1,0x00200000u,IntPtr.Zero)){if(h.IsInvalid)Win32(Marshal.GetLastWin32Error());using(var target=new FileStream(h,FileAccess.Write)){source.CopyTo(target);target.Flush(true);}}}return identity;}
  public string HashFile(string path){using(var h=Open(path,false)){var identity=Describe(h,path);if(identity.size>maximum)throw new IOException("P2_ADOPTION_CAPTURE_OVERSIZED");using(var stream=ReadHandle(h))return Hash(stream);}}
  public bool IsDirectory(string path){return directories[path];}
  // ACL operations use the already verified, non-replaceable lease handle, not a legacy path API.
  public FileSystemSecurity Acl(string path){
    IntPtr owner,group,dacl,sacl,descriptor;uint error=GetSecurityInfo(handles[path],1,7,out owner,out group,out dacl,out sacl,out descriptor);if(error!=0)Win32((int)error);
    try{byte[] bytes=new byte[checked((int)GetSecurityDescriptorLength(descriptor))];Marshal.Copy(descriptor,bytes,0,bytes.Length);FileSystemSecurity acl=directories[path]?(FileSystemSecurity)new DirectorySecurity():new FileSecurity();acl.SetSecurityDescriptorBinaryForm(bytes);return acl;}finally{LocalFree(descriptor);}
  }
  public void SetAcl(string path,FileSystemSecurity acl){
    byte[] bytes=acl.GetSecurityDescriptorBinaryForm();GCHandle pinned=GCHandle.Alloc(bytes,GCHandleType.Pinned);
    try{bool present,defaulted;IntPtr dacl;if(!GetSecurityDescriptorDacl(pinned.AddrOfPinnedObject(),out present,out dacl,out defaulted))Win32(Marshal.GetLastWin32Error());if(!present)throw new IOException("P2_ADOPTION_CAPTURE_ACL");uint info=4u|(acl.AreAccessRulesProtected?0x80000000u:0x20000000u);uint error=SetSecurityInfo(handles[path],1,info,IntPtr.Zero,IntPtr.Zero,dacl,IntPtr.Zero);if(error!=0)Win32((int)error);}finally{pinned.Free();}
  }
  public void Dispose(){foreach(var h in handles.Values)h.Dispose();handles.Clear();}
}
'@
$names=@('dsh_enhancement_suite_v1.json','dsh_four_layer_memory_v1.json','dsh_four_layer_archive_v1.json')
$lease=$null;$baseline=$null;$source=$null;$target=$null;$directoryPaths=@();$sourcePaths=@();$copied=@{};$retirement=$null;$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
function Assert-SafePath([string]$path){
  $full=[AdoptionCaptureHandles]::SafePath($path)
  if([IO.DriveInfo]::new($full.Substring(0,3)).DriveFormat -ne 'NTFS'){throw 'P2_ADOPTION_CAPTURE_FILESYSTEM'}
  return $full
}
function Within([string]$parent,[string]$path){return $path.Equals($parent,[StringComparison]::OrdinalIgnoreCase)-or $path.StartsWith($parent+'\',[StringComparison]::OrdinalIgnoreCase)}
function Chain([string]$anchor,[string]$leaf){if(-not(Within $anchor $leaf)){throw 'P2_ADOPTION_CAPTURE_PATH'};$paths=@();for($p=$leaf;;$p=[AdoptionCaptureHandles]::Parent($p)){$paths=@($p)+$paths;if($p.Equals($anchor,[StringComparison]::OrdinalIgnoreCase)){break}};return $paths}
function Owned-Acl([string]$path){return $lease.Acl($path)}
function Sddl($acl){return $acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All)}
function Policies{
  $policies=@();foreach($path in $sourcePaths){$mask=if($path -eq $source){65878}elseif($path -eq $ancestor){64}else{65600};$policies+=@{path=$path;mask=$mask}}
  foreach($name in $names){$policies+=@{path=(Join-Path $source $name);mask=65878}};return $policies
}
function Retirement-Plan{
  $entries=@();foreach($policy in @(Policies)){$acl=Owned-Acl $policy.path;$before=Sddl $acl;$rule=[Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]$policy.mask,[Security.AccessControl.AccessControlType]::Deny);$acl.AddAccessRule($rule);$entries+=@{path=$policy.path;mask=$policy.mask;currentSddl=$before;afterSddl=(Sddl $acl)}}
  return @{version=1;assurance='known-writer-perimeter';writerSid=$sid.Value;entries=$entries}
}
function Assert-RetirementPlan($expected,$actual){
  if(-not $expected -or $expected.version -ne 1 -or $expected.assurance -ne 'known-writer-perimeter' -or $expected.writerSid -ne $actual.writerSid -or @($expected.entries).Count -ne @($actual.entries).Count){throw 'P2_ADOPTION_CAPTURE_RETIREMENT_CHANGED'}
  foreach($entry in $actual.entries){$matched=@($expected.entries|Where-Object {$_.path -eq $entry.path});if($matched.Count -ne 1 -or $matched[0].mask -ne $entry.mask -or $matched[0].currentSddl -cne $entry.currentSddl -or $matched[0].afterSddl -cne $entry.afterSddl){throw 'P2_ADOPTION_CAPTURE_RETIREMENT_CHANGED'}}
}
function Assert-Deadline($expiresAt){if($null -ne $expiresAt -and [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -ge [long]$expiresAt){throw 'P2_ADOPTION_CAPTURE_EXPIRED'}}
function Assert-Retirement($expected){
  if(-not $expected.retired -or $expected.assurance -ne 'known-writer-perimeter' -or $expected.writerSid -ne $sid.Value){throw 'P2_ADOPTION_CAPTURE_RETIREMENT_CHANGED'}
  $policies=@(Policies);if(@($expected.entries).Count -ne $policies.Count){throw 'P2_ADOPTION_CAPTURE_RETIREMENT_CHANGED'}
  foreach($policy in $policies){$entry=@($expected.entries|Where-Object {$_.path -eq $policy.path});if($entry.Count -ne 1 -or $entry[0].mask -ne $policy.mask){throw 'P2_ADOPTION_CAPTURE_RETIREMENT_CHANGED'};$acl=Owned-Acl $policy.path;$deny=0;foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($rule.IdentityReference -eq $sid -and $rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Deny -and -not($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly)){$deny=$deny -bor [int]$rule.FileSystemRights}};if(($deny -band $policy.mask) -ne $policy.mask -or (Sddl $acl) -cne $entry[0].retiredSddl){throw 'P2_ADOPTION_CAPTURE_RETIREMENT_CHANGED'}}
}
function Validate-Lease{
  param([switch]$IgnoreRetirement)
  if(-not $lease){throw 'P2_ADOPTION_CAPTURE_CLOSED'}
  foreach($p in $directoryPaths){[void](Assert-SafePath $p)}
  $lease.Revalidate()
  $current=@([AdoptionCaptureHandles]::Entries($source))
  if((($current|Sort-Object)-join '|') -cne (($names|Sort-Object)-join '|')){throw 'P2_ADOPTION_CAPTURE_UNKNOWN_ENTRY'}
  $files=@();foreach($name in $names){$f=$lease.Describe((Join-Path $source $name));if($baseline -and $f.sha256 -ne $baseline[$name]){throw 'P2_ADOPTION_CAPTURE_CHANGED'};$files+=$f}
  foreach($name in $copied.Keys){$p=Join-Path $target $name;[void](Assert-SafePath $p);if($lease.HashFile($p) -ne $copied[$name]){throw 'P2_ADOPTION_CAPTURE_CHANGED'}}
  if($retirement -and -not $IgnoreRetirement){Assert-Retirement $retirement}
  return @{ok=$true;valid=$true;directories=@($directoryPaths|ForEach-Object {$lease.Describe($_)});files=$files}
}
function Restoration-Inspection($original){
  [void](Validate-Lease -IgnoreRetirement)
  $policies=@(Policies)
  if(-not $original -or $original.version -ne 1 -or $original.assurance -ne 'known-writer-perimeter' -or $original.writerSid -ne $sid.Value -or @($original.entries).Count -ne $policies.Count){throw 'P2_ADOPTION_CAPTURE_RESTORATION_CHANGED'}
  $entries=@()
  foreach($policy in $policies){
    $matches=@($original.entries|Where-Object {$_.path -ceq $policy.path})
    if($matches.Count -ne 1 -or $matches[0].mask -ne $policy.mask -or -not ($matches[0].currentSddl -is [string]) -or -not ($matches[0].afterSddl -is [string])){throw 'P2_ADOPTION_CAPTURE_RESTORATION_CHANGED'}
    $entry=$matches[0]
    try{$derived=if($lease.IsDirectory($policy.path)){[Security.AccessControl.DirectorySecurity]::new()}else{[Security.AccessControl.FileSecurity]::new()};$derived.SetSecurityDescriptorSddlForm($entry.currentSddl);$derived.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]$policy.mask,[Security.AccessControl.AccessControlType]::Deny));if((Sddl $derived) -cne $entry.afterSddl){throw 'P2_ADOPTION_CAPTURE_RESTORATION_CHANGED'}}catch{throw 'P2_ADOPTION_CAPTURE_RESTORATION_CHANGED'}
    $current=Sddl (Owned-Acl $policy.path)
    if($current -cne $entry.currentSddl -and $current -cne $entry.afterSddl){throw 'P2_ADOPTION_CAPTURE_RESTORATION_CHANGED'}
    $entries+=@{path=$policy.path;mask=$policy.mask;currentSddl=$current;originalSddl=$entry.currentSddl;state=$(if($current -ceq $entry.currentSddl){'original'}else{'retired'})}
  }
  return @{version=1;assurance='known-writer-perimeter';writerSid=$sid.Value;entries=$entries;interruptedRestorationMayPermitWrites=$true}
}
try{
  while($null -ne ($line=[Console]::ReadLine())){
    try{
      $command=$line|ConvertFrom-Json;$answer=@{ok=$true}
      switch($command.op){
        'acquire'{
          if($lease){throw 'P2_ADOPTION_CAPTURE_ALREADY_HELD'}
          $source=Assert-SafePath $command.sourceRoot;$target=Assert-SafePath $command.captureDirectory;$ancestor=Assert-SafePath $command.trustedAncestor;$capturePerimeter=Assert-SafePath $command.capturePerimeter
          if((Within $source $target)-or(Within $target $source)-or $source.Equals($ancestor,[StringComparison]::OrdinalIgnoreCase)){throw 'P2_ADOPTION_CAPTURE_PATH'}
          $targetNames=@([AdoptionCaptureHandles]::Entries($target));if(($command.copy -and $targetNames.Count)-or(-not $command.copy -and @($targetNames|Where-Object {$_ -notin $names}).Count)){throw 'P2_ADOPTION_CAPTURE_TARGET_NOT_EMPTY'}
          $current=@([AdoptionCaptureHandles]::Entries($source))
          if(@($current|Where-Object {$_ -notin $names}).Count){throw 'P2_ADOPTION_CAPTURE_UNKNOWN_ENTRY'}
          $missing=@($names|Where-Object {$_ -notin $current});if($missing.Count){throw 'P2_ADOPTION_CAPTURE_MISSING'}
          $lease=[AdoptionCaptureHandles]::new([long]$command.maxFileBytes)
          $sourcePaths=@(Chain $ancestor $source);$directoryPaths=$sourcePaths+@(Chain $capturePerimeter $target)|Select-Object -Unique
          foreach($p in $directoryPaths){$lease.Acquire($p,$true)}
          foreach($name in $names){$lease.Acquire((Join-Path $source $name),$false)}
          $answer=Validate-Lease;$baseline=@{};foreach($file in $answer.files){$baseline[$file.name]=$file.sha256}
          $answer.assurance='known-writer-perimeter';$answer.writerSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$answer.missing=@()
        }
        'copy'{
          [void](Validate-Lease);if($command.name -notin $names -or $copied.ContainsKey($command.name)){throw 'P2_ADOPTION_CAPTURE_COPY_INPUT'}
          $file=$lease.Copy((Join-Path $source $command.name),(Join-Path $target $command.name));$copied[$command.name]=$file.sha256;$answer.file=$file;[void](Validate-Lease)
        }
        'revalidate'{$answer=Validate-Lease}
        'retire'{
          $retirementAppliedPaths=@();Assert-Deadline $command.expiresAt
          [void](Validate-Lease)
          $plan=Retirement-Plan;Assert-RetirementPlan $command.expectedPlan $plan
          if(-not $retirement){$applied=@();foreach($policy in $plan.entries){$acl=Owned-Acl $policy.path;if((Sddl $acl) -cne $policy.currentSddl){throw 'P2_ADOPTION_CAPTURE_RETIREMENT_CHANGED'};$rule=[Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]$policy.mask,[Security.AccessControl.AccessControlType]::Deny);$acl.AddAccessRule($rule);Assert-Deadline $command.expiresAt;$lease.SetAcl($policy.path,$acl);$retirementAppliedPaths+=@($policy.path);$after=Sddl (Owned-Acl $policy.path);if($after -cne $policy.afterSddl){throw 'P2_ADOPTION_CAPTURE_RETIREMENT_CHANGED'};$applied+=@{path=$policy.path;mask=$policy.mask;originalSddl=$policy.currentSddl;retiredSddl=$after}};$retirement=@{retired=$true;assurance='known-writer-perimeter';writerSid=$sid.Value;entries=$applied}}
          Assert-Retirement $retirement;$answer.retirement=$retirement
        }
        'retirementPlan'{[void](Validate-Lease);$answer.plan=Retirement-Plan}
        'verifyRetirement'{[void](Validate-Lease);Assert-Retirement $command.expected;$retirement=$command.expected;$answer.retirement=$retirement}
        'inspectRestoration'{$answer.inspection=Restoration-Inspection $command.originalPlan}
        'restore'{
          $restorationAppliedPaths=@();$alreadyOriginalPaths=@()
          if($null -eq $command.expiresAt -or $command.expiresAt -lt 0 -or $command.expiresAt -gt 9007199254740991 -or [double]$command.expiresAt -ne [Math]::Truncate([double]$command.expiresAt)){throw 'P2_ADOPTION_CAPTURE_DEADLINE'}
          Assert-Deadline $command.expiresAt
          $inspection=Restoration-Inspection $command.originalPlan
          # This is an explicitly authorized return to old rights, not automatic cleanup.
          # The caller persisted release intent; interruption may expose restored domains.
          $retirement=$null
          foreach($policy in $inspection.entries){
            [void](Restoration-Inspection $command.originalPlan);Assert-Deadline $command.expiresAt
            $acl=Owned-Acl $policy.path;$current=Sddl $acl
            if($current -ceq $policy.originalSddl){$alreadyOriginalPaths+=@($policy.path);continue}
            if($current -cne $policy.currentSddl){throw 'P2_ADOPTION_CAPTURE_RESTORATION_CHANGED'}
            $acl.SetSecurityDescriptorSddlForm($policy.originalSddl,[Security.AccessControl.AccessControlSections]::Access)
            Assert-Deadline $command.expiresAt
            $lease.SetAcl($policy.path,$acl)
            $restorationAppliedPaths+=@($policy.path)
            if((Sddl (Owned-Acl $policy.path)) -cne $policy.originalSddl){throw 'P2_ADOPTION_CAPTURE_RESTORATION_CHANGED'}
          }
          $verified=Restoration-Inspection $command.originalPlan
          if(@($verified.entries|Where-Object {$_.state -ne 'original'}).Count){throw 'P2_ADOPTION_CAPTURE_RESTORATION_CHANGED'}
          $answer.restoration=@{version=1;restored=$true;assurance='known-writer-perimeter';writerSid=$sid.Value;entries=@($verified.entries|ForEach-Object {@{path=$_.path;mask=$_.mask;originalSddl=$_.originalSddl;restoredSddl=$_.currentSddl}});restoredPaths=$restorationAppliedPaths;alreadyOriginalPaths=$alreadyOriginalPaths;interruptedRestorationMayPermitWrites=$true}
        }
        default{throw 'P2_ADOPTION_CAPTURE_PROTOCOL'}
      }
      [Console]::WriteLine(($answer|ConvertTo-Json -Depth 8 -Compress))
    }catch{
      $e=$_.Exception;while($e.InnerException){$e=$e.InnerException}
      $code=if($e.Message -match '^P2_ADOPTION_CAPTURE_[A-Z_]+$'){$e.Message}elseif($e -is [ComponentModel.Win32Exception] -and $e.NativeErrorCode -eq 32){'P2_ADOPTION_CAPTURE_BUSY'}elseif($e -is [IO.PathTooLongException] -or ($e -is [ComponentModel.Win32Exception] -and $e.NativeErrorCode -eq 206)){'P2_ADOPTION_CAPTURE_PATH_TOO_LONG'}elseif($e -is [IO.DirectoryNotFoundException] -or $e -is [IO.FileNotFoundException] -or ($e -is [ComponentModel.Win32Exception] -and $e.NativeErrorCode -in @(2,3))){'P2_ADOPTION_CAPTURE_NOT_FOUND'}elseif($e -is [UnauthorizedAccessException] -or ($e -is [ComponentModel.Win32Exception] -and $e.NativeErrorCode -eq 5)){'P2_ADOPTION_CAPTURE_ACCESS_DENIED'}else{'P2_ADOPTION_CAPTURE_HELPER'}
      $answer=@{ok=$false;code=$code;win32=$e.NativeErrorCode};if($code -eq 'P2_ADOPTION_CAPTURE_MISSING'){$answer.missing=$missing}
      if($command.op -eq 'retire'){$answer.retirementAppliedPaths=@($retirementAppliedPaths)}
      if($command.op -eq 'restore'){$answer.restorationAppliedPaths=@($restorationAppliedPaths)}
      [Console]::WriteLine(($answer|ConvertTo-Json -Depth 4 -Compress))
    }
  }
}finally{if($lease){$lease.Dispose()}}
