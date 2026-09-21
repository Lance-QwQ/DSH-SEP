var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : /* @__PURE__ */ Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name]() {
    return __privateGet(this, extra);
  }, set [name](x) {
    return __privateSet(this, extra, x);
  } }, name));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name) : __name(target, name);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name, desc), p ? k ^ 4 ? extra : desc : target;
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/boot/plugin-manager/src/index.ts
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile as readFile3, rm } from "node:fs/promises";
import { join as join3 } from "node:path";
import { withFileLock as withFileLock2, writeFileAtomic as writeFileAtomic4 } from "@deepseek-ai/dsh-atomic-write";
import z from "@deepseek-ai/schemastery";
import { TypertRemoteService, Remote } from "@deepseek-ai/dsh-typert-protocol";
import { pluginEntryId, readPluginInventory } from "@deepseek-ai/dsh-host-plugin-inventory";
import {
  readProfileManifest as readProfileManifest2,
  resolveBundleDir as resolveBundleDir2,
  loadOverlayPatches as loadOverlayPatches2,
  composeEntries,
  reconcileProfilePatches,
  readProfilePatches,
  OPTIONAL_BUNDLES
} from "@deepseek-ai/dsh-app-boot";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/boot/plugin-manager/src/operations.ts
import { mkdir, mkdtemp, open } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execa } from "execa";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import {
  DEFAULT_PROFILE_BUNDLES,
  initProfile,
  PROFILE_TEMPLATES,
  readProfileManifest,
  resolveBundleDir,
  resolveProfileDir,
  loadOverlayPatches
} from "@deepseek-ai/dsh-app-boot";
import { scrubbedParentEnv } from "@deepseek-ai/dsh-subprocess";
function anchorPathSpec(argument, cwd) {
  const match = /^(?<prefix>(?:file|link):)?(?<path>\.{1,2}(?:[/\\].*)?)$/.exec(argument);
  if (match?.groups?.path === void 0) return argument;
  return `${match.groups.prefix ?? ""}${resolve(cwd, match.groups.path)}`;
}
function bundleManifest(name, dir, anchor) {
  const packageDir = resolveBundleDir("dsh", name, anchor, dir);
  const manifest = readProfileManifest("dsh", packageDir);
  return manifest.dsh?.bundle?.patch === void 0 ? void 0 : manifest;
}
async function saveManifest(dir, manifest) {
  await writeFileAtomic(join(dir, "package.json"), JSON.stringify(manifest, void 0, 2) + "\n", { mode: 384 });
}
async function reconcile(before, dir, anchor, options) {
  const after = readProfileManifest("dsh", dir);
  const dependencies = Object.keys(after.dependencies ?? {});
  const beforeDeps = new Set(Object.keys(before.dependencies ?? {}));
  const previous = after.dsh?.profile?.bundles ?? [];
  const bundles = previous.filter((name) => {
    if (!beforeDeps.has(name) && !dependencies.includes(name)) return true;
    return dependencies.includes(name) && bundleManifest(name, dir, anchor) !== void 0;
  });
  for (const name of dependencies) {
    if (beforeDeps.has(name)) continue;
    const metadata = bundleManifest(name, dir, anchor);
    if (metadata?.dsh?.bundle === void 0) {
      options.onOutput?.(`dsh: warning: ${name} declares no dsh.bundle \u2014 installed as a plain dependency, not a profile layer
`, "stderr");
      continue;
    }
    loadOverlayPatches("dsh", join(resolveBundleDir("dsh", name, anchor, dir), metadata.dsh.bundle.patch));
    if (!bundles.includes(name)) {
      bundles.push(name);
    }
  }
  if (JSON.stringify(previous) === JSON.stringify(bundles)) return;
  after.dsh = { ...after.dsh, profile: { ...after.dsh?.profile, bundles } };
  await saveManifest(dir, after);
}
async function runProfilePnpm(context, args, options) {
  const dir = context.dir ?? resolveProfileDir(context.profile, context.home);
  const before = readProfileManifest("dsh", dir);
  const logRoot = join(dir, ".plugin-manager", "logs");
  await mkdir(logRoot, { recursive: true, mode: 448 });
  const logDir = await mkdtemp(join(logRoot, "operation-"));
  const logPath = join(logDir, "pnpm.log");
  const log = await open(logPath, "wx", 384);
  let output = Buffer.alloc(0);
  let truncated = false;
  const cancellation = new AbortController();
  const child = execa(options.command ?? "pnpm", [...options.args ?? [], ...args.map((arg) => anchorPathSpec(arg, context.cwd))], {
    cwd: dir,
    env: { ...options.execution === "cli" ? process.env : scrubbedParentEnv(), ...options.env },
    extendEnv: false,
    reject: false,
    stdout: options.execution === "cli" ? "inherit" : "pipe",
    stderr: options.execution === "cli" ? "inherit" : "pipe",
    buffer: false,
    stdin: options.execution === "cli" ? "inherit" : "ignore",
    cancelSignal: options.signal === void 0 ? cancellation.signal : AbortSignal.any([cancellation.signal, options.signal])
  });
  let writes = Promise.resolve();
  const collect = async (stream, kind) => {
    try {
      for await (const chunk of stream) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        writes = writes.then(async () => {
          await log.write(bytes);
        });
        await writes;
        options.onOutput?.(bytes.toString("utf8"), kind);
        output = Buffer.concat([output, bytes]);
        if (output.length > options.outputBytes) {
          truncated = true;
          output = output.subarray(output.length - options.outputBytes);
        }
      }
    } catch (error) {
      cancellation.abort();
      throw error;
    }
  };
  let exitCode;
  try {
    const [completion, ...streams] = await Promise.allSettled([
      child,
      ...child.stdout === null ? [] : [collect(child.stdout, "stdout")],
      ...child.stderr === null ? [] : [collect(child.stderr, "stderr")]
    ]);
    for (const stream of streams) if (stream.status === "rejected") throw stream.reason;
    if (completion.status === "rejected") throw completion.reason;
    const result = completion.value;
    exitCode = result.exitCode ?? (result.code === "ENOENT" ? 127 : 1);
    if (result.failed && output.length === 0) {
      const diagnostic = result.shortMessage ?? "pnpm failed";
      await log.write(diagnostic);
      truncated = Buffer.byteLength(diagnostic) > options.outputBytes;
      output = Buffer.from(diagnostic).subarray(0, options.outputBytes);
    }
    if (exitCode === 0 && options.activateNewBundles !== false) await reconcile(before, dir, context.installAnchor, options);
  } finally {
    await log.close();
  }
  return { exitCode, output: output.toString("utf8"), truncated, logPath };
}
async function viewProfilePackage(dir, spec, options) {
  const result = await execa(options.command ?? "pnpm", [...options.args ?? [], "view", spec, "name", "version", "description", "dsh", "--json"], {
    cwd: dir,
    env: { ...scrubbedParentEnv(), ...options.env },
    extendEnv: false,
    reject: false,
    stdin: "ignore",
    timeout: options.timeoutMs,
    ...options.signal === void 0 ? {} : { cancelSignal: options.signal }
  });
  const cause = result.exitCode === void 0 && !result.timedOut && !result.isCanceled ? Object.assign(new Error(result.shortMessage), { code: result.code }) : void 0;
  return {
    exitCode: result.exitCode ?? null,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    ...cause === void 0 ? {} : { cause }
  };
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/boot/plugin-manager/src/install-failure.ts
var LOG_KINDS = [
  ["build-blocked", /ERR_PNPM_IGNORED_BUILDS|Ignored build scripts/],
  ["not-found", /ERR_PNPM_FETCH_404|\bE404\b|404 Not Found|Not Found - GET/],
  ["no-matching-version", /ERR_PNPM_NO_MATCHING_VERSION|\bETARGET\b|No matching version/],
  ["disk-full", /\bENOSPC\b|no space left on device/i],
  ["permission", /\bEACCES\b|\bEPERM\b|permission denied/i],
  ["integrity", /ERR_PNPM_TARBALL_INTEGRITY|ERR_PNPM_BAD_TARBALL_SIZE|\bEINTEGRITY\b/],
  ["network", /\bENOTFOUND\b|\bECONNRESET\b|\bETIMEDOUT\b|\bECONNREFUSED\b|\bEAI_AGAIN\b|ERR_PNPM_META_FETCH_FAIL|ERR_PNPM_FETCH_5\d\d|ERR_PNPM_FETCH_TIMEOUT|socket hang up|Could not resolve host|unable to access/]
];
function classifyInstallFailure(facts) {
  if (facts.timedOut === true) return "timeout";
  if (facts.cause?.code === "ENOENT") return "pnpm-missing";
  for (const [kind, pattern] of LOG_KINDS) {
    if (pattern.test(facts.log)) return kind;
  }
  return "unknown";
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/boot/plugin-manager/src/install-spec.ts
import { isAbsolute } from "node:path";
var GIT_SHORTHAND = /^(?:github|gitlab|bitbucket|gist):/i;
var GIT_URL = /^git(?:\+[a-z]+)?:\/\/|^git@[^:]+:/i;
var HOSTED_REPOSITORY_URL = /^https?:\/\/[^/]+\/[^/]+\/[^/#]+(?:\.git)?(?:#.*)?$/i;
var TARBALL_SPEC = /\.(?:tgz|tar\.gz)(?:#.*)?$/i;
var PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
var PACKAGE_NAME_MAX_LENGTH = 214;
var InvalidInstallSpecError = class extends Error {
  /**
   * @param spec - the spec as typed, trimmed.
   * @param reason - why it is refused, as one sentence.
   */
  constructor(spec, reason) {
    super(`plugin-manager: ${reason}: ${spec}`);
    this.spec = spec;
    this.reason = reason;
    this.name = "InvalidInstallSpecError";
  }
  spec;
  reason;
};
function invalid(spec, reason) {
  return new InvalidInstallSpecError(spec, reason);
}
function parseInstallSpec(raw) {
  const spec = raw.trim();
  if (spec === "") throw invalid(spec, "the package spec must not be empty");
  const path = spec.replace(/^(?:file|link):/, "");
  if (path !== spec || isAbsolute(path)) {
    if (!isAbsolute(path)) throw invalid(spec, "a local path must be absolute");
    return TARBALL_SPEC.test(path) ? { kind: "tarball", spec, path } : { kind: "path", spec, path };
  }
  if (/^\.{1,2}(?:[\\/]|$)/.test(spec)) throw invalid(spec, "a local path must be absolute");
  const git = GIT_SHORTHAND.test(spec) || GIT_URL.test(spec) || HOSTED_REPOSITORY_URL.test(spec);
  if (git && !TARBALL_SPEC.test(spec)) return { kind: "git", spec };
  if (/^https?:\/\//i.test(spec)) {
    if (TARBALL_SPEC.test(spec)) return { kind: "tarball", spec };
    throw invalid(spec, "a URL must point at a git repository or a tarball");
  }
  const at = spec.indexOf("@", 1);
  const name = at === -1 ? spec : spec.slice(0, at);
  const range = at === -1 ? void 0 : spec.slice(at + 1);
  if (name.length > PACKAGE_NAME_MAX_LENGTH || !PACKAGE_NAME.test(name)) {
    throw invalid(spec, "not a package name the registry accepts");
  }
  if (range === "") throw invalid(spec, "a version after @ must not be empty");
  return range === void 0 ? { kind: "registry", spec, name } : { kind: "registry", spec, name, range };
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/boot/plugin-manager/src/patch.ts
import { readFile } from "node:fs/promises";
import { isMap, isSeq, parseDocument } from "yaml";
import { loadOptionalPatches } from "@deepseek-ai/dsh-app-boot";
import { writeFileAtomic as writeFileAtomic2 } from "@deepseek-ai/dsh-atomic-write";
async function writePluginEnabled(filename, id, name, enabled) {
  let text;
  try {
    text = await readFile(filename, "utf8");
  } catch (error2) {
    if (error2.code !== "ENOENT") throw error2;
    text = "[]\n";
  }
  const document = parseDocument(text, {
    customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value) => value }]
  });
  const error = document.errors[0];
  if (error !== void 0) throw error;
  if (!isSeq(document.contents)) throw new Error("Profile patch must be a YAML sequence");
  loadOptionalPatches("dsh", filename);
  const items = document.contents.items;
  const target = items.findLast((item, index) => {
    if (!isMap(item) || document.getIn([index, "id"]) !== id || item.has("insert")) return false;
    const expectedName = document.getIn([index, "name"]);
    return !expectedName || expectedName === name;
  });
  if (isMap(target)) {
    if (document.getIn([items.indexOf(target), "disabled"]) === !enabled) return false;
    document.setIn([items.indexOf(target), "disabled"], !enabled);
  } else {
    document.add({ id, disabled: !enabled });
  }
  await writeFileAtomic2(filename, String(document), { mode: 384 });
  return true;
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/boot/plugin-manager/src/failure.ts
var ManagementFailure = class extends Error {
  /** Code rendered by the caller's locale dictionary. */
  code;
  /** @param code Localizable management rejection. */
  constructor(code) {
    super(code);
    this.code = code;
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/boot/plugin-manager/src/build-approval.ts
import { readFile as readFile2 } from "node:fs/promises";
import { join as join2 } from "node:path";
import { isAlias, isMap as isMap2, isNode, isScalar, parseDocument as parseDocument2, visit } from "yaml";
import { writeFileAtomic as writeFileAtomic3 } from "@deepseek-ai/dsh-atomic-write";
async function readPolicy(dir) {
  let text;
  try {
    text = await readFile2(join2(dir, "pnpm-workspace.yaml"), "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    text = "{}\n";
  }
  const document = parseDocument2(text);
  if (document.errors[0] !== void 0) throw document.errors[0];
  if (!isMap2(document.contents)) throw new Error("pnpm-workspace.yaml must be a YAML mapping");
  const builds = document.get("allowBuilds");
  if (builds !== void 0 && !isMap2(builds)) throw new Error("allowBuilds must be a YAML mapping");
  visit(builds ?? null, (_key, node) => {
    if (isAlias(node) || isNode(node) && "anchor" in node && node.anchor) {
      throw new Error("allowBuilds must not contain YAML anchors or aliases");
    }
  });
  const pending = isMap2(builds) ? builds.items.flatMap(({ key, value }) => isScalar(key) && typeof key.value === "string" && !/[*?]/.test(key.value) && isScalar(value) && value.value === "set this to true or false" ? [key.value] : []) : [];
  return { document, pending };
}
async function readPendingBuilds(dir) {
  return (await readPolicy(dir)).pending;
}
async function approveBuilds(dir, names) {
  const { document, pending } = await readPolicy(dir);
  if (names.some((name) => !pending.includes(name))) throw new ManagementFailure("stale-approval");
  if (names.length === 0) return;
  for (const name of names) document.setIn(["allowBuilds", name], true);
  await writeFileAtomic3(join2(dir, "pnpm-workspace.yaml"), String(document), { mode: 384 });
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/boot/plugin-manager/src/index.ts
var protectedModules = /* @__PURE__ */ new Set([
  "@deepseek-ai/dsh-plugin-manager",
  "@deepseek-ai/cordis-plugin-loader",
  "@deepseek-ai/cordis-plugin-include",
  "@deepseek-ai/dsh-api-gateway",
  "@deepseek-ai/dsh-host-webserver",
  "@deepseek-ai/dsh-client-modules",
  "@deepseek-ai/dsh-client-ui-settings-plugin-inventory",
  "@deepseek-ai/dsh-client-ui-plugin-manager",
  "@deepseek-ai/dsh-host-plugin-inventory",
  "@deepseek-ai/dsh-typert-registry",
  "@deepseek-ai/dsh-api-remotes",
  "@deepseek-ai/cordis-plugin-timer",
  "@deepseek-ai/dsh-client-connection",
  "@deepseek-ai/dsh-host-frontend-static",
  "@deepseek-ai/dsh-tools",
  "@deepseek-ai/dsh-hmr"
]);
var RESTORED_FILES = ["package.json", "pnpm-lock.yaml"];
var ANSI_SEQUENCE = /\x1b\[[0-9;]*m/g;
function flatten(rows) {
  return rows.flatMap((row) => [row, ...row.group && Array.isArray(row.config) ? flatten(row.config) : []]);
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
function managementError(error) {
  return error instanceof ManagementFailure ? { code: error.code } : { code: "operation-error", diagnostic: messageOf(error) };
}
var InstallCancelledError = class extends Error {
  constructor() {
    super("Installation cancelled");
    this.name = "InstallCancelledError";
  }
};
function stringField(manifest, field) {
  const value = manifest[field];
  return typeof value === "string" ? value : void 0;
}
function inspectionOf(kind, manifest) {
  const dsh = manifest.dsh;
  const declared = typeof dsh === "object" && dsh !== null ? dsh : void 0;
  const bundle = declared !== void 0 && typeof declared.bundle === "object" && declared.bundle !== null;
  const name = stringField(manifest, "name");
  const version = stringField(manifest, "version");
  const description = stringField(manifest, "description");
  return {
    status: "accepted",
    kind,
    bundle,
    ...name === void 0 ? {} : { name },
    ...version === void 0 ? {} : { version },
    ...description === void 0 || description === "" ? {} : { description }
  };
}
function refused(problem, reason) {
  return { status: "refused", problem, reason };
}
var _removeBundle_dec, _cancelInstall_dec, _installBundle_dec, _setBundleEnabled_dec, _setPluginEnabled_dec, _inspect_dec, _listBundles_dec, _listPlugins_dec, _a, _init;
var PluginManager = class extends (_a = TypertRemoteService, _listPlugins_dec = [Remote], _listBundles_dec = [Remote], _inspect_dec = [Remote], _setPluginEnabled_dec = [Remote], _setBundleEnabled_dec = [Remote], _installBundle_dec = [Remote], _cancelInstall_dec = [Remote], _removeBundle_dec = [Remote], _a) {
  constructor(ctx, config) {
    super(ctx, "pluginManager");
    __runInitializers(_init, 5, this);
    __publicField(this, "ownerEntryId");
    __publicField(this, "packageOperations", /* @__PURE__ */ new Set());
    __publicField(this, "profile");
    __publicField(this, "outputBytes");
    __publicField(this, "lockWaitMs");
    __publicField(this, "inspectTimeoutMs");
    __publicField(this, "pnpmCommand");
    __publicField(this, "ownerContext");
    __publicField(this, "abort", new AbortController());
    /** Installations by request id, from their call until it settles. */
    __publicField(this, "installs", /* @__PURE__ */ new Map());
    this.ownerEntryId = ctx.fiber.entry?.id;
    this.ownerContext = ctx;
    this.profile = ctx.profileContext;
    this.outputBytes = config.outputBytes;
    this.lockWaitMs = config.lockWaitMs;
    this.inspectTimeoutMs = config.inspectTimeoutMs;
    this.pnpmCommand = config.pnpmCommand;
    ctx.effect(() => async () => {
      this.abort.abort();
      await Promise.allSettled([...this.packageOperations]);
    }, "plugin-manager: package cancellation");
  }
  async listPlugins() {
    const rows = flatten(composeEntries([readProfilePatches("dsh", this.profile)]));
    const snapshot = await readPluginInventory(this.ctx);
    return snapshot.entries.map((entry) => {
      const actual = [...this.ctx.loader.entries()].find((row) => row.id === entry.entryId);
      const candidates = rows.filter((row) => row.id === actual?.options.id);
      const candidate = candidates[0];
      if (this.isProtected(entry.moduleName, entry.entryId) || entry.entryId === this.ownerEntryId) {
        return { ...entry, readOnlyReason: "management-required" };
      }
      if (candidate === void 0 || candidates.length > 1 || candidate.name !== entry.moduleName || actual?.parent.tree.ctx.fiber.entry?.id !== "include") {
        return { ...entry, readOnlyReason: "unaddressable" };
      }
      return { ...entry, patchId: candidate.id };
    });
  }
  listBundles() {
    const manifest = readProfileManifest2("dsh", this.profile.dir);
    const selected = manifest.dsh?.profile?.bundles ?? [];
    const dependencies = Object.keys(manifest.dependencies ?? {});
    const installation = JSON.parse(readFileSync(this.profile.installAnchor, "utf8"));
    const names = [.../* @__PURE__ */ new Set([...selected, ...dependencies, ...Object.keys(installation.dependencies ?? {})])];
    const bundles = [];
    for (const name of names) {
      const installed = dependencies.includes(name);
      const optional = OPTIONAL_BUNDLES.includes(name);
      const removable = installed && !Object.hasOwn(installation.dependencies ?? {}, name);
      const enabled = selected.includes(name);
      try {
        const info = bundleManifest(name, this.profile.dir, this.profile.installAnchor);
        if (info === void 0) {
          if (enabled) bundles.push({ name, enabled, installed, optional, removable, error: { code: "not-bundle" }, rows: [], overrides: [] });
          continue;
        }
        const readOnlyReason = this.protectsManager(name) ? "management-required" : void 0;
        bundles.push({
          name,
          ...info.version === void 0 ? {} : { version: info.version },
          ...info.description === void 0 || info.description === "" ? {} : { description: info.description },
          enabled,
          installed,
          optional,
          removable: removable && readOnlyReason === void 0,
          ...readOnlyReason === void 0 ? {} : { readOnlyReason },
          ...this.declaredRows(name, info)
        });
      } catch (error) {
        if (enabled || installed) {
          bundles.push({ name, enabled, installed, optional, removable, error: managementError(error), rows: [], overrides: [] });
        }
      }
    }
    return Promise.resolve(bundles);
  }
  async inspect(spec, signal) {
    let parsed;
    try {
      parsed = parseInstallSpec(spec);
    } catch (error) {
      if (!(error instanceof InvalidInstallSpecError)) throw error;
      return refused("invalid-spec", error.reason);
    }
    const manifest = readProfileManifest2("dsh", this.profile.dir);
    const installation = JSON.parse(readFileSync(this.profile.installAnchor, "utf8"));
    const known = /* @__PURE__ */ new Set([
      ...manifest.dsh?.profile?.bundles ?? [],
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(installation.dependencies ?? {})
    ]);
    switch (parsed.kind) {
      case "git":
        return { status: "accepted", kind: "git", bundle: null };
      case "tarball":
        if (parsed.path !== void 0 && !existsSync(parsed.path)) return refused("not-a-package", "the tarball does not exist");
        return { status: "accepted", kind: "tarball", bundle: null };
      case "path": {
        if (!existsSync(parsed.path)) return refused("not-a-package", "the path does not exist");
        let read;
        try {
          read = JSON.parse(await readFile3(join3(parsed.path, "package.json"), "utf8"));
        } catch (error) {
          return refused("not-a-package", `no readable package.json at the path: ${messageOf(error)}`);
        }
        const inspection = inspectionOf("path", read);
        if (inspection.name === void 0) return refused("not-a-package", "the package.json names no package");
        if (known.has(inspection.name)) return refused("already-installed", `${inspection.name} is already installed`);
        if (!inspection.bundle) return refused("not-a-bundle", `${inspection.name} declares no dsh.bundle`);
        return inspection;
      }
      case "registry": {
        if (known.has(parsed.name)) return refused("already-installed", `${parsed.name} is already installed`);
        const view = await viewProfilePackage(this.profile.dir, spec.trim(), {
          ...this.profile.packageManager ?? { command: this.pnpmCommand },
          timeoutMs: this.inspectTimeoutMs,
          ...signal === void 0 ? {} : { signal }
        });
        const log = `${view.stderr}${view.cause === void 0 ? "" : `${messageOf(view.cause)}
`}`.trim();
        if (view.exitCode !== 0 || view.cause !== void 0 || view.timedOut) {
          const kind = classifyInstallFailure({ log, timedOut: view.timedOut, ...view.cause === void 0 ? {} : { cause: view.cause } });
          const reason = log || view.stdout.trim() || `pnpm view exited with ${String(view.exitCode)}`;
          if (kind === "not-found" || kind === "no-matching-version") return refused("not-found", reason);
          if (kind === "network") return refused("network", reason);
          return refused("unknown", view.timedOut ? `pnpm view timed out after ${String(this.inspectTimeoutMs)}ms` : reason);
        }
        let answer;
        try {
          answer = JSON.parse(view.stdout.replace(ANSI_SEQUENCE, "").trim() || "null");
        } catch (error) {
          return refused("unknown", `unreadable pnpm view output: ${messageOf(error)}`);
        }
        const latest = Array.isArray(answer) ? answer.at(-1) : answer;
        if (typeof latest !== "object" || latest === null) return refused("unknown", "pnpm view answered no package");
        const inspection = inspectionOf("registry", latest);
        const named = inspection.name === void 0 ? { ...inspection, name: parsed.name } : inspection;
        if (!named.bundle) return refused("not-a-bundle", `${named.name} declares no dsh.bundle`);
        return named;
      }
    }
  }
  setPluginEnabled(id, enabled) {
    return this.change((result) => this.configure(async () => {
      const row = (await this.listPlugins()).find((item) => item.entryId === id);
      if (row === void 0) throw new ManagementFailure("unknown-plugin");
      if (row.readOnlyReason !== void 0) throw new ManagementFailure(row.readOnlyReason);
      await writePluginEnabled(this.profile.patchPath, row.patchId, row.moduleName, enabled);
      result.warnings = await this.reload(enabled ? [row.patchId] : []);
      const current = (await this.listPlugins()).find((item) => item.entryId === id);
      return current?.enabled !== enabled && this.ownerContext.get("hmr") !== void 0 ? "overridden" : void 0;
    }), { stage: "enable", target: id, enabled }, "plugin");
  }
  setBundleEnabled(name, enabled) {
    return this.change((result) => this.configure(async () => {
      await this.selectBundle(name, enabled);
      result.warnings = await this.reload(enabled ? this.bundleRows(name).map((row) => row.id) : []);
    }), { stage: "enable", target: name, enabled }, "bundle");
  }
  installBundle(spec, options) {
    const requestId = options?.requestId;
    const control = { abort: new AbortController(), phase: "installing", settled: Promise.resolve() };
    const stopped = () => control.abort.signal.aborted;
    if (requestId !== void 0) this.installs.set(requestId, control);
    const announce = (phase) => {
      if (requestId !== void 0) this.ownerContext.emit("plugin-manager/install-state", { requestId, phase });
    };
    const result = this.change(async (result2) => {
      if (spec.trim() === "" || spec.startsWith("-")) throw new ManagementFailure("invalid-spec");
      if (stopped()) throw new InstallCancelledError();
      if (options?.approvedBuilds !== void 0) {
        await approveBuilds(this.profile.dir, options.approvedBuilds);
        result2.approvedBuilds = options.approvedBuilds;
      }
      const files = await this.readRestoredFiles();
      const before = readProfileManifest2("dsh", this.profile.dir).dependencies ?? {};
      announce("installing");
      let name;
      try {
        result2.packageResult = await this.runPnpm(["add", spec], control.abort.signal, requestId);
        if (stopped()) throw new InstallCancelledError();
        if (result2.packageResult.exitCode !== 0) {
          try {
            result2.pendingBuilds = await readPendingBuilds(this.profile.dir);
          } catch (error) {
            this.ownerContext.logger.warn("Could not read pending build approvals after pnpm failed", error);
          }
          throw new Error(result2.packageResult.output);
        }
        const after = readProfileManifest2("dsh", this.profile.dir).dependencies ?? {};
        const installed = Object.keys(after).filter((name2) => before[name2] !== after[name2]);
        if (installed.length === 0) installed.push(...Object.keys(after).filter((name2) => spec === name2 || spec.startsWith(`${name2}@`)));
        const target = installed[0];
        if (installed.length !== 1 || target === void 0) throw new ManagementFailure("ambiguous-install");
        name = target;
        const dir = resolveBundleDir2("dsh", name, this.profile.installAnchor, this.profile.dir);
        const manifest = bundleManifest(name, this.profile.dir, this.profile.installAnchor);
        if (manifest?.dsh?.bundle?.patch === void 0) throw new ManagementFailure("not-bundle");
        loadOverlayPatches2("dsh", join3(dir, manifest.dsh.bundle.patch));
      } catch (error) {
        await this.restoreFiles(files);
        throw error;
      }
      control.phase = "applying";
      announce("applying");
      result2.bundle = name;
      result2.target = name;
      result2.stage = "enable";
      return this.configure(async () => {
        if (options?.enabled !== false) await this.selectBundle(name, true);
        if (Object.hasOwn(before, name)) return "restart-required";
        if (options?.enabled !== false) result2.warnings = await this.reload();
      });
    }, { stage: "install", target: spec, enabled: options?.enabled !== false }, "install");
    control.settled = result.then(() => void 0, () => void 0);
    return result.finally(() => {
      if (requestId !== void 0) this.installs.delete(requestId);
    });
  }
  async cancelInstall(requestId) {
    const control = this.installs.get(requestId);
    if (control === void 0) return { status: "not-running" };
    if (control.phase === "applying") return { status: "too-late" };
    this.ownerContext.emit("plugin-manager/install-state", { requestId, phase: "cancelling" });
    control.abort.abort();
    await control.settled;
    return { status: "cancelled" };
  }
  removeBundle(name) {
    return this.change(async (result) => {
      await this.configure(async () => {
        const bundle = (await this.listBundles()).find((item) => item.name === name);
        if (bundle === void 0 || !bundle.removable) throw new ManagementFailure("not-removable");
        if (this.ownerContext.get("hmr") === void 0 && (this.profile.startedBundles.includes(name) || this.bundleRows(name).some((row) => [...this.ctx.loader.entries()].some((entry) => entry.options.id === row.id && entry.fiber !== void 0)))) {
          throw new ManagementFailure("stop-profile");
        }
        const contributions = bundle.error === void 0 ? this.bundleRows(name) : [];
        if (bundle.enabled) {
          await this.selectBundle(name, false);
          result.warnings = await this.reload();
        }
        if ([...this.ctx.loader.entries()].some((entry) => entry.fiber?.uid != null && contributions.some((row) => row.id === entry.options.id && row.name === entry.options.name))) {
          throw new ManagementFailure("bundle-in-use");
        }
      });
      result.packageResult = await this.runPnpm(["remove", name]);
      if (result.packageResult.exitCode !== 0) throw new Error(result.packageResult.output);
    }, { stage: "remove", target: name }, "remove");
  }
  /** The rows a bundle's patch inserts and the existing rows it changes; an unreadable patch throws. */
  declaredRows(name, info) {
    const patch = info.dsh?.bundle?.patch;
    if (patch === void 0) return { rows: [], overrides: [] };
    const dir = resolveBundleDir2("dsh", name, this.profile.installAnchor, this.profile.dir);
    const patches = loadOverlayPatches2("dsh", join3(dir, patch));
    const live = /* @__PURE__ */ new Map();
    for (const entry of this.ctx.loader.entries()) {
      if (typeof entry.options.id === "string") live.set(entry.options.id, pluginEntryId(entry.id));
    }
    const rows = [];
    for (const row of flatten(composeEntries([patches.filter((item) => item.insert !== void 0)]))) {
      if (typeof row.id !== "string" || typeof row.name !== "string") continue;
      const entryId = live.get(row.id);
      rows.push({ rowId: row.id, moduleName: row.name, ...entryId === void 0 ? {} : { entryId } });
    }
    const declared = new Set(rows.map((row) => row.rowId));
    const overrides = [...new Set(patches.flatMap((item) => item.insert === void 0 && typeof item.id === "string" && !declared.has(item.id) ? [item.id] : []))];
    return { rows, overrides };
  }
  /** Run one pnpm command in the profile, streaming its output as install-log chunks. */
  async runPnpm(args, signal, requestId) {
    const jobId = randomUUID();
    const argv = ["pnpm", ...args];
    const cwd = this.profile.dir;
    const identity = requestId === void 0 ? {} : { requestId };
    const task = runProfilePnpm({ ...this.profile, profile: this.profile.name }, args, {
      execution: "service",
      ...this.profile.packageManager ?? { command: this.pnpmCommand },
      signal: signal === void 0 ? this.abort.signal : AbortSignal.any([this.abort.signal, signal]),
      outputBytes: this.outputBytes,
      activateNewBundles: false,
      onOutput: (text, stream) => {
        this.ownerContext.emit("plugin-manager/install-log", { ...identity, jobId, argv, cwd, stream, text });
      }
    });
    this.packageOperations.add(task);
    try {
      const result = await task;
      this.ownerContext.emit("plugin-manager/install-log", {
        ...identity,
        jobId,
        argv,
        cwd,
        stream: "stdout",
        text: "",
        exitCode: signal?.aborted === true ? null : result.exitCode
      });
      return result.exitCode === 0 ? result : { ...result, kind: classifyInstallFailure({ log: result.output }) };
    } catch (error) {
      this.ownerContext.emit("plugin-manager/install-log", { ...identity, jobId, argv, cwd, stream: "stderr", text: messageOf(error), exitCode: null });
      throw error;
    } finally {
      this.packageOperations.delete(task);
    }
  }
  /** The profile files an installation may rewrite, as they are now; absent files read as undefined. */
  async readRestoredFiles() {
    const files = /* @__PURE__ */ new Map();
    for (const name of RESTORED_FILES) {
      const path = join3(this.profile.dir, name);
      files.set(path, existsSync(path) ? await readFile3(path, "utf8") : void 0);
    }
    return files;
  }
  /** Put the profile files back; pnpm has exited by the time this runs. */
  async restoreFiles(files) {
    for (const [path, content] of files) {
      if (content === void 0) await rm(path, { force: true });
      else await writeFileAtomic4(path, content, { mode: 384 });
    }
  }
  async selectBundle(name, enabled) {
    const manifest = readProfileManifest2("dsh", this.profile.dir);
    const previous = manifest.dsh?.profile?.bundles ?? [];
    if ((enabled || !previous.includes(name)) && bundleManifest(name, this.profile.dir, this.profile.installAnchor) === void 0) {
      throw new ManagementFailure("not-bundle");
    }
    if (!enabled && previous.includes(name)) {
      if (this.protectsManager(name)) throw new ManagementFailure("management-required");
    }
    const bundles = enabled ? [...previous, ...previous.includes(name) ? [] : [name]] : previous.filter((item) => item !== name);
    if (JSON.stringify(previous) === JSON.stringify(bundles)) return;
    manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles } };
    await saveManifest(this.profile.dir, manifest);
  }
  bundleRows(name) {
    const info = bundleManifest(name, this.profile.dir, this.profile.installAnchor);
    if (info?.dsh?.bundle === void 0) return [];
    const dir = resolveBundleDir2("dsh", name, this.profile.installAnchor, this.profile.dir);
    return flatten(composeEntries([loadOverlayPatches2("dsh", join3(dir, info.dsh.bundle.patch))]));
  }
  protectsManager(name) {
    return this.isProtected(name) || this.bundleRows(name).some((row) => this.isProtected(row.name, row.id) || `include:${row.id}` === this.ownerEntryId);
  }
  isProtected(name, entryId) {
    return protectedModules.has(name) || this.ownerContext.get("pluginManagementPolicy")?.isProtected(name, entryId) === true;
  }
  configure(operation) {
    const hmr = this.ownerContext.get("hmr");
    const apply = () => {
      this.abort.signal.throwIfAborted();
      return operation();
    };
    return hmr === void 0 ? apply() : hmr.runExclusive(apply);
  }
  async reload(requiredIds = []) {
    if (this.ownerContext.get("hmr") === void 0) return [];
    return reconcileProfilePatches(this.ownerContext.root, readProfilePatches("dsh", this.profile), "dsh", requiredIds);
  }
  async change(operation, request, reason) {
    return withFileLock2(join3(this.profile.dir, "package.json"), async () => {
      this.abort.signal.throwIfAborted();
      const before = this.diskState();
      const result = {
        ...request,
        changed: false,
        application: this.ownerContext.get("hmr") !== void 0 ? "applied" : "restart-required"
      };
      let release;
      try {
        release = this.ownerContext.get("pluginManagementPolicy")?.enter();
        result.application = await operation(result) ?? result.application;
      } catch (error) {
        if (error instanceof InstallCancelledError) {
          result.application = "cancelled";
        } else {
          result.application = "failed";
          result.error = managementError(error);
        }
      } finally {
        release?.();
      }
      result.changed = before !== this.diskState();
      this.ownerContext.emit("plugin-manager/changed", { reason });
      return result;
    }, { waitMs: this.lockWaitMs });
  }
  diskState() {
    return ["package.json", "cordis.patch.yml", "pnpm-workspace.yaml"].map((file) => {
      try {
        return readFileSync(join3(this.profile.dir, file), "utf8");
      } catch (error) {
        if (error.code === "ENOENT") return "";
        throw error;
      }
    }).join("\0");
  }
};
_init = __decoratorStart(_a);
__decorateElement(_init, 1, "listPlugins", _listPlugins_dec, PluginManager);
__decorateElement(_init, 1, "listBundles", _listBundles_dec, PluginManager);
__decorateElement(_init, 1, "inspect", _inspect_dec, PluginManager);
__decorateElement(_init, 1, "setPluginEnabled", _setPluginEnabled_dec, PluginManager);
__decorateElement(_init, 1, "setBundleEnabled", _setBundleEnabled_dec, PluginManager);
__decorateElement(_init, 1, "installBundle", _installBundle_dec, PluginManager);
__decorateElement(_init, 1, "cancelInstall", _cancelInstall_dec, PluginManager);
__decorateElement(_init, 1, "removeBundle", _removeBundle_dec, PluginManager);
__decoratorMetadata(_init, PluginManager);
__publicField(PluginManager, "inject", ["loader", "profileContext"]);
__publicField(PluginManager, "Config", z.object({
  pnpmCommand: z.string().default("pnpm"),
  outputBytes: z.number().step(1).min(1).default(16384),
  lockWaitMs: z.number().step(1).min(0).default(12e4),
  inspectTimeoutMs: z.number().step(1).min(1e3).default(2e4)
}));
var index_default = PluginManager;
export {
  InvalidInstallSpecError,
  PluginManager,
  classifyInstallFailure,
  index_default as default,
  parseInstallSpec
};
