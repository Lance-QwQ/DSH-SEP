// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/runner-launch.ts
import { accessSync, constants as fsConstants, lstatSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/spawn.ts
import { scrubbedParentEnv } from "@deepseek-ai/dsh-subprocess";
import { MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/control-spawn.ts
import { SUBPROCESS_CONTROL_ENV, SUBPROCESS_CONTROL_FD } from "@deepseek-ai/dsh-subprocess/control";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/spawn.ts
import { SUBPROCESS_CONTROL_FD as SUBPROCESS_CONTROL_FD2 } from "@deepseek-ai/dsh-subprocess/control";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/windows-inspector.ts
import { createLazyRequire } from "@deepseek-ai/dsh-lazy-require";
var requireKoffi = createLazyRequire("koffi", import.meta.url);

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/process-inspector.ts
var SYSCALLS = {
  x64: { read: 0, select: 23, pselect: 270, poll: 7, ppoll: 271, epollWait: 232, epollPwait: 281 },
  arm64: { read: 63, pselect: 72, ppoll: 73, epollPwait: 22 }
};
var SUPPORTED_SYSCALL_TABLES = Object.values(SYSCALLS);

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/output.ts
import { closeSync, mkdtempSync, openSync, rmdirSync, unlinkSync, writeSync } from "node:fs";
var defaultSpillDir;
process.once("exit", () => {
  if (defaultSpillDir === void 0) return;
  try {
    rmdirSync(defaultSpillDir);
  } catch {
  }
});

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/runner-launch.ts
import { SUBPROCESS_CONTROL_FD as SUBPROCESS_CONTROL_FD3 } from "@deepseek-ai/dsh-subprocess/control";
var SUBPROCESS_RUNNER_ENV = "DSH_SUBPROCESS_RUNNER";
var WINDOWS_RUNNER_SELECTION = "windows";
var SOURCE_TSCONFIG_PATH = fileURLToPath(new URL("../../../../tsconfig.base.json", import.meta.url));
function consumeRunnerSelection(env = process.env) {
  const selection = env[SUBPROCESS_RUNNER_ENV];
  Reflect.deleteProperty(env, SUBPROCESS_RUNNER_ENV);
  return selection;
}
function parseRunnerTargetArgv(argv) {
  if (argv[0] !== "--" || argv.length < 2) {
    throw new Error("subprocess runner requires target argv after a private -- delimiter");
  }
  return [...argv.slice(1)];
}
function windowsEnvironmentValue(env, name) {
  for (const key of Object.keys(env).sort()) {
    if (key.toUpperCase() === name) return env[key];
  }
  return void 0;
}
function executableCandidateExists(candidate) {
  try {
    return !statSync(candidate).isDirectory();
  } catch {
    try {
      const entry = lstatSync(candidate);
      return entry.isFile() || entry.isSymbolicLink();
    } catch {
      return false;
    }
  }
}
function windowsPathDirectories(path) {
  const directories = [];
  let start = 0;
  while (start < path.length) {
    if (path.charAt(start) === ";") {
      start += 1;
      continue;
    }
    const quote = path.charAt(start);
    const quoted = quote === '"' || quote === "'";
    const quoteEnd = quoted ? path.indexOf(quote, start + 1) : -1;
    const separator = path.indexOf(";", quoted ? quoteEnd < 0 ? path.length : quoteEnd : start);
    const end = separator < 0 ? path.length : separator;
    let directory = path.slice(start, end);
    if (directory.startsWith('"') || directory.startsWith("'")) directory = directory.slice(1);
    if (directory.endsWith('"') || directory.endsWith("'")) directory = directory.slice(0, -1);
    if (directory.length > 0) directories.push(directory);
    start = end + 1;
  }
  return directories;
}
function windowsFileNameStart(command) {
  let start = command.length;
  while (start > 0 && !/[\\/:]/u.test(command.charAt(start - 1))) start -= 1;
  return start;
}
function windowsSearchPathJoin(directory, name, cwd) {
  let prefix = cwd;
  let adjustedDirectory = directory;
  const slash = (value) => value === "\\" || value === "/";
  if (directory.length > 2 && slash(directory.charAt(0)) && slash(directory.charAt(1))) {
    prefix = "";
  } else if (directory.length >= 1 && slash(directory.charAt(0))) {
    prefix = cwd.slice(0, 2);
  } else if (directory.length >= 2 && directory.charAt(1) === ":" && (directory.length < 3 || !slash(directory.charAt(2)))) {
    if (cwd.length < 2 || cwd.slice(0, 2).toLowerCase() !== directory.slice(0, 2).toLowerCase()) {
      prefix = "";
    } else {
      adjustedDirectory = directory.slice(2);
    }
  } else if (directory.length > 2 && directory.charAt(1) === ":") {
    prefix = "";
  }
  const append = (base, part) => {
    if (base.length === 0 || part.length === 0) return base + part;
    return /[\\/:]$/u.test(base) ? base + part : `${base}\\${part}`;
  };
  return append(append(prefix, adjustedDirectory), name);
}
function windowsExecutableNames(command, name) {
  const dot = name.indexOf(".");
  const hasExtension = dot >= 0 && dot < name.length - 1;
  const separator = name.endsWith(".") ? "" : ".";
  return [
    ...hasExtension ? [command] : [],
    `${command}${separator}com`,
    `${command}${separator}exe`
  ];
}
function resolveWindowsExecutable(command, cwd, env, exists = executableCandidateExists, currentEnv = process.env) {
  const nameStart = windowsFileNameStart(command);
  const directory = command.slice(0, nameStart);
  const name = command.slice(nameStart);
  const hasPath = nameStart !== 0;
  const roots = [];
  if (hasPath) {
    roots.push(directory);
  } else {
    if (windowsEnvironmentValue(currentEnv, "NODEFAULTCURRENTDIRECTORYINEXEPATH") === void 0) {
      roots.push("");
    }
    const path = windowsEnvironmentValue(env, "PATH") ?? windowsEnvironmentValue(currentEnv, "PATH") ?? "";
    roots.push(...windowsPathDirectories(path));
  }
  for (const root of roots) {
    const base = windowsSearchPathJoin(root, name, cwd);
    for (const candidate of windowsExecutableNames(base, name)) {
      if (exists(candidate)) return candidate;
    }
  }
  return void 0;
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/spawn-runner.ts
import { SUBPROCESS_CONTROL_FD as SUBPROCESS_CONTROL_FD5 } from "@deepseek-ai/dsh-subprocess/control";
import { closeSync as closeSync2 } from "node:fs";
import {
  closeHandleChecked,
  isJobEmpty,
  loadWin32ProcessBindings,
  pollProcessExit,
  spawnCurrentTokenJobProcess,
  terminateJob,
  requestNormalStop,
  Win32Error
} from "@deepseek-ai/dsh-win32-process";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/linux-execve.ts
import { getSystemErrorMessage, getSystemErrorName } from "node:util";
import { SUBPROCESS_CONTROL_FD as SUBPROCESS_CONTROL_FD4 } from "@deepseek-ai/dsh-subprocess/control";
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
    const descriptors = control === "pipe" ? [...STANDARD_FILE_DESCRIPTORS, SUBPROCESS_CONTROL_FD4] : STANDARD_FILE_DESCRIPTORS;
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
  lstatSync as lstatSync2,
  mkdtempSync as mkdtempSync2,
  readFileSync,
  rmdirSync as rmdirSync2,
  unlinkSync as unlinkSync2,
  writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasExactKeys(value, required, optional = []) {
  const allowed = /* @__PURE__ */ new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}
function isStringRecord(value) {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}
function linuxLaunchFilesFromLocator(requestPath) {
  if (!isAbsolute(requestPath) || basename(requestPath) !== "launch-request.json") {
    throw new Error("subprocess runner received an invalid Linux launch-request locator");
  }
  const directory = dirname(requestPath);
  return { directory, requestPath, startupErrorPath: join(directory, "startup-error.json") };
}
function consumeLinuxLaunchRequest(requestPath) {
  const text = readFileSync(requestPath, "utf8");
  unlinkSync2(requestPath);
  const value = JSON.parse(text);
  if (!isRecord(value) || !hasExactKeys(value, ["cwd", "env"], ["control"]) || typeof value.cwd !== "string" || !isStringRecord(value.env) || value.control !== void 0 && value.control !== "pipe") {
    throw new Error("subprocess runner received an invalid Linux launch request");
  }
  return { cwd: value.cwd, env: value.env, ...value.control === "pipe" ? { control: "pipe" } : {} };
}
function writeLinuxStartupError(files, error) {
  writeFileSync(files.startupErrorPath, JSON.stringify(error), { flag: "wx", mode: 384 });
}
function parseWindowsStartRequest(value) {
  if (!isRecord(value) || !hasExactKeys(value, ["type", "cwd", "env"], ["control"]) || value.type !== "start" || typeof value.cwd !== "string" || !isStringRecord(value.env) || value.control !== void 0 && value.control !== "pipe") {
    throw new Error("subprocess runner received an invalid Windows start request");
  }
  return { type: "start", cwd: value.cwd, env: value.env, ...value.control === "pipe" ? { control: "pipe" } : {} };
}
function isWindowsTerminateRequest(value) {
  return isRecord(value) && hasExactKeys(value, ["type", "signal"]) && value.type === "terminate" && (value.signal === "SIGTERM" || value.signal === "SIGKILL");
}
function serializeRunnerError(error) {
  const source = error instanceof Error ? error : new Error(String(error));
  const node = source;
  return {
    name: source.name,
    message: source.message,
    ...typeof node.code === "string" ? { code: node.code } : {},
    ...typeof node.syscall === "string" ? { syscall: node.syscall } : {},
    ...typeof node.path === "string" ? { path: node.path } : {}
  };
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/spawn-runner.ts
var defaultInternals = {
  /* v8 ignore next -- source/built/packaged subprocess smoke executes this only in a replaceable child process. */
  execve: (file, argv, env, control) => loadLinuxExecve()(file, argv, env, control),
  loadWin32ProcessBindings,
  spawnCurrentTokenJobProcess,
  closeFileDescriptor: closeSync2,
  resolveWindowsExecutable,
  pollProcessExit,
  isJobEmpty,
  terminateJob,
  requestNormalStop,
  closeHandleChecked
};
var NODE_SPAWN_DETAIL_CODES = /* @__PURE__ */ new Set(["EACCES", "ENOENT"]);
var WINDOWS_SPAWN_ERROR_CODES = /* @__PURE__ */ new Map([
  [2, "ENOENT"],
  [3, "ENOENT"],
  [267, "ENOENT"],
  [5, "EPERM"],
  [193, "EFTYPE"],
  [740, "EACCES"]
]);
function nodeSpawnError(syscall, code, path) {
  const message = `${syscall} ${code}`;
  return {
    name: "Error",
    message,
    code,
    syscall,
    ...path === void 0 ? {} : { path }
  };
}
function asSpawnError(error, program) {
  const serialized = serializeRunnerError(error);
  if (!(error instanceof Win32Error)) {
    return serialized.code === void 0 ? serialized : nodeSpawnError(`spawn ${program}`, serialized.code, program);
  }
  const code = WINDOWS_SPAWN_ERROR_CODES.get(error.win32Code) ?? "UNKNOWN";
  if (NODE_SPAWN_DETAIL_CODES.has(code)) {
    return nodeSpawnError(`spawn ${program}`, code, program);
  }
  return nodeSpawnError("spawn", code);
}
function windowsPathNotFoundError(program) {
  return nodeSpawnError(`spawn ${program}`, "ENOENT", program);
}
function windowsStartCancelledError() {
  return {
    name: "Error",
    message: "subprocess target start was cancelled"
  };
}
function linuxPathNotFoundError(program) {
  return Object.assign(new Error(`spawn ${program} ENOENT`), {
    code: "ENOENT",
    errno: -2,
    syscall: `spawn ${program}`,
    path: program,
    spawnargs: []
  });
}
function execLinuxFile(file, argv, env, internals, control) {
  try {
    return control === void 0 ? internals.execve(file, argv, env) : internals.execve(file, argv, env, control);
  } catch (error) {
    if (error.code !== "ENOEXEC") throw error;
    return control === void 0 ? internals.execve("/bin/sh", ["/bin/sh", file, ...argv.slice(1)], env) : internals.execve("/bin/sh", ["/bin/sh", file, ...argv.slice(1)], env, control);
  }
}
function execLinuxTarget(request, argv, internals) {
  const program = argv[0];
  if (program.includes("/")) return execLinuxFile(program, argv, request.env, internals, request.control);
  const path = request.env.PATH ?? "/usr/bin:/bin";
  let permissionFailure;
  for (const directory of path.split(":")) {
    const root = directory.startsWith("/") ? directory : `${request.cwd}${request.cwd.endsWith("/") ? "" : "/"}${directory}`;
    const candidate = `${root}${root.endsWith("/") ? "" : "/"}${program}`;
    try {
      return execLinuxFile(candidate, argv, request.env, internals, request.control);
    } catch (error) {
      const code = error.code;
      if (code === "EACCES") {
        permissionFailure ??= error;
        continue;
      }
      if (code === "ENOENT" || code === "ENOTDIR") continue;
      throw error;
    }
  }
  throw permissionFailure ?? linuxPathNotFoundError(program);
}
function runLinux(locator, argv, host, internals) {
  const files = linuxLaunchFilesFromLocator(locator);
  let request;
  try {
    request = consumeLinuxLaunchRequest(files.requestPath);
  } catch (error) {
    writeLinuxStartupError(files, { type: "error", error: serializeRunnerError(error) });
    host.exitCode = 127;
    return;
  }
  try {
    host.chdir(request.cwd);
    execLinuxTarget({ ...request, cwd: host.cwd() }, argv, internals);
  } catch (error) {
    writeLinuxStartupError(files, {
      type: "error",
      error: asSpawnError(error, argv[0])
    });
    host.exitCode = 127;
  }
}
function sendMessage(host, result) {
  return new Promise((resolve, reject) => {
    if (!host.connected || host.send === void 0) {
      reject(new Error("subprocess runner IPC is not connected"));
      return;
    }
    try {
      host.send(result, (error) => {
        if (error === null) resolve();
        else reject(error);
      });
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      reject(failure);
    }
  });
}
var WindowsJobRunner = class {
  constructor(argv, host, internals) {
    this.argv = argv;
    this.host = host;
    this.internals = internals;
  }
  argv;
  host;
  internals;
  api;
  processHandle;
  processPid;
  jobHandle;
  pollTimer;
  startSeen = false;
  terminateRequested = false;
  resultStarted = false;
  resultDelivered = false;
  finished = false;
  completion = Promise.withResolvers();
  run() {
    if (!this.host.connected || this.host.send === void 0) {
      this.finish(127);
      return this.completion.promise;
    }
    this.host.on("message", this.onMessage);
    this.host.once("disconnect", this.onDisconnect);
    return this.completion.promise;
  }
  onMessage = (value) => {
    if (this.finished) return;
    if (isWindowsTerminateRequest(value)) {
      this.requestTermination(value.signal);
      return;
    }
    if (this.startSeen) {
      void this.runnerFailure(new Error("subprocess runner received more than one Windows start request"));
      return;
    }
    let request;
    try {
      request = parseWindowsStartRequest(value);
    } catch (error) {
      void this.runnerFailure(error);
      return;
    }
    this.startSeen = true;
    void this.start(request);
  };
  onDisconnect = () => {
    if (this.finished) return;
    this.releaseOwnedJob();
    this.finish(127, false);
  };
  async start(request) {
    if (this.terminateRequested) {
      await this.publishTerminalResult({ type: "error", error: windowsStartCancelledError() }, 0);
      return;
    }
    await new Promise((resolveImmediate) => {
      setImmediate(resolveImmediate);
    });
    if (this.finished) return;
    if (this.terminateRequested) {
      await this.publishTerminalResult({ type: "error", error: windowsStartCancelledError() }, 0);
      return;
    }
    try {
      const [command, ...args] = this.argv;
      const applicationName = this.internals.resolveWindowsExecutable(
        command,
        request.cwd,
        request.env,
        void 0,
        { ...this.host.env }
      );
      if (applicationName === void 0) {
        await this.publishTerminalResult({
          type: "error",
          error: windowsPathNotFoundError(command)
        }, 0);
        return;
      }
      this.api = this.internals.loadWin32ProcessBindings();
      const spawned = this.internals.spawnCurrentTokenJobProcess(this.api, {
        command,
        applicationName,
        args,
        cwd: request.cwd,
        env: request.env,
        stdio: { stdin: 4, stdout: 5, stderr: 6, ...request.control === "pipe" ? { control: SUBPROCESS_CONTROL_FD5 } : {} }
      });
      this.processHandle = spawned.process;
      this.processPid = spawned.pid;
      this.jobHandle = spawned.job;
      for (const fileDescriptor of request.control === "pipe" ? [4, 5, 6, SUBPROCESS_CONTROL_FD5] : [4, 5, 6]) {
        this.internals.closeFileDescriptor(fileDescriptor);
      }
      this.pollTimer = setInterval(() => {
        this.poll();
      }, 10);
    } catch (error) {
      if (this.jobHandle === void 0 && error instanceof Win32Error && error.api === "CreateProcessW") {
        await this.publishTerminalResult({
          type: "error",
          error: asSpawnError(error, this.argv[0])
        }, 0);
        return;
      }
      await this.runnerFailure(error);
    }
  }
  requestTermination(signal) {
    if (this.terminateRequested && signal === "SIGTERM") return;
    this.terminateRequested = true;
    try {
      if (signal === "SIGKILL") this.terminateOwnedJob();
      else if (this.api !== void 0) {
        const status = this.processHandle === void 0 || this.processPid === void 0 ? "root-exited" : this.internals.requestNormalStop(this.api, this.processHandle, this.processPid);
        void sendMessage(this.host, { type: "normal-stop", status }).catch((error) => this.runnerFailure(error));
      }
    } catch (error) {
      void this.runnerFailure(error);
    }
  }
  terminateOwnedJob() {
    const job = this.jobHandle;
    if (job === void 0) return;
    if (this.api === void 0) return;
    this.internals.terminateJob(this.api, job, 1);
  }
  poll() {
    if (this.finished) return;
    if (this.api === void 0) return;
    try {
      if (this.processHandle !== void 0) {
        const exitCode = this.internals.pollProcessExit(this.api, this.processHandle);
        if (exitCode !== void 0) {
          this.internals.closeHandleChecked(this.api, this.processHandle, "ordinary direct process");
          this.processHandle = void 0;
          void this.publishTerminalResult({ type: "target-exit", exitCode });
        }
      }
      if (this.jobHandle !== void 0 && this.internals.isJobEmpty(this.api, this.jobHandle)) {
        this.internals.closeHandleChecked(this.api, this.jobHandle, "ordinary process Job");
        this.jobHandle = void 0;
        if (this.resultDelivered) this.finish(0);
      }
    } catch (error) {
      void this.runnerFailure(error);
    }
  }
  async publishTerminalResult(result, exitCode) {
    if (this.finished || this.resultStarted) return;
    this.resultStarted = true;
    try {
      await sendMessage(this.host, result);
      this.resultDelivered = true;
    } catch {
      this.releaseOwnedJob();
      this.finish(127, false);
      return;
    }
    if (exitCode !== void 0) {
      this.finish(exitCode);
      return;
    }
    if (this.jobHandle === void 0) this.finish(0);
  }
  async runnerFailure(error) {
    if (this.finished) return;
    if (!this.resultStarted) {
      this.resultStarted = true;
      try {
        await sendMessage(this.host, { type: "error", error: serializeRunnerError(error) });
        this.resultDelivered = true;
      } catch {
      }
    }
    this.releaseOwnedJob();
    this.finish(127);
  }
  releaseOwnedJob() {
    if (this.pollTimer !== void 0) clearInterval(this.pollTimer);
    this.pollTimer = void 0;
    const api = this.api;
    if (api === void 0) return;
    if (this.jobHandle !== void 0) {
      try {
        this.internals.terminateJob(api, this.jobHandle, 1);
      } catch {
      }
      try {
        this.internals.closeHandleChecked(api, this.jobHandle, "ordinary process Job cleanup");
      } catch {
      }
      this.jobHandle = void 0;
    }
    if (this.processHandle !== void 0) {
      try {
        this.internals.closeHandleChecked(api, this.processHandle, "ordinary direct process cleanup");
      } catch {
      }
      this.processHandle = void 0;
    }
  }
  finish(exitCode, disconnect = true) {
    if (this.finished) return;
    this.finished = true;
    if (this.pollTimer !== void 0) clearInterval(this.pollTimer);
    this.pollTimer = void 0;
    this.host.off("message", this.onMessage);
    this.host.off("disconnect", this.onDisconnect);
    this.host.exitCode = exitCode;
    if (disconnect && this.host.connected) this.host.disconnect();
    this.completion.resolve();
  }
};
async function runSpawnRunner(selection, argv, host = process, internals = defaultInternals) {
  Reflect.deleteProperty(host.env, SUBPROCESS_RUNNER_ENV);
  const targetArgv = parseRunnerTargetArgv(argv);
  if (selection === WINDOWS_RUNNER_SELECTION) {
    await new WindowsJobRunner(targetArgv, host, internals).run();
    return;
  }
  runLinux(selection, targetArgv, host, internals);
}
async function reportSpawnRunnerFailure(selection, error, host = process) {
  if (selection === WINDOWS_RUNNER_SELECTION) {
    try {
      await sendMessage(host, { type: "error", error: serializeRunnerError(error) });
    } catch {
    }
    host.exitCode = 127;
    if (host.connected) host.disconnect();
    return;
  }
  if (selection !== void 0) {
    try {
      const files = linuxLaunchFilesFromLocator(selection);
      writeLinuxStartupError(files, { type: "error", error: serializeRunnerError(error) });
    } catch {
    }
  }
  host.exitCode = 127;
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/subprocess/subprocess-local/src/bin.ts
async function runSelectedSubprocessRunner(selection) {
  try {
    await runSpawnRunner(selection, process.argv.slice(2));
  } catch (error) {
    await reportSpawnRunnerFailure(selection, error);
  }
}
if (import.meta.main) {
  const selection = consumeRunnerSelection();
  if (selection === void 0) {
    process.exitCode = 127;
  } else {
    void runSelectedSubprocessRunner(selection);
  }
}
export {
  runSelectedSubprocessRunner
};
//# sourceMappingURL=runner.js.map
