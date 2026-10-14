// sep-origin/alpha2-desktop/apps/desktop/src/main.ts
import { createManagedUpdater } from "./sep-update/update-desktop.mjs";
import {requireManagedInvocation,configureManagedIdentity} from "./sep-mac-entry.mjs";
const sepManagedInvocation=requireManagedInvocation(process.argv,process.env);

// sep-origin/alpha2-desktop/apps/desktop/src/windows-layout.ts
var WINDOWS_TITLEBAR_HEIGHT = 40;

// sep-origin/alpha2-desktop/apps/desktop/src/main.ts
import { readFile as readFile4, writeFile as writeFile2 } from "node:fs/promises";
import { join as join12 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import {
  app as app6,
  BrowserWindow as BrowserWindow5,
  clipboard as clipboard2,
  dialog as dialog2,
  ipcMain as ipcMain6,
  Menu as Menu2,
  nativeImage as nativeImage2,
  powerMonitor,
  nativeTheme,
  net,
  protocol,
  session as session4,
  shell as shell3
} from "electron";

// sep-origin/alpha2-desktop/apps/desktop/src/paths.ts
import { join } from "node:path";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
function resolveDesktopPaths(dshHome = resolveDshHome()) {
  return {
    profile: join(dshHome, "profiles", "desktop"),
    lock: join(dshHome, "profiles", "desktop", "lock")
  };
}

// sep-origin/alpha2-desktop/apps/desktop/src/project-manager.ts
import {
  existsSync,
  fsyncSync,
  lstatSync as lstatSync2,
  mkdirSync,
  openSync,
  realpathSync,
  closeSync,
  readFileSync as readFileSync2,
  unlinkSync,
  writeFileSync as writeFileSync2,
  writeSync
} from "node:fs";
import { join as join3 } from "node:path";

// sep-origin/alpha2-desktop/apps/desktop/src/core-package-set.ts
var DESKTOP_HOST_PACKAGE = "@deepseek-ai/dsh-desktop-host";

// sep-origin/alpha2-desktop/apps/desktop/src/runtime-tree.ts
import { lstatSync, readdirSync, readFile, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join as join2, relative, sep } from "node:path";
import { promisify } from "node:util";
import { valid as valid2 } from "semver";

// sep-origin/alpha2-desktop/apps/desktop/src/release.ts
import { valid } from "semver";

// sep-origin/alpha2-desktop/apps/desktop/src/runtime-tree.ts
var DESKTOP_RUNTIME_FILE = "desktop-runtime.json";
var PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/u;
var readRuntimeFile = promisify(readFile);
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readDesktopRuntime(root) {
  const value = JSON.parse(readFileSync(join2(root, DESKTOP_RUNTIME_FILE), "utf8"));
  if (!record(value) || typeof value.platform !== "string" || typeof value.arch !== "string" || !Array.isArray(value.sharedPackages) || !Array.isArray(value.files)) {
    throw new Error("desktop runtime: invalid descriptor");
  }
  if (!record(value.release) || typeof value.release.version !== "string" || typeof value.release.nodeVersion !== "string" || typeof value.release.pnpmVersion !== "string") {
    throw new Error("desktop runtime: invalid release fields");
  }
  const release = value.release;
  const sharedPackages = value.sharedPackages.map((entry) => {
    if (!record(entry) || typeof entry.name !== "string" || !PACKAGE_NAME.test(entry.name) || typeof entry.version !== "string" || valid2(entry.version) === null || entry.path !== `node_modules/${entry.name}`) {
      throw new Error("desktop runtime: invalid shared package record");
    }
    return { name: entry.name, version: entry.version, path: entry.path };
  });
  if (new Set(sharedPackages.map((entry) => entry.name)).size !== sharedPackages.length) {
    throw new Error("desktop runtime: duplicate shared package");
  }
  const files = value.files;
  for (const name of ["@deepseek-ai/dsh", DESKTOP_HOST_PACKAGE]) {
    if (sharedPackages.find((entry) => entry.name === name)?.version !== release.version) {
      throw new Error(`desktop runtime: missing or mismatched ${name}`);
    }
  }
  return {
    schemaVersion: value.schemaVersion,
    release,
    platform: value.platform,
    arch: value.arch,
    sharedPackages,
    files
  };
}

// sep-origin/alpha2-desktop/apps/desktop/src/project-manager.ts
import {
  initProfile,
  PROFILE_TEMPLATES,
  removeLinkProjections,
  sanitizeProfile
} from "@deepseek-ai/dsh-app-boot";
var CORE_BUILD_PACKAGE = "@deepseek-ai/dsh-subprocess-local";
var WEB_PROFILE = PROFILE_TEMPLATES.web;
var WORKSPACE_SETTINGS = "nodeLinker: hoisted\nautoInstallPeers: false\n";
function workspaceFile(overrides = {}) {
  const entries = Object.entries(overrides).sort(([left], [right]) => left.localeCompare(right));
  const overrideSection = entries.length === 0 ? "" : `overrides:
${entries.map(([name, spec]) => `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}`).join("\n")}
`;
  if (entries.length === 0) return `packages:
  - .

${WORKSPACE_SETTINGS}`;
  const coreBuildSpec = overrides[CORE_BUILD_PACKAGE];
  const coreBuildKey = coreBuildSpec === void 0 ? CORE_BUILD_PACKAGE : `${CORE_BUILD_PACKAGE}@${coreBuildSpec.replace("file:./", "file:")}`;
  return `packages:
  - .

${overrideSection}${WORKSPACE_SETTINGS}allowBuilds:
  node-pty: true
  koffi: true
  fs-ext: true
  ${JSON.stringify(coreBuildKey)}: true
  '@google/genai': false
  protobufjs: false
  node-addon-require-builtin: false
`;
}
function migrateProfileSettings(projectDir) {
  const path = join3(projectDir, "pnpm-workspace.yaml");
  if (!existsSync(path)) return;
  const legacy = `packages:
  - .

${WORKSPACE_SETTINGS}strictDepBuilds: true
allowBuilds:
  node-pty: true
  koffi: true
  fs-ext: true
  "${CORE_BUILD_PACKAGE}": true
  '@google/genai': false
  protobufjs: false
  node-addon-require-builtin: false
`;
  if (readFileSync2(path, "utf8").replaceAll("\r\n", "\n") === legacy) {
    writeFileSync2(path, workspaceFile());
  }
}
var DesktopProjectManager = class {
  /**
   * @param paths - Electron-owned package state and reserved desktop profile paths.
   * @param runtime - location of the bundled application runtime.
   */
  constructor(paths, runtime) {
    this.paths = paths;
    this.runtime = runtime;
  }
  paths;
  runtime;
  /**
   * Back up the profile patch and disable third-party bundles without loading application resources.
   * The caller must stop the Host first.
   * @returns Backup path after the locked profile write, or undefined if the patch was absent.
   */
  async disableAllPlugins() {
    return this.withLock(() => sanitizeProfile("dsh", this.paths.profile, WEB_PROFILE.bundles));
  }
  /**
   * Load application metadata and prepare the external plugin profile without installing packages.
   */
  async applyRelease() {
    await this.withLock(() => {
      readDesktopRuntime(this.runtime.dsh);
      migrateProfileSettings(this.paths.profile);
      createPluginProfile(this.paths.profile);
      removeLinkProjections(this.paths.profile);
    });
  }
  async withLock(operation) {
    mkdirSync(this.paths.profile, { recursive: true, mode: 448 });
    const lockPath = join3(realpathSync(this.paths.profile), "lock");
    let descriptor;
    try {
      descriptor = openSync(lockPath, "wx", 384);
    } catch (error) {
      if (error.code === "EEXIST") {
        const lock = lstatSync2(lockPath);
        if (lock.isSymbolicLink() || !lock.isFile()) {
          throw new Error("desktop project: profile lock is not a regular file");
        }
        const owner = Number.parseInt(readFileSync2(lockPath, "utf8").trim(), 10);
        let active = !Number.isSafeInteger(owner) || owner <= 0;
        if (!active) {
          try {
            process.kill(owner, 0);
            active = true;
          } catch (signalError) {
            active = signalError.code !== "ESRCH";
          }
        }
        if (active) throw new Error("desktop project: another profile operation is active");
        unlinkSync(lockPath);
        descriptor = openSync(lockPath, "wx", 384);
      } else {
        throw error;
      }
    }
    try {
      writeSync(descriptor, `${String(process.pid)}
`);
      fsyncSync(descriptor);
      return await operation();
    } finally {
      closeSync(descriptor);
      unlinkSync(lockPath);
    }
  }
};
function createPluginProfile(projectDir) {
  initProfile(projectDir, WEB_PROFILE.bundles);
}

// sep-origin/alpha2-desktop/apps/desktop/src/host-process.ts
import { spawn } from "node:child_process";
import { join as join4 } from "node:path";

// sep-origin/alpha2-desktop/apps/desktop/src/node-environment.ts
import { delimiter } from "node:path";
function desktopNodeEnvironment(executable, bin, environment) {
  return {
    ...environment,
    ELECTRON_RUN_AS_NODE: "1",
    ...bin === void 0 ? {} : { DSH_DESKTOP_NODE_EXECUTABLE: executable, PATH: `${bin}${delimiter}${environment.PATH ?? ""}` }
  };
}

// sep-origin/alpha2-desktop/apps/desktop/src/host-process.ts
var QUIT_INSPECTION_DEADLINE_MS = 2e3;
var MAX_HOST_DIAGNOSTIC_CHARS = 64 * 1024;
function isDesktopHostEvent(message) {
  if (typeof message !== "object" || message === null || !("type" in message)) return false;
  const candidate = message;
  switch (candidate.type) {
    case "shutdown-complete":
      return true;
    case "ready":
      return typeof candidate.url === "string";
    case "platform-session": {
      const session5 = candidate.session;
      if (session5 === null) return true;
      if (typeof session5 !== "object" || !("origin" in session5) || !("token" in session5) || typeof session5.origin !== "string" || typeof session5.token !== "string" || session5.token.length === 0) return false;
      if (!("userId" in session5) || session5.userId !== null && (typeof session5.userId !== "string" || session5.userId.length === 0)) return false;
      if ("embeddedPageDist" in session5 && typeof session5.embeddedPageDist !== "string") return false;
      if ("requestHeaders" in session5 && (typeof session5.requestHeaders !== "object" || session5.requestHeaders === null || Array.isArray(session5.requestHeaders) || Object.entries(session5.requestHeaders).some(([name, value]) => typeof value !== "string" || name !== name.toLowerCase() || /[\r\n]/.test(value) || ["authorization", "x-dsh-auth-token", "host", "content-length", "transfer-encoding", "connection", "content-type"].includes(name)))) return false;
      try {
        const url = new URL(session5.origin);
        return url.origin === session5.origin && !url.username && !url.password && (url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
      } catch {
        return false;
      }
    }
    case "fatal":
      return typeof candidate.message === "string" && (candidate.diagnostic === void 0 || typeof candidate.diagnostic === "string");
    case "update-tasks":
      return Number.isSafeInteger(candidate.requestId) && typeof candidate.active === "boolean" && (candidate.error === void 0 || typeof candidate.error === "string");
    case "quit-inspection":
      return Number.isSafeInteger(candidate.requestId) && typeof candidate.activeTasks === "boolean" && typeof candidate.scheduledTasks === "boolean" && (candidate.error === void 0 || typeof candidate.error === "string");
    default:
      return false;
  }
}
async function exitsWithin(exit, milliseconds) {
  let timer;
  const timeout = new Promise((resolve3) => {
    timer = setTimeout(() => {
      resolve3(false);
    }, milliseconds);
    timer.unref();
  });
  try {
    return await Promise.race([exit.then(() => true), timeout]);
  } finally {
    if (timer !== void 0) clearTimeout(timer);
  }
}
var DesktopHostUncleanExitError = class extends Error {
};
var DesktopHostFatalError = class extends Error {
  #diagnostic;
  /**
   * @param message - The Host's failure message.
   * @param diagnostic - The Host's inspected error, when the Host supplied one.
   */
  constructor(message, diagnostic) {
    super(message);
    this.#diagnostic = diagnostic;
  }
  /** The Host's inspected error; a getter so `util.inspect` of this error does not repeat it as an escaped property. */
  get diagnostic() {
    return this.#diagnostic;
  }
};
var DesktopHostProcess = class {
  /**
   * @param node - Absolute Electron executable in Node mode.
   * @param runtimeDir - Immutable packages carried by the current application.
   * @param projectDir - Desktop plugin profile and child working directory.
   * @param inspectPort - Optional loopback inspector port for workspace development.
   * @param environment - Environment inherited by the Host and its plugin subprocesses.
   * @param onFailure - Receives the first unexpected child failure, including after readiness.
   * @param primaryRuntime - Optional bundled dependency payload; when supplied, missing sibling
   *   `office-skills` resources fail Host startup.
   * @param packageManager - Bundled pnpm entry and Node launcher directory, scoped to package operations.
   * @param onPlatformSession - Private credential updates for embedded Platform views.
   */
  constructor(node, runtimeDir, projectDir, inspectPort, environment = process.env, onFailure, primaryRuntime, packageManager, onPlatformSession) {
    this.node = node;
    this.runtimeDir = runtimeDir;
    this.projectDir = projectDir;
    this.inspectPort = inspectPort;
    this.environment = environment;
    this.onFailure = onFailure;
    this.primaryRuntime = primaryRuntime;
    this.packageManager = packageManager;
    this.onPlatformSession = onPlatformSession;
  }
  node;
  runtimeDir;
  projectDir;
  inspectPort;
  environment;
  onFailure;
  primaryRuntime;
  packageManager;
  onPlatformSession;
  child;
  readyResolve;
  readyReject;
  readyPromise = new Promise((resolve3, reject) => {
    this.readyResolve = resolve3;
    this.readyReject = reject;
  });
  exitPromise;
  stderr = "";
  failureReported = false;
  stopping = false;
  shutdownCompleted = false;
  nextControlId = 1;
  controlRequests = /* @__PURE__ */ new Map();
  /**
   * Start this child once and await its Web application URL.
   * @returns Ready facts supplied by the child after application startup.
   */
  async start() {
    if (this.child !== void 0) return this.readyPromise;
    const entry = join4(this.runtimeDir, "node_modules", "@deepseek-ai", "dsh-desktop-host", "lib", "index.js");
    const child = spawn(this.node, [
      "--expose-internals",
      ...this.inspectPort === void 0 ? [] : [`--inspect=127.0.0.1:${String(this.inspectPort)}`],
      entry,
      this.runtimeDir,
      this.projectDir,
      this.primaryRuntime ?? join4(this.runtimeDir, "..", "runtime", "primary-runtime"),
      ...this.packageManager === void 0 ? [] : [this.packageManager.pnpm, this.packageManager.nodeBin]
    ], {
      cwd: this.projectDir,
      env: desktopNodeEnvironment(this.node, void 0, this.environment),
      stdio: ["ignore", "pipe", "pipe", "ipc"]
    });
    this.child = child;
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      this.stderr = (this.stderr + chunk).slice(-MAX_HOST_DIAGNOSTIC_CHARS);
    });
    child.stdout?.pipe(process.stdout);
    child.on("message", (message) => {
      if (!isDesktopHostEvent(message)) {
        this.fail(new Error("dsh desktop host sent an invalid IPC event"));
        child.kill("SIGTERM");
        return;
      }
      if (message.type === "ready") this.readyResolve({ url: message.url, injections: message.injections });
      else if (message.type === "platform-session") this.onPlatformSession?.(message.session);
      else if (message.type === "shutdown-complete") {
        if (this.stopping) this.shutdownCompleted = true;
        else this.fail(new Error("dsh desktop host acknowledged an unrequested shutdown"));
      } else if (message.type === "fatal") this.fail(new DesktopHostFatalError(message.message, message.diagnostic));
      else {
        const request = this.controlRequests.get(message.requestId);
        if (message.error === void 0) request?.resolve(message);
        else request?.reject(new Error(message.error));
      }
    });
    child.once("error", (error) => {
      this.fail(error);
    });
    this.exitPromise = new Promise((resolve3) => {
      child.once("close", (code) => {
        const suffix = this.stderr.trim() === "" ? "" : `: ${this.stderr.trim()}`;
        if (code !== 0 && code !== null) this.fail(new Error(`dsh desktop host exited with ${String(code)}${suffix}`));
        else this.fail(new Error(`dsh desktop host stopped${suffix}`));
        resolve3();
      });
    });
    return this.readyPromise;
  }
  /**
   * Inspect active work or lock request admission for update handoff.
   * @param action - Read-only inspection, admission lock, or recovery unlock.
   * @returns Whether live tasks would be affected. Locking drains admitted API requests before inspecting tasks;
   * an unanswered drain fails at the control-request deadline without authorizing installation.
   */
  async updateTasks(action) {
    const response = await this.control({ type: "update-tasks", action }, 1e4, "desktop update: task inspection timed out");
    if (response.type !== "update-tasks") throw new Error("desktop update: Host answered with a different control response");
    return response.active;
  }
  /**
   * Ask the Host what quitting now would interrupt.
   * @returns Active tasks and armed scheduled reminders; rejects when the Host is unavailable or misses
   * {@link QUIT_INSPECTION_DEADLINE_MS}, and the shell then asks before quitting.
   */
  async inspectQuit() {
    const response = await this.control({ type: "quit-inspection" }, QUIT_INSPECTION_DEADLINE_MS, "desktop quit: inspection timed out");
    if (response.type !== "quit-inspection") throw new Error("desktop quit: Host answered with a different control response");
    return { activeTasks: response.activeTasks, scheduledTasks: response.scheduledTasks };
  }
  async control(request, deadlineMs, deadlineMessage) {
    const child = this.child;
    if (child === void 0 || !child.connected || this.failureReported || this.stopping) {
      throw new Error(`${request.type === "update-tasks" ? "desktop update" : "desktop quit"}: Host is unavailable`);
    }
    const requestId = this.nextControlId++;
    let timer;
    try {
      return await new Promise((resolve3, reject) => {
        this.controlRequests.set(requestId, { resolve: resolve3, reject });
        timer = setTimeout(() => {
          reject(new Error(deadlineMessage));
        }, deadlineMs);
        child.send({ ...request, requestId }, (error) => {
          if (error !== null) reject(error);
        });
      });
    } finally {
      clearTimeout(timer);
      this.controlRequests.delete(requestId);
    }
  }
  /**
   * Request teardown and await child exit, escalating termination when needed.
   * @param requireGraceful - Reject update handoff after forced termination or unsuccessful child exit.
   * @returns Completion of owned process teardown. DesktopHostUncleanExitError confirms exit but refuses installation;
   * other failures do not confirm exit.
   */
  async stop(requireGraceful = false) {
    const child = this.child;
    if (child === void 0) return;
    this.stopping = true;
    this.onPlatformSession?.(null);
    if (child.connected) child.send({ type: "shutdown" }, (error) => {
      if (error !== null) this.fail(error);
    });
    const exited = this.exitPromise ?? Promise.resolve();
    const graceful = await exitsWithin(exited, 1e4);
    if (!graceful) child.kill("SIGTERM");
    if (!await exitsWithin(exited, 5e3)) {
      child.kill("SIGKILL");
      if (!await exitsWithin(exited, 5e3)) {
        throw new Error("dsh desktop host did not exit after SIGKILL");
      }
    }
    this.child = void 0;
    if (requireGraceful && (!graceful || child.exitCode !== 0 || !this.shutdownCompleted)) {
      throw new DesktopHostUncleanExitError(`desktop update: Host did not complete graceful task teardown (exit ${String(child.exitCode)}, signal ${String(child.signalCode)}, shutdown acknowledged ${String(this.shutdownCompleted)}, graceful deadline exceeded ${String(!graceful)})`);
    }
  }
  fail(error) {
    this.onPlatformSession?.(null);
    this.readyReject(error);
    for (const request of this.controlRequests.values()) request.reject(error);
    this.controlRequests.clear();
    if (!this.failureReported && !this.stopping) {
      this.failureReported = true;
      try {
        this.onFailure?.(error);
      } catch (listenerError) {
        console.error("desktop host failure listener failed", listenerError);
      }
    }
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/platform-view.ts
import { createHash, randomUUID } from "node:crypto";
import { WebContentsView, session, shell } from "electron";
import { mergePlatformCookies, platformClientHeaders } from "@deepseek-ai/dsh-deepseek-account";

// sep-origin/alpha2-desktop/apps/desktop/src/client-metadata.ts
function desktopClientVersion() {
  const version = "0.2.1-alpha.2";
  if (version === void 0 || version === "") {
    throw new Error("desktop account: this application build carries no DSH_CLIENT_VERSION");
  }
  return version;
}
function desktopClientMetadata(locale) {
  return {
    version: desktopClientVersion(),
    locale,
    // Date.getTimezoneOffset reports minutes west of UTC; Platform wants seconds east.
    timezoneOffsetSeconds: -(/* @__PURE__ */ new Date()).getTimezoneOffset() * 60
  };
}

// sep-origin/alpha2-desktop/apps/desktop/src/platform-ipc.ts
var PLATFORM_IPC = {
  bootstrap: "dsh-platform:bootstrap",
  localeChanged: "dsh-platform:locale-changed",
  open: "dsh-platform:open",
  bounds: "dsh-platform:bounds",
  close: "dsh-platform:close"
};

// sep-origin/alpha2-desktop/apps/desktop/src/platform-view.ts
function platformBounds(value) {
  if (typeof value !== "object" || value === null) throw new Error("Invalid Platform bounds");
  const row = value;
  const result = { x: 0, y: 0, width: 0, height: 0 };
  for (const key2 of ["x", "y", "width", "height"]) {
    const n = row[key2];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1e5) throw new Error("Invalid Platform bounds");
    result[key2] = Math.round(n);
  }
  return result;
}
var DesktopPlatformView = class {
  /**
   * @param preload - bundled sandboxed Platform preload path.
   * @param getLocale - current resolved Desktop language.
   * @param platform - operating system this shell runs on, reported to Platform.
   */
  constructor(preload, getLocale, platform) {
    this.preload = preload;
    this.getLocale = getLocale;
    this.platform = platform;
  }
  preload;
  getLocale;
  platform;
  account = null;
  view;
  owner;
  releaseOwner;
  generation = 0;
  storageCleanup = /* @__PURE__ */ new Map();
  disposed = false;
  /** @param next - private Host credentials; identity enrichment preserves an already open temporary document. */
  setSession(next) {
    if (next?.token === this.account?.token && next?.origin === this.account?.origin && next?.embeddedPageDist === this.account?.embeddedPageDist && JSON.stringify(next?.requestHeaders) === JSON.stringify(this.account?.requestHeaders)) {
      if (next?.userId === this.account?.userId || this.account?.userId === null) {
        this.account = next;
        return;
      }
    }
    this.close();
    this.account = next;
  }
  /**
   * Open account-scoped persistent storage, or temporary storage when the account ID is unavailable.
   * @param owner - application window containing the view.
   * @param page - explicit supported Platform page.
   * @param bounds - owned renderer rectangle.
   * @returns when loading finishes, or without a document when superseded or the owner closes or navigates.
   */
  async open(owner, page3, bounds) {
    if (this.disposed) throw new Error("Platform view disposed");
    this.close();
    const account = this.account;
    if (account === null) throw new Error("Platform account unavailable");
    if (owner.isDestroyed()) return;
    const generation = this.generation;
    this.owner = owner;
    const closeOwnedView = () => {
      if (generation === this.generation) this.close();
    };
    const navigateOwner = (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) closeOwnedView();
    };
    owner.webContents.on("did-start-navigation", navigateOwner);
    owner.webContents.on("render-process-gone", closeOwnedView);
    owner.webContents.on("destroyed", closeOwnedView);
    owner.on("closed", closeOwnedView);
    this.releaseOwner = () => {
      owner.webContents.removeListener("did-start-navigation", navigateOwner);
      owner.webContents.removeListener("render-process-gone", closeOwnedView);
      owner.webContents.removeListener("destroyed", closeOwnedView);
      owner.removeListener("closed", closeOwnedView);
    };
    const partition = account.userId === null ? `dsh-platform-${randomUUID()}` : `persist:dsh-platform-${createHash("sha256").update(JSON.stringify([account.origin, account.userId])).digest("hex")}`;
    const browserSession = session.fromPartition(partition);
    const failure = await this.cleanStorage(browserSession);
    if (generation !== this.generation) return;
    if (failure !== null) {
      this.close();
      throw failure.error;
    }
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });
    browserSession.setPermissionCheckHandler(() => false);
    const deploymentHeaders = account.requestHeaders ?? {};
    const injectedNames = new Set([
      ...Object.keys(deploymentHeaders),
      ...Object.keys(platformClientHeaders(this.platform, desktopClientMetadata(this.getLocale())))
    ].map((name) => name.toLowerCase()));
    const injectedRequests = /* @__PURE__ */ new Set();
    browserSession.webRequest.onCompleted((details) => {
      injectedRequests.delete(details.id);
    });
    browserSession.webRequest.onErrorOccurred((details) => {
      injectedRequests.delete(details.id);
    });
    browserSession.webRequest.onBeforeSendHeaders((details, callback) => {
      let headers = Object.fromEntries(Object.entries(details.requestHeaders).map(([name, value]) => [name.toLowerCase(), value]));
      if (new URL(details.url).origin === account.origin) {
        injectedRequests.add(details.id);
        const injected = {
          ...deploymentHeaders,
          ...platformClientHeaders(this.platform, desktopClientMetadata(this.getLocale()))
        };
        const cookie = headers.cookie ?? "";
        Object.assign(headers, injected);
        if (injected.cookie !== void 0) headers.cookie = mergePlatformCookies(cookie, injected.cookie);
      } else if (injectedRequests.has(details.id)) {
        headers = Object.fromEntries(Object.entries(headers).filter(([name]) => !injectedNames.has(name.toLowerCase())));
      }
      callback({ requestHeaders: headers });
    });
    const view = new WebContentsView({ webPreferences: {
      session: browserSession,
      preload: this.preload,
      sandbox: true,
      contextIsolation: true,
      additionalArguments: [`--dsh-platform-origin=${account.origin}`],
      nodeIntegration: false,
      webSecurity: true
    } });
    this.view = view;
    view.webContents.setWindowOpenHandler(({ url }) => {
      const destination = new URL(url);
      if (destination.protocol === "https:" && !destination.username && !destination.password) {
        void shell.openExternal(url).catch(() => {
        });
      }
      return { action: "deny" };
    });
    const allowNavigation = (url) => {
      try {
        const parsed = new URL(url);
        return parsed.origin === account.origin && !parsed.username && !parsed.password;
      } catch {
        return false;
      }
    };
    view.webContents.on("will-navigate", (event, url) => {
      if (!allowNavigation(url)) event.preventDefault();
    });
    view.webContents.on("will-redirect", (event, url) => {
      if (!allowNavigation(url)) event.preventDefault();
    });
    view.webContents.on("will-attach-webview", (event) => {
      event.preventDefault();
    });
    view.webContents.on("preload-error", () => {
      if (this.view === view) this.close();
    });
    view.webContents.on("render-process-gone", () => {
      if (this.view === view) this.close();
    });
    view.setVisible(false);
    owner.contentView.addChildView(view);
    view.setBounds(bounds);
    try {
      const url = new URL(page3 === "usage" ? "/usage" : "/top_up", account.origin);
      if (account.embeddedPageDist) url.searchParams.set("dist", account.embeddedPageDist);
      await view.webContents.loadURL(url.href);
    } catch (error) {
      const aborted = error instanceof Error && "code" in error && error.code === "ERR_ABORTED";
      if (!aborted) {
        if (generation === this.generation) this.close();
        throw error;
      }
    }
    if (generation === this.generation && this.view === view) view.setVisible(true);
  }
  /** @param bounds - current application viewport rectangle. */
  setBounds(bounds) {
    this.view?.setBounds(bounds);
  }
  /**
   * Return prepared credentials and resolved language only to the current Platform main frame.
   * @param event - Electron-provided sender identity.
   * @returns credentials and current language copied into the isolated preload.
   */
  bootstrap(event) {
    const view = this.view;
    const account = this.account;
    if (view === void 0 || account === null || event.sender !== view.webContents || event.senderFrame !== view.webContents.mainFrame || new URL(event.senderFrame.url).origin !== account.origin) {
      throw new Error("Rejected Platform bootstrap");
    }
    return { origin: account.origin, token: account.token, locale: this.getLocale() };
  }
  /** Notify the current document after the Desktop language changes. */
  notifyLocaleChanged() {
    const view = this.view;
    if (view !== void 0 && !view.webContents.isDestroyed()) {
      view.webContents.send(PLATFORM_IPC.localeChanged, this.getLocale());
    }
  }
  /** Destroy the document and clear authentication; account-scoped page preferences survive reopening. */
  close() {
    this.generation++;
    const view = this.view;
    this.view = void 0;
    this.releaseOwner?.();
    this.releaseOwner = void 0;
    const owner = this.owner;
    this.owner = void 0;
    if (view === void 0) return;
    if (owner !== void 0 && !owner.isDestroyed()) owner.contentView.removeChildView(view);
    const browserSession = view.webContents.session;
    const destroyed = new Promise((resolve3) => {
      if (view.webContents.isDestroyed()) resolve3();
      else {
        view.webContents.once("destroyed", resolve3);
        view.webContents.close({ waitForBeforeUnload: false });
      }
    });
    browserSession.webRequest.onBeforeSendHeaders(null);
    browserSession.webRequest.onCompleted(null);
    browserSession.webRequest.onErrorOccurred(null);
    browserSession.flushStorageData();
    void this.cleanStorage(browserSession, destroyed);
  }
  /** Stop accepting documents and await all scheduled authentication cleanup. */
  async dispose() {
    this.disposed = true;
    this.account = null;
    await this.closeAndWait();
  }
  /** Destroy the current document and await authentication cleanup before an installer takes over. */
  async closeAndWait() {
    this.close();
    const results = await Promise.all(this.storageCleanup.values());
    const failures = results.filter((result) => result !== null);
    if (failures.length > 0) throw new AggregateError(failures.map((result) => result.error), "Platform storage cleanup failed");
  }
  cleanStorage(browserSession, destroyed = Promise.resolve()) {
    const previous = this.storageCleanup.get(browserSession);
    const cleanup = Promise.all([previous, destroyed]).then(async () => {
      await browserSession.closeAllConnections();
      const results = await Promise.allSettled([
        browserSession.clearStorageData(browserSession.isPersistent() ? { storages: ["cookies", "filesystem", "indexdb", "shadercache", "serviceworkers", "cachestorage"] } : void 0),
        browserSession.clearCache(),
        browserSession.clearAuthCache()
      ]);
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length > 0) throw new AggregateError(failures.map((result) => result.reason), "Platform storage cleanup failed");
    }).then(() => null, (error) => ({ error }));
    this.storageCleanup.set(browserSession, cleanup);
    return cleanup;
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/managed-host.ts
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute as isAbsolute2, resolve } from "node:path";
var key = (path) => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
function validate(value) {
  if (value === null || typeof value !== "object") throw new Error("RECOVERY_DESKTOP_CONNECTION");
  const v = value;
  if (typeof v.endpoint !== "string" || typeof v.token !== "string" || !/^[a-f0-9]{64}$/u.test(v.token) || v.role !== "desktop" || typeof v.projectDir !== "string" || !isAbsolute2(v.projectDir) || typeof v.dshVersion !== "string" || !/^[0-9A-Za-z.+-]{1,80}$/u.test(v.dshVersion) || v.protocolVersion !== 4) throw new Error("RECOVERY_DESKTOP_CONNECTION");
  const url = new URL(v.endpoint);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("RECOVERY_DESKTOP_CONNECTION");
  return { endpoint: url.href, token: v.token, role: "desktop", projectDir: v.projectDir, dshVersion: v.dshVersion, protocolVersion: 4 };
}
async function readManagedDesktopConnection(path) {
  if (!isAbsolute2(path) || key(await realpath(path)) !== key(path)) throw new Error("RECOVERY_DESKTOP_CONNECTION");
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.ino === 0 || before.size > 16384) throw new Error("RECOVERY_DESKTOP_CONNECTION");
  const file = await open(path, "r");
  try {
    const held = await file.stat();
    if (held.dev !== before.dev || held.ino !== before.ino || held.nlink !== 1 || held.size !== before.size) throw new Error("RECOVERY_DESKTOP_CONNECTION");
    const bytes = Buffer.alloc(16385);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    const after = await file.stat(), visible = await lstat(path);
    if (bytesRead > 16384 || bytesRead !== held.size || after.mtimeMs !== held.mtimeMs || after.nlink !== 1 || visible.dev !== held.dev || visible.ino !== held.ino || key(await realpath(path)) !== key(path)) throw new Error("RECOVERY_DESKTOP_CONNECTION");
    const raw = JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"));
    return validate(raw.desktop ?? raw);
  } finally {
    await file.close();
  }
}
async function boundedJson(response) {
  const reader = response.body?.getReader();
  if (reader === void 0) throw new Error("RECOVERY_DESKTOP_RESPONSE");
  let length = 0;
  const chunks = [];
  try {
    for (; ; ) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > 4 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("RECOVERY_DESKTOP_RESPONSE");
      }
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    reader.releaseLock();
  }
}
var ManagedDesktopHost = class {
  connection;
  onFailure;
  poll;
  generation;
  stopping = false;
  constructor(connection, onFailure) {
    this.connection = validate(connection);
    this.onFailure = onFailure;
  }
  async call(method) {
    const response = await fetch(new URL("rpc", this.connection.endpoint), {
      method: "POST",
      headers: { authorization: `Bearer ${this.connection.token}`, "content-type": "application/json" },
      body: JSON.stringify({ method, params: {} }),
      signal: AbortSignal.timeout(55e3),
      redirect: "error"
    });
    const body = await boundedJson(response);
    if (!response.ok || body.ok !== true || body.result === null || typeof body.result !== "object") {
      const remote = body.error;
      const candidate = remote !== null && typeof remote === "object" && "code" in remote ? remote.code : void 0;
      const known = /* @__PURE__ */ new Set([
        "RECOVERY_CLOSING",
        "RECOVERY_UNAUTHORIZED",
        "RECOVERY_ROLE_DENIED",
        "RECOVERY_HOST_HEADER",
        "RECOVERY_ORIGIN",
        "RECOVERY_METHOD",
        "RECOVERY_ROUTE",
        "RECOVERY_JSON",
        "RECOVERY_REQUEST_TOO_LARGE",
        "RECOVERY_MAINTENANCE",
        "RECOVERY_OPERATION_FAILED",
        "RECOVERY_DESKTOP_UNAVAILABLE"
      ]);
      const code = typeof candidate === "string" && known.has(candidate) ? candidate : "RECOVERY_DESKTOP_UNAVAILABLE";
      throw Object.assign(new Error(code), { code });
    }
    return body.result;
  }
  async identity() {
    const status = await this.call("desktopStatus");
    if (typeof status.projectDir !== "string" || key(status.projectDir) !== key(this.connection.projectDir) || status.dshVersion !== this.connection.dshVersion || status.protocolVersion !== 4 || status.transport !== "desktop-http") throw new Error("RECOVERY_DESKTOP_IDENTITY");
    return status;
  }
  async start() {
    await this.identity();
    const started = await this.call("startHost");
    if (started.phase !== "running") throw new Error("RECOVERY_DESKTOP_UNAVAILABLE");
    const ready = await this.call("desktopReady"), status = await this.identity();
    const guardian = status.guardian;
    if (guardian === void 0 || ready.transport !== "desktop-http" || ready.dshVersion !== this.connection.dshVersion || !Array.isArray(ready.injections) || !Number.isSafeInteger(ready.generation) || ready.generation !== started.generation || ready.generation !== guardian?.generation || ready.pid !== started.pid || ready.pid !== guardian.pid || guardian.phase !== "running" || typeof ready.url !== "string") throw new Error("RECOVERY_DESKTOP_IDENTITY");
    const url = new URL(ready.url);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.username || url.password || url.hash || url.pathname !== "/" || [...url.searchParams.keys()].length !== 1 || !/^[A-Za-z0-9_-]{16,256}$/u.test(url.searchParams.get("token") ?? "")) throw new Error("RECOVERY_DESKTOP_IDENTITY");
    this.generation = ready.generation;
    this.stopping = false;
    if (this.onFailure !== void 0) this.watch();
    return { url: url.href, injections: ready.injections, transport: "desktop-http", generation: this.generation };
  }
  watch() {
    this.poll = setTimeout(() => {
      void (async () => {
        try {
          const status = await this.identity(), guardian = status.guardian;
          if (this.stopping) return;
          if (guardian?.phase !== "running" || guardian.generation !== this.generation) throw new Error("RECOVERY_DESKTOP_GENERATION_CHANGED");
          this.watch();
        } catch (error) {
          if (!this.stopping) this.onFailure?.(error instanceof Error ? error : new Error("RECOVERY_DESKTOP_UNAVAILABLE"));
        }
      })();
    }, 1e3);
    this.poll.unref();
  }
  async stop(requireCleanStop = false) {
    this.stopping = true;
    clearTimeout(this.poll);
    const stopped = await this.call("stopHost");
    const exit = stopped.lastExit;
    if (stopped.phase !== "stopped" || requireCleanStop && (exit?.forced !== false || exit.code !== 0)) throw new Error("RECOVERY_DESKTOP_STOP_UNCONFIRMED");
  }
  /** Native updater cannot replace a SEP-owned release or bypass its compatibility/maintenance checks. */
  async updateTasks(_action) {
    throw new Error("SEP_CONTROLLED_UPDATE_REQUIRED");
  }
  /** A missing or invalid owned Host response remains unknown and triggers the native quit warning. */
  async inspectQuit() {
    await this.identity();
    const result = await this.call("desktopQuitInspection");
    if (typeof result.activeTasks !== "boolean" || typeof result.scheduledTasks !== "boolean") throw new Error("RECOVERY_QUIT_UNKNOWN");
    return { activeTasks: result.activeTasks, scheduledTasks: result.scheduledTasks };
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/directory-picker.ts
import { dialog, ipcMain } from "electron";

// sep-origin/alpha2-desktop/apps/desktop/src/ipc.ts
var DESKTOP_IPC = {
  shortcutsInput: "dsh-desktop:shortcuts-input",
  shortcutsCloseWindow: "dsh-desktop:shortcuts-close-window",
  shortcutsGet: "dsh-desktop:shortcuts-get",
  shortcutsEdit: "dsh-desktop:shortcuts-edit",
  shortcutsChanged: "dsh-desktop:shortcuts-changed",
  shortcutsRecording: "dsh-desktop:shortcuts-recording",
  boot: "dsh-desktop:boot",
  enterWorkspace: "dsh-desktop:enter-workspace",
  onboardingActive: "dsh-desktop:onboarding-active",
  onboardingApiKey: "dsh-desktop:onboarding-api-key",
  bootFailed: "dsh-desktop:boot-failed",
  browserAcquire: "dsh-desktop:browser-acquire",
  browserRelease: "dsh-desktop:browser-release",
  browserOpenRequested: "dsh-desktop:browser-open-requested",
  directoryPick: "dsh-desktop:directory-pick",
  deviceInfo: "dsh-desktop:device-info",
  localeBootstrap: "dsh-desktop:locale-bootstrap",
  localeChanged: "dsh-desktop:locale-changed",
  updatePreferencesGet: "dsh-desktop:update-preferences-get",
  updatePreferencesSet: "dsh-desktop:update-preferences-set",
  updatePreferencesChanged: "dsh-desktop:update-preferences-changed",
  sepUpdatesStatus: "dsh-desktop:sep-updates-status",
  sepUpdatesOpen: "dsh-desktop:sep-updates-open",
  sepUpdatesPresentation: "dsh-desktop:sep-updates-presentation",
  updatesStatus: "dsh-desktop:updates-status",
  updatesOpen: "dsh-desktop:updates-open",
  updatesPresentation: "dsh-desktop:updates-presentation",
  nativeThemeSet: "dsh-desktop:native-theme-set",
  windowFullscreen: "dsh-desktop:window-fullscreen",
  windowsAppearance: "dsh-desktop:windows-appearance",
  windowsMenu: "dsh-desktop:windows-menu"
};
var SCHEME = "dsh-app";
function assertDesktopSender(event, hostnames) {
  const senderFrame = event.senderFrame;
  if (senderFrame === null) throw new Error("dsh desktop: rejected IPC without a sender frame");
  const url = new URL(senderFrame.url);
  if (url.protocol !== `${SCHEME}:` || !hostnames.includes(url.hostname)) {
    throw new Error("dsh desktop: rejected IPC from an unowned renderer");
  }
}

// sep-origin/alpha2-desktop/apps/desktop/src/directory-picker.ts
function installDesktopDirectoryPicker(getWindow) {
  const pending = /* @__PURE__ */ new WeakMap();
  ipcMain.handle(DESKTOP_IPC.directoryPick, async (event) => {
    const window = getWindow();
    if (window === void 0 || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error("dsh desktop: rejected directory picker from an unowned renderer");
    }
    assertDesktopSender(event, ["app"]);
    const existing = pending.get(window);
    if (existing !== void 0) return existing;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    const result = dialog.showOpenDialog(window, { properties: ["openDirectory", "createDirectory"] }).then(
      ({ canceled, filePaths }) => window.isDestroyed() || canceled ? null : filePaths[0] ?? null
    ).finally(() => {
      pending.delete(window);
    });
    pending.set(window, result);
    return result;
  });
}

// sep-origin/alpha2-desktop/apps/desktop/src/microphone-permissions.ts
import { systemPreferences } from "electron";
function applicationFrame(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "dsh-app:" && parsed.hostname === "app";
  } catch (_error) {
    return false;
  }
}
function installMicrophonePermissions(session5, primary) {
  session5.setPermissionCheckHandler((contents, permission, origin2, details) => {
    if (permission !== "media") return true;
    return contents != null && contents === primary() && details.isMainFrame && applicationFrame(origin2) && details.mediaType === "audio" && (process.platform !== "darwin" || systemPreferences.getMediaAccessStatus("microphone") === "granted");
  });
  session5.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (permission !== "media") {
      callback(true);
      return;
    }
    const allowed = contents === primary() && details.isMainFrame && applicationFrame(details.requestingUrl) && "mediaTypes" in details && details.mediaTypes.length === 1 && details.mediaTypes[0] === "audio";
    if (!allowed) {
      callback(false);
      return;
    }
    if (process.platform !== "darwin") {
      callback(true);
      return;
    }
    void systemPreferences.askForMediaAccess("microphone").then(callback, () => {
      callback(false);
    });
  });
}

