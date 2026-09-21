$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public sealed class DocumentSourceIdentity {
  public string volumeSerialNumber;
  public string fileId;
}
public sealed class DocumentSourceResult {
  public string status;
  public string path;
  public DocumentSourceIdentity identity;
  public string sha256;
}
public static class DocumentSourceNative {
  [StructLayout(LayoutKind.Sequential)] struct Info {
    public uint Attributes;
    public System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
    public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
  }
  [StructLayout(LayoutKind.Sequential)] struct Disposition {
    [MarshalAs(UnmanagedType.U1)] public bool DeleteFile;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern SafeFileHandle CreateFileW(string path, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool GetFileInformationByHandle(SafeFileHandle handle, out Info info);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle, StringBuilder path, uint size, uint flags);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern uint GetFileType(SafeFileHandle handle);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool GetVolumeInformationByHandleW(SafeFileHandle handle, StringBuilder label, uint labelSize,
    out uint serial, out uint maximumComponent, out uint flags, StringBuilder fileSystem, uint fileSystemSize);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)]
  static extern uint GetDriveTypeW(string root);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool SetFileInformationByHandle(SafeFileHandle handle, int kind, ref Disposition info, uint size);

  static void Refuse(string code) { throw new InvalidOperationException(code); }
  static void NativeFailure(int error) {
    if (error == 32 || error == 33) Refuse("DOCUMENT_SOURCE_BUSY");
    if (error == 5) Refuse("DOCUMENT_SOURCE_ACCESS_DENIED");
    Refuse("DOCUMENT_SOURCE_UNSUPPORTED");
  }
  public static void RequireSupportedFileSystem(string fileSystem) {
    // The reviewed identity is NTFS's 64-bit file ID. ReFS needs a separate
    // 128-bit identity implementation; other Windows filesystems are not claimed.
    if (!String.Equals(fileSystem, "NTFS", StringComparison.OrdinalIgnoreCase)) Refuse("DOCUMENT_SOURCE_UNSUPPORTED");
  }
  static Info Describe(SafeFileHandle handle, string path) {
    Info info;
    if (!GetFileInformationByHandle(handle, out info)) NativeFailure(Marshal.GetLastWin32Error());
    if (GetFileType(handle) != 1 || (info.Attributes & (0x10 | 0x400)) != 0 || info.Links != 1)
      Refuse("DOCUMENT_SOURCE_UNSUPPORTED");
    uint serial, maximumComponent, flags;
    var fileSystem = new StringBuilder(64);
    if (!GetVolumeInformationByHandleW(handle, null, 0, out serial, out maximumComponent, out flags, fileSystem, (uint)fileSystem.Capacity))
      NativeFailure(Marshal.GetLastWin32Error());
    RequireSupportedFileSystem(fileSystem.ToString());
    if (serial != info.Volume) Refuse("DOCUMENT_SOURCE_UNSUPPORTED");
    var final = new StringBuilder(32768);
    uint count = GetFinalPathNameByHandleW(handle, final, (uint)final.Capacity, 0);
    if (count == 0 || count >= final.Capacity) Refuse("DOCUMENT_SOURCE_UNSUPPORTED");
    string actual = final.ToString();
    if (!actual.StartsWith(@"\\?\", StringComparison.Ordinal)) Refuse("DOCUMENT_SOURCE_UNSUPPORTED");
    actual = actual.Substring(4);
    if (!String.Equals(actual, path, StringComparison.OrdinalIgnoreCase)) Refuse("DOCUMENT_SOURCE_UNSUPPORTED");
    return info;
  }
  static string FileId(Info info) { return (((ulong)info.IndexHigh << 32) | info.IndexLow).ToString(); }

  public static DocumentSourceResult Run(string action, string path, string volume, string fileId, string expectedHash) {
    bool deleting = action == "delete";
    if (!deleting && action != "inspect") Refuse("DOCUMENT_SOURCE_UNSUPPORTED");
    if (String.IsNullOrEmpty(path) || path.Length < 4 || path[1] != ':' || path[2] != '\\' ||
        !String.Equals(Path.GetFullPath(path), path, StringComparison.OrdinalIgnoreCase)) Refuse("DOCUMENT_SOURCE_UNSUPPORTED");
    uint drive = GetDriveTypeW(Path.GetPathRoot(path));
    if (drive != 2 && drive != 3) Refuse("DOCUMENT_SOURCE_UNSUPPORTED");
    // One fixed handle denies writes and renames while identity/hash are checked.
    // Deletion is exclusive so another read handle cannot leave delete-pending data.
    using (SafeFileHandle handle = CreateFileW(path, deleting ? 0x80010000u : 0x80000000u,
        deleting ? 0u : 1u, IntPtr.Zero, 3, 0x02200000u, IntPtr.Zero)) {
      if (handle.IsInvalid) {
        int error = Marshal.GetLastWin32Error();
        if (error == 2 || error == 3) return new DocumentSourceResult { status="missing", path=path };
        NativeFailure(error);
      }
      Info before = Describe(handle, path);
      string actualVolume = before.Volume.ToString(), actualId = FileId(before);
      if (deleting && (actualVolume != volume || actualId != fileId)) Refuse("DOCUMENT_SOURCE_CHANGED");
      string hash;
      // FileStream owns this same SafeFileHandle; no second path open is used.
      using (var stream = new FileStream(handle, FileAccess.Read, 65536, false)) {
        using (var sha = SHA256.Create()) {
          hash = BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
        }
        Info after = Describe(handle, path);
        if (after.Volume != before.Volume || FileId(after) != actualId || after.SizeHigh != before.SizeHigh || after.SizeLow != before.SizeLow ||
            after.Write.dwHighDateTime != before.Write.dwHighDateTime || after.Write.dwLowDateTime != before.Write.dwLowDateTime)
          Refuse("DOCUMENT_SOURCE_CHANGED");
        if (deleting) {
          if (hash != expectedHash) Refuse("DOCUMENT_SOURCE_CHANGED");
          var disposition = new Disposition { DeleteFile = true };
          if (!SetFileInformationByHandle(handle, 4, ref disposition, (uint)Marshal.SizeOf(typeof(Disposition)))) NativeFailure(Marshal.GetLastWin32Error());
        }
      }
      return new DocumentSourceResult { status=deleting ? "deleted" : "present", path=path,
        identity=new DocumentSourceIdentity { volumeSerialNumber=actualVolume, fileId=actualId }, sha256=hash };
    }
  }
}
'@
  $volume = if ($request.identity) { [string]$request.identity.volumeSerialNumber } else { '' }
  $fileId = if ($request.identity) { [string]$request.identity.fileId } else { '' }
  $result = [DocumentSourceNative]::Run([string]$request.action, [string]$request.path, $volume, $fileId, [string]$request.sha256)
  [Console]::Out.WriteLine(($result | ConvertTo-Json -Depth 5 -Compress))
} catch {
  $exception = $_.Exception
  while ($exception.InnerException) { $exception = $exception.InnerException }
  $code = if ($exception.Message -match '^DOCUMENT_SOURCE_[A-Z_]+$') { $exception.Message } else { 'DOCUMENT_SOURCE_UNCERTAIN' }
  [Console]::Out.WriteLine((@{ error = $code } | ConvertTo-Json -Compress))
  exit 1
}
