using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.IO;

namespace DshSep {
  // Created before the child starts; descendants inherit this private Windows Job.
  // Closing this bridge (including forced termination) kills only this Job's processes.
  public static class OfficeJobBridge {
    [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong a,b,c,d,e,f; }
    [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT { public long a,b; public uint LimitFlags; public UIntPtr c,d; public uint e; public UIntPtr f; public uint g,h; }
    [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMIT { public BASIC_LIMIT Basic; public IO_COUNTERS IO; public UIntPtr a,b,c,d; }
    [StructLayout(LayoutKind.Sequential)] struct ACCOUNTING { public long a,b,c,d; public uint TotalPageFaultCount,TotalProcesses,ActiveProcesses,TerminatedProcesses; }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUPINFO { public int cb; public string reserved,desktop,title; public uint x,y,xsize,ysize,xcount,ycount,fill,flags; public short show,reserved2; public IntPtr reservedPtr,input,output,error; }
    [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO startup; public IntPtr attributes; }
    [StructLayout(LayoutKind.Sequential)] struct SECURITY_ATTRIBUTES { public int length; public IntPtr descriptor; [MarshalAs(UnmanagedType.Bool)] public bool inherit; }
    [StructLayout(LayoutKind.Sequential)] struct FILE_INFORMATION { public uint attributes,creationLow,creationHigh,accessLow,accessHigh,writeLow,writeHigh,volumeSerial,sizeHigh,sizeLow,links,indexHigh,indexLow; }
    [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr process,thread; public uint processId,threadId; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attrs, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int info,IntPtr data,uint length);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int info,out ACCOUNTING data,uint length,IntPtr returned);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,uint flags,ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder cmd,IntPtr p,IntPtr t,bool inherit,uint flags,IntPtr env,string cwd,ref STARTUPINFOEX startup,out PROCESS_INFORMATION process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateFile(string path,uint access,uint share,ref SECURITY_ATTRIBUTES attributes,uint disposition,uint flags,IntPtr template);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern uint GetShortPathName(string path,StringBuilder buffer,uint length);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(IntPtr file,out FILE_INFORMATION information);
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int value);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    static string Quote(string value) {
      var result = new StringBuilder("\""); int slashes=0;
      foreach(char c in value) {
        if(c=='\\') {slashes++;continue;}
        if(c=='\"') {result.Append('\\',slashes*2+1);result.Append(c);slashes=0;continue;}
        result.Append('\\',slashes);slashes=0;result.Append(c);
      }
      result.Append('\\',slashes*2);result.Append('"');return result.ToString();
    }
    static FILE_INFORMATION DirectoryIdentity(string path) {
      var security=new SECURITY_ATTRIBUTES();security.length=Marshal.SizeOf(security);
      IntPtr handle=CreateFile(path,0x80,7,ref security,3,0x02200000,IntPtr.Zero);
      if(handle==new IntPtr(-1))throw new Win32Exception(Marshal.GetLastWin32Error());
      try {FILE_INFORMATION info;if(!GetFileInformationByHandle(handle,out info))throw new Win32Exception(Marshal.GetLastWin32Error());if((info.attributes&0x10)==0||(info.attributes&0x400)!=0||(info.indexHigh==0&&info.indexLow==0))throw new InvalidOperationException("Directory identity is unavailable.");return info;}
      finally {CloseHandle(handle);}
    }
    static string BoundedDirectoryAlias(string path,string label) {
      // Conservative adapter support bound, not LibreOffice's universal threshold.
      const int maximum=128;string candidate=path;
      if(path.Length>maximum) {
        var shortName=new StringBuilder(32768);
        if(GetShortPathName(path,shortName,(uint)shortName.Capacity)==0)throw new InvalidOperationException(label+"_PATH_UNSUPPORTED: a verified short alias is unavailable; choose a shorter writable workRoot.");
        candidate=shortName.ToString();
      }
      if(candidate.Length>maximum)throw new InvalidOperationException(label+"_PATH_TOO_LONG: no supported short alias; choose a shorter writable workRoot.");
      var original=DirectoryIdentity(path);var alias=DirectoryIdentity(candidate);
      if(original.volumeSerial!=alias.volumeSerial||original.indexHigh!=alias.indexHigh||original.indexLow!=alias.indexLow)throw new InvalidOperationException(label+"_PATH_IDENTITY_MISMATCH");
      return candidate;
    }
    public static int Run(string executable,string[] args,string cwd) {
      args=(string[])args.Clone();
      for(int i=0;i<args.Length;i++)if(args[i].StartsWith("-env:UserInstallation=",StringComparison.Ordinal)) {
        var uri=new Uri(args[i].Substring(22),UriKind.Absolute);if(!uri.IsFile)throw new InvalidOperationException("PROFILE_PATH_UNSUPPORTED");
        args[i]="-env:UserInstallation="+new Uri(BoundedDirectoryAlias(uri.LocalPath,"PROFILE")).AbsoluteUri;
      }
      // Engine scratch files stay inside the same owned job, even after a native crash.
      string temporary=Path.Combine(cwd,"tmp");Directory.CreateDirectory(temporary);
      string tempAlias=BoundedDirectoryAlias(temporary,"TEMP");
      Environment.SetEnvironmentVariable("TEMP",tempAlias);Environment.SetEnvironmentVariable("TMP",tempAlias);
      Environment.SetEnvironmentVariable("CRASH_DUMP_ENABLE",null);
      IntPtr job=CreateJobObject(IntPtr.Zero,null);
      if(job==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
      PROCESS_INFORMATION process=new PROCESS_INFORMATION(); IntPtr attributes=IntPtr.Zero,jobList=IntPtr.Zero,nullInput=IntPtr.Zero; bool initialized=false,ownerGone=false,finished=false;object ownerGate=new object();
      try {
        var limit=new EXTENDED_LIMIT(); limit.Basic.LimitFlags=0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        int size=Marshal.SizeOf(limit); IntPtr memory=Marshal.AllocHGlobal(size);
        try {Marshal.StructureToPtr(limit,memory,false);if(!SetInformationJobObject(job,9,memory,(uint)size))throw new Win32Exception(Marshal.GetLastWin32Error());}
        finally {Marshal.FreeHGlobal(memory);}
        // stdin is an ownership lease read only by this bridge; the engine gets
        // NUL as stdin. EOF means the one Node host writer disappeared.
        var lease=Console.OpenStandardInput();
        var watcher=new Thread(delegate() {
          try {while(lease.ReadByte()!=-1) {}} catch(IOException) {}
          lock(ownerGate) {ownerGone=true;if(!finished)TerminateJobObject(job,127);}
        });watcher.IsBackground=true;watcher.Start();
        IntPtr bytes=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref bytes);
        attributes=Marshal.AllocHGlobal(bytes);if(!InitializeProcThreadAttributeList(attributes,1,0,ref bytes))throw new Win32Exception(Marshal.GetLastWin32Error());initialized=true;
        jobList=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(jobList,job);
        // PROC_THREAD_ATTRIBUTE_JOB_LIST atomically assigns the Job during CreateProcess.
        // There is no unassigned suspended-child window if the bridge is killed.
        if(!UpdateProcThreadAttribute(attributes,0,new IntPtr(0x2000d),jobList,new IntPtr(IntPtr.Size),IntPtr.Zero,IntPtr.Zero))throw new Win32Exception(Marshal.GetLastWin32Error());
        var security=new SECURITY_ATTRIBUTES();security.length=Marshal.SizeOf(security);security.inherit=true;
        nullInput=CreateFile("NUL",0x80000000,3,ref security,3,0,IntPtr.Zero);if(nullInput==new IntPtr(-1))throw new Win32Exception(Marshal.GetLastWin32Error());
        var startup=new STARTUPINFOEX();startup.attributes=attributes;startup.startup.cb=Marshal.SizeOf(startup);startup.startup.flags=0x100;startup.startup.input=nullInput;startup.startup.output=GetStdHandle(-11);startup.startup.error=GetStdHandle(-12);
        var command=new StringBuilder(Quote(executable));foreach(string arg in args) command.Append(" ").Append(Quote(arg));
        lock(ownerGate) {
          if(ownerGone)throw new InvalidOperationException("The conversion owner has exited.");
          if(!CreateProcess(executable,command,IntPtr.Zero,IntPtr.Zero,true,0x08080004,IntPtr.Zero,cwd,ref startup,out process))throw new Win32Exception(Marshal.GetLastWin32Error()); // extended startup, suspended, no window
          if(ResumeThread(process.thread)==UInt32.MaxValue)throw new Win32Exception(Marshal.GetLastWin32Error());
        }
        if(WaitForSingleObject(process.process,UInt32.MaxValue)!=0)throw new Win32Exception(Marshal.GetLastWin32Error());
        uint code;if(!GetExitCodeProcess(process.process,out code))throw new Win32Exception(Marshal.GetLastWin32Error());
        // Root completion is not sufficient: require all descendants to leave the Job.
        for(int i=0;i<100;i++) { ACCOUNTING account;if(!QueryInformationJobObject(job,1,out account,(uint)Marshal.SizeOf(typeof(ACCOUNTING)),IntPtr.Zero))throw new Win32Exception(Marshal.GetLastWin32Error());if(account.ActiveProcesses==0)return unchecked((int)code);Thread.Sleep(50); }
        throw new InvalidOperationException("Owned descendants remained after the engine exited.");
      } finally {
        lock(ownerGate) {finished=true;}
        if(process.process!=IntPtr.Zero) { TerminateJobObject(job,126);WaitForSingleObject(process.process,5000); }
        if(initialized)DeleteProcThreadAttributeList(attributes);if(attributes!=IntPtr.Zero)Marshal.FreeHGlobal(attributes);if(jobList!=IntPtr.Zero)Marshal.FreeHGlobal(jobList);
        if(nullInput!=IntPtr.Zero&&nullInput!=new IntPtr(-1))CloseHandle(nullInput);
        if(process.thread!=IntPtr.Zero)CloseHandle(process.thread);if(process.process!=IntPtr.Zero)CloseHandle(process.process);CloseHandle(job);
      }
    }
  }
}
