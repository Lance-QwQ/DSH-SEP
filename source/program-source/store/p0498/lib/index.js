var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name3 in all)
    __defProp(target, name3, { get: all[name3], enumerable: true });
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop-host/src/index.ts
import { delimiter, join as join3 } from "node:path";
import { readFile as readFile2 } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadLayeredEnv, loadProfileDirectory } from "@deepseek-ai/dsh-app-boot";
import { runProfile } from "@deepseek-ai/dsh/profile-boot";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop-host/src/office.ts
var office_exports = {};
__export(office_exports, {
  apply: () => apply2,
  name: () => name2
});
import { dirname as dirname2, join as join2 } from "node:path";
import * as officeSkills from "@deepseek-ai/dsh-skill-office";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop-host/src/workspace-dependencies.ts
var workspace_dependencies_exports = {};
__export(workspace_dependencies_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
import { defineTool } from "@deepseek-ai/dsh-tools";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop-host/src/primary-runtime.ts
import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
async function readPrimaryRuntime(root) {
  const value = JSON.parse(await readFile(join(root, "runtime.json"), "utf8"));
  if (typeof value !== "object" || value === null) throw new Error("primary runtime: invalid metadata");
  const record = value;
  const components = record.components;
  const packages = record.pythonPackages;
  if (typeof record.desktopVersion !== "string" || record.desktopVersion.length === 0 || !["win32", "darwin"].includes(String(record.platform)) || !["x64", "arm64"].includes(String(record.arch)) || typeof components !== "object" || components === null || !["python", "node", "pnpm", "numpy", "pandas"].every((key) => /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u.test(String(components[key]))) || record.payloadDigest !== void 0 && (typeof record.payloadDigest !== "string" || !/^[a-f0-9]{64}$/u.test(record.payloadDigest)) || packages !== void 0 && (typeof packages !== "object" || packages === null || Array.isArray(packages) || !Object.entries(packages).every(([name3, version]) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name3) && typeof version === "string" && /^\d[\w.!+-]*$/u.test(version)))) {
    throw new Error("primary runtime: invalid metadata");
  }
  const manifest = value;
  const entries = Object.entries(manifest.pythonPackages ?? {});
  const distributions = new Map(entries.map(([name3, version]) => [name3.toLowerCase().replace(/[-_.]+/gu, "-"), version]));
  if (distributions.size !== entries.length) throw new Error("primary runtime: invalid metadata");
  for (const name3 of ["numpy", "pandas"]) {
    const version = distributions.get(name3);
    if (version !== void 0 && version !== manifest.components[name3]) {
      throw new Error(`primary runtime: conflicting ${name3} distribution version`);
    }
  }
  return manifest;
}
function workspaceDependencyPaths(root, manifest) {
  const dependencies = join(root, "dependencies");
  const windows = manifest.platform === "win32";
  return {
    python: join(dependencies, "python", ...windows ? ["python.exe"] : ["bin", "python3"]),
    node: join(dependencies, "node", "bin", windows ? "node.exe" : "node"),
    pnpm: join(dependencies, "pnpm", "bin", "pnpm.mjs"),
    pythonPackages: join(dependencies, "python", ...windows ? ["Lib"] : ["lib", `python${manifest.components.python.split(".").slice(0, 2).join(".")}`], "site-packages"),
    nodePackages: join(dependencies, "node", "node_modules"),
    pythonDistributions: manifest.pythonPackages ?? {}
  };
}
async function exists(path) {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`primary runtime: installation path is a filesystem link: ${path}`);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
async function installPrimaryRuntime(source, root) {
  const manifest = await readPrimaryRuntime(source);
  if (manifest.platform !== process.platform || manifest.arch !== process.arch) throw new Error("primary runtime: incompatible platform or architecture");
  await mkdir(dirname(root), { recursive: true });
  const previous = `${root}.previous`;
  await exists(previous);
  await exists(root);
  if (!await exists(root) && await exists(previous)) await rename(previous, root);
  if (await exists(join(root, "runtime.json")) && JSON.stringify(await readPrimaryRuntime(root)) === JSON.stringify(manifest)) {
    const paths = workspaceDependencyPaths(root, manifest);
    for (const path of [paths.python, paths.node, paths.pnpm, paths.pythonPackages, paths.nodePackages]) await stat(path);
    return paths;
  }
  const staging = await mkdtemp(join(dirname(root), ".primary-runtime-"));
  try {
    await cp(source, staging, { recursive: true, dereference: true });
    const paths = workspaceDependencyPaths(staging, manifest);
    for (const path of [paths.python, paths.node, paths.pnpm, paths.pythonPackages, paths.nodePackages]) await stat(path);
    await rm(previous, { recursive: true, force: true });
    const replacing = await exists(root);
    if (replacing) await rename(root, previous);
    try {
      await rename(staging, root);
    } catch (error) {
      if (replacing) await rename(previous, root);
      throw error;
    }
    await rm(previous, { recursive: true, force: true });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return workspaceDependencyPaths(root, manifest);
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop-host/src/workspace-dependencies.ts
var name = "desktop-workspace-dependencies";
var inject = ["tools"];
function apply(ctx, config) {
  let installation;
  ctx.effect(() => async () => {
    await installation?.catch(() => void 0);
  });
  ctx.tools.register(defineTool({
    name: "load_workspace_dependencies",
    description: "Get absolute paths to bundled Python, Node.js, pnpm, and library directories, plus bundled Python distribution versions. Python includes numpy, pandas, python-docx, python-pptx, openpyxl, Pillow, lxml, and XlsxWriter. Use these libraries for Office files unless the user or workspace instructions select another environment. Run pnpm with the returned Node executable and pnpm script path. This does not change PATH or package-manager settings.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          python: { type: "string", required: true },
          node: { type: "string", required: true },
          pnpm: { type: "string", required: true },
          pythonPackages: { type: "string", required: true },
          nodePackages: { type: "string", required: true },
          pythonDistributions: { type: "object", additionalProperties: true, required: true, description: "Bundled distribution names and versions recorded in runtime.json; excludes user-installed additions." }
        }
      },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value, void 0, 2) }]
    },
    execute: () => {
      installation ??= installPrimaryRuntime(config.source, config.root).catch((error) => {
        installation = void 0;
        throw error;
      });
      return installation;
    },
    presentCall: () => ({ card: "generic", title: "Load workspace dependencies", kind: "read" })
  }));
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop-host/src/office.ts
var name2 = "desktop-office";
async function apply2(ctx, config) {
  await ctx.plugin(workspace_dependencies_exports, config);
  await ctx.plugin(officeSkills, { assetRoot: join2(dirname2(config.source), "office-skills") });
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop-host/src/update-tasks.ts
function installDesktopUpdateTaskControl(ctx) {
  let locked = false;
  let lockGeneration = 0;
  let stopped = false;
  ctx.effect(() => () => {
    stopped = true;
  });
  const pendingRequests = /* @__PURE__ */ new Set();
  ctx.on("connection/request", async (_request, response, next) => {
    if (locked) {
      response.writeHead(503);
      response.end();
      return;
    }
    const finished = Promise.withResolvers();
    pendingRequests.add(finished.promise);
    try {
      await next();
    } finally {
      pendingRequests.delete(finished.promise);
      finished.resolve();
    }
  });
  return async (action) => {
    if (stopped) throw new Error("desktop update: Host is stopping");
    if (action === "unlock") {
      locked = false;
      lockGeneration++;
    }
    const agents = ctx.get("agents");
    const jobs = ctx.get("jobs");
    if (agents === void 0 || jobs === void 0) throw new Error("desktop update: task services are unavailable");
    if (action === "lock") {
      locked = true;
      const generation = ++lockGeneration;
      await Promise.all(pendingRequests);
      if (stopped) throw new Error("desktop update: Host is stopping");
      if (generation !== lockGeneration) throw new Error("desktop update: admission lock was superseded");
    }
    const liveAgents = agents.list();
    return liveAgents.some((agent) => agent.status === "running" || agent.inbox.nextTurn.length > 0 || agent.inbox.nextStep.length > 0) || [void 0, ...liveAgents].some((agent) => jobs.list(agent).some((job) => job.status === "running" || job.status === "stopping"));
  };
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop-host/src/plugin-policy.ts
var protectedPackages = /* @__PURE__ */ new Set([
  "dsh-system-enhancement-package",
  "@deepseek-ai/dsh-recovery",
  "dsh-tool-worker",
  "@deepseek-ai/dsh-task-checkpoint",
  "@deepseek-ai/dsh-client-ui-settings-memory",
  "@deepseek-ai/dsh-sep-session-migration",
  "dsh-sep-plugin-group",
  "dsh-sep-context-preparation",
  "dsh-sep-trusted-evaluation-entry",
  "dsh-sep-brand",
  "@deepseek-ai/dsh-session-log-deepseek",
  "@deepseek-ai/dsh-session-telemetry-otel"
]);
var protectedEntries = /* @__PURE__ */ new Set(["sep-suite", "sep-recovery-host", "sep-continuation", "sep-memory-ui", "sep-checkpoint", "sep-worker", "sep-brand"]);
function installSepPluginPolicy(ctx) {
  let changing = false;
  let closing = false;
  let admitted = 0;
  const assertOpen = () => {
    if (closing) throw new Error("SEP_PLUGIN_HOST_CLOSING");
    if (changing) throw new Error("SEP_PLUGIN_CHANGE_ACTIVE");
  };
  const during = async (next) => {
    assertOpen();
    admitted++;
    try {
      return await next();
    } finally {
      admitted--;
    }
  };
  ctx.on("agent/request", (_payload, next) => during(next));
  ctx.on("tools/execute", (_payload, next) => during(next));
  ctx.effect(() => () => {
    closing = true;
  });
  ctx.provide("pluginManagementPolicy", {
    isProtected: (name3, entryId) => protectedEntries.has(entryId?.replace(/^include:/u, "") ?? "") || [...protectedPackages].some((pkg) => name3 === pkg || name3.startsWith(`${pkg}/`)),
    enter: () => {
      assertOpen();
      const agents = ctx.get("agents");
      const jobs = ctx.get("jobs");
      if (agents === void 0 || jobs === void 0) throw new Error("SEP_PLUGIN_TASK_STATE_UNKNOWN");
      const live = agents.list();
      if (admitted > 0 || live.some((agent) => agent.status === "running" || agent.inbox.nextTurn.length > 0 || agent.inbox.nextStep.length > 0) || [void 0, ...live].some((agent) => jobs.list(agent).some((job) => job.status === "running" || job.status === "stopping"))) {
        throw new Error("SEP_PLUGIN_TASKS_ACTIVE");
      }
      changing = true;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          changing = false;
        }
      };
    }
  });
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/apps/desktop-host/src/index.ts
async function main() {
  const runtimeDir = process.argv[2];
  const projectDir = process.argv[3];
  const installAnchor = join3(runtimeDir, "node_modules", "@deepseek-ai", "dsh", "package.json");
  const nonce = process.env.DSH_SEP_HOST_NONCE;
  const generation = Number(process.env.DSH_SEP_HOST_GENERATION);
  const managed = nonce !== void 0 || process.env.DSH_SEP_HOST_GENERATION !== void 0;
  if (managed && (!/^[a-f0-9]{64}$/u.test(nonce ?? "") || !Number.isSafeInteger(generation) || generation < 1)) {
    throw new Error("SEP_HOST_IDENTITY_INVALID");
  }
  const version = JSON.parse(await readFile2(installAnchor, "utf8")).version;
  if (managed && version !== "0.1.6-alpha.2") throw new Error("SEP_HOST_VERSION_INVALID");
  const profile = loadProfileDirectory("dsh", projectDir, installAnchor);
  const application = runProfile({
    environment: loadLayeredEnv("dsh"),
    profile: "desktop",
    resolutionMode: process.argv[5] === "runtime" ? "runtime" : "link",
    resolvedProfile: { profile, installAnchor },
    patchFiles: managed ? [fileURLToPath(new URL("./sep-policy.json", import.meta.url))] : [],
    args: ["--no-open", "--port", managed ? "0" : "19387"],
    ...process.argv[6] === void 0 ? {} : {
      packageManager: {
        command: process.execPath,
        args: ["--expose-internals", process.argv[6]],
        env: {
          ELECTRON_RUN_AS_NODE: "1",
          DSH_DESKTOP_NODE_EXECUTABLE: process.execPath,
          PATH: `${process.argv[7] ?? ""}${delimiter}${process.env.PATH ?? ""}`
        }
      }
    }
  });
  let stopping;
  const control = {};
  const send = (message) => new Promise((resolve, reject) => {
    if (!process.connected || process.send === void 0) {
      resolve();
      return;
    }
    process.send(message, (error) => {
      if (error === null) resolve();
      else reject(error);
    });
  });
  const stop = () => stopping ??= (async () => {
    const running = await application.catch(() => void 0);
    await running?.shutdown.shutdown(0);
    await send({ type: "shutdown-complete" });
    if (process.connected) process.disconnect();
  })();
  process.on("message", (message) => {
    if (typeof message !== "object" || message === null || !("type" in message)) return;
    if (message.type === "shutdown") {
      void stop();
      return;
    }
    if (message.type !== "update-tasks" || !("requestId" in message) || !Number.isSafeInteger(message.requestId) || !("action" in message) || !["inspect", "lock", "unlock"].includes(String(message.action))) return;
    void (async () => {
      try {
        if (stopping !== void 0 || control.updateTasks === void 0) throw new Error("desktop update: Host is unavailable");
        const active = await control.updateTasks(message.action);
        await send({ type: "update-tasks", requestId: message.requestId, active });
      } catch (error) {
        await send({
          type: "update-tasks",
          requestId: message.requestId,
          active: true,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    })().catch((error) => {
      console.error(error);
    });
  });
  process.once("disconnect", () => {
    void stop();
  });
  const { ctx } = await application;
  if (managed) ctx.provide("sepDesktopTransport", { kind: "sep-owned-http", generation });
  if (managed) installSepPluginPolicy(ctx);
  control.updateTasks = installDesktopUpdateTaskControl(ctx);
  await ctx.plugin(office_exports, {
    source: process.argv[4] ?? join3(runtimeDir, "..", "runtime", "primary-runtime"),
    root: join3(resolveDshHome(), "dsh-runtimes", "dsh-primary-runtime")
  });
  const url = ctx.connection.authenticatedUrl(`http://127.0.0.1:${String(ctx.webServer.port)}`);
  if (process.connected) process.send?.({
    type: "ready",
    url,
    injections: ctx.webServer.collectIndexInjections(),
    ...managed ? { transport: "desktop-http", nonce, generation, pid: process.pid, dshVersion: version } : {}
  }, (error) => {
    if (error !== null) console.error(error);
  });
}
if (import.meta.main) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (process.connected) process.send?.({ type: "fatal", message }, (error2) => {
      if (error2 !== null) console.error(error2);
    });
    console.error(error);
    process.exitCode = 1;
    if (process.connected) process.disconnect();
  });
}
//# sourceMappingURL=index.js.map
