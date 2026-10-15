// sep-origin/alpha2-desktop/apps/desktop/src/command-manager-entry.ts
import { spawn } from "node:child_process";
import { dirname as dirname2, join as join2, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// sep-origin/alpha2-desktop/apps/desktop/src/command-installation.ts
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, link, lstat, mkdir, readFile, readlink, rename, stat, symlink, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
var CommandInstallationError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
  code;
};
function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function receiptPath(options) {
  return join(dirname(options.destination), ".dsh-desktop-command.json");
}
async function readEntry(path) {
  let info;
  try {
    info = await lstat(path, { bigint: true });
  } catch (error) {
    if (error.code === "ENOENT") return { kind: "missing", fingerprint: digest("missing") };
    throw error;
  }
  const fields = [info.dev, info.ino, info.mode, info.uid, info.gid, info.size, info.mtimeNs].map(String);
  if (info.isSymbolicLink()) {
    const target = await readlink(path);
    return { kind: "symlink", fingerprint: digest({ kind: "symlink", fields, target }), target };
  }
  const kind = info.isFile() ? "file" : "unsupported";
  return { kind, fingerprint: digest({ kind, fields }) };
}
async function readReceipt(options) {
  const path = receiptPath(options);
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw error;
  }
  if (!info.isFile() || info.size > 8192) throw new CommandInstallationError("EOWNERSHIP", "Invalid command ownership record.");
  let value;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new CommandInstallationError("EOWNERSHIP", "Invalid command ownership record.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CommandInstallationError("EOWNERSHIP", "Invalid command ownership record.");
  }
  const record = value;
  if (record.schemaVersion !== 1 || typeof record.launcher !== "string" || !isAbsolute(record.launcher) || typeof record.installedFingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(record.installedFingerprint)) {
    throw new CommandInstallationError("EOWNERSHIP", "Invalid command ownership record.");
  }
  let backup;
  if (record.backup !== void 0) {
    if (typeof record.backup !== "object" || record.backup === null) throw new CommandInstallationError("EOWNERSHIP", "Invalid command backup record.");
    const candidate = record.backup;
    if (typeof candidate.name !== "string" || !/^\.dsh-command-backup-[a-f0-9-]{36}$/u.test(candidate.name) || typeof candidate.fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(candidate.fingerprint)) {
      throw new CommandInstallationError("EOWNERSHIP", "Invalid command backup record.");
    }
    backup = { name: candidate.name, fingerprint: candidate.fingerprint };
  }
  return {
    schemaVersion: 1,
    launcher: record.launcher,
    installedFingerprint: record.installedFingerprint,
    ...backup === void 0 ? {} : { backup }
  };
}
async function available(path) {
  try {
    await access(path, constants.X_OK);
    return (await stat(path)).isFile();
  } catch (error) {
    if (["ENOENT", "EACCES"].includes(error.code ?? "")) return false;
    throw error;
  }
}
async function readSnapshot(options) {
  const entry = await readEntry(options.destination);
  const receipt = await readReceipt(options);
  const state = {
    fingerprint: digest({ entry: entry.fingerprint, receipt }),
    destination: options.destination,
    launcher: options.launcher,
    kind: entry.kind,
    managed: receipt !== void 0 && entry.kind === "symlink" && entry.target === receipt.launcher && entry.fingerprint === receipt.installedFingerprint,
    available: await available(options.destination),
    ...entry.kind === "symlink" ? { target: entry.target } : {},
    ...receipt?.backup === void 0 ? {} : { backup: join(dirname(options.destination), receipt.backup.name) }
  };
  return { entry, receipt, state };
}
async function inspectFileCommand(options) {
  return (await readSnapshot(options)).state;
}
async function restoreEntry(options, source, destination, expected2) {
  const entry = await readEntry(source);
  if (expected2 !== void 0 && entry.fingerprint !== expected2) throw new CommandInstallationError("EOWNERSHIP", "Command backup changed.");
  if (entry.kind !== "symlink" && entry.kind !== "file") throw new CommandInstallationError("EOWNERSHIP", "Command backup is unavailable.");
  if (expected2 !== void 0) {
    const claimed = await withdraw(options, source, entry);
    if (claimed === void 0) throw new CommandInstallationError("EOWNERSHIP", "Command backup is unavailable.");
    try {
      await restoreEntry(options, claimed, destination);
    } catch (error) {
      try {
        await restoreEntry(options, claimed, source);
      } catch (restoreError) {
        throw new AggregateError([error, restoreError], "The command backup is preserved at " + claimed);
      }
      throw error;
    }
    return;
  }
  await linkEntry(options, source, destination);
  if ((await readEntry(destination)).fingerprint !== entry.fingerprint) throw new CommandInstallationError("EOWNERSHIP", "Command backup changed during restoration.");
  await unlink(source);
}
async function linkEntry(options, source, destination) {
  if (process.platform === "darwin") await promisify(execFile)(options.linkHelper, [source, destination]);
  else await link(source, destination);
}
async function withdraw(options, destination, expected2) {
  if (expected2.kind === "missing") return void 0;
  if (expected2.kind === "unsupported") throw new CommandInstallationError("EUNSUPPORTED", "The command path is not a file or symbolic link.");
  const path = join(dirname(destination), ".dsh-command-backup-" + randomUUID());
  await rename(destination, path);
  if ((await readEntry(path)).fingerprint !== expected2.fingerprint) {
    try {
      await restoreEntry(options, path, destination);
    } catch (error) {
      throw new AggregateError([error], "The command changed; its entry is preserved at " + path);
    }
    throw new CommandInstallationError("ESTALE", "The command changed after confirmation.");
  }
  return path;
}
async function installFileCommand(options, expected2) {
  await mkdir(dirname(options.destination), { recursive: true });
  return withFileLock(receiptPath(options), async () => {
    const { state, entry, receipt } = await readSnapshot(options);
    if (state.fingerprint !== expected2) throw new CommandInstallationError("ESTALE", "The command changed after confirmation.");
    if (!await available(options.launcher)) throw new CommandInstallationError("ENOENT", "The installed launcher is unavailable.");
    const moved = await withdraw(options, options.destination, entry);
    const pending = join(dirname(options.destination), ".dsh-command-new-" + randomUUID());
    let created;
    try {
      await symlink(options.launcher, pending);
      created = await readEntry(pending);
      await linkEntry(options, pending, options.destination);
      const backup = state.managed || moved === void 0 ? receipt?.backup : { name: basename(moved), fingerprint: entry.fingerprint };
      const next = {
        schemaVersion: 1,
        launcher: options.launcher,
        installedFingerprint: created.fingerprint,
        ...backup === void 0 ? {} : { backup }
      };
      await writeFileAtomic(receiptPath(options), JSON.stringify(next) + "\n", { mode: 420 });
    } catch (error) {
      if (created !== void 0 && (await readEntry(options.destination)).fingerprint === created.fingerprint) {
        const rollback = await withdraw(options, options.destination, created);
        if (rollback !== void 0) await unlink(rollback);
      }
      if (moved !== void 0) {
        try {
          await restoreEntry(options, moved, options.destination, entry.fingerprint);
        } catch (restoreError) {
          throw new AggregateError([error, restoreError], "The previous command is preserved at " + moved);
        }
      }
      throw error;
    } finally {
      try {
        await unlink(pending);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    if (state.managed && moved !== void 0) await unlink(moved);
    const result = await inspectFileCommand(options);
    const previousBackup = receipt?.backup === void 0 ? void 0 : join(dirname(options.destination), receipt.backup.name);
    return previousBackup !== void 0 && !state.managed && moved !== void 0 && (await readEntry(previousBackup)).kind !== "missing" ? { ...result, preservedBackup: previousBackup } : result;
  }, { waitMs: 5e3 });
}
async function removeFileCommand(options, expected2) {
  return withFileLock(receiptPath(options), async () => {
    const { state, entry, receipt } = await readSnapshot(options);
    if (state.fingerprint !== expected2) throw new CommandInstallationError("ESTALE", "The command changed after confirmation.");
    if (receipt === void 0) return state;
    const backup = receipt.backup === void 0 ? void 0 : join(dirname(options.destination), receipt.backup.name);
    if (state.managed && backup !== void 0 && receipt.backup !== void 0 && (await readEntry(backup)).fingerprint !== receipt.backup.fingerprint) {
      throw new CommandInstallationError("EOWNERSHIP", "The previous command backup changed or is missing.");
    }
    if (state.managed) {
      const removed = await withdraw(options, options.destination, entry);
      try {
        if (backup !== void 0) await restoreEntry(options, backup, options.destination, receipt.backup?.fingerprint);
        await unlink(receiptPath(options));
      } catch (error) {
        if (removed !== void 0) {
          try {
            if ((await readEntry(options.destination)).kind === "missing") await restoreEntry(options, removed, options.destination, entry.fingerprint);
            else await unlink(removed);
          } catch (restoreError) {
            throw new AggregateError([error, restoreError], "The Desktop command link is preserved at " + removed);
          }
        }
        throw error;
      }
      if (removed !== void 0) await unlink(removed);
    } else {
      await unlink(receiptPath(options));
    }
    const result = await inspectFileCommand(options);
    return !state.managed && backup !== void 0 && (await readEntry(backup)).kind !== "missing" ? { ...result, preservedBackup: backup } : result;
  }, { waitMs: 5e3 });
}

// sep-origin/alpha2-desktop/apps/desktop/src/command-manager-entry.ts
var [operation, expected] = process.argv.slice(2);
var fingerprint = expected ?? "";
var resources = resolve(dirname2(fileURLToPath(import.meta.url)), "../..");
if (process.platform === "darwin") process.umask(18);
try {
  if (!["inspect", "install", "remove"].includes(operation ?? "")) throw new CommandInstallationError("EINVAL", "Invalid command-management operation.");
  if (operation !== "inspect" && !/^[a-f0-9]{64}$/u.test(fingerprint)) throw new CommandInstallationError("EINVAL", "Missing command confirmation.");
  if (process.platform === "darwin") {
    const options = {
      destination: "/usr/local/bin/dsh",
      launcher: join2(resources, "runtime", "cli", "bin", "dsh"),
      linkHelper: join2(resources, "runtime", "cli", "link-entry")
    };
    const state = operation === "inspect" ? await inspectFileCommand(options) : operation === "install" ? await installFileCommand(options, fingerprint) : await removeFileCommand(options, fingerprint);
    process.stdout.write(JSON.stringify({ ok: true, state }) + "\n");
  } else if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (systemRoot === void 0) throw new CommandInstallationError("ENOENT", "Windows system directory is unavailable.");
    const child = spawn(
      join2(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", join2(resources, "runtime", "cli", "command-path.ps1")],
      { stdio: ["pipe", "pipe", "inherit"], windowsHide: true }
    );
    child.stdout.pipe(process.stdout);
    const exited = new Promise((accept, reject) => {
      child.once("error", reject);
      child.once("close", accept);
    });
    child.stdin.end(JSON.stringify({ operation, expected, directory: join2(resources, "runtime", "cli", "bin") }));
    process.exitCode = await exited ?? 1;
  } else {
    throw new CommandInstallationError("EUNSUPPORTED", "Command installation is supported on macOS and Windows.");
  }
} catch (error) {
  process.stdout.write(JSON.stringify({
    ok: false,
    code: error instanceof CommandInstallationError ? error.code : error.code ?? "EIO",
    message: error instanceof Error ? error.message : "Command management failed."
  }) + "\n");
}
