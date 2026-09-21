// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/index.ts
import { constants as constants2 } from "node:fs";
import { access, stat } from "node:fs/promises";
import { userInfo } from "node:os";
import { delimiter, extname as extname2, isAbsolute as isAbsolute3, resolve } from "node:path";
import { createLazyRequire as createLazyRequire3 } from "@deepseek-ai/dsh-lazy-require";
import { SubprocessRuntime, SubprocessExecutableNotFoundError } from "@deepseek-ai/dsh-subprocess";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/spawn.ts
import { spawn, spawnSync as spawnSync2 } from "node:child_process";
import { setTimeout as sleepMs } from "node:timers/promises";
import { scrubbedParentEnv } from "@deepseek-ai/dsh-subprocess";
import { MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/managed-owner.ts
async function waitWithAbort(pending, signal) {
  if (signal?.aborted) {
    void pending.catch(() => {
    });
    return false;
  }
  if (signal === void 0) {
    await pending;
    return true;
  }
  const aborted = Promise.withResolvers();
  const onAbort = () => {
    aborted.resolve(false);
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await Promise.race([pending.then(() => true), aborted.promise]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/control-spawn.ts
import { SUBPROCESS_CONTROL_ENV, SUBPROCESS_CONTROL_FD } from "@deepseek-ai/dsh-subprocess/control";
function controlPipe(child, control) {
  const streams = child.stdio;
  return control === "pipe" ? streams[SUBPROCESS_CONTROL_FD] : void 0;
}
function controlEnvironment(env, control) {
  for (const [key, value] of Object.entries(env)) {
    if (key.toUpperCase() === SUBPROCESS_CONTROL_ENV && value !== void 0) {
      throw new Error(`${SUBPROCESS_CONTROL_ENV} is reserved for subprocess control-channel setup`);
    }
  }
  if (control === "pipe") Object.assign(env, { [SUBPROCESS_CONTROL_ENV]: "pipe" });
  return env;
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/spawn.ts
import { SUBPROCESS_CONTROL_FD as SUBPROCESS_CONTROL_FD2 } from "@deepseek-ai/dsh-subprocess/control";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/process-inspector.ts
import { closeSync, openSync, readFileSync, readdirSync, readlinkSync, readSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/windows-inspector.ts
import { spawnSync } from "node:child_process";
import { createLazyRequire } from "@deepseek-ai/dsh-lazy-require";
var requireKoffi = createLazyRequire("koffi", import.meta.url);
function windowsProcessTree(entries, rootPid, started) {
  const byPid = new Map(entries.map((entry) => [entry.pid, entry]));
  const root = byPid.get(rootPid);
  if (root === void 0) return [];
  const byParent = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const children = byParent.get(entry.parentPid) ?? [];
    children.push(entry);
    byParent.set(entry.parentPid, children);
  }
  const visited = /* @__PURE__ */ new Set();
  const result = [];
  const visit = (entry) => {
    if (visited.has(entry.pid)) return;
    visited.add(entry.pid);
    for (const child of byParent.get(entry.pid) ?? []) visit(child);
    const identity = started(entry.pid);
    if (identity !== void 0) result.push({ pid: entry.pid, started: identity });
  };
  visit(root);
  return result;
}
var WindowsProcessInspector = class {
  constructor(internals = defaultWindowsProcessInternals()) {
    this.internals = internals;
  }
  internals;
  foregroundPgid(shellPid) {
    return shellPid;
  }
  isStdinWaiting(_pgid, _shellPid) {
    return false;
  }
  isAlive(identity) {
    const state = this.internals.processState(identity.pid);
    return state?.active === true && state.started === identity.started;
  }
  snapshot() {
    let entries;
    return {
      tree: (rootPid) => windowsProcessTree(
        entries ??= this.internals.snapshot(),
        rootPid,
        (pid) => this.internals.processState(pid)?.started
      ),
      // Windows has no POSIX sessions; the shell pid stands in as a pseudo group.
      session: () => [],
      alive: (identity) => this.isAlive(identity)
    };
  }
  signalGroup(pgid, signal) {
    this.internals.taskkill(pgid, signal === "SIGKILL");
  }
  signalProcess(identity, signal) {
    if (this.isAlive(identity)) this.internals.taskkill(identity.pid, signal === "SIGKILL");
  }
};
function createWindowsProcessInspector(internals = defaultWindowsProcessInternals()) {
  return new WindowsProcessInspector(internals);
}
function taskkillTree(pid, force) {
  if (pid <= 0) return;
  spawnSync("taskkill", ["/PID", String(pid), "/T", ...force ? ["/F"] : []], {
    stdio: "ignore",
    windowsHide: true
  });
}
function isInvalidHandle(value) {
  if (value === null || value === void 0) return true;
  const asBigInt = value;
  return asBigInt === 0n || asBigInt === 0xFFFFFFFFFFFFFFFFn || asBigInt === -1n;
}
function win32Structs() {
  if (cachedStructs !== void 0) return cachedStructs;
  const koffi = requireKoffi();
  const PVOID = koffi.pointer("void");
  const PROCESSENTRY32W = koffi.struct("PROCESSENTRY32W", {
    dwSize: "uint32",
    cntUsage: "uint32",
    th32ProcessID: "uint32",
    th32DefaultHeapID: PVOID,
    th32ModuleID: "uint32",
    cCntThreads: "uint32",
    th32ParentProcessID: "uint32",
    pcPriClassBase: "int32",
    dwFlags: "uint32",
    szExeFile: koffi.array("char16", 260)
  });
  const FILETIME = koffi.struct("FILETIME", {
    dwLowDateTime: "uint32",
    dwHighDateTime: "uint32"
  });
  if (PROCESSENTRY32W.size !== 568) {
    throw new Error(`PROCESSENTRY32W layout mismatch: koffi computed ${PROCESSENTRY32W.size}, Windows headers say 568`);
  }
  cachedStructs = { PVOID, PROCESSENTRY32W, FILETIME };
  return cachedStructs;
}
var cachedStructs;
var TH32CS_SNAPPROCESS = 2;
var PROCESS_QUERY_LIMITED_INFORMATION = 4096;
var SYNCHRONIZE = 1048576;
var WAIT_OBJECT_0 = 0;
var WAIT_TIMEOUT = 258;
var cachedBindings;
function win32Bindings() {
  if (cachedBindings !== void 0) return cachedBindings;
  const koffi = requireKoffi();
  const { PVOID, PROCESSENTRY32W, FILETIME } = win32Structs();
  const kernel32 = koffi.load("kernel32.dll");
  const bind = (name, result, args) => kernel32.func("__stdcall", name, result, args);
  cachedBindings = {
    createToolhelp32Snapshot: bind("CreateToolhelp32Snapshot", PVOID, ["uint32", "uint32"]),
    process32FirstW: bind("Process32FirstW", "int", [PVOID, koffi.pointer(PROCESSENTRY32W)]),
    process32NextW: bind("Process32NextW", "int", [PVOID, koffi.pointer(PROCESSENTRY32W)]),
    openProcess: bind("OpenProcess", PVOID, ["uint32", "int", "uint32"]),
    getProcessTimes: bind("GetProcessTimes", "int", [
      PVOID,
      koffi.pointer(FILETIME),
      koffi.pointer(FILETIME),
      koffi.pointer(FILETIME),
      koffi.pointer(FILETIME)
    ]),
    waitForSingleObject: bind("WaitForSingleObject", "uint32", [PVOID, "uint32"]),
    closeHandle: bind("CloseHandle", "int", [PVOID])
  };
  return cachedBindings;
}
function allocNative(type, count) {
  const koffi = requireKoffi();
  const value = koffi.alloc(type, count);
  return value;
}
function snapshotWindowsProcesses(bindings) {
  const koffi = requireKoffi();
  const { PROCESSENTRY32W } = win32Structs();
  const snapshot = bindings.createToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (isInvalidHandle(snapshot)) return [];
  const entries = [];
  try {
    const entry = allocNative(PROCESSENTRY32W, 1);
    koffi.encode(entry, "uint32", PROCESSENTRY32W.size);
    let ok = bindings.process32FirstW(snapshot, entry);
    while (ok !== 0) {
      const record = koffi.decode(entry, PROCESSENTRY32W);
      entries.push({ pid: record.th32ProcessID, parentPid: record.th32ParentProcessID });
      ok = bindings.process32NextW(snapshot, entry);
    }
  } finally {
    bindings.closeHandle(snapshot);
  }
  return entries;
}
function windowsProcessState(bindings, pid) {
  const koffi = requireKoffi();
  const { FILETIME } = win32Structs();
  const handle = bindings.openProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, 0, pid);
  if (isInvalidHandle(handle)) return void 0;
  try {
    const creation = allocNative(FILETIME, 1);
    const exit = allocNative(FILETIME, 1);
    const kernel = allocNative(FILETIME, 1);
    const user = allocNative(FILETIME, 1);
    if (bindings.getProcessTimes(handle, creation, exit, kernel, user) === 0) return void 0;
    const record = koffi.decode(creation, FILETIME);
    const wait = bindings.waitForSingleObject(handle, 0);
    if (wait !== WAIT_OBJECT_0 && wait !== WAIT_TIMEOUT) return void 0;
    return {
      started: `${record.dwHighDateTime}:${record.dwLowDateTime}`,
      active: wait === WAIT_TIMEOUT
    };
  } finally {
    bindings.closeHandle(handle);
  }
}
function defaultWindowsProcessInternals() {
  return {
    snapshot: () => snapshotWindowsProcesses(win32Bindings()),
    processState: (pid) => windowsProcessState(win32Bindings(), pid),
    taskkill: taskkillTree
  };
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/process-inspector.ts
var DEFAULT_INTERNALS = {
  readFile: (path) => readFileSync(path, "utf8"),
  readDir: (path) => readdirSync(path),
  readLink: (path) => readlinkSync(path, "utf8"),
  stat: (path) => statSync(path),
  open: (path) => openSync(path, "r"),
  read: (fd, buffer, length, position) => readSync(fd, buffer, 0, length, position),
  close: closeSync,
  exec: (file, args) => execFileSync(file, args, { encoding: "utf8" }),
  kill: (pid, signal) => process.kill(pid, signal)
};
function parseProcStat(text) {
  const open = text.indexOf("(");
  const close = text.lastIndexOf(")");
  if (open <= 0 || close <= open) return void 0;
  const pid = Number(text.slice(0, open).trim());
  const rest = text.slice(close + 2).trim().split(/\s+/);
  const state = rest[0] || "";
  const parentPid = Number(rest[1]);
  const pgrp = Number(rest[2]);
  const session = Number(rest[3]);
  const ttyDevice = Number(rest[4]);
  const tpgid = Number(rest[5]);
  const started = rest[19];
  if (![pid, parentPid, pgrp, session, ttyDevice, tpgid].every(Number.isSafeInteger) || state.length !== 1 || started === void 0) return void 0;
  return { pid, parentPid, pgrp, session, state, ttyDevice, tpgid, started };
}
function readLinuxStat(internals, pid) {
  try {
    return parseProcStat(internals.readFile(`/proc/${pid}/stat`));
  } catch (_unreadableProcEntry) {
    return void 0;
  }
}
function linuxDeviceNumber(value) {
  return value >>> 0;
}
function readLinuxTerminalDevice(internals, pid, ttyDevice, tid) {
  const terminalDevice = linuxDeviceNumber(ttyDevice);
  if (terminalDevice === 0) return void 0;
  const path = tid === void 0 ? `/proc/${pid}/fd/0` : `/proc/${pid}/task/${tid}/fd/0`;
  try {
    const target = internals.readLink(path);
    if (target === "/dev/tty") return terminalDevice;
    const status = internals.stat(path);
    return status.isCharacterDevice() && linuxDeviceNumber(status.rdev) === terminalDevice ? terminalDevice : void 0;
  } catch (_unreadableStdinDevice) {
    return void 0;
  }
}
function linuxProcessGroupHasLiveMembers(processGroupId, internals = DEFAULT_INTERNALS) {
  let entries;
  try {
    entries = internals.readDir("/proc");
  } catch (_unreadableProcDirectory) {
    return void 0;
  }
  let matched = false;
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const stat2 = readLinuxStat(internals, Number(entry));
    if (stat2?.pgrp !== processGroupId) continue;
    matched = true;
    if (!/^[ZXx]$/.test(stat2.state)) return true;
  }
  return matched ? false : void 0;
}
function numericEntries(internals, path) {
  try {
    return internals.readDir(path).filter((entry) => /^\d+$/.test(entry)).map(Number);
  } catch (_unreadableProcDirectory) {
    return void 0;
  }
}
function readSyscall(internals, pid, tid) {
  try {
    const text = internals.readFile(`/proc/${pid}/task/${tid}/syscall`).trim();
    if (text === "running" || text.startsWith("-1 ")) return void 0;
    const fields = text.split(/\s+/);
    const number = Number(fields[0]);
    const args = fields.slice(1, 7).map((field) => Number.parseInt(field, 16));
    if (!Number.isSafeInteger(number) || args.some((value) => !Number.isSafeInteger(value))) return void 0;
    return { number, args };
  } catch (_unreadableSyscall) {
    return void 0;
  }
}
function readMemory(internals, pid, address, length) {
  let fd;
  try {
    fd = internals.open(`/proc/${pid}/mem`);
    const buffer = Buffer.alloc(length);
    const count = internals.read(fd, buffer, length, address);
    return buffer.subarray(0, count);
  } catch (_unreadableProcessMemory) {
    return void 0;
  } finally {
    if (fd !== void 0) internals.close(fd);
  }
}
function fdSetHasStdin(internals, pid, address) {
  return address !== 0 && (readMemory(internals, pid, address, 8)?.[0] ?? 0) % 2 === 1;
}
function pollHasStdin(internals, pid, address, count) {
  if (address === 0 || count <= 0) return false;
  const memory = readMemory(internals, pid, address, Math.min(count, 1024) * 8);
  if (memory === void 0) return false;
  for (let offset = 0; offset + 8 <= memory.length; offset += 8) {
    if (memory.readInt32LE(offset) === 0 && (memory.readInt16LE(offset + 4) & 1) !== 0) return true;
  }
  return false;
}
function epollHasStdin(internals, pid, tid, epfd) {
  try {
    return internals.readFile(`/proc/${pid}/task/${tid}/fdinfo/${epfd}`).split("\n").some((line) => /^tfd:\s+0\b/.test(line.trim()));
  } catch (_unreadableFdInfo) {
    return false;
  }
}
var SYSCALLS = {
  x64: { read: 0, select: 23, pselect: 270, poll: 7, ppoll: 271, epollWait: 232, epollPwait: 281 },
  arm64: { read: 63, pselect: 72, ppoll: 73, epollPwait: 22 }
};
var SUPPORTED_SYSCALL_TABLES = Object.values(SYSCALLS);
function linuxSyscallTables(arch) {
  const primary = SYSCALLS[arch];
  if (primary === void 0) return void 0;
  return [primary, ...SUPPORTED_SYSCALL_TABLES.filter((table) => table !== primary)];
}
function syscallWaitsOnStdin(internals, pid, tid, syscall, tables) {
  const [a0 = 0, a1 = 0, a2 = 0] = syscall.args;
  for (const table of tables) {
    if (syscall.number === table.read) return a0 === 0;
    if (syscall.number === table.select || syscall.number === table.pselect) {
      return a0 >= 1 && fdSetHasStdin(internals, pid, a1);
    }
    if (syscall.number === table.poll || syscall.number === table.ppoll) {
      return a1 >= 1 && pollHasStdin(internals, pid, a0, a1);
    }
    if (syscall.number === table.epollWait || syscall.number === table.epollPwait) {
      return a2 >= 1 && epollHasStdin(internals, pid, tid, a0);
    }
  }
  return false;
}
var PosixProcessInspector = class {
  constructor(internals) {
    this.internals = internals;
  }
  internals;
  signalGroup(pgid, signal) {
    this.internals.kill(-pgid, signal);
  }
  signalProcess(identity, signal) {
    if (this.isAlive(identity)) this.internals.kill(identity.pid, signal);
  }
};
function quiescent(state) {
  return state !== void 0 && /^[ZXx]$/.test(state);
}
var PosixProcessSnapshot = class {
  constructor(rows, complete) {
    this.rows = rows;
    this.complete = complete;
    this.byPid = new Map(rows.map((row) => [row.pid, row]));
  }
  rows;
  complete;
  byPid;
  tree(rootPid) {
    return processTree(this.rows, rootPid);
  }
  session(sessionId) {
    return this.rows.flatMap((row) => row.session === sessionId ? [{ pid: row.pid, started: row.started }] : []);
  }
  alive(identity) {
    const row = this.byPid.get(identity.pid);
    return row?.started === identity.started && !quiescent(row.state);
  }
};
function processTree(entries, rootPid) {
  const byPid = new Map(entries.map((entry) => [entry.pid, entry]));
  const root = byPid.get(rootPid);
  if (root === void 0) return [];
  const byParent = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const children = byParent.get(entry.parentPid) ?? [];
    children.push(entry);
    byParent.set(entry.parentPid, children);
  }
  const visited = /* @__PURE__ */ new Set();
  const result = [];
  const visit = (entry) => {
    if (visited.has(entry.pid)) return;
    visited.add(entry.pid);
    for (const child of byParent.get(entry.pid) ?? []) visit(child);
    result.push({ pid: entry.pid, started: entry.started });
  };
  visit(root);
  return result;
}
var LinuxProcessInspector = class extends PosixProcessInspector {
  constructor(arch, internals) {
    super(internals);
    this.arch = arch;
  }
  arch;
  foregroundPgid(shellPid) {
    const tpgid = readLinuxStat(this.internals, shellPid)?.tpgid;
    return tpgid !== void 0 && tpgid > 0 ? tpgid : void 0;
  }
  isStdinWaiting(pgid, shellPid) {
    const tables = linuxSyscallTables(this.arch);
    if (tables === void 0) return false;
    const shell = readLinuxStat(this.internals, shellPid);
    if (shell === void 0) return false;
    const terminalDevice = readLinuxTerminalDevice(this.internals, shellPid, shell.ttyDevice);
    if (terminalDevice === void 0) return false;
    for (const pid of numericEntries(this.internals, "/proc") ?? []) {
      const process2 = readLinuxStat(this.internals, pid);
      if (process2?.pgrp !== pgid) continue;
      for (const tid of numericEntries(this.internals, `/proc/${pid}/task`) ?? []) {
        const syscall = readSyscall(this.internals, pid, tid);
        if (syscall !== void 0 && syscallWaitsOnStdin(this.internals, pid, tid, syscall, tables) && readLinuxTerminalDevice(this.internals, pid, process2.ttyDevice, tid) === terminalDevice) return true;
      }
    }
    return false;
  }
  isAlive(identity) {
    const stat2 = readLinuxStat(this.internals, identity.pid);
    return stat2?.started === identity.started && !quiescent(stat2.state);
  }
  snapshot() {
    const pids = numericEntries(this.internals, "/proc");
    if (pids === void 0) throw new Error("Cannot inspect processes: /proc directory is unreadable");
    let complete = true;
    const rows = pids.flatMap((pid) => {
      const stat2 = readLinuxStat(this.internals, pid);
      if (stat2 === void 0) complete = false;
      return stat2 === void 0 ? [] : [{
        pid,
        parentPid: stat2.parentPid,
        started: stat2.started,
        session: stat2.session,
        state: stat2.state
      }];
    });
    return new PosixProcessSnapshot(rows, complete);
  }
};
function macProcessTable(internals) {
  let complete = true;
  const rows = internals.exec("/bin/ps", ["-axo", "pid=,ppid=,lstart="]).split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    if (match?.[1] === void 0 || match[2] === void 0 || match[3] === void 0) {
      if (line.trim().length > 0) complete = false;
      return [];
    }
    return [{
      pid: Number(match[1]),
      parentPid: Number(match[2]),
      started: match[3],
      session: void 0,
      state: void 0
    }];
  });
  return { rows, complete };
}
var MacProcessInspector = class extends PosixProcessInspector {
  foregroundPgid(shellPid) {
    try {
      const value = Number(this.internals.exec("/bin/ps", ["-o", "tpgid=", "-p", String(shellPid)]).trim());
      return Number.isSafeInteger(value) && value > 0 ? value : void 0;
    } catch (_missingProcess) {
      return void 0;
    }
  }
  isStdinWaiting(_pgid, _shellPid) {
    return false;
  }
  isAlive(identity) {
    return macProcessTable(this.internals).rows.some((entry) => entry.pid === identity.pid && entry.started === identity.started);
  }
  snapshot() {
    const table = macProcessTable(this.internals);
    return new PosixProcessSnapshot(table.rows, table.complete);
  }
};
function createProcessInspector(platform = process.platform, arch = process.arch, internals = DEFAULT_INTERNALS) {
  if (platform === "linux") return new LinuxProcessInspector(arch, internals);
  if (platform === "darwin") return new MacProcessInspector(internals);
  if (platform === "win32") return createWindowsProcessInspector();
  throw new Error(`subprocess-local: terminal inspection is unsupported on platform ${platform}`);
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/output.ts
import { randomBytes } from "node:crypto";
import { closeSync as closeSync2, mkdtempSync, openSync as openSync2, rmdirSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
var spillCounter = 0;
var defaultSpillDir;
function privateSpillDir() {
  defaultSpillDir ??= mkdtempSync(join(tmpdir(), "dsh-subprocess-"));
  return defaultSpillDir;
}
process.once("exit", () => {
  if (defaultSpillDir === void 0) return;
  try {
    rmdirSync(defaultSpillDir);
  } catch {
  }
});
function prepareManagedProcessBinding(internals = {}) {
  return { spillDir: internals.spillDir ?? privateSpillDir() };
}
var OutputCollector = class {
  constructor(maxBytes, maxSpillBytes, label, spillDir) {
    this.maxBytes = maxBytes;
    this.maxSpillBytes = maxSpillBytes;
    this.label = label;
    this.spillDir = spillDir;
    this.spillDisabled = maxSpillBytes === void 0;
  }
  maxBytes;
  maxSpillBytes;
  label;
  spillDir;
  chunks = [];
  bytes = 0;
  dropped = false;
  spillFd;
  spillFile;
  spillDisabled;
  /** Total bytes ever pushed (not just retained). */
  total = 0;
  /**
   * Ingest one stream chunk, counting it toward the whole-stream total. On
   * first overflow of the in-memory cap a spill file is opened (when spilling
   * is enabled) and every chunk (already-collected ones included) is appended
   * there from then on; the in-memory tail then drops whole chunks from its
   * head (or the head of a single over-cap chunk) until it fits the cap again.
   * @param chunk - the raw bytes from one stream 'data' event.
   */
  push(chunk) {
    this.total += chunk.length;
    const overflows = this.bytes + chunk.length > this.maxBytes;
    if (!this.spillDisabled && (overflows || this.spillFd !== void 0)) this.spillAll(chunk);
    this.chunks.push(chunk);
    this.bytes += chunk.length;
    while (this.bytes > this.maxBytes) {
      const head = this.chunks[0];
      const excess = this.bytes - this.maxBytes;
      if (head.length <= excess) {
        this.chunks.shift();
        this.bytes -= head.length;
      } else {
        this.chunks[0] = head.subarray(excess);
        this.bytes -= excess;
      }
      this.dropped = true;
    }
  }
  /** Open the spill file lazily and append `chunk` (and any prior chunks once). */
  spillAll(chunk) {
    if (this.maxSpillBytes !== void 0 && this.total > this.maxSpillBytes) {
      this.discardSpill();
      return;
    }
    if (this.spillFd === void 0) {
      this.spillFile = join(
        this.spillDir,
        `dsh-subprocess-${process.pid}-${++spillCounter}-${randomBytes(6).toString("hex")}-${this.label}.log`
      );
      this.spillFd = openSync2(this.spillFile, "wx", 384);
      for (const prior of this.chunks) writeSync(this.spillFd, prior);
    }
    writeSync(this.spillFd, chunk);
  }
  /** Stop spilling and remove the file once it can no longer hold the complete stream. */
  discardSpill() {
    const fd = this.spillFd;
    const file = this.spillFile;
    this.spillFd = void 0;
    this.spillFile = void 0;
    this.spillDisabled = true;
    if (fd !== void 0) {
      try {
        closeSync2(fd);
      } catch {
        this.spillFd = fd;
      }
    }
    if (file !== void 0) {
      try {
        unlinkSync(file);
      } catch {
      }
    }
  }
  /**
   * Incremental read in whole-stream byte coordinates: returns everything
   * pushed since `fromByte`. When `fromByte` has already slid out of the
   * in-memory tail window, the read is `lossy` — it returns the whole
   * retained tail and the gap is only recoverable from the spill file.
   * @param fromByte - whole-stream offset to resume from (a prior read's `nextOffset`; 0 for the first read).
   * @returns the delta text, the offset for the next read, the `lossy` flag, and the spill path when one was created.
   */
  readFrom(fromByte) {
    const windowStart = this.total - this.bytes;
    const buffer = Buffer.concat(this.chunks);
    const lossy = fromByte < windowStart;
    const slice = lossy ? buffer : buffer.subarray(fromByte - windowStart);
    return {
      text: slice.toString("utf8"),
      nextOffset: this.total,
      lossy,
      ...this.spillFile !== void 0 ? { spillPath: this.spillFile } : {}
    };
  }
  /**
   * Copy the retained raw tail with its position in the complete observed stream.
   * @returns independent tail bytes and the total byte count before truncation.
   */
  snapshot() {
    return { bytes: Buffer.concat(this.chunks), totalBytes: this.total };
  }
  /**
   * Close the spill file once the stream has ended. A failed close (delayed
   * writeback fault) stops advertising the spill path — the file may be
   * missing its tail — while every in-memory read keeps working. Idempotent;
   * the spawn path seals both collectors at settlement so reads after exit
   * never point at a still-open file.
   */
  seal() {
    if (this.spillFd === void 0) return;
    try {
      closeSync2(this.spillFd);
    } catch {
      this.spillFile = void 0;
    }
    this.spillFd = void 0;
  }
  /**
   * Seal the spill file and return the final output.
   * @returns the final collected output: tail text, truncation flag, and the spill path when intact.
   */
  finalize() {
    this.seal();
    return {
      text: Buffer.concat(this.chunks).toString("utf8"),
      truncated: this.dropped,
      ...this.spillFile !== void 0 ? { spillPath: this.spillFile } : {}
    };
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/spawn.ts
function childEnv(extra) {
  const env = scrubbedParentEnv();
  if (process.platform !== "win32") return { ...env, ...extra };
  let entries = Object.entries(env);
  for (const [key, value] of Object.entries(extra ?? {})) {
    const normalized = key.toUpperCase();
    entries = entries.filter(([inherited]) => inherited.toUpperCase() !== normalized);
    entries.push([key, value]);
  }
  return Object.fromEntries(entries);
}
function sleepTick() {
  return sleepMs(15);
}
function taskkillProcessTree(pid) {
  if (pid === void 0 || pid <= 0) return;
  spawnSync2("taskkill", ["/PID", String(pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true
  });
}
function signalTree(platform, pid, sig, child, taskkill) {
  if (pid === void 0) return;
  if (platform === "win32") {
    taskkill(pid);
    return;
  }
  try {
    process.kill(-pid, sig);
  } catch {
    try {
      child.kill(sig);
    } catch {
    }
  }
}
function validateSubprocessSpec(spec) {
  if (!Number.isFinite(spec.graceMs) || spec.graceMs <= 0 || spec.graceMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`subprocess graceMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
  }
  if (spec.signal?.aborted) {
    let reason = "aborted";
    try {
      reason = String(spec.signal.reason ?? reason);
    } catch {
    }
    throw new Error(`aborted before spawn: ${reason}`);
  }
  const [program] = spec.argv;
  if (program === void 0 || program.length === 0) {
    throw new Error("invalid argv: expected a non-empty program name at argv[0]");
  }
}
function directChildResult(child) {
  return new Promise((resolve2, reject) => {
    let completed = false;
    child.once("error", (error) => {
      if (completed) return;
      completed = true;
      reject(error);
    });
    child.once("exit", (exitCode, signal) => {
      if (completed) return;
      completed = true;
      resolve2({ exitCode, signal });
    });
  });
}
function fallbackOwner(platform, pid, child, taskkill, linuxGroupHasLiveMembers, direct) {
  let stopped = false;
  let directSettled = false;
  let observation;
  void direct.then(
    () => {
      directSettled = true;
    },
    () => {
      directSettled = true;
    }
  );
  const alive = () => {
    if (stopped || pid === void 0) return false;
    if (platform === "win32") return child.exitCode === null && child.signalCode === null;
    try {
      process.kill(-pid, 0);
      if (directSettled && platform === "linux" && linuxGroupHasLiveMembers(pid) === false) return false;
      return true;
    } catch (error) {
      const code = error.code;
      if (code === "ESRCH") return false;
      if (code === "EPERM") return true;
      return child.exitCode === null && child.signalCode === null;
    }
  };
  return {
    signal: (signal) => {
      if (!alive()) {
        stopped = true;
        return;
      }
      signalTree(platform, pid, signal, child, taskkill);
    },
    waitForExit: async () => {
      if (stopped) return;
      observation ??= (async () => {
        while (alive()) await sleepTick();
        stopped = true;
      })();
      await observation;
    },
    terminateForHostExit: () => {
      if (stopped) return;
      signalTree(platform, pid, "SIGKILL", child, taskkill);
    }
  };
}
function bindManagedProcess(spec, launch, internals = {}) {
  const { spillDir } = prepareManagedProcessBinding(internals);
  const { stdin, stdout, stderr } = launch;
  const isCollect = (mode) => mode !== "pipe" && mode !== "inherit";
  const outMode = spec.stdio.stdout;
  const errMode = spec.stdio.stderr;
  const stdinMode = spec.stdio.stdin;
  const collectStream = (mode, stream, label) => {
    if (!isCollect(mode) || stream === null) return void 0;
    const collector = new OutputCollector(mode.maxBytes, mode.spill?.maxBytes, label, spillDir);
    stream.on("data", (chunk) => {
      collector.push(chunk);
    });
    return collector;
  };
  const stdoutCollector = collectStream(outMode, stdout, "stdout");
  const stderrCollector = collectStream(errMode, stderr, "stderr");
  const observeOutputStream = (mode, stream) => {
    if (mode === "inherit" || stream === null || stream.readableEnded || stream.destroyed) return void 0;
    return new Promise((resolve2) => {
      const settle = () => {
        stream.off("end", settle);
        stream.off("close", settle);
        stream.off("error", settle);
        resolve2();
      };
      stream.once("end", settle);
      stream.once("close", settle);
      stream.once("error", settle);
    });
  };
  const stdoutClosed = observeOutputStream(outMode, stdout);
  const stderrClosed = observeOutputStream(errMode, stderr);
  const outputStreamsClosed = Promise.all([stdoutClosed, stderrClosed]);
  const stopCollectors = () => {
    if (stdoutCollector !== void 0) stdout?.destroy();
    if (stderrCollector !== void 0) stderr?.destroy();
    stdoutCollector?.seal();
    stderrCollector?.seal();
  };
  let graceTimer;
  let terminationStarted = false;
  let rangeExitObserved = false;
  let rangeExitObservation;
  let settled = false;
  const scheduleOwnerCleanup = () => {
    if (launch.owner.cleanup === void 0) return false;
    queueMicrotask(() => {
      void done.finally(() => {
        launch.owner.cleanup?.();
      }).catch(() => {
      });
    });
    return true;
  };
  const observeRangeExit = () => {
    rangeExitObservation ??= (async () => {
      await launch.owner.waitForExit();
      rangeExitObserved = true;
      if (graceTimer !== void 0) clearTimeout(graceTimer);
      graceTimer = void 0;
      spec.signal?.removeEventListener("abort", onAbort);
      scheduleOwnerCleanup();
    })().catch((error) => {
      if (!settled || !scheduleOwnerCleanup()) rangeExitObservation = void 0;
      throw error;
    });
    return rangeExitObservation;
  };
  const kill = (sig, cancellationReason) => {
    if (rangeExitObserved) return;
    launch.owner.signal(sig, cancellationReason);
  };
  const terminateWithReason = (cancellationReason) => {
    if (rangeExitObserved || terminationStarted) return;
    terminationStarted = true;
    void observeRangeExit().catch(() => {
    });
    kill("SIGTERM", cancellationReason);
    graceTimer = setTimeout(() => {
      graceTimer = void 0;
      kill("SIGKILL");
    }, spec.graceMs);
  };
  const terminate = () => {
    terminateWithReason(new Error("subprocess terminated before target start"));
  };
  const terminateForHostExit = () => {
    launch.owner.terminateForHostExit();
  };
  const onAbort = () => {
    terminateWithReason(spec.signal?.reason);
  };
  spec.signal?.addEventListener("abort", onAbort, { once: true });
  if (typeof stdinMode === "object" && stdin !== null) {
    stdin.on("error", () => {
    });
    stdin.end(stdinMode.data);
  }
  const done = new Promise((resolve2, reject) => {
    let pipeDrainTimer;
    const settle = (outcome) => {
      if (settled) return;
      settled = true;
      stopCollectors();
      cleanup();
      resolve2(outcome);
    };
    const fail = (error) => {
      settled = true;
      terminate();
      stopCollectors();
      cleanup();
      reject(error);
    };
    launch.direct.then((outcome) => {
      if (stdoutClosed === void 0 && stderrClosed === void 0) {
        settle(outcome);
        return;
      }
      pipeDrainTimer = setTimeout(() => {
        settle(outcome);
      }, spec.graceMs);
      void outputStreamsClosed.then(() => {
        settle(outcome);
      });
    }, fail);
    function cleanup() {
      if (pipeDrainTimer !== void 0) clearTimeout(pipeDrainTimer);
    }
  });
  const waitForExit = async (signal) => {
    if (rangeExitObserved) return true;
    return waitWithAbort(observeRangeExit(), signal);
  };
  return {
    /* v8 ignore start -- pipe-mode streams exist on every conforming launch;
       the null-coalesces guard an internal adapter defect only. */
    stdin: stdinMode === "pipe" ? stdin ?? void 0 : void 0,
    stdout: outMode === "pipe" ? stdout ?? void 0 : void 0,
    stderr: errMode === "pipe" ? stderr ?? void 0 : void 0,
    control: launch.control,
    /* v8 ignore stop */
    collected: {
      ...stdoutCollector !== void 0 ? { stdout: stdoutCollector } : {},
      ...stderrCollector !== void 0 ? { stderr: stderrCollector } : {}
    },
    done,
    terminate,
    terminateForHostExit,
    waitForExit
  };
}
function spawnSubprocess(spec, internals = {}) {
  const binding = prepareManagedProcessBinding(internals);
  const platform = internals.platform ?? process.platform;
  const [program, ...args] = spec.argv;
  const stdio = [
    spec.stdio.stdin === "ignore" ? "ignore" : "pipe",
    spec.stdio.stdout === "inherit" ? "inherit" : "pipe",
    spec.stdio.stderr === "inherit" ? "inherit" : "pipe"
  ];
  if (spec.stdio.control === "pipe") {
    while (stdio.length < SUBPROCESS_CONTROL_FD2) stdio.push("ignore");
    stdio.push("overlapped");
  }
  const child = (internals.spawn ?? spawn)(program, args, {
    cwd: spec.cwd,
    env: controlEnvironment(childEnv(spec.env), spec.stdio.control),
    stdio,
    detached: platform !== "win32",
    windowsHide: platform === "win32"
  });
  const direct = directChildResult(child);
  const pid = child.pid;
  const owner = fallbackOwner(
    platform,
    pid,
    child,
    internals.taskkill ?? taskkillProcessTree,
    internals.linuxProcessGroupHasLiveMembers ?? linuxProcessGroupHasLiveMembers,
    direct
  );
  return bindManagedProcess(spec, {
    stdin: child.stdin,
    stdout: child.stdout,
    stderr: child.stderr,
    control: controlPipe(child, spec.stdio.control),
    direct,
    owner
  }, binding);
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/linux-scope.ts
import { execFile, spawn as spawn2, spawnSync as spawnSync3 } from "node:child_process";
import { randomBytes as randomBytes2 } from "node:crypto";
import { existsSync as existsSync2 } from "node:fs";
import { setTimeout as sleepMs2 } from "node:timers/promises";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/linux-execve.ts
import { getSystemErrorMessage, getSystemErrorName } from "node:util";
import { SUBPROCESS_CONTROL_FD as SUBPROCESS_CONTROL_FD3 } from "@deepseek-ai/dsh-subprocess/control";
import { createLazyRequire as createLazyRequire2 } from "@deepseek-ai/dsh-lazy-require";
var requireKoffi2 = createLazyRequire2("koffi", import.meta.url);
var STANDARD_FILE_DESCRIPTORS = [0, 1, 2];
var F_GETFD = 1;
var F_SETFD = 2;
var FD_CLOEXEC = 1;
var cachedExecve;
function systemError(errno, syscall, path) {
  const uvError = -errno;
  const code = getSystemErrorName(uvError);
  const detail = getSystemErrorMessage(uvError);
  const subject = path === void 0 ? syscall : `${syscall} '${path}'`;
  const error = Object.assign(new Error(`${code}: ${detail}, ${subject}`), {
    code,
    errno: uvError,
    syscall
  });
  return path === void 0 ? error : Object.assign(error, { path });
}
function loadLinuxExecve() {
  if (cachedExecve !== void 0) return cachedExecve;
  const koffi = requireKoffi2();
  const libc = koffi.load(null);
  const nativeExecve = libc.func(
    "int execve(const char *pathname, const char **argv, const char **envp)"
  );
  const nativeFcntl = libc.func(
    "int fcntl(int fd, int cmd, int arg)"
  );
  cachedExecve = (file, argv, env, control) => {
    const descriptors = control === "pipe" ? [...STANDARD_FILE_DESCRIPTORS, SUBPROCESS_CONTROL_FD3] : STANDARD_FILE_DESCRIPTORS;
    for (const fd of descriptors) {
      const flags = nativeFcntl(fd, F_GETFD, 0);
      if (flags === -1) throw systemError(koffi.errno(), "fcntl");
      if ((flags & FD_CLOEXEC) === 0) continue;
      if (nativeFcntl(fd, F_SETFD, flags & ~FD_CLOEXEC) === -1) {
        throw systemError(koffi.errno(), "fcntl");
      }
    }
    nativeExecve(
      file,
      [...argv, null],
      [...Object.entries(env).map(([key, value]) => `${key}=${value}`), null]
    );
    throw systemError(koffi.errno(), "execve", file);
  };
  return cachedExecve;
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/runner-protocol.ts
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync as mkdtempSync2,
  readFileSync as readFileSync2,
  rmdirSync as rmdirSync2,
  unlinkSync as unlinkSync2,
  writeFileSync
} from "node:fs";
import { tmpdir as tmpdir2 } from "node:os";
import { basename, dirname, isAbsolute, join as join2 } from "node:path";
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasExactKeys(value, required, optional = []) {
  const allowed = /* @__PURE__ */ new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}
function isSerializedRunnerError(value) {
  if (!isRecord(value) || !hasExactKeys(
    value,
    ["name", "message"],
    ["code", "syscall", "path"]
  )) return false;
  return typeof value.name === "string" && typeof value.message === "string" && (value.code === void 0 || typeof value.code === "string") && (value.syscall === void 0 || typeof value.syscall === "string") && (value.path === void 0 || typeof value.path === "string");
}
function parseErrorResult(value) {
  if (!hasExactKeys(value, ["type", "error"]) || !isSerializedRunnerError(value.error)) {
    throw new Error("subprocess runner emitted an invalid error result");
  }
  if (value.type !== "error") {
    throw new Error("subprocess runner emitted an unknown error result");
  }
  return { type: "error", error: value.error };
}
function createLinuxLaunchFiles(request) {
  const directory = mkdtempSync2(join2(tmpdir2(), "dsh-subprocess-launch-"));
  const files = {
    directory,
    requestPath: join2(directory, "launch-request.json"),
    startupErrorPath: join2(directory, "startup-error.json")
  };
  try {
    chmodSync(directory, 448);
    writeFileSync(files.requestPath, JSON.stringify(request), { flag: "wx", mode: 384 });
    return files;
  } catch (error) {
    cleanupLinuxLaunchFiles(files);
    throw error;
  }
}
function readLinuxStartupError(path) {
  if (!existsSync(path)) return void 0;
  const value = JSON.parse(readFileSync2(path, "utf8"));
  if (!isRecord(value)) throw new Error("subprocess runner emitted an invalid startup error");
  return parseErrorResult(value);
}
function parseWindowsNormalStop(value) {
  if (!isRecord(value) || value.type !== "normal-stop") return void 0;
  if (!hasExactKeys(value, ["type", "status"]) || value.status !== "sent" && value.status !== "unavailable" && value.status !== "root-exited") {
    throw new Error("subprocess runner emitted an invalid normal-stop observation");
  }
  return { type: "normal-stop", status: value.status };
}
function parseWindowsRunnerResult(value) {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("subprocess runner emitted an invalid Windows result");
  }
  if (value.type === "error") return parseErrorResult(value);
  if (value.type === "target-exit") {
    const validExitCode = typeof value.exitCode === "number" && Number.isSafeInteger(value.exitCode) && value.exitCode >= 0;
    if (!hasExactKeys(value, ["type", "exitCode"]) || !validExitCode) {
      throw new Error("subprocess runner emitted an invalid target-exit result");
    }
    return {
      type: "target-exit",
      exitCode: value.exitCode
    };
  }
  throw new Error(`subprocess runner emitted an unknown Windows result: ${value.type}`);
}
function deserializeRunnerError(serialized) {
  const error = new Error(serialized.message);
  error.name = serialized.name;
  return Object.assign(error, {
    ...serialized.code === void 0 ? {} : { code: serialized.code },
    ...serialized.syscall === void 0 ? {} : { syscall: serialized.syscall },
    ...serialized.path === void 0 ? {} : { path: serialized.path }
  });
}
function cleanupLinuxLaunchFiles(files) {
  try {
    if (lstatSync(files.directory).isSymbolicLink()) {
      unlinkSync2(files.directory);
      return;
    }
    for (const path of [
      files.requestPath,
      files.startupErrorPath
    ]) {
      try {
        unlinkSync2(path);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    rmdirSync2(files.directory);
  } catch {
  }
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/runner-launch.ts
import { accessSync, constants as fsConstants, lstatSync as lstatSync2, statSync as statSync2 } from "node:fs";
import { extname, isAbsolute as isAbsolute2 } from "node:path";
import { inspect } from "node:util";
import { fileURLToPath } from "node:url";
import { SUBPROCESS_CONTROL_FD as SUBPROCESS_CONTROL_FD4 } from "@deepseek-ai/dsh-subprocess/control";
var SUBPROCESS_RUNNER_ENV = "DSH_SUBPROCESS_RUNNER";
var WINDOWS_RUNNER_SELECTION = "windows";
var SOURCE_TSCONFIG_PATH = fileURLToPath(new URL("../../../../tsconfig.base.json", import.meta.url));
var RUNNER_CONTROL_ENV_PREFIXES = ["NODE_", "TSX_"];
function spawnRunnerInvocation() {
  if ("pkg" in process) return [process.execPath];
  if (extname(fileURLToPath(import.meta.url)) !== ".ts") {
    return [process.execPath, fileURLToPath(import.meta.resolve("@deepseek-ai/dsh-subprocess-local/runner"))];
  }
  return [
    process.execPath,
    "--import",
    import.meta.resolve("tsx/esm"),
    fileURLToPath(new URL("./bin.ts", import.meta.url))
  ];
}
function runnerInvocationAvailable(invocation = spawnRunnerInvocation()) {
  try {
    if (isAbsolute2(invocation[0])) accessSync(invocation[0], fsConstants.X_OK);
    const entry = invocation.at(-1);
    if (entry !== void 0 && entry !== invocation[0] && isAbsolute2(entry)) {
      accessSync(entry, fsConstants.R_OK);
    }
    return true;
  } catch {
    return false;
  }
}
function runnerEnvironment(selection, invocation) {
  const entry = invocation?.at(-1);
  const env = childEnv();
  for (const name of Object.keys(env)) {
    const normalized = name.toUpperCase();
    if (RUNNER_CONTROL_ENV_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
      Reflect.deleteProperty(env, name);
    }
  }
  return {
    ...env,
    [SUBPROCESS_RUNNER_ENV]: selection,
    SYSTEMD_LOG_TARGET: "null",
    ...entry?.endsWith(".ts") === true ? { TSX_TSCONFIG_PATH: SOURCE_TSCONFIG_PATH } : {}
  };
}
function runnerStdio(spec, ipc, stdinCarrier = "pipe") {
  const targetStdio = [
    spec.stdio.stdin === "ignore" ? "ignore" : "pipe",
    spec.stdio.stdout === "inherit" ? "inherit" : "pipe",
    spec.stdio.stderr === "inherit" ? "inherit" : "pipe"
  ];
  if (!ipc) {
    if (spec.stdio.control === "pipe") {
      while (targetStdio.length < SUBPROCESS_CONTROL_FD4) targetStdio.push("ignore");
      targetStdio.push("overlapped");
    }
    return targetStdio;
  }
  const runner = [
    "ignore",
    "ignore",
    "pipe",
    "ipc",
    stdinCarrier,
    spec.stdio.stdout === "inherit" ? 1 : "pipe",
    spec.stdio.stderr === "inherit" ? 2 : "pipe"
  ];
  if (spec.stdio.control === "pipe") runner.push("overlapped");
  return runner;
}
function throwNullByteError(property, value, argument) {
  const subject = argument ? `The argument '${property}'` : `The property '${property}'`;
  const error = new TypeError(`${subject} must be a string without null bytes. Received ${inspect(value)}`);
  Object.assign(error, { code: "ERR_INVALID_ARG_VALUE" });
  throw error;
}
function validateNoNullByte(property, value, argument = false) {
  if (value.includes("\0")) throwNullByteError(property, value, argument);
}
function targetEnvironment(spec) {
  spec.argv.forEach((value, index) => {
    validateNoNullByte(index === 0 ? "file" : `args[${String(index - 1)}]`, value, true);
  });
  validateNoNullByte("options.cwd", spec.cwd);
  const env = Object.fromEntries(
    Object.entries(childEnv(spec.env)).filter((entry) => entry[1] !== void 0)
  );
  for (const [key, value] of Object.entries(env)) {
    validateNoNullByte(`options.env['${key}']`, key);
    validateNoNullByte(`options.env['${key}']`, value);
  }
  return controlEnvironment(env, spec.stdio?.control);
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/linux-scope.ts
var SYSTEMCTL_TIMEOUT_MS = 5e3;
var SCOPE_INITIAL_POLL_INTERVAL_MS = 50;
var MISSING_UNIT = /\bunit\b[^\r\n]*(?:could not be found|not found|not loaded)/iu;
function managerEnvironment() {
  const environment = childEnv({ LC_ALL: "C" });
  delete environment.SYSTEMD_LOG_TARGET;
  return environment;
}
function quietSystemdEnvironment() {
  return childEnv({ LC_ALL: "C", SYSTEMD_LOG_TARGET: "null" });
}
function querySystemctl(command, args) {
  return new Promise((resolveResult) => {
    execFile(command, [...args], {
      encoding: "utf8",
      env: managerEnvironment(),
      timeout: SYSTEMCTL_TIMEOUT_MS
    }, (error, stdout, stderr) => {
      const code = error === null ? 0 : error.code;
      resolveResult({
        status: typeof code === "number" ? code : null,
        stdout,
        stderr,
        ...error === null ? {} : { error }
      });
    });
  });
}
function unitStem(prefix) {
  return `${prefix}-${String(process.pid)}-${randomBytes2(6).toString("hex")}`;
}
function sleepWithAbort(delayMs, signal) {
  return sleepMs2(delayMs, void 0, { signal });
}
function probeLinuxBootstrap(internals = {}) {
  try {
    ;
    (internals.loadLinuxExecve ?? loadLinuxExecve)();
    const invocation = internals.runnerInvocation ?? (internals.resolveRunnerInvocation ?? spawnRunnerInvocation)();
    return (internals.runnerAvailable ?? runnerInvocationAvailable)(invocation);
  } catch {
    return false;
  }
}
function probeLinuxScope(internals = {}) {
  const unitBase = unitStem("dsh-subprocess-probe");
  const result = (internals.spawnSync ?? spawnSync3)(internals.systemdRun ?? "systemd-run", [
    "--user",
    "--scope",
    "--quiet",
    "--collect",
    "--expand-environment=no",
    `--unit=${unitBase}`,
    "--",
    internals.systemctl ?? "systemctl",
    "--user",
    "show",
    `${unitBase}.scope`,
    "--property=ActiveState",
    "--value"
  ], { env: quietSystemdEnvironment(), stdio: "ignore", timeout: SYSTEMCTL_TIMEOUT_MS });
  return result.error === void 0 && result.status === 0;
}
function probeLinuxManager(internals = {}) {
  const result = (internals.spawnSync ?? spawnSync3)(internals.systemctl ?? "systemctl", [
    "--user",
    "show",
    "--property=Version",
    "--value"
  ], { env: managerEnvironment(), stdio: "ignore", timeout: SYSTEMCTL_TIMEOUT_MS });
  return result.error === void 0 && result.status === 0;
}
function probeLinuxNative(internals = {}) {
  return probeLinuxBootstrap(internals) && probeLinuxScope(internals);
}
var LinuxScopeStartup = class {
  constructor(files, kind) {
    this.files = files;
    this.kind = kind;
  }
  files;
  kind;
  terminationSignals = /* @__PURE__ */ new Set();
  resolveOutcome(outcome) {
    const startup = readLinuxStartupError(this.files.startupErrorPath);
    if (startup !== void 0) throw deserializeRunnerError(startup.error);
    if (existsSync2(this.files.requestPath) && !(outcome.signal !== null && this.terminationSignals.has(outcome.signal))) {
      throw new Error(`${this.kind} scope exited before its bootstrap consumed the launch request`);
    }
    return outcome;
  }
};
var SystemdScopeOwner = class {
  constructor(unit, startup, direct, systemctl, runSync, query, sleep) {
    this.unit = unit;
    this.startup = startup;
    this.direct = direct;
    this.systemctl = systemctl;
    this.runSync = runSync;
    this.query = query;
    this.sleep = sleep;
  }
  unit;
  startup;
  direct;
  systemctl;
  runSync;
  query;
  sleep;
  establishment = "pending";
  stopped = false;
  terminationRequested = false;
  observation;
  killFailure;
  directKillSettlement;
  wakeGeneration = 0;
  wakeWaiter;
  inspectTaskCount() {
    const result = this.runSync(this.systemctl, [
      "--user",
      "show",
      "--property=LoadState",
      "--property=ActiveState",
      "--property=TasksCurrent",
      this.unit
    ], { encoding: "utf8", env: managerEnvironment(), timeout: SYSTEMCTL_TIMEOUT_MS });
    if (result.error !== void 0 || result.status !== 0 || typeof result.stdout !== "string") return void 0;
    const state = this.parseUnitState(result.stdout);
    return state.loadState === "loaded" && state.activeState === "active" ? state.tasksCurrent : void 0;
  }
  signal(signal) {
    if (this.stopped) return;
    this.terminationRequested = true;
    if (this.direct.running()) this.startup.terminationSignals.add(signal);
    this.observeRequestConsumption();
    const directFallbackRequired = this.establishment === "pending";
    let directSignalled = false;
    if (directFallbackRequired && this.direct.running()) directSignalled = this.direct.signal(signal);
    const result = this.runSync(this.systemctl, [
      "--user",
      "kill",
      "--kill-whom=all",
      `--signal=${signal}`,
      this.unit
    ], { encoding: "utf8", env: managerEnvironment(), timeout: SYSTEMCTL_TIMEOUT_MS });
    this.wakeObservation();
    if (result.error === void 0 && result.status === 0) {
      if (signal === "SIGKILL") {
        this.killFailure = void 0;
        this.directKillSettlement = void 0;
      }
      return;
    }
    if (!directFallbackRequired && this.direct.running()) directSignalled = this.direct.signal(signal);
    if (signal === "SIGKILL") {
      const output = `${result.stdout}
${result.stderr}`;
      if (!MISSING_UNIT.test(output)) {
        this.killFailure = result.error ?? new Error(
          `systemctl could not signal ${this.unit}: ${output.trim() || `exit ${String(result.status)}`}`
        );
        this.directKillSettlement = directSignalled ? this.direct.settled.then(() => {
        }, () => {
        }) : void 0;
      }
    }
  }
  terminateForHostExit() {
    if (this.stopped) return;
    try {
      if (this.direct.running()) this.direct.signal("SIGKILL");
    } catch {
    }
    try {
      this.runSync(this.systemctl, [
        "--user",
        "kill",
        "--kill-whom=all",
        "--signal=SIGKILL",
        this.unit
      ], { env: managerEnvironment(), stdio: "ignore", timeout: SYSTEMCTL_TIMEOUT_MS });
    } catch {
    }
  }
  observeRequestConsumption() {
    if (this.establishment === "pending" && !existsSync2(this.startup.files.requestPath)) {
      this.establishment = "established";
    }
  }
  absentUnit() {
    this.observeRequestConsumption();
    if (this.establishment === "established") return false;
    if (!this.direct.running() && existsSync2(this.startup.files.requestPath)) {
      return false;
    }
    if (this.killFailure !== void 0) throw this.killFailure;
    return true;
  }
  /**
   * Prove an active unit with no processes is the empty managed range rather
   * than a launch still placing its payload. systemd ends a scope only on the
   * populated-to-empty transition, so a payload killed before it entered the
   * cgroup leaves the unit active forever. A departed client cannot add another
   * payload; a consumed request proves the payload already entered the scope,
   * even while its direct-process exit notification is pending.
   */
  emptyRange(tasksCurrent) {
    return this.terminationRequested && tasksCurrent === 0 && (!this.direct.running() || !existsSync2(this.startup.files.requestPath));
  }
  /** Release a leftover empty scope so the transient unit is collected and cannot accumulate. */
  releaseEmptyRange() {
    try {
      this.runSync(this.systemctl, ["--user", "stop", this.unit], {
        env: managerEnvironment(),
        stdio: "ignore",
        timeout: SYSTEMCTL_TIMEOUT_MS
      });
    } catch {
    }
  }
  parseUnitState(stdout) {
    const values = /* @__PURE__ */ new Map();
    for (const line of stdout.split(/\r?\n/u)) {
      if (line === "") continue;
      const separator = line.indexOf("=");
      if (separator <= 0) {
        throw new Error(`systemctl returned malformed state for ${this.unit}: ${JSON.stringify(stdout.trim())}`);
      }
      const name = line.slice(0, separator);
      if (values.has(name)) {
        throw new Error(`systemctl returned duplicate ${name} for ${this.unit}`);
      }
      values.set(name, line.slice(separator + 1));
    }
    const loadState = values.get("LoadState");
    const activeState = values.get("ActiveState");
    const reportedTasks = values.get("TasksCurrent");
    const tasksCurrent = reportedTasks === "[not set]" ? void 0 : reportedTasks;
    if (values.size !== (reportedTasks === void 0 ? 2 : 3) || loadState === void 0 || activeState === void 0) {
      throw new Error(`systemctl returned incomplete state for ${this.unit}: ${JSON.stringify(stdout.trim())}`);
    }
    if (tasksCurrent !== void 0 && !/^\d+$/u.test(tasksCurrent)) {
      throw new Error(`systemctl returned a non-numeric TasksCurrent for ${this.unit}: ${JSON.stringify(tasksCurrent)}`);
    }
    return {
      loadState,
      activeState,
      tasksCurrent: tasksCurrent === void 0 ? void 0 : Number(tasksCurrent)
    };
  }
  async rangeActive() {
    this.observeRequestConsumption();
    const generation = this.wakeGeneration;
    const directRunning = this.direct.running();
    const result = await this.query(this.systemctl, [
      "--user",
      "show",
      this.unit,
      "--property=LoadState",
      "--property=ActiveState",
      "--property=TasksCurrent"
    ]);
    if (generation !== this.wakeGeneration) return true;
    const output = `${result.stdout}
${result.stderr}`;
    if (result.status === 0) {
      const { loadState, activeState, tasksCurrent } = this.parseUnitState(result.stdout);
      if (loadState === "not-found" && activeState === "inactive") return this.absentUnit();
      if (loadState !== "loaded") {
        throw new Error(
          `systemctl returned unknown state for ${this.unit}: ${JSON.stringify({ loadState, activeState })}`
        );
      }
      this.establishment = "established";
      if (activeState === "inactive" || activeState === "failed") return false;
      if (!["active", "activating", "reloading", "deactivating"].includes(activeState)) {
        throw new Error(`systemctl returned unknown ActiveState for ${this.unit}: ${JSON.stringify(activeState)}`);
      }
      if (this.emptyRange(tasksCurrent)) {
        this.releaseEmptyRange();
        return false;
      }
      if (this.killFailure !== void 0) {
        if (directRunning && this.directKillSettlement !== void 0) {
          const settlement = this.directKillSettlement;
          this.directKillSettlement = void 0;
          await settlement;
          return this.rangeActive();
        }
        throw this.killFailure;
      }
      return true;
    }
    if (!MISSING_UNIT.test(output)) {
      if (result.error !== void 0) throw result.error;
      throw new Error(`systemctl could not read ${this.unit}: ${output.trim() || `exit ${String(result.status)}`}`);
    }
    return this.absentUnit();
  }
  wakeObservation() {
    this.wakeGeneration += 1;
    this.wakeWaiter?.resolve();
    this.wakeWaiter = void 0;
  }
  async waitForPoll(delayMs, generation) {
    if (generation !== this.wakeGeneration) return;
    const wake = Promise.withResolvers();
    const waiter = { generation, resolve: wake.resolve };
    const sleepController = new AbortController();
    this.wakeWaiter = waiter;
    try {
      await Promise.race([this.sleep(delayMs, sleepController.signal), wake.promise]);
    } finally {
      sleepController.abort();
      if (this.wakeWaiter === waiter) this.wakeWaiter = void 0;
    }
  }
  async waitForExit() {
    if (this.stopped) return;
    this.observation ??= (async () => {
      let pollIntervalMs = SCOPE_INITIAL_POLL_INTERVAL_MS;
      let generation = this.wakeGeneration;
      while (await this.rangeActive()) {
        await this.waitForPoll(pollIntervalMs, generation);
        generation = this.wakeGeneration;
        if (this.establishment === "established") {
          pollIntervalMs = Math.min(pollIntervalMs * 2, SYSTEMCTL_TIMEOUT_MS);
        }
      }
      this.stopped = true;
    })().catch((error) => {
      this.observation = void 0;
      throw error;
    });
    await this.observation;
  }
  cleanup() {
    cleanupLinuxLaunchFiles(this.startup.files);
  }
};
function scopeArgs(unitBase, invocation, argv) {
  return [
    "--user",
    "--scope",
    "--quiet",
    "--collect",
    "--expand-environment=no",
    `--unit=${unitBase}`,
    "--",
    ...invocation,
    "--",
    ...argv
  ];
}
function directOutcome(child, startup) {
  return new Promise((resolveOutcome, rejectOutcome) => {
    let settled = false;
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      rejectOutcome(error);
    });
    child.once("exit", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      try {
        resolveOutcome(startup.resolveOutcome({ exitCode, signal }));
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        rejectOutcome(failure);
      }
    });
  });
}
function signalLinuxDirectProcess(pid, send) {
  try {
    if (send()) return true;
  } catch {
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error.code === "ESRCH";
  }
}
function signalChildGroup(child, signal) {
  let groupSignalled = false;
  try {
    groupSignalled = process.kill(-child.pid, signal);
  } catch {
  }
  if (groupSignalled && signal === "SIGTERM") return true;
  return signalLinuxDirectProcess(child.pid, () => process.kill(child.pid, signal));
}
function prepareLinuxTerminalScope(spec, targetEnv, internals = {}) {
  const invocation = internals.runnerInvocation ?? spawnRunnerInvocation();
  const files = createLinuxLaunchFiles({ cwd: spec.cwd, env: targetEnv });
  const startup = new LinuxScopeStartup(files, "terminal");
  const unitBase = unitStem("dsh-terminal");
  return {
    command: internals.systemdRun ?? "systemd-run",
    args: scopeArgs(unitBase, invocation, spec.argv),
    cwd: process.cwd(),
    env: runnerEnvironment(files.requestPath, invocation),
    bindOwner: (direct) => new SystemdScopeOwner(
      `${unitBase}.scope`,
      startup,
      direct,
      internals.systemctl ?? "systemctl",
      internals.spawnSync ?? spawnSync3,
      internals.systemctlQuery ?? querySystemctl,
      internals.sleep ?? sleepWithAbort
    ),
    resolveOutcome: (outcome) => startup.resolveOutcome(outcome),
    cleanup: () => {
      cleanupLinuxLaunchFiles(files);
    }
  };
}
function launchLinuxScope(spec, targetEnv, internals = {}) {
  const invocation = internals.runnerInvocation ?? spawnRunnerInvocation();
  const files = createLinuxLaunchFiles({
    cwd: spec.cwd,
    env: targetEnv,
    ...spec.stdio.control === void 0 ? {} : { control: spec.stdio.control }
  });
  const startup = new LinuxScopeStartup(files, "subprocess");
  const unitBase = unitStem("dsh-subprocess");
  let child;
  try {
    child = (internals.spawn ?? spawn2)(internals.systemdRun ?? "systemd-run", scopeArgs(
      unitBase,
      invocation,
      spec.argv
    ), {
      cwd: process.cwd(),
      env: runnerEnvironment(files.requestPath, invocation),
      stdio: runnerStdio(spec, false),
      detached: true
    });
  } catch (error) {
    cleanupLinuxLaunchFiles(files);
    throw error;
  }
  const direct = directOutcome(child, startup);
  const owner = new SystemdScopeOwner(
    `${unitBase}.scope`,
    startup,
    {
      running: () => child.pid !== void 0 && child.exitCode === null && child.signalCode === null,
      signal: (signal) => signalChildGroup(child, signal),
      settled: direct
    },
    internals.systemctl ?? "systemctl",
    internals.spawnSync ?? spawnSync3,
    internals.systemctlQuery ?? querySystemctl,
    internals.sleep ?? sleepWithAbort
  );
  return {
    stdin: child.stdin,
    stdout: child.stdout,
    stderr: child.stderr,
    control: controlPipe(child, spec.stdio.control),
    direct,
    owner
  };
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/windows-job.ts
import { spawn as spawn3 } from "node:child_process";
import { closeSync as closeSync3, openSync as openSync3 } from "node:fs";
import { devNull } from "node:os";
import {
  loadWin32ProcessBindings,
  probeCurrentTokenJobSupport
} from "@deepseek-ai/dsh-win32-process";
function isWindowsStartCancellationError(error) {
  return error.name === "Error" && error.message === "subprocess target start was cancelled" && error.code === void 0 && error.syscall === void 0 && error.path === void 0;
}
function bootstrapFailureHint(stderr) {
  const text = stderr.toString("utf8");
  if (text.includes("uv_os_get_passwd") && text.includes("ENOMEM")) return "; helper bootstrap: uv_os_get_passwd/ENOMEM";
  for (const code of ["ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND", "ERR_UNKNOWN_FILE_EXTENSION", "EACCES", "EPERM", "ENOMEM", "SyntaxError"]) {
    if (text.includes(code)) return `; helper bootstrap: ${code}`;
  }
  return "";
}
function probeWindowsJob(internals = {}) {
  try {
    const invocation = internals.runnerInvocation ?? (internals.resolveRunnerInvocation ?? spawnRunnerInvocation)();
    if (!(internals.runnerAvailable ?? runnerInvocationAvailable)(invocation)) return false;
    const api = (internals.loadWin32ProcessBindings ?? loadWin32ProcessBindings)();
    (internals.probeCurrentTokenJobSupport ?? probeCurrentTokenJobSupport)(api);
    return true;
  } catch {
    return false;
  }
}
var WindowsJobOwner = class {
  constructor(runner, exited, directResultType, failInfrastructure) {
    this.runner = runner;
    this.exited = exited;
    this.directResultType = directResultType;
    this.failInfrastructure = failInfrastructure;
    const clearDeadline = () => {
      if (this.forceDeadline !== void 0) clearTimeout(this.forceDeadline);
      this.forceDeadline = void 0;
    };
    void this.exited.then(clearDeadline, clearDeadline);
  }
  runner;
  exited;
  directResultType;
  failInfrastructure;
  cancellationReason;
  cancellationReasonSet = false;
  terminationSent;
  forceDeadline;
  signal(signal, cancellationReason) {
    if (!this.cancellationReasonSet) {
      this.cancellationReason = cancellationReason;
      this.cancellationReasonSet = true;
    }
    if (this.terminationSent === signal || this.terminationSent === "SIGKILL") return;
    this.terminationSent = signal;
    if (signal === "SIGKILL") {
      this.forceDeadline = setTimeout(() => {
        this.failInfrastructure(new Error(
          "subprocess-local: Windows runner did not confirm managed-range exit after forced termination; ownership remains unknown"
        ));
        this.terminateForHostExit();
      }, 1e3);
      this.forceDeadline.unref();
    }
    if (!this.runner.connected) return;
    try {
      this.runner.send?.({ type: "terminate", signal }, (error) => {
        if (error === null) return;
        if (this.directResultType() !== void 0) return;
        this.failInfrastructure(error);
        this.terminateForHostExit();
      });
    } catch (error) {
      this.failInfrastructure(error);
      this.terminateForHostExit();
    }
  }
  mapStartFailure(failure, serialized) {
    return this.cancellationReasonSet && isWindowsStartCancellationError(serialized) ? this.cancellationReason : failure;
  }
  async waitForExit() {
    await this.exited;
  }
  terminateForHostExit() {
    try {
      this.runner.kill("SIGKILL");
    } catch {
    }
  }
};
function launchWindowsJob(spec, targetEnv, internals = {}) {
  const invocation = internals.runnerInvocation ?? spawnRunnerInvocation();
  const [command, ...prefix] = invocation;
  const ignoredStdinFd = spec.stdio.stdin === "ignore" ? openSync3(devNull, "r") : void 0;
  let child;
  try {
    child = (internals.spawn ?? spawn3)(command, [
      ...prefix,
      "--",
      ...spec.argv
    ], {
      cwd: process.cwd(),
      windowsHide: true,
      env: runnerEnvironment(WINDOWS_RUNNER_SELECTION, invocation),
      stdio: runnerStdio(spec, true, ignoredStdinFd ?? "pipe")
    });
  } finally {
    if (ignoredStdinFd !== void 0) closeSync3(ignoredStdinFd);
  }
  const targetStdin = child.stdio[4];
  const helperStderr = child.stdio[2];
  let bootstrapStderr = Buffer.alloc(0);
  helperStderr?.on("data", (chunk) => {
    const remaining = 4096 - bootstrapStderr.length;
    if (remaining > 0) bootstrapStderr = Buffer.concat([bootstrapStderr, chunk.subarray(0, remaining)]);
  });
  const direct = Promise.withResolvers();
  const rangeExit = Promise.withResolvers();
  let directResultType;
  let runnerSpawned = false;
  let runnerExit;
  let ipcDisconnected = false;
  const failInfrastructure = (error) => {
    direct.reject(error);
    rangeExit.reject(error);
  };
  const settleRange = () => {
    if (!runnerSpawned || runnerExit === void 0) return;
    const { exitCode, signal } = runnerExit;
    if (exitCode === 0 && signal === null) {
      if (directResultType !== void 0) {
        rangeExit.resolve();
        return;
      }
      if (!ipcDisconnected) return;
    }
    const status = signal !== null ? `signal ${signal}` : exitCode === null ? "without an exit status" : `exit code ${String(exitCode)}`;
    failInfrastructure(new Error(
      `subprocess-local: Windows Job runner exited with ${status} before proving its managed range empty${bootstrapFailureHint(bootstrapStderr)}`
    ));
  };
  const owner = new WindowsJobOwner(
    child,
    rangeExit.promise,
    () => directResultType,
    failInfrastructure
  );
  child.on("message", (value) => {
    try {
      const normalStop = parseWindowsNormalStop(value);
      if (normalStop !== void 0) {
        internals.onNormalStop?.(normalStop.status);
        return;
      }
    } catch (error) {
      failInfrastructure(error);
      owner.terminateForHostExit();
      return;
    }
    if (directResultType !== void 0) {
      const error = new Error("subprocess-local: Windows runner emitted more than one direct result");
      failInfrastructure(error);
      owner.terminateForHostExit();
      return;
    }
    let result;
    try {
      result = parseWindowsRunnerResult(value);
    } catch (error) {
      failInfrastructure(error);
      owner.terminateForHostExit();
      return;
    }
    directResultType = result.type;
    if (result.type === "target-exit") {
      direct.resolve({ exitCode: result.exitCode, signal: null });
    } else {
      direct.reject(owner.mapStartFailure(deserializeRunnerError(result.error), result.error));
    }
    settleRange();
  });
  child.once("spawn", () => {
    runnerSpawned = true;
    try {
      if (child.send === void 0) throw new Error("subprocess-local: Windows runner has no IPC channel");
      child.send({ type: "start", cwd: spec.cwd, env: targetEnv, ...spec.stdio.control === void 0 ? {} : { control: spec.stdio.control } }, (error) => {
        if (error === null) return;
        failInfrastructure(error);
        owner.terminateForHostExit();
      });
    } catch (error) {
      failInfrastructure(error);
      owner.terminateForHostExit();
    }
  });
  child.once("error", (error) => {
    if (!runnerSpawned) {
      direct.reject(error);
      rangeExit.resolve();
      return;
    }
    failInfrastructure(error);
  });
  child.once("exit", (exitCode, signal) => {
    runnerExit = { exitCode, signal };
    settleRange();
  });
  child.once("disconnect", () => {
    ipcDisconnected = true;
    settleRange();
  });
  return {
    stdin: spec.stdio.stdin === "ignore" ? null : targetStdin,
    stdout: child.stdio[5],
    stderr: child.stdio[6],
    control: controlPipe(child, spec.stdio.control),
    direct: direct.promise,
    owner
  };
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/terminal.ts
import { Buffer as Buffer2 } from "node:buffer";
import { constants } from "node:os";
import { PassThrough } from "node:stream";
function delay(ms, signal) {
  return new Promise((resolve2) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve2();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
  });
}
async function raceWithDelay(operation, ms, timeout) {
  const controller = new AbortController();
  try {
    return await Promise.race([
      operation,
      delay(ms, controller.signal).then(() => timeout)
    ]);
  } finally {
    controller.abort();
  }
}
function signalName(number) {
  if (number === void 0 || number === 0) return null;
  for (const [name, value] of Object.entries(constants.signals)) {
    if (value === number) return name;
  }
  return null;
}
var LocalTerminalHandle = class {
  /**
   * @param terminal - allocated node-pty process.
   * @param inspector - platform process/session operations.
   * @param graceMs - TERM-to-KILL and exit-wait grace.
   * @param platform - host platform; defaults to the running platform, injectable for deterministic tests.
   */
  constructor(terminal, inspector, graceMs, platform = process.platform, managedOwner, resolveManagedOutcome, shellActivity, onQuiescence, observeShellExit = false) {
    this.terminal = terminal;
    this.inspector = inspector;
    this.graceMs = graceMs;
    this.platform = platform;
    this.managedOwner = managedOwner;
    this.resolveManagedOutcome = resolveManagedOutcome;
    this.shellActivity = shellActivity;
    this.onQuiescence = onQuiescence;
    this.observeShellExit = observeShellExit;
    this.pid = terminal.pid;
    try {
      this.rootIdentity = inspector.snapshot().tree(this.pid).find((member) => member.pid === this.pid);
    } catch (_rootIdentityUnavailable) {
      this.rootIdentity = void 0;
    }
    this.done = this.outcome.promise;
    const resume = () => {
      if (!this.outputPaused) return;
      this.outputPaused = false;
      if (!this.exited) terminal.resume();
    };
    this.output.on("drain", resume);
    this.output.once("close", () => {
      this.output.off("drain", resume);
    });
    this.dataDisposable = terminal.onData((data) => {
      if (!this.output.write(Buffer2.from(data, "utf8")) && this.cleanup === void 0 && !this.outputPaused) {
        this.outputPaused = true;
        terminal.pause();
      }
    });
    this.exitDisposable = terminal.onExit(({ exitCode, signal: exitSignal }) => {
      if (this.exited) return;
      this.exited = true;
      if (this.managedOwner !== void 0 && this.observeShellExit) {
        void this.managedOwner.waitForExit().then(() => {
          this.managedRangeEmpty = true;
        }).catch(() => {
        });
      }
      this.output.end();
      const outcome = {
        exitCode: exitSignal === void 0 || exitSignal === 0 ? exitCode : null,
        signal: signalName(exitSignal)
      };
      try {
        this.outcome.resolve(this.resolveManagedOutcome?.(outcome) ?? outcome);
      } catch (error) {
        this.outcome.reject(error);
      }
    });
  }
  terminal;
  inspector;
  graceMs;
  platform;
  managedOwner;
  resolveManagedOutcome;
  shellActivity;
  onQuiescence;
  observeShellExit;
  pid;
  output = new PassThrough();
  done;
  outcome = Promise.withResolvers();
  dataDisposable;
  exitDisposable;
  cleanup;
  managedOwnerCleaned = false;
  exited = false;
  outputPaused = false;
  trackedDescendants = [];
  activityRevision = 0;
  activityKey = "";
  quiescent = false;
  managedRangeEmpty = false;
  /** The spawned shell's start identity; scans stop adopting members once the root pid no longer carries it. */
  rootIdentity;
  /** Whether node-pty has not yet published the top-level exit event. */
  get running() {
    return !this.exited;
  }
  // node-pty writes synchronously; the seam returns a promise for remote transports.
  // oxlint-disable-next-line typescript/require-await -- Preserve promise rejection semantics at the async provider contract.
  async write(data) {
    if (this.exited) throw new Error("terminal process has exited");
    this.shellActivity?.invalidate();
    this.terminal.write(data);
  }
  // oxlint-disable-next-line typescript/require-await -- Provider operations share promise rejection semantics.
  async resize(cols, rows) {
    if (this.exited) throw new Error("terminal process has exited");
    this.terminal.resize(cols, rows);
  }
  // Local inspection is synchronous; the seam returns a promise for remote transports.
  // oxlint-disable-next-line typescript/require-await -- Preserve promise rejection semantics at the async provider contract.
  async inspectForeground() {
    this.descendants(this.inspector.snapshot());
    const processGroupId = this.inspector.foregroundPgid(this.pid);
    if (processGroupId === void 0) return void 0;
    return {
      processGroupId,
      inputWaiting: this.inspector.isStdinWaiting(processGroupId, this.pid)
    };
  }
  // oxlint-disable-next-line typescript/require-await -- Local inspection is synchronous; SSH shares this promise interface.
  async inspectActivity() {
    let state = this.quiescent ? "idle" : "unknown";
    let revision = 0;
    if (!this.quiescent) {
      try {
        const shell = this.shellActivity?.inspect(this.pid) ?? { state: "unknown", revision: 0 };
        revision = shell.revision;
        const observed = this.inspector.snapshot();
        const descendants = this.descendants(observed);
        const root = observed.tree(this.pid).find((member) => member.pid === this.pid);
        if (this.exited && this.managedRangeEmpty) state = "idle";
        else if (descendants.length > 0) state = "busy";
        else if (this.exited && this.managedOwner === void 0 && this.platform === "linux" && observed.complete === true && root === void 0) {
          state = observed.session(this.pid).some((member) => observed.alive(member)) ? "busy" : "idle";
        } else if (observed.complete === true && root?.started === this.rootIdentity?.started && root !== void 0) {
          const foreground = this.inspector.foregroundPgid(this.pid);
          state = foreground === void 0 ? "unknown" : foreground === this.pid ? shell.state : "busy";
          if (state === "idle" && this.managedOwner !== void 0) {
            const tasks = this.managedOwner.inspectTaskCount?.();
            state = tasks === void 0 || tasks < 1 ? "unknown" : tasks === 1 ? "idle" : "busy";
          }
        }
      } catch (_incompleteActivityObservation) {
        state = "unknown";
      }
    }
    const key = `${revision}:${state}`;
    if (key !== this.activityKey) {
      this.activityKey = key;
      this.activityRevision++;
    }
    return { state, revision: this.activityRevision };
  }
  async signalForeground(signal) {
    this.shellActivity?.invalidate();
    const foreground = await this.inspectForeground();
    if (foreground === void 0) {
      throw new Error(`cannot resolve foreground process group for terminal ${this.pid}`);
    }
    if (signal === "SIGKILL" && foreground.processGroupId === this.pid) {
      throw new Error("refusing to SIGKILL the terminal shell; terminate the terminal session instead");
    }
    if (this.platform === "win32") {
      if (signal === "SIGINT") {
        this.terminal.write("");
        return foreground.processGroupId;
      }
      if (signal === "SIGTSTP" || signal === "SIGHUP") {
        throw new Error(`signal ${signal} is unsupported on Windows; only SIGINT, SIGTERM, and SIGKILL are available`);
      }
    }
    this.inspector.signalGroup(foreground.processGroupId, signal);
    return foreground.processGroupId;
  }
  terminate() {
    if (this.cleanup !== void 0) return this.cleanup;
    if (this.outputPaused) {
      this.outputPaused = false;
      this.terminal.resume();
    }
    const cleanup = this.closeOnce().then(() => {
      this.quiescent = true;
      this.shellActivity?.dispose();
      this.onQuiescence?.();
    });
    this.cleanup = cleanup;
    void cleanup.catch(() => {
      this.cleanup = void 0;
    });
    return cleanup;
  }
  /**
   * Force-terminate the observable session synchronously during Node's exit
   * event. This does not claim quiescence and does not replace terminate().
   */
  terminateForHostExit() {
    this.forceStopDescendants();
    this.forceStopShell();
    this.forceStopDescendants();
    this.managedOwner?.terminateForHostExit();
  }
  forceStopShell() {
    if (this.exited) return;
    if (this.rootIdentity !== void 0) {
      try {
        this.inspector.signalProcess(this.rootIdentity, "SIGKILL");
      } catch (_rootExitedDuringHostExit) {
      }
      return;
    }
    try {
      this.terminal.kill("SIGKILL");
    } catch (_unidentifiedShellExitedDuringHostExit) {
    }
  }
  survivors(members, observed) {
    return members.filter((member) => observed.alive(member));
  }
  descendants(observed) {
    const tree = observed.tree(this.pid);
    const root = tree.find((member) => member.pid === this.pid);
    const rootVerified = this.rootIdentity !== void 0 && root !== void 0 && root.started === this.rootIdentity.started;
    this.trackedDescendants = this.survivors(this.unionMembers(
      this.trackedDescendants,
      ...rootVerified ? [tree, observed.session(this.pid)] : []
    ).filter((member) => member.pid !== this.pid), observed);
    return this.trackedDescendants;
  }
  async waitForMembers(members) {
    if (members.length === 0) return [];
    const until = Date.now() + this.graceMs;
    let survivors = this.survivors(members, this.inspector.snapshot());
    while (survivors.length > 0 && Date.now() < until) {
      await delay(Math.min(25, Math.max(1, until - Date.now())));
      survivors = this.survivors(members, this.inspector.snapshot());
    }
    return survivors;
  }
  signalMembers(members, signal) {
    for (const member of members) {
      try {
        this.inspector.signalProcess(member, signal);
      } catch (_alreadyExitedDuringSignal) {
      }
    }
  }
  forceStopDescendants() {
    let members = this.trackedDescendants;
    try {
      members = this.descendants(this.inspector.snapshot());
    } catch (_processTableUnavailableDuringHostExit) {
    }
    this.signalMembers(members, "SIGKILL");
  }
  unionMembers(...groups) {
    const members = [];
    const seen = /* @__PURE__ */ new Set();
    for (const group of groups) {
      for (const member of group) {
        const key = `${member.pid}:${member.started}`;
        if (seen.has(key)) continue;
        seen.add(key);
        members.push(member);
      }
    }
    return members;
  }
  async stopDescendants() {
    const captured = this.descendants(this.inspector.snapshot());
    this.signalMembers(captured, "SIGTERM");
    const capturedSurvivors = await this.waitForMembers(captured);
    const members = this.unionMembers(capturedSurvivors, this.descendants(this.inspector.snapshot()));
    this.signalMembers(members, "SIGKILL");
    const survivors = await this.waitForMembers(members);
    const observed = this.inspector.snapshot();
    return this.survivors(this.unionMembers(survivors, this.descendants(observed)), observed);
  }
  async stopShell() {
    if (this.platform === "win32") {
      await this.stopShellWindows();
      return;
    }
    if (!this.exited) {
      try {
        this.terminal.kill("SIGTERM");
      } catch (_topLevelAlreadyExitedDuringTerm) {
      }
      await Promise.race([this.done.then(() => void 0), delay(this.graceMs)]);
    }
    if (!this.exited) {
      try {
        this.terminal.kill("SIGKILL");
      } catch (_topLevelAlreadyExitedDuringKill) {
      }
      await Promise.race([this.done.then(() => void 0), delay(this.graceMs)]);
    }
    if (!this.exited) throw new Error(`terminal cleanup failed; surviving pid: ${this.pid}`);
  }
  async stopShellWindows() {
    const shellGone = () => this.exited || this.rootIdentity !== void 0 && !this.inspector.isAlive(this.rootIdentity);
    if (!shellGone() && this.rootIdentity !== void 0) {
      this.inspector.signalProcess(this.rootIdentity, "SIGTERM");
      await this.waitForWindowsShellExit();
    }
    if (!shellGone() && this.rootIdentity === void 0) {
      try {
        this.terminal.kill();
      } catch (_topLevelAlreadyExitedDuringKill) {
      }
      await Promise.race([this.done.then(() => void 0), delay(this.graceMs)]);
    }
    if (!shellGone() && this.rootIdentity !== void 0) {
      this.inspector.signalProcess(this.rootIdentity, "SIGKILL");
      await this.waitForWindowsShellExit();
    }
    if (!shellGone()) throw new Error(`terminal cleanup failed; surviving pid: ${this.pid}`);
  }
  async waitForWindowsShellExit() {
    const until = Date.now() + this.graceMs;
    while (!this.exited && Date.now() < until) {
      if (this.rootIdentity !== void 0 && !this.inspector.isAlive(this.rootIdentity)) return;
      await delay(Math.min(25, Math.max(1, until - Date.now())));
    }
  }
  async closeOnce() {
    if (this.managedOwner !== void 0) {
      try {
        await this.closeManagedRange(this.managedOwner);
        this.dataDisposable.dispose();
        this.exitDisposable.dispose();
      } finally {
        void this.done.finally(() => {
          this.cleanupManagedOwner(this.managedOwner);
        }).catch(() => {
        });
      }
      return;
    }
    let survivors = await this.stopDescendants();
    if (survivors.length > 0) {
      throw new Error(`terminal cleanup failed; surviving pids: ${survivors.map((member) => member.pid).join(", ")}`);
    }
    await this.stopShell();
    survivors = await this.stopDescendants();
    if (survivors.length > 0) {
      throw new Error(`terminal cleanup failed; surviving pids: ${survivors.map((member) => member.pid).join(", ")}`);
    }
    this.settleExitIfGone();
    this.dataDisposable.dispose();
    this.exitDisposable.dispose();
  }
  cleanupManagedOwner(owner) {
    if (this.managedOwnerCleaned) return;
    this.managedOwnerCleaned = true;
    owner.cleanup?.();
  }
  async closeManagedRange(owner) {
    owner.signal("SIGTERM");
    const observation = owner.waitForExit();
    const first = await raceWithDelay(observation.then(
      () => ({ kind: "stopped" }),
      (error) => ({ kind: "failed", error })
    ), this.graceMs, { kind: "timeout" });
    if (first.kind !== "stopped") {
      owner.signal("SIGKILL");
      if (first.kind === "failed") {
        try {
          await owner.waitForExit();
        } catch (finalError) {
          throw new AggregateError([first.error, finalError], "terminal managed-range cleanup failed");
        }
        throw first.error;
      }
      await observation;
    }
    if (!this.exited) {
      await raceWithDelay(this.done.then(() => void 0), this.graceMs, void 0);
    }
    if (!this.exited) throw new Error(`terminal cleanup failed; surviving pid: ${this.pid}`);
  }
  settleExitIfGone() {
    if (this.platform !== "win32") return;
    if (this.exited) return;
    if (this.rootIdentity !== void 0 && this.inspector.isAlive(this.rootIdentity)) return;
    this.exited = true;
    this.output.end();
    this.outcome.resolve({ exitCode: null, signal: null });
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/shell-activity.ts
import { mkdtempSync as mkdtempSync3, readFileSync as readFileSync3, rmSync, writeFileSync as writeFileSync2 } from "node:fs";
import { tmpdir as tmpdir3 } from "node:os";
import { basename as basename2, join as join3 } from "node:path";
function quote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
var ShellActivity = class {
  /**
   * @param directory - private startup and status file directory.
   * @param argv - shell launch preserving supported user startup files.
   * @param env - environment with any temporary startup redirect.
   */
  constructor(directory, argv, env) {
    this.directory = directory;
    this.argv = argv;
    this.env = env;
  }
  directory;
  argv;
  env;
  revision = 0;
  observed = "";
  invalidated;
  state = "unknown";
  /** Invalidate prompt evidence before delivering input or a foreground signal. */
  invalidate() {
    this.invalidated = this.read();
    this.revision++;
    this.state = "unknown";
  }
  /**
   * Read the latest top-level shell transition, fenced against input since that transition.
   * @param pid - original shell process id.
   * @returns lifecycle evidence; process ownership must be checked separately.
   */
  inspect(pid) {
    const record = this.read();
    if (record !== this.observed) {
      this.observed = record;
      this.revision++;
    }
    const match = /^(\d+):(\d+):(idle|busy)\n?$/u.exec(record);
    this.state = record === this.invalidated || match?.[1] !== String(pid) ? "unknown" : match[3];
    return { state: this.state, revision: this.revision };
  }
  /** Remove private startup and status files after process quiescence. */
  dispose() {
    rmSync(this.directory, { recursive: true, force: true });
  }
  read() {
    try {
      return readFileSync3(join3(this.directory, "state"), "utf8");
    } catch (_unavailableShellObservation) {
      return "";
    }
  }
};
function prepareShellActivity(spec, env, platform) {
  if (spec.shellActivity !== true || platform === "win32" || spec.argv.length !== 2 || spec.argv[1] !== "-i") return void 0;
  const shell = basename2(spec.argv[0]);
  if (shell !== "bash" && shell !== "zsh") return void 0;
  const directory = mkdtempSync3(join3(tmpdir3(), "dsh-shell-"));
  const state = quote(join3(directory, "state"));
  const guards = quote(join3(directory, "guards"));
  try {
    if (shell === "bash") {
      const rc = join3(directory, "bashrc");
      writeFileSync2(rc, [
        "[[ ! -r ~/.bashrc ]] || builtin source ~/.bashrc",
        "if (( BASH_VERSINFO[0] > 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 4) )) && [[ ! $(declare -p PROMPT_COMMAND PS0 2>/dev/null) =~ declare\\ -[^[:space:]]*r ]]; then",
        "  __dsh_shell_pid=$BASHPID; __dsh_shell_sequence=0",
        "  __dsh_shell_idle() {",
        "    local result=$?",
        '    if [[ $BASHPID == "$__dsh_shell_pid" ]]; then',
        "      (( ++__dsh_shell_sequence ))",
        "      local activity=idle",
        `      builtin trap -p >| ${guards}`,
        `      [[ ! -s ${guards} ]] || activity=unknown`,
        `      builtin printf '%s:%s:%s\\n' "$BASHPID" "$__dsh_shell_sequence" "$activity" >| ${state}`,
        "    fi",
        '    return "$result"',
        "  }",
        '  if [[ $(declare -p PROMPT_COMMAND 2>/dev/null) == "declare -a "* ]]; then',
        "    PROMPT_COMMAND+=(__dsh_shell_idle)",
        "  else",
        `    PROMPT_COMMAND="\${PROMPT_COMMAND}"$'\\n'"__dsh_shell_idle"`,
        "  fi",
        `  PS0+=${quote(`$(builtin printf '%s:%s:busy' "$__dsh_shell_pid" "$__dsh_shell_sequence" >| ${state})`)}`,
        "fi",
        ""
      ].join("\n"), { mode: 384, flag: "wx" });
      return new ShellActivity(directory, [spec.argv[0], "--rcfile", rc, "-i"], env);
    }
    writeFileSync2(join3(directory, ".zshenv"), [
      env.ZDOTDIR === void 0 ? "unset ZDOTDIR" : `ZDOTDIR=${quote(env.ZDOTDIR)}`,
      '[[ ! -r ${ZDOTDIR:-$HOME}/.zshenv ]] || builtin source "${ZDOTDIR:-$HOME}/.zshenv"',
      "typeset -g __dsh_shell_pid=$$ __dsh_shell_sequence=0",
      "__dsh_shell_activity() {",
      "  (( ZSH_SUBSHELL == 0 && $$ == __dsh_shell_pid )) || return",
      "  (( ++__dsh_shell_sequence ))",
      `  builtin printf '%s:%s:%s\\n' "$$" "$__dsh_shell_sequence" "$1" >| ${state}`,
      "  return 0",
      "}",
      "__dsh_shell_idle() {",
      `  { builtin trap; zle -F; } >| ${guards}`,
      "  if [[ $CONTEXT != start || -n $BUFFER ]]; then __dsh_shell_activity busy",
      `  elif [[ -s ${guards} || -n \${(k)functions[(I)TRAP*]} ]]; then __dsh_shell_activity unknown`,
      "  else __dsh_shell_activity idle; fi",
      "}",
      "__dsh_shell_busy() { __dsh_shell_activity busy }",
      "__dsh_shell_init() {",
      "  autoload -Uz add-zle-hook-widget add-zsh-hook",
      "  add-zle-hook-widget line-init __dsh_shell_idle",
      "  add-zle-hook-widget line-finish __dsh_shell_busy",
      "  add-zsh-hook preexec __dsh_shell_busy",
      "  precmd_functions=(${precmd_functions:#__dsh_shell_init})",
      "}",
      "typeset -ga precmd_functions",
      "precmd_functions+=(__dsh_shell_init)",
      ""
    ].join("\n"), { mode: 384, flag: "wx" });
    return new ShellActivity(directory, spec.argv, { ...env, ZDOTDIR: directory });
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/index.ts
var requireNodePty = createLazyRequire3("node-pty", import.meta.url);
var LocalSubprocessRuntime = class extends SubprocessRuntime {
  /** Live handles retained for normal disposal and synchronous host-exit finalization. */
  live = /* @__PURE__ */ new Set();
  /** Live terminals retained through normal quiescence or host-exit finalization. */
  terminals = /* @__PURE__ */ new Set();
  /** Caller endpoints retained until close, independently of managed process lifetime. */
  controlChannels = /* @__PURE__ */ new Set();
  /** Test hook: process, spill, and platform operations forwarded to spawnSubprocess. */
  internals = {};
  /** Provider-lifetime latch suppressing repeated weaker-containment warnings. */
  fallbackWarningIssued = false;
  /** Positive-only cache for the expensive Linux bootstrap and scope probe. */
  linuxDeepProbePassed = false;
  /** Test hook for platform process inspection; production resolves lazily on terminal spawn. */
  terminalInspector;
  constructor(ctx) {
    super(ctx);
    ctx.effect(() => {
      const onHostExit = () => {
        this.terminateForHostExit();
      };
      process.prependListener("exit", onHostExit);
      return async () => {
        await this.disposeManagedProcesses();
        process.off("exit", onHostExit);
      };
    }, "local subprocess teardown");
  }
  terminateForHostExit() {
    for (const handle of this.live) {
      try {
        handle.terminateForHostExit();
      } catch (_ordinaryRangeTerminationFailed) {
      }
    }
    for (const terminal of this.terminals) {
      try {
        terminal.terminateForHostExit();
      } catch (_terminalTerminationFailed) {
      }
    }
  }
  async disposeManagedProcesses() {
    const pending = [];
    for (const handle of this.live) {
      handle.terminate();
      pending.push(Promise.all([
        handle.done.catch(() => {
        }),
        handle.waitForExit()
      ]).then(() => {
        this.live.delete(handle);
      }));
    }
    for (const terminal of this.terminals) {
      pending.push(terminal.terminate().then(() => {
        this.terminals.delete(terminal);
      }));
    }
    const outcomes = await Promise.allSettled(pending);
    await Promise.all([...this.controlChannels].map((control) => new Promise((resolveClose) => {
      control.once("close", () => {
        resolveClose();
      });
      control.destroy();
    })));
    this.controlChannels.clear();
    const failures = [];
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") failures.push(outcome.reason);
    }
    if (failures.length > 0) this.terminateForHostExit();
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "local subprocess teardown failed");
  }
  async resolveExecutable(command, env, signal) {
    if (command.length === 0) throw new Error("subprocess-local: executable must be non-empty");
    signal?.throwIfAborted();
    const environment = childEnv(env);
    const absolute = isAbsolute3(command);
    if (!absolute && (command.includes("/") || process.platform === "win32" && command.includes("\\"))) {
      throw new Error(
        `subprocess-local: command ${JSON.stringify(command)} is a relative path; use an absolute path or a bare PATH name`
      );
    }
    const candidates = absolute ? [command] : this.executableCandidates(command, environment);
    for (const candidate of candidates) {
      signal?.throwIfAborted();
      try {
        const info = await stat(candidate);
        if (!info.isFile()) continue;
        await access(candidate, constants2.X_OK);
        signal?.throwIfAborted();
        return candidate;
      } catch {
      }
    }
    signal?.throwIfAborted();
    throw new SubprocessExecutableNotFoundError(absolute ? `subprocess-local: command ${JSON.stringify(command)} is not an executable file` : `subprocess-local: command ${JSON.stringify(command)} was not found on PATH`);
  }
  executableCandidates(command, env) {
    const path = environmentValue(env, "PATH") ?? "";
    const extensions = process.platform === "win32" && extname2(command) === "" ? (environmentValue(env, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD").split(";") : [""];
    return path.split(delimiter).flatMap((directory) => extensions.map((extension) => resolve(process.cwd(), directory, command + extension)));
  }
  spawn(spec) {
    validateSubprocessSpec(spec);
    const env = targetEnvironment(spec);
    const containmentMode = this.selectContainmentMode("ordinary");
    let handle;
    if (containmentMode === "fallback") {
      handle = spawnSubprocess(spec, this.internals);
    } else {
      const binding = prepareManagedProcessBinding(this.internals);
      const launch = containmentMode === "linux-scope" ? launchLinuxScope(spec, env) : launchWindowsJob(spec, env, { onNormalStop: (status) => {
        if (status === "unavailable") this.ctx.logger.warn("Windows process has no usable console stop; waiting for the configured grace before forcing its owned Job");
      } });
      handle = bindManagedProcess(spec, launch, binding);
    }
    this.live.add(handle);
    const control = handle.control;
    if (control !== void 0) {
      this.controlChannels.add(control);
      control.once("close", () => {
        this.controlChannels.delete(control);
      });
    }
    const release = () => handle.waitForExit().then(() => {
      this.live.delete(handle);
    });
    void handle.done.then(release, release).catch(() => {
    });
    return handle;
  }
  selectContainmentMode(kind) {
    const platform = this.internals.platform ?? process.platform;
    let fallbackReason;
    if (platform === "linux") {
      const available = this.linuxDeepProbePassed ? probeLinuxManager() : probeLinuxNative();
      if (available) this.linuxDeepProbePassed = true;
      if (available) return "linux-scope";
      fallbackReason = "the current user-systemd scope or private bootstrap is unavailable";
    }
    if (kind === "ordinary" && platform === "win32") {
      const available = probeWindowsJob();
      if (available) return "windows-job";
      throw new Error("subprocess-local: Windows Job containment unavailable; refusing to start an unowned process");
    }
    this.warnFallback(platform, kind, fallbackReason);
    return "fallback";
  }
  warnFallback(platform, kind, selectedReason) {
    if (this.fallbackWarningIssued) return;
    this.fallbackWarningIssued = true;
    const reason = selectedReason ?? (platform === "darwin" ? "macOS has no supported persistent process-range owner" : platform === "win32" ? kind === "terminal" ? "Windows ConPTY remains outside Job containment" : "the Win32 Job runner is unavailable" : `platform ${platform} has no native managed range`);
    this.ctx.logger.warn(
      `subprocess-local is using weaker process-tree containment because ${reason}; descendants that escape the process group or direct-parent tree are not guaranteed to terminate or delay waitForExit()`
    );
  }
  /** @inheritdoc */
  // oxlint-disable-next-line typescript/require-await -- Keep the provider promise rejection semantics for cancelled inspection.
  async terminalEnvironment(signal) {
    signal?.throwIfAborted();
    const platform = process.platform === "win32" ? "windows" : "posix";
    const defaultShell = platform === "windows" ? process.env.ComSpec || void 0 : process.env.SHELL || userInfo().shell || void 0;
    return { platform, ...defaultShell === void 0 ? {} : { defaultShell } };
  }
  // Local PTY allocation is synchronous, but the provider contract permits remote asynchronous allocation.
  // oxlint-disable-next-line typescript/require-await -- Preserve promise rejection semantics at the async provider contract.
  async spawnTerminal(spec) {
    const file = spec.argv[0];
    if (file === void 0 || file.length === 0) {
      throw new Error("subprocess-local: terminal argv must contain a program");
    }
    spec.signal?.throwIfAborted();
    const inspector = this.terminalInspector ?? createProcessInspector();
    const containmentMode = this.selectContainmentMode("terminal");
    const env = targetEnvironment(spec);
    const activity = prepareShellActivity(spec, env, this.internals.platform ?? process.platform);
    const launch = activity === void 0 ? spec : { ...spec, argv: activity.argv, env: activity.env };
    const options = {
      name: spec.terminalType,
      rows: spec.rows,
      cols: spec.cols,
      cwd: spec.cwd,
      env: { ...activity?.env ?? env, TERM: spec.terminalType }
    };
    let scope;
    let terminal;
    try {
      scope = containmentMode === "linux-scope" ? prepareLinuxTerminalScope(launch, { ...activity?.env ?? env, PWD: spec.cwd, TERM: spec.terminalType }) : void 0;
      if (scope !== void 0) {
        options.cwd = scope.cwd;
        options.env = scope.env;
      }
      terminal = requireNodePty().spawn(
        scope?.command ?? file,
        scope?.args ?? [...launch.argv.slice(1)],
        options
      );
    } catch (error) {
      scope?.cleanup();
      activity?.dispose();
      throw error;
    }
    let handle;
    const directSettlement = Promise.withResolvers();
    const owner = scope?.bindOwner({
      running: () => handle?.running ?? true,
      settled: directSettlement.promise,
      // node-pty swallows signal errors; the scope owner requires their delivery result.
      signal: (signal) => signalLinuxDirectProcess(terminal.pid, () => process.kill(terminal.pid, signal))
    });
    handle = new LocalTerminalHandle(
      terminal,
      inspector,
      spec.graceMs,
      this.internals.platform ?? process.platform,
      owner,
      scope?.resolveOutcome,
      activity,
      () => {
        this.terminals.delete(handle);
      },
      spec.shellActivity === true
    );
    this.terminals.add(handle);
    const release = async () => {
      directSettlement.resolve();
      if (spec.shellActivity === true) return;
      await handle.terminate();
      this.terminals.delete(handle);
    };
    void handle.done.then(release, release).catch(() => {
    });
    return handle;
  }
};
function environmentValue(env, name) {
  const exact = env[name];
  if (exact !== void 0 || process.platform !== "win32") return exact;
  const normalized = name.toUpperCase();
  return Object.entries(env).find(([key]) => key.toUpperCase() === normalized)?.[1];
}
var index_default = LocalSubprocessRuntime;
export {
  LocalSubprocessRuntime,
  index_default as default
};
//# sourceMappingURL=index.js.map