// sep-origin/alpha2-desktop/apps/desktop/src/startup-error.ts
function desktopErrorState(error) {
  const message = error instanceof AggregateError ? [error.message, ...error.errors.map((item) => desktopErrorState(item).message)].join("\n") : error instanceof Error ? error.message : String(error);
  return { phase: "error", message };
}

// sep-origin/alpha2-desktop/apps/desktop/src/backend-controller.ts
function errorState(failure) {
  return { ...desktopErrorState(failure), failure };
}
var DesktopBackendController = class {
  /**
   * @param createHost - Allocate a child and route its fatal failures to the supplied callback.
   * @param publish - Receive availability changes until the controller closes.
   */
  constructor(createHost, publish) {
    this.createHost = createHost;
    this.publish = publish;
  }
  createHost;
  publish;
  current = { phase: "starting" };
  attempt;
  pending;
  stopping;
  closed = false;
  /** Current availability, including the last startup or child failure. */
  get state() {
    return this.current;
  }
  /** Child available to application requests; absent during startup and teardown. */
  get host() {
    return !this.closed && !this.attempt?.cancelled && this.current.phase === "ready" ? this.attempt?.host : void 0;
  }
  /**
   * Prepare the profile and start one child; concurrent callers share the attempt.
   * @param prepare - Profile preparation that must finish before spawning.
   * @returns Completion of startup, rejecting on preparation, startup, or cleanup failure.
   */
  start(prepare) {
    if (this.closed) return Promise.reject(new Error("desktop backend is closed"));
    if (this.stopping !== void 0) return Promise.reject(new Error("desktop backend is stopping"));
    if (this.pending !== void 0) return this.pending;
    if (this.current.phase === "ready") return Promise.resolve();
    const previous = this.attempt;
    const attempt = { cancelled: false, ...previous?.cleanup === void 0 ? {} : { cleanup: previous.cleanup } };
    this.attempt = attempt;
    this.update({ phase: "starting" });
    const pending = Promise.resolve().then(async () => {
      try {
        await previous?.cleanup;
        delete attempt.cleanup;
        if (attempt.cancelled) return;
        await prepare();
        if (attempt.cancelled) return;
        const host = this.createHost((error) => {
          this.failed(attempt, error);
        });
        attempt.host = host;
        await host.start();
        if (attempt.failure !== void 0) throw attempt.failure;
        if (!attempt.cancelled) this.update({ phase: "ready" });
      } catch (error) {
        const cancelled = attempt.cancelled;
        attempt.cancelled = true;
        let failure = error;
        try {
          await this.cleanup(attempt);
        } catch (cleanupError) {
          if (cleanupError !== error) failure = new AggregateError([error, cleanupError], "desktop backend startup and cleanup failed");
        }
        if (!cancelled) this.update(errorState(failure));
        throw failure;
      }
    }).finally(() => {
      if (this.pending === pending) this.pending = void 0;
    });
    this.pending = pending;
    return pending;
  }
  /**
   * Stop pending preparation and the child before allowing another start.
   * @returns Completion of pending work and child exit; rejects if cleanup fails.
   */
  stop() {
    if (this.stopping !== void 0) return this.stopping;
    const attempt = this.attempt;
    if (attempt !== void 0) attempt.cancelled = true;
    if (!this.closed) this.update({ phase: "starting" });
    const pending = this.pending;
    const stopping = Promise.allSettled([
      attempt === void 0 ? Promise.resolve() : this.cleanup(attempt),
      pending
    ]).then((results) => {
      const cleanup = results[0];
      if (cleanup.status === "rejected") throw cleanup.reason;
      if (this.attempt === attempt) this.attempt = void 0;
    }).finally(() => {
      if (this.stopping === stopping) this.stopping = void 0;
    });
    this.stopping = stopping;
    return stopping;
  }
  /**
   * Permanently prevent startup and suppress further availability notifications.
   * @returns Completion of pending work and child exit; rejects if cleanup fails.
   */
  close() {
    this.closed = true;
    return this.stop();
  }
  cleanup(attempt) {
    if (attempt.cleanup === void 0) {
      attempt.cleanup = Promise.resolve().then(async () => {
        await attempt.host?.stop();
      });
    }
    return attempt.cleanup;
  }
  failed(attempt, error) {
    if (this.attempt !== attempt || attempt.cancelled) return;
    attempt.failure = error;
    if (this.current.phase !== "ready") return;
    attempt.cancelled = true;
    const cleanup = this.cleanup(attempt);
    this.update(errorState(error));
    void cleanup.catch((cleanupError) => {
      if (this.attempt === attempt) this.update(errorState(new AggregateError([error, cleanupError], "Desktop backend failed and could not stop")));
    });
  }
  update(state) {
    if (this.closed) return;
    this.current = state;
    try {
      this.publish(state);
    } catch (error) {
      console.error("desktop backend state listener failed", error);
    }
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/device-info.ts
import { cpus, totalmem } from "node:os";
function readDeviceInfo() {
  const fields = [`platform=${process.platform}`];
  collect(fields, "os", () => process.getSystemVersion());
  fields.push(`app_arch=${process.arch}`);
  collect(fields, "cpu", () => cpus()[0]?.model);
  collect(fields, "memory_gib", () => (totalmem() / 1024 ** 3).toFixed(1));
  return fields.join("; ");
}
function collect(fields, name, read) {
  let value;
  try {
    value = read();
  } catch (_error) {
    return;
  }
  if (value !== void 0 && value !== "") fields.push(`${name}=${value}`);
}

// sep-origin/alpha2-desktop/apps/desktop/src/locale.ts
var en = {
  cliCommandMenu: "Manage dsh Command\u2026",
  cliCommandTitle: "Manage dsh Command",
  cliCommandLocation: "Desktop command: {path}",
  cliCommandSelected: "Current dsh command: {path}",
  cliCommandTarget: "Current launcher target: {path}",
  cliCommandShadowed: "Another dsh takes precedence. Remove or reorder that installation to use the Desktop command by default. You can also run the Desktop command by its full path.",
  cliCommandSelectionUnknown: "Your shell command could not be verified. An alias or another dsh installation may take precedence.",
  cliCommandInstalled: "The Desktop command is installed.",
  cliCommandNotInstalled: "Add the Desktop command to your terminal.",
  cliCommandBroken: "The Desktop command needs repair.",
  cliCommandInstall: "Install",
  cliCommandRepair: "Repair",
  cliCommandRemove: "Remove",
  cliCommandClose: "Close",
  cliCommandSwitch: "Continue with the Desktop command?",
  cliCommandPreserve: "An existing command will be preserved. Other installations and shell startup files will not be changed.",
  cliCommandContinue: "Continue",
  cliCommandInstallApp: "Install Desktop in your Applications folder before managing the dsh command.",
  cliCommandUpdating: "An update is being installed. Manage the command after installation finishes.",
  cliCommandNewTerminal: "Open a new terminal and run dsh --version.",
  cliCommandRemoved: "Desktop command registration removed.",
  cliCommandPreviousRestored: "The previous launcher has been restored.",
  cliCommandOtherKept: "Other command installations have been left in place.",
  cliCommandBackupKept: "A previous launcher is preserved at: {path}",
  cliCommandChanged: "The command or PATH changed while this dialog was open. Open Manage dsh Command again to review the current state.",
  cliCommandOwnershipError: "The command registration or backup changed. No unrelated command was removed.",
  cliCommandFailed: "The command could not be updated. Check that the application is installed and the destination is writable, then retry.",
  application: "Application",
  fileMenu: "File",
  closePage: "Close Page or Window",
  aboutMenu: "About DeepSeek Harness",
  aboutProduct: "DeepSeek Harness",
  aboutVersion: "Version V{version}",
  hideApplication: "Hide DeepSeek Harness",
  hideOtherApplications: "Hide Others",
  showAllApplications: "Show All",
  quitApplication: "Quit DeepSeek Harness",
  openApplication: "Open DeepSeek Harness",
  quit: "Quit",
  cancel: "Cancel",
  quitTitle: "Quit DeepSeek Harness?",
  quitActiveTasks: "Running tasks will be interrupted.",
  quitScheduledTasks: "Scheduled tasks will not run while the app is closed.",
  quitActiveAndScheduledTasks: "Running tasks will be interrupted, and scheduled tasks will not run while the app is closed.",
  backgroundNoticeBody: "Running tasks will continue. You can reopen the window from the system tray.",
  backgroundNoticeConfirm: "Confirm",
  edit: "Edit",
  menuBar: "Application menu",
  delete: "Delete",
  undo: "Undo",
  redo: "Redo",
  cut: "Cut",
  copy: "Copy",
  paste: "Paste",
  selectAll: "Select All",
  startupFailed: "DeepSeek Harness is unavailable",
  fatalSummary: "The application could not start or stopped unexpectedly.",
  startupAddressInUse: "Another DSH instance (such as dsh web or the desktop app) is running. They cannot start at the same time. Quit the other running DSH instance, then restart.",
  diagnosticTruncated: "\u2026 Error details shortened.",
  reportWrittenTo: "Diagnostic report: {path}",
  startupReinstallAdvice: "If application files are missing or damaged, close the application and reinstall it. Your tasks are stored separately.",
  exitApplication: "Exit",
  restartApplication: "Restart",
  recoveryOperationFailed: "The recovery operation failed",
  disableThirdPartyPlugins: "Disable third-party plugins, back up profile patch, and restart",
  welcomeTitle: "DeepSeek Harness",
  welcomeBrand: "DeepSeek Harness",
  welcomeTaglineBefore: "Welcome to ",
  welcomeTaglineBrand: "DeepSeek Harness",
  welcomeTaglineAfter: "",
  welcomeDescription: "Build potential. Explore intelligence.",
  welcomeAuthStarting: "Opening sign in\u2026",
  welcomeAuthWaiting: "Browser didn\u2019t open automatically?",
  welcomeAuthWaitingDescription: "Copy the sign-in link and open it in your browser to sign in.",
  welcomeAuthExchanging: "Completing sign in\u2026",
  welcomeAuthExpired: "Sign in timed out",
  welcomeAuthExpiredDescription: "Sign in again to continue",
  welcomeAuthFailed: "Could not complete sign in. Please try again.",
  welcomeAuthCopyLink: "Copy sign-in link",
  welcomeAuthCopied: "Copied",
  welcomeAuthCopyFailed: "Could not copy. Try again.",
  welcomeAuthCancel: "Cancel",
  welcomeAuthRetry: "Sign in again",
  welcomeSignIn: "Sign in",
  welcomeApiKey: "Add API Key",
  welcomeKeyTitle: "Add an API key to get started",
  welcomeKeyDescription: "Configure official DeepSeek models to start using Harness",
  welcomeKeyPlaceholder: "Enter API key",
  welcomeKeySave: "Save and continue",
  welcomeKeyLater: "Set up later",
  welcomeKeyBack: "Back to sign in",
  welcomeSessionExpired: "You have signed out of your account, please log in again.",
  welcomeKeyBlank: "Enter an API key.",
  welcomeKeyInvalid: "Enter the API key itself, without quotes, spaces, or an environment-variable assignment.",
  welcomeKeyFailed: "Could not save the API key. Please try again.",
  welcomeContinueFailed: "Could not open the workspace. Please try again.",
  checkUpdatesMenu: "Check for Updates\u2026",
  sepCheckHostUpdates: "Check DSH Updates\u2026",
  sepCheckSuiteUpdates: "Check SEP Updates\u2026",
  reloadPageMenu: "Reload Page",
  restartAppHostMenu: "Restart App and Host",
  sepPluginReport: "All-plugin update compatibility report\u2026",
  sepCancelUpdate: "Cancel pending update",
  sepManagedUpdates: "This installation is managed by DSH SEP. Use SEP Update Center to check compatibility and update while preserving your data and plugins.",
  updateCheckFailedTitle: "Update Check Failed",
  updateCheckFailed: "Could not check for updates. Please try again later.",
  updateDownloadFailed: "Could not download the update. Please try again.",
  updateInstallFailed: "Could not install the update. Please try again later.",
  updateCheckNetworkFailed: "Could not check for updates. Check your connection and try again.",
  updateDownloadNetworkFailed: "Could not download the update. Check your connection and try again.",
  updateInstallNetworkFailed: "Could not install the update. Check your connection and try again.",
  unknownError: "Unknown error",
  updateCheckTitle: "Check for Updates",
  updateCurrentDetail: "Current version: {version}",
  updateCurrent: "You\u2019re up to date!",
  updateChecking: "Checking for updates\u2026",
  updateDownload: "Download update",
  updateDownloadedTitle: "Version {version} is ready to install",
  updateDownloadedDetail: "The app will close during the update and reopen automatically when it is complete.",
  updateDownloadedDetailWindows: "The app will close temporarily during the update and reopen automatically when it is complete.\n\nThe update may take some time. Please wait and do not launch the app again during installation.",
  updateClose: "Close",
  updateAcknowledge: "OK",
  updateLater: "Update later",
  updateDownloading: "Downloading {percent}%\u2026",
  updateVerifying: "Verifying update files\u2026",
  updateInstalling: "Preparing to restart\u2026",
  updateRetry: "Retry update",
  updateActiveTasks: "Tasks are still in progress",
  updateActiveTasksDetail: "Updating will stop the tasks in progress and restart the app. Continue?",
  updateStopTasks: "Stop tasks and update",
  updateTasksChanged: "New tasks have started. Confirm again to stop the tasks and update.",
  updateTasksUnavailable: "Task status is unavailable. Try updating again when the workspace is ready.",
  updateStopFailed: "Could not safely stop the tasks. The update has not been installed. Please try again later.",
  updateTechnicalDetails: "View technical details",
  updateTitle: "DeepSeek Harness Update",
  updateAvailable: "New version available: {version}",
  updateDetail: "Once the download is complete, you can install the update and restart the app.",
  installAndRestart: "Install and Restart",
  later: "Later",
  updateFailedTitle: "Update Failed",
  mandatoryTitle: "Update to continue",
  mandatoryDetail: "This version is no longer supported. Update to continue. Tasks in progress will keep running until you confirm installation and restart.",
  mandatoryUnavailable: "Could not check update requirements. Please try again later.",
  policyLoginTitle: "Sign in to the test environment",
  policyLoginRequired: "Sign in with Feishu to check update requirements for this test build. Signing in will not download or install an update.",
  policyLogin: "Sign in with Feishu",
  policyLoginFailed: "Feishu sign-in did not complete. Please try again.",
  policyLoginLoading: "Loading sign-in page\u2026",
  mandatoryNoRelease: "No compatible update was found. Check again or contact support.",
  mandatoryRefresh: "Check again",
  mandatoryPage: "Download from the official website",
  mandatoryCopy: "Copy download link",
  mandatoryPageFailed: "Could not open the official download page. Copy the link and open it in your browser.",
  mandatoryActionFailed: "The action failed. Please try again. You can use the app again after the update is complete.",
  mandatoryReady: "Update ready",
  mandatoryVersion: "New version: {version}",
  mandatoryReadyDetail: "The app will close during the update and reopen automatically when it is complete.",
  mandatoryDeferred: "Tasks in progress will keep running. Complete the update before using the app again.",
  mandatoryContinue: "Continue update",
  mandatoryInspecting: "Checking tasks\u2026",
  mandatoryStopping: "Stopping tasks\u2026",
  mandatoryRestarting: "The app will restart shortly. Please wait.",
  mandatoryDownloadFailed: "The update files could not be downloaded or prepared. Please retry.",
  mandatoryInstallFailed: "The update has not been installed. Check the tasks again and retry.",
  mandatoryOpenHelp: "Page didn\u2019t open?",
  mandatoryReopen: "Open the official download page again",
  mandatoryCopied: "Link copied",
  mandatoryCopyFailed: "Could not copy the link. Select and copy it below.",
  mandatoryAddress: "Download link",
  mandatoryNotification: "Return to the application to confirm installation and restart."
};
var zh = {
  cliCommandMenu: "\u7BA1\u7406 dsh \u547D\u4EE4\u2026",
  cliCommandTitle: "\u7BA1\u7406 dsh \u547D\u4EE4",
  cliCommandLocation: "Desktop \u547D\u4EE4\uFF1A{path}",
  cliCommandSelected: "\u5F53\u524D dsh \u547D\u4EE4\uFF1A{path}",
  cliCommandTarget: "\u5F53\u524D\u542F\u52A8\u5668\u76EE\u6807\uFF1A{path}",
  cliCommandShadowed: "\u53E6\u4E00\u4E2A dsh \u7684\u4F18\u5148\u7EA7\u66F4\u9AD8\u3002\u8BF7\u79FB\u9664\u6216\u8C03\u6574\u8BE5\u5B89\u88C5\u7684\u987A\u5E8F\uFF0C\u4EE5\u9ED8\u8BA4\u4F7F\u7528 Desktop \u547D\u4EE4\uFF1B\u4E5F\u53EF\u4EE5\u901A\u8FC7\u5B8C\u6574\u8DEF\u5F84\u8FD0\u884C Desktop \u547D\u4EE4\u3002",
  cliCommandSelectionUnknown: "\u65E0\u6CD5\u786E\u8BA4 shell \u4E2D\u7684\u547D\u4EE4\u3002\u522B\u540D\u6216\u53E6\u4E00\u4E2A dsh \u5B89\u88C5\u53EF\u80FD\u5177\u6709\u66F4\u9AD8\u4F18\u5148\u7EA7\u3002",
  cliCommandInstalled: "Desktop \u547D\u4EE4\u5DF2\u5B89\u88C5\u3002",
  cliCommandNotInstalled: "\u5C06 Desktop \u547D\u4EE4\u6DFB\u52A0\u5230\u7EC8\u7AEF\u3002",
  cliCommandBroken: "Desktop \u547D\u4EE4\u9700\u8981\u4FEE\u590D\u3002",
  cliCommandInstall: "\u5B89\u88C5",
  cliCommandRepair: "\u4FEE\u590D",
  cliCommandRemove: "\u79FB\u9664",
  cliCommandClose: "\u5173\u95ED",
  cliCommandSwitch: "\u7EE7\u7EED\u4F7F\u7528 Desktop \u547D\u4EE4\uFF1F",
  cliCommandPreserve: "\u73B0\u6709\u547D\u4EE4\u4F1A\u88AB\u4FDD\u7559\uFF0C\u4E0D\u4F1A\u4FEE\u6539\u5176\u4ED6\u5B89\u88C5\u6216 shell \u542F\u52A8\u6587\u4EF6\u3002",
  cliCommandContinue: "\u7EE7\u7EED",
  cliCommandInstallApp: "\u8BF7\u5148\u5C06 Desktop \u5B89\u88C5\u5230\u201C\u5E94\u7528\u7A0B\u5E8F\u201D\u6587\u4EF6\u5939\uFF0C\u518D\u7BA1\u7406 dsh \u547D\u4EE4\u3002",
  cliCommandUpdating: "\u6B63\u5728\u5B89\u88C5\u66F4\u65B0\u3002\u8BF7\u5728\u5B89\u88C5\u5B8C\u6210\u540E\u7BA1\u7406\u547D\u4EE4\u3002",
  cliCommandNewTerminal: "\u6253\u5F00\u65B0\u7EC8\u7AEF\u5E76\u8FD0\u884C dsh --version\u3002",
  cliCommandRemoved: "\u5DF2\u79FB\u9664 Desktop \u547D\u4EE4\u6CE8\u518C\u3002",
  cliCommandPreviousRestored: "\u5DF2\u6062\u590D\u4E4B\u524D\u7684\u542F\u52A8\u5668\u3002",
  cliCommandOtherKept: "\u5176\u4ED6\u547D\u4EE4\u5B89\u88C5\u4FDD\u6301\u4E0D\u53D8\u3002",
  cliCommandBackupKept: "\u4E4B\u524D\u7684\u542F\u52A8\u5668\u4FDD\u7559\u5728\uFF1A{path}",
  cliCommandChanged: "\u5BF9\u8BDD\u6846\u6253\u5F00\u671F\u95F4\u547D\u4EE4\u6216 PATH \u5DF2\u6539\u53D8\u3002\u8BF7\u91CD\u65B0\u6253\u5F00\u201C\u7BA1\u7406 dsh \u547D\u4EE4\u201D\u68C0\u67E5\u5F53\u524D\u72B6\u6001\u3002",
  cliCommandOwnershipError: "\u547D\u4EE4\u6CE8\u518C\u6216\u5907\u4EFD\u5DF2\u6539\u53D8\uFF0C\u672A\u79FB\u9664\u65E0\u5173\u547D\u4EE4\u3002",
  cliCommandFailed: "\u65E0\u6CD5\u66F4\u65B0\u547D\u4EE4\u3002\u8BF7\u68C0\u67E5\u5E94\u7528\u662F\u5426\u5DF2\u5B89\u88C5\u3001\u76EE\u6807\u4F4D\u7F6E\u662F\u5426\u53EF\u5199\uFF0C\u7136\u540E\u91CD\u8BD5\u3002",
  application: "\u5E94\u7528",
  fileMenu: "\u6587\u4EF6",
  closePage: "\u5173\u95ED\u9875\u9762\u6216\u7A97\u53E3",
  aboutMenu: "\u5173\u4E8E DeepSeek Harness",
  aboutProduct: "DeepSeek Harness",
  aboutVersion: "\u7248\u672C V{version}",
  hideApplication: "\u9690\u85CF DeepSeek Harness",
  hideOtherApplications: "\u9690\u85CF\u5176\u4ED6",
  showAllApplications: "\u663E\u793A\u5168\u90E8",
  quitApplication: "\u9000\u51FA DeepSeek Harness",
  openApplication: "\u6253\u5F00 DeepSeek Harness",
  quit: "\u9000\u51FA",
  cancel: "\u53D6\u6D88",
  quitTitle: "\u9000\u51FA DeepSeek Harness\uFF1F",
  quitActiveTasks: "\u5F53\u524D\u6B63\u5728\u8FD0\u884C\u7684\u4EFB\u52A1\u5C06\u4F1A\u4E2D\u65AD",
  quitScheduledTasks: "\u5E94\u7528\u5173\u95ED\u671F\u95F4\uFF0C\u5B9A\u65F6\u4EFB\u52A1\u4E0D\u4F1A\u8FD0\u884C",
  quitActiveAndScheduledTasks: "\u5F53\u524D\u6B63\u5728\u8FD0\u884C\u7684\u4EFB\u52A1\u5C06\u4F1A\u4E2D\u65AD\uFF0C\u4E14\u5E94\u7528\u5173\u95ED\u671F\u95F4\uFF0C\u5B9A\u65F6\u4EFB\u52A1\u4E0D\u4F1A\u8FD0\u884C",
  backgroundNoticeBody: "\u6B63\u5728\u8FD0\u884C\u7684\u4EFB\u52A1\u4E0D\u4F1A\u4E2D\u65AD\uFF0C\u53EF\u5728\u7CFB\u7EDF\u6258\u76D8\u4E2D\u91CD\u65B0\u6253\u5F00\u7A97\u53E3",
  backgroundNoticeConfirm: "\u786E\u8BA4",
  edit: "\u7F16\u8F91",
  menuBar: "\u5E94\u7528\u83DC\u5355",
  delete: "\u5220\u9664",
  undo: "\u64A4\u9500",
  redo: "\u91CD\u505A",
  cut: "\u526A\u5207",
  copy: "\u590D\u5236",
  paste: "\u7C98\u8D34",
  selectAll: "\u5168\u9009",
  startupFailed: "DeepSeek Harness \u65E0\u6CD5\u4F7F\u7528",
  fatalSummary: "\u5E94\u7528\u65E0\u6CD5\u542F\u52A8\u6216\u5DF2\u610F\u5916\u505C\u6B62\u3002",
  startupAddressInUse: "\u6709\u5176\u4ED6\u6B63\u5728\u8FD0\u884C\u7684 DSH\uFF08\u5982\u5176\u4ED6 dsh web\u3001\u684C\u9762\u7AEF\uFF09\uFF0C\u65E0\u6CD5\u540C\u65F6\u542F\u52A8\uFF0C\u8BF7\u9000\u51FA\u5176\u4ED6\u6B63\u5728\u8FD0\u884C\u7684 DSH \u540E\u91CD\u542F\u3002",
  diagnosticTruncated: "\u2026 \u9519\u8BEF\u8BE6\u60C5\u5DF2\u622A\u77ED\u3002",
  reportWrittenTo: "\u8BCA\u65AD\u62A5\u544A\uFF1A{path}",
  startupReinstallAdvice: "\u5982\u679C\u5E94\u7528\u6587\u4EF6\u7F3A\u5931\u6216\u635F\u574F\uFF0C\u8BF7\u5173\u95ED\u5E94\u7528\u5E76\u91CD\u65B0\u5B89\u88C5\u3002\u4EFB\u52A1\u6570\u636E\u5B58\u50A8\u5728\u72EC\u7ACB\u4F4D\u7F6E\u3002",
  exitApplication: "\u9000\u51FA",
  restartApplication: "\u91CD\u542F",
  recoveryOperationFailed: "\u6062\u590D\u64CD\u4F5C\u5931\u8D25",
  disableThirdPartyPlugins: "\u7981\u7528\u7B2C\u4E09\u65B9\u63D2\u4EF6\u3001\u5907\u4EFD profile patch \u5E76\u91CD\u542F",
  welcomeTitle: "DeepSeek Harness",
  welcomeBrand: "DeepSeek Harness",
  welcomeTaglineBefore: "\u6B22\u8FCE\u4F7F\u7528 ",
  welcomeTaglineBrand: "DeepSeek Harness",
  welcomeTaglineAfter: "",
  welcomeDescription: "\u7EC4\u88C5\u65E0\u9650\u53EF\u80FD\uFF0C\u5171\u63A2\u667A\u80FD\u4E0A\u9650",
  welcomeAuthStarting: "\u6B63\u5728\u6253\u5F00\u767B\u5F55\u2026",
  welcomeAuthWaiting: "\u6CA1\u6709\u81EA\u52A8\u6253\u5F00\u6D4F\u89C8\u5668\uFF1F",
  welcomeAuthWaitingDescription: "\u590D\u5236\u767B\u5F55\u94FE\u63A5\uFF0C\u7528\u6D4F\u89C8\u5668\u624B\u52A8\u6253\u5F00\u5B8C\u6210\u767B\u5F55",
  welcomeAuthExchanging: "\u6B63\u5728\u5B8C\u6210\u767B\u5F55\u2026",
  welcomeAuthExpired: "\u767B\u5F55\u5DF2\u8D85\u65F6",
  welcomeAuthExpiredDescription: "\u8BF7\u91CD\u65B0\u767B\u5F55\u540E\u7EE7\u7EED\u64CD\u4F5C",
  welcomeAuthFailed: "\u767B\u5F55\u672A\u5B8C\u6210\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  welcomeAuthCopyLink: "\u590D\u5236\u767B\u5F55\u94FE\u63A5",
  welcomeAuthCopied: "\u5DF2\u590D\u5236",
  welcomeAuthCopyFailed: "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",
  welcomeAuthCancel: "\u53D6\u6D88",
  welcomeAuthRetry: "\u91CD\u65B0\u767B\u5F55",
  welcomeSignIn: "\u767B\u5F55",
  welcomeApiKey: "\u6DFB\u52A0 API Key",
  welcomeKeyTitle: "\u6DFB\u52A0\u4E00\u4E2A API Key \u5F00\u59CB\u4F7F\u7528",
  welcomeKeyDescription: "\u914D\u7F6E DeepSeek \u5B98\u65B9\u6A21\u578B\uFF0C\u5373\u53EF\u5F00\u59CB\u4F7F\u7528",
  welcomeKeyPlaceholder: "\u8F93\u5165 API \u5BC6\u94A5",
  welcomeKeySave: "\u4FDD\u5B58\u5E76\u7EE7\u7EED",
  welcomeKeyLater: "\u7A0D\u540E\u914D\u7F6E",
  welcomeKeyBack: "\u8FD4\u56DE\u767B\u5F55",
  welcomeSessionExpired: "\u767B\u5F55\u4FE1\u606F\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55",
  welcomeKeyBlank: "\u8BF7\u8F93\u5165 API \u5BC6\u94A5\u3002",
  welcomeKeyInvalid: "\u8BF7\u4EC5\u8F93\u5165 API \u5BC6\u94A5\uFF0C\u4E0D\u8981\u5305\u542B\u5F15\u53F7\u3001\u7A7A\u683C\u6216\u73AF\u5883\u53D8\u91CF\u8D4B\u503C\u3002",
  welcomeKeyFailed: "\u65E0\u6CD5\u4FDD\u5B58 API \u5BC6\u94A5\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  welcomeContinueFailed: "\u65E0\u6CD5\u6253\u5F00\u5DE5\u4F5C\u533A\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  sepPluginReport: "\u5168\u63D2\u4EF6\u66F4\u65B0\u517C\u5BB9\u6027\u62A5\u544A\u2026",
  sepCancelUpdate: "\u53D6\u6D88\u5F85\u6267\u884C\u66F4\u65B0",
  sepManagedUpdates: "\u6B64\u5B89\u88C5\u7531 DSH SEP \u7BA1\u7406\u3002\u8BF7\u4F7F\u7528 SEP \u66F4\u65B0\u4E2D\u5FC3\u68C0\u67E5\u517C\u5BB9\u6027\u5E76\u66F4\u65B0\uFF0C\u4EE5\u4FDD\u7559\u7528\u6237\u6570\u636E\u548C\u5176\u4ED6\u63D2\u4EF6\u3002",
  checkUpdatesMenu: "\u68C0\u67E5\u66F4\u65B0\u2026",
  sepCheckHostUpdates: "\u68C0\u67E5 DSH \u672C\u4F53\u66F4\u65B0\u2026",
  sepCheckSuiteUpdates: "\u68C0\u67E5 SEP \u672C\u4F53\u66F4\u65B0\u2026",
  reloadPageMenu: "\u5237\u65B0\u9875\u9762",
  restartAppHostMenu: "\u91CD\u542F\u5E94\u7528\u4E0E Host",
  updateCheckFailedTitle: "\u66F4\u65B0\u68C0\u67E5\u5931\u8D25",
  updateCheckFailed: "\u68C0\u67E5\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  updateDownloadFailed: "\u4E0B\u8F7D\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  updateInstallFailed: "\u5B89\u88C5\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  updateCheckNetworkFailed: "\u68C0\u67E5\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5\u540E\u91CD\u8BD5\u3002",
  updateDownloadNetworkFailed: "\u4E0B\u8F7D\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5\u540E\u91CD\u8BD5\u3002",
  updateInstallNetworkFailed: "\u5B89\u88C5\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5\u540E\u91CD\u8BD5\u3002",
  unknownError: "\u672A\u77E5\u9519\u8BEF",
  updateCheckTitle: "\u68C0\u67E5\u66F4\u65B0",
  updateCurrentDetail: "\u5F53\u524D\u7248\u672C\uFF1A{version}",
  updateCurrent: "\u5DF2\u662F\u6700\u65B0\u7248\u672C",
  updateChecking: "\u6B63\u5728\u68C0\u67E5\u66F4\u65B0\u2026",
  updateDownload: "\u4E0B\u8F7D\u66F4\u65B0",
  updateDownloadedTitle: "\u65B0\u7248\u672C {version} \u5DF2\u51C6\u5907\u5C31\u7EEA",
  updateDownloadedDetail: "\u66F4\u65B0\u671F\u95F4\u5E94\u7528\u5C06\u6682\u65F6\u5173\u95ED\uFF0C\u5B8C\u6210\u540E\u4F1A\u81EA\u52A8\u6253\u5F00\u3002",
  updateDownloadedDetailWindows: "\u66F4\u65B0\u671F\u95F4\u5E94\u7528\u5C06\u6682\u65F6\u5173\u95ED\uFF0C\u5B8C\u6210\u540E\u4F1A\u81EA\u52A8\u6253\u5F00\u3002\n\n\u66F4\u65B0\u53EF\u80FD\u9700\u8981\u4E00\u4E9B\u65F6\u95F4\uFF0C\u8BF7\u8010\u5FC3\u7B49\u5F85\uFF0C\u671F\u95F4\u8BF7\u52FF\u91CD\u590D\u542F\u52A8\u5E94\u7528\u3002",
  updateClose: "\u5173\u95ED",
  updateAcknowledge: "\u786E\u5B9A",
  updateLater: "\u7A0D\u540E\u66F4\u65B0",
  updateDownloading: "\u6B63\u5728\u4E0B\u8F7D {percent}%\u2026",
  updateVerifying: "\u6B63\u5728\u6821\u9A8C\u66F4\u65B0\u6587\u4EF6\u2026",
  updateInstalling: "\u6B63\u5728\u51C6\u5907\u91CD\u542F\u2026",
  updateRetry: "\u91CD\u8BD5\u66F4\u65B0",
  updateActiveTasks: "\u4ECD\u6709\u8FDB\u884C\u4E2D\u7684\u4EFB\u52A1",
  updateActiveTasksDetail: "\u66F4\u65B0\u5C06\u505C\u6B62\u8FDB\u884C\u4E2D\u7684\u4EFB\u52A1\u5E76\u91CD\u542F\u5E94\u7528\uFF0C\u662F\u5426\u7EE7\u7EED\uFF1F",
  updateStopTasks: "\u505C\u6B62\u4EFB\u52A1\u5E76\u66F4\u65B0",
  updateTasksChanged: "\u6709\u65B0\u4EFB\u52A1\u5F00\u59CB\u8FD0\u884C\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4\u662F\u5426\u505C\u6B62\u4EFB\u52A1\u5E76\u66F4\u65B0\u3002",
  updateTasksUnavailable: "\u65E0\u6CD5\u786E\u8BA4\u4EFB\u52A1\u72B6\u6001\uFF0C\u8BF7\u5728\u5DE5\u4F5C\u533A\u5C31\u7EEA\u540E\u91CD\u8BD5\u66F4\u65B0\u3002",
  updateStopFailed: "\u672A\u80FD\u5B89\u5168\u505C\u6B62\u4EFB\u52A1\uFF0C\u66F4\u65B0\u5C1A\u672A\u5B89\u88C5\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  updateTechnicalDetails: "\u67E5\u770B\u6280\u672F\u8BE6\u60C5",
  updateTitle: "DeepSeek Harness \u66F4\u65B0",
  updateAvailable: "\u53D1\u73B0\u65B0\u7248\u672C {version}",
  updateDetail: "\u4E0B\u8F7D\u5B8C\u6210\u540E\uFF0C\u53EF\u5B89\u88C5\u5E76\u91CD\u542F\u5E94\u7528\u3002",
  installAndRestart: "\u5B89\u88C5\u5E76\u91CD\u542F",
  later: "\u7A0D\u540E",
  updateFailedTitle: "\u66F4\u65B0\u5931\u8D25",
  mandatoryTitle: "\u8BF7\u66F4\u65B0\u540E\u7EE7\u7EED\u4F7F\u7528",
  mandatoryDetail: "\u5F53\u524D\u7248\u672C\u5DF2\u505C\u6B62\u652F\u6301\uFF0C\u8BF7\u66F4\u65B0\u540E\u7EE7\u7EED\u4F7F\u7528\u3002\u786E\u8BA4\u5B89\u88C5\u5E76\u91CD\u542F\u524D\uFF0C\u8FDB\u884C\u4E2D\u7684\u4EFB\u52A1\u4F1A\u7EE7\u7EED\u8FD0\u884C\u3002",
  mandatoryUnavailable: "\u6682\u65F6\u65E0\u6CD5\u68C0\u67E5\u66F4\u65B0\u8981\u6C42\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  policyLoginTitle: "\u767B\u5F55\u6D4B\u8BD5\u73AF\u5883",
  policyLoginRequired: "\u6B64\u6D4B\u8BD5\u7248\u9700\u8981\u5148\u901A\u8FC7\u98DE\u4E66\u767B\u5F55\uFF0C\u624D\u80FD\u68C0\u67E5\u66F4\u65B0\u8981\u6C42\u3002\u767B\u5F55\u4E0D\u4F1A\u4E0B\u8F7D\u6216\u5B89\u88C5\u66F4\u65B0\u3002",
  policyLogin: "\u901A\u8FC7\u98DE\u4E66\u767B\u5F55",
  policyLoginFailed: "\u98DE\u4E66\u767B\u5F55\u672A\u5B8C\u6210\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  policyLoginLoading: "\u6B63\u5728\u52A0\u8F7D\u767B\u5F55\u9875\u9762\u2026",
  mandatoryNoRelease: "\u6682\u672A\u627E\u5230\u9002\u7528\u7684\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u6216\u8054\u7CFB\u652F\u6301\u4EBA\u5458\u3002",
  mandatoryRefresh: "\u91CD\u65B0\u68C0\u67E5",
  mandatoryPage: "\u524D\u5F80\u5B98\u7F51\u4E0B\u8F7D",
  mandatoryCopy: "\u590D\u5236\u4E0B\u8F7D\u94FE\u63A5",
  mandatoryPageFailed: "\u65E0\u6CD5\u6253\u5F00\u5B98\u7F51\u4E0B\u8F7D\u9875\u9762\uFF0C\u8BF7\u590D\u5236\u94FE\u63A5\u540E\u5728\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00\u3002",
  mandatoryActionFailed: "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002\u5B8C\u6210\u66F4\u65B0\u540E\u624D\u80FD\u7EE7\u7EED\u4F7F\u7528\u5E94\u7528\u3002",
  mandatoryReady: "\u66F4\u65B0\u5DF2\u51C6\u5907\u5C31\u7EEA",
  mandatoryVersion: "\u65B0\u7248\u672C\uFF1A{version}",
  mandatoryReadyDetail: "\u66F4\u65B0\u671F\u95F4\u5E94\u7528\u5C06\u6682\u65F6\u5173\u95ED\uFF0C\u5B8C\u6210\u540E\u4F1A\u81EA\u52A8\u6253\u5F00\u3002",
  mandatoryDeferred: "\u8FDB\u884C\u4E2D\u7684\u4EFB\u52A1\u4F1A\u7EE7\u7EED\u8FD0\u884C\u3002\u8BF7\u5B8C\u6210\u66F4\u65B0\u540E\u518D\u64CD\u4F5C\u5E94\u7528\u3002",
  mandatoryContinue: "\u7EE7\u7EED\u66F4\u65B0",
  mandatoryInspecting: "\u6B63\u5728\u68C0\u67E5\u4EFB\u52A1\u72B6\u6001\u2026",
  mandatoryStopping: "\u6B63\u5728\u505C\u6B62\u4EFB\u52A1\u2026",
  mandatoryRestarting: "\u5E94\u7528\u5373\u5C06\u91CD\u542F\uFF0C\u8BF7\u7A0D\u5019\u3002",
  mandatoryDownloadFailed: "\u66F4\u65B0\u6587\u4EF6\u4E0B\u8F7D\u6216\u51C6\u5907\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  mandatoryInstallFailed: "\u66F4\u65B0\u5C1A\u672A\u5B89\u88C5\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u4EFB\u52A1\u540E\u91CD\u8BD5\u3002",
  mandatoryOpenHelp: "\u9875\u9762\u672A\u6253\u5F00\uFF1F",
  mandatoryReopen: "\u91CD\u65B0\u524D\u5F80\u5B98\u7F51\u4E0B\u8F7D",
  mandatoryCopied: "\u94FE\u63A5\u5DF2\u590D\u5236",
  mandatoryCopyFailed: "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u9009\u62E9\u5E76\u590D\u5236\u4E0B\u65B9\u94FE\u63A5\u3002",
  mandatoryAddress: "\u4E0B\u8F7D\u94FE\u63A5",
  mandatoryNotification: "\u8FD4\u56DE\u5E94\u7528\u786E\u8BA4\u5B89\u88C5\u5E76\u91CD\u542F\u3002"
};
function resolveDesktopLocale(locale) {
  return locale.toLowerCase().startsWith("zh") ? { id: "zh-CN", messages: zh } : { id: "en", messages: en };
}
function resolveDesktopStartupLocale(preference, languages) {
  const selected = preference?.toLowerCase();
  if (selected === "zh" || selected === "en") return resolveDesktopLocale(selected);
  for (const language of languages) {
    const primary = language.toLowerCase().split("-")[0];
    if (primary === "zh" || primary === "en") return resolveDesktopLocale(primary);
  }
  return resolveDesktopLocale("en");
}
function formatDesktopMessage(message, values) {
  return message.replaceAll(/\{([^{}]+)\}/gu, (placeholder, key2) => values[key2] ?? placeholder);
}
function desktopUpdateReadyConfirmation(messages, version, platform) {
  return {
    message: formatDesktopMessage(messages.updateDownloadedTitle, { version }),
    detail: platform === "win32" ? messages.updateDownloadedDetailWindows : messages.updateDownloadedDetail
  };
}

// sep-origin/alpha2-desktop/apps/desktop/src/single-instance.ts
function claimDesktopSingleInstance(application, focusOwner) {
  if (!application.requestSingleInstanceLock()) {
    application.quit();
    return false;
  }
  application.on("second-instance", focusOwner);
  return true;
}

// sep-origin/alpha2-desktop/apps/desktop/src/update-coordinator.ts
import { existsSync as existsSync2 } from "node:fs";
import { join as join5 } from "node:path";
import { app } from "electron";
import electronUpdater from "electron-updater";
import { gt, valid as valid3 } from "semver";

// sep-origin/alpha2-desktop/apps/desktop/src/update-http-executor.ts
import { ElectronHttpExecutor } from "electron-updater/out/electronHttpExecutor.js";
var DesktopUpdateHttpExecutor = class extends ElectronHttpExecutor {
  /**
   * @param idleTimeoutMs - Maximum silence before headers or between response chunks, not a total download deadline.
   * @param proxyLogin - Existing updater login event forwarding.
   */
  constructor(idleTimeoutMs, proxyLogin) {
    super(proxyLogin);
    this.idleTimeoutMs = idleTimeoutMs;
    if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs < 1e3 || idleTimeoutMs > 2147483647) {
      throw new Error("desktop update: HTTP idle timeout must be an integer from 1000 through 2147483647");
    }
  }
  idleTimeoutMs;
  addErrorAndTimeoutHandlers(request, reject) {
    super.addErrorAndTimeoutHandlers(request, reject, this.idleTimeoutMs);
    let response;
    let timer;
    const stop = () => {
      clearTimeout(timer);
      request.off("response", onResponse);
      request.off("abort", stop);
      request.off("error", stop);
      response?.off("data", refresh);
      response?.off("end", stop);
      response?.off("error", stop);
    };
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        stop();
        reject(Object.assign(new Error("Desktop update connection timed out"), { code: "ETIMEDOUT" }));
        request.abort();
      }, this.idleTimeoutMs);
    };
    const onResponse = (incoming) => {
      response = incoming;
      response.on("data", refresh);
      response.once("end", stop);
      response.once("error", stop);
      refresh();
    };
    request.once("response", onResponse);
    request.once("abort", stop);
    request.once("error", stop);
    refresh();
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/update-error.ts
var DesktopUpdatePreparationError = class extends Error {
  /**
   * @param kind - Stable preparation cause shared by native and Web presentations.
   * @param message - Locale-owned recovery guidance.
   * @param technicalDetails - Main-owned facts, excluding raw subprocess output and credentials.
   */
  constructor(kind, message, technicalDetails) {
    super(message);
    this.kind = kind;
    this.technicalDetails = technicalDetails;
  }
  kind;
  technicalDetails;
};

