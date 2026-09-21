import { Tray as SepTray, nativeImage as sepNativeImage } from "electron";
import { createSepBackgroundLifecycle } from "./sep-background.mjs";
import { createManagedUpdater } from "./sep-update/update-desktop.mjs";
// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/windows-layout.ts
var WINDOWS_TITLEBAR_HEIGHT = 40;

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/main.ts
import { readFile as readFile3, writeFile } from "node:fs/promises";
import { join as join10 } from "node:path";
import { fileURLToPath } from "node:url";
import {
  app as app4,
  BrowserWindow as BrowserWindow4,
  dialog as dialog2,
  ipcMain as ipcMain4,
  Menu,
  powerMonitor,
  nativeTheme,
  protocol,
  session as session2,
  shell as shell2
} from "electron";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/paths.ts
import { join } from "node:path";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
function resolveDesktopPaths(dshHome = resolveDshHome()) {
  return {
    profile: join(dshHome, "profiles", "desktop"),
    lock: join(dshHome, "profiles", "desktop", "lock")
  };
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/project-manager.ts
import {
  existsSync as existsSync3,
  fsyncSync,
  lstatSync as lstatSync5,
  mkdirSync,
  openSync,
  realpathSync,
  closeSync,
  readFileSync as readFileSync5,
  unlinkSync as unlinkSync3,
  writeFileSync as writeFileSync3,
  writeSync
} from "node:fs";
import { join as join6 } from "node:path";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/core-package-set.ts
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join as join2 } from "node:path";
var DESKTOP_PACKAGE_SET_FILE = "desktop-packages.json";
var DESKTOP_HOST_PACKAGE = "@deepseek-ai/dsh-desktop-host";
var PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/u;
var VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+_-]*$/u;
var FILE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.tgz$/u;
var INTEGRITY_PATTERN = /^sha512-[A-Za-z0-9+/]+={0,2}$/u;
var DSH_PACKAGE = "@deepseek-ai/dsh";
var RELEASE_PACKAGES = [DSH_PACKAGE, DESKTOP_HOST_PACKAGE];
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseDesktopCorePackageSet(value, expectedReleaseVersion) {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.packages)) {
    throw new Error("desktop package set: invalid descriptor");
  }
  const packages = value.packages.map((entry) => {
    if (!isRecord(entry) || typeof entry.name !== "string" || !PACKAGE_NAME_PATTERN.test(entry.name) || typeof entry.version !== "string" || !VERSION_PATTERN.test(entry.version) || typeof entry.file !== "string" || !FILE_PATTERN.test(entry.file) || typeof entry.bytes !== "number" || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || typeof entry.integrity !== "string" || !INTEGRITY_PATTERN.test(entry.integrity)) {
      throw new Error("desktop package set: invalid package record");
    }
    return {
      name: entry.name,
      version: entry.version,
      file: entry.file,
      bytes: entry.bytes,
      integrity: entry.integrity
    };
  });
  const names = new Set(packages.map((entry) => entry.name));
  const files = new Set(packages.map((entry) => entry.file));
  if (names.size !== packages.length || files.size !== packages.length) {
    throw new Error("desktop package set: duplicate package name or filename");
  }
  const sorted = [...packages].sort((left, right) => left.name.localeCompare(right.name));
  if (JSON.stringify(sorted) !== JSON.stringify(packages)) {
    throw new Error("desktop package set: packages must be sorted by name");
  }
  for (const name of RELEASE_PACKAGES) {
    const entry = packages.find((candidate) => candidate.name === name);
    if (entry === void 0) throw new Error(`desktop package set: missing ${name}`);
    if (expectedReleaseVersion !== void 0 && entry.version !== expectedReleaseVersion) {
      throw new Error(`desktop package set: ${name}@${entry.version} does not match Desktop ${expectedReleaseVersion}`);
    }
  }
  return { schemaVersion: 1, packages };
}
function readDesktopCorePackageSet(projectDir, expectedReleaseVersion) {
  const path = join2(projectDir, DESKTOP_PACKAGE_SET_FILE);
  let value;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`desktop package set: failed to read ${path}: ${String(error)}`);
  }
  return parseDesktopCorePackageSet(value, expectedReleaseVersion);
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/runtime-tree.ts
import { lstatSync as lstatSync2, readdirSync as readdirSync2, readFile, readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { isAbsolute, join as join3, relative, sep } from "node:path";
import { promisify } from "node:util";
import { valid as valid2 } from "semver";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/release.ts
import { valid } from "semver";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/runtime-tree.ts
var DESKTOP_RUNTIME_FILE = "desktop-runtime.json";
var PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/u;
var readRuntimeFile = promisify(readFile);
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readDesktopRuntime(root) {
  const value = JSON.parse(readFileSync2(join3(root, DESKTOP_RUNTIME_FILE), "utf8"));
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

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/project-manager.ts
import {
  initProfile,
  PROFILE_TEMPLATES,
  sanitizeProfile
} from "@deepseek-ai/dsh-app-boot";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/profile-packages.ts
import { lstatSync as lstatSync3, readFileSync as readFileSync3, readlinkSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute as isAbsolute2, join as join4, resolve } from "node:path";
var DESKTOP_PROFILE_STATE = "desktop-runtime-state.json";
var PACKAGE_NAME2 = /^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/u;
function record2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stat(path) {
  try {
    return lstatSync3(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return void 0;
  }
}
function migrateDesktopProfileLinks(profile) {
  const statePath = join4(profile, DESKTOP_PROFILE_STATE);
  if (stat(statePath) === void 0) return;
  const value = JSON.parse(readFileSync3(statePath, "utf8"));
  if (!record2(value) || !Array.isArray(value.links)) throw new Error("desktop profile: invalid legacy package links");
  const links = value.links.map((link) => {
    if (!record2(link) || typeof link.name !== "string" || !PACKAGE_NAME2.test(link.name) || typeof link.target !== "string" || !isAbsolute2(link.target)) {
      throw new Error("desktop profile: invalid legacy package link");
    }
    return { name: link.name, target: link.target };
  });
  const modules = join4(profile, "node_modules");
  if (stat(modules)?.isDirectory() === true) {
    for (const link of links) {
      const path = join4(modules, link.name);
      if (dirname(path) !== modules && stat(dirname(path))?.isDirectory() !== true) continue;
      if (stat(path)?.isSymbolicLink() === true && resolve(dirname(path), readlinkSync(path)) === resolve(link.target)) {
        unlinkSync(path);
      }
    }
  }
  unlinkSync(statePath);
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/profile-core-cleanup.ts
import { existsSync as existsSync2, lstatSync as lstatSync4, readFileSync as readFileSync4, rmSync, unlinkSync as unlinkSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname as dirname2, join as join5 } from "node:path";
import { dump, load } from "js-yaml";
var CLEAN_PROFILE_CORE_PACKAGES = true;
function object(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("desktop profile cleanup: expected an object");
  }
  return value;
}
function stat2(path) {
  try {
    return lstatSync4(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return void 0;
  }
}
function remove(path) {
  const entry = stat2(path);
  if (entry === void 0) return false;
  if (entry.isSymbolicLink()) unlinkSync2(path);
  else rmSync(path, { recursive: entry.isDirectory() });
  return true;
}
function requireDirectory(path) {
  const entry = stat2(path);
  if (entry !== void 0 && (!entry.isDirectory() || entry.isSymbolicLink())) {
    throw new Error(`desktop profile cleanup: package parent is not a real directory: ${path}`);
  }
}
function prune(value, field, names) {
  if (value[field] === void 0) return false;
  const entries = object(value[field]);
  let changed = false;
  for (const name of names) {
    if (!Object.hasOwn(entries, name)) continue;
    Reflect.deleteProperty(entries, name);
    changed = true;
  }
  return changed;
}
function cleanProfileCorePackages(profile, packageNames, production) {
  if (!CLEAN_PROFILE_CORE_PACKAGES || !production || !existsSync2(profile)) return;
  const names = new Set(packageNames);
  const recordPath = join5(profile, DESKTOP_PACKAGE_SET_FILE);
  if (existsSync2(recordPath)) {
    for (const entry of readDesktopCorePackageSet(profile).packages) names.add(entry.name);
  }
  const roots = [join5(profile, "node_modules"), join5(profile, ".dsh-module-fallback", "node_modules")];
  requireDirectory(join5(profile, ".dsh-module-fallback"));
  for (const root of roots) {
    requireDirectory(root);
    for (const name of names) requireDirectory(dirname2(join5(root, name)));
  }
  const manifestPath = join5(profile, "package.json");
  const manifest = existsSync2(manifestPath) ? object(JSON.parse(readFileSync4(manifestPath, "utf8"))) : void 0;
  const workspacePath = join5(profile, "pnpm-workspace.yaml");
  const workspace = existsSync2(workspacePath) ? object(load(readFileSync4(workspacePath, "utf8"))) : void 0;
  let manifestChanged = false;
  if (manifest !== void 0) {
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      manifestChanged = prune(manifest, field, names) || manifestChanged;
    }
    if (manifest.pnpm !== void 0) manifestChanged = prune(object(manifest.pnpm), "overrides", names) || manifestChanged;
  }
  const workspaceChanged = workspace !== void 0 && prune(workspace, "overrides", names);
  const packageResidue = roots.some((root) => [...names].some((name) => stat2(join5(root, name)) !== void 0));
  if (manifestChanged || workspaceChanged || packageResidue) remove(join5(profile, "pnpm-lock.yaml"));
  if (manifestChanged) writeFileSync2(manifestPath, `${JSON.stringify(manifest, void 0, 2)}
`);
  if (workspaceChanged) writeFileSync2(workspacePath, dump(workspace));
  for (const root of roots) for (const name of names) remove(join5(root, name));
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/project-manager.ts
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
  const path = join6(projectDir, "pnpm-workspace.yaml");
  if (!existsSync3(path)) return;
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
  if (readFileSync5(path, "utf8").replaceAll("\r\n", "\n") === legacy) {
    writeFileSync3(path, workspaceFile());
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
   * @param production - Remove application-owned profile packages before packaged Host startup.
   */
  async applyRelease(production = false) {
    await this.withLock(() => {
      const descriptor = readDesktopRuntime(this.runtime.dsh);
      cleanProfileCorePackages(this.paths.profile, descriptor.sharedPackages.map((entry) => entry.name), production);
      migrateProfileSettings(this.paths.profile);
      migrateDesktopProfileLinks(this.paths.profile);
      createPluginProfile(this.paths.profile);
    });
  }
  async withLock(operation) {
    mkdirSync(this.paths.profile, { recursive: true, mode: 448 });
    const lockPath = join6(realpathSync(this.paths.profile), "lock");
    let descriptor;
    try {
      descriptor = openSync(lockPath, "wx", 384);
    } catch (error) {
      if (error.code === "EEXIST") {
        const lock = lstatSync5(lockPath);
        if (lock.isSymbolicLink() || !lock.isFile()) {
          throw new Error("desktop project: profile lock is not a regular file");
        }
        const owner = Number.parseInt(readFileSync5(lockPath, "utf8").trim(), 10);
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
        unlinkSync3(lockPath);
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
      unlinkSync3(lockPath);
    }
  }
};
function createPluginProfile(projectDir) {
  initProfile(projectDir, WEB_PROFILE.bundles);
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/host-process.ts
import { spawn } from "node:child_process";
import { join as join7 } from "node:path";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/node-environment.ts
import { delimiter } from "node:path";
function desktopNodeEnvironment(executable, bin, environment) {
  return {
    ...environment,
    ELECTRON_RUN_AS_NODE: "1",
    ...bin === void 0 ? {} : { DSH_DESKTOP_NODE_EXECUTABLE: executable, PATH: `${bin}${delimiter}${environment.PATH ?? ""}` }
  };
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/host-process.ts
var MAX_HOST_DIAGNOSTIC_CHARS = 64 * 1024;
function isDesktopHostEvent(message) {
  if (typeof message !== "object" || message === null || !("type" in message)) return false;
  const candidate = message;
  switch (candidate.type) {
    case "shutdown-complete":
      return true;
    case "ready":
      return typeof candidate.url === "string";
    case "fatal":
      return typeof candidate.message === "string";
    case "update-tasks":
      return Number.isSafeInteger(candidate.requestId) && typeof candidate.active === "boolean" && (candidate.error === void 0 || typeof candidate.error === "string");
    default:
      return false;
  }
}
async function exitsWithin(exit, milliseconds) {
  let timer;
  const timeout = new Promise((resolve4) => {
    timer = setTimeout(() => {
      resolve4(false);
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
   * @param profileResolution - Package resolution mode for the application-owned profile.
   */
  constructor(node, runtimeDir, projectDir, inspectPort, environment = process.env, onFailure, primaryRuntime, profileResolution = "link", packageManager) {
    this.node = node;
    this.runtimeDir = runtimeDir;
    this.projectDir = projectDir;
    this.inspectPort = inspectPort;
    this.environment = environment;
    this.onFailure = onFailure;
    this.primaryRuntime = primaryRuntime;
    this.profileResolution = profileResolution;
    this.packageManager = packageManager;
  }
  node;
  runtimeDir;
  projectDir;
  inspectPort;
  environment;
  onFailure;
  primaryRuntime;
  profileResolution;
  packageManager;
  child;
  readyResolve;
  readyReject;
  readyPromise = new Promise((resolve4, reject) => {
    this.readyResolve = resolve4;
    this.readyReject = reject;
  });
  exitPromise;
  stderr = "";
  failureReported = false;
  stopping = false;
  shutdownCompleted = false;
  nextControlId = 1;
  taskQueries = /* @__PURE__ */ new Map();
  /**
   * Start this child once and await its Web application URL.
   * @returns Ready facts supplied by the child after application startup.
   */
  async start() {
    if (this.child !== void 0) return this.readyPromise;
    const entry = join7(this.runtimeDir, "node_modules", "@deepseek-ai", "dsh-desktop-host", "lib", "index.js");
    const child = spawn(this.node, [
      "--expose-internals",
      ...this.inspectPort === void 0 ? [] : [`--inspect=127.0.0.1:${String(this.inspectPort)}`],
      entry,
      this.runtimeDir,
      this.projectDir,
      this.primaryRuntime ?? join7(this.runtimeDir, "..", "runtime", "primary-runtime"),
      this.profileResolution,
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
      else if (message.type === "shutdown-complete") {
        if (this.stopping) this.shutdownCompleted = true;
        else this.fail(new Error("dsh desktop host acknowledged an unrequested shutdown"));
      } else if (message.type === "fatal") this.fail(new Error(message.message));
      else {
        const query = this.taskQueries.get(message.requestId);
        if (message.error === void 0) query?.resolve(message.active);
        else query?.reject(new Error(message.error));
      }
    });
    child.once("error", (error) => {
      this.fail(error);
    });
    this.exitPromise = new Promise((resolve4) => {
      child.once("close", (code) => {
        const suffix = this.stderr.trim() === "" ? "" : `: ${this.stderr.trim()}`;
        if (code !== 0 && code !== null) this.fail(new Error(`dsh desktop host exited with ${String(code)}${suffix}`));
        else this.fail(new Error(`dsh desktop host stopped${suffix}`));
        resolve4();
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
    const child = this.child;
    if (child === void 0 || !child.connected || this.failureReported || this.stopping) {
      throw new Error("desktop update: Host is unavailable");
    }
    const requestId = this.nextControlId++;
    let timer;
    try {
      return await new Promise((resolve4, reject) => {
        this.taskQueries.set(requestId, { resolve: resolve4, reject });
        timer = setTimeout(() => {
          reject(new Error("desktop update: task inspection timed out"));
        }, 1e4);
        child.send({ type: "update-tasks", requestId, action }, (error) => {
          if (error !== null) reject(error);
        });
      });
    } finally {
      clearTimeout(timer);
      this.taskQueries.delete(requestId);
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
    this.readyReject(error);
    for (const query of this.taskQueries.values()) query.reject(error);
    this.taskQueries.clear();
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

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/managed-host.ts
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute as isAbsolute3, resolve as resolve2 } from "node:path";
var key = (path) => process.platform === "win32" ? resolve2(path).toLowerCase() : resolve2(path);
function validate(value) {
  if (value === null || typeof value !== "object") throw new Error("RECOVERY_DESKTOP_CONNECTION");
  const v = value;
  if (typeof v.endpoint !== "string" || typeof v.token !== "string" || !/^[a-f0-9]{64}$/u.test(v.token) || v.role !== "desktop" || typeof v.projectDir !== "string" || !isAbsolute3(v.projectDir) || typeof v.dshVersion !== "string" || !/^[0-9A-Za-z.+-]{1,80}$/u.test(v.dshVersion) || v.protocolVersion !== 4) throw new Error("RECOVERY_DESKTOP_CONNECTION");
  const url = new URL(v.endpoint);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("RECOVERY_DESKTOP_CONNECTION");
  return { endpoint: url.href, token: v.token, role: "desktop", projectDir: v.projectDir, dshVersion: v.dshVersion, protocolVersion: 4 };
}
async function readManagedDesktopConnection(path) {
  if (!isAbsolute3(path) || key(await realpath(path)) !== key(path)) throw new Error("RECOVERY_DESKTOP_CONNECTION");
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
// SEP managed guardian recovery v1
import { ManagedDesktopHost } from "./sep-managed-host.mjs";
// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/directory-picker.ts
import { dialog, ipcMain } from "electron";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/ipc.ts
var DESKTOP_IPC = {
  boot: "dsh-desktop:boot",
  bootFailed: "dsh-desktop:boot-failed",
  directoryPick: "dsh-desktop:directory-pick",
  updatesStatus: "dsh-desktop:updates-status",
  updatesOpen: "dsh-desktop:updates-open",
  updatesPresentation: "dsh-desktop:updates-presentation",
  nativeThemeSet: "dsh-desktop:native-theme-set",
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

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/directory-picker.ts
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

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/startup-error.ts
function desktopErrorState(error) {
  const message = error instanceof AggregateError ? [error.message, ...error.errors.map((item) => desktopErrorState(item).message)].join("\n") : error instanceof Error ? error.message : String(error);
  return { phase: "error", message };
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/backend-controller.ts
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
        if (!cancelled) this.update(desktopErrorState(failure));
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
    this.update(desktopErrorState(error));
    void cleanup.catch((cleanupError) => {
      if (this.attempt === attempt) this.update(desktopErrorState(new AggregateError([error, cleanupError], "Desktop backend failed and could not stop")));
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

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/locale.ts
var en = {
  application: "Application",
  aboutMenu: "About DeepSeek Harness",
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
  diagnosticTruncated: "\u2026 Error details shortened. The full diagnostic was written to the Electron console.",
  startupReinstallAdvice: "If application files are missing or damaged, close the application and reinstall it. Your tasks are stored separately.",
  exitApplication: "Exit",
  restartApplication: "Restart",
  recoveryOperationFailed: "The recovery operation failed",
  disableThirdPartyPlugins: "Disable third-party plugins, back up profile patch, and restart",
  checkUpdatesMenu: "Check for Updates\u2026",
  sepManagedUpdates: "This installation is managed by DSH SEP. Use SEP Update Center to check compatibility and update while preserving your data and plugins.",
  updateCheckFailedTitle: "Update Check Failed",
  updateCheckFailed: "Could not check for updates. Please try again later.",
  updateDownloadFailed: "Could not download the update. Please try again.",
  updateInstallFailed: "Could not install the update. Please try again later.",
  updateCheckNetworkFailed: "Could not check for updates. Please try again later. The connection was interrupted. Check your network and try again.",
  updateDownloadNetworkFailed: "Could not download the update. Please try again. The connection was interrupted. Check your network and try again.",
  updateInstallNetworkFailed: "Could not install the update. Please try again later. The connection was interrupted. Check your network and try again.",
  unknownError: "Unknown error",
  updateCheckTitle: "Check for Updates",
  updateCurrent: "No updates available. Current version: V{version}",
  updateChecking: "Checking for updates\u2026",
  updateDownload: "Download update",
  updateDownloadedTitle: "DeepSeek Harness v{version} downloaded",
  updateDownloadedDetail: "The update package has downloaded. Select \u201CInstall and Restart\u201D to restart the app and begin installation.",
  updateClose: "Close",
  updateAcknowledge: "OK",
  updateLater: "Update later",
  updateDownloading: "Downloading {percent}%\u2026",
  updateVerifying: "Verifying update files\u2026",
  updateInstalling: "Preparing to restart\u2026",
  updateRetry: "Retry update",
  updateActiveTasks: "Tasks are still in progress",
  updateActiveTasksDetail: "Restarting to update may interrupt these tasks. Continue updating?",
  updateStopTasks: "Stop tasks and update",
  updateTasksChanged: "New tasks started. Review the update confirmation again.",
  updateTasksUnavailable: "Task status is unavailable. Try updating again when the workspace is ready.",
  updateStopFailed: "Tasks could not be stopped safely. The update was not installed. Please try again later.",
  updateTechnicalDetails: "View technical details",
  updateTitle: "DeepSeek Harness Update",
  updateAvailable: "An update is available",
  updateDetail: "DeepSeek Harness {version}\n\nThis release includes its matching dsh version. The application will restart after installation.",
  installAndRestart: "Install and Restart",
  later: "Later",
  updateFailedTitle: "Update Failed",
  mandatoryTitle: "Update required",
  mandatoryDetail: "This version is no longer supported. Update to continue. Existing tasks can keep running until you approve a restart.",
  mandatoryUnavailable: "The update requirement could not be checked. Retry when the connection is available.",
  policyLoginTitle: "Sign in to the test environment",
  policyLoginRequired: "This is a test build. Checking update requirements needs Feishu sign-in. Signing in does not download or install an update.",
  policyLogin: "Sign in with Feishu",
  policyLoginFailed: "Test environment sign-in did not complete. Please check your connection and try again.",
  policyLoginLoading: "Loading sign-in page\u2026",
  mandatoryNoRelease: "No applicable update is available. Check again or contact support.",
  mandatoryRefresh: "Check again",
  mandatoryPage: "Open download page",
  mandatoryCopy: "Copy download address",
  mandatoryPageFailed: "The download page could not be opened. Copy the address below and open it in your browser.",
  mandatoryActionFailed: "The update action failed. Retry; the update requirement remains active.",
  mandatoryReady: "Update ready",
  mandatoryVersion: "V{version}",
  mandatoryReadyDetail: "Installing the update will restart the application.",
  mandatoryDeferred: "Existing tasks can keep running. Update to continue using the application.",
  mandatoryContinue: "Continue installing update",
  mandatoryInspecting: "Checking tasks\u2026",
  mandatoryStopping: "Safely stopping tasks in the application.",
  mandatoryRestarting: "The application will restart shortly. Please wait.",
  mandatoryDownloadFailed: "The update files could not be downloaded or prepared. Please retry.",
  mandatoryInstallFailed: "The update was not installed. Check tasks again and retry.",
  mandatoryOpenHelp: "If the page did not open, you can",
  mandatoryReopen: "Open download page again",
  mandatoryCopied: "Link copied",
  mandatoryCopyFailed: "Copy failed. Select and copy the address below manually.",
  mandatoryAddress: "Download address",
  mandatoryNotification: "Return to the application to confirm installation and restart."
};
var zh = {
  application: "\u5E94\u7528",
  aboutMenu: "\u5173\u4E8E DeepSeek Harness",
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
  diagnosticTruncated: "\u2026 \u9519\u8BEF\u8BE6\u60C5\u5DF2\u622A\u77ED\uFF0C\u5B8C\u6574\u8BCA\u65AD\u5DF2\u5199\u5165 Electron \u63A7\u5236\u53F0\u3002",
  startupReinstallAdvice: "\u5982\u679C\u5E94\u7528\u6587\u4EF6\u7F3A\u5931\u6216\u635F\u574F\uFF0C\u8BF7\u5173\u95ED\u5E94\u7528\u5E76\u91CD\u65B0\u5B89\u88C5\u3002\u4EFB\u52A1\u6570\u636E\u5B58\u50A8\u5728\u72EC\u7ACB\u4F4D\u7F6E\u3002",
  exitApplication: "\u9000\u51FA",
  restartApplication: "\u91CD\u542F",
  recoveryOperationFailed: "\u6062\u590D\u64CD\u4F5C\u5931\u8D25",
  disableThirdPartyPlugins: "\u7981\u7528\u7B2C\u4E09\u65B9\u63D2\u4EF6\u3001\u5907\u4EFD profile patch \u5E76\u91CD\u542F",
  sepManagedUpdates: "\u6B64\u5B89\u88C5\u7531 DSH SEP \u7BA1\u7406\u3002\u8BF7\u4F7F\u7528 SEP \u66F4\u65B0\u4E2D\u5FC3\u68C0\u67E5\u517C\u5BB9\u6027\u5E76\u66F4\u65B0\uFF0C\u4EE5\u4FDD\u7559\u7528\u6237\u6570\u636E\u548C\u5176\u4ED6\u63D2\u4EF6\u3002",
  checkUpdatesMenu: "\u68C0\u67E5\u66F4\u65B0\u2026",
  updateCheckFailedTitle: "\u66F4\u65B0\u68C0\u67E5\u5931\u8D25",
  updateCheckFailed: "\u68C0\u67E5\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  updateDownloadFailed: "\u4E0B\u8F7D\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  updateInstallFailed: "\u5B89\u88C5\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  updateCheckNetworkFailed: "\u68C0\u67E5\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002\u7F51\u7EDC\u8FDE\u63A5\u5F02\u5E38\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002",
  updateDownloadNetworkFailed: "\u4E0B\u8F7D\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002\u7F51\u7EDC\u8FDE\u63A5\u5F02\u5E38\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002",
  updateInstallNetworkFailed: "\u5B89\u88C5\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002\u7F51\u7EDC\u8FDE\u63A5\u5F02\u5E38\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002",
  unknownError: "\u672A\u77E5\u9519\u8BEF",
  updateCheckTitle: "\u68C0\u67E5\u66F4\u65B0",
  updateCurrent: "\u5F53\u524D\u6682\u65E0\u53EF\u7528\u66F4\u65B0\u3002\u5F53\u524D\u7248\u672C\uFF1AV{version}",
  updateChecking: "\u6B63\u5728\u68C0\u67E5\u66F4\u65B0\u2026",
  updateDownload: "\u4E0B\u8F7D\u66F4\u65B0",
  updateDownloadedTitle: "DeepSeek Harness v{version} \u4E0B\u8F7D\u5B8C\u6210",
  updateDownloadedDetail: "\u5B89\u88C5\u5305\u5DF2\u4E0B\u8F7D\u5B8C\u6BD5\uFF0C\u70B9\u51FB\u201C\u5B89\u88C5\u5E76\u91CD\u542F\u201D\uFF0C\u5373\u523B\u91CD\u542F\u5BA2\u6237\u7AEF\uFF0C\u5F00\u59CB\u90E8\u7F72\u3002",
  updateClose: "\u5173\u95ED",
  updateAcknowledge: "\u786E\u5B9A",
  updateLater: "\u7A0D\u540E\u66F4\u65B0",
  updateDownloading: "\u6B63\u5728\u4E0B\u8F7D {percent}%\u2026",
  updateVerifying: "\u6B63\u5728\u6821\u9A8C\u66F4\u65B0\u6587\u4EF6\u2026",
  updateInstalling: "\u6B63\u5728\u51C6\u5907\u91CD\u542F\u2026",
  updateRetry: "\u91CD\u8BD5\u66F4\u65B0",
  updateActiveTasks: "\u4ECD\u6709\u8FDB\u884C\u4E2D\u7684\u4EFB\u52A1",
  updateActiveTasksDetail: "\u91CD\u542F\u66F4\u65B0\u53EF\u80FD\u4E2D\u65AD\u8FD9\u4E9B\u4EFB\u52A1\uFF0C\u662F\u5426\u8981\u7EE7\u7EED\u66F4\u65B0\uFF1F",
  updateStopTasks: "\u505C\u6B62\u4EFB\u52A1\u5E76\u66F4\u65B0",
  updateTasksChanged: "\u6709\u65B0\u4EFB\u52A1\u5F00\u59CB\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4\u66F4\u65B0\u3002",
  updateTasksUnavailable: "\u65E0\u6CD5\u786E\u8BA4\u4EFB\u52A1\u72B6\u6001\uFF0C\u8BF7\u5728\u5DE5\u4F5C\u533A\u5C31\u7EEA\u540E\u91CD\u8BD5\u66F4\u65B0\u3002",
  updateStopFailed: "\u672A\u80FD\u5B89\u5168\u505C\u6B62\u4EFB\u52A1\uFF0C\u66F4\u65B0\u672A\u5B89\u88C5\u3002\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
  updateTechnicalDetails: "\u67E5\u770B\u6280\u672F\u8BE6\u60C5",
  updateTitle: "DeepSeek Harness \u66F4\u65B0",
  updateAvailable: "\u53D1\u73B0\u53EF\u7528\u66F4\u65B0",
  updateDetail: "DeepSeek Harness {version}\n\n\u65B0\u7248\u672C\u7ED1\u5B9A\u5339\u914D\u7684 dsh\uFF0C\u5B89\u88C5\u540E\u5C06\u91CD\u65B0\u542F\u52A8\u3002",
  installAndRestart: "\u5B89\u88C5\u5E76\u91CD\u542F",
  later: "\u7A0D\u540E",
  updateFailedTitle: "\u66F4\u65B0\u5931\u8D25",
  mandatoryTitle: "\u9700\u8981\u66F4\u65B0",
  mandatoryDetail: "\u5F53\u524D\u7248\u672C\u5DF2\u505C\u6B62\u652F\u6301\uFF0C\u8BF7\u66F4\u65B0\u540E\u7EE7\u7EED\u4F7F\u7528\u3002\u5728\u60A8\u786E\u8BA4\u91CD\u542F\u4E4B\u524D\uFF0C\u73B0\u6709\u4EFB\u52A1\u53EF\u4EE5\u7EE7\u7EED\u8FD0\u884C\u3002",
  mandatoryUnavailable: "\u6682\u65F6\u65E0\u6CD5\u68C0\u67E5\u66F4\u65B0\u8981\u6C42\uFF0C\u8BF7\u5728\u7F51\u7EDC\u6062\u590D\u540E\u91CD\u8BD5\u3002",
  policyLoginTitle: "\u767B\u5F55\u6D4B\u8BD5\u73AF\u5883",
  policyLoginRequired: "\u8FD9\u662F\u6D4B\u8BD5\u7248\u5E94\u7528\uFF0C\u68C0\u67E5\u66F4\u65B0\u8981\u6C42\u9700\u8981\u5148\u901A\u8FC7\u98DE\u4E66\u767B\u5F55\u3002\u767B\u5F55\u4E0D\u4F1A\u4E0B\u8F7D\u6216\u5B89\u88C5\u66F4\u65B0\u3002",
  policyLogin: "\u901A\u8FC7\u98DE\u4E66\u767B\u5F55",
  policyLoginFailed: "\u6D4B\u8BD5\u73AF\u5883\u767B\u5F55\u672A\u5B8C\u6210\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002",
  policyLoginLoading: "\u6B63\u5728\u52A0\u8F7D\u767B\u5F55\u9875\u9762\u2026",
  mandatoryNoRelease: "\u6682\u65F6\u6CA1\u6709\u53EF\u7528\u7684\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u6216\u8054\u7CFB\u652F\u6301\u4EBA\u5458\u3002",
  mandatoryRefresh: "\u91CD\u65B0\u68C0\u67E5",
  mandatoryPage: "\u524D\u5F80\u5B98\u7F51\u4E0B\u8F7D",
  mandatoryCopy: "\u590D\u5236\u4E0B\u8F7D\u94FE\u63A5",
  mandatoryPageFailed: "\u65E0\u6CD5\u6253\u5F00\u6D4F\u89C8\u5668\uFF0C\u8BF7\u590D\u5236\u4E0B\u8F7D\u94FE\u63A5\u540E\u624B\u52A8\u6253\u5F00\u3002",
  mandatoryActionFailed: "\u66F4\u65B0\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\uFF1B\u5E94\u7528\u4ECD\u9700\u66F4\u65B0\u540E\u624D\u80FD\u7EE7\u7EED\u4F7F\u7528\u3002",
  mandatoryReady: "\u66F4\u65B0\u5DF2\u51C6\u5907\u5C31\u7EEA",
  mandatoryVersion: "V{version}",
  mandatoryReadyDetail: "\u5B89\u88C5\u540E\u5C06\u91CD\u65B0\u542F\u52A8\u5E94\u7528\u3002",
  mandatoryDeferred: "\u73B0\u6709\u4EFB\u52A1\u53EF\u4EE5\u7EE7\u7EED\u8FD0\u884C\u3002\u5B8C\u6210\u66F4\u65B0\u540E\u624D\u80FD\u7EE7\u7EED\u64CD\u4F5C\u5E94\u7528\u3002",
  mandatoryContinue: "\u7EE7\u7EED\u5B89\u88C5\u66F4\u65B0",
  mandatoryInspecting: "\u6B63\u5728\u68C0\u67E5\u4EFB\u52A1\u72B6\u6001\u2026",
  mandatoryStopping: "\u6B63\u5728\u5B89\u5168\u7ED3\u675F\u5E94\u7528\u4E2D\u7684\u4EFB\u52A1\u3002",
  mandatoryRestarting: "\u5E94\u7528\u5373\u5C06\u91CD\u542F\uFF0C\u8BF7\u7A0D\u5019\u3002",
  mandatoryDownloadFailed: "\u66F4\u65B0\u6587\u4EF6\u4E0B\u8F7D\u6216\u51C6\u5907\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  mandatoryInstallFailed: "\u66F4\u65B0\u5C1A\u672A\u5B89\u88C5\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u4EFB\u52A1\u540E\u91CD\u8BD5\u3002",
  mandatoryOpenHelp: "\u82E5\u9875\u9762\u672A\u6253\u5F00\uFF0C\u53EF",
  mandatoryReopen: "\u91CD\u65B0\u6253\u5F00\u5B98\u7F51",
  mandatoryCopied: "\u5DF2\u590D\u5236\u94FE\u63A5",
  mandatoryCopyFailed: "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u9009\u62E9\u4E0B\u65B9\u5730\u5740\u590D\u5236\u3002",
  mandatoryAddress: "\u4E0B\u8F7D\u5730\u5740",
  mandatoryNotification: "\u8FD4\u56DE\u5E94\u7528\u786E\u8BA4\u5B89\u88C5\u5E76\u91CD\u542F\u3002"
};
function resolveDesktopLocale(locale) {
  return locale.toLowerCase().startsWith("zh") ? { id: "zh-CN", messages: zh } : { id: "en", messages: en };
}
function formatDesktopMessage(message, values) {
  return message.replaceAll(/\{([^{}]+)\}/gu, (placeholder, key2) => values[key2] ?? placeholder);
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/single-instance.ts
function claimDesktopSingleInstance(application, focusOwner) {
  if (!application.requestSingleInstanceLock()) {
    application.quit();
    return false;
  }
  application.on("second-instance", focusOwner);
  return true;
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/update-coordinator.ts
import { existsSync as existsSync4 } from "node:fs";
import { join as join8 } from "node:path";
import { app } from "electron";
import electronUpdater from "electron-updater";
import { gt, valid as valid3 } from "semver";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/update-http-executor.ts
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

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/update-error.ts
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

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/update-coordinator.ts
var { autoUpdater } = electronUpdater;
var DesktopUpdateCoordinator = class {
  /**
   * @param publish - Receives observable states for every Desktop window.
   * @param beforeRestart - Completes task authorization, admission locking, and owned-process shutdown.
   * @param updater - Process-owned Electron updater, replaceable at the network/platform test boundary.
   * @param enabled - Whether this process has a packaged update source.
   * @param currentVersion - Actual installed application version.
   */
  constructor(publish, beforeRestart, updater = autoUpdater, enabled = () => app.isPackaged && existsSync4(join8(process.resourcesPath, "app-update.yml")), currentVersion = () => app.getVersion()) {
    this.publish = publish;
    this.beforeRestart = beforeRestart;
    this.updater = updater;
    this.enabled = enabled;
    this.currentVersion = currentVersion;
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
        return this.setState({ phase: "ready", version });
      } catch (error) {
        this.downloaded = false;
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

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/web-document.ts
import { readFile as readFile2 } from "node:fs/promises";
import { extname, resolve as resolve3, sep as sep2 } from "node:path";
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
  const target = resolve3(root, "." + (pathname === "/" ? "/index.html" : pathname));
  const directory = resolve3(root);
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
async function authenticateWebHost(url, signal) {
  const response = await fetch(url, { redirect: "manual", signal });
  const cookie = response.headers.get("set-cookie");
  await response.body?.cancel();
  if (response.status !== 303 || cookie === null) throw new Error("Desktop Host authentication failed");
  const end = cookie.indexOf(";");
  return end < 0 ? cookie : cookie.slice(0, end);
}
async function forwardWebRequest(request, host, cookie) {
  const source = new URL(request.url);
  const origin2 = request.headers.get("origin");
  if (origin2 !== null && origin2 !== "dsh-app://app") return new Response(null, { status: 403 });
  const target = new URL(host);
  target.pathname = source.pathname;
  target.search = source.search;
  const headers = new Headers(request.headers);
  for (const name of ["host", "origin", "cookie", "sec-fetch-site"]) headers.delete(name);
  headers.set("cookie", cookie);
  const init = { method: request.method, headers, body: request.body, signal: request.signal, duplex: "half", redirect: "manual" };
  const response = await fetch(target, init);
  const outgoing = new Headers(response.headers);
  for (const name of ["content-encoding", "content-length", "set-cookie"]) outgoing.delete(name);
  return new Response(response.body, { status: response.status, headers: outgoing });
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/fatal-recovery.ts
function dialogDetail(error, messages) {
  const advice = `

${messages.startupReinstallAdvice}`;
  const tail = error.split(/\r\n|[\n\r\u2028\u2029]/u).slice(-8).join("\n");
  const budget = 1200 - advice.length - messages.diagnosticTruncated.length - 1;
  const shortened = tail.slice(-budget).replace(/^[\uDC00-\uDFFF]/u, "");
  return `${shortened === error ? error : `${messages.diagnosticTruncated}
${shortened}`}${advice}`;
}
var DesktopFatalRecovery = class {
  /** @param operations - Native presentation and application-owned shutdown operations. */
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
   * @param error - Fatal failure, including nested diagnostic causes.
   * @returns Completion of the user's recovery action; duplicate reports resolve immediately.
   */
  async report(error) {
    if (this.reported) return;
    this.reported = true;
    const messages = this.operations.messages();
    let detail = desktopErrorState(error).message;
    let message = messages.fatalSummary;
    for (; ; ) {
      const addressInUse = /\blisten EADDRINUSE\b/u.test(detail);
      const { response } = await this.operations.show({
        type: "error",
        title: messages.startupFailed,
        message,
        detail: addressInUse ? messages.startupAddressInUse : dialogDetail(detail, messages),
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
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/update-journal.ts
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync as mkdirSync2, writeFileSync as writeFileSync4 } from "node:fs";
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
    this.path = join9(directory, `${Date.now()}-${randomUUID()}.jsonl`);
    writeFileSync4(this.path, "", { flag: "wx", mode: 384, flush: true });
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

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/update-schedule.ts
function resolveDesktopUpdateScheduleConfig(env) {
  function duration(name, fallback) {
    const value = Number(env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1e3 || value > 2147483647) {
      throw new Error(`${name} must be an integer from 1000 through 2147483647`);
    }
    return value;
  }
  const intervalMs = duration("DSH_DESKTOP_UPDATE_CHECK_INTERVAL_MS", 6e5);
  const maxBackoffMs = duration("DSH_DESKTOP_UPDATE_CHECK_MAX_BACKOFF_MS", Math.max(intervalMs, 36e5));
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

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/update-presentation.ts
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

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/mandatory-update-policy.ts
import { valid as valid4 } from "semver";
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
  if (typeof jitter !== "number" || !Number.isFinite(jitter) || jitter < 0 || jitter > 1 || maxBackoffMs < intervalMs) {
    throw new Error("desktop policy: jitter must be in [0, 1] and maxBackoffMs must cover intervalMs");
  }
  return {
    origin: origin(value.origin, authentication === "anonymous" && allowLoopback),
    allowedPageOrigins: value.allowedPageOrigins.map((item) => origin(item, false)),
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
   * @param identity - Installed software identity, copied once for this lifetime.
   * @param publish - Receives policy changes without controlling downloads or existing tasks.
   * @param request - Anonymous Fetch or the dedicated test-authentication Session transport.
   * @param random - Jitter source, replaceable for clock-driven tests.
   */
  constructor(config, identity, publish, request = fetch, random = Math.random) {
    this.config = config;
    this.publish = publish;
    this.request = request;
    this.random = random;
    if (valid4(identity.version) === null || valid4(identity.bundledDshVersion) === null || identity.bundleId.trim() === "" || identity.platform === "desktop-win" && identity.arch !== "x64") throw new Error("desktop policy: invalid installed client identity");
    this.headers = Object.freeze({
      "x-client-platform": identity.platform,
      "x-client-version": identity.version,
      "x-client-bundle-id": identity.bundleId,
      "x-client-locale": identity.locale,
      "x-client-arch": identity.arch,
      "x-client-update-channel": "nightly",
      "x-client-bundled-dsh-version": identity.bundledDshVersion
    });
  }
  config;
  publish;
  request;
  random;
  current = { blocking: false, checking: false };
  pending;
  controller;
  timer;
  disposed = false;
  failures = 0;
  nextCheck = -Infinity;
  headers;
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
          headers: this.headers,
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

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/mandatory-update-window.ts
import { app as app3, clipboard, ipcMain as ipcMain2, shell } from "electron";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/mandatory-update-ipc.ts
var MANDATORY_IPC = {
  status: "dsh-desktop:mandatory-status",
  state: "dsh-desktop:mandatory-state",
  action: "dsh-desktop:mandatory-action"
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/update-overlay.ts
import { BrowserWindow } from "electron";
function createUpdateOverlay(parent, preload, title) {
  const window = new BrowserWindow({
    parent,
    modal: true,
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
  const follow = () => {
    if (!window.isDestroyed()) window.setBounds(parent.getContentBounds());
  };
  parent.on("move", follow);
  parent.on("resize", follow);
  let closed = false;
  let blur;
  const unblur = () => {
    if (blur === void 0 || parent.isDestroyed()) return;
    void parent.webContents.removeInsertedCSS(blur).catch((error) => {
      console.warn("desktop update: could not remove background blur", error);
    });
    blur = void 0;
  };
  void parent.webContents.insertCSS("body { filter: blur(2px) !important; }").then((key2) => {
    blur = key2;
    if (closed) unblur();
  }).catch((error) => {
    console.warn("desktop update: could not blur background", error);
  });
  window.once("closed", () => {
    closed = true;
    unblur();
  });
  window.once("closed", () => {
    parent.off("move", follow);
    parent.off("resize", follow);
  });
  window.once("ready-to-show", () => {
    if (!window.isDestroyed()) window.show();
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  return window;
}
function createMandatoryUpdateWindow(parent, preload, title, platform = process.platform) {
  if (platform !== "win32") return createUpdateOverlay(parent, preload, title);
  const window = new BrowserWindow({
    parent,
    modal: true,
    show: false,
    title,
    width: 640,
    height: 560,
    minWidth: 480,
    minHeight: 360,
    movable: true,
    resizable: true,
    maximizable: true,
    backgroundColor: "#f5f5f5",
    webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true }
  });
  window.once("ready-to-show", () => {
    if (!window.isDestroyed()) window.show();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  return window;
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/update-attention.ts
import { app as app2, Notification } from "electron";
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
      if (bounce !== void 0) app2.dock?.cancelBounce(bounce);
    };
    try {
      if (this.platform === "win32") parent.flashFrame(true);
      if (this.platform === "darwin") bounce = app2.dock?.bounce("informational");
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

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/mandatory-update-window.ts
var page = "dsh-app://shell/mandatory-update.html";
var DesktopMandatoryUpdateWindow = class {
  /** @param options - Main-process actions and immutable deployment/navigation settings. */
  constructor(options) {
    this.options = options;
    this.attention = new DesktopUpdateAttention(options.locale);
    ipcMain2.handle(MANDATORY_IPC.status, (event) => {
      this.assertSender(event);
      return this.view();
    });
    ipcMain2.handle(MANDATORY_IPC.action, (event, action, version, confirmationRevision) => {
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
  window;
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
    return this.window;
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
    return new Promise((resolve4) => {
      this.confirmation = { version, active, revision: ++this.confirmationRevision, resolve: resolve4 };
      this.sync();
      const parent = this.options.parent();
      if (parent !== void 0 && this.window !== void 0) {
        this.attention.ready(version, parent, this.window, () => {
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
    if (!this.options.policy().blocking) {
      this.finishConfirmation(false);
      this.attention.reset();
      this.clearNavigation();
      this.restart = void 0;
      this.deferred = false;
      this.window?.destroy();
      this.window = void 0;
      this.error = void 0;
      return;
    }
    if (this.navigationUrl !== this.options.policy().page) this.clearNavigation();
    if (this.options.update().phase === "error") this.restart = void 0;
    if (this.window === void 0) {
      const parent = this.options.parent();
      if (parent === void 0) return;
      const window = createMandatoryUpdateWindow(parent, this.options.preload, this.options.locale.messages.mandatoryTitle);
      this.window = window;
      window.setMenu(null);
      window.on("close", (event) => {
        if (!this.disposed && this.options.policy().blocking) {
          event.preventDefault();
          app3.quit();
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
    if (parent?.isMinimized()) parent.restore();
    parent?.show();
    this.window?.show();
    this.window?.focus();
  }
  /** Detach IPC and release the modal during application shutdown. */
  dispose() {
    this.disposed = true;
    this.finishConfirmation(false);
    this.attention.reset();
    this.clearNavigation();
    ipcMain2.removeHandler(MANDATORY_IPC.status);
    ipcMain2.removeHandler(MANDATORY_IPC.action);
    this.window?.destroy();
    this.window = void 0;
  }
  view() {
    return {
      locale: this.options.locale,
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
      } else await shell.openExternal(url);
      if (epoch !== this.navigationEpoch || this.disposed) return;
      if (action === "copy") this.navigation = { page: this.navigation?.page ?? "requested", copy: "copied" };
    } catch {
      if (epoch !== this.navigationEpoch || this.disposed) return;
      this.navigation = action === "page" ? { ...this.navigation, page: "failed" } : { page: this.navigation?.page ?? "requested", copy: "failed" };
    }
    this.sync();
  }
  assertSender(event) {
    if (event.sender !== this.window?.webContents || event.senderFrame !== this.window.webContents.mainFrame || event.senderFrame.url !== page) throw new Error("desktop policy: rejected unowned renderer");
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/policy-test-auth.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { BrowserWindow as BrowserWindow3, session } from "electron";
var FEISHU_ORIGINS = [
  "https://open.feishu.cn",
  "https://accounts.feishu.cn",
  "https://passport.feishu.cn",
  "https://login.feishu.cn"
];
var LOGIN_LOADING_PAGE = "renderer/policy-login-loading.html";
var LOGIN_LOADING_FILE = "policy-login-loading.html";
var DesktopPolicyTestAuth = class {
  /**
   * @param origin Validated HTTPS policy origin; login always starts at its root with fresh gateway state.
   * @param locale Shell-owned login title.
   * @param parent Current application or mandatory-update window.
   * @param record Fixed, nonsecret login outcomes for diagnostic evidence.
   */
  constructor(origin2, locale, parent, record4) {
    this.origin = origin2;
    this.locale = locale;
    this.parent = parent;
    this.record = record4;
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
  locale;
  parent;
  record;
  browserSession = session.fromPartition(`dsh-policy-auth-${randomUUID2()}`, { cache: false });
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
    return url.protocol === "https:" && url.username === "" && url.password === "" && (url.origin === this.origin || FEISHU_ORIGINS.includes(url.origin));
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

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/update-dialog.ts
import { ipcMain as ipcMain3 } from "electron";
var UPDATE_DIALOG_IPC = { status: "dsh-update-dialog:status", respond: "dsh-update-dialog:respond" };
var page2 = "dsh-app://shell/update-dialog.html";
var DesktopUpdateDialog = class {
  /**
   * @param preload - Bundled isolated preload.
   * @param locale - Shell-owned copy.
   */
  constructor(preload, locale) {
    this.preload = preload;
    this.locale = locale;
    ipcMain3.handle(UPDATE_DIALOG_IPC.status, (event) => this.owned(event).view);
    ipcMain3.handle(UPDATE_DIALOG_IPC.respond, (event, index) => {
      const active = this.owned(event);
      if (typeof index !== "number" || !Number.isInteger(index) || index !== active.view.cancelId && (index < 0 || index >= active.view.buttons.length)) {
        throw new Error("desktop update: invalid dialog response");
      }
      active.finish(index);
    });
  }
  preload;
  locale;
  disposed = false;
  active;
  /** Focus the current explanation or confirmation without replacing it or granting permission. */
  focus() {
    this.active?.window.focus();
  }
  /**
   * @param parent - Window blocked by this confirmation.
   * @param options - Main-owned localized content, response choices, and optional cancellation signal.
   * @returns A displayed response, or the cancel response when closed, replaced, aborted, or unable to load.
   */
  show(parent, options) {
    this.cancel();
    const buttons = options.buttons ?? [this.locale.messages.updateAcknowledge];
    const cancelId = options.cancelId ?? buttons.length - 1;
    if (this.disposed || options.signal?.aborted === true || parent.isDestroyed()) {
      return Promise.resolve({ response: cancelId, checkboxChecked: false });
    }
    const window = createUpdateOverlay(parent, this.preload, options.title ?? this.locale.messages.updateTitle);
    const view = {
      locale: this.locale.id,
      title: options.title ?? "",
      message: options.message,
      detail: options.detail ?? "",
      buttons,
      cancelId,
      closeLabel: this.locale.messages.updateClose,
      technicalDetails: options.technicalDetails ?? "",
      technicalDetailsLabel: this.locale.messages.updateTechnicalDetails
    };
    return new Promise((resolve4) => {
      const abort = () => {
        finish(cancelId);
      };
      const finish = (response) => {
        if (this.active?.window !== window) return;
        this.active = void 0;
        options.signal?.removeEventListener("abort", abort);
        if (!window.isDestroyed()) window.destroy();
        resolve4({ response, checkboxChecked: false });
      };
      this.active = { window, view, finish };
      options.signal?.addEventListener("abort", abort, { once: true });
      window.once("closed", abort);
      window.webContents.on("will-navigate", (event, url) => {
        if (url !== page2) event.preventDefault();
      });
      window.webContents.once("render-process-gone", abort);
      void window.loadURL(page2).catch(abort);
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
    ipcMain3.removeHandler(UPDATE_DIALOG_IPC.status);
    ipcMain3.removeHandler(UPDATE_DIALOG_IPC.respond);
  }
  owned(event) {
    const active = this.active;
    if (active === void 0 || event.sender !== active.window.webContents || event.senderFrame !== active.window.webContents.mainFrame || event.senderFrame.url !== page2) {
      throw new Error("desktop update: rejected unowned dialog renderer");
    }
    return active;
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop/src/main.ts
var focusPrimaryWindow = () => {
};
var stopForRecovery = async () => {
};
var shuttingDown = false;
var windowsLanguage;
function currentDesktopLocale() {
  return resolveDesktopLocale(windowsLanguage ?? app4.getLocale());
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
    app4.quit();
  },
  restart: () => {
    app4.relaunch();
    app4.quit();
  }
});
function reportFatal(error) {
  console.error(error);
  if (shuttingDown) return;
  void recovery.report(error).catch((failure) => {
    console.error(failure);
    app4.exit(1);
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
  const development = !app4.isPackaged;
  const node = process.execPath;
  const nodeBin = development ? join10(app4.getAppPath(), "scripts", "node-bin") : join10(process.resourcesPath, "runtime", "bin");
  const pnpm = (development ? process.env.DSH_DESKTOP_PNPM_ENTRY : void 0) ?? (development ? join10(app4.getAppPath(), "node_modules", "pnpm", "bin", "pnpm.mjs") : join10(process.resourcesPath, "runtime", "pnpm", "bin", "pnpm.mjs"));
  const dsh = (development ? process.env.DSH_DESKTOP_DSH_DIR : void 0) ?? (development ? join10(app4.getAppPath(), ".desktop-build", "development", "project") : join10(app4.getAppPath(), "dsh"));
  return { node, nodeBin, pnpm, dsh };
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
function createWindow(preload, show = false, primary = false) {
  const window = new BrowserWindow4({
    // SEP uses an unpackaged Electron executable; give Windows the DSH icon.
    ...process.platform === "win32" ? {
      icon: app4.isPackaged ? join10(process.resourcesPath, "icon.png") : join10(app4.getAppPath(), "resources", "icon-macos.png")
    } : {},
    width: 1280,
    height: 840,
    minWidth: 880,
    minHeight: 600,
    show,
    ...process.platform === "win32" && primary ? {
      titleBarStyle: "hidden",
      titleBarOverlay: {
        height: WINDOWS_TITLEBAR_HEIGHT,
        color: nativeTheme.shouldUseDarkColors ? "#1b1b1c" : "#f9fafb",
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
      webSecurity: true
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (["http:", "https:"].includes(new URL(url).protocol)) void shell2.openExternal(url);
    return { action: "deny" };
  });
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
      Menu.buildFromTemplate(items.map((item) => ({
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
      if (["http:", "https:"].includes(destination.protocol)) void shell2.openExternal(url);
    }
  });
  return window;
}
async function main() {
  const journalDirectory = process.env.DSH_DESKTOP_UPDATE_JOURNAL_DIR;
  const updateJournal = journalDirectory === void 0 ? void 0 : new DesktopUpdateJournal(journalDirectory, app4.getVersion());
  const resources = runtimeResources();
  const paths = resolveDesktopPaths();
  const development = !app4.isPackaged;
  const connectionArgs = process.argv.filter((arg) => arg.startsWith("--sep-recovery-connection="));
  if (connectionArgs.length > 1) throw new Error("RECOVERY_DESKTOP_CONNECTION");
  const connectionFile = connectionArgs[0]?.slice("--sep-recovery-connection=".length);
  const managed = connectionFile === void 0 ? void 0 : await readManagedDesktopConnection(connectionFile);
  if (managed !== void 0 && managed.dshVersion !== app4.getVersion()) throw new Error("RECOVERY_DESKTOP_IDENTITY");
  const activeProject = managed?.projectDir ?? paths.profile;
  const manager = new DesktopProjectManager(paths, resources);
  let quitting = false;
  let startup;
  let workspaceRecovery;
  let mainWindow;
  let backgroundLifecycle;
  let shellInstallerOwnsQuit = false;
  let requireCleanStop = false;
  let updateStoppedHost = false;
  let updateStopFailure;
  let updateState = { phase: "idle" };
  let mandatoryPolicy;
  let mandatoryUI;
  let policyAuth;
  const isQuitting = () => quitting;
  const currentMainWindow = () => mainWindow;
  const ordinaryDialogs = /* @__PURE__ */ new Set();
  const locale = resolveDesktopLocale(app4.getLocale());
  const messages = locale.messages;
  const updateDialog = new DesktopUpdateDialog(fileURLToPath(new URL("./preload-update-dialog.cjs", import.meta.url)), locale);
  const isMandatory = () => mandatoryPolicy?.state.blocking === true;
  const ordinaryMessageBox = async (options) => {
    const controller = new AbortController();
    ordinaryDialogs.add(controller);
    try {
      if (mainWindow === void 0) return { response: options.cancelId ?? 0, checkboxChecked: false };
      return await updateDialog.show(mainWindow, { ...options, signal: controller.signal });
    } finally {
      ordinaryDialogs.delete(controller);
    }
  };
  const sepUpdates = managed === void 0 ? void 0 : createManagedUpdater({ app: app4, dialog: { showMessageBox: ordinaryMessageBox }, BrowserWindow: BrowserWindow4, powerMonitor, projectDir: activeProject, nodeExecutable: process.env.DSH_DESKTOP_NODE_BINARY, onState: state => publishUpdate(state) });
  const appPreload = fileURLToPath(new URL("./preload-app.cjs", import.meta.url));
  const applicationUrl = `${SCHEME}://app/`;
  let hostUrl;
  let hostCookie;
  let injections = [];
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
  const showManagedRecovery = (phase) => {
    hostUrl = void 0;
    hostCookie = void 0;
    injections = [];
    const message = phase === "blocked"
      ? "自动恢复已暂停。请查看恢复提示，并确认未完成任务的状态。"
      : "宿主意外退出，正在重新连接（最多等待 60 秒）。恢复后请确认未完成任务的状态。";
    const window2 = mainWindow;
    if (quitting || window2 === void 0 || window2.isDestroyed()) return;
    const script = "(() => { let panel = document.getElementById('sep-host-recovery'); if (!panel) { panel = document.createElement('div'); panel.id = 'sep-host-recovery'; panel.setAttribute('role', 'status'); panel.style.cssText = 'position:fixed;inset:64px 24px auto 24px;z-index:2147483647;padding:18px;border-radius:12px;background:#20242c;color:#fff;border:1px solid #596579;box-shadow:0 4px 24px #0006;font:14px system-ui'; document.body.appendChild(panel); } panel.textContent = " + JSON.stringify(message) + "; })()";
    void window2.webContents.executeJavaScript(script).catch(() => {});
  };
  const backend = new DesktopBackendController((onFailure) => {
    const hostInspectPort = developmentHostInspectPort(development);
    const host = managed !== void 0 ? new ManagedDesktopHost(managed, (error) => {
      // A guardian failure is not a manual stop. Only an explicit recovery action or
      // application quit closes the managed backend; the guardian owns its restart budget.
      reportFatal(error);
    }, {
      onUnavailable: showManagedRecovery,
      authenticate: (url, signal) => authenticateWebHost(url, signal),
      onReconnected: async (ready, cookie, signal) => {
        if (quitting || shuttingDown || signal.aborted) return;
        hostCookie = cookie;
        hostUrl = ready.url;
        injections = ready.injections;
        navigation = void 0;
        await navigateMain(applicationUrl);
      }
    }) : new DesktopHostProcess(
      resources.node,
      resources.dsh,
      activeProject,
      hostInspectPort,
      process.env,
      onFailure,
      development ? join10(app4.getAppPath(), ".desktop-build", "targets", `${process.platform === "darwin" ? "mac" : "win"}-${process.arch}`, "runtime", "primary-runtime") : join10(process.resourcesPath, "runtime", "primary-runtime"),
      development ? "link" : "runtime",
      resources
    );
    return {
      start: async () => {
        const ready = await host.start();
        hostCookie = await authenticateWebHost(ready.url);
        hostUrl = ready.url;
        if (ready.injections === void 0) throw new Error("Desktop Host did not provide boot injections");
        injections = ready.injections;
      },
      stop: async () => {
        try {
          await host.stop(requireCleanStop);
        } catch (error) {
          if (!requireCleanStop || !(error instanceof DesktopHostUncleanExitError)) throw error;
          updateStopFailure = error;
        }
      },
      updateTasks: (action) => host.updateTasks(action)
    };
  }, (state) => {
    if (state.phase === "error") reportFatal(new Error(state.message));
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
        title: messages.updateFailedTitle,
        message: desktopUpdateErrorSummary(state, messages),
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
    for (const window2 of BrowserWindow4.getAllWindows()) {
      window2.webContents.send(DESKTOP_IPC.updatesPresentation, presentDesktopUpdate(state));
    }
    if (state.phase === "error" && state.failedOperation !== "check") {
      const restoreHost = state.failedOperation === "install" && updateStoppedHost && !quitting;
      shellInstallerOwnsQuit = false;
      updateStoppedHost = false;
      if (restoreHost) {
        const hostReady = backend.start(async () => {
        });
        startup = hostReady;
        const recovery2 = hostReady.then(async () => {
          if (quitting) return;
          navigation = void 0;
          await navigateMain(applicationUrl);
          if (backend.host !== void 0) updateJournal?.action("workspace-ready");
        });
        workspaceRecovery = recovery2;
        void recovery2.catch(reportFatal).finally(() => {
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
  stopForRecovery = () => backend.close();
  const reconcileBackend = () => {
    startup ??= (async () => {
      await navigateMain(applicationUrl);
      await backend.start(async () => {
        if (managed === void 0) await manager.applyRelease(app4.isPackaged);
      });
      if (backend.host !== void 0) updateJournal?.action("workspace-ready");
    })().catch((error) => {
      updateJournal?.action("workspace-failed");
      reportFatal(error);
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
      await workspaceRecovery;
      await startup?.catch(() => void 0);
      const host = backend.host;
      if (host === void 0) throw new DesktopUpdatePreparationError("tasks-unavailable", messages.updateTasksUnavailable);
      const active = await host.updateTasks("inspect");
      const confirmation = {
        type: active ? "warning" : "info",
        title: messages.updateTitle,
        message: active ? messages.updateActiveTasks : formatDesktopMessage(messages.updateDownloadedTitle, { version: updates.state.version ?? "" }),
        detail: active ? messages.updateActiveTasksDetail : messages.updateDownloadedDetail,
        buttons: active ? [messages.updateStopTasks, messages.updateLater] : [messages.installAndRestart],
        defaultId: 1,
        cancelId: 1
      };
      if (isMandatory()) {
        if (!await mandatoryUI?.confirm(updates.state.version ?? "", active)) return false;
      } else {
        if (mainWindow === void 0) return false;
        const result = await updateDialog.show(mainWindow, confirmation);
        if (result.response !== 0 || isMandatory()) return false;
      }
      if (backend.host !== host) throw new DesktopUpdatePreparationError("tasks-unavailable", messages.updateTasksUnavailable);
      try {
        const stillActive = await host.updateTasks("lock");
        if (stillActive && !active) throw new DesktopUpdatePreparationError("tasks-changed", messages.updateTasksChanged);
        mandatoryUI?.preparingRestart(stillActive);
        requireCleanStop = true;
        updateStopFailure = void 0;
        await backend.stop();
        updateStoppedHost = true;
        const stopFailure = updateStopFailure;
        if (stopFailure !== void 0) throw new DesktopUpdatePreparationError("stop-failed", messages.updateStopFailed, stopFailure.message);
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
    managed === void 0 ? void 0 : () => false
  );
  const updateSchedule = new DesktopUpdateSchedule(updates, resolveDesktopUpdateScheduleConfig(process.env));
  const downloadUpdate = async (version) => {
    updateJournal?.action("download-requested");
    const state = await updates.download(version);
    if (state.phase !== "ready" || quitting) return state;
    return updates.install(version);
  };
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.hostname === "shell") {
      const allowed = new Set(["/update-dialog.html", "/update-dialog.js", "/update-dialog.css", "/update-close.svg", "/mandatory-update.html", "/mandatory-update.js", "/mandatory-update.css", "/policy-login-loading.html"]);
      return allowed.has(url.pathname) ? serveWebDocument(request, join10(app4.getAppPath(), "renderer")) : Promise.resolve(new Response(null, { status: 404 }));
    }
    if (url.hostname === "app") {
      if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname.startsWith("/assets/") || ["/favicon.svg", "/manifest.webmanifest"].includes(url.pathname)) {
        return serveWebDocument(request, join10(resources.dsh, "node_modules", "@deepseek-ai", "dsh-web-frontend", "dist"));
      }
      if (backend.host === void 0 || hostUrl === void 0 || hostCookie === void 0) {
        return Promise.resolve(new Response(null, { status: 503 }));
      }
      return forwardWebRequest(request, hostUrl, hostCookie);
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  installDesktopDirectoryPicker(() => mainWindow);
  ipcMain4.handle(DESKTOP_IPC.boot, async (event) => {
    assertDesktopSender(event, ["app"]);
    await startup;
    if (backend.host === void 0 || hostUrl === void 0) throw new Error("Desktop Host is unavailable");
    return { injections, streamBaseUrl: new URL(hostUrl).origin };
  });
  ipcMain4.handle(DESKTOP_IPC.bootFailed, (event, message) => {
    assertDesktopSender(event, ["app"]);
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) {
      throw new Error("dsh desktop: rejected startup failure from a non-primary frame");
    }
    if (typeof message !== "string") throw new Error("dsh desktop: startup failure must be text");
    reportFatal(new Error(message));
  });
  session2.defaultSession.webRequest.onBeforeSendHeaders({ urls: ["ws://127.0.0.1/*"] }, (details, callback) => {
    if (hostUrl === void 0 || hostCookie === void 0 || details.webContentsId !== mainWindow?.webContents.id) {
      callback({});
      return;
    }
    const target = new URL(hostUrl);
    const requested = new URL(details.url);
    if (requested.host !== target.host) {
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
  ipcMain4.on(DESKTOP_IPC.nativeThemeSet, (event, source) => {
    if (mainWindow === void 0 || event.sender !== mainWindow.webContents) return;
    if (source === "light" || source === "dark" || source === "system") nativeTheme.themeSource = source;
  });
  ipcMain4.handle(DESKTOP_IPC.updatesStatus, (event) => {
    assertProductSender(event);
    return presentDesktopUpdate(sepUpdates === void 0 ? updates.state : sepUpdates.status());
  });
  ipcMain4.handle(DESKTOP_IPC.updatesOpen, async (event) => {
    assertProductSender(event);
    await openUpdatePrompt();
  });
  let promptOperation;
  let policyAuthenticationQueued = false;
  const openUpdatePrompt = (manual = false) => {
    if (sepUpdates !== void 0) return sepUpdates.check();
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
      let state = updates.state;
      if (manual || state.phase === "idle" || state.phase === "error" && state.failedOperation === "check") {
        const controller = new AbortController();
        ordinaryDialogs.add(controller);
        const progress = mainWindow === void 0 ? Promise.resolve() : updateDialog.show(mainWindow, {
          type: "info",
          title: messages.updateCheckTitle,
          message: messages.updateChecking,
          buttons: [messages.later],
          cancelId: 0,
          signal: controller.signal
        });
        try {
          if (!joinedPolicyAuthentication) {
            void checkPolicyManually("deferred").catch((error) => {
              console.error(error);
            });
          }
          state = await updateSchedule.check(true);
        } finally {
          controller.abort();
          ordinaryDialogs.delete(controller);
          await progress;
        }
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
          title: messages.updateCheckTitle,
          message: formatDesktopMessage(messages.updateCurrent, { version: app4.getVersion() })
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
          title: messages.updateCheckTitle,
          message: messages.updateAvailable,
          detail: formatDesktopMessage(messages.updateDetail, { version: state.version ?? "" }),
          buttons: [messages.updateDownload],
          cancelId: 1
        });
        if (result.response !== 0) return;
      }
      if (!isMandatory() && state.version !== void 0) {
        failedOperation = "download";
        await showUpdateFailure(await downloadUpdate(state.version));
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
    if (authenticationOperation !== void 0) {
      policyAuth?.focus();
      updateDialog.focus();
      return;
    }
    policyAuthenticationQueued = true;
    flushQueuedPolicyAuthentication();
  };
  const runPolicyAuthentication = async () => {
    if (policyAuth === void 0 || mandatoryPolicy === void 0 || quitting) return void 0;
    const parent = mandatoryUI?.confirmationWindow ?? mainWindow;
    if (parent === void 0) return void 0;
    const consent = await updateDialog.show(parent, {
      type: "info",
      title: messages.policyLoginTitle,
      message: messages.policyLoginRequired,
      buttons: [messages.policyLogin, messages.later],
      cancelId: 1
    });
    if (consent.response !== 0 || isQuitting()) return void 0;
    const outcome = await policyAuth.login();
    if (isQuitting() || outcome === "cancelled") return void 0;
    if (outcome === "failed") {
      await updateDialog.show(parent, {
        type: "error",
        title: messages.policyLoginTitle,
        message: messages.policyLoginFailed,
        buttons: [messages.updateAcknowledge],
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
    if (policy?.error !== "authentication-required") return policy;
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
  app4.on("will-quit", () => {
    sepUpdates?.close();
    backgroundLifecycle?.dispose();
    updateSchedule.dispose();
    powerMonitor.off("resume", automaticCheck);
    updates.dispose();
  });
  app4.setAboutPanelOptions({
    applicationName: "DeepSeek Harness",
    applicationVersion: app4.getVersion(),
    // The release has no separate build number; omit Electron's bundle version.
    version: "",
    copyright: "",
    iconPath: development ? join10(app4.getAppPath(), "resources", "icon-windows.png") : join10(process.resourcesPath, "icon.png")
  });
  const darwin = process.platform === "darwin";
  const platformMenus = darwin ? [{ role: "fileMenu" }, { role: "editMenu" }, { role: "windowMenu" }] : [{ role: "editMenu" }];
  const hideCommands = darwin ? [{ role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }] : [];
  const applicationItems = () => [
    { label: currentDesktopLocale().messages.aboutMenu, role: "about" },
    { type: "separator" },
    { label: currentDesktopLocale().messages.checkUpdatesMenu, click: () => {
      void openUpdatePrompt(true);
    } },
    { label: "全插件更新兼容性报告…", visible: managed !== void 0, click: () => { void sepUpdates?.report(); } },
    { label: "取消待执行更新", visible: managed !== void 0, click: () => { void sepUpdates?.cancel(); } },
    { type: "separator" },
    ...hideCommands,
    { role: "quit", ...process.platform === "win32" ? { label: currentDesktopLocale().messages.exitApplication } : {} }
  ];
  Menu.setApplicationMenu(process.platform === "win32" ? null : Menu.buildFromTemplate([{
    label: darwin ? app4.name : currentDesktopLocale().messages.application,
    submenu: applicationItems()
  }, ...platformMenus]));
  if (process.platform === "win32") {
    ipcMain4.handle(DESKTOP_IPC.windowsMenu, (event, name, x, y) => {
      assertDesktopSender(event, ["app"]);
      if (mainWindow === void 0 || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error("desktop menu: rejected sender");
      if (name !== "application" && name !== "edit" || typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 1e5 || y > 1e5) throw new Error("desktop menu: invalid popup request");
      const window2 = mainWindow;
      const editItem = (label, keyCode, modifiers, accelerator) => ({
        label,
        ...accelerator === void 0 ? {} : { accelerator },
        click: () => {
          window2.webContents.focus();
          window2.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
          window2.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
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
      return new Promise((resolve4) => {
        Menu.buildFromTemplate(items).popup({ window: window2, x: Math.round(x * zoom), y: Math.round(y * zoom), callback: resolve4 });
      });
    });
    ipcMain4.on(DESKTOP_IPC.windowsAppearance, (event, language, color, symbolColor) => {
      if (mainWindow === void 0 || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return;
      if (!event.senderFrame.url.startsWith(`${SCHEME}://app/`)) return;
      if (typeof language === "string" && /^[a-zA-Z]+(?:-[a-zA-Z0-9]+)*$/u.test(language)) {
        windowsLanguage = language;
      }
      const validColor = (value) => typeof value === "string" && /^(?:#[\da-f]{3,8}|rgba?\([\d.,%\s]+\))$/iu.test(value);
      if (validColor(color) && validColor(symbolColor)) mainWindow.setTitleBarOverlay({ color, symbolColor });
    });
  }
  const createMainWindow = () => {
    const window2 = createWindow(appPreload, true, true);
    mainWindow = window2;
    backgroundLifecycle?.bindWindow(window2);
    window2.on("focus", automaticCheck);
    window2.on("closed", () => {
      if (mainWindow === window2) mainWindow = void 0;
    });
    window2.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3 && !quitting && !window2.isDestroyed()) {
        reportFatal(new Error(`Desktop page failed to load: ${url} (${String(code)}: ${description})`));
      }
    });
    window2.webContents.on("preload-error", (_event, _path, error) => {
      if (!quitting && !window2.isDestroyed()) reportFatal(error);
    });
    window2.webContents.on("render-process-gone", (_event, details) => {
      navigation = void 0;
      if (!quitting && !window2.isDestroyed() && details.reason !== "clean-exit") {
        reportFatal(new Error(`Desktop renderer exited: ${details.reason}`));
      }
    });
    return window2;
  };
  focusPrimaryWindow = () => {
    if (quitting) return;
    void sepUpdates?.open();
    if (isMandatory()) {
      mandatoryUI?.focus();
      return;
    }
    const window2 = mainWindow;
    if (window2 === void 0 || window2.isDestroyed()) {
      try {
        createMainWindow();
      } catch (error) {
        reportFatal(error);
        return;
      }
      void navigateMain(applicationUrl).catch(reportFatal);
      return;
    }
    if (window2.isMinimized()) window2.restore();
    window2.show();
    window2.focus();
  };
  app4.on("activate", () => {
    if (BrowserWindow4.getAllWindows().length === 0) focusPrimaryWindow();
  });
  app4.on("window-all-closed", () => {
    if (process.platform !== "darwin") app4.quit();
  });
  app4.on("before-quit", (event) => {
    sepUpdates?.close();
    shuttingDown = true;
    updateJournal?.action("quit-requested");
    if (shellInstallerOwnsQuit) {
      updateDialog.dispose();
      mandatoryUI?.dispose();
      return;
    }
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    mainWindow?.hide();
    updateSchedule.dispose();
    updateDialog.dispose();
    mandatoryUI?.dispose();
    void Promise.all([Promise.resolve(mandatoryPolicy?.dispose()).then(() => policyAuth?.dispose()), backend.close()]).catch((error) => {
      console.error(error);
    }).finally(() => {
      app4.quit();
    });
  });
  mainWindow = createMainWindow();
  if (process.platform === "win32" && managed !== void 0) {
    backgroundLifecycle = createSepBackgroundLifecycle({
      enabled: true, app: app4, Tray: SepTray, Menu,
      icon: sepNativeImage.createFromPath(join10(app4.getAppPath(), "resources", "icon-macos.png")).resize({width: 32, height: 32}),
      show: () => focusPrimaryWindow(),
      canHide: () => !quitting && !shuttingDown && !shellInstallerOwnsQuit,
      onUnavailable: () => console.error("SEP_BACKGROUND_UNAVAILABLE: normal window exit retained")
    });
    backgroundLifecycle.bindWindow(mainWindow);
  }
  const manifest = JSON.parse(await readFile3(join10(app4.getAppPath(), "package.json"), "utf8"));
  if (typeof manifest !== "object" || manifest === null) throw new Error("desktop policy: invalid application manifest");
  const developmentPolicy = app4.isPackaged ? void 0 : process.env.DSH_DESKTOP_MANDATORY_UPDATE_CONFIG;
  const policyInput = app4.isPackaged ? "dshMandatoryUpdatePolicy" in manifest ? manifest.dshMandatoryUpdatePolicy : void 0 : developmentPolicy === void 0 ? void 0 : JSON.parse(developmentPolicy);
  const policyConfig = managed === void 0 ? resolveDesktopPolicyConfig(policyInput, !app4.isPackaged) : void 0;
  if (policyConfig !== void 0) {
    if (policyConfig.authentication === "feishu-test") {
      policyAuth = new DesktopPolicyTestAuth(
        policyConfig.origin,
        locale,
        () => mandatoryUI?.confirmationWindow ?? mainWindow,
        (event) => {
          console.info(`desktop policy authentication: ${event}`);
          updateJournal?.action(`policy-login-${event}`);
        }
      );
    }
    const bundleId = app4.isPackaged ? "dshDesktopAppId" in manifest ? manifest.dshDesktopAppId : void 0 : process.env.DSH_DESKTOP_APP_ID;
    if (typeof bundleId !== "string" || bundleId.trim() === "") throw new Error("desktop policy: missing application bundle ID");
    if (!["win32", "darwin"].includes(process.platform) || !["x64", "arm64"].includes(process.arch)) throw new Error("desktop policy: unsupported platform");
    let wasBlocking = false;
    mandatoryPolicy = new DesktopMandatoryUpdatePolicy(policyConfig, {
      platform: process.platform === "win32" ? "desktop-win" : "desktop-mac",
      arch: process.arch,
      version: app4.getVersion(),
      bundledDshVersion: app4.isPackaged ? readDesktopRuntime(resources.dsh).release.version : app4.getVersion(),
      bundleId,
      locale: locale.id
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
    }, policyAuth?.request);
    const policy = mandatoryPolicy;
    mandatoryUI = new DesktopMandatoryUpdateWindow({
      preload: fileURLToPath(new URL("./preload-mandatory.cjs", import.meta.url)),
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
      if (app4.isPackaged && state.error === "authentication-required" && !isQuitting()) queuePolicyAuthentication();
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
var ownsDesktopInstance = claimDesktopSingleInstance(app4, () => {
  focusPrimaryWindow();
});
if (ownsDesktopInstance) void app4.whenReady().then(main).catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  const diagnosticFile = process.env.DSH_DESKTOP_DIAGNOSTIC_FILE;
  if (diagnosticFile !== void 0) {
    await writeFile(diagnosticFile, `${error instanceof Error ? error.stack ?? message : message}
`).catch(() => void 0);
  }
  reportFatal(error);
}).catch((error) => {
  console.error(error);
  app4.exit(1);
});
// Patched source: four-fixes-20260921; original source map not used.
