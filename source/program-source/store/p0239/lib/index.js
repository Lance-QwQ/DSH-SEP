// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/win32-process/src/abi.ts
var STARTF_USESTDHANDLES = 256;
var STARTF_USESHOWWINDOW = 1;
var SW_HIDE = 0;
var HANDLE_FLAG_INHERIT = 1;
var INFINITE = 4294967295;
var WAIT_TIMEOUT = 258;
var CREATE_NEW_PROCESS_GROUP = 512;
var CREATE_SUSPENDED = 4;
var CREATE_UNICODE_ENVIRONMENT = 1024;
var STD_INPUT_HANDLE = -10;
var STD_OUTPUT_HANDLE = -11;
var STD_ERROR_HANDLE = -12;
var FORMAT_MESSAGE_FROM_SYSTEM = 4096;
var FORMAT_MESSAGE_IGNORE_INSERTS = 512;
var ERROR_INSUFFICIENT_BUFFER = 122;
var ERROR_BROKEN_PIPE = 109;
var ERROR_NO_DATA = 232;
var JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 8192;
var JobObjectBasicAccountingInformation = 1;
var JobObjectExtendedLimitInformation = 9;
var JOBOBJECT_BASIC_ACCOUNTING_SIZE = 48;
var JOBOBJECT_BASIC_ACCOUNTING_ACTIVE_PROCESSES_OFFSET = 40;
var JOBOBJECT_EXTENDED_LIMIT_SIZE = 144;
var JOBOBJECT_EXTENDED_LIMIT_FLAGS_OFFSET = 16;
var STARTUPINFOW_SIZE = 104;
var PROCESS_INFORMATION_SIZE = 24;

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/win32-process/src/errors.ts
var Win32Error = class extends Error {
  /** Win32 function whose checked result failed. */
  api;
  /** Exact GetLastError value or direct Win32 API error code. */
  win32Code;
  constructor(api, win32Code, detail) {
    super(`${api} failed (Win32 ${win32Code})${detail === void 0 ? "" : `: ${detail}`}`);
    this.name = "Win32Error";
    this.api = api;
    this.win32Code = win32Code;
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/win32-process/src/koffi.ts
import { createLazyRequire } from "@deepseek-ai/dsh-lazy-require";
var requireKoffi = createLazyRequire("koffi", import.meta.url);

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/win32-process/src/ffi.ts
function isNullPtr(value) {
  return value === null || value === void 0 || value === 0n;
}
var cachedTypes;
function win32Types() {
  if (cachedTypes !== void 0) return cachedTypes;
  const koffi = requireKoffi();
  const PVOID = koffi.pointer("void");
  const PPVOID = koffi.pointer(PVOID);
  const STARTUPINFOW = koffi.struct("DSH_STARTUPINFOW", {
    cb: "uint32",
    lpReserved: "str16",
    lpDesktop: "str16",
    lpTitle: "str16",
    dwX: "uint32",
    dwY: "uint32",
    dwXSize: "uint32",
    dwYSize: "uint32",
    dwXCountChars: "uint32",
    dwYCountChars: "uint32",
    dwFillAttribute: "uint32",
    dwFlags: "uint32",
    wShowWindow: "uint16",
    cbReserved2: "uint16",
    lpReserved2: koffi.pointer("uint8"),
    hStdInput: PVOID,
    hStdOutput: PVOID,
    hStdError: PVOID
  });
  const PROCESS_INFORMATION = koffi.struct("DSH_PROCESS_INFORMATION", {
    hProcess: PVOID,
    hThread: PVOID,
    dwProcessId: "uint32",
    dwThreadId: "uint32"
  });
  if (STARTUPINFOW.size !== STARTUPINFOW_SIZE) {
    throw new Error(`STARTUPINFOW layout mismatch: koffi computed ${STARTUPINFOW.size}, expected ${STARTUPINFOW_SIZE}`);
  }
  if (PROCESS_INFORMATION.size !== PROCESS_INFORMATION_SIZE) {
    throw new Error(`PROCESS_INFORMATION layout mismatch: koffi computed ${PROCESS_INFORMATION.size}, expected ${PROCESS_INFORMATION_SIZE}`);
  }
  return cachedTypes = { PVOID, PPVOID, STARTUPINFOW, PROCESS_INFORMATION };
}
function allocPtrSlot() {
  const { PVOID } = win32Types();
  return requireKoffi().alloc(PVOID, 1);
}
function allocUint32() {
  return requireKoffi().alloc("uint32", 1);
}
function decodePtr(slot) {
  const value = requireKoffi().decode(slot, win32Types().PVOID);
  return isNullPtr(value) ? null : value;
}
function decodeUint32(slot) {
  return requireKoffi().decode(slot, "uint32");
}
function allocStartupInfo() {
  return requireKoffi().alloc(win32Types().STARTUPINFOW, 1);
}
function encodeStartupInfo(startupInfo, fields) {
  requireKoffi().encode(startupInfo, win32Types().STARTUPINFOW, fields);
}
function allocProcessInfo() {
  return requireKoffi().alloc(win32Types().PROCESS_INFORMATION, 1);
}
function decodeProcessInfo(processInfo) {
  return requireKoffi().decode(processInfo, win32Types().PROCESS_INFORMATION);
}
var cachedContext;
var cached;
function bindingContext() {
  if (cachedContext !== void 0) return cachedContext;
  const koffi = requireKoffi();
  const kernel32 = koffi.load("kernel32.dll");
  const advapi32 = koffi.load("advapi32.dll");
  const bind = (lib, name, result, args) => lib.func("__stdcall", name, result, args);
  cachedContext = { kernel32, advapi32, bind };
  return cachedContext;
}
function bindings() {
  if (cached !== void 0) return cached;
  const koffi = requireKoffi();
  const { PVOID, PPVOID, STARTUPINFOW, PROCESS_INFORMATION } = win32Types();
  const { kernel32, advapi32, bind } = bindingContext();
  const node = koffi.load(null);
  cached = {
    closeHandle: bind(kernel32, "CloseHandle", "int", [PVOID]),
    getLastError: bind(kernel32, "GetLastError", "uint32", []),
    getFileType: bind(kernel32, "GetFileType", "uint32", [PVOID]),
    formatMessageW: bind(kernel32, "FormatMessageW", "uint32", [
      "uint32",
      PVOID,
      "uint32",
      "uint32",
      PVOID,
      "uint32",
      PVOID
    ]),
    createPipe: bind(kernel32, "CreatePipe", "int", [PPVOID, PPVOID, PVOID, "uint32"]),
    setHandleInformation: bind(kernel32, "SetHandleInformation", "int", [PVOID, "uint32", "uint32"]),
    createProcessAsUserW: bind(advapi32, "CreateProcessAsUserW", "int", [
      PVOID,
      "str16",
      "str16",
      PVOID,
      PVOID,
      "int",
      "uint32",
      PVOID,
      "str16",
      koffi.pointer(STARTUPINFOW),
      koffi.pointer(PROCESS_INFORMATION)
    ]),
    createProcessW: bind(kernel32, "CreateProcessW", "int", [
      "str16",
      "str16",
      PVOID,
      PVOID,
      "int",
      "uint32",
      PVOID,
      "str16",
      koffi.pointer(STARTUPINFOW),
      koffi.pointer(PROCESS_INFORMATION)
    ]),
    readFile: bind(kernel32, "ReadFile", "int", [PVOID, PVOID, "uint32", koffi.pointer("uint32"), PVOID]),
    peekNamedPipe: bind(kernel32, "PeekNamedPipe", "int", [
      PVOID,
      PVOID,
      "uint32",
      koffi.pointer("uint32"),
      koffi.pointer("uint32"),
      koffi.pointer("uint32")
    ]),
    waitForSingleObject: bind(kernel32, "WaitForSingleObject", "uint32", [PVOID, "uint32"]),
    getExitCodeProcess: bind(kernel32, "GetExitCodeProcess", "int", [PVOID, koffi.pointer("uint32")]),
    createJobObjectW: bind(kernel32, "CreateJobObjectW", PVOID, [PVOID, "str16"]),
    setInformationJobObject: bind(kernel32, "SetInformationJobObject", "int", [PVOID, "int", PVOID, "uint32"]),
    queryInformationJobObject: bind(kernel32, "QueryInformationJobObject", "int", [
      PVOID,
      "int",
      PVOID,
      "uint32",
      PVOID
    ]),
    assignProcessToJobObject: bind(kernel32, "AssignProcessToJobObject", "int", [PVOID, PVOID]),
    resumeThread: bind(kernel32, "ResumeThread", "uint32", [PVOID]),
    terminateProcess: bind(kernel32, "TerminateProcess", "int", [PVOID, "uint32"]),
    terminateJobObject: bind(kernel32, "TerminateJobObject", "int", [PVOID, "uint32"]),
    getStdHandle: bind(kernel32, "GetStdHandle", PVOID, ["int"]),
    uvGetOsfhandle: node.func("uv_get_osfhandle", PVOID, ["int"]),
    freeConsole: bind(kernel32, "FreeConsole", "int", []),
    attachConsole: bind(kernel32, "AttachConsole", "int", ["uint32"]),
    generateConsoleCtrlEvent: bind(kernel32, "GenerateConsoleCtrlEvent", "int", ["uint32", "uint32"])
  };
  return cached;
}
function extendWin32ProcessBindings(create) {
  return { ...bindings(), ...create(bindingContext()) };
}
function loadWin32ProcessBindings() {
  return bindings();
}
function errorText(api, win32Code) {
  const buffer = Buffer.alloc(1024);
  const length = api.formatMessageW(
    FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
    null,
    win32Code,
    0,
    buffer,
    buffer.length / 2,
    null
  );
  return length === 0 ? "" : buffer.subarray(0, length * 2).toString("utf16le").trim();
}
function throwLastError(api, name, detail) {
  const win32Code = api.getLastError();
  throw new Win32Error(name, win32Code, detail ?? errorText(api, win32Code));
}
function throwWin32(api, name, win32Code, detail) {
  throw new Win32Error(name, win32Code, detail ?? errorText(api, win32Code));
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/win32-process/src/control-stdio.ts
var HANDLE_BYTES = 8;
var INVALID_HANDLE = 0xffffffffffffffffn;
var FOPEN = 1;
var FPIPE = 8;
var FDEV = 64;
var FILE_TYPE_CHAR = 2;
var FILE_TYPE_PIPE = 3;
function inheritedControlStdio(api, stdio) {
  const count = stdio.control.fileDescriptor + 1;
  const handleOffset = 4 + count;
  const bytes = Buffer.alloc(handleOffset + count * HANDLE_BYTES);
  bytes.writeUInt32LE(count, 0);
  for (let index = 0; index < count; index++) {
    bytes.writeBigUInt64LE(INVALID_HANDLE, handleOffset + index * HANDLE_BYTES);
  }
  const entries = [[0, stdio.stdin], [1, stdio.stdout], [2, stdio.stderr], [stdio.control.fileDescriptor, stdio.control.handle]];
  for (const [fd, handle] of entries) {
    const kind = api.getFileType(handle);
    if (fd === stdio.control.fileDescriptor && kind !== FILE_TYPE_PIPE) {
      throw new Error("subprocess control descriptor is not a Windows pipe");
    }
    bytes[4 + fd] = FOPEN | (kind === FILE_TYPE_PIPE ? FPIPE : kind === FILE_TYPE_CHAR ? FDEV : 0);
    bytes.writeBigUInt64LE(handle, handleOffset + fd * HANDLE_BYTES);
  }
  return bytes;
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/win32-process/src/process.ts
function quoteArg(argument) {
  if (argument === "") return '""';
  if (!/[\s"]/u.test(argument)) return argument;
  let quoted = '"';
  for (let index = 0; index < argument.length; index++) {
    let backslashes = 0;
    while (index < argument.length && argument.charAt(index) === "\\") {
      backslashes += 1;
      index += 1;
    }
    if (index === argument.length) {
      quoted += "\\".repeat(backslashes * 2);
    } else if (argument.charAt(index) === '"') {
      quoted += "\\".repeat(backslashes * 2 + 1) + '"';
    } else {
      quoted += "\\".repeat(backslashes) + argument.charAt(index);
    }
  }
  return quoted + '"';
}
function buildCommandLine(program, args) {
  return [program, ...args].map(quoteArg).join(" ");
}
function compareWindowsEnvironmentKeys([left], [right]) {
  const foldedLeft = left.toUpperCase();
  const foldedRight = right.toUpperCase();
  return foldedLeft < foldedRight ? -1 : foldedLeft > foldedRight ? 1 : 0;
}
function encodeWindowsEnvironment(env) {
  const entries = Object.entries(env).sort(compareWindowsEnvironmentKeys);
  const strings = entries.map(([key, value]) => `${key}=${value}`);
  return Buffer.from(`${strings.join("\0")}\0\0`, "utf16le");
}
function freeNative(pointer) {
  if (pointer !== void 0) requireKoffi().free(pointer);
}
function closeBestEffort(api, handle) {
  if (!isNullPtr(handle)) api.closeHandle(handle);
}
function createPipe(api, owned) {
  const readSlot = allocPtrSlot();
  let writeSlot;
  try {
    writeSlot = allocPtrSlot();
    if (api.createPipe(readSlot, writeSlot, null, 0) === 0) throwLastError(api, "CreatePipe");
    const read = decodePtr(readSlot);
    const write = decodePtr(writeSlot);
    if (read === null || write === null) {
      closeBestEffort(api, read);
      closeBestEffort(api, write);
      throwLastError(api, "CreatePipe", "null pipe handle");
    }
    owned.add(read);
    owned.add(write);
    return { read, write };
  } finally {
    freeNative(writeSlot);
    requireKoffi().free(readSlot);
  }
}
function closeOwned(api, owned, handle) {
  if (!owned.delete(handle)) return;
  api.closeHandle(handle);
}
function closeAllOwned(api, owned) {
  for (const handle of owned) api.closeHandle(handle);
  owned.clear();
}
function createRestrictedProcess(api, options, commandLine, creationFlags, startupInfo, processInfo) {
  return api.createProcessAsUserW(
    options.token,
    null,
    commandLine,
    null,
    null,
    1,
    creationFlags,
    null,
    options.cwd,
    startupInfo,
    processInfo
  );
}
function spawnPipedProcess(api, options) {
  const owned = /* @__PURE__ */ new Set();
  let startupInfo;
  let processInfo;
  try {
    const stdIn = createPipe(api, owned);
    const stdOut = createPipe(api, owned);
    const stdErr = createPipe(api, owned);
    for (const [handle, label] of [
      [stdIn.read, "stdin read end"],
      [stdOut.write, "stdout write end"],
      [stdErr.write, "stderr write end"]
    ]) {
      if (api.setHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT) === 0) {
        throwLastError(api, "SetHandleInformation", label);
      }
    }
    startupInfo = allocStartupInfo();
    encodeStartupInfo(startupInfo, {
      cb: STARTUPINFOW_SIZE,
      dwFlags: STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW,
      wShowWindow: SW_HIDE,
      hStdInput: stdIn.read,
      hStdOutput: stdOut.write,
      hStdError: stdErr.write
    });
    processInfo = allocProcessInfo();
    const created = createRestrictedProcess(
      api,
      options,
      buildCommandLine(options.command, options.args),
      0,
      startupInfo,
      processInfo
    );
    if (created === 0) {
      const win32Code = api.getLastError();
      throwWin32(api, "CreateProcessAsUserW", win32Code, `command: ${options.command}, cwd: ${options.cwd}`);
    }
    const info = decodeProcessInfo(processInfo);
    if (info.hProcess === null || info.hThread === null) {
      if (info.hProcess !== null) api.terminateProcess(info.hProcess, 1);
      closeBestEffort(api, info.hThread);
      closeBestEffort(api, info.hProcess);
      throw new Error(`CreateProcessAsUserW succeeded but returned null process/thread handles (pid ${info.dwProcessId})`);
    }
    closeOwned(api, owned, stdIn.read);
    closeOwned(api, owned, stdIn.write);
    closeOwned(api, owned, stdOut.write);
    closeOwned(api, owned, stdErr.write);
    closeBestEffort(api, info.hThread);
    owned.delete(stdOut.read);
    owned.delete(stdErr.read);
    return {
      pid: info.dwProcessId,
      process: info.hProcess,
      stdoutRead: stdOut.read,
      stderrRead: stdErr.read
    };
  } catch (error) {
    closeAllOwned(api, owned);
    throw error;
  } finally {
    freeNative(processInfo);
    freeNative(startupInfo);
  }
}
async function drainPipe(api, handle) {
  const chunks = [];
  let countSlot;
  try {
    countSlot = allocUint32();
    for (; ; ) {
      const peeked = api.peekNamedPipe(handle, null, 0, null, countSlot, null);
      if (peeked === 0) {
        const win32Code = api.getLastError();
        if (win32Code === ERROR_BROKEN_PIPE || win32Code === ERROR_NO_DATA) break;
        throwLastError(api, "PeekNamedPipe", `drain failure after ${chunks.length} chunk(s)`);
      }
      const available = decodeUint32(countSlot);
      if (available > 0) {
        const chunk = Buffer.alloc(available);
        if (api.readFile(handle, chunk, chunk.length, countSlot, null) === 0) {
          throwLastError(api, "ReadFile", `drain failure after ${chunks.length} chunk(s)`);
        }
        chunks.push(chunk.subarray(0, decodeUint32(countSlot)));
      }
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    return Buffer.concat(chunks);
  } finally {
    freeNative(countSlot);
    api.closeHandle(handle);
  }
}
function waitForProcessExit(api, process) {
  let exitCodeSlot;
  try {
    if (api.waitForSingleObject(process, INFINITE) === 4294967295) {
      throwLastError(api, "WaitForSingleObject");
    }
    exitCodeSlot = allocUint32();
    if (api.getExitCodeProcess(process, exitCodeSlot) === 0) throwLastError(api, "GetExitCodeProcess");
    return decodeUint32(exitCodeSlot);
  } finally {
    freeNative(exitCodeSlot);
    api.closeHandle(process);
  }
}
function createKillOnCloseJob(api) {
  const job = api.createJobObjectW(null, null);
  if (isNullPtr(job)) throwLastError(api, "CreateJobObjectW");
  const information = Buffer.alloc(JOBOBJECT_EXTENDED_LIMIT_SIZE);
  information.writeUInt32LE(
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    JOBOBJECT_EXTENDED_LIMIT_FLAGS_OFFSET
  );
  if (api.setInformationJobObject(
    job,
    JobObjectExtendedLimitInformation,
    information,
    information.length
  ) === 0) {
    const win32Code = api.getLastError();
    api.closeHandle(job);
    throwWin32(api, "SetInformationJobObject", win32Code);
  }
  return job;
}
var UV_INVALID_OS_FILE_HANDLE = 0xffffffffffffffffn;
var UV_INVALID_FILE_DESCRIPTOR = 0xfffffffffffffffen;
function inheritedStandardHandles(api, controlFileDescriptor) {
  const get = (selector, label) => {
    const handle = api.getStdHandle(selector);
    if (!isNullPtr(handle)) return handle;
    throwLastError(api, "GetStdHandle", `null ${label} handle`);
  };
  return {
    stdin: get(STD_INPUT_HANDLE, "stdin"),
    stdout: get(STD_OUTPUT_HANDLE, "stdout"),
    stderr: get(STD_ERROR_HANDLE, "stderr"),
    ...controlFileDescriptor === void 0 ? {} : {
      control: { fileDescriptor: controlFileDescriptor, handle: descriptorHandle(api, controlFileDescriptor, "control") }
    }
  };
}
function descriptorHandle(api, fileDescriptor, label) {
  const handle = api.uvGetOsfhandle(fileDescriptor);
  if (isNullPtr(handle) || handle === UV_INVALID_OS_FILE_HANDLE || handle === UV_INVALID_FILE_DESCRIPTOR) {
    throw new Error(`uv_get_osfhandle returned an invalid handle for target ${label} fd ${String(fileDescriptor)}`);
  }
  return handle;
}
function targetCarrierHandles(api, descriptors) {
  return {
    stdin: descriptorHandle(api, descriptors.stdin, "stdin"),
    stdout: descriptorHandle(api, descriptors.stdout, "stdout"),
    stderr: descriptorHandle(api, descriptors.stderr, "stderr"),
    ...descriptors.control === void 0 ? {} : {
      control: { fileDescriptor: descriptors.control, handle: descriptorHandle(api, descriptors.control, "control") }
    }
  };
}
function spawnJobProcess(api, options, resolveStdio, createName, create) {
  const job = createKillOnCloseJob(api);
  const enabled = [];
  let startupInfo;
  let processInfo;
  let controlDescriptorBlock;
  let created = 0;
  let createFailureCode = 0;
  try {
    const stdio = resolveStdio();
    const inherited = [
      [stdio.stdin, "stdin"],
      [stdio.stdout, "stdout"],
      [stdio.stderr, "stderr"]
    ];
    if (stdio.control !== void 0) inherited.push([stdio.control.handle, "control"]);
    for (const [handle, label] of inherited) {
      if (api.setHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT) === 0) {
        throwLastError(api, "SetHandleInformation", `${label} (enable inherit)`);
      }
      enabled.push(handle);
    }
    const controlBytes = stdio.control === void 0 ? void 0 : inheritedControlStdio(api, { ...stdio, control: stdio.control });
    if (controlBytes !== void 0) {
      const koffi = requireKoffi();
      controlDescriptorBlock = { pointer: koffi.alloc("uint8", controlBytes.length), length: controlBytes.length };
      koffi.encode(controlDescriptorBlock.pointer, "uint8", controlBytes, controlBytes.length);
    }
    startupInfo = allocStartupInfo();
    encodeStartupInfo(startupInfo, {
      cb: STARTUPINFOW_SIZE,
      // Preserve console inheritance: CREATE_NO_WINDOW can fail restricted-token DLL initialization.
      dwFlags: STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW,
      wShowWindow: SW_HIDE,
      hStdInput: stdio.stdin,
      hStdOutput: stdio.stdout,
      hStdError: stdio.stderr,
      ...controlDescriptorBlock === void 0 ? {} : {
        cbReserved2: controlDescriptorBlock.length,
        lpReserved2: controlDescriptorBlock.pointer
      }
    });
    processInfo = allocProcessInfo();
    created = create(startupInfo, processInfo);
    if (created === 0) createFailureCode = api.getLastError();
  } catch (error) {
    freeNative(processInfo);
    api.closeHandle(job);
    throw error;
  } finally {
    freeNative(startupInfo);
    freeNative(controlDescriptorBlock?.pointer);
    for (const handle of enabled) {
      api.setHandleInformation(handle, HANDLE_FLAG_INHERIT, 0);
    }
  }
  if (created === 0) {
    freeNative(processInfo);
    api.closeHandle(job);
    throwWin32(
      api,
      createName,
      createFailureCode,
      `command: ${options.command}, cwd: ${options.cwd}`
    );
  }
  let info;
  try {
    info = decodeProcessInfo(processInfo);
  } finally {
    freeNative(processInfo);
  }
  if (info.hProcess === null || info.hThread === null) {
    if (info.hProcess !== null) api.terminateProcess(info.hProcess, 1);
    api.closeHandle(job);
    closeBestEffort(api, info.hThread);
    closeBestEffort(api, info.hProcess);
    throw new Error(`${createName} succeeded but returned null process/thread handles (pid ${info.dwProcessId})`);
  }
  if (api.assignProcessToJobObject(job, info.hProcess) === 0) {
    const win32Code = api.getLastError();
    api.terminateProcess(info.hProcess, 1);
    closeBestEffort(api, info.hThread);
    closeBestEffort(api, info.hProcess);
    api.closeHandle(job);
    throwWin32(api, "AssignProcessToJobObject", win32Code, `pid ${info.dwProcessId}`);
  }
  if (api.resumeThread(info.hThread) === 4294967295) {
    const win32Code = api.getLastError();
    closeBestEffort(api, info.hThread);
    closeBestEffort(api, info.hProcess);
    api.closeHandle(job);
    throwWin32(api, "ResumeThread", win32Code, `pid ${info.dwProcessId}`);
  }
  closeBestEffort(api, info.hThread);
  return { pid: info.dwProcessId, process: info.hProcess, job };
}
function spawnInheritedJobProcess(api, options) {
  const commandLine = buildCommandLine(options.command, options.args);
  return spawnJobProcess(api, options, () => inheritedStandardHandles(api, options.controlFileDescriptor), "CreateProcessAsUserW", (startupInfo, processInfo) => createRestrictedProcess(
    api,
    options,
    commandLine,
    CREATE_SUSPENDED,
    startupInfo,
    processInfo
  ));
}
function spawnCurrentTokenJobProcess(api, options) {
  const commandLine = buildCommandLine(options.command, options.args);
  const environment = encodeWindowsEnvironment(options.env);
  return spawnJobProcess(api, options, () => targetCarrierHandles(api, options.stdio), "CreateProcessW", (startupInfo, processInfo) => api.createProcessW(
    options.applicationName,
    commandLine,
    null,
    null,
    1,
    CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT | CREATE_NEW_PROCESS_GROUP,
    environment,
    options.cwd,
    startupInfo,
    processInfo
  ));
}
function probeCurrentTokenJobSupport(api) {
  const job = createKillOnCloseJob(api);
  closeHandleChecked(api, job, "current-token Job capability probe");
}
function pollProcessExit(api, process) {
  const waitResult = api.waitForSingleObject(process, 0);
  if (waitResult === WAIT_TIMEOUT) return void 0;
  if (waitResult === 4294967295) throwLastError(api, "WaitForSingleObject");
  const exitCodeSlot = allocUint32();
  try {
    if (api.getExitCodeProcess(process, exitCodeSlot) === 0) throwLastError(api, "GetExitCodeProcess");
    return decodeUint32(exitCodeSlot);
  } finally {
    requireKoffi().free(exitCodeSlot);
  }
}
function isJobEmpty(api, job) {
  const information = Buffer.alloc(JOBOBJECT_BASIC_ACCOUNTING_SIZE);
  if (api.queryInformationJobObject(
    job,
    JobObjectBasicAccountingInformation,
    information,
    information.length,
    null
  ) === 0) {
    throwLastError(api, "QueryInformationJobObject", "active process count");
  }
  return information.readUInt32LE(JOBOBJECT_BASIC_ACCOUNTING_ACTIVE_PROCESSES_OFFSET) === 0;
}
function terminateJob(api, job, exitCode) {
  if (api.terminateJobObject(job, exitCode) === 0) throwLastError(api, "TerminateJobObject");
}
function requestNormalStop(api, process, pid) {
  if (pollProcessExit(api, process) !== void 0) return "root-exited";
  api.freeConsole();
  if (api.attachConsole(pid) === 0) return "unavailable";
  try {
    return api.generateConsoleCtrlEvent(1, pid) === 0 ? "unavailable" : "sent";
  } finally {
    api.freeConsole();
  }
}
function closeHandleChecked(api, handle, detail) {
  if (api.closeHandle(handle) === 0) throwLastError(api, "CloseHandle", detail);
}
export {
  ERROR_INSUFFICIENT_BUFFER,
  Win32Error,
  allocPtrSlot,
  allocUint32,
  closeHandleChecked,
  decodePtr,
  decodeUint32,
  drainPipe,
  extendWin32ProcessBindings,
  isJobEmpty,
  isNullPtr,
  loadWin32ProcessBindings,
  pollProcessExit,
  probeCurrentTokenJobSupport,
  requestNormalStop,
  spawnCurrentTokenJobProcess,
  spawnInheritedJobProcess,
  spawnPipedProcess,
  terminateJob,
  throwLastError,
  throwWin32,
  waitForProcessExit
};
//# sourceMappingURL=index.js.map