// sep-origin/alpha2-desktop/apps/desktop/src/update-coordinator.ts
var { autoUpdater } = electronUpdater;
var DesktopUpdateCoordinator = class {
  /**
   * @param publish - Receives observable states for every Desktop window.
   * @param beforeRestart - Completes task authorization, admission locking, and owned-process shutdown.
   * @param updater - Process-owned Electron updater, replaceable at the network/platform test boundary.
   * @param enabled - Whether this process has a packaged update source.
   * @param currentVersion - Actual installed application version.
   * @param downloadResult - Once per completed download attempt, including platform preparation failures.
   */
  constructor(publish, beforeRestart, updater = autoUpdater, enabled = () => app.isPackaged && existsSync2(join5(process.resourcesPath, "app-update.yml")), currentVersion = () => app.getVersion(), downloadResult) {
    this.publish = publish;
    this.beforeRestart = beforeRestart;
    this.updater = updater;
    this.enabled = enabled;
    this.currentVersion = currentVersion;
    this.downloadResult = downloadResult;
    if (updater === autoUpdater) {
      const transportOwner = updater;
      transportOwner.httpExecutor = new DesktopUpdateHttpExecutor(
        Number(process.env.DSH_DESKTOP_UPDATE_HTTP_IDLE_TIMEOUT_MS ?? 6e4),
        (authInfo, callback) => {
          updater.emit("login", authInfo, callback);
        }
      );
    }
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.channel = "nightly";
    this.updater.allowPrerelease = true;
    this.updater.allowDowngrade = false;
    this.updater.on("download-progress", this.onProgress);
    this.updater.on("update-downloaded", this.onDownloaded);
    this.updater.on("error", this.onError);
  }
  publish;
  beforeRestart;
  updater;
  enabled;
  currentVersion;
  downloadResult;
  current = { phase: "idle" };
  candidate;
  downloaded = false;
  disposed = false;
  checkOperation;
  downloadOperation;
  installOperation;
  onProgress = (progress) => {
    if (this.downloadOperation === void 0 || this.downloaded) return;
    const percent = Math.min(100, Math.max(0, progress.percent));
    this.setState({ phase: percent >= 100 ? "verifying" : "downloading", ...this.target(), percent });
  };
  onDownloaded = (info) => {
    if (this.downloadOperation === void 0 || info.version !== this.candidate) return;
    this.downloaded = true;
  };
  onError = (error) => {
    if (this.current.phase === "installing") {
      this.setState(this.failure(error, "install"));
    }
  };
  /** Latest observable state; complete download identity remains main-process-owned. */
  get state() {
    return this.current;
  }
  /**
   * Check metadata without downloading, joining any current check.
   * @param manual - Whether a failed check must remain visible in the status indicator.
   * @returns The check result, including a silent automatic failure when applicable.
   */
  async check(manual = false) {
    this.assertLive();
    if (this.downloadOperation !== void 0 || this.installOperation !== void 0 || this.downloaded) return this.current;
    if (!manual && this.current.phase === "error" && this.current.failedOperation === "download") return this.current;
    this.checkOperation ??= Promise.resolve().then(() => this.doCheck()).finally(() => {
      this.checkOperation = void 0;
    });
    const result = await this.checkOperation;
    if (manual && result.phase === "error") this.setState(result);
    return result;
  }
  /**
   * @param version - Version shown in the user's download confirmation.
   * @returns Download readiness or failure, without authorizing installation.
   */
  async download(version) {
    this.assertLive();
    if (this.downloaded || this.installOperation !== void 0) return this.current;
    this.downloadOperation ??= Promise.resolve().then(async () => {
      await this.checkOperation;
      this.assertLive();
      if (this.candidate === void 0) throw new Error("desktop update: no checked update is available");
      if (version !== this.candidate) throw new Error("desktop update: download confirmation is stale");
      this.setState({ phase: "downloading", version, percent: 0 });
      try {
        await this.updater.downloadUpdate();
        if (!this.downloaded) throw new Error("desktop update: platform preparation did not report readiness");
        this.downloadResult?.(true);
        return this.setState({ phase: "ready", version });
      } catch (error) {
        this.downloaded = false;
        this.downloadResult?.(false, error instanceof DesktopUpdatePreparationError ? error.kind : "download_failed");
        return this.setState(this.failure(error, "download"));
      }
    }).finally(() => {
      this.downloadOperation = void 0;
    });
    return this.downloadOperation;
  }
  /**
   * Install a prepared target after a separate user confirmation.
   * @param version - Exact version displayed in the confirmation, never a renderer-selected URL.
   * @returns Installation handoff or a recoverable preparation error.
   */
  async install(version) {
    this.assertLive();
    if (!this.downloaded || this.downloadOperation !== void 0 || version !== this.candidate) throw new Error("desktop update: confirmed target is not ready");
    this.installOperation ??= Promise.resolve().then(async () => {
      this.setState({ phase: "installing", version });
      try {
        if (!await this.beforeRestart()) return this.setState({ phase: "ready", version });
        this.assertLive();
        this.updater.quitAndInstall(true, true);
        return this.current;
      } catch (error) {
        if (this.current.phase === "error" && this.current.failedOperation === "install") return this.current;
        return this.setState(this.failure(error, "install"));
      }
    }).finally(() => {
      this.installOperation = void 0;
    });
    return this.installOperation;
  }
  /** Remove owned listeners and prevent pending library operations from publishing into closed UI. */
  dispose() {
    this.disposed = true;
    this.updater.off("download-progress", this.onProgress);
    this.updater.off("update-downloaded", this.onDownloaded);
    void Promise.allSettled([this.checkOperation, this.downloadOperation, this.installOperation]).then(() => {
      this.updater.off("error", this.onError);
    });
  }
  assertLive() {
    if (this.disposed) throw new Error("desktop update: coordinator is disposed");
  }
  setState(state) {
    if (!this.disposed) {
      this.current = state;
      this.publish(state);
    }
    return state;
  }
  failure(error, failedOperation) {
    return {
      phase: "error",
      ...this.target(),
      failedOperation,
      message: error instanceof Error ? error.message : String(error),
      ...error instanceof DesktopUpdatePreparationError ? {
        preparationFailure: error.kind,
        ...error.technicalDetails === void 0 ? {} : { technicalDetails: error.technicalDetails }
      } : {}
    };
  }
  target() {
    return this.candidate === void 0 ? {} : { version: this.candidate };
  }
  async doCheck() {
    try {
      this.assertLive();
      if (!this.enabled()) throw new Error("desktop update: this application has no packaged update source");
      const result = await this.updater.checkForUpdates();
      if (result === null) throw new Error("desktop update: no check result was returned");
      const version = result.updateInfo.version;
      if (valid3(version) === null) throw new Error("desktop update: feed version is invalid");
      this.candidate = result.isUpdateAvailable && gt(version, this.currentVersion()) ? version : void 0;
      return this.setState(this.candidate === void 0 ? { phase: "idle" } : { phase: "available", version });
    } catch (error) {
      return this.failure(error, "check");
    }
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/command-management.ts
import { execFile } from "node:child_process";
import { isAbsolute as isAbsolute3, join as join6, normalize, win32 } from "node:path";
import { userInfo } from "node:os";
import { promisify as promisify2 } from "node:util";
var CommandWorkerError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
  code;
};
function object(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseState(value, platform) {
  if (!object(value) || typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(value.fingerprint) || typeof value.managed !== "boolean" || typeof value.available !== "boolean") throw new Error("Invalid command-manager response.");
  const destination = platform === "win32" && typeof value.directory === "string" ? join6(value.directory, "dsh.cmd") : value.destination;
  const launcher = platform === "win32" ? destination : value.launcher;
  if (typeof destination !== "string" || !isAbsolute3(destination) || typeof launcher !== "string" || !isAbsolute3(launcher)) {
    throw new Error("Invalid command-manager locations.");
  }
  for (const name of ["target", "activeCommand", "backup", "preservedBackup"]) {
    if (value[name] !== void 0 && value[name] !== null && typeof value[name] !== "string") throw new Error("Invalid command-manager detail.");
  }
  return {
    fingerprint: value.fingerprint,
    managed: value.managed,
    available: value.available,
    destination,
    launcher,
    occupied: platform === "win32" ? typeof value.activeCommand === "string" : value.kind !== "missing",
    ...typeof value.target === "string" ? { target: value.target } : {},
    ...typeof value.activeCommand === "string" ? { activeCommand: value.activeCommand } : {},
    ...typeof value.backup === "string" ? { backup: value.backup } : {},
    ...typeof value.preservedBackup === "string" ? { preservedBackup: value.preservedBackup } : {}
  };
}
function format(text2, path) {
  return text2.replace("{path}", path);
}
function sameCommand(left, right, platform) {
  return platform === "win32" ? win32.normalize(left).toLowerCase() === win32.normalize(right).toLowerCase() : normalize(left) === normalize(right);
}
function presentCommandManagement(state, messages, platform) {
  const other = state.activeCommand !== void 0 && !sameCommand(state.activeCommand, state.destination, platform);
  const detail = [
    format(messages.cliCommandLocation, state.destination),
    ...state.activeCommand === void 0 ? [] : [format(messages.cliCommandSelected, state.activeCommand)],
    ...state.target === void 0 ? [] : [format(messages.cliCommandTarget, state.target)],
    ...other ? [messages.cliCommandShadowed] : [],
    ...state.selectionUnknown ? [messages.cliCommandSelectionUnknown] : []
  ].join("\n\n");
  return {
    type: other ? "warning" : "info",
    title: messages.cliCommandTitle,
    message: state.managed ? state.available ? messages.cliCommandInstalled : messages.cliCommandBroken : messages.cliCommandNotInstalled,
    detail,
    buttons: state.managed ? [messages.cliCommandClose, messages.cliCommandRepair, messages.cliCommandRemove] : [messages.cliCommandInstall, messages.cancel],
    defaultId: 0,
    cancelId: state.managed ? 0 : 1
  };
}
async function shellCommand() {
  const shell4 = userInfo().shell;
  if (shell4 === null) return { selectionUnknown: true };
  const script = "printf '\\0DSH_COMMAND\\0'; command -v dsh; printf '\\0'";
  const { stdout } = await promisify2(execFile)(shell4, ["-ilc", script], { timeout: 5e3, maxBuffer: 65536 });
  const value = stdout.split("\0DSH_COMMAND\0")[1]?.split("\0")[0]?.trim();
  if (value === void 0) return { selectionUnknown: true };
  if (value === "") return {};
  return isAbsolute3(value) && !/[\r\n]/u.test(value) ? { activeCommand: value } : { selectionUnknown: true };
}
var DesktopCommandManager = class {
  /** @param options - Installed resources and shell-owned UI callbacks. */
  constructor(options) {
    this.options = options;
  }
  options;
  operation;
  /** Open or join the command-management operation. */
  show() {
    return this.operation ??= this.run().finally(() => {
      this.operation = void 0;
    });
  }
  /** Wait for a command operation already started by the user. */
  async idle() {
    await this.operation;
  }
  async worker(operation, expected, elevated = false) {
    const node = join6(this.options.resources, "runtime", "primary-runtime", "dependencies", "node", "bin", process.platform === "win32" ? "node.exe" : "node");
    const entry = join6(this.options.resources, "runtime", "cli", "command-manager.js");
    let stdout;
    try {
      if (elevated) {
        const appleScript = 'on run argv\nset cmd to "/usr/bin/env -i " & quoted form of (item 1 of argv) & " " & quoted form of (item 2 of argv) & " " & quoted form of (item 3 of argv) & " " & quoted form of (item 4 of argv)\ndo shell script cmd with administrator privileges\nend run';
        stdout = (await promisify2(execFile)(
          "/usr/bin/osascript",
          ["-e", appleScript, node, entry, operation, expected ?? ""],
          { maxBuffer: 65536 }
        )).stdout;
      } else {
        const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/KEY|SECRET|TOKEN|PASSWORD|^NODE_OPTIONS$|^NODE_PATH$/iu.test(name)));
        stdout = (await promisify2(execFile)(
          node,
          [entry, operation, ...expected === void 0 ? [] : [expected]],
          { timeout: 3e4, maxBuffer: 65536, windowsHide: true, env }
        )).stdout;
      }
    } catch (error) {
      if (elevated && object(error) && typeof error.stderr === "string" && /\(-128\)\s*$/u.test(error.stderr)) {
        throw new CommandWorkerError("ECANCELED", "Command authorization was cancelled.");
      }
      if (object(error) && typeof error.stdout === "string" && error.stdout.trim().startsWith("{")) stdout = error.stdout;
      else throw new CommandWorkerError("EIO", "Command-manager process failed.");
    }
    const response = JSON.parse(stdout.trim());
    if (!object(response) || typeof response.ok !== "boolean") throw new Error("Invalid command-manager response.");
    if (!response.ok) {
      const code = typeof response.code === "string" ? response.code : "EIO";
      if (!elevated && process.platform === "darwin" && operation !== "inspect" && ["EACCES", "EPERM"].includes(code)) {
        return this.worker(operation, expected, true);
      }
      throw new CommandWorkerError(code, typeof response.message === "string" ? response.message : "Command management failed.");
    }
    return parseState(response.state, process.platform);
  }
  async inspect() {
    const state = await this.worker("inspect");
    if (process.platform !== "darwin") return state;
    try {
      return { ...state, ...await shellCommand() };
    } catch {
      return { ...state, selectionUnknown: true };
    }
  }
  async run() {
    const messages = this.options.messages();
    if (!this.options.isPackaged || !this.options.isInstalledLocation()) {
      await this.options.show({ type: "info", title: messages.cliCommandTitle, message: messages.cliCommandInstallApp, buttons: [messages.cliCommandClose] });
      return;
    }
    if (this.options.isInstalling()) {
      await this.options.show({ type: "info", title: messages.cliCommandTitle, message: messages.cliCommandUpdating, buttons: [messages.cliCommandClose] });
      return;
    }
    try {
      const state = await this.inspect();
      const choice = await this.options.show(presentCommandManagement(state, messages, process.platform));
      if (this.options.isQuitting()) return;
      const operation = state.managed ? choice.response === 1 ? "install" : choice.response === 2 ? "remove" : void 0 : choice.response === 0 ? "install" : void 0;
      if (operation === void 0) return;
      const ownsSelection = state.managed && (state.activeCommand === void 0 || sameCommand(state.activeCommand, state.destination, process.platform));
      if (operation === "install" && (state.selectionUnknown || !ownsSelection && (state.occupied || state.activeCommand !== void 0))) {
        const confirmation = await this.options.show({
          type: "warning",
          title: messages.cliCommandTitle,
          message: messages.cliCommandSwitch,
          detail: (state.selectionUnknown ? messages.cliCommandSelectionUnknown : format(messages.cliCommandSelected, state.activeCommand ?? state.destination)) + "\n\n" + messages.cliCommandPreserve,
          buttons: [messages.cliCommandContinue, messages.cancel],
          defaultId: 1,
          cancelId: 1
        });
        if (confirmation.response !== 0 || this.options.isQuitting()) return;
      }
      const result = await this.worker(operation, state.fingerprint);
      if (this.options.isQuitting()) return;
      const current = await this.inspect();
      const shadowed = current.activeCommand !== void 0 && !sameCommand(current.activeCommand, current.destination, process.platform);
      await this.options.show({
        type: shadowed && operation === "install" ? "warning" : "info",
        title: messages.cliCommandTitle,
        message: operation === "remove" ? messages.cliCommandRemoved : messages.cliCommandInstalled,
        detail: [
          operation === "install" ? messages.cliCommandNewTerminal : state.backup !== void 0 && state.managed ? messages.cliCommandPreviousRestored : messages.cliCommandOtherKept,
          ...shadowed && operation === "install" && current.activeCommand !== void 0 ? [format(messages.cliCommandSelected, current.activeCommand), messages.cliCommandShadowed] : [],
          ...current.selectionUnknown && operation === "install" ? [messages.cliCommandSelectionUnknown] : [],
          ...result.preservedBackup === void 0 ? [] : [format(messages.cliCommandBackupKept, result.preservedBackup)]
        ].join("\n\n"),
        buttons: [messages.cliCommandClose]
      });
    } catch (error) {
      if (this.options.isQuitting()) return;
      const code = error instanceof CommandWorkerError ? error.code : "EIO";
      if (code === "ECANCELED") return;
      await this.options.show({
        type: "error",
        title: messages.cliCommandTitle,
        message: code === "ESTALE" ? messages.cliCommandChanged : code === "EOWNERSHIP" ? messages.cliCommandOwnershipError : messages.cliCommandFailed,
        technicalDetails: error instanceof Error ? error.message : "",
        buttons: [messages.cliCommandClose]
      });
    }
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/web-document.ts
import { readFile as readFile2 } from "node:fs/promises";
import { extname, resolve as resolve2, sep as sep2 } from "node:path";
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon"
};
var BOOT = "<script>globalThis.__DSH_BOOT_READY__ = Promise.withResolvers()</script>";
async function serveWebDocument(request, root) {
  if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405 });
  const url = new URL(request.url);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response(null, { status: 400 });
  }
  const target = resolve2(root, "." + (pathname === "/" ? "/index.html" : pathname));
  const directory = resolve2(root);
  if (!target.startsWith(directory + sep2)) return new Response(null, { status: 403 });
  let body;
  try {
    body = await readFile2(target);
  } catch (error) {
    if (error.code === "ENOENT") return new Response(null, { status: 404 });
    throw error;
  }
  const content = pathname === "/" || pathname === "/index.html" ? body.toString().replace("<head>", "<head>" + BOOT) : new Uint8Array(body);
  return new Response(request.method === "HEAD" ? null : content, {
    headers: { "content-type": MIME[extname(target)] ?? "application/octet-stream" }
  });
}
async function authenticateWebHost(url) {
  const response = await fetch(url, { redirect: "manual" });
  const cookie = response.headers.get("set-cookie");
  await response.body?.cancel();
  if (response.status !== 303 || cookie === null) throw new Error("Desktop Host authentication failed");
  const end = cookie.indexOf(";");
  return end < 0 ? cookie : cookie.slice(0, end);
}
var WITHHELD_RESPONSE_HEADERS = [
  "set-cookie",
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "te",
  "trailer",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization"
];
var PLUGIN_BUNDLE_PATH = /^\/plugins\//u;
async function forwardWebRequest(request, host, cookie, shutdown) {
  const closing = () => shutdown?.aborted === true;
  if (closing()) return new Response(null, { status: 503 });
  const source = new URL(request.url);
  const origin2 = request.headers.get("origin");
  if (origin2 !== null && origin2 !== "dsh-app://app") return new Response(null, { status: 403 });
  const target = new URL(host);
  target.pathname = source.pathname;
  target.search = source.search;
  const headers = new Headers(request.headers);
  for (const name of ["host", "origin", "cookie", "sec-fetch-site"]) headers.delete(name);
  headers.set("cookie", cookie);
  const init = { method: request.method, headers, body: request.body, signal: shutdown === void 0 ? request.signal : AbortSignal.any([request.signal, shutdown]), duplex: "half", redirect: "manual" };
  let response;
  try {
    response = await fetch(target, init);
  } catch (error) {
    if (closing()) return new Response(null, { status: 503 });
    throw error;
  }
  const outgoing = new Headers(response.headers);
  for (const name of WITHHELD_RESPONSE_HEADERS) outgoing.delete(name);
  if (PLUGIN_BUNDLE_PATH.test(source.pathname)) outgoing.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, headers: outgoing });
}

// sep-origin/alpha2-desktop/apps/desktop/src/fatal-recovery.ts
var CRASH_REPORT_WAIT_MS = 1e3;
var DETAIL_BUDGET = 1200;
var DETAIL_TAIL_LINES = 8;
function dialogDetail(error, messages, reportPath) {
  const advice = `

${messages.startupReinstallAdvice}`;
  const report = reportLine(messages, reportPath);
  const tail = error.split(/\r\n|[\n\r\u2028\u2029]/u).slice(-DETAIL_TAIL_LINES).join("\n");
  const budget = DETAIL_BUDGET - advice.length - report.length - messages.diagnosticTruncated.length - 1;
  const shortened = tail.slice(-budget).replace(/^[\uDC00-\uDFFF]/u, "");
  return `${shortened === error ? error : `${messages.diagnosticTruncated}
${shortened}`}${report}${advice}`;
}
function reportLine(messages, reportPath) {
  return reportPath === void 0 ? "" : `
${formatDesktopMessage(messages.reportWrittenTo, { path: reportPath })}`;
}
var DesktopFatalRecovery = class {
  /** @param operations - Native presentation, report persistence, and application-owned shutdown operations. */
  constructor(operations) {
    this.operations = operations;
  }
  operations;
  reported = false;
  /** Whether this process requires a native recovery action before further plugin changes. */
  get active() {
    return this.reported;
  }
  /**
   * Show the first fatal error; later reports cannot replace it or open another dialog.
   * The crash report is written first, bounded by {@link CRASH_REPORT_WAIT_MS}, so the dialog can name it;
   * a slow or failed write shows the dialog without a path.
   * @param error - Fatal failure, including nested diagnostic causes.
   * @param source - Where the failure surfaced, recorded in the report.
   * @returns Completion of the user's recovery action; duplicate reports resolve immediately.
   */
  async report(error, source) {
    if (this.reported) return;
    this.reported = true;
    const messages = this.operations.messages();
    const reportPath = await this.persist(error, source);
    let detail = desktopErrorState(error).message;
    let message = messages.fatalSummary;
    for (; ; ) {
      const addressInUse = /\blisten EADDRINUSE\b/u.test(detail);
      const { response } = await this.operations.show({
        type: "error",
        title: messages.startupFailed,
        message,
        detail: addressInUse ? `${messages.startupAddressInUse}${reportLine(messages, reportPath)}` : dialogDetail(detail, messages, reportPath),
        buttons: addressInUse || this.operations.canDisablePlugins?.() === false ? [messages.exitApplication, messages.restartApplication] : [messages.exitApplication, messages.restartApplication, messages.disableThirdPartyPlugins],
        defaultId: 1,
        cancelId: 0,
        noLink: true
      });
      if (response === 0) {
        try {
          await this.operations.stop();
        } catch (failure) {
          console.error(failure);
        }
        this.operations.exit();
        return;
      }
      try {
        await this.operations.stop();
        if (response === 2) {
          if (this.operations.canDisablePlugins?.() === false) throw new Error("SEP_CONTROLLED_RECOVERY_REQUIRED");
          await this.operations.disablePlugins();
        }
        this.operations.restart();
        return;
      } catch (failure) {
        console.error(failure);
        message = messages.recoveryOperationFailed;
        detail = desktopErrorState(failure).message;
      }
    }
  }
  async persist(error, source) {
    let timer;
    try {
      return await Promise.race([
        this.operations.writeReport(error, source),
        new Promise((resolve3) => {
          timer = setTimeout(() => {
            resolve3(void 0);
          }, CRASH_REPORT_WAIT_MS);
        })
      ]);
    } catch (failure) {
      console.error("dsh desktop: crash report failed", failure);
      return void 0;
    } finally {
      clearTimeout(timer);
    }
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/crash-report.ts
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join as join7 } from "node:path";
import { inspect } from "node:util";
var CRASH_REPORT_PREFIX = "crash-";
var CRASH_REPORT_NAME = /^crash-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-(?:host|web-boot|renderer|main)\.log$/u;
var CRASH_REPORTS_RETAINED = 10;
var RENDERER_CONSOLE_MAX_BYTES = 64 * 1024;
var ERROR_SECTION_MAX_CHARS = 256 * 1024;
var RendererConsoleTail = class {
  /** @param maxBytes - retained byte cap across all lines. */
  constructor(maxBytes = RENDERER_CONSOLE_MAX_BYTES) {
    this.maxBytes = maxBytes;
  }
  maxBytes;
  lines = [];
  bytes = 0;
  /**
   * Append one console line.
   * @param line - the formatted console message.
   */
  push(line) {
    this.lines.push(line);
    this.bytes += Buffer.byteLength(line);
    while (this.lines.length > 1 && this.bytes > this.maxBytes) {
      this.bytes -= Buffer.byteLength(this.lines.shift());
    }
  }
  /** @returns the retained lines, oldest first. */
  snapshot() {
    return [...this.lines];
  }
};
function crashReportFileName(time, source) {
  return `${CRASH_REPORT_PREFIX}${time.toISOString().replaceAll(/[:.]/gu, "-")}-${source}.log`;
}
function renderCrashReport(input) {
  const header = [
    `time: ${input.time.toISOString()}`,
    `source: ${input.source}`,
    `phase: ${input.phase}`,
    `app: ${input.app.name} ${input.app.version}`,
    `platform: ${input.app.platform} ${input.app.arch}`,
    `electron: ${input.app.electron}`,
    `node: ${input.app.node}`,
    `locale: ${input.app.locale}`,
    `shell pid: ${String(process.pid)}`
  ];
  const consoleSection = input.rendererConsole.length === 0 ? "(no error-level renderer console output was captured)" : input.rendererConsole.join("\n");
  return [
    header.join("\n"),
    "",
    "--- error ---",
    boundedErrorSection(input.error),
    "",
    ...input.hostDiagnostic === void 0 ? [] : ["--- host diagnostic (as reported by the Host process) ---", input.hostDiagnostic, ""],
    "--- renderer console (error level, oldest first) ---",
    consoleSection,
    ""
  ].join("\n");
}
function boundedErrorSection(error) {
  const rendered = inspect(error, { depth: 6, maxStringLength: 64 * 1024, maxArrayLength: 100, breakLength: 120 });
  return rendered.length <= ERROR_SECTION_MAX_CHARS ? rendered : `${rendered.slice(0, ERROR_SECTION_MAX_CHARS)}
\u2026 (error section cut at ${String(ERROR_SECTION_MAX_CHARS)} characters)`;
}
async function writeCrashReport(directory, input) {
  const path = join7(directory, crashReportFileName(input.time, input.source));
  try {
    await mkdir(directory, { recursive: true, mode: 448 });
    await writeFile(path, renderCrashReport(input), { mode: 384, flag: "wx" });
    return path;
  } catch (error) {
    console.error("dsh desktop: crash report could not be written", path, error);
    return void 0;
  }
}
async function pruneCrashReports(directory, retained = CRASH_REPORTS_RETAINED) {
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error.code === "ENOENT") return;
    console.error("dsh desktop: crash report directory could not be listed", directory, error);
    return;
  }
  const reports = names.filter((name) => CRASH_REPORT_NAME.test(name)).sort();
  const excess = reports.slice(0, Math.max(0, reports.length - retained));
  for (const name of excess) {
    try {
      await unlink(join7(directory, name));
    } catch (error) {
      console.error("dsh desktop: stale crash report could not be removed", join7(directory, name), error);
    }
  }
}

// sep-origin/alpha2-desktop/apps/desktop/src/welcome-window.ts
import { join as join8 } from "node:path";
import { fileURLToPath } from "node:url";
import { app as app2, BrowserWindow, ipcMain as ipcMain2 } from "electron";

// sep-origin/alpha2-desktop/apps/desktop/src/welcome-api.ts
var WELCOME_IPC = {
  saveApiKey: "dsh-welcome:save-api-key",
  analytics: "dsh-welcome:analytics",
  analyticsEnabled: "dsh-welcome:analytics-enabled",
  skip: "dsh-welcome:skip",
  start: "dsh-welcome:start",
  cancel: "dsh-welcome:cancel",
  copyLink: "dsh-welcome:copy-link",
  state: "dsh-welcome:state",
  takeNotice: "dsh-welcome:take-notice"
};
function needsWelcome(authentication) {
  return !authentication.loggedIn && !authentication.hasApiKey;
}

// sep-origin/alpha2-desktop/apps/desktop/src/welcome-window.ts
function welcomeWindowOptions(platform, locale) {
  return {
    width: 600,
    height: 700,
    useContentSize: true,
    center: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: locale.messages.welcomeTitle,
    backgroundColor: platform === "darwin" || platform === "win32" ? "#00000000" : "#FFFFFF",
    ...platform === "darwin" ? {
      titleBarStyle: "hidden",
      trafficLightPosition: { x: 21, y: 21 },
      vibrancy: "menu",
      visualEffectState: "active"
    } : {},
    ...platform === "win32" ? {
      titleBarStyle: "hidden",
      titleBarOverlay: { color: "#00000000", symbolColor: "#0F1115", height: 42 },
      backgroundMaterial: "acrylic"
    } : {},
    webPreferences: {
      preload: fileURLToPath(new URL("./preload-welcome.cjs", import.meta.url)),
      additionalArguments: [`--dsh-welcome-locale=${locale.id}`],
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  };
}
var disposeActiveHandlers;
async function openWelcomeWindow(locale, operations) {
  const options = welcomeWindowOptions(process.platform, locale);
  const window = new BrowserWindow(options);
  disposeActiveHandlers?.();
  let active = true;
  const disposeHandlers = () => {
    if (!active) return;
    active = false;
    for (const channel of [
      WELCOME_IPC.analyticsEnabled,
      WELCOME_IPC.analytics,
      WELCOME_IPC.takeNotice,
      WELCOME_IPC.saveApiKey,
      WELCOME_IPC.skip,
      WELCOME_IPC.start,
      WELCOME_IPC.cancel,
      WELCOME_IPC.copyLink
    ]) {
      ipcMain2.removeHandler(channel);
    }
    disposeActiveHandlers = void 0;
  };
  disposeActiveHandlers = disposeHandlers;
  const assertSender = (event) => {
    if (!active || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error("desktop welcome: rejected action from an unowned frame");
    }
  };
  ipcMain2.handle(WELCOME_IPC.analyticsEnabled, (event) => {
    assertSender(event);
    return operations.analyticsEnabled();
  });
  ipcMain2.handle(WELCOME_IPC.analytics, async (event, eventName, attributes) => {
    assertSender(event);
    if (typeof attributes !== "object" || attributes === null || Array.isArray(attributes)) throw new Error("desktop welcome: invalid analytics attributes");
    if (eventName === "auth_page_click" && "button_name" in attributes && Object.keys(attributes).length === 1 && (attributes.button_name === "sign_in" || attributes.button_name === "api-key")) {
      await operations.analytics?.(eventName, { button_name: attributes.button_name });
    } else if ((eventName === "auth_page_view" || eventName === "api_key_save_click") && Object.keys(attributes).length === 0) {
      await operations.analytics?.(eventName, {});
    } else throw new Error("desktop welcome: invalid analytics event");
  });
  ipcMain2.handle(WELCOME_IPC.takeNotice, async (event) => {
    assertSender(event);
    return operations.takeNotice();
  });
  ipcMain2.handle(WELCOME_IPC.saveApiKey, async (event, value) => {
    assertSender(event);
    if (typeof value !== "string" || !/^[\x21-\x7e]+$/.test(value)) return { ok: false };
    return operations.saveApiKey(value);
  });
  ipcMain2.handle(WELCOME_IPC.skip, async (event) => {
    assertSender(event);
    await operations.skip();
  });
  ipcMain2.handle(WELCOME_IPC.start, async (event) => {
    assertSender(event);
    return operations.startSignIn();
  });
  ipcMain2.handle(WELCOME_IPC.cancel, async (event, id) => {
    assertSender(event);
    if (typeof id !== "string") throw new Error("desktop welcome: invalid attempt");
    return operations.cancelSignIn(id);
  });
  ipcMain2.handle(WELCOME_IPC.copyLink, async (event, id) => {
    assertSender(event);
    if (typeof id !== "string") throw new Error("desktop welcome: invalid attempt");
    return operations.copySignInLink(id);
  });
  window.once("closed", disposeHandlers);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  try {
    await window.loadFile(join8(app2.getAppPath(), "renderer", "welcome.html"));
  } catch (error) {
    disposeHandlers();
    if (!window.isDestroyed()) window.destroy();
    throw error;
  }
  if (active && !window.isDestroyed()) {
    window.show();
    void operations.analytics?.("auth_page_view", {});
  }
  return window;
}

// sep-origin/alpha2-desktop/apps/desktop/src/welcome-backend.ts
import { randomUUID as randomUUID3 } from "node:crypto";

// sep-origin/alpha2-desktop/apps/desktop/src/account-backend.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import WebSocket from "ws";
import { parseRemoteStreamServerMessage, REMOTE_STREAM_MUX_PATH } from "@deepseek-ai/dsh-api-gateway/stream-protocol";
function accountView(value) {
  if (typeof value !== "object" || value === null || !("status" in value) || !["signed-out", "credential-stored"].includes(String(value.status)) || !("attempt" in value)) {
    throw new Error("desktop account: invalid state");
  }
  if (!("links" in value) || typeof value.links !== "object" || value.links === null || !("usageUrl" in value.links) || typeof value.links.usageUrl !== "string" || !("topUpUrl" in value.links) || typeof value.links.topUpUrl !== "string") {
    throw new Error("desktop account: invalid platform links");
  }
  validateBrowserDestination(value.links.usageUrl);
  validateBrowserDestination(value.links.topUpUrl);
  const attempt = value.attempt;
  if (attempt !== null && (typeof attempt !== "object" || !("id" in attempt) || typeof attempt.id !== "string" || !("phase" in attempt) || !["initializing", "waiting-browser", "exchanging", "committing", "succeeded", "cancelled", "expired", "failed"].includes(String(attempt.phase)) || "authorizeUrl" in attempt && typeof attempt.authorizeUrl !== "string" || "expiresAt" in attempt && (typeof attempt.expiresAt !== "number" || !Number.isFinite(attempt.expiresAt)) || "errorCode" in attempt && !["no-response", "network", "protocol", "expired", "storage"].includes(String(attempt.errorCode)))) {
    throw new Error("desktop account: invalid attempt");
  }
  if (attempt !== null && "authorizeUrl" in attempt) {
    validateBrowserDestination(String(attempt.authorizeUrl));
  }
  const parsed = value;
  return {
    status: parsed.status,
    links: { usageUrl: parsed.links.usageUrl, topUpUrl: parsed.links.topUpUrl },
    attempt: parsed.attempt === null ? null : {
      id: parsed.attempt.id,
      phase: parsed.attempt.phase,
      ...parsed.attempt.authorizeUrl === void 0 ? {} : { authorizeUrl: parsed.attempt.authorizeUrl },
      ...parsed.attempt.expiresAt === void 0 ? {} : { expiresAt: parsed.attempt.expiresAt },
      ...parsed.attempt.errorCode === void 0 ? {} : { errorCode: parsed.attempt.errorCode }
    }
  };
}
function validateBrowserDestination(value) {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || !(url.protocol === "https:" || loopback && url.protocol === "http:")) {
    throw new Error("desktop account: invalid browser destination");
  }
}
function desktopAccountBackend(origin2, invoke, cookies) {
  const call = async (method, args = {}) => accountView(await invoke({ namespace: "account", method, args }));
  return {
    state: () => call("getState"),
    start: (client) => call("startSignIn", { client, callbackOrigin: new URL(origin2).origin, loginSource: "desktop" }),
    cancel: (attemptId) => call("cancelSignIn", { attemptId }),
    signOut: (client) => call("signOut", { client }),
    watch(listener, failed, expired, onAnalyticsEnabledChanged) {
      let closed = false;
      let socket;
      let retry;
      const connect = () => {
        const streamId = randomUUID2();
        const expiryStreamId = randomUUID2();
        const analyticsPolicyStreamId = randomUUID2();
        void cookies().then((cookie) => {
          if (closed) return;
          const url = new URL(REMOTE_STREAM_MUX_PATH, origin2);
          url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
          socket = new WebSocket(url, { headers: { cookie, origin: origin2 }, maxPayload: 65536 });
          socket.on("open", () => {
            if (onAnalyticsEnabledChanged !== void 0) socket?.send(JSON.stringify({ type: "open", streamId: analyticsPolicyStreamId, endpoint: "productAnalytics/watchPolicy", payload: { args: {} } }));
            socket?.send(JSON.stringify({ type: "open", streamId: expiryStreamId, endpoint: "account/watchExpiry", payload: { args: {} } }));
            socket?.send(JSON.stringify({ type: "open", streamId, endpoint: "account/watch", payload: { args: {} } }));
          });
          socket.on("message", (data) => {
            try {
              const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
              const frame = parseRemoteStreamServerMessage(bytes.toString("utf8"));
              if (frame.streamId === analyticsPolicyStreamId) {
                if (frame.type === "item" && typeof frame.value === "boolean") onAnalyticsEnabledChanged?.(frame.value);
                else onAnalyticsEnabledChanged?.(false);
                return;
              }
              if (frame.streamId === expiryStreamId && frame.type === "item" && frame.value === "session-expired") {
                expired();
                return;
              }
              if (frame.streamId !== streamId) throw new Error("desktop account: unexpected stream");
              if (frame.type === "item") listener(accountView(frame.value));
              else socket?.close();
            } catch {
              socket?.close();
            }
          });
          socket.on("error", () => {
            socket?.close();
          });
          socket.on("close", () => {
            if (!closed) {
              onAnalyticsEnabledChanged?.(false);
              failed();
              retry = setTimeout(connect, 1e3);
            }
          });
        }).catch(() => {
          if (!closed) {
            onAnalyticsEnabledChanged?.(false);
            failed();
            retry = setTimeout(connect, 1e3);
          }
        });
      };
      connect();
      return () => {
        closed = true;
        onAnalyticsEnabledChanged?.(false);
        clearTimeout(retry);
        socket?.close();
      };
    }
  };
}

// sep-origin/alpha2-desktop/apps/desktop/src/welcome-backend.ts
function record2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function connectDesktopWelcome(authenticatedUrl, send, cookies = () => Promise.resolve("")) {
  const origin2 = new URL(authenticatedUrl).origin;
  const authenticated = await send(authenticatedUrl, { credentials: "include" });
  await authenticated.body?.cancel();
  if (!authenticated.ok) throw new Error("desktop welcome: Web authentication failed");
  const invoke = async (request, signal) => {
    const rpcId = randomUUID3();
    const method = `${request.namespace}/${request.method}`;
    const response = await send(new URL(`/api/${method}`, origin2).href, {
      method: "POST",
      credentials: "include",
      redirect: "error",
      ...signal === void 0 ? {} : { signal },
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId, method, payload: { args: request.args } })
    });
    if (!response.ok) throw new Error("desktop welcome: Web request failed");
    const envelope = await response.json();
    if (!record2(envelope) || envelope.type !== "server-response" || envelope.rpcId !== rpcId || !record2(envelope.result) || envelope.result.ok !== true) {
      throw new Error("desktop welcome: Web RPC failed");
    }
    return envelope.result.value;
  };
  const account = desktopAccountBackend(origin2, invoke, cookies);
  const settingsAndReference = async () => {
    const settings = await invoke({ namespace: "settings", method: "describe", args: {} });
    if (!record2(settings) || !Array.isArray(settings.namespaces)) throw new Error("desktop welcome: missing settings namespaces");
    const official = settings.namespaces.find((item) => record2(item) && item.ns === "llm-deepseek");
    if (official === void 0) return { settings: { namespaces: settings.namespaces }, ref: void 0 };
    if (!record2(official) || !record2(official.value) || typeof official.value.apiKeyEnv !== "string") {
      throw new Error("desktop welcome: missing official DeepSeek credential reference");
    }
    return { settings: { namespaces: settings.namespaces }, ref: official.value.apiKeyEnv };
  };
  const localePreference = (namespaces) => {
    const locale = namespaces.find((item) => record2(item) && item.ns === "locale");
    if (!record2(locale) || !record2(locale.value) || locale.value.preference !== void 0 && typeof locale.value.preference !== "string") {
      throw new Error("desktop welcome: invalid locale preference");
    }
    return locale.value.preference ?? null;
  };
  const read = async () => {
    const { settings, ref } = await settingsAndReference();
    const providers = await invoke({ namespace: "llm", method: "listConfigurableProviders", args: {} });
    if (!Array.isArray(providers)) throw new Error("desktop welcome: invalid provider directory");
    const namespaces = settings.namespaces;
    const refs = providers.flatMap((provider) => {
      if (!record2(provider) || typeof provider.settingsNs !== "string" || !Array.isArray(provider.settingsPath)) {
        throw new Error("desktop welcome: invalid provider settings address");
      }
      const namespace = namespaces.find((item) => record2(item) && item.ns === provider.settingsNs);
      let value = record2(namespace) ? namespace.value : void 0;
      for (const key2 of provider.settingsPath) {
        if (typeof key2 !== "string") throw new Error("desktop welcome: invalid provider settings path");
        value = record2(value) ? value[key2] : void 0;
      }
      return record2(value) && typeof value.apiKeyEnv === "string" ? [value.apiKeyEnv] : [];
    });
    const unique = [.../* @__PURE__ */ new Set([...ref === void 0 ? [] : [ref], ...refs])];
    const states = {};
    for (let offset = 0; offset < unique.length; offset += 64) {
      const batch = await invoke({ namespace: "credentials", method: "describe", args: { refs: unique.slice(offset, offset + 64) } });
      if (!record2(batch)) throw new Error("desktop welcome: invalid credential metadata");
      Object.assign(states, batch);
    }
    if (ref !== void 0 && !record2(states[ref])) throw new Error("desktop welcome: missing credential metadata");
    return {
      loggedIn: (await account.state()).status === "credential-stored",
      hasApiKey: Object.values(states).some((value) => record2(value) && value.configured === true),
      writable: ref !== void 0 && record2(states[ref]) && states[ref].writable === true,
      localePreference: localePreference(namespaces)
    };
  };
  return {
    account,
    read,
    async analyticsEnabled() {
      const enabled = await invoke({ namespace: "productAnalytics", method: "enabled", args: {} }, AbortSignal.timeout(1e3));
      if (typeof enabled !== "boolean") throw new Error("desktop analytics: invalid collection policy");
      return enabled;
    },
    async report(event) {
      await invoke({ namespace: "productAnalytics", method: "report", args: { event } }, AbortSignal.timeout(1e3));
    },
    async readLocalePreference() {
      const settings = await invoke({ namespace: "settings", method: "describe", args: {} });
      if (!record2(settings) || !Array.isArray(settings.namespaces)) throw new Error("desktop welcome: missing settings namespaces");
      return localePreference(settings.namespaces);
    },
    async save(apiKey) {
      if (!/^[\x21-\x7e]+$/.test(apiKey)) return { ok: false };
      try {
        const { ref } = await settingsAndReference();
        if (ref === void 0) return { ok: false };
        await invoke({ namespace: "credentials", method: "set", args: { ref, value: apiKey } });
        return { ok: true };
      } catch {
        return { ok: false };
      }
    }
  };
}

// sep-origin/alpha2-desktop/apps/desktop/src/update-journal.ts
import { randomUUID as randomUUID4 } from "node:crypto";
import { appendFileSync, mkdirSync as mkdirSync2, writeFileSync as writeFileSync3 } from "node:fs";
import { isAbsolute as isAbsolute4, join as join9 } from "node:path";
var ERROR_CODES = [
  "ETIMEDOUT",
  "ENOSPC",
  "ERR_INTERNET_DISCONNECTED",
  "ERR_CONNECTION_RESET",
  "ERR_CONNECTION_CLOSED",
  "ERR_NAME_NOT_RESOLVED",
  "ERR_UPDATER_INVALID_SIGNATURE",
  "ERR_UPDATER_CHECKSUM_MISMATCH"
];
function desktopUpdateJournalState(state) {
  return {
    phase: state.phase,
    ...state.version !== void 0 ? { targetVersion: state.version } : {},
    ...state.phase === "downloading" && state.percent !== void 0 ? { percent: Math.floor(state.percent) } : {},
    ...state.phase === "error" ? {
      failedOperation: state.failedOperation,
      errorCode: ERROR_CODES.find((code) => state.message?.includes(code)) ?? "UNCLASSIFIED"
    } : {}
  };
}
var DesktopUpdateJournal = class {
  /**
   * @param directory Absolute evidence directory, retained across installs; creation errors stop qualification.
   * @param version Installed application version, not a version supplied by the feed.
   */
  constructor(directory, version) {
    this.version = version;
    if (!isAbsolute4(directory)) throw new Error("desktop update journal: directory must be absolute");
    mkdirSync2(directory, { recursive: true });
    this.path = join9(directory, `${Date.now()}-${randomUUID4()}.jsonl`);
    writeFileSync3(this.path, "", { flag: "wx", mode: 384, flush: true });
    this.action("started");
  }
  version;
  path;
  sequence = 0;
  previousState;
  /**
   * Append a fixed action; failures propagate so incomplete qualification is never reported as traced.
   * @param action Update operation or process milestone; no free-text fields are accepted.
   * @returns Nothing after the record has been flushed.
   */
  action(action) {
    this.append({ event: action });
  }
  /**
   * Retain state changes and integer progress increments without raw errors, URLs, or request data.
   * @param state Main-process-owned update state.
   * @returns Nothing after the changed state has been flushed; duplicate states add no record.
   */
  state(state) {
    const fields = desktopUpdateJournalState(state);
    const encoded = JSON.stringify(fields);
    if (encoded === this.previousState) return;
    this.append({ event: "state", ...fields });
    this.previousState = encoded;
  }
  append(fields) {
    appendFileSync(this.path, `${JSON.stringify({
      schemaVersion: 1,
      sequence: this.sequence++,
      time: (/* @__PURE__ */ new Date()).toISOString(),
      pid: process.pid,
      version: this.version,
      ...fields
    })}
`, { flush: true });
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/duration-env.ts
function resolveDurationMs(env, name, fallback) {
  const value = Number(env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1e3 || value > 2147483647) {
    throw new Error(`${name} must be an integer from 1000 through 2147483647`);
  }
  return value;
}

// sep-origin/alpha2-desktop/apps/desktop/src/update-schedule.ts
function resolveDesktopUpdateScheduleConfig(env) {
  const intervalMs = resolveDurationMs(env, "DSH_DESKTOP_UPDATE_CHECK_INTERVAL_MS", 6e5);
  const maxBackoffMs = resolveDurationMs(env, "DSH_DESKTOP_UPDATE_CHECK_MAX_BACKOFF_MS", Math.max(intervalMs, 36e5));
  const jitter = Number(env.DSH_DESKTOP_UPDATE_CHECK_JITTER ?? 0.2);
  if (!Number.isFinite(jitter) || jitter < 0 || jitter > 1 || maxBackoffMs < intervalMs) {
    throw new Error("desktop update: check jitter must be in [0, 1] and max backoff must cover the check interval");
  }
  return { intervalMs, maxBackoffMs, jitter };
}
var DesktopUpdateSchedule = class {
  /**
   * @param updates - Coordinator that joins network checks and retains prepared packages.
   * @param config - Validated polling options.
   * @param random - Instance-local uniform sample in [0, 1).
   * @param now - Monotonic milliseconds, independent of wall-clock corrections.
   */
  constructor(updates, config, random = Math.random, now = () => performance.now()) {
    this.updates = updates;
    this.config = config;
    this.random = random;
    this.now = now;
    this.delay = config.intervalMs;
  }
  updates;
  config;
  random;
  now;
  timer;
  pending;
  activeChecks = 0;
  disposed = false;
  nextCheck = -Infinity;
  delay;
  /**
   * Start immediately when due; explicit requests bypass the deadline and share in-flight work.
   * @param manual - Whether a check failure must be visible, including when joining an automatic request.
   * @param force - Whether policy arrival or explicit intent bypasses the automatic deadline.
   * @returns Current state when not due, otherwise the coordinator result. Disposal rejects new work.
   */
  async check(manual = false, force = manual) {
    if (this.disposed) throw new Error("desktop update: polling is disposed");
    if (this.pending !== void 0 && !manual) return this.pending;
    if (!force && this.now() < this.nextCheck) return this.updates.state;
    clearTimeout(this.timer);
    this.timer = void 0;
    this.activeChecks++;
    this.pending = Promise.resolve().then(() => {
      if (this.disposed) throw new Error("desktop update: polling is disposed");
      return this.updates.check(manual);
    }).then(
      (state) => {
        this.complete(state.phase === "error" && state.failedOperation === "check");
        return state;
      },
      (error) => {
        this.complete(true);
        throw error;
      }
    );
    return this.pending;
  }
  /** Stop timers and prevent late completion from rearming; the coordinator owns pending network teardown. */
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.timer = void 0;
  }
  complete(failed) {
    if (--this.activeChecks !== 0) return;
    this.pending = void 0;
    this.schedule(failed);
  }
  schedule(failed) {
    if (this.disposed) return;
    const { intervalMs, maxBackoffMs, jitter } = this.config;
    this.delay = failed ? Math.min(maxBackoffMs, this.delay * 2) : intervalMs;
    const lower = Math.max(1e3, this.delay * (1 - jitter));
    const upper = Math.min(maxBackoffMs, this.delay * (1 + jitter));
    const delay = Math.round(lower + (upper - lower) * this.random());
    this.nextCheck = this.now() + delay;
    this.timer = setTimeout(() => {
      void this.check(false, true).catch((error) => {
        console.error(error);
      });
    }, delay);
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/update-presentation.ts
var NETWORK_FAILURE = /\b(?:ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ETIMEDOUT)\b/u;
function desktopUpdateFailureKind(state) {
  if (state.failedOperation === "install" && state.preparationFailure !== void 0) return state.preparationFailure;
  const operation = state.failedOperation ?? "install";
  return NETWORK_FAILURE.test(state.message ?? "") ? `${operation}-network` : operation;
}
function desktopUpdateErrorSummary(state, messages) {
  const kind = desktopUpdateFailureKind(state);
  const summaries = {
    check: messages.updateCheckFailed,
    "check-network": messages.updateCheckNetworkFailed,
    download: messages.updateDownloadFailed,
    "download-network": messages.updateDownloadNetworkFailed,
    install: messages.updateInstallFailed,
    "install-network": messages.updateInstallNetworkFailed,
    "stop-failed": messages.updateStopFailed,
    "tasks-changed": messages.updateTasksChanged,
    "tasks-unavailable": messages.updateTasksUnavailable
  };
  return summaries[kind];
}
function presentDesktopUpdate(state) {
  return {
    phase: state.phase,
    ...state.version === void 0 ? {} : { version: state.version },
    ...state.percent === void 0 ? {} : { percent: Math.floor(state.percent) },
    ...state.phase === "error" ? { failure: desktopUpdateFailureKind(state) } : {}
  };
}

// sep-origin/alpha2-desktop/apps/desktop/src/login-shell-environment.ts
import { spawn as spawn2 } from "node:child_process";
import { homedir, userInfo as userInfo2 } from "node:os";
var DELIMITER = "_DSH_SHELL_ENV_DELIMITER_";
var MARKER = Buffer.from(`\0${DELIMITER}\0`);
var DUMP = `printf '\\0%s\\0' '${DELIMITER}'; command env -0 || exit; printf '\\0%s\\0' '${DELIMITER}'; exit`;
var FALLBACK_SHELLS = ["/bin/zsh", "/bin/bash", "/bin/sh"];
var PROBE_ENVIRONMENT = { DISABLE_AUTO_UPDATE: "true", ZSH_TMUX_AUTOSTARTED: "true", ZSH_TMUX_AUTOSTART: "false" };
var SHELL_SESSION_KEYS = /* @__PURE__ */ new Set(["PWD", "OLDPWD", "SHLVL", "_", ...Object.keys(PROBE_ENVIRONMENT)]);
var LAUNCHER_OWNED_PREFIXES = ["DSH_", "ELECTRON_"];
function resolveDesktopLoginShellConfig(env) {
  return { timeoutMs: resolveDurationMs(env, "DSH_DESKTOP_LOGIN_SHELL_TIMEOUT_MS", 1e4) };
}
function loginShellCandidates() {
  let account = null;
  try {
    account = userInfo2().shell;
  } catch (_error) {
  }
  return [.../* @__PURE__ */ new Set([...account === null || account === "" ? [] : [account], ...FALLBACK_SHELLS])];
}
function parseLoginShellOutput(stdout) {
  const parts = stdout.split("\0");
  const first = parts.indexOf(DELIMITER);
  const last = parts.lastIndexOf(DELIMITER);
  if (first === -1 || first === last) return void 0;
  const variables = {};
  for (const entry of parts.slice(first + 1, last)) {
    const separator = entry.indexOf("=");
    if (separator > 0) variables[entry.slice(0, separator)] = entry.slice(separator + 1);
  }
  return variables;
}
function mergeLoginShellEnvironment(base, shell4) {
  const merged = { ...base };
  for (const [key2, value] of Object.entries(shell4)) {
    if (SHELL_SESSION_KEYS.has(key2) || LAUNCHER_OWNED_PREFIXES.some((prefix) => key2.startsWith(prefix))) continue;
    merged[key2] = value;
  }
  return merged;
}
function readShell(shell4, base, cwd, timeoutMs, signal) {
  return new Promise((resolve3) => {
    if (signal?.aborted === true) {
      resolve3("aborted");
      return;
    }
    let child;
    try {
      child = spawn2(shell4, ["-ilc", DUMP], {
        cwd,
        env: { ...base, ...PROBE_ENVIRONMENT },
        stdio: ["ignore", "pipe", "ignore"],
        detached: true
      });
    } catch (error) {
      resolve3(String(error));
      return;
    }
    const chunks = [];
    let tail = Buffer.alloc(0);
    let markers = 0;
    const output = () => parseLoginShellOutput(Buffer.concat(chunks).toString("utf8")) ?? "unparsed";
    const onData = (chunk) => {
      chunks.push(chunk);
      const window = Buffer.concat([tail, chunk]);
      for (let index = window.indexOf(MARKER); index !== -1; index = window.indexOf(MARKER, index + MARKER.length)) markers++;
      tail = window.subarray(Math.max(0, window.length - MARKER.length + 1));
      if (markers >= 2) finish(output());
    };
    const killGroup = () => {
      const group = -child.pid;
      try {
        process.kill(group, "SIGKILL");
      } catch (_error) {
      }
    };
    const stop = (reason) => {
      finish(reason);
      killGroup();
    };
    const onAbort = () => {
      stop("aborted");
    };
    const timer = setTimeout(() => {
      stop("timeout");
    }, timeoutMs);
    function finish(result) {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      child.stdout.off("data", onData);
      child.stdout.resume();
      resolve3(result);
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", onData);
    child.on("error", (error) => {
      finish(error.message);
    });
    child.on("close", (code, closeSignal) => {
      if (code !== 0) {
        finish(closeSignal ?? `exit ${String(code)}`);
        return;
      }
      finish(output());
    });
  });
}
async function readDesktopLoginShellEnvironment(base, config, options = {}) {
  const { platform = process.platform, shells = loginShellCandidates(), signal } = options;
  if (platform === "win32") return { environment: base, failures: [] };
  const failures = [];
  for (const shell4 of shells) {
    const result = await readShell(shell4, base, homedir(), config.timeoutMs, signal);
    if (typeof result !== "string") return { environment: mergeLoginShellEnvironment(base, result), failures };
    failures.push({ shell: shell4, reason: result });
    if (result === "aborted") break;
  }
  return { environment: base, failures };
}

// sep-origin/alpha2-desktop/apps/desktop/src/mandatory-update-policy.ts
import { valid as valid4 } from "semver";
import { platformClientHeaders as platformClientHeaders2 } from "@deepseek-ai/dsh-deepseek-account";
function record3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function origin(value, local) {
  if (typeof value !== "string") throw new Error("desktop policy: origin must be a URL");
  const url = new URL(value);
  if (url.username !== "" || url.password !== "" || url.pathname !== "/" || url.search !== "" || url.hash !== "" || url.protocol !== "https:" && !(local && url.protocol === "http:" && url.hostname === "127.0.0.1")) {
    throw new Error("desktop policy: expected an HTTPS origin without credentials, path, query, or fragment");
  }
  return url.origin;
}
function resolveDesktopPolicyConfig(input, allowLoopback = false) {
  if (input === void 0) return void 0;
  const value = record3(input);
  if (value === void 0 || !Array.isArray(value.allowedPageOrigins) || value.allowedPageOrigins.length === 0) {
    throw new Error("desktop policy: configure origin and a nonempty allowedPageOrigins list");
  }
  const fields = value;
  function duration(key2, fallback) {
    const duration2 = fields[key2] ?? fallback;
    if (typeof duration2 !== "number" || !Number.isSafeInteger(duration2) || duration2 < 1e3 || duration2 > 2147483647) {
      throw new Error(`desktop policy: ${key2} must be an integer from 1000 through 2147483647`);
    }
    return duration2;
  }
  const intervalMs = duration("intervalMs", 6e5);
  const maxBackoffMs = duration("maxBackoffMs", 36e5);
  const jitter = value.jitter ?? 0.2;
  const authentication = value.authentication ?? "anonymous";
  if (authentication !== "anonymous" && authentication !== "feishu-test") {
    throw new Error("desktop policy: authentication must be anonymous or feishu-test");
  }
  const authOrigins = value.allowedAuthOrigins;
  if (authentication === "feishu-test" && (!Array.isArray(authOrigins) || authOrigins.length === 0)) {
    throw new Error("desktop policy: test authentication requires nonempty allowedAuthOrigins");
  }
  if (authentication === "anonymous" && authOrigins !== void 0) {
    throw new Error("desktop policy: anonymous policy must not configure allowedAuthOrigins");
  }
  if (typeof jitter !== "number" || !Number.isFinite(jitter) || jitter < 0 || jitter > 1 || maxBackoffMs < intervalMs) {
    throw new Error("desktop policy: jitter must be in [0, 1] and maxBackoffMs must cover intervalMs");
  }
  return {
    origin: origin(value.origin, authentication === "anonymous" && allowLoopback),
    allowedPageOrigins: value.allowedPageOrigins.map((item) => origin(item, false)),
    allowedAuthOrigins: authentication === "feishu-test" ? authOrigins.map((item) => origin(item, false)) : [],
    intervalMs,
    timeoutMs: duration("timeoutMs", 15e3),
    maxBackoffMs,
    jitter,
    authentication
  };
}
function desktopPolicyPage(value, allowedOrigins) {
  if (typeof value !== "string" || value.length > 2048) return void 0;
  let url;
  try {
    url = new URL(value);
  } catch {
    return void 0;
  }
  return url.protocol === "https:" && url.username === "" && url.password === "" && allowedOrigins.includes(url.origin) ? url.href : void 0;
}
function text(value, limit) {
  return typeof value === "string" && value.trim() !== "" && value.length <= limit ? value : void 0;
}
function parsePolicy(body, ok, config) {
  const root = record3(body);
  const data = record3(root?.data);
  if (root?.code === 40005) {
    const content = record3(data?.show_content);
    const title = text(content?.title, 256);
    const detail = text(content?.detail, 16384);
    const page3 = desktopPolicyPage(data?.desktop_app_link, config.allowedPageOrigins);
    return {
      blocking: true,
      checking: false,
      ...title === void 0 ? {} : { title },
      ...detail === void 0 ? {} : { detail },
      ...page3 === void 0 ? {} : { page: page3 }
    };
  }
  if (ok && root?.code === 0 && data?.biz_code === 0 && data.biz_data === null) return { blocking: false, checking: false };
  throw new Error("desktop policy: response does not contain a valid mandatory or no-force decision");
}
var DesktopMandatoryUpdatePolicy = class {
  /**
   * @param config - Resolved deployment settings.
   * @param identity - Installed software identity, fixed for this application build.
   * @param publish - Receives policy changes without controlling downloads or existing tasks.
   * @param request - Anonymous Fetch or the dedicated test-authentication Session transport.
   * @param client - UI build version, language, and UTC offset, sampled for every check.
   * @param random - Jitter source, replaceable for clock-driven tests.
   */
  constructor(config, identity, publish, request = fetch, client, random = Math.random) {
    this.config = config;
    this.identity = identity;
    this.publish = publish;
    this.request = request;
    this.client = client;
    this.random = random;
    if (valid4(this.client().version) === null || valid4(identity.bundledDshVersion) === null || identity.platform === "win32" && identity.arch !== "x64") throw new Error("desktop policy: invalid installed client identity");
  }
  config;
  identity;
  publish;
  request;
  client;
  random;
  current = { blocking: false, checking: false };
  pending;
  controller;
  timer;
  disposed = false;
  failures = 0;
  nextCheck = -Infinity;
  /** Platform headers for one check; the calling UI's language and UTC offset are read now. */
  requestHeaders() {
    return {
      ...platformClientHeaders2(this.identity.platform, this.client()),
      "x-client-arch": this.identity.arch,
      "x-client-update-channel": "nightly",
      "x-client-bundled-dsh-version": this.identity.bundledDshVersion
    };
  }
  /** Latest policy; failures never erase a known mandatory decision. */
  get state() {
    return this.current;
  }
  /**
   * Check immediately when manual, otherwise only when due; matching concurrent callers share one request.
   * @param scenario - Trigger recorded in the query, independent of backend matching.
   * @param manual - Bypass interval/backoff without bypassing request coalescing.
   * @returns Current decision or retained decision with an error; disposed instances reject.
   */
  check(scenario, manual = false) {
    if (this.disposed) return Promise.reject(new Error("desktop policy: disposed"));
    if (this.pending !== void 0) return this.pending;
    if (!manual && Date.now() < this.nextCheck) return Promise.resolve(this.current);
    clearTimeout(this.timer);
    this.pending = Promise.resolve().then(async () => {
      if (this.disposed) return this.current;
      const controller = new AbortController();
      this.controller = controller;
      const timeout = setTimeout(() => {
        controller.abort();
      }, this.config.timeoutMs);
      this.setState({ ...this.current, checking: true });
      try {
        const url = new URL("/api/v0/check_client_update", this.config.origin);
        url.searchParams.set("scenario", scenario);
        const response = await this.request(url, {
          headers: this.requestHeaders(),
          signal: controller.signal,
          credentials: this.config.authentication === "feishu-test" ? "include" : "omit",
          cache: "no-store",
          redirect: "error"
        });
        const body = await response.json();
        if (this.config.authentication === "feishu-test" && response.status === 401 && record3(record3(body)?.error)?.code === "UNAUTHENTICATED") {
          this.failures++;
          this.setState({ ...this.current, checking: false, error: "authentication-required" });
          return this.current;
        }
        const state = parsePolicy(body, response.ok, this.config);
        this.failures = 0;
        this.setState(state);
      } catch {
        this.failures++;
        this.setState({ ...this.current, checking: false, error: "unavailable" });
      } finally {
        clearTimeout(timeout);
        this.controller = void 0;
      }
      return this.current;
    }).finally(() => {
      this.pending = void 0;
      if (this.disposed) return;
      const base = Math.min(this.config.maxBackoffMs, this.config.intervalMs * 2 ** Math.min(this.failures, 20));
      const delay = Math.min(this.config.maxBackoffMs, Math.round(base * (1 + this.random() * this.config.jitter)));
      this.nextCheck = Date.now() + delay;
      this.timer = setTimeout(() => {
        void this.check("periodic");
      }, delay);
    });
    return this.pending;
  }
  /** Abort the owned request and await settlement; late responses cannot publish or schedule work. */
  async dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.controller?.abort();
    await this.pending;
  }
  setState(state) {
    if (this.disposed) return;
    this.current = state;
    this.publish(state);
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/mandatory-update-window.ts
import { app as app4, clipboard, ipcMain as ipcMain3, shell as shell2 } from "electron";

// sep-origin/alpha2-desktop/apps/desktop/src/mandatory-update-ipc.ts
var MANDATORY_IPC = {
  status: "dsh-desktop:mandatory-status",
  state: "dsh-desktop:mandatory-state",
  action: "dsh-desktop:mandatory-action"
};

// sep-origin/alpha2-desktop/apps/desktop/src/update-attention.ts
import { app as app3, Notification } from "electron";
var DesktopUpdateAttention = class {
  /**
   * @param locale - Shell-owned notification copy.
   * @param platform - Native attention implementation, replaceable for platform tests.
   */
  constructor(locale, platform = process.platform) {
    this.locale = locale;
    this.platform = platform;
  }
  locale;
  platform;
  version;
  notification;
  stop;
  /**
   * @param version - Prepared target whose confirmation is waiting.
   * @param parent - Taskbar window; never restored or focused by the reminder.
   * @param modal - Existing installation confirmation.
   * @param returnToConfirmation - Rechecks current policy and returns to UI without installing.
   */
  ready(version, parent, modal, returnToConfirmation) {
    if (this.version === version) return;
    this.version = version;
    if (parent.isFocused() || modal.isFocused()) return;
    const clear = () => {
      this.clear();
    };
    let bounce;
    parent.on("focus", clear);
    modal.on("focus", clear);
    this.stop = () => {
      parent.off("focus", clear);
      modal.off("focus", clear);
      if (this.platform === "win32" && !parent.isDestroyed()) parent.flashFrame(false);
      if (bounce !== void 0) app3.dock?.cancelBounce(bounce);
    };
    try {
      if (this.platform === "win32") parent.flashFrame(true);
      if (this.platform === "darwin") bounce = app3.dock?.bounce("informational");
    } catch (error) {
      console.warn("desktop update: attention unavailable", error);
    }
    try {
      if (!Notification.isSupported()) return;
      const notification = new Notification({
        title: this.locale.messages.mandatoryReady,
        body: this.locale.messages.mandatoryNotification,
        silent: true
      });
      this.notification = notification;
      notification.on("failed", () => {
        if (this.notification === notification) this.notification = void 0;
        notification.removeAllListeners();
      });
      notification.once("click", () => {
        if (this.notification !== notification) return;
        this.clear();
        returnToConfirmation();
      });
      notification.show();
    } catch (error) {
      console.warn("desktop update: notification unavailable", error);
    }
  }
  /** Release owned native reminders without scheduling another for the same target. */
  clear() {
    const notification = this.notification;
    this.notification = void 0;
    notification?.removeAllListeners();
    try {
      notification?.close();
    } catch (error) {
      console.warn("desktop update: could not close notification", error);
    }
    const stop = this.stop;
    this.stop = void 0;
    try {
      stop?.();
    } catch (error) {
      console.warn("desktop update: could not clear attention", error);
    }
  }
  /** Start a new download episode, or dispose all owned reminders. */
  reset() {
    this.clear();
    this.version = void 0;
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/mandatory-update-window.ts
var page = "dsh-app://shell/mandatory-update.html";
var DesktopMandatoryUpdateWindow = class {
  /** @param options - Main-process actions and immutable deployment/navigation settings. */
  constructor(options) {
    this.options = options;
    this.attention = new DesktopUpdateAttention(options.locale);
    this.embeddedParent = this.embedded ? options.parent() : void 0;
    this.embeddedParent?.webContents.on("did-finish-load", this.publishEmbedded);
    ipcMain3.handle(MANDATORY_IPC.status, (event) => {
      this.assertSender(event);
      return this.view();
    });
    ipcMain3.handle(MANDATORY_IPC.action, (event, action, version, confirmationRevision) => {
      this.assertSender(event);
      if (!this.options.policy().blocking) throw new Error("desktop policy: no mandatory decision is active");
      if (typeof action !== "string" || !["refresh", "download", "install", "later", "page", "copy"].includes(action)) throw new Error("desktop policy: invalid action");
      if (["download", "install", "later"].includes(action) && typeof version !== "string") throw new Error("desktop policy: missing confirmed version");
      if (action === "page" || action === "copy") return this.navigate(action);
      if (this.confirmation !== void 0 && (action === "install" || action === "later")) {
        if (version !== this.confirmation.version || confirmationRevision !== this.confirmation.revision) {
          throw new Error("desktop policy: stale installation confirmation");
        }
        if (action === "later" && !this.confirmation.active) throw new Error("desktop policy: no task deferral is offered");
        this.deferred = action === "later";
        this.finishConfirmation(action === "install");
        this.sync();
        return Promise.resolve();
      }
      if (action === "later") throw new Error("desktop policy: no installation confirmation");
      this.action ??= Promise.resolve().then(async () => {
        this.error = void 0;
        this.restart = void 0;
        this.deferred = false;
        this.clearNavigation();
        if (action === "download") this.attention.reset();
        this.sync();
        switch (action) {
          case "refresh":
            await this.options.refresh();
            break;
          case "download":
            await this.options.download(version);
            break;
          case "install":
            await this.options.install(version);
            break;
        }
      }).catch(() => {
        this.error = this.options.locale.messages.mandatoryActionFailed;
      }).finally(() => {
        this.action = void 0;
        this.sync();
      });
      return this.action;
    });
  }
  options;
  embedded = process.platform === "win32";
  embeddedParent;
  embeddedBlocking = false;
  publishEmbedded = () => {
    this.embeddedBlocking = false;
    this.sync();
  };
  window;
  closing;
  disposed = false;
  error;
  action;
  confirmation;
  confirmationRevision = 0;
  deferred = false;
  restart;
  navigation;
  navigationUrl;
  navigationEpoch = 0;
  attention;
  /** Active modal used as the owner of shell installation-confirmation dialogs. */
  get confirmationWindow() {
    return this.embedded ? this.options.parent() : this.window;
  }
  /**
   * @param version - Updater-owned target, already downloaded and verified.
   * @param active - Fresh Host task inspection; unknown state must fail before calling.
   * @returns Explicit approval from this same modal, or false on deferral, policy clearance, or disposal.
   */
  confirm(version, active) {
    if (this.disposed || !this.options.policy().blocking) return Promise.resolve(false);
    this.finishConfirmation(false);
    this.deferred = false;
    this.restart = void 0;
    return new Promise((resolve3) => {
      this.confirmation = { version, active, revision: ++this.confirmationRevision, resolve: resolve3 };
      this.sync();
      const parent = this.options.parent();
      const owner = this.confirmationWindow;
      if (parent !== void 0 && owner !== void 0) {
        this.attention.ready(version, parent, owner, () => {
          if (!this.disposed && this.options.policy().blocking && this.confirmation !== void 0) this.focus();
        });
      } else this.finishConfirmation(false);
    });
  }
  /** @param active - Whether admitted tasks are actually being stopped after installation approval. */
  preparingRestart(active) {
    this.restart = active ? "stopping-tasks" : "preparing";
    this.attention.clear();
    this.sync();
  }
  /** Publish current status, create the block immediately, or close it only after policy clearance. */
  sync() {
    if (this.disposed) return;
    if (this.embedded) {
      const parent = this.options.parent();
      if (parent !== this.embeddedParent) {
        if (this.embeddedParent !== void 0 && !this.embeddedParent.isDestroyed()) {
          this.embeddedParent.webContents.off("did-finish-load", this.publishEmbedded);
        }
        this.embeddedBlocking = false;
        this.embeddedParent = parent;
        if (parent !== void 0 && !parent.isDestroyed()) parent.webContents.on("did-finish-load", this.publishEmbedded);
      }
      if (parent === void 0 || parent.isDestroyed()) return;
    }
    if (!this.options.policy().blocking) {
      this.finishConfirmation(false);
      this.attention.reset();
      this.clearNavigation();
      this.restart = void 0;
      this.deferred = false;
      if (this.window !== void 0 && this.closing === void 0) {
        const window = this.window;
        window.webContents.send(MANDATORY_IPC.state, this.view());
        this.closing = setTimeout(() => {
          this.closing = void 0;
          if (this.window === window) this.window = void 0;
          window.destroy();
        }, 150);
      }
      this.error = void 0;
      if (this.embedded && this.embeddedBlocking) {
        this.embeddedBlocking = false;
        this.embeddedParent?.webContents.send(MANDATORY_IPC.state, this.view());
      }
      return;
    }
    clearTimeout(this.closing);
    this.closing = void 0;
    if (this.navigationUrl !== this.options.policy().page) this.clearNavigation();
    if (this.options.update().phase === "error") this.restart = void 0;
    if (this.embedded) {
      this.embeddedBlocking = true;
      this.embeddedParent?.webContents.send(MANDATORY_IPC.state, this.view());
      return;
    }
    if (this.window === void 0) {
      const parent = this.options.parent();
      if (parent === void 0) return;
      const window = this.options.overlays.create(parent, this.options.preload, this.options.locale.messages.mandatoryTitle, false);
      this.window = window;
      window.setMenu(null);
      window.on("close", (event) => {
        if (!this.disposed && this.options.policy().blocking) {
          event.preventDefault();
          app4.quit();
        }
      });
      window.on("closed", () => {
        if (this.window === window) this.window = void 0;
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event, url) => {
        if (url !== page) event.preventDefault();
      });
      window.webContents.on("render-process-gone", () => {
        if (!this.disposed) void window.loadURL(page).catch(() => {
          if (!window.isDestroyed()) window.setTitle(this.options.locale.messages.mandatoryActionFailed);
        });
      });
      void window.loadURL(page).catch(() => {
        if (!window.isDestroyed()) window.setTitle(this.options.locale.messages.mandatoryActionFailed);
      });
    }
    this.window.webContents.send(MANDATORY_IPC.state, this.view());
  }
  /** Focus the block instead of opening ordinary product or plugin interactions. */
  focus() {
    this.sync();
    const parent = this.options.parent();
    if (parent?.isDestroyed()) return;
    if (parent?.isMinimized()) parent.restore();
    parent?.show();
    if (this.embedded) parent?.focus();
    this.window?.show();
    this.window?.focus();
  }
  /** Detach IPC and release the modal during shutdown, including after the main window closes. */
  dispose() {
    this.disposed = true;
    clearTimeout(this.closing);
    this.closing = void 0;
    this.finishConfirmation(false);
    this.attention.reset();
    this.clearNavigation();
    ipcMain3.removeHandler(MANDATORY_IPC.status);
    ipcMain3.removeHandler(MANDATORY_IPC.action);
    if (this.embeddedParent !== void 0 && !this.embeddedParent.isDestroyed()) {
      this.embeddedParent.webContents.off("did-finish-load", this.publishEmbedded);
      this.embeddedParent.webContents.send(MANDATORY_IPC.state, { ...this.view(), policy: { blocking: false, checking: false } });
    }
    this.window?.destroy();
    this.window = void 0;
  }
  view() {
    const locale = process.platform === "win32" ? { ...this.options.locale, messages: {
      ...this.options.locale.messages,
      mandatoryReadyDetail: this.options.locale.messages.updateDownloadedDetailWindows
    } } : this.options.locale;
    return {
      locale,
      policy: this.options.policy(),
      update: this.options.update(),
      deferred: this.deferred,
      ...this.confirmation === void 0 ? {} : { confirmation: { version: this.confirmation.version, active: this.confirmation.active, revision: this.confirmation.revision } },
      ...this.restart === void 0 ? {} : { restart: this.restart },
      ...this.navigation === void 0 ? {} : { navigation: this.navigation },
      ...this.error === void 0 ? {} : { error: this.error }
    };
  }
  finishConfirmation(approved) {
    const confirmation = this.confirmation;
    this.confirmation = void 0;
    this.attention.clear();
    confirmation?.resolve(approved);
  }
  clearNavigation() {
    this.navigation = void 0;
    this.navigationUrl = void 0;
    this.navigationEpoch++;
  }
  async navigate(action) {
    const url = desktopPolicyPage(this.options.policy().page, this.options.allowedPageOrigins);
    if (url === void 0) throw new Error("desktop policy: no allowed download page");
    if (this.navigationUrl !== url) this.clearNavigation();
    this.navigationUrl = url;
    if (action === "page") {
      this.navigation = { page: "requested" };
      this.navigationEpoch++;
    }
    const epoch = this.navigationEpoch;
    this.sync();
    try {
      if (action === "copy") {
        await clipboard.writeText(url);
        if (await clipboard.readText() !== url) throw new Error("desktop policy: clipboard did not retain download address");
      } else await shell2.openExternal(url);
      if (epoch !== this.navigationEpoch || this.disposed) return;
      if (action === "copy") this.navigation = { page: this.navigation?.page ?? "requested", copy: "copied" };
    } catch {
      if (epoch !== this.navigationEpoch || this.disposed) return;
      this.navigation = action === "page" ? { ...this.navigation, page: "failed" } : { page: this.navigation?.page ?? "requested", copy: "failed" };
    }
    this.sync();
  }
  assertSender(event) {
    if (this.embedded) {
      const parent = this.options.parent();
      if (parent === void 0 || parent.isDestroyed() || event.sender !== parent.webContents || event.senderFrame !== parent.webContents.mainFrame) {
        throw new Error("desktop policy: rejected unowned renderer");
      }
      assertDesktopSender(event, ["app"]);
      return;
    }
    if (event.sender !== this.window?.webContents || event.senderFrame !== this.window.webContents.mainFrame || event.senderFrame.url !== page) throw new Error("desktop policy: rejected unowned renderer");
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/policy-test-auth.ts
import { randomUUID as randomUUID5 } from "node:crypto";
import { BrowserWindow as BrowserWindow3, session as session2 } from "electron";
var LOGIN_LOADING_PAGE = "renderer/policy-login-loading.html";
var LOGIN_LOADING_FILE = "policy-login-loading.html";
var DesktopPolicyTestAuth = class {
  /**
   * @param origin Validated HTTPS policy origin; login always starts at its root with fresh gateway state.
   * @param allowedAuthOrigins Validated HTTPS origins for login document navigation.
   * @param locale Shell-owned login title.
   * @param parent Current application or mandatory-update window.
   * @param record Fixed, nonsecret login outcomes for diagnostic evidence.
   */
  constructor(origin2, allowedAuthOrigins, locale, parent, record5) {
    this.origin = origin2;
    this.allowedAuthOrigins = allowedAuthOrigins;
    this.locale = locale;
    this.parent = parent;
    this.record = record5;
    this.browserSession.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });
    this.browserSession.setPermissionCheckHandler(() => false);
    this.browserSession.setDevicePermissionHandler(() => false);
    this.browserSession.on("will-download", (event) => {
      event.preventDefault();
    });
    this.browserSession.webRequest.onBeforeRequest((details, callback) => {
      const document = details.resourceType === "mainFrame" || details.resourceType === "subFrame";
      const cancel = document && !this.isLoadingDocument(details.url) && !this.allowed(details.url);
      callback({ cancel });
      if (cancel) this.rejectLogin?.();
    });
  }
  origin;
  allowedAuthOrigins;
  locale;
  parent;
  record;
  browserSession = session2.fromPartition(`dsh-policy-auth-${randomUUID5()}`, { cache: false });
  window;
  pending;
  disposed = false;
  rejectLogin;
  /** Return to an existing login window without starting another authentication flow. */
  focus() {
    this.window?.show();
    this.window?.focus();
  }
  /**
   * Send only the configured policy request through the login Session; redirects remain forbidden.
   * @param input Policy URL supplied by the main-process coordinator.
   * @param init Request headers, credentials, and cancellation owned by that coordinator.
   * @returns Chromium response without exposing cookies to JavaScript.
   */
  request = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (this.disposed || url.origin !== this.origin || url.pathname !== "/api/v0/check_client_update" || url.username !== "" || url.password !== "") {
      return Promise.reject(new Error("desktop policy: disallowed authenticated request"));
    }
    return this.browserSession.fetch(url.href, { ...init, credentials: "include", redirect: "error", cache: "no-store" });
  };
  /**
   * Open only after a user action; repeated callers focus and join the same login.
   * @returns Navigation, cancellation, or failure; the caller must query policy after returning.
   */
  login() {
    if (this.disposed) return Promise.resolve("cancelled");
    if (this.pending !== void 0) {
      this.focus();
      return this.pending;
    }
    const result = Promise.withResolvers();
    const parent = this.parent();
    const window = new BrowserWindow3({
      width: 720,
      height: 760,
      ...parent === void 0 ? {} : { parent },
      title: this.locale.messages.policyLoginTitle,
      autoHideMenuBar: true,
      webPreferences: {
        session: this.browserSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        devTools: true,
        spellcheck: false
      }
    });
    this.pending = result.promise;
    this.window = window;
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      this.window = void 0;
      this.pending = void 0;
      this.rejectLogin = void 0;
      if (!window.isDestroyed()) window.destroy();
      result.resolve(outcome);
      this.record(outcome);
    };
    this.rejectLogin = () => {
      finish("failed");
    };
    window.setMenu(null);
    window.on("closed", () => {
      finish("cancelled");
    });
    window.on("page-title-updated", (event) => {
      event.preventDefault();
    });
    const contents = window.webContents;
    contents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown" || input.key !== "F12" || input.isAutoRepeat) return;
      event.preventDefault();
      contents.openDevTools({ mode: "detach" });
    });
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event, url) => {
      if (!this.allowed(url)) {
        event.preventDefault();
        finish("failed");
      }
    });
    contents.on("will-redirect", (event, url) => {
      if (!this.allowed(url)) {
        event.preventDefault();
        finish("failed");
      }
    });
    contents.on("will-attach-webview", (event) => {
      event.preventDefault();
    });
    contents.on("login", (event, _details, _authInfo, callback) => {
      event.preventDefault();
      callback();
    });
    contents.on("did-fail-load", (_event, code, _description, url, mainFrame) => {
      if (mainFrame && code !== -3 && !this.isLoadingDocument(url)) finish("failed");
    });
    contents.on("render-process-gone", () => {
      finish("failed");
    });
    contents.on("did-navigate", (_event, value) => {
      const url = new URL(value);
      if (url.origin === this.origin && (url.pathname === "/" || url.pathname === "/feishu_auth_callback")) finish("returned");
    });
    this.record("opened");
    const loadLogin = () => {
      if (settled || window.isDestroyed()) return;
      void window.loadURL(`${this.origin}/`).catch(() => {
        finish("failed");
      });
    };
    void window.loadFile(
      LOGIN_LOADING_PAGE,
      { query: { label: this.locale.messages.policyLoginLoading } }
    ).then(loadLogin, loadLogin);
    return result.promise;
  }
  /** Close the login and erase session data after the policy coordinator has stopped its requests. */
  async dispose() {
    this.disposed = true;
    this.window?.destroy();
    await this.pending;
    await this.browserSession.closeAllConnections();
    await this.browserSession.clearStorageData();
    await this.browserSession.clearAuthCache();
  }
  allowed(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    return url.protocol === "https:" && url.username === "" && url.password === "" && (url.origin === this.origin || this.allowedAuthOrigins.includes(url.origin));
  }
  /**
   * Recognize the owned placeholder document. Only the request filter and the
   * load-failure handler accept it; navigation events still require {@link allowed},
   * so the remote page cannot steer the window back to a local file.
   */
  isLoadingDocument(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    return url.protocol === "file:" && url.pathname.endsWith(`/${LOGIN_LOADING_FILE}`);
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/settings.ts
import { mkdirSync as mkdirSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync4 } from "node:fs";
import { join as join10 } from "node:path";
function record4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readDesktopSettings(userData) {
  const directory = join10(userData, "desktop");
  const path = join10(directory, "settings.json");
  const defaults = { updates: { allowTestAuthPopupWindow: false } };
  try {
    let raw;
    try {
      raw = readFileSync3(path, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      mkdirSync3(directory, { recursive: true, mode: 448 });
      try {
        writeFileSync4(path, `${JSON.stringify(defaults, null, 2)}
`, { flag: "wx", mode: 384 });
      } catch (error2) {
        if (error2.code !== "EEXIST") throw error2;
      }
      raw = readFileSync3(path, "utf8");
    }
    const value = JSON.parse(raw);
    if (!record4(value) || value.updates !== void 0 && !record4(value.updates)) {
      throw new Error("expected a JSON object with an optional updates object");
    }
    const allow = value.updates?.allowTestAuthPopupWindow;
    if (allow !== void 0 && typeof allow !== "boolean") {
      throw new Error("updates.allowTestAuthPopupWindow must be true or false");
    }
    return { updates: { allowTestAuthPopupWindow: allow ?? false } };
  } catch (error) {
    try {
      console.warn(`desktop settings: ${path}: using defaults because settings could not be loaded`, error);
    } catch (_logError) {
    }
    return defaults;
  }
}

// sep-origin/alpha2-desktop/apps/desktop/src/update-dialog.ts
import { ipcMain as ipcMain4 } from "electron";
var UPDATE_DIALOG_IPC = { status: "dsh-update-dialog:status", changed: "dsh-update-dialog:changed", respond: "dsh-update-dialog:respond" };
var page2 = "dsh-app://shell/update-dialog.html";
var DesktopUpdateDialog = class {
  /**
   * @param preload - Bundled isolated preload.
   * @param locale - Shell-owned copy or a reader of the current UI language.
   * @param overlays - Application-owned overlay creation and input tracking.
   */
  constructor(preload, locale, overlays) {
    this.preload = preload;
    this.locale = locale;
    this.overlays = overlays;
    ipcMain4.handle(UPDATE_DIALOG_IPC.status, (event) => {
      this.owned(event);
      return this.active?.view ?? null;
    });
    ipcMain4.handle(UPDATE_DIALOG_IPC.respond, (event, revision, index) => {
      this.owned(event);
      const active = this.active;
      if (active === void 0 || revision !== active.view.revision) throw new Error("desktop update: stale dialog response");
      if (typeof index !== "number" || !Number.isInteger(index) || index !== active.view.cancelId && (index < 0 || index >= active.view.buttons.length)) {
        throw new Error("desktop update: invalid dialog response");
      }
      active.finish(index);
    });
  }
  preload;
  locale;
  overlays;
  disposed = false;
  revision = 0;
  window;
  parent;
  closing;
  active;
  /** Focus the current explanation or confirmation without replacing it or granting permission. */
  focus() {
    this.active?.window.focus();
  }
  /** Whether a shell prompt is awaiting a response. */
  get isOpen() {
    return this.active !== void 0;
  }
  /**
   * @param parent - Window blocked by this confirmation.
   * @param options - Main-owned localized content, response choices, and optional cancellation signal.
   * @returns A displayed response, or cancellation on replacement, abort, close, or load failure; backdrop dismissal fades independently.
   */
  show(parent, options) {
    const locale = typeof this.locale === "function" ? this.locale() : this.locale;
    const buttons = options.buttons ?? [locale.messages.updateAcknowledge];
    const cancelId = options.cancelId ?? buttons.length - 1;
    if (this.disposed || options.signal?.aborted === true || parent.isDestroyed()) {
      return Promise.resolve({ response: cancelId, checkboxChecked: false });
    }
    if (this.parent !== parent) {
      this.cancel();
      this.close();
    }
    this.active?.finish(this.active.view.cancelId, true);
    clearTimeout(this.closing);
    this.closing = void 0;
    const existing = this.window;
    const window = existing ?? this.overlays.create(parent, this.preload, options.title ?? locale.messages.updateTitle, false);
    this.window = window;
    this.parent = parent;
    const view = {
      revision: ++this.revision,
      locale: locale.id,
      title: options.title ?? "",
      message: options.message,
      detail: options.detail ?? "",
      buttons,
      cancelId,
      closeLabel: locale.messages.updateClose,
      technicalDetails: options.technicalDetails ?? "",
      technicalDetailsLabel: locale.messages.updateTechnicalDetails
    };
    return new Promise((resolve3) => {
      const abort = () => {
        finish(cancelId);
      };
      const finish = (response, retain = false) => {
        if (this.active?.view !== view) return;
        this.active = void 0;
        options.signal?.removeEventListener("abort", abort);
        if (!retain && !window.isDestroyed()) {
          window.webContents.send(UPDATE_DIALOG_IPC.changed, null);
          this.closing = setTimeout(() => {
            this.close();
          }, 150);
        }
        resolve3({ response, checkboxChecked: false });
      };
      this.active = { window, view, finish };
      options.signal?.addEventListener("abort", abort, { once: true });
      if (existing !== void 0) {
        window.webContents.send(UPDATE_DIALOG_IPC.changed, view);
        return;
      }
      const failed = () => {
        if (this.window === window) {
          this.cancel();
          this.close();
        }
      };
      window.once("closed", failed);
      window.webContents.on("will-navigate", (event, url) => {
        if (url !== page2) event.preventDefault();
      });
      window.webContents.once("render-process-gone", failed);
      void window.loadURL(page2).catch(failed);
    });
  }
  /** Cancel the displayed prompt without authorizing any operation. */
  cancel() {
    this.active?.finish(this.active.view.cancelId);
  }
  /** Close the document and detach its private IPC handlers. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    this.close();
    ipcMain4.removeHandler(UPDATE_DIALOG_IPC.status);
    ipcMain4.removeHandler(UPDATE_DIALOG_IPC.respond);
  }
  close() {
    clearTimeout(this.closing);
    this.closing = void 0;
    const window = this.window;
    this.window = void 0;
    this.parent = void 0;
    if (window !== void 0 && !window.isDestroyed()) window.destroy();
  }
  owned(event) {
    const window = this.window;
    if (window === void 0 || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== page2) {
      throw new Error("desktop update: rejected unowned dialog renderer");
    }
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/browser-guests.ts
import { randomUUID as randomUUID6 } from "node:crypto";
import { app as app5, session as session3 } from "electron";
var DesktopBrowserGuests = class {
  /** @param hostUrl - current authenticated DSH Host, which guests cannot request. */
  constructor(hostUrl) {
    this.hostUrl = hostUrl;
  }
  hostUrl;
  partitions = /* @__PURE__ */ new Map();
  leases = /* @__PURE__ */ new Map();
  /**
   * Reserve one guest in a workspace's process-lifetime partition.
   * @param owner - authenticated primary application WebContents.
   * @param workspace - workspace identity received over IPC.
   * @returns opaque lease and the partition approved for it.
   */
  acquire(owner, workspace) {
    if (typeof workspace !== "string" || workspace.length === 0 || workspace.length > 4096) {
      throw new Error("desktop browser: a workspace storage identity is required");
    }
    let partition = this.partitions.get(workspace);
    if (partition === void 0) {
      partition = `dsh-sidebar-browser-${randomUUID6()}`;
      this.configureSession(session3.fromPartition(partition));
      this.partitions.set(workspace, partition);
    }
    const lease = randomUUID6();
    this.leases.set(lease, { owner, partition, attached: false });
    return { lease, partition };
  }
  /**
   * Release only a lease issued to this application window; workspace storage survives.
   * @param owner - authenticated IPC sender.
   * @param id - lease received over IPC.
   */
  async release(owner, id) {
    if (typeof id !== "string") throw new Error("desktop browser: invalid guest lease");
    const key2 = id;
    const lease = this.leases.get(key2);
    if (lease === void 0) return;
    if (lease.owner !== owner) throw new Error("desktop browser: guest belongs to another window");
    lease.releaseInput?.();
    this.leases.delete(key2);
    const guest = lease.guest;
    if (guest !== void 0 && !guest.isDestroyed()) {
      const destroyed = new Promise((resolve3) => {
        guest.once("destroyed", resolve3);
      });
      guest.close({ waitForBeforeUnload: false });
      await destroyed;
    }
  }
  /**
   * Install attachment checks before the application document can create a webview.
   * @param window - primary application window.
   * @param attachInput - attaches native input after guest ownership is verified and returns its disposer.
   */
  bind(window, attachInput) {
    const owner = window.webContents;
    owner.on("will-attach-webview", (event, preferences, params) => {
      const id = typeof params.src === "string" && params.src.startsWith("about:blank#") ? params.src.slice("about:blank#".length) : "";
      const lease = this.leases.get(id);
      if (lease === void 0 || lease.owner !== owner || lease.attached || params.partition !== lease.partition) {
        event.preventDefault();
        return;
      }
      lease.attached = true;
      for (const key2 of Object.keys(preferences)) {
        if (key2 !== "disablePopups") Reflect.deleteProperty(preferences, key2);
      }
      Object.assign(preferences, {
        partition: lease.partition,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        plugins: false,
        navigateOnDragDrop: false,
        disableDialogs: true,
        devTools: !app5.isPackaged
      });
      params.httpreferrer = "";
    });
    owner.on("did-attach-webview", (_event, guest) => {
      let attachedLease;
      guest.once("dom-ready", () => {
        const url = guest.getURL();
        const id = url.startsWith("about:blank#") ? url.slice("about:blank#".length) : "";
        const lease = this.leases.get(id);
        if (lease === void 0 || lease.owner !== owner || lease.guest !== void 0) {
          guest.close({ waitForBeforeUnload: false });
          return;
        }
        lease.guest = guest;
        attachedLease = id;
        lease.releaseInput = attachInput(guest, id);
        guest.once("destroyed", () => {
          lease.releaseInput?.();
          this.leases.delete(id);
        });
      });
      guest.setWindowOpenHandler(({ url, postBody }) => {
        const lease = attachedLease === void 0 ? void 0 : this.leases.get(attachedLease);
        if (attachedLease !== void 0 && lease?.guest === guest && lease.owner === owner && !owner.isDestroyed() && postBody === void 0 && this.allowedNavigation(url)) {
          const request = { lease: attachedLease, url: new URL(url).href };
          owner.send(DESKTOP_IPC.browserOpenRequested, request);
        }
        return { action: "deny" };
      });
      guest.on("will-frame-navigate", (event) => {
        if (event.isMainFrame && !this.allowedNavigation(event.url)) event.preventDefault();
      });
      guest.on("will-redirect", (event, url, _inPlace, mainFrame) => {
        if (mainFrame && !this.allowedNavigation(url)) event.preventDefault();
      });
      guest.on("will-attach-webview", (event) => {
        event.preventDefault();
      });
      guest.on("login", (event, _details, _authInfo, callback) => {
        event.preventDefault();
        callback();
      });
    });
    const releaseAll = () => {
      for (const [id, lease] of this.leases) {
        if (lease.owner === owner) void this.release(owner, id).catch((error) => {
          console.error(error);
        });
      }
    };
    owner.on("did-start-navigation", (_event, _url, inPlace, mainFrame) => {
      if (mainFrame && !inPlace) releaseAll();
    });
    owner.on("render-process-gone", releaseAll);
    owner.once("destroyed", releaseAll);
  }
  configureSession(browserSession) {
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });
    browserSession.setPermissionCheckHandler(() => false);
    browserSession.setDevicePermissionHandler(() => false);
    browserSession.setDisplayMediaRequestHandler((_request, callback) => {
      callback({});
    });
    browserSession.on("will-download", (event) => {
      event.preventDefault();
    });
    browserSession.webRequest.onBeforeRequest((details, callback) => {
      const url = new URL(details.url);
      const network = ["http:", "https:", "ws:", "wss:"].includes(url.protocol);
      callback({ cancel: network ? url.username !== "" || url.password !== "" || this.isApplicationHost(url) : !["about:", "data:", "blob:"].includes(url.protocol) });
    });
  }
  allowedNavigation(value) {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.username === "" && url.password === "" && !this.isApplicationHost(url);
  }
  isApplicationHost(url) {
    const value = this.hostUrl();
    if (value === void 0) return false;
    const host = new URL(value);
    return url.port === host.port && (url.hostname === host.hostname || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/keyboard.ts
import { ipcMain as ipcMain5 } from "electron";
import { bindingKey, effectiveShortcuts, presentBinding, parseShortcutDefinitions, parseShortcutEdit } from "@deepseek-ai/dsh-client-shortcuts/protocol";

// sep-origin/alpha2-desktop/apps/desktop/src/keybindings.ts
import { readFile as readFile3 } from "node:fs/promises";
import { join as join11 } from "node:path";
import { writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { ShortcutPersistence } from "@deepseek-ai/dsh-client-shortcuts/protocol";
function desktopKeybindings(userData, platform, publish) {
  const path = join11(userData, "keybindings.json");
  return new ShortcutPersistence({
    read: async () => {
      try {
        return await readFile3(path, "utf8");
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    write: (raw) => writeFileAtomic(path, raw, { mode: 384, dirMode: 448 })
  }, "desktop", platform, false, publish);
}

// sep-origin/alpha2-desktop/apps/desktop/src/keyboard.ts
function installDesktopShortcuts(getWindow, userData, platform, updateMenu, overlayInput) {
  let definitions = [];
  let recording = false;
  let revision;
  let closeBinding = null;
  let editingInput;
  const scopedDesktop = platform === "windows" || platform === "macos";
  const disposers = /* @__PURE__ */ new Set();
  const guestInputs = /* @__PURE__ */ new Map();
  const closeAccelerator = () => presentBinding(closeBinding, platform).aria?.replace("Meta+", "Command+").replace(/Arrow(Up|Down|Left|Right)$/u, "$1");
  const sendMenuClose = () => {
    const window = getWindow();
    if (window === void 0 || window.isDestroyed() || !window.isFocused() || !window.isEnabled() || revision === void 0 || recording || overlayInput(window).blocked) return;
    window.webContents.send(DESKTOP_IPC.shortcutsInput, { kind: "menu", commandId: "page.close", revision });
  };
  let keys = /* @__PURE__ */ new Set();
  const publish = (snapshot) => {
    const wasEnabled = revision !== void 0;
    const previousAccelerator = closeAccelerator();
    revision = definitions.length === 0 || snapshot.status === "loading" ? void 0 : snapshot.revision;
    const rows = snapshot.status === "loading" ? [] : effectiveShortcuts(definitions, snapshot.document, "desktop", platform);
    keys = new Set(rows.flatMap((row) => row.binding !== null && row.issue === null && row.conflicts.length === 0 ? [bindingKey(row.binding)] : []));
    const close = rows.find((row) => row.id === "page.close");
    closeBinding = close?.issue === null && close.conflicts.length === 0 ? close.binding : null;
    if (wasEnabled !== (revision !== void 0) || previousAccelerator !== closeAccelerator()) updateMenu();
    const window = getWindow();
    if (window !== void 0 && !window.isDestroyed() && window.webContents.mainFrame.url.startsWith("dsh-app://app/")) {
      window.webContents.send(DESKTOP_IPC.shortcutsChanged, snapshot);
    }
  };
  const persistence = desktopKeybindings(userData, platform, publish);
  const assertSender = (event) => {
    const window = getWindow();
    if (window === void 0 || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error("desktop shortcuts: rejected sender");
    assertDesktopSender(event, ["app"]);
    return window;
  };
  ipcMain5.handle(DESKTOP_IPC.shortcutsGet, async (event, input) => {
    assertSender(event);
    definitions = parseShortcutDefinitions(input);
    persistence.setDefinitions(definitions);
    return persistence.readCurrent();
  });
  ipcMain5.handle(DESKTOP_IPC.shortcutsEdit, async (event, input, expectedRevision) => {
    assertSender(event);
    if (typeof expectedRevision !== "string") throw new Error("desktop shortcuts: invalid revision");
    return persistence.edit(parseShortcutEdit(input), expectedRevision);
  });
  ipcMain5.handle(DESKTOP_IPC.shortcutsRecording, (event, active) => {
    const window = assertSender(event);
    if (typeof active !== "boolean") throw new Error("desktop shortcuts: invalid recording state");
    recording = active;
    window.webContents.setIgnoreMenuShortcuts(active);
  });
  ipcMain5.handle(DESKTOP_IPC.shortcutsCloseWindow, (event, expected) => {
    const window = assertSender(event);
    if (expected !== revision || revision === void 0 || recording || !window.isFocused() || !window.isEnabled() || overlayInput(window).blocked) return;
    window.close();
  });
  function attachInput(window, contents, guestName) {
    let deadKey = false;
    const held = /* @__PURE__ */ new Set();
    const consumed = /* @__PURE__ */ new Map();
    let inputFrame = null;
    let inputRevision;
    let overlayRevision = overlayInput(window).revision;
    const resetInput = () => {
      deadKey = false;
      held.clear();
      consumed.clear();
      inputFrame = null;
      inputRevision = void 0;
      if (!contents.isDestroyed()) contents.setIgnoreMenuShortcuts(false);
    };
    if (guestName !== void 0) guestInputs.set(contents, { window, reset: resetInput });
    const resetWindow = () => {
      resetInput();
      for (const guest of guestInputs.values()) if (guest.window === window) guest.reset();
    };
    const clear = () => {
      resetInput();
      if (guestName !== void 0) return;
      definitions = [];
      keys.clear();
      recording = false;
      persistence.setDefinitions(null);
    };
    const navigation = (event) => {
      if (event.isMainFrame && !event.isSameDocument) clear();
    };
    const beforeInput = (event, input) => {
      const overlay = overlayInput(window);
      if (overlay.revision !== overlayRevision) {
        resetInput();
        overlayRevision = overlay.revision;
      }
      if (overlay.blocked) {
        event.preventDefault();
        return;
      }
      if (event.defaultPrevented) {
        resetInput();
        return;
      }
      if (editingInput === contents) {
        held.clear();
        consumed.clear();
        contents.setIgnoreMenuShortcuts(true);
        return;
      }
      if (window !== getWindow() || !window.isFocused() || !window.isEnabled() || revision === void 0 || guestName !== void 0 && !contents.isFocused()) {
        contents.setIgnoreMenuShortcuts(false);
        held.clear();
        consumed.clear();
        return;
      }
      const modifiers = ["control", "alt", "shift", "meta"].filter((modifier) => input[modifier]);
      const key2 = bindingKey({ code: input.code, modifiers });
      const match = keys.has(key2);
      const menuMatch = closeBinding !== null && closeBinding.secondCode === void 0 && modifiers.join("+") === closeBinding.modifiers.join("+") && input.key.toUpperCase() === (closeBinding.code.startsWith("Key") ? closeBinding.code.slice(3) : input.code === closeBinding.code ? input.key.toUpperCase() : "");
      contents.setIgnoreMenuShortcuts(recording || match || menuMatch);
      const frame = contents.focusedFrame;
      const composing = input.isComposing || input.key === "Dead" || deadKey || input.modifiers.includes("altgr");
      if (input.type === "keyDown") deadKey = input.key === "Dead";
      if (recording || composing || frame === null) {
        held.clear();
        consumed.clear();
        return;
      }
      let binding = { code: input.code, modifiers };
      let priority = false;
      if (scopedDesktop) {
        if (frame !== inputFrame || inputRevision !== revision) {
          held.clear();
          inputFrame = frame;
          inputRevision = revision;
        }
        const modifierKey = /^(Control|Alt|Shift|Meta)(Left|Right)$/u.test(input.code);
        if (input.type === "keyUp") {
          if (consumed.get(input.code) === "press") event.preventDefault();
          consumed.delete(input.code);
          held.delete(input.code);
          if (modifierKey) held.clear();
          return;
        }
        if (!input.isAutoRepeat) consumed.delete(input.code);
        if (modifierKey) {
          held.clear();
          return;
        }
        if (input.isAutoRepeat && consumed.has(input.code) && !match) {
          event.preventDefault();
          return;
        }
        if (input.isAutoRepeat && !held.has(input.code) && !match) return;
        held.add(input.code);
        const codes = [input.code, ...[...held].filter((value) => value !== input.code)];
        codes.sort();
        const pair = { code: codes[0], ...codes[1] === void 0 ? {} : { secondCode: codes[1] }, modifiers };
        priority = keys.has(key2);
        if (codes.length === 2 && keys.has(bindingKey(pair))) {
          binding = pair;
          priority = true;
        }
      }
      const main2 = guestName === void 0 && frame === contents.mainFrame;
      if (!priority && (main2 || !match)) return;
      event.preventDefault();
      if (input.type !== "keyDown") return;
      if (scopedDesktop) {
        if (!input.isAutoRepeat) {
          if (binding.secondCode !== void 0) {
            consumed.set(binding.code, "repeat");
            consumed.set(binding.secondCode, "repeat");
          }
          consumed.set(input.code, "press");
        }
        held.clear();
      }
      let embedding = frame;
      while (guestName === void 0 && !main2 && embedding.parent !== null && embedding.parent !== contents.mainFrame) {
        embedding = embedding.parent;
      }
      window.webContents.send(DESKTOP_IPC.shortcutsInput, {
        kind: guestName === void 0 ? main2 ? "keyboard" : "iframe" : "webview",
        revision,
        frameName: guestName ?? (main2 ? "" : embedding.name),
        code: binding.code,
        ...binding.secondCode === void 0 ? {} : { secondCode: binding.secondCode },
        repeat: input.isAutoRepeat,
        control: input.control,
        alt: input.alt,
        shift: input.shift,
        meta: input.meta
      });
    };
    const dispose = () => {
      contents.off("did-start-navigation", navigation);
      contents.off("before-input-event", beforeInput);
      contents.off("blur", resetInput);
      contents.off("destroyed", dispose);
      if (guestName === void 0) {
        window.off("blur", resetWindow);
        window.off("closed", closed);
      }
      disposers.delete(dispose);
      guestInputs.delete(contents);
      if (!contents.isDestroyed()) contents.setIgnoreMenuShortcuts(false);
    };
    const closed = () => {
      clear();
      dispose();
    };
    contents.on("did-start-navigation", navigation);
    contents.on("before-input-event", beforeInput);
    contents.on("blur", resetInput);
    contents.once("destroyed", dispose);
    if (guestName === void 0) {
      window.on("closed", closed);
      window.on("blur", resetWindow);
    }
    disposers.add(dispose);
    return dispose;
  }
  return {
    sendEditingKey(keyCode, modifiers) {
      const window = getWindow();
      if (window === void 0 || window.isDestroyed() || overlayInput(window).blocked) return;
      const contents = [...guestInputs].find(([guest, owner]) => owner.window === window && !guest.isDestroyed() && guest.isFocused())?.[0] ?? window.webContents;
      contents.focus();
      const previous = editingInput;
      editingInput = contents;
      try {
        contents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
        contents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
      } finally {
        editingInput = previous;
        if (!contents.isDestroyed()) contents.setIgnoreMenuShortcuts(recording);
      }
    },
    fileMenu: (labels) => {
      const accelerator = closeAccelerator();
      return { label: labels.fileMenu, submenu: [{
        id: "dsh-page-close",
        label: labels.closePage,
        enabled: revision !== void 0,
        ...accelerator === void 0 ? {} : { accelerator },
        click: sendMenuClose
      }] };
    },
    attach(window) {
      attachInput(window, window.webContents);
    },
    attachGuest: attachInput,
    dispose() {
      for (const dispose of disposers) dispose();
      persistence.dispose();
      for (const channel of [
        DESKTOP_IPC.shortcutsGet,
        DESKTOP_IPC.shortcutsEdit,
        DESKTOP_IPC.shortcutsRecording,
        DESKTOP_IPC.shortcutsCloseWindow
      ]) {
        ipcMain5.removeHandler(channel);
      }
    }
  };
}

// sep-origin/alpha2-desktop/apps/desktop/src/update-overlay.ts
import { BrowserWindow as BrowserWindow4 } from "electron";
var unblockedInput = { revision: 0, blocked: false };
var DesktopUpdateOverlays = class {
  inputStates = /* @__PURE__ */ new WeakMap();
  /**
   * @param parent - Product window whose input may belong to an update dialog.
   * @returns Current blocking state; its revision changes whenever an overlay opens or closes.
   */
  input(parent) {
    return this.inputStates.get(parent) ?? unblockedInput;
  }
  /**
   * @param parent - Product window whose content is blocked while the overlay is open.
   * @param preload - Isolated shell-only preload.
   * @param title - Localized window title.
   * @param nativeModal - Use a native modal; false keeps overlays out of macOS sheets.
   * @returns A transparent child that follows its parent's bounds and visibility after loading and releases its listeners on close.
   */
  create(parent, preload, title, nativeModal = true) {
    const window = new BrowserWindow4({
      parent,
      modal: nativeModal || process.platform !== "darwin",
      show: false,
      frame: false,
      transparent: true,
      ...parent.getContentBounds(),
      resizable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      hasShadow: false,
      title,
      webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true }
    });
    const inputState = this.inputStates.get(parent) ?? { revision: 0, active: 0, get blocked() {
      return this.active > 0;
    } };
    this.inputStates.set(parent, inputState);
    inputState.active++;
    inputState.revision++;
    window.once("closed", () => {
      inputState.active--;
      inputState.revision++;
    });
    const focus = () => {
      if (!window.isDestroyed()) window.focus();
    };
    const blockInput = (event) => {
      event.preventDefault();
      focus();
    };
    if (!nativeModal && process.platform === "darwin") {
      parent.on("focus", focus);
      parent.webContents.prependListener("before-input-event", blockInput);
      window.once("closed", () => {
        parent.off("focus", focus);
        if (!parent.isDestroyed()) parent.webContents.off("before-input-event", blockInput);
      });
    }
    const follow = () => {
      if (!window.isDestroyed()) window.setBounds(parent.getContentBounds());
    };
    parent.on("move", follow);
    parent.on("resize", follow);
    window.once("closed", () => {
      parent.off("move", follow);
      parent.off("resize", follow);
    });
    let ready = false;
    const show = () => {
      if (ready && !window.isDestroyed() && !parent.isDestroyed() && parent.isVisible()) window.show();
    };
    parent.on("show", show);
    window.once("closed", () => {
      parent.off("show", show);
    });
    window.once("ready-to-show", () => {
      ready = true;
      show();
    });
    window.setMenu(null);
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    return window;
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/quit-confirmation.ts
function resolveDesktopQuitPrompt(inspection) {
  if (inspection === "unknown") return "quitActiveTasks";
  if (inspection.activeTasks && inspection.scheduledTasks) return "quitActiveAndScheduledTasks";
  if (inspection.activeTasks) return "quitActiveTasks";
  if (inspection.scheduledTasks) return "quitScheduledTasks";
  return void 0;
}
var DesktopQuitConfirmation = class {
  /** @param options - Locale, inspection, and native dialog collaborators. */
  constructor(options) {
    this.options = options;
  }
  options;
  pending;
  disposed = false;
  /**
   * Decide whether the quit may proceed. The inspection runs once per decision; work that starts or ends
   * while the confirmation is open does not change its copy, and approval never re-inspects.
   * @returns true to quit now, false when the user cancelled.
   */
  confirm() {
    if (this.disposed) return Promise.resolve(false);
    if (this.pending !== void 0) {
      this.options.focus();
      return this.pending;
    }
    const pending = this.decide().finally(() => {
      if (this.pending === pending) this.pending = void 0;
    });
    this.pending = pending;
    return pending;
  }
  /**
   * The application is quitting through a path that does not ask: a pending decision resolves to
   * false without opening a box, and later requests do the same. An already open native box has no
   * close API and disappears with the process.
   */
  dispose() {
    this.disposed = true;
  }
  async decide() {
    const inspection = this.options.inspect();
    if (inspection === void 0) return true;
    const prompt = resolveDesktopQuitPrompt(await inspection.catch((error) => {
      console.warn("desktop quit: task inspection unavailable", error);
      return "unknown";
    }));
    if (this.disposed) return false;
    if (prompt === void 0) return true;
    const { messages } = this.options.locale();
    const windows = (this.options.platform ?? process.platform) === "win32";
    const result = await this.options.show({
      type: windows ? "none" : "warning",
      ...windows && this.options.icon !== void 0 ? { icon: this.options.icon } : {},
      title: messages.aboutProduct,
      message: messages.quitTitle,
      detail: messages[prompt],
      buttons: [messages.quit, messages.cancel],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });
    if (this.disposed) return false;
    return result.response === 0;
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/request-lifetime.ts
var DesktopRequestLifetime = class {
  controller = new AbortController();
  pending = /* @__PURE__ */ new Set();
  /** @returns The shared cancellation signal; it remains open when a window is hidden. */
  get signal() {
    return this.controller.signal;
  }
  /** Cancels forwarding and resolves pending UI reads before Host teardown; idempotent. */
  close() {
    this.controller.abort();
    for (const settle of [...this.pending]) settle();
  }
  /**
   * @param operation - An accepted UI read whose late result is discarded after quit.
   * @param closedValue - Local response used when closing; not a remote cancellation receipt.
   * @returns The live result, or the closing response. Live failures remain rejected.
   */
  run(operation, closedValue) {
    if (this.signal.aborted) return Promise.resolve(closedValue);
    return new Promise((resolve3, reject) => {
      const settle = () => {
        this.pending.delete(settle);
        resolve3(closedValue);
      };
      this.pending.add(settle);
      void Promise.resolve().then(() => this.signal.aborted ? closedValue : operation()).then((value) => {
        this.pending.delete(settle);
        resolve3(this.signal.aborted ? closedValue : value);
      }, (error) => {
        this.pending.delete(settle);
        if (this.signal.aborted) resolve3(closedValue);
        else reject(error);
      });
    });
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/tray.ts
import { Menu, nativeImage, Tray } from "electron";
var DesktopTray = class {
  /** @param options - Icon path, locale reader, and the open and quit actions. */
  constructor(options) {
    this.options = options;
    const tray = new Tray(nativeImage.createFromPath(options.iconPath));
    this.tray = tray;
    tray.on("click", () => {
      options.open();
    });
    this.relabel();
  }
  options;
  tray;
  /** Rebuild the tooltip and context menu in the current locale. */
  relabel() {
    const tray = this.tray;
    if (tray === void 0) return;
    const { messages } = this.options.locale();
    tray.setToolTip(messages.aboutProduct);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: messages.openApplication, click: () => {
        this.options.open();
      } },
      { type: "separator" },
      { label: messages.quitApplication, click: () => {
        this.options.quit();
      } }
    ]));
  }
  /** Remove the icon; called once the quit is confirmed so no dead icon outlives the process. */
  dispose() {
    const tray = this.tray;
    this.tray = void 0;
    tray?.destroy();
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/background-notice.ts
import { existsSync as existsSync3, mkdirSync as mkdirSync4, writeFileSync as writeFileSync5 } from "node:fs";
import { dirname } from "node:path";
var DesktopBackgroundNotice = class {
  /** @param options - Marker path, localized copy, and shell dialog actions. */
  constructor(options) {
    this.options = options;
  }
  options;
  acknowledged = false;
  pending = false;
  disposed = false;
  /**
   * Request a window hide, prompting until acknowledged and coalescing repeated requests.
   * @param hide - Hide the still-owned window after acknowledgement, or immediately when already recorded.
   */
  close(hide) {
    if (this.disposed) return;
    if (this.pending) {
      this.options.focus();
      return;
    }
    if (this.acknowledged || existsSync3(this.options.markerPath)) {
      hide();
      return;
    }
    this.pending = true;
    void this.confirm(hide);
  }
  /** Ignore late dialog responses after application shutdown begins. */
  dispose() {
    this.disposed = true;
  }
  async confirm(hide) {
    try {
      const { messages } = this.options.locale();
      const result = await this.options.show({
        type: "info",
        title: messages.aboutProduct,
        message: messages.backgroundNoticeBody,
        buttons: [messages.backgroundNoticeConfirm],
        defaultId: 0,
        cancelId: -1
      });
      if (this.disposed || result.response !== 0) return;
      this.acknowledged = true;
      try {
        mkdirSync4(dirname(this.options.markerPath), { recursive: true });
        writeFileSync5(this.options.markerPath, "");
      } catch (error) {
        console.warn("desktop tray: could not record background confirmation", error);
      }
      hide();
    } catch (error) {
      console.warn("desktop tray: background confirmation unavailable", error);
    } finally {
      this.pending = false;
    }
  }
};

// sep-origin/alpha2-desktop/apps/desktop/src/main.ts
var focusPrimaryWindow = () => {
};
var stopForRecovery = async () => {
};
var shuttingDown = false;
var skipQuitConfirmation = false;
var windowsLanguage;
var backendReady = false;
var rendererConsole = new RendererConsoleTail();
configureManagedIdentity(app6,sepManagedInvocation);
function currentDesktopLocale() {
  return resolveDesktopLocale(windowsLanguage ?? app6.getLocale());
}
function quitWithoutConfirmation() {
  skipQuitConfirmation = true;
  app6.quit();
}
var recovery = new DesktopFatalRecovery({
  messages: () => currentDesktopLocale().messages,
  show: (options) => dialog2.showMessageBox(options),
  stop: () => {
    shuttingDown = true;
    return stopForRecovery();
  },
  canDisablePlugins: () => !process.argv.some((arg) => arg.startsWith("--sep-recovery-connection=")),
  disablePlugins: async () => {
    if (process.argv.some((arg) => arg.startsWith("--sep-recovery-connection="))) throw new Error("SEP_CONTROLLED_RECOVERY_REQUIRED");
    const manager = new DesktopProjectManager(resolveDesktopPaths(), runtimeResources());
    const backupPath = await manager.disableAllPlugins();
    console.info("Desktop profile recovery completed:", { profilePatchBackup: backupPath ?? null, homePatch: "unchanged" });
  },
  exit: () => {
    quitWithoutConfirmation();
  },
  restart: () => {
    app6.relaunch();
    quitWithoutConfirmation();
  },
  writeReport: (error, source) => persistCrashReport(error, source)
});
function persistCrashReport(error, source) {
  return writeCrashReport(app6.getPath("logs"), {
    source,
    phase: backendReady ? "running" : "startup",
    error,
    ...error instanceof DesktopHostFatalError && error.diagnostic !== void 0 ? { hostDiagnostic: error.diagnostic } : {},
    rendererConsole: rendererConsole.snapshot(),
    app: {
      name: app6.name,
      version: app6.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
      locale: currentDesktopLocale().id
    },
    time: /* @__PURE__ */ new Date()
  });
}
function reportFatal(error, source) {
  console.error(error);
  if (shuttingDown) {
    void persistCrashReport(error, source);
    return;
  }
  void recovery.report(error, source).catch((failure) => {
    console.error(failure);
    app6.exit(1);
  });
}
protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
    codeCache: true
  }
}]);
function runtimeResources() {
  const development = !app6.isPackaged;
  const node = process.execPath;
  const nodeBin = development ? join12(app6.getAppPath(), "scripts", "node-bin") : join12(process.resourcesPath, "runtime", "bin");
  const pnpm = (development ? process.env.DSH_DESKTOP_PNPM_ENTRY : void 0) ?? (development ? join12(app6.getAppPath(), "node_modules", "pnpm", "bin", "pnpm.mjs") : join12(process.resourcesPath, "runtime", "primary-runtime", "dependencies", "pnpm", "bin", "pnpm.mjs"));
  const dsh = (development ? process.env.DSH_DESKTOP_DSH_DIR : void 0) ?? (development ? join12(app6.getAppPath(), ".desktop-build", "development", "project") : join12(app6.getAppPath(), "dsh"));
  return { node, nodeBin, pnpm, dsh };
}
function developmentPrimaryRuntime() {
  const directory = process.env.DSH_DESKTOP_PRIMARY_RUNTIME_DIR;
  if (directory === void 0 || directory === "") {
    throw new Error("dsh desktop: DSH_DESKTOP_PRIMARY_RUNTIME_DIR is required for an unpackaged launch");
  }
  return directory;
}
function developmentHostInspectPort(enabled) {
  const configured = process.env.DSH_DESKTOP_HOST_INSPECT_PORT;
  if (!enabled || configured === void 0 || configured === "") return void 0;
  const port = Number(configured);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("dsh desktop: DSH_DESKTOP_HOST_INSPECT_PORT must be an integer from 1 through 65535");
  }
  return port;
}
function chromeFallbackFill() {
  return nativeTheme.shouldUseDarkColors ? "#1b1b1c" : "#f9fafb";
}
function platformLoginUrl(authorizeUrl) {
  const url = new URL(authorizeUrl);
  url.searchParams.set("theme", nativeTheme.shouldUseDarkColors ? "dark" : "light");
  return url.href;
}
function createWindow(preload, show = false, primary = false) {
  const window = new BrowserWindow5({
    width: 1280,
    height: 820,
    minWidth: 520,
    minHeight: 600,
    show,
    ...process.platform === "win32" && primary ? {
      titleBarStyle: "hidden",
      titleBarOverlay: {
        height: WINDOWS_TITLEBAR_HEIGHT,
        color: chromeFallbackFill(),
        symbolColor: nativeTheme.shouldUseDarkColors ? "#f9fafb" : "#0f1115"
      }
    } : {},
    // hiddenInset places traffic lights inside the sidebar; sidebar vibrancy
    // needs a transparent window background to show through the page.
    ...process.platform === "darwin" ? {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 18 },
      vibrancy: "sidebar",
      // 'active' keeps the vibrancy material stable when the window blurs;
      // 'followWindow' washes the sidebar out behind an unfocused window.
      visualEffectState: "active",
      backgroundColor: "#00000000"
    } : {},
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: primary,
      devTools: true
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (["http:", "https:"].includes(new URL(url).protocol)) void shell3.openExternal(url);
    return { action: "deny" };
  });
  if (process.platform === "darwin" || process.platform === "win32") {
    const sendFullscreen = () => {
      if (!window.isDestroyed()) window.webContents.send(DESKTOP_IPC.windowFullscreen, window.isFullScreen());
    };
    window.on("enter-full-screen", sendFullscreen);
    window.on("leave-full-screen", sendFullscreen);
    window.webContents.on("did-finish-load", sendFullscreen);
  }
  if (process.platform === "darwin") {
    const applyBackdrop = () => {
      if (window.isDestroyed()) return;
      if (window.isMinimized() || !window.isVisible()) {
        window.setVibrancy(null);
        window.setBackgroundColor(chromeFallbackFill());
      } else {
        window.setVibrancy("sidebar");
        window.setBackgroundColor("#00000000");
      }
    };
    window.on("minimize", applyBackdrop);
    window.on("hide", applyBackdrop);
    window.on("restore", applyBackdrop);
    window.on("show", applyBackdrop);
  }
  window.webContents.on("context-menu", (_event, { isEditable, selectionText, editFlags }) => {
    const items = [];
    if (isEditable) {
      items.push(
        { role: "undo", enabled: editFlags.canUndo },
        { role: "redo", enabled: editFlags.canRedo },
        { type: "separator" },
        { role: "cut", enabled: editFlags.canCut },
        { role: "copy", enabled: editFlags.canCopy },
        { role: "paste", enabled: editFlags.canPaste },
        { type: "separator" },
        { role: "selectAll", enabled: editFlags.canSelectAll }
      );
    } else if (selectionText.length > 0) {
      items.push({ role: "copy", enabled: editFlags.canCopy });
    }
    if (items.length > 0) {
      const messages = currentDesktopLocale().messages;
      Menu2.buildFromTemplate(items.map((item) => ({
        ...item,
        ...process.platform === "win32" && item.role !== void 0 && item.role in messages ? { label: messages[item.role] } : {},
        accelerator: ""
      }))).popup({ window });
    }
  });
  window.webContents.on("will-navigate", (event, url) => {
    const destination = new URL(url);
    const current = new URL(window.webContents.getURL());
    if (destination.protocol !== `${SCHEME}:` && !(destination.protocol === "http:" && destination.origin === current.origin)) {
      event.preventDefault();
      if (["http:", "https:"].includes(destination.protocol)) void shell3.openExternal(url);
    }
  });
  return window;
}
async function main() {
  const desktopSettings = readDesktopSettings(app6.getPath("userData"));
  void pruneCrashReports(app6.getPath("logs"));
  const journalDirectory = process.env.DSH_DESKTOP_UPDATE_JOURNAL_DIR;
  const updateJournal = journalDirectory === void 0 ? void 0 : new DesktopUpdateJournal(journalDirectory, app6.getVersion());
  const resources = runtimeResources();
  const paths = resolveDesktopPaths();
  const development = !app6.isPackaged;
  const applicationIconPath = development ? join12(app6.getAppPath(), "resources", "icon-windows.png") : join12(process.resourcesPath, "icon.png");
  if (process.platform === "win32") {
    const setWindowIcon = (_event, window2) => {
      window2.setIcon(applicationIconPath);
    };
    app6.on("browser-window-created", setWindowIcon);
    app6.once("will-quit", () => {
      app6.off("browser-window-created", setWindowIcon);
    });
  }
  const primaryRuntime = development ? developmentPrimaryRuntime() : join12(process.resourcesPath, "runtime", "primary-runtime");
  const connectionArgs = process.argv.filter((arg) => arg.startsWith("--sep-recovery-connection="));
  if (connectionArgs.length > 1) throw new Error("RECOVERY_DESKTOP_CONNECTION");
  const connectionFile = connectionArgs[0]?.slice("--sep-recovery-connection=".length);
  const managed = await readManagedDesktopConnection(sepManagedInvocation.connectionFile);
  if (managed !== void 0 && managed.dshVersion !== app6.getVersion()) throw new Error("RECOVERY_DESKTOP_IDENTITY");
  const activeProject = managed?.projectDir ?? paths.profile;
  const manager = new DesktopProjectManager(paths, resources);
  const loginShellRead = new AbortController();
  app6.on("will-quit", () => {
    loginShellRead.abort();
  });
  const loginShell = readDesktopLoginShellEnvironment(process.env, resolveDesktopLoginShellConfig(process.env), {
    signal: loginShellRead.signal
  }).then((result) => {
    for (const failure of result.failures) console.warn(`desktop login shell: ${failure.shell} failed (${failure.reason})`);
    return result.environment;
  });
  let hostEnvironment = process.env;
  const prepareHostEnvironment = async () => {
    hostEnvironment = await loginShell;
  };
  let quitting = false;
  const requests = new DesktopRequestLifetime();
  let startup;
  let workspaceRecovery;
  let mainWindow;
  let welcomeWindow;
  let enteredWorkspace = false;
  let raiseAfterUpdate = process.platform === "win32" && process.argv.includes("--updated");
  let shellInstallerOwnsQuit = false;
  let requireCleanStop = false;
  let updateStoppedHost = false;
  let updateStopFailure;
  let updateState = { phase: "idle" };
  const systemLanguages = app6.getPreferredSystemLanguages();
  let locale = resolveDesktopStartupLocale(null, systemLanguages);
  windowsLanguage = locale.id;
  let mandatoryPolicy;
  let mandatoryUI;
  let policyAuth;
  let tray;
  let sessionEnding = false;
  const isQuitting = () => quitting;
  const currentMainWindow = () => mainWindow;
  const ordinaryDialogs = /* @__PURE__ */ new Set();
  const currentDialogWindow = () => welcomeWindow ?? mainWindow;
  const updateOverlays = new DesktopUpdateOverlays();
  const updateDialog = new DesktopUpdateDialog(fileURLToPath2(new URL("./preload-update-dialog.cjs", import.meta.url)), () => locale, updateOverlays);
  const isMandatory = () => mandatoryPolicy?.state.blocking === true;
  const ordinaryMessageBox = async (options) => {
    const controller = new AbortController();
    ordinaryDialogs.add(controller);
    try {
      const parent = currentDialogWindow();
      if (parent === void 0) return { response: options.cancelId ?? 0, checkboxChecked: false };
      return await updateDialog.show(parent, { ...options, signal: controller.signal });
    } finally {
      ordinaryDialogs.delete(controller);
    }
  };
  const showAbout = async () => {
    await ordinaryMessageBox({
      type: "info",
      title: locale.messages.aboutMenu,
      message: locale.messages.aboutProduct,
      detail: formatDesktopMessage(locale.messages.aboutVersion, { version: app6.getVersion() }),
      buttons: [locale.messages.updateAcknowledge],
      cancelId: 0
    });
  };
  const commandManager = new DesktopCommandManager({
    resources: process.resourcesPath,
    isPackaged: app6.isPackaged,
    isInstalledLocation: () => process.platform !== "darwin" || app6.isInApplicationsFolder(),
    isInstalling: () => updateState.phase === "installing",
    isQuitting,
    messages: () => currentDesktopLocale().messages,
    show: ordinaryMessageBox
  });
  const presentManagedState = (state) => ({
    phase: state.phase === "candidate-unavailable" ? "available" : state.phase,
    ...state.version === void 0 ? {} : { version: state.version },
    ...state.message === void 0 ? {} : { message: state.message },
    ...state.failedOperation === void 0 ? {} : { failedOperation: state.failedOperation }
  });
  const sepUpdates = managed === void 0 ? void 0 : createManagedUpdater({
    app: app6,
    dialog: { showMessageBox: ordinaryMessageBox },
    BrowserWindow: BrowserWindow5,
    powerMonitor,
    projectDir: process.env.DSH_DESKTOP_DSH_DIR,
    nodeExecutable: process.env.DSH_DESKTOP_NODE_BINARY,
    profileContext: { home: process.env.DSH_HOME, profileRoot: activeProject, installAnchor: join12(process.env.DSH_DESKTOP_DSH_DIR, "node_modules/@deepseek-ai/dsh/package.json"), overlayFiles: [join12(process.env.DSH_DESKTOP_DSH_DIR, "node_modules/@deepseek-ai/dsh-desktop-host/lib/sep-policy.json")] },
    onAssessment: async (input) => {
      if (hostUrl === void 0 || hostCookie === void 0) throw new Error("ASSESSMENT_HOST_UNAVAILABLE");
      const response = await forwardWebRequest(new Request("dsh-app://app/api/sep-assessment/observe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "client-request", rpcId: "sep-update-discovery", method: "sep-assessment/observe", payload: input }),
        signal: AbortSignal.timeout(15e3)
      }), hostUrl, hostCookie, requests.signal);
      const reply = await response.json();
      if (!response.ok || reply.result?.ok !== true) throw new Error("ASSESSMENT_HOST_UNAVAILABLE");
    },
    onState: (state) => {
      publishUpdate(presentManagedState(state));
    },
    onPreferences: (preferences) => {
      for (const window2 of BrowserWindow5.getAllWindows()) {
        window2.webContents.send(DESKTOP_IPC.updatePreferencesChanged, preferences);
      }
    },
    onSepState: (state) => {
      for (const window2 of BrowserWindow5.getAllWindows()) {
        window2.webContents.send(DESKTOP_IPC.sepUpdatesPresentation, presentDesktopUpdate(presentManagedState(state)));
      }
    }
  });
  const appPreload = fileURLToPath2(new URL("./preload-app.cjs", import.meta.url));
  const applicationUrl = `${SCHEME}://app/`;
  let hostUrl;
  let hostCookie;
  const browserGuests = new DesktopBrowserGuests(() => hostUrl);
  let injections = [];
  let welcomeBackend;
  let reportedLaunch = false;
  let analyticsEnabled = false;
  const track = async (eventName, attributes) => {
    const event = { eventName, attributes, timestamp: Date.now() };
    try {
      if (analyticsEnabled) await welcomeBackend?.report(event);
    } catch (_error) {
    }
  };
  let stopAccount;
  let openedAttempt;
  let returnedAttempt;
  let pendingWelcomeNotice;
  let previousAccountStatus;
  const assertProductSender = (event) => {
    assertDesktopSender(event, ["app"]);
    if (mainWindow === void 0 || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents || event.senderFrame === null || event.senderFrame !== mainWindow.webContents.mainFrame) {
      throw new Error("dsh desktop: rejected IPC from an unowned renderer");
    }
  };
  let navigation;
  const navigateMain = (url) => {
    const window2 = mainWindow;
    if (quitting || window2 === void 0 || window2.isDestroyed()) return Promise.resolve();
    if (navigation?.window === window2 && navigation.url === url) return navigation.promise;
    const next = { window: window2, url, promise: Promise.resolve() };
    next.promise = window2.loadURL(url).catch((error) => {
      if (quitting || shuttingDown || window2.isDestroyed() || navigation !== next || error instanceof Error && "code" in error && error.code === "ERR_ABORTED") return;
      navigation = void 0;
      throw error;
    });
    navigation = next;
    return next.promise;
  };
  const platformView = new DesktopPlatformView(
    join12(app6.getAppPath(), "lib", "preload-platform-account.cjs"),
    () => locale.id === "zh-CN" ? "zh_CN" : "en_US",
    process.platform === "win32" ? "win32" : "darwin"
  );
  const backend = new DesktopBackendController((onFailure) => {
    const hostInspectPort = developmentHostInspectPort(development);
    const host = managed !== void 0 ? new ManagedDesktopHost(managed, onFailure) : new DesktopHostProcess(
      resources.node,
      resources.dsh,
      activeProject,
      hostInspectPort,
      { ...hostEnvironment, DSH_CLIENT_VERSION: desktopClientVersion() },
      onFailure,
      primaryRuntime,
      resources,
      (next) => {
        platformView.setSession(next);
      }
    );
    return {
      start: async () => {
        const ready = await host.start();
        hostCookie = await authenticateWebHost(ready.url);
        hostUrl = ready.url;
        if (ready.injections === void 0) throw new Error("Desktop Host did not provide boot injections");
        injections = ready.injections;
        welcomeBackend = await connectDesktopWelcome(ready.url, (input, init) => net.fetch(input, init), async () => (await session4.defaultSession.cookies.get({ url: ready.url })).map((cookie) => `${cookie.name}=${cookie.value}`).join("; "));
        analyticsEnabled = await welcomeBackend.analyticsEnabled().catch(() => false);
        if (!reportedLaunch) {
          reportedLaunch = true;
          void track("desktop_app_launch", {});
        }
        stopAccount?.();
        const accountBackend = welcomeBackend.account;
        stopAccount = accountBackend.watch((state) => {
          if (quitting) return;
          if (welcomeWindow !== void 0 && !welcomeWindow.isDestroyed()) welcomeWindow.webContents.send(WELCOME_IPC.state, state);
          const attempt = state.attempt;
          if (attempt?.phase === "waiting-browser" && attempt.authorizeUrl !== void 0 && openedAttempt !== attempt.id) {
            openedAttempt = attempt.id;
            void shell3.openExternal(platformLoginUrl(attempt.authorizeUrl)).catch(() => void 0);
          }
          if ((attempt?.phase === "failed" || attempt?.phase === "expired") && returnedAttempt !== attempt.id) {
            returnedAttempt = attempt.id;
            focusPrimaryWindow();
          }
          if (state.status === "credential-stored" && attempt?.phase === "succeeded" && welcomeWindow !== void 0) void enterWorkspace({ activate: false }).catch(() => void 0);
          if (previousAccountStatus === "credential-stored" && state.status === "signed-out") {
            void readWelcomeState().then(async (value) => {
              if (needsWelcome(value) && !quitting) {
                enteredWorkspace = false;
                await showWelcome();
                if (welcomeWindow !== void 0 && !welcomeWindow.isDestroyed()) welcomeWindow.webContents.send(WELCOME_IPC.state, state);
              }
              return void 0;
            }).catch(() => void 0);
          }
          previousAccountStatus = state.status;
        }, () => {
        }, () => {
          void readWelcomeState().then(async (value) => {
            if (!needsWelcome(value) || quitting) return;
            pendingWelcomeNotice = "session-expired";
            enteredWorkspace = false;
            await showWelcome();
            const state = await accountBackend.state();
            if (welcomeWindow !== void 0 && !welcomeWindow.isDestroyed()) welcomeWindow.webContents.send(WELCOME_IPC.state, state);
          }).catch(() => void 0);
        }, (enabled) => {
          analyticsEnabled = enabled;
        });
      },
      stop: async () => {
        analyticsEnabled = false;
        stopAccount?.();
        try {
          await host.stop(requireCleanStop);
        } catch (error) {
          if (!requireCleanStop || !(error instanceof DesktopHostUncleanExitError)) throw error;
          updateStopFailure = error;
        }
      },
      updateTasks: (action) => host.updateTasks(action),
      inspectQuit: () => host.inspectQuit()
    };
  }, (state) => {
    if (state.phase === "error") reportFatal(state.failure, "host");
    else if (!shuttingDown) backendReady = state.phase === "ready";
  });
  const updateErrors = /* @__PURE__ */ new WeakMap();
  const showUpdateFailure = (state) => {
    if (state.phase !== "error") return Promise.resolve();
    if (isMandatory()) {
      mandatoryUI?.sync();
      return Promise.resolve();
    }
    let shown = updateErrors.get(state);
    if (shown === void 0) {
      shown = ordinaryMessageBox({
        type: "error",
        title: locale.messages.updateFailedTitle,
        message: desktopUpdateErrorSummary(state, locale.messages),
        technicalDetails: state.technicalDetails ?? state.message ?? ""
      }).then(() => {
      });
      updateErrors.set(state, shown);
    }
    return shown;
  };
  const publishUpdate = (state) => {
    updateJournal?.state(state);
    updateState = state;
    mandatoryUI?.sync();
    for (const window2 of BrowserWindow5.getAllWindows()) {
      window2.webContents.send(DESKTOP_IPC.updatesPresentation, presentDesktopUpdate(state));
    }
    if (state.phase === "error" && state.failedOperation !== "check") {
      const restoreHost = state.failedOperation === "install" && updateStoppedHost && !quitting;
      shellInstallerOwnsQuit = false;
      updateStoppedHost = false;
      if (restoreHost) {
        const hostReady = backend.start(prepareHostEnvironment);
        startup = hostReady;
        const recovery2 = hostReady.then(async () => {
          if (quitting) return;
          navigation = void 0;
          await navigateMain(applicationUrl);
          if (backend.host !== void 0) updateJournal?.action("workspace-ready");
        });
        workspaceRecovery = recovery2;
        void recovery2.catch((error) => {
          reportFatal(error, "main");
        }).finally(() => {
          if (startup === hostReady) startup = void 0;
          if (workspaceRecovery === recovery2) workspaceRecovery = void 0;
        });
      }
      void showUpdateFailure(state).catch((error) => {
        console.error(error);
      });
    }
    return state;
  };
  const readWelcomeState = async () => {
    if (backend.host === void 0 || welcomeBackend === void 0) throw new Error("desktop welcome: backend unavailable");
    return welcomeBackend.read();
  };
  stopForRecovery = () => backend.close();
  const reconcileBackend = () => {
    startup ??= (async () => {
      await navigateMain(applicationUrl);
      await backend.start(async () => {
        await Promise.all([managed === void 0 ? manager.applyRelease() : Promise.resolve(), prepareHostEnvironment()]);
      });
      if (backend.host !== void 0) await openInitialWindow();
      if (backend.host !== void 0) updateJournal?.action("workspace-ready");
    })().catch((error) => {
      updateJournal?.action("workspace-failed");
      reportFatal(error, "main");
      throw error;
    }).finally(() => {
      startup = void 0;
    });
    return startup;
  };
  const updates = new DesktopUpdateCoordinator(
    publishUpdate,
    async () => {
      if (managed !== void 0) throw new Error("SEP_CONTROLLED_UPDATE_REQUIRED");
      await commandManager.idle();
      await workspaceRecovery;
      await startup?.catch(() => void 0);
      const host = backend.host;
      if (host === void 0) throw new DesktopUpdatePreparationError("tasks-unavailable", locale.messages.updateTasksUnavailable);
      const active = await host.updateTasks("inspect");
      const ready = desktopUpdateReadyConfirmation(locale.messages, updates.state.version ?? "", process.platform);
      const confirmation = {
        type: active ? "warning" : "info",
        title: locale.messages.updateTitle,
        message: active ? locale.messages.updateActiveTasks : ready.message,
        detail: active ? locale.messages.updateActiveTasksDetail : ready.detail,
        buttons: active ? [locale.messages.updateStopTasks, locale.messages.updateLater] : [locale.messages.installAndRestart],
        defaultId: 1,
        cancelId: 1
      };
      if (isMandatory()) {
        if (!await mandatoryUI?.confirm(updates.state.version ?? "", active)) return false;
      } else {
        const parent = currentDialogWindow();
        if (parent === void 0) return false;
        const result = await updateDialog.show(parent, confirmation);
        if (result.response !== 0 || isMandatory()) return false;
      }
      await track("desktop_upgrade_install_restart_click", {});
      if (backend.host !== host) throw new DesktopUpdatePreparationError("tasks-unavailable", locale.messages.updateTasksUnavailable);
      try {
        const stillActive = await host.updateTasks("lock");
        if (stillActive && !active) throw new DesktopUpdatePreparationError("tasks-changed", locale.messages.updateTasksChanged);
        mandatoryUI?.preparingRestart(stillActive);
        await platformView.closeAndWait();
        requireCleanStop = true;
        updateStopFailure = void 0;
        await backend.stop();
        updateStoppedHost = true;
        const stopFailure = updateStopFailure;
        if (stopFailure !== void 0) throw new DesktopUpdatePreparationError("stop-failed", locale.messages.updateStopFailed, stopFailure.message);
        updateJournal?.action("install-confirmed");
        shellInstallerOwnsQuit = true;
      } catch (error) {
        if (!updateStoppedHost) await host.updateTasks("unlock").catch((unlockError) => {
          console.error(unlockError);
        });
        throw error;
      } finally {
        requireCleanStop = false;
      }
      return true;
    },
    void 0,
    () => false,
    void 0,
    (success, reason) => {
      void track("desktop_upgrade_download_result", { is_success: success, ...reason === void 0 ? {} : { error_reason: reason } });
    }
  );
  const updateSchedule = new DesktopUpdateSchedule(updates, resolveDesktopUpdateScheduleConfig(process.env));
  const downloadUpdate = async (version) => {
    void track("desktop_upgrade_click", {});
    updateJournal?.action("download-requested");
    const state = await updates.download(version);
    if (state.phase !== "ready" || quitting) return state;
    if (!isMandatory()) await windowShown();
    if (quitting) return state;
    return updates.install(version);
  };
  const windowShown = () => new Promise((resolve3) => {
    const window2 = currentDialogWindow();
    if (window2 === void 0 || window2.isDestroyed() || window2.isVisible()) {
      resolve3();
      return;
    }
    window2.once("show", () => {
      resolve3();
    });
    window2.once("closed", () => {
      resolve3();
    });
  });
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.hostname === "shell") return serveWebDocument(request, join12(app6.getAppPath(), "renderer"));
    if (url.hostname === "app") {
      if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname.startsWith("/assets/") || ["/favicon.svg", "/manifest.webmanifest"].includes(url.pathname)) {
        return serveWebDocument(request, join12(resources.dsh, "node_modules", "@deepseek-ai", "dsh-web-frontend", "dist"));
      }
      if (backend.host === void 0 || hostUrl === void 0 || hostCookie === void 0) {
        return Promise.resolve(new Response(null, { status: 503 }));
      }
      return forwardWebRequest(request, hostUrl, hostCookie, requests.signal);
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  installDesktopDirectoryPicker(() => mainWindow);
  installMicrophonePermissions(session4.defaultSession, () => mainWindow?.webContents);
  const shortcuts = installDesktopShortcuts(
    () => mainWindow,
    app6.getPath("userData"),
    process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux",
    () => {
      refreshApplicationMenu();
    },
    (window2) => updateOverlays.input(window2)
  );
  app6.on("will-quit", () => {
    shortcuts.dispose();
  });
  ipcMain6.handle(DESKTOP_IPC.boot, async (event) => {
    assertDesktopSender(event, ["app"]);
    await startup;
    if (backend.host === void 0 || hostUrl === void 0) throw new Error("Desktop Host is unavailable");
    return { injections, streamBaseUrl: new URL(hostUrl).origin };
  });
  ipcMain6.handle(DESKTOP_IPC.bootFailed, (event, message) => {
    assertDesktopSender(event, ["app"]);
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) {
      throw new Error("dsh desktop: rejected startup failure from a non-primary frame");
    }
    if (typeof message !== "string") throw new Error("dsh desktop: startup failure must be text");
    reportFatal(new Error(message), "web-boot");
  });
  ipcMain6.handle(DESKTOP_IPC.browserAcquire, (event, workspace) => {
    assertProductSender(event);
    return browserGuests.acquire(event.sender, workspace);
  });
  ipcMain6.handle(DESKTOP_IPC.browserRelease, (event, lease) => {
    assertProductSender(event);
    return browserGuests.release(event.sender, lease);
  });
  session4.defaultSession.webRequest.onBeforeSendHeaders({ urls: ["ws://127.0.0.1/*", "wss://127.0.0.1/*"] }, (details, callback) => {
    if (hostUrl === void 0 || hostCookie === void 0 || details.webContentsId !== mainWindow?.webContents.id) {
      callback({});
      return;
    }
    const target = new URL(hostUrl);
    const requested = new URL(details.url);
    if (requested.host !== target.host || requested.protocol !== (target.protocol === "https:" ? "wss:" : "ws:")) {
      callback({});
      return;
    }
    const headers = Object.fromEntries(Object.entries(details.requestHeaders).map(([name, value]) => [name.toLowerCase(), value]));
    if (headers.origin !== "dsh-app://app") {
      callback({ cancel: true });
      return;
    }
    callback({ requestHeaders: { ...headers, origin: target.origin, cookie: hostCookie, "sec-fetch-site": "same-origin" } });
  });
  const assertMainApplication = (event) => {
    const owner = mainWindow;
    if (owner === void 0 || event.sender !== owner.webContents || event.senderFrame !== owner.webContents.mainFrame || !event.senderFrame.url.startsWith("dsh-app://app/")) throw new Error("Rejected Platform command");
    return owner;
  };
  ipcMain6.on(PLATFORM_IPC.bootstrap, (event) => {
    try {
      event.returnValue = platformView.bootstrap(event);
    } catch {
      event.returnValue = null;
    }
  });
  ipcMain6.handle(PLATFORM_IPC.open, (event, page3, bounds) => {
    const owner = assertMainApplication(event);
    if (page3 !== "usage" && page3 !== "top-up") throw new Error("Invalid Platform page");
    return platformView.open(owner, page3, platformBounds(bounds));
  });
  ipcMain6.handle(PLATFORM_IPC.bounds, (event, bounds) => {
    assertMainApplication(event);
    platformView.setBounds(platformBounds(bounds));
  });
  ipcMain6.handle(PLATFORM_IPC.close, (event) => {
    assertMainApplication(event);
    platformView.close();
  });
  ipcMain6.on(DESKTOP_IPC.nativeThemeSet, (event, source) => {
    if (mainWindow === void 0 || event.sender !== mainWindow.webContents) return;
    if (source === "light" || source === "dark" || source === "system") nativeTheme.themeSource = source;
  });
  ipcMain6.handle(DESKTOP_IPC.localeBootstrap, async (event) => {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || new URL(event.senderFrame.url).origin !== new URL(applicationUrl).origin) {
      throw new Error("desktop welcome: rejected locale request from an unowned frame");
    }
    if (welcomeBackend === void 0) throw new Error("desktop welcome: backend unavailable");
    return { languages: systemLanguages, preference: await welcomeBackend.readLocalePreference() };
  });
  ipcMain6.on(DESKTOP_IPC.localeChanged, (event, next) => {
    const window2 = mainWindow;
    if (window2 === void 0 || event.sender !== window2.webContents || event.senderFrame !== window2.webContents.mainFrame || typeof next !== "string") return;
    const current = resolveDesktopStartupLocale(next, systemLanguages);
    if (current.id === locale.id) return;
    locale = current;
    platformView.notifyLocaleChanged();
    windowsLanguage = locale.id;
    refreshApplicationMenu();
  });
  ipcMain6.handle(DESKTOP_IPC.updatePreferencesGet, (event) => {
    assertProductSender(event);
    return sepUpdates?.getUpdatePreferences() ?? null;
  });
  ipcMain6.handle(DESKTOP_IPC.updatePreferencesSet, (event, strength) => {
    assertProductSender(event);
    if (sepUpdates === void 0) throw new Error("UPDATE_PREFERENCES_UNAVAILABLE");
    if (strength !== "weak" && strength !== "medium" && strength !== "strong") throw new Error("UPDATE_FILTER_INVALID");
    return sepUpdates.setUpdatePreferences(strength);
  });
  ipcMain6.handle(DESKTOP_IPC.sepUpdatesStatus, (event) => {
    assertProductSender(event);
    return presentDesktopUpdate(sepUpdates === void 0 ? { phase: "idle" } : presentManagedState(sepUpdates.sepStatus()));
  });
  ipcMain6.handle(DESKTOP_IPC.sepUpdatesOpen, async (event) => {
    assertProductSender(event);
    await sepUpdates?.checkSep();
  });
  ipcMain6.handle(DESKTOP_IPC.updatesStatus, (event) => {
    assertProductSender(event);
    return presentDesktopUpdate(sepUpdates === void 0 ? updates.state : presentManagedState(sepUpdates.status()));
  });
  ipcMain6.handle(DESKTOP_IPC.deviceInfo, (event) => {
    assertProductSender(event);
    return readDeviceInfo();
  });
  ipcMain6.handle(DESKTOP_IPC.onboardingApiKey, async (event) => {
    if (requests.signal.aborted) return false;
    assertProductSender(event);
    return requests.run(async () => (await readWelcomeState()).hasApiKey, false);
  });
  ipcMain6.on(DESKTOP_IPC.onboardingActive, (event, active) => {
    const window2 = mainWindow;
    if (window2 === void 0 || window2.isDestroyed() || event.sender !== window2.webContents || event.senderFrame !== window2.webContents.mainFrame || !event.senderFrame.url.startsWith(`${SCHEME}://app/`) || typeof active !== "boolean") return;
    window2.setMinimumSize(active ? 960 : 520, 600);
    if (active) {
      const { width, height } = window2.getBounds();
      if (width < 960) window2.setSize(960, height);
    }
  });
  ipcMain6.handle(DESKTOP_IPC.updatesOpen, async (event) => {
    assertProductSender(event);
    await openUpdatePrompt();
  });
  let promptOperation;
  let policyAuthenticationQueued = false;
  const openUpdatePrompt = (manual = false) => {
    if (sepUpdates !== void 0) return sepUpdates.check().then(() => {
    });
    if (authenticationOperation !== void 0) {
      policyAuth?.focus();
      updateDialog.focus();
    }
    let failedOperation = "check";
    promptOperation ??= Promise.resolve().then(async () => {
      if (manual) updateJournal?.action("check-requested");
      const joinedPolicyAuthentication = authenticationOperation !== void 0;
      if (joinedPolicyAuthentication) await authenticatePolicy();
      if (isMandatory()) {
        mandatoryUI?.focus();
        if (manual) await Promise.all([checkPolicyManually(), updateSchedule.check(true)]);
        return;
      }
      let controller;
      let progress;
      try {
        let state = updates.state;
        if (manual || state.phase === "idle" || state.phase === "error" && state.failedOperation === "check") {
          controller = new AbortController();
          ordinaryDialogs.add(controller);
          const parent = currentDialogWindow();
          progress = parent === void 0 ? Promise.resolve() : updateDialog.show(parent, {
            type: "info",
            title: locale.messages.updateCheckTitle,
            message: locale.messages.updateChecking,
            buttons: [locale.messages.later],
            cancelId: 0,
            signal: controller.signal
          });
          if (!joinedPolicyAuthentication) {
            void checkPolicyManually("deferred").catch((error) => {
              console.error(error);
            });
          }
          state = await updateSchedule.check(true);
        }
        if (isMandatory()) {
          mandatoryUI?.focus();
          return;
        }
        if (state.phase === "error" && state.failedOperation === "check") {
          await showUpdateFailure(state);
          return;
        }
        if (state.phase === "idle") {
          await ordinaryMessageBox({
            type: "info",
            title: locale.messages.updateCheckTitle,
            message: locale.messages.updateCurrent,
            detail: formatDesktopMessage(locale.messages.updateCurrentDetail, { version: app6.getVersion() })
          });
          return;
        }
        if (state.phase === "ready" || state.phase === "error" && state.failedOperation === "install") {
          if (state.version !== void 0) {
            failedOperation = "install";
            await showUpdateFailure(await updates.install(state.version));
          }
          return;
        }
        if (state.phase !== "available" && !(state.phase === "error" && state.failedOperation === "download")) return;
        if (manual) {
          const result = await ordinaryMessageBox({
            title: locale.messages.updateCheckTitle,
            message: formatDesktopMessage(locale.messages.updateAvailable, { version: state.version ?? "" }),
            detail: locale.messages.updateDetail,
            buttons: [locale.messages.updateDownload],
            cancelId: 1
          });
          if (result.response !== 0) return;
        }
        if (!isMandatory() && state.version !== void 0) {
          controller?.abort();
          failedOperation = "download";
          await showUpdateFailure(await downloadUpdate(state.version));
        }
      } finally {
        controller?.abort();
        if (controller !== void 0) ordinaryDialogs.delete(controller);
        await progress;
      }
    }).catch((error) => showUpdateFailure({
      phase: "error",
      failedOperation,
      message: desktopErrorState(error).message
    })).finally(() => {
      promptOperation = void 0;
      flushQueuedPolicyAuthentication();
    });
    return promptOperation;
  };
  let authenticationOperation;
  const authenticatePolicy = () => {
    if (authenticationOperation !== void 0) {
      policyAuth?.focus();
      updateDialog.focus();
    }
    authenticationOperation ??= runPolicyAuthentication().finally(() => {
      authenticationOperation = void 0;
    });
    return authenticationOperation;
  };
  const flushQueuedPolicyAuthentication = () => {
    if (!policyAuthenticationQueued || promptOperation !== void 0 || authenticationOperation !== void 0 || isMandatory() || quitting) return;
    policyAuthenticationQueued = false;
    void authenticatePolicy().catch((error) => {
      console.error(error);
    });
  };
  const queuePolicyAuthentication = () => {
    if (!desktopSettings.updates.allowTestAuthPopupWindow) return;
    if (authenticationOperation !== void 0) {
      policyAuth?.focus();
      updateDialog.focus();
      return;
    }
    policyAuthenticationQueued = true;
    flushQueuedPolicyAuthentication();
  };
  const runPolicyAuthentication = async () => {
    if (!desktopSettings.updates.allowTestAuthPopupWindow || policyAuth === void 0 || mandatoryPolicy === void 0 || quitting) return void 0;
    const parent = mandatoryUI?.confirmationWindow ?? currentDialogWindow();
    if (parent === void 0) return void 0;
    const consent = await updateDialog.show(parent, {
      type: "info",
      title: locale.messages.policyLoginTitle,
      message: locale.messages.policyLoginRequired,
      buttons: [locale.messages.policyLogin, locale.messages.later],
      cancelId: 1
    });
    if (consent.response !== 0 || isQuitting()) return void 0;
    const outcome = await policyAuth.login();
    if (isQuitting() || outcome === "cancelled") return void 0;
    if (outcome === "failed") {
      await updateDialog.show(parent, {
        type: "error",
        title: locale.messages.policyLoginTitle,
        message: locale.messages.policyLoginFailed,
        buttons: [locale.messages.updateAcknowledge],
        cancelId: 0
      });
      return void 0;
    }
    await mandatoryPolicy.check("login-return");
    if (isQuitting()) return void 0;
    return mandatoryPolicy.check("login-return", true);
  };
  const checkPolicyManually = async (authentication = "immediate") => {
    if (authenticationOperation !== void 0) return authenticatePolicy();
    const policy = await mandatoryPolicy?.check("manual", true);
    if (policy?.error !== "authentication-required" || !desktopSettings.updates.allowTestAuthPopupWindow) return policy;
    if (authentication === "immediate") return authenticatePolicy();
    queuePolicyAuthentication();
    return policy;
  };
  const automaticCheck = () => {
    if (managed !== void 0) return;
    if (!quitting) void mandatoryPolicy?.check("foreground-or-resume").catch((error) => {
      console.error(error);
    });
    if (!quitting) void updateSchedule.check().catch((error) => {
      console.error(error);
    });
  };
  powerMonitor.on("resume", automaticCheck);
  app6.on("will-quit", () => {
    sepUpdates?.close();
    updateSchedule.dispose();
    powerMonitor.off("resume", automaticCheck);
    updates.dispose();
  });
  app6.setAboutPanelOptions({
    applicationName: "DeepSeek Harness",
    applicationVersion: app6.getVersion(),
    // The release has no separate build number; omit Electron's bundle version.
    version: "",
    copyright: "",
    iconPath: applicationIconPath
  });
  const darwin = process.platform === "darwin";
  const platformMenus = () => darwin ? [shortcuts.fileMenu(currentDesktopLocale().messages), { role: "editMenu" }, { role: "windowMenu" }] : [{ role: "editMenu" }];
  const hideCommands = darwin ? [
    { role: "hide", label: currentDesktopLocale().messages.hideApplication },
    { role: "hideOthers", label: currentDesktopLocale().messages.hideOtherApplications },
    { role: "unhide", label: currentDesktopLocale().messages.showAllApplications },
    { type: "separator" }
  ] : [];
  const applicationItems = () => [
    // Windows has no system About panel; Electron's fallback is a plain
    // message box, so the shell shows its own dimmed dialog instead.
    process.platform === "win32" ? {
      label: currentDesktopLocale().messages.aboutMenu,
      click: () => {
        void showAbout().catch((error) => {
          console.error(error);
        });
      }
    } : { label: currentDesktopLocale().messages.aboutMenu, role: "about" },
    { type: "separator" },
    { label: managed === void 0 ? currentDesktopLocale().messages.checkUpdatesMenu : currentDesktopLocale().messages.sepCheckHostUpdates, click: () => {
      void openUpdatePrompt(true);
    } },
    { label: currentDesktopLocale().messages.sepCheckSuiteUpdates, visible: managed !== void 0, click: () => {
      void sepUpdates?.checkSep();
    } },
    { label: locale.messages.sepPluginReport, visible: managed !== void 0, click: () => {
      void sepUpdates?.report();
    } },
    { label: locale.messages.sepCancelUpdate, visible: managed !== void 0, click: () => {
      void sepUpdates?.cancel();
    } },
    ...managed === void 0 && (process.platform === "darwin" || process.platform === "win32") ? [{ label: currentDesktopLocale().messages.cliCommandMenu, click: () => {
      void commandManager.show();
    } }] : [],
    ...development ? [
      { type: "separator" },
      { label: currentDesktopLocale().messages.reloadPageMenu, role: "reload" },
      { label: currentDesktopLocale().messages.restartAppHostMenu, click: () => {
        if (quitting) return;
        app6.relaunch();
        quitWithoutConfirmation();
      } }
    ] : [],
    { type: "separator" },
    ...hideCommands,
    { role: "quit", ...darwin ? { label: currentDesktopLocale().messages.quitApplication } : process.platform === "win32" ? { label: currentDesktopLocale().messages.exitApplication } : {} }
  ];
  const devToolsItems = [
    { role: "toggleDevTools", visible: false },
    { role: "toggleDevTools", visible: false, accelerator: "F12" }
  ];
  const refreshApplicationMenu = () => {
    Menu2.setApplicationMenu(Menu2.buildFromTemplate(process.platform === "win32" ? devToolsItems : [{
      label: darwin ? app6.name : currentDesktopLocale().messages.application,
      submenu: [...applicationItems(), ...devToolsItems]
    }, ...platformMenus()]));
    tray?.relabel();
  };
  refreshApplicationMenu();
  const trayIconPath = development ? join12(app6.getAppPath(), "resources", "tray-windows.ico") : join12(process.resourcesPath, "tray.ico");
  if (process.platform === "win32") {
    try {
      tray = new DesktopTray({
        iconPath: trayIconPath,
        locale: currentDesktopLocale,
        open: () => {
          focusPrimaryWindow();
        },
        quit: () => {
          app6.quit();
        }
      });
    } catch (error) {
      console.warn("desktop tray: unavailable", error);
    }
  }
  const backgroundNotice = process.platform === "win32" ? new DesktopBackgroundNotice({
    markerPath: join12(app6.getPath("userData"), "background-close-confirmed"),
    locale: () => locale,
    show: ordinaryMessageBox,
    focus: () => {
      updateDialog.focus();
    }
  }) : void 0;
  const quitConfirmation = new DesktopQuitConfirmation({
    locale: () => locale,
    inspect: () => backend.host?.inspectQuit(),
    // No owner window: a hidden window stays hidden and the native box is its own top-level window.
    show: (options) => dialog2.showMessageBox(options),
    // macOS raises the open alert with the application; Electron exposes no handle to the Windows task
    // dialog, so a repeated request there only joins the open decision.
    focus: () => {
      if (process.platform === "darwin") app6.focus({ steal: true });
    },
    // The task dialog draws its main icon at the system icon size; the multi-size ICO yields that
    // size directly, where the 1024 px PNG would be scaled down by GDI.
    ...process.platform === "win32" ? { icon: nativeImage2.createFromPath(trayIconPath) } : {}
  });
  if (process.platform === "win32") {
    ipcMain6.handle(DESKTOP_IPC.windowsMenu, (event, name, x, y) => {
      assertDesktopSender(event, ["app"]);
      if (mainWindow === void 0 || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error("desktop menu: rejected sender");
      if (name !== "application" && name !== "edit" || typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 1e5 || y > 1e5) throw new Error("desktop menu: invalid popup request");
      const window2 = mainWindow;
      const editItem = (label, keyCode, modifiers, accelerator) => ({
        label,
        ...accelerator === void 0 ? {} : { accelerator },
        click: () => {
          shortcuts.sendEditingKey(keyCode, modifiers);
        }
      });
      const items = name === "application" ? applicationItems() : [
        editItem(currentDesktopLocale().messages.undo, "Z", ["control"], "Ctrl+Z"),
        editItem(currentDesktopLocale().messages.redo, "Y", ["control"], "Ctrl+Y"),
        { type: "separator" },
        editItem(currentDesktopLocale().messages.cut, "X", ["control"], "Ctrl+X"),
        editItem(currentDesktopLocale().messages.copy, "C", ["control"], "Ctrl+C"),
        editItem(currentDesktopLocale().messages.paste, "V", ["control"], "Ctrl+V"),
        editItem(currentDesktopLocale().messages.delete, "Delete", []),
        { type: "separator" },
        editItem(currentDesktopLocale().messages.selectAll, "A", ["control"], "Ctrl+A")
      ];
      const zoom = mainWindow.webContents.getZoomFactor();
      return new Promise((resolve3) => {
        Menu2.buildFromTemplate(items).popup({ window: window2, x: Math.round(x * zoom), y: Math.round(y * zoom), callback: resolve3 });
      });
    });
    ipcMain6.on(DESKTOP_IPC.windowsAppearance, (event, language, color, symbolColor) => {
      if (mainWindow === void 0 || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return;
      if (!event.senderFrame.url.startsWith(`${SCHEME}://app/`)) return;
      if (typeof language === "string" && /^[a-zA-Z]+(?:-[a-zA-Z0-9]+)*$/u.test(language)) {
        windowsLanguage = language;
      }
      const validColor = (value) => typeof value === "string" && /^(?:#[\da-f]{3,8}|rgba?\([\d.,%\s]+\))$/iu.test(value);
      if (validColor(color) && validColor(symbolColor)) mainWindow.setTitleBarOverlay({ color, symbolColor });
    });
  }
  const hideMainWindow = (window2) => {
    if (process.platform === "darwin" && window2.isFullScreen()) {
      window2.once("leave-full-screen", () => {
        if (!window2.isDestroyed()) window2.hide();
      });
      window2.setFullScreen(false);
    } else {
      window2.hide();
    }
  };
  const createMainWindow = () => {
    const window2 = createWindow(appPreload, false, true);
    mainWindow = window2;
    browserGuests.bind(window2, (guest, name) => shortcuts.attachGuest(window2, guest, name));
    shortcuts.attach(window2);
    window2.on("focus", automaticCheck);
    window2.on("close", (event) => {
      if (quitting || shellInstallerOwnsQuit || sessionEnding) return;
      event.preventDefault();
      if (updateDialog.isOpen) {
        updateDialog.focus();
        return;
      }
      const hide = () => {
        if (!quitting && !shellInstallerOwnsQuit && !sessionEnding && !window2.isDestroyed()) hideMainWindow(window2);
      };
      if (backgroundNotice === void 0) hide();
      else backgroundNotice.close(hide);
    });
    if (process.platform === "win32") {
      window2.on("session-end", () => {
        sessionEnding = true;
      });
    } else {
      window2.on("focus", () => {
        sessionEnding = false;
      });
      window2.on("show", () => {
        sessionEnding = false;
      });
    }
    window2.on("closed", () => {
      if (mainWindow === window2) mainWindow = void 0;
    });
    window2.webContents.on("console-message", (details) => {
      if (details.level !== "error") return;
      rendererConsole.push(`${details.sourceId}:${String(details.lineNumber)} ${details.message}`);
    });
    window2.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3 && !quitting && !window2.isDestroyed()) {
        reportFatal(new Error(`Desktop page failed to load: ${url} (${String(code)}: ${description})`), "renderer");
      }
    });
    window2.webContents.on("preload-error", (_event, _path, error) => {
      if (!quitting && !window2.isDestroyed()) reportFatal(error, "renderer");
    });
    window2.webContents.on("render-process-gone", (_event, details) => {
      navigation = void 0;
      if (!quitting && !window2.isDestroyed() && details.reason !== "clean-exit") {
        reportFatal(new Error(`Desktop renderer exited: ${details.reason}`), "renderer");
      }
    });
    return window2;
  };
  const enterWorkspace = async ({ activate = true } = {}) => {
    if (quitting) return;
    const window2 = mainWindow ?? createMainWindow();
    await navigateMain(applicationUrl);
    if (isQuitting() || recovery.active || window2.isDestroyed()) return;
    if (activate) window2.show();
    else window2.showInactive();
    enteredWorkspace = true;
    if (welcomeWindow !== void 0) {
      welcomeWindow.close();
      window2.webContents.send(DESKTOP_IPC.enterWorkspace);
    }
    welcomeWindow = void 0;
    if (raiseAfterUpdate) {
      raiseAfterUpdate = false;
      window2.moveTop();
      window2.focus();
    }
    if (activate && development && process.env.DSH_DESKTOP_OPEN_DEVTOOLS !== "0") {
      window2.webContents.openDevTools({ mode: "detach" });
    }
  };
  let openingWelcome;
  const showWelcome = () => {
    if (quitting) return Promise.resolve();
    if (welcomeWindow !== void 0 && !welcomeWindow.isDestroyed()) {
      if (!welcomeWindow.isVisible()) void track("auth_page_view", {});
      welcomeWindow.show();
      welcomeWindow.focus();
      return Promise.resolve();
    }
    openingWelcome ??= (async () => {
      welcomeWindow = await openWelcomeWindow(locale, {
        analytics: track,
        analyticsEnabled: () => Promise.resolve(analyticsEnabled),
        takeNotice: () => {
          const notice = pendingWelcomeNotice;
          pendingWelcomeNotice = void 0;
          return Promise.resolve(notice);
        },
        startSignIn: async () => {
          if (welcomeBackend === void 0) throw new Error("desktop welcome: backend unavailable");
          return welcomeBackend.account.start(desktopClientMetadata(locale.id));
        },
        cancelSignIn: async (id) => {
          if (welcomeBackend === void 0) throw new Error("desktop welcome: backend unavailable");
          return welcomeBackend.account.cancel(id);
        },
        copySignInLink: async (id) => {
          const state = await welcomeBackend?.account.state();
          if (state?.attempt?.id !== id || state.attempt.phase !== "waiting-browser" || state.attempt.authorizeUrl === void 0) {
            throw new Error("desktop welcome: login link is unavailable");
          }
          await clipboard2.writeText(platformLoginUrl(state.attempt.authorizeUrl));
        },
        saveApiKey: async (apiKey) => {
          if (backend.host === void 0 || welcomeBackend === void 0) return { ok: false };
          const saved = await welcomeBackend.save(apiKey);
          if (!saved.ok) return saved;
          await enterWorkspace();
          return { ok: true };
        },
        skip: enterWorkspace
      });
      const window2 = welcomeWindow;
      window2.once("closed", () => {
        if (quitting) return;
        void welcomeBackend?.account.state().then((state) => {
          if (state.attempt !== null && !enteredWorkspace) return welcomeBackend?.account.cancel(state.attempt.id);
          return void 0;
        }).catch(() => void 0);
      });
      window2.once("closed", () => {
        if (welcomeWindow === window2) welcomeWindow = void 0;
        if (quitting || enteredWorkspace || recovery.active) return;
        if (process.platform === "darwin") mainWindow?.destroy();
        else app6.quit();
      });
      if (isQuitting() || recovery.active || enteredWorkspace) window2.close();
      else mainWindow?.hide();
    })().finally(() => {
      openingWelcome = void 0;
    });
    return openingWelcome;
  };
  const openInitialWindow = async () => {
    if (quitting || recovery.active) return;
    const state = await readWelcomeState();
    if (isQuitting() || backend.state.phase !== "ready") return;
    locale = resolveDesktopStartupLocale(state.localePreference, systemLanguages);
    windowsLanguage = locale.id;
    refreshApplicationMenu();
    if (!enteredWorkspace && needsWelcome({ loggedIn: state.loggedIn, hasApiKey: state.hasApiKey })) {
      raiseAfterUpdate = false;
      await showWelcome();
    } else {
      await enterWorkspace();
    }
  };
  focusPrimaryWindow = () => {
    if (quitting) return;
    void sepUpdates?.open();
    if (isMandatory()) {
      mandatoryUI?.focus();
      return;
    }
    const window2 = welcomeWindow ?? mainWindow;
    if (window2 === void 0 || window2.isDestroyed()) {
      try {
        createMainWindow();
      } catch (error) {
        reportFatal(error, "main");
        return;
      }
      void (backend.state.phase === "ready" ? openInitialWindow() : navigateMain(applicationUrl)).catch((error) => {
        reportFatal(error, "main");
      });
      return;
    }
    if (window2 === mainWindow && !enteredWorkspace) return;
    if (window2.isMinimized()) window2.restore();
    window2.show();
    window2.focus();
  };
  if (app6.isPackaged || process.env.DSH_DESKTOP_DEV_APP === "1") app6.setAsDefaultProtocolClient("dsh-sep");
  app6.on("open-url", (event, url) => {
    event.preventDefault();
    if (url === "dsh-sep://open" || url === "dsh-sep://open/") focusPrimaryWindow();
  });
  app6.on("activate", (_event, hasVisibleWindows) => {
    if (!hasVisibleWindows) focusPrimaryWindow();
  });
  app6.on("window-all-closed", () => {
    if (!quitting && process.platform !== "darwin") app6.quit();
  });
  if (process.platform !== "win32") powerMonitor.on("shutdown", () => {
    sessionEnding = true;
  });
  const finishQuit = () => {
    quitting = true;
    requests.close();
    sepUpdates?.close();
    shuttingDown = true;
    updateJournal?.action("quit-requested");
    quitConfirmation.dispose();
    backgroundNotice?.dispose();
    tray?.dispose();
    stopAccount?.();
    if (welcomeWindow !== void 0 && !welcomeWindow.isDestroyed()) welcomeWindow.hide();
    if (mainWindow !== void 0 && !mainWindow.isDestroyed()) mainWindow.hide();
    updateSchedule.dispose();
    updateDialog.dispose();
    mandatoryUI?.dispose();
    if (welcomeWindow !== void 0 && !welcomeWindow.isDestroyed()) welcomeWindow.destroy();
    if (mainWindow !== void 0 && !mainWindow.isDestroyed()) mainWindow.destroy();
    void Promise.all([
      Promise.resolve(mandatoryPolicy?.dispose()).then(() => policyAuth?.dispose()),
      backend.close(),
      // A Platform cleanup failure is logged without cutting the remaining Host shutdown short.
      platformView.dispose().catch((error) => {
        console.error(error);
      })
    ]).catch((error) => {
      console.error(error);
    }).finally(() => {
      app6.quit();
    });
  };
  app6.on("before-quit", (event) => {
    if (shellInstallerOwnsQuit) {
      shuttingDown = true;
      quitConfirmation.dispose();
      backgroundNotice?.dispose();
      updateJournal?.action("quit-requested");
      tray?.dispose();
      updateDialog.dispose();
      mandatoryUI?.dispose();
      void platformView.dispose().catch((error) => {
        console.error(error);
      });
      return;
    }
    if (quitting) return;
    event.preventDefault();
    if (skipQuitConfirmation || sessionEnding) {
      finishQuit();
      return;
    }
    void quitConfirmation.confirm().then((approved) => {
      if (quitting || shellInstallerOwnsQuit) return;
      if (approved) {
        finishQuit();
        return;
      }
      if (!enteredWorkspace && !recovery.active) void showWelcome().catch((error) => {
        reportFatal(error, "main");
      });
    }).catch((error) => {
      console.error(error);
      if (!quitting && !shellInstallerOwnsQuit) finishQuit();
    });
  });
  mainWindow = createMainWindow();
  const manifest = JSON.parse(await readFile4(join12(app6.getAppPath(), "package.json"), "utf8"));
  if (typeof manifest !== "object" || manifest === null) throw new Error("desktop policy: invalid application manifest");
  const developmentPolicy = app6.isPackaged ? void 0 : process.env.DSH_DESKTOP_MANDATORY_UPDATE_CONFIG;
  const policyInput = app6.isPackaged ? "dshMandatoryUpdatePolicy" in manifest ? manifest.dshMandatoryUpdatePolicy : void 0 : developmentPolicy === void 0 ? void 0 : JSON.parse(developmentPolicy);
  const policyConfig = void 0;
  if (policyConfig !== void 0) {
    if (policyConfig.authentication === "feishu-test") {
      policyAuth = new DesktopPolicyTestAuth(
        policyConfig.origin,
        policyConfig.allowedAuthOrigins,
        locale,
        () => mandatoryUI?.confirmationWindow ?? currentDialogWindow(),
        (event) => {
          console.info(`desktop policy authentication: ${event}`);
          updateJournal?.action(`policy-login-${event}`);
        }
      );
    }
    if (!["win32", "darwin"].includes(process.platform) || !["x64", "arm64"].includes(process.arch)) throw new Error("desktop policy: unsupported platform");
    let wasBlocking = false;
    mandatoryPolicy = new DesktopMandatoryUpdatePolicy(policyConfig, {
      platform: process.platform,
      arch: process.arch,
      bundledDshVersion: app6.isPackaged ? readDesktopRuntime(resources.dsh).release.version : app6.getVersion()
    }, (state) => {
      if (state.error !== "authentication-required") policyAuthenticationQueued = false;
      if (state.blocking) {
        for (const controller of ordinaryDialogs) controller.abort();
        if (!wasBlocking) updateDialog.cancel();
      }
      mandatoryUI?.sync();
      if (state.blocking && !wasBlocking) void updateSchedule.check(false, true).catch((error) => {
        console.error(error);
      });
      wasBlocking = state.blocking;
    }, policyAuth?.request, () => desktopClientMetadata(locale.id));
    const policy = mandatoryPolicy;
    mandatoryUI = new DesktopMandatoryUpdateWindow({
      overlays: updateOverlays,
      preload: fileURLToPath2(new URL("./preload-mandatory.cjs", import.meta.url)),
      locale,
      allowedPageOrigins: policyConfig.allowedPageOrigins,
      parent: () => mainWindow,
      policy: () => policy.state,
      update: () => updates.state,
      refresh: async () => {
        await Promise.all([checkPolicyManually(), updateSchedule.check(true)]);
      },
      download: downloadUpdate,
      install: (version) => updates.install(version)
    });
    void mandatoryPolicy.check("launch").then((state) => {
      if (app6.isPackaged && state.error === "authentication-required" && !isQuitting()) queuePolicyAuthentication();
    }).catch((error) => {
      console.error(error);
    });
  }
  automaticCheck();
  await reconcileBackend().catch(() => void 0);
  if (isQuitting()) return;
  void sepUpdates?.open();
  const window = currentMainWindow();
  if (window !== void 0 && development && process.env.DSH_DESKTOP_OPEN_DEVTOOLS !== "0") {
    window.webContents.openDevTools({ mode: "detach" });
  }
  publishUpdate(updateState);
}
var ownsDesktopInstance = claimDesktopSingleInstance(app6, () => {
  focusPrimaryWindow();
});
if (ownsDesktopInstance) void app6.whenReady().then(main).catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  const diagnosticFile = process.env.DSH_DESKTOP_DIAGNOSTIC_FILE;
  if (diagnosticFile !== void 0) {
    await writeFile2(diagnosticFile, `${error instanceof Error ? error.stack ?? message : message}
`).catch(() => void 0);
  }
  reportFatal(error, "main");
}).catch((error) => {
  console.error(error);
  app6.exit(1);
});
