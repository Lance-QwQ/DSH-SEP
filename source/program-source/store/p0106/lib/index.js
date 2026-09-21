// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/fs-local/src/index.ts
import { constants as bufferConstants } from "node:buffer";
import { isAbsolute as isAbsolute4, relative as relative2, resolve as resolve4, sep as sep3 } from "node:path";
import { pathToFileURL } from "node:url";
import z from "@deepseek-ai/schemastery";
import { FileSystem, FsError as FsError4, FsVersion as FsVersion2 } from "@deepseek-ai/dsh-fs";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/fs-local/src/fsio.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { createReadStream, realpath as realpathCallback } from "node:fs";
import { chmod, link, lstat as lstat2, mkdir as mkdir2, open, readFile, readdir, rename, rm, rmdir, stat, unlink } from "node:fs/promises";
import { basename, dirname as dirname2, isAbsolute as isAbsolute2, join as join2, resolve as resolve2, sep } from "node:path";
import { TextDecoder, promisify } from "node:util";
import { FsError as FsError2, FsTargetKey, FsVersion } from "@deepseek-ai/dsh-fs";

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/fs-local/src/win32.ts
import { toNamespacedPath } from "node:path";
var DACL_SECURITY_INFORMATION = 4;
var PROTECTED_DACL_SECURITY_INFORMATION = 2147483648;
var ERROR_FILE_NOT_FOUND = 2;
var ERROR_PATH_NOT_FOUND = 3;
var ERROR_ACCESS_DENIED = 5;
var bindings;
async function win32() {
  if (bindings !== void 0) return bindings;
  const koffi = (await import("koffi")).default;
  const advapi32 = koffi.load("advapi32.dll");
  const kernel32 = koffi.load("kernel32.dll");
  bindings = {
    getFileSecurityW: advapi32.func("int __stdcall GetFileSecurityW(const char16_t *path, uint32_t requested, void *descriptor, uint32_t length, _Out_ uint32_t *needed)"),
    setFileSecurityW: advapi32.func("int __stdcall SetFileSecurityW(const char16_t *path, uint32_t information, const void *descriptor)"),
    replaceFileW: kernel32.func("int __stdcall ReplaceFileW(const char16_t *replaced, const char16_t *replacement, const char16_t *backup, uint32_t flags, void *exclude, void *reserved)"),
    getLastError: kernel32.func("uint32_t __stdcall GetLastError()")
  };
  return bindings;
}
function errnoCode(win32Code) {
  switch (win32Code) {
    case ERROR_FILE_NOT_FOUND:
    case ERROR_PATH_NOT_FOUND:
      return "ENOENT";
    case ERROR_ACCESS_DENIED:
      return "EACCES";
    default:
      return "EIO";
  }
}
function win32Error(syscall, win32Code, path) {
  const code = errnoCode(win32Code);
  const error = new Error(`${syscall} ${code} (Win32 ${win32Code}): ${path}`);
  error.code = code;
  error.errno = win32Code;
  error.syscall = syscall;
  error.path = path;
  error.win32Code = win32Code;
  return error;
}
async function readFileDaclWin32(path) {
  const api2 = await win32();
  const nativePath = toNamespacedPath(path);
  const needed = [0];
  api2.getFileSecurityW(nativePath, DACL_SECURITY_INFORMATION, null, 0, needed);
  if (needed[0] === 0) throw win32Error("GetFileSecurityW", api2.getLastError(), path);
  const descriptor = Buffer.alloc(needed[0]);
  if (api2.getFileSecurityW(nativePath, DACL_SECURITY_INFORMATION, descriptor, descriptor.length, needed) === 0) {
    throw win32Error("GetFileSecurityW", api2.getLastError(), path);
  }
  return descriptor.subarray(0, needed[0]);
}
async function copyFileDaclWin32(source, destination) {
  const descriptor = await readFileDaclWin32(source);
  const api2 = await win32();
  const information = (DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION) >>> 0;
  if (api2.setFileSecurityW(toNamespacedPath(destination), information, descriptor) === 0) {
    throw win32Error("SetFileSecurityW", api2.getLastError(), destination);
  }
}
async function replaceFileWin32(replaced, replacement) {
  const api2 = await win32();
  if (api2.replaceFileW(
    toNamespacedPath(replaced),
    toNamespacedPath(replacement),
    null,
    0,
    null,
    null
  ) === 0) {
    throw win32Error("ReplaceFileW", api2.getLastError(), replaced);
  }
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/fs-local/src/protected-win32.ts
import { dirname, isAbsolute, join, parse, resolve, toNamespacedPath as toNamespacedPath2 } from "node:path";
import { randomUUID } from "node:crypto";
import { lstat, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { FsError } from "@deepseek-ai/dsh-fs";
var apiPromise;
async function api() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new FsError("protected file mutations require the verified Windows x64 NTFS backend", "FS_PROTECTION_UNAVAILABLE");
  }
  return apiPromise ??= (async () => {
    const koffi = (await import("koffi")).default;
    const library = koffi.load("kernel32.dll");
    return {
      create: library.func("void * __stdcall CreateFileW(const char16_t *, uint32_t, uint32_t, void *, uint32_t, uint32_t, void *)"),
      info: library.func("int __stdcall GetFileInformationByHandle(void *, void *)"),
      streams: library.func("int __stdcall GetFileInformationByHandleEx(void *, int, void *, uint32_t)"),
      volume: library.func("int __stdcall GetVolumeInformationByHandleW(void *, void *, uint32_t, void *, void *, void *, void *, uint32_t)"),
      rename: library.func("int __stdcall SetFileInformationByHandle(void *, int, void *, uint32_t)"),
      times: library.func("int __stdcall SetFileTime(void *, void *, void *, void *)"),
      close: library.func("int __stdcall CloseHandle(void *)"),
      error: library.func("uint32_t __stdcall GetLastError()")
    };
  })();
}
function failed(handle) {
  return !handle || handle === -1n || handle === 0xffffffffffffffffn;
}
function failure(operation, code) {
  return new FsError(`${operation} failed (Win32 ${code}); file protection did not widen access`, "FS_UNSAFE_TARGET");
}
var ProtectedFileHandle = class _ProtectedFileHandle {
  constructor(native, handle) {
    this.native = native;
    this.handle = handle;
  }
  native;
  handle;
  /** Open an existing ordinary single-link NTFS file.
   * @param path - absolute local path with held ancestors.
   * @returns owned file handle, or undefined for absence.
   */
  static async open(path) {
    const native = await api();
    const handle = native.create(toNamespacedPath2(path), 2147549440, 1, null, 3, 35651584, null);
    if (failed(handle)) {
      const code = native.error();
      if (code === 2 || code === 3) return void 0;
      throw failure("open protected target", code);
    }
    const owned = new _ProtectedFileHandle(native, handle);
    try {
      const info = Buffer.alloc(52);
      if (!native.info(handle, info)) throw failure("inspect protected target", native.error());
      if ((info.readUInt32LE(0) & 16) !== 0) throw new FsError("mutation target is not a regular file", "FS_NOT_REGULAR_FILE");
      if ((info.readUInt32LE(0) & (1024 | 16 | 16384 | 512 | 2048 | 4096)) !== 0 || info.readUInt32LE(40) !== 1) {
        throw new FsError("protected mutations require an ordinary single-link file without reparse, encrypted, compressed or sparse data", "FS_UNSAFE_TARGET");
      }
      const filesystem = Buffer.alloc(64);
      if (!native.volume(handle, null, 0, null, null, null, filesystem, 32) || filesystem.toString("utf16le").replace(/\0.*$/s, "") !== "NTFS") {
        throw new FsError("protected mutations require a local NTFS volume", "FS_UNSAFE_TARGET");
      }
      const streams = Buffer.alloc(65536);
      if (!native.streams(handle, 7, streams, streams.length)) throw failure("inspect file streams", native.error());
      const nameLength = streams.readUInt32LE(4);
      if (streams.readUInt32LE(0) !== 0 || streams.toString("utf16le", 24, 24 + nameLength) !== "::$DATA") {
        throw new FsError("protected mutations do not support alternate data streams", "FS_UNSAFE_TARGET");
      }
      return owned;
    } catch (error) {
      owned.close();
      throw error;
    }
  }
  /** Move the held object to a non-existing name; never resolves the old path again.
   * @param destination - absent same-volume destination with held ancestors.
   */
  rename(destination) {
    const info = Buffer.alloc(52);
    if (!this.native.info(this.handle, info)) throw failure("reinspect held target", this.native.error());
    if (info.readUInt32LE(40) !== 1) throw new FsError("a hard link appeared during the protected mutation", "FS_UNSAFE_TARGET");
    const name = Buffer.from(toNamespacedPath2(resolve(destination)), "utf16le");
    const data = Buffer.alloc(24 + name.length);
    data.writeUInt32LE(name.length, 16);
    name.copy(data, 20);
    if (!this.native.rename(this.handle, 3, data, data.length)) throw failure("rename held target without replacement", this.native.error());
  }
  /** Restore captured times through the owned handle without reopening a raced path.
   * @param accessMs - captured last-access milliseconds since Unix epoch.
   * @param writeMs - captured last-write milliseconds since Unix epoch.
   */
  setTimes(accessMs, writeMs) {
    const fileTime = (milliseconds) => {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(BigInt(Math.round(milliseconds * 1e4)) + 116444736000000000n);
      return buffer;
    };
    if (!this.native.times(this.handle, null, fileTime(accessMs), fileTime(writeMs))) throw failure("restore file times", this.native.error());
  }
  /** Release exactly this owned handle. */
  close() {
    if (this.handle === 0n) return;
    const held = this.handle;
    this.handle = 0n;
    if (!this.native.close(held)) throw failure("close protected target", this.native.error());
  }
};
async function lockDirectories(paths, createParents) {
  const native = await api();
  const held = [];
  const seen = /* @__PURE__ */ new Set();
  const downgrade = (index, path) => {
    const replacement = native.create(toNamespacedPath2(path), 128, 1, null, 3, 35651584, null);
    if (failed(replacement)) throw failure("retain stable ancestor identity", native.error());
    const previous = held[index];
    if (previous === void 0) throw new FsError("protected directory ownership is missing", "FS_UNSAFE_TARGET");
    held[index] = replacement;
    if (!native.close(previous)) throw failure("release exclusive ancestor inspection", native.error());
  };
  const release = () => {
    const errors = [];
    for (const handle of held.splice(0).reverse()) {
      if (!native.close(handle)) errors.push(failure("close protected ancestor", native.error()));
    }
    if (errors.length > 0) throw new AggregateError(errors, "protected ancestor handles could not all be released");
  };
  try {
    for (const path of paths) {
      if (!isAbsolute(path) || path.startsWith("\\\\") || path.includes(":", 2)) {
        throw new FsError("protected paths must be local absolute drive paths without streams", "FS_UNSAFE_TARGET");
      }
      const chain = [];
      let directory = dirname(path);
      while (true) {
        chain.unshift(directory);
        const parent = dirname(directory);
        if (parent === directory) break;
        directory = parent;
      }
      let prior;
      for (const item of chain) {
        const key = item.toLowerCase();
        if (seen.has(key)) continue;
        let handle = native.create(toNamespacedPath2(item), 2147483648, 1, null, 3, 35651584, null);
        if (failed(handle)) {
          const code = native.error();
          if (!createParents || code !== 2 && code !== 3 || item === parse(item).root) throw failure(`lock ancestor ${item}`, code);
          await mkdir(item).catch((error) => {
            if (error.code !== "EEXIST") throw error;
          });
          handle = native.create(toNamespacedPath2(item), 2147483648, 1, null, 3, 35651584, null);
          if (failed(handle)) throw failure("lock created ancestor", native.error());
        }
        held.push(handle);
        const info = Buffer.alloc(52);
        if (!native.info(handle, info)) throw failure("inspect ancestor", native.error());
        if ((info.readUInt32LE(0) & 1024) !== 0 || (info.readUInt32LE(0) & 16) === 0) {
          throw new FsError("protected mutations refuse reparse-point ancestors", "FS_UNSAFE_TARGET");
        }
        if (prior !== void 0) downgrade(prior.index, prior.path);
        prior = { index: held.length - 1, path: item };
        seen.add(key);
      }
      if (prior !== void 0) {
        const marker = join(prior.path, `.dsh-protect-${randomUUID()}.lock`);
        const guard = native.create(toNamespacedPath2(marker), 2147549184, 1, null, 1, 69206144, null);
        if (failed(guard)) throw failure("pin protected directory contents", native.error());
        held.push(guard);
        downgrade(prior.index, prior.path);
      }
    }
    return release;
  } catch (error) {
    release();
    throw error;
  }
}
function isDirectoryGuard(name) {
  return /^\.dsh-protect-[0-9a-f-]{36}\.lock$/.test(name);
}
async function lockRecoveryFile(path) {
  const native = await api();
  const handle = native.create(toNamespacedPath2(path), 3221225472, 1, null, 4, 2097280, null);
  if (failed(handle)) throw failure("lock recovery directory", native.error());
  try {
    const info = Buffer.alloc(52);
    if (!native.info(handle, info)) throw failure("inspect directory lock", native.error());
    if ((info.readUInt32LE(0) & (1024 | 16 | 16384 | 512 | 2048 | 4096)) !== 0 || info.readUInt32LE(40) !== 1 || info.readUInt32LE(32) !== 0 || info.readUInt32LE(36) !== 0) {
      throw new FsError("directory lock must be an empty ordinary single-link file", "FS_UNSAFE_TARGET");
    }
    const streams = Buffer.alloc(65536);
    if (!native.streams(handle, 7, streams, streams.length)) throw failure("inspect directory lock streams", native.error());
    if (streams.readUInt32LE(0) !== 0 || streams.toString("utf16le", 24, 24 + streams.readUInt32LE(4)) !== "::$DATA") {
      throw new FsError("directory lock must not contain alternate streams", "FS_UNSAFE_TARGET");
    }
  } catch (error) {
    if (!native.close(handle)) throw new AggregateError([error, failure("close rejected directory lock", native.error())], "directory lock validation and cleanup failed");
    throw error;
  }
  return () => {
    if (!native.close(handle)) throw failure("close recovery lock", native.error());
  };
}
async function withProtectedDirectory(root, operation) {
  const native = await api();
  if (typeof root !== "string" || !root.trim() || !isAbsolute(root) || root.startsWith("\\\\") || root.startsWith("//") || root.includes(":", 2) || resolve(root).toLowerCase() === parse(resolve(root)).root.toLowerCase() || resolve(root).toLowerCase() === resolve(homedir()).toLowerCase()) {
    throw new FsError("directory lease requires a dedicated local absolute root", "FS_UNSAFE_TARGET");
  }
  const rootHandle = native.create(toNamespacedPath2(root), 128, 7, null, 3, 35651584, null);
  if (failed(rootHandle)) throw failure("inspect directory lease root", native.error());
  try {
    const info = Buffer.alloc(52);
    if (!native.info(rootHandle, info)) throw failure("inspect directory lease root", native.error());
    if ((info.readUInt32LE(0) & 16) === 0 || (info.readUInt32LE(0) & 1024) !== 0) {
      throw new FsError("directory lease requires an ordinary directory", "FS_UNSAFE_TARGET");
    }
    const filesystem = Buffer.alloc(64);
    if (!native.volume(rootHandle, null, 0, null, null, null, filesystem, 32) || filesystem.toString("utf16le").replace(/\0.*$/s, "") !== "NTFS") {
      throw new FsError("directory lease requires local NTFS storage", "FS_UNSAFE_TARGET");
    }
  } finally {
    if (!native.close(rootHandle)) throw failure("close directory preflight", native.error());
  }
  const path = join(root, ".dsh-directory.lock");
  const releaseDirectories = await lockDirectories([path], false);
  let releaseLock;
  let originalError;
  let rejected = false;
  try {
    releaseLock = await lockRecoveryFile(path);
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size !== 0) {
      throw new FsError("reserved directory lock must be an empty single-link regular file", "FS_UNSAFE_TARGET");
    }
    return await operation();
  } catch (error) {
    originalError = error;
    rejected = true;
    throw error;
  } finally {
    const errors = [];
    try {
      releaseLock?.();
    } catch (error) {
      errors.push(error);
    }
    try {
      releaseDirectories();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length > 0) throw new AggregateError(rejected ? [originalError, ...errors] : errors, "directory lease cleanup failed");
  }
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/fs-local/src/fsio.ts
var BINARY_SAMPLE_BYTES = 8192;
var realpath = promisify(realpathCallback.native);
var DIFF_BASIS_READ_CHUNK_BYTES = 64 * 1024;
function isENOENT(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
function isEEXIST(error) {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}
function isENOTDIR(error) {
  return error instanceof Error && "code" in error && error.code === "ENOTDIR";
}
function isAbortError(error) {
  return error instanceof Error && error.name === "AbortError";
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function isPermissionError(error) {
  return error instanceof Error && "code" in error && (error.code === "EACCES" || error.code === "EPERM");
}
function throwIfAborted(signal, verb) {
  if (signal?.aborted) throw new FsError2(`${verb} aborted`, "FS_ABORTED");
}
async function readFileAbortable(absolutePath, verb, signal) {
  try {
    return await readFile(absolutePath, signal ? { signal } : {});
  } catch (error) {
    if (!isAbortError(error)) throw error;
    throw new FsError2(`${verb} aborted`, "FS_ABORTED");
  }
}
function versionOf(info) {
  return FsVersion(`${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`);
}
function localDisplayPath(cwd, path) {
  const absoluteCwd = isAbsolute2(cwd) ? cwd : `${process.cwd()}${sep}${cwd}`;
  const raw = isAbsolute2(path) ? path : `${absoluteCwd}${sep}${path}`;
  const physicalSpelling = /(?:^|[\\/])\.\.(?:[\\/]|$)/u.test(raw) ? raw : resolve2(cwd, path);
  return process.platform === "win32" ? resolve2(cwd, path) : physicalSpelling;
}
async function resolveLocalTarget(cwd, path) {
  if (path.trim().length === 0) throw new FsError2("file_path must be a non-empty string", "FS_NOT_FOUND");
  const displayPath = localDisplayPath(cwd, path);
  try {
    return { displayPath, targetKey: FsTargetKey(await realpath(displayPath)) };
  } catch (error) {
    if (isENOTDIR(error)) throw new FsError2(`cannot resolve "${displayPath}": a parent path segment is not a directory`, "FS_NOT_FOUND");
    if (!isENOENT(error)) throw error;
  }
  const missing = [basename(displayPath)];
  let ancestor = dirname2(displayPath);
  while (true) {
    try {
      const realAncestor = await realpath(ancestor);
      if (missing.includes("..")) throw new FsError2(`cannot resolve "${displayPath}": parent traversal crosses a missing directory`, "FS_NOT_FOUND");
      if (process.platform === "win32") {
        const parentInfo = await stat(realAncestor);
        if (!parentInfo.isDirectory()) {
          throw new FsError2(`cannot resolve "${displayPath}": a parent path segment is not a directory`, "FS_NOT_FOUND");
        }
      }
      return { displayPath, targetKey: FsTargetKey(join2(realAncestor, ...missing)) };
    } catch (error) {
      if (error instanceof FsError2) throw error;
      if (!isENOENT(error)) throw error;
      const parent = dirname2(ancestor);
      if (parent === ancestor) return { displayPath, targetKey: FsTargetKey(displayPath) };
      missing.unshift(basename(ancestor));
      ancestor = parent;
    }
  }
}
function pathType(info) {
  if (info.isFile()) return "file";
  if (info.isDirectory()) return "directory";
  return "other";
}
function pathLinkType(info) {
  if (info.isSymbolicLink()) return "symlink";
  return pathType(info);
}
async function probeStats(absolutePath, readStats) {
  try {
    return await readStats(absolutePath);
  } catch (error) {
    if (!isENOENT(error) && !isENOTDIR(error)) throw error;
    return null;
  }
}
async function probe(absolutePath) {
  const info = await probeStats(absolutePath, (path) => stat(path, { bigint: true }));
  if (!info) return null;
  return {
    version: versionOf(info),
    mode: Number(info.mode & 0o777n),
    type: pathType(info),
    size: Number(info.size)
  };
}
async function probeNoFollow(absolutePath) {
  const info = await probeStats(absolutePath, (path) => lstat2(path, { bigint: true }));
  if (!info) return null;
  return {
    version: versionOf(info),
    mode: Number(info.mode & 0o777n),
    type: pathLinkType(info),
    size: Number(info.size)
  };
}
function listingIoError(displayPath, error) {
  if (error instanceof FsError2) return error;
  if (isENOENT(error) || isENOTDIR(error)) return new FsError2(`cannot list "${displayPath}": not found`, "FS_NOT_FOUND", { cause: error });
  if (isPermissionError(error)) return new FsError2(`cannot list "${displayPath}": permission denied`, "FS_PERMISSION_DENIED", { cause: error });
  return new FsError2(`cannot list "${displayPath}": ${errorMessage(error)}`, "FS_IO_ERROR", { cause: error });
}
async function resolveListedChildTarget(parent, name) {
  const identity = await resolveLocalTarget(parent.targetKey, name);
  return { displayPath: localDisplayPath(parent.displayPath, name), targetKey: identity.targetKey };
}
async function listDirectory(target, signal) {
  throwIfAborted(signal, "list");
  let info;
  try {
    info = await probe(target.targetKey);
  } catch (error) {
    throw listingIoError(target.displayPath, error);
  }
  if (!info) throw new FsError2(`cannot list "${target.displayPath}": not found`, "FS_NOT_FOUND");
  if (info.type !== "directory") throw new FsError2(`cannot list "${target.displayPath}": not a directory`, "FS_NOT_DIRECTORY");
  let entries;
  try {
    entries = await readdir(target.targetKey, { withFileTypes: true, encoding: "utf8" });
  } catch (error) {
    throw listingIoError(target.displayPath, error);
  }
  throwIfAborted(signal, "list");
  const result = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    throwIfAborted(signal, "list");
    try {
      const childTarget = await resolveListedChildTarget(target, entry.name);
      const childInfo = await probe(childTarget.targetKey);
      result.push({
        name: entry.name,
        type: childInfo?.type ?? "other",
        target: childTarget,
        ...childInfo ? { version: childInfo.version } : {},
        ...childInfo?.type === "file" ? { size: childInfo.size } : {}
      });
    } catch (error) {
      throw listingIoError(localDisplayPath(target.displayPath, entry.name), error);
    }
    throwIfAborted(signal, "list");
  }
  return result;
}
function notTextError(verb, displayPath) {
  return new FsError2(`cannot ${verb} "${displayPath}": invalid UTF-8 text`, "FS_NOT_TEXT");
}
function decodeUtf8(buffer, verb, displayPath) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw notTextError(verb, displayPath);
  }
}
function decodeUtf8Stream(decoder, chunk, verb, displayPath) {
  try {
    return chunk ? decoder.decode(chunk, { stream: true }) : decoder.decode();
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw notTextError(verb, displayPath);
  }
}
async function statRegularFile(target, verb, signal) {
  throwIfAborted(signal, verb);
  let info;
  try {
    info = await stat(target.targetKey);
  } catch (error) {
    if (!isENOENT(error)) throw error;
    throw new FsError2(`cannot ${verb} "${target.displayPath}": not found`, "FS_NOT_FOUND");
  }
  if (!info.isFile()) throw new FsError2(`cannot ${verb} "${target.displayPath}": not a regular file`, "FS_NOT_REGULAR_FILE");
  return info;
}
async function readWholeText(target, signal) {
  await statRegularFile(target, "read", signal);
  const raw = await readFileAbortable(target.targetKey, "read", signal);
  throwIfAborted(signal, "read");
  if (raw.subarray(0, BINARY_SAMPLE_BYTES).includes(0)) {
    throw new FsError2(`cannot read "${target.displayPath}": binary file`, "FS_NOT_TEXT");
  }
  return decodeUtf8(raw, "read", target.displayPath);
}
async function readWholeBytes(target, signal, maxBytes, internals = {}) {
  const info = await statRegularFile(target, "read", signal);
  if (info.size > maxBytes) {
    throw new FsError2(`cannot read "${target.displayPath}": ${info.size} bytes exceeds the ${maxBytes}-byte limit`, "FS_TOO_LARGE");
  }
  await internals.inspectReadBytesAfterStat?.(target);
  const stream = createReadStream(target.targetKey, {
    end: maxBytes,
    ...signal ? { signal } : {}
  });
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of stream) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        throw new FsError2(`cannot read "${target.displayPath}": content exceeds the ${maxBytes}-byte limit`, "FS_TOO_LARGE");
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (isAbortError(error)) throw new FsError2("read aborted", "FS_ABORTED");
    throw error;
  }
  return Buffer.concat(chunks, bytes);
}
async function readByteWindow(target, range, signal) {
  await statRegularFile(target, "read", signal);
  if (range.length === 0) return new Uint8Array(0);
  const stream = createReadStream(target.targetKey, {
    start: range.offset,
    end: range.offset + range.length - 1,
    ...signal ? { signal } : {}
  });
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of stream) {
      chunks.push(chunk);
      bytes += chunk.length;
    }
  } catch (error) {
    if (isAbortError(error)) throw new FsError2("read aborted", "FS_ABORTED");
    throw error;
  }
  return Buffer.concat(chunks, bytes);
}
async function* streamWholeText(target, signal) {
  await statRegularFile(target, "read", signal);
  const stream = createReadStream(target.targetKey, signal ? { signal } : {});
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let sampledBytes = 0;
  function scanBinarySample(chunk) {
    if (sampledBytes >= BINARY_SAMPLE_BYTES) return;
    const sample = chunk.subarray(0, Math.min(chunk.length, BINARY_SAMPLE_BYTES - sampledBytes));
    if (sample.includes(0)) {
      throw new FsError2(`cannot read "${target.displayPath}": binary file`, "FS_NOT_TEXT");
    }
    sampledBytes += sample.length;
  }
  try {
    for await (const chunk of stream) {
      scanBinarySample(chunk);
      yield decodeUtf8Stream(decoder, chunk, "read", target.displayPath);
    }
    yield decodeUtf8Stream(decoder, void 0, "read", target.displayPath);
  } catch (error) {
    if (isAbortError(error)) throw new FsError2("read aborted", "FS_ABORTED");
    throw error;
  }
}
async function removeStagingDirOrThrow(stagingDir, originalError, removeStagingDir) {
  try {
    await removeStagingDir(stagingDir);
  } catch (cleanupError) {
    throw new FsError2(`write failed (${errorMessage(originalError)}) and temp cleanup failed (${errorMessage(cleanupError)})`, "FS_NOT_FOUND", { cause: originalError });
  }
  throw originalError;
}
async function throwGuardedCreateFailure(error, absolutePath, displayPath, inspectPublicationTarget) {
  let existing;
  try {
    existing = await inspectPublicationTarget(absolutePath);
  } catch (metadataError) {
    if (!isENOENT(metadataError) && !isENOTDIR(metadataError)) {
      throw new FsError2(`cannot write "${displayPath}": ${errorMessage(metadataError)}`, "FS_IO_ERROR", { cause: metadataError });
    }
  }
  if (existing !== void 0) {
    if (!existing.isFile()) {
      throw new FsError2(`cannot write "${displayPath}": not a regular file`, "FS_NOT_REGULAR_FILE", { cause: error });
    }
    throw new FsError2(
      `cannot overwrite existing "${displayPath}" without reading it first`,
      "FS_NOT_OBSERVED",
      { cause: error }
    );
  }
  if (isEEXIST(error)) {
    throw new FsError2(
      `cannot overwrite existing "${displayPath}" without reading it first`,
      "FS_NOT_OBSERVED",
      { cause: error }
    );
  }
  throw new FsError2(`cannot write "${displayPath}": ${errorMessage(error)}`, "FS_IO_ERROR", { cause: error });
}
async function writeFileAtomic(absolutePath, content, mode, signal, internals = {}, createIfAbsent, publish) {
  throwIfAborted(signal, "write");
  const directory = dirname2(absolutePath);
  await mkdir2(directory, { recursive: true });
  throwIfAborted(signal, "write");
  const stagingDirName = internals.tempDirName?.(absolutePath) ?? `.${basename(absolutePath)}.${process.pid}.${randomUUID2()}.tmpdir`;
  const stagingDir = join2(directory, stagingDirName);
  const tempName = internals.tempName?.(absolutePath) ?? `${basename(absolutePath)}.tmp`;
  const tempPath = join2(stagingDir, tempName);
  const platform = internals.platform ?? process.platform;
  const copyFileDacl = internals.copyFileDacl ?? copyFileDaclWin32;
  const replaceFile = internals.replaceFile ?? replaceFileWin32;
  const linkFile = internals.linkFile ?? link;
  const inspectPublicationTarget = internals.inspectPublicationTarget ?? ((path) => lstat2(path, { bigint: true }));
  let releaseStaging;
  const removeStagingDir = async (path) => {
    try {
      if (internals.removeStagingDir !== void 0) {
        await internals.removeStagingDir(path);
        return;
      }
      if (publish === void 0) {
        await rm(path, { recursive: true, force: true });
        return;
      }
      await unlink(tempPath).catch((error) => {
        if (!isENOENT(error)) throw error;
      });
      releaseStaging?.();
      releaseStaging = void 0;
      await rmdir(path);
    } finally {
      releaseStaging?.();
      releaseStaging = void 0;
    }
  };
  let handle;
  let stagingCreated = false;
  try {
    await mkdir2(stagingDir, { mode: 448 });
    stagingCreated = true;
    if (publish !== void 0) releaseStaging = await lockDirectories([tempPath], false);
    await chmod(stagingDir, 448);
    handle = await open(tempPath, "wx", 384);
    await handle.chmod(384);
    if (platform === "win32" && mode !== void 0) {
      await copyFileDacl(absolutePath, tempPath);
    }
    await handle.writeFile(content, { encoding: "utf8", ...signal ? { signal } : {} });
    await handle.sync();
    await internals.inspectTemp?.({ stagingDir, tempPath });
    if (mode !== void 0) await handle.chmod(mode);
    await handle.close();
    handle = void 0;
    throwIfAborted(signal, "write");
    if (publish !== void 0) {
      await publish(tempPath);
    } else if (createIfAbsent !== void 0) {
      try {
        await linkFile(tempPath, absolutePath);
      } catch (error) {
        await throwGuardedCreateFailure(error, absolutePath, createIfAbsent.displayPath, inspectPublicationTarget);
      }
    } else if (platform === "win32" && mode !== void 0) {
      try {
        await replaceFile(absolutePath, tempPath);
      } catch (error) {
        if (!isENOENT(error)) throw error;
        await rename(tempPath, absolutePath);
      }
    } else {
      await rename(tempPath, absolutePath);
    }
    try {
      await removeStagingDir(stagingDir);
    } catch (cleanupError) {
      if (publish !== void 0) throw new FsError2("file was committed but staging cleanup failed; inspect the recovery operation before retrying", "FS_RECOVERY_CONFLICT", { cause: cleanupError });
    }
  } catch (error) {
    let failure2 = isAbortError(error) ? new FsError2("write aborted", "FS_ABORTED") : error;
    if (handle) {
      try {
        await handle.close();
      } catch (closeError) {
        failure2 = new FsError2(`write failed (${errorMessage(failure2)}) and temp close failed (${errorMessage(closeError)})`, "FS_NOT_FOUND", { cause: failure2 });
      }
    }
    if (!stagingCreated) throw failure2;
    return removeStagingDirOrThrow(stagingDir, failure2, removeStagingDir);
  }
}
function normalizeLineEndings(content) {
  return content.replaceAll("\r\n", "\n");
}
function detectLineEndings(raw) {
  const sample = raw.slice(0, 4096);
  const crlfCount = sample.split("\r\n").length - 1;
  const lfCount = sample.split("\n").length - 1 - crlfCount;
  return crlfCount > lfCount ? "CRLF" : "LF";
}
function restoreLineEndings(content, lineEndings) {
  return lineEndings === "LF" ? content : normalizeLineEndings(content).split("\n").join("\r\n");
}
function countOccurrences(content, needle) {
  let count = 0;
  let index = 0;
  while (true) {
    const found = content.indexOf(needle, index);
    if (found === -1) return count;
    count += 1;
    index = found + needle.length;
  }
}
async function readForEdit(absolutePath, displayPath, signal) {
  throwIfAborted(signal, "edit");
  const buffer = await readFileAbortable(absolutePath, "edit", signal);
  throwIfAborted(signal, "edit");
  if (buffer.includes(0)) throw new FsError2(`cannot edit "${displayPath}": binary file`, "FS_NOT_TEXT");
  const raw = decodeUtf8(buffer, "edit", displayPath);
  return { content: normalizeLineEndings(raw), lineEndings: detectLineEndings(raw) };
}
async function readTextForDiff(absolutePath, maxBytes, signal) {
  throwIfAborted(signal, "read");
  try {
    const handle = await open(absolutePath, "r");
    let buffer;
    let total = 0;
    let openedSize = 0;
    try {
      throwIfAborted(signal, "read");
      const info = await handle.stat();
      throwIfAborted(signal, "read");
      if (!info.isFile()) return null;
      if (info.size >= maxBytes) return null;
      openedSize = info.size;
      buffer = Buffer.allocUnsafe(openedSize + 1);
      while (total < buffer.length) {
        throwIfAborted(signal, "read");
        const length = Math.min(buffer.length - total, DIFF_BASIS_READ_CHUNK_BYTES);
        const { bytesRead } = await handle.read(buffer, total, length, null);
        if (bytesRead === 0) break;
        total += bytesRead;
      }
    } finally {
      await handle.close();
    }
    throwIfAborted(signal, "read");
    if (total !== openedSize) return null;
    const basis = buffer.subarray(0, total);
    if (basis.includes(0)) return null;
    try {
      return normalizeLineEndings(new TextDecoder("utf-8", { fatal: true }).decode(basis));
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      return null;
    }
  } catch (error) {
    if (error instanceof FsError2) throw error;
    if (error instanceof Error && "code" in error) return null;
    throw error;
  }
}
function applyLiteralEdit(content, oldString, newString, replaceAll, displayPath) {
  const oldNorm = normalizeLineEndings(oldString);
  if (oldNorm.length === 0) {
    throw new FsError2("old_string must be a non-empty string", "FS_EDIT_NOT_FOUND");
  }
  const newNorm = normalizeLineEndings(newString);
  const replacements = countOccurrences(content, oldNorm);
  if (replacements === 0) {
    throw new FsError2(`old_string was not found in "${displayPath}"`, "FS_EDIT_NOT_FOUND");
  }
  if (!replaceAll && replacements > 1) {
    throw new FsError2(`old_string matched ${replacements} times in "${displayPath}"; provide a more specific old_string or set replace_all to true`, "FS_AMBIGUOUS_EDIT");
  }
  return { content: content.split(oldNorm).join(newNorm), replacements };
}

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/fs-local/src/recovery.ts
import { createHash, randomUUID as randomUUID3 } from "node:crypto";
import { lstat as lstat3, open as open2, readdir as readdir2, readFile as readFile2, rename as rename2, stat as stat2, statfs, unlink as unlink2, rmdir as rmdir2 } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { setTimeout as pause } from "node:timers/promises";
import { isAbsolute as isAbsolute3, join as join3, parse as parse2, relative, resolve as resolve3, sep as sep2 } from "node:path";
import { FsError as FsError3 } from "@deepseek-ai/dsh-fs";
function contentHash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function validateRecoveryConfig(config) {
  if (config === void 0) return;
  if (!config.root.trim() || !isAbsolute3(config.root) || samePath(config.root, parse2(config.root).root) || samePath(config.root, homedir2())) {
    throw new Error("fs-local: recovery.root must name a dedicated absolute directory");
  }
  for (const key of ["maxFileBytes", "maxTotalBytes", "maxEntries", "retentionMs"]) {
    if (!Number.isSafeInteger(config[key]) || config[key] <= 0) throw new Error(`fs-local: recovery.${key} must be a positive safe integer`);
  }
  if (config.maxFileBytes * 2 > config.maxTotalBytes) throw new Error("fs-local: recovery.maxTotalBytes must reserve at least two preimage copies");
  if (config.recordPublishMaxRetries !== void 0 && (!Number.isSafeInteger(config.recordPublishMaxRetries) || config.recordPublishMaxRetries < 0 || config.recordPublishMaxRetries > 3)) {
    throw new Error("fs-local: recovery.recordPublishMaxRetries must be an integer from 0 to 3");
  }
  if (config.recordPublishRetryDelayMs !== void 0 && (!Number.isSafeInteger(config.recordPublishRetryDelayMs) || config.recordPublishRetryDelayMs < 1 || config.recordPublishRetryDelayMs > 1e3)) {
    throw new Error("fs-local: recovery.recordPublishRetryDelayMs must be an integer from 1 to 1000");
  }
}
function resolveRecoveryConfig(config) {
  validateRecoveryConfig(config);
  return config === void 0 ? void 0 : {
    ...config,
    recordPublishMaxRetries: config.recordPublishMaxRetries ?? 3,
    recordPublishRetryDelayMs: config.recordPublishRetryDelayMs ?? 25
  };
}
function samePath(a, b) {
  return resolve3(a).toLowerCase() === resolve3(b).toLowerCase();
}
function under(root, path) {
  const suffix = relative(resolve3(root), resolve3(path));
  return suffix === "" || suffix !== ".." && !suffix.startsWith(`..${sep2}`) && !isAbsolute3(suffix);
}
function assertScope(target, workspaceRoot, recoveryRoot, allowOutside) {
  if (samePath(workspaceRoot, parse2(workspaceRoot).root) || samePath(workspaceRoot, homedir2())) {
    throw new FsError3("protected mutations require a dedicated project workspace", "FS_UNSAFE_TARGET");
  }
  if (samePath(workspaceRoot, target.targetKey)) throw new FsError3("mutation target is not a regular file", "FS_NOT_REGULAR_FILE");
  if (!allowOutside && !under(workspaceRoot, target.targetKey) || under(recoveryRoot, target.targetKey)) {
    throw new FsError3("protected mutation target must be a file inside the current workspace", "FS_SANDBOX_DENIED");
  }
  if (!samePath(target.displayPath, target.targetKey)) throw new FsError3("protected mutations refuse symbolic-link aliases", "FS_UNSAFE_TARGET");
  if (under(workspaceRoot, recoveryRoot) || under(recoveryRoot, workspaceRoot)) {
    throw new FsError3("recovery directory and workspace must be separate", "FS_UNSAFE_TARGET");
  }
  if (!samePath(parse2(target.targetKey).root, parse2(recoveryRoot).root)) {
    throw new FsError3("protected mutations require recovery storage on the same NTFS volume", "FS_UNSAFE_TARGET");
  }
}
function mutationSummary(record) {
  return {
    mutationId: record.id,
    action: record.action,
    source: record.source,
    ...record.destination === void 0 ? {} : { destination: record.destination },
    state: record.state,
    createdAt: record.createdAt
  };
}
async function writeDurable(path, data) {
  const handle = await open2(path, "wx", 384);
  try {
    await handle.writeFile(data);
    await handle.sync();
    return await handle.stat({ bigint: true });
  } finally {
    await handle.close();
  }
}
async function inspectRecoveryRecords(config) {
  const entries = await readdir2(config.root, { withFileTypes: true });
  const records = [];
  const issues = [];
  for (const entry of entries) {
    if (entry.name === ".lock") continue;
    try {
      if (isDirectoryGuard(entry.name)) {
        const guard = await lstat3(join3(config.root, entry.name));
        if (!guard.isFile() || guard.isSymbolicLink() || guard.size !== 0 || guard.nlink !== 1) throw new FsError3("invalid directory guard", "FS_RECOVERY_CONFLICT");
        continue;
      }
      if (!entry.isDirectory() || !/^[0-9a-f-]{36}$/.test(entry.name)) throw new FsError3("unexpected recovery entry; manual reconciliation required", "FS_RECOVERY_CONFLICT");
      const path = join3(config.root, entry.name, "record.json");
      const info = await lstat3(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 32768) throw new FsError3("invalid recovery record", "FS_RECOVERY_CONFLICT");
      const value = JSON.parse(await readFile2(path, "utf8"));
      const record = value;
      if (record.schema !== 1 || record.id !== entry.name || typeof record.source !== "string" || typeof record.workspaceRoot !== "string" || !["write", "move", "delete"].includes(String(record.action)) || !["prepared", "committed", "conflict", "restored"].includes(String(record.state)) || !Number.isSafeInteger(record.beforeSize) || record.beforeSize < 0 || !Number.isSafeInteger(record.createdAt) || record.createdAt < 0 || record.stagingBytes !== void 0 && (!Number.isSafeInteger(record.stagingBytes) || record.stagingBytes < 0) || !isAbsolute3(record.source) || !isAbsolute3(record.workspaceRoot) || record.action === "move" && (typeof record.destination !== "string" || !isAbsolute3(record.destination))) {
        throw new FsError3("unsupported or damaged recovery record", "FS_RECOVERY_CONFLICT");
      }
      const digest = (value2) => typeof value2 === "string" && /^[0-9a-f]{64}$/.test(value2);
      const time = (value2) => typeof value2 === "number" && Number.isFinite(value2) && Math.abs(value2) <= 864e13;
      const hasAfter = record.state === "committed" || record.state === "restored";
      if (typeof record.beforeExists !== "boolean" || (record.beforeExists ? !digest(record.beforeHash) || !time(record.beforeMtimeMs) || !time(record.beforeAtimeMs) : record.beforeSize !== 0 || record.beforeHash !== void 0 || record.beforeMtimeMs !== void 0 || record.beforeAtimeMs !== void 0) || record.action !== "write" && !record.beforeExists || record.action !== "move" && record.destination !== void 0 || record.action === "move" && typeof record.destination === "string" && samePath(record.source, record.destination) || record.afterHash !== void 0 && !digest(record.afterHash) || record.expectedAfterHash !== void 0 && !digest(record.expectedAfterHash) || record.afterVersion !== void 0 && (typeof record.afterVersion !== "string" || record.afterVersion.length === 0 || record.afterVersion.length > 4096) || hasAfter && record.action !== "delete" && (!digest(record.afterHash) || record.afterVersion === void 0) || hasAfter && record.action === "write" && record.expectedAfterHash !== record.afterHash || record.action === "delete" && (record.afterHash !== void 0 || record.afterVersion !== void 0) || record.error !== void 0 && (typeof record.error !== "string" || record.error.length > 1024)) {
        throw new FsError3("inconsistent recovery operation fields", "FS_RECOVERY_CONFLICT");
      }
      if (record.beforeHash !== void 0) {
        if (!/^[0-9a-f]{64}$/.test(record.beforeHash)) throw new FsError3("invalid preimage digest", "FS_RECOVERY_CONFLICT");
        if (record.state !== "restored") {
          const backup = await lstat3(join3(config.root, entry.name, "before.bin"));
          if (!backup.isFile() || backup.isSymbolicLink() || backup.nlink !== 1 || backup.size !== record.beforeSize) throw new FsError3("preimage missing or damaged", "FS_RECOVERY_CONFLICT");
        }
      }
      records.push(record);
    } catch {
      issues.push({ entry: entry.name, problem: "Entry is incomplete, damaged or unsupported; preserve it for offline reconciliation." });
    }
  }
  return { records, issues };
}
async function readMutationRecords(config) {
  const { records, issues } = await inspectRecoveryRecords(config);
  if (issues.length > 0) throw new FsError3("recovery journal requires reconciliation; inspectRecovery reports affected entries", "FS_RECOVERY_CONFLICT");
  if (records.length > config.maxEntries) throw new FsError3("recovery entry limit exceeded", "FS_BACKUP_LIMIT");
  return records;
}
async function checkCapacity(config, additional) {
  const records = await readMutationRecords(config);
  const space = await statfs(config.root, { bigint: true });
  const block = Number(space.bsize);
  const allocated = (size) => Math.max(block, Math.ceil(size / block) * block);
  let used = block;
  for (const record of records) {
    used += block + (record.stagingBytes ?? 0);
    for (const entry of await readdir2(join3(config.root, record.id), { withFileTypes: true })) {
      if (!entry.isFile()) throw new FsError3("unexpected nested recovery content; inspect before continuing", "FS_RECOVERY_CONFLICT");
      const info = await lstat3(join3(config.root, record.id, entry.name));
      if (!info.isFile() || info.isSymbolicLink()) throw new FsError3("unsafe recovery content", "FS_RECOVERY_CONFLICT");
      used += allocated(info.size);
    }
  }
  const reserve = allocated(additional) + 65536;
  if (used + reserve > config.maxTotalBytes || space.bavail * space.bsize < BigInt(reserve)) {
    throw new FsError3("insufficient recovery capacity; original remains unchanged", "FS_BACKUP_LIMIT");
  }
}
async function publishRecord(directory, record, config, previous) {
  const bytes = JSON.stringify(record) + "\n";
  const destination = join3(directory, "record.json");
  if (previous?.bytes === bytes) {
    const held2 = await ProtectedFileHandle.open(destination);
    if (held2 !== void 0) {
      try {
        if ((await probe(destination))?.version === previous.version && await readFile2(destination, "utf8") === bytes) return previous;
      } finally {
        held2.close();
      }
    }
  }
  const temporary = join3(directory, `${randomUUID3()}.json.tmp`);
  const candidate = await writeDurable(temporary, bytes);
  for (let attempt = 0; ; attempt++) {
    try {
      await rename2(temporary, destination);
      break;
    } catch (error) {
      if (attempt >= config.recordPublishMaxRetries || !["EPERM", "EBUSY"].includes(error.code ?? "")) throw error;
      await pause(config.recordPublishRetryDelayMs * (attempt + 1));
    }
  }
  const held = await ProtectedFileHandle.open(destination);
  if (held === void 0) throw new FsError3("published recovery record disappeared; inspect before continuing", "FS_RECOVERY_CONFLICT");
  try {
    const actual = await stat2(destination, { bigint: true });
    if (actual.dev !== candidate.dev || actual.ino !== candidate.ino || actual.size !== candidate.size || actual.mtimeNs !== candidate.mtimeNs || await readFile2(destination, "utf8") !== bytes) {
      throw new FsError3("published recovery record differs from the synced candidate; inspect before continuing", "FS_RECOVERY_CONFLICT");
    }
    const persisted = await probe(destination);
    if (persisted === null) throw new FsError3("published recovery record disappeared; inspect before continuing", "FS_RECOVERY_CONFLICT");
    return { bytes, version: persisted.version };
  } finally {
    held.close();
  }
}
async function saveRecord(config, record) {
  const directory = join3(config.root, record.id);
  const release = await lockDirectories([join3(directory, "record.json")], false);
  try {
    await publishRecord(directory, record, config);
  } finally {
    release();
  }
}
async function pruneRestored(config, records) {
  const latest = /* @__PURE__ */ new Map();
  for (const record of records) {
    const key = record.source.toLowerCase();
    if ((latest.get(key)?.createdAt ?? -Infinity) < record.createdAt) latest.set(key, record);
  }
  const removed = /* @__PURE__ */ new Set();
  for (const record of records) {
    if (record.state !== "restored" || (record.stagingBytes ?? 0) > 0 || Date.now() - record.createdAt < config.retentionMs || latest.get(record.source.toLowerCase()) === record) continue;
    const directory = join3(config.root, record.id);
    const release = await lockDirectories([join3(directory, "record.json")], false);
    try {
      const entries = (await readdir2(directory, { withFileTypes: true })).filter((entry) => !isDirectoryGuard(entry.name));
      if (entries.some((entry) => !entry.isFile() || !["record.json", "before.bin", "original", "restore.bin"].includes(entry.name))) {
        throw new FsError3("unexpected backup contents prevent history cleanup", "FS_RECOVERY_CONFLICT");
      }
      for (const entry of entries.sort((a, b) => Number(a.name === "record.json") - Number(b.name === "record.json"))) await unlink2(join3(directory, entry.name));
    } finally {
      release();
    }
    await rmdir2(directory);
    removed.add(record.id);
  }
  return records.filter((record) => !removed.has(record.id));
}
async function restoreOperation(config, id, workspaceRoot, signal, allowOutside = false) {
  if (config === void 0) throw new FsError3("recovery storage is not configured", "FS_PROTECTION_UNAVAILABLE");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new FsError3("invalid recovery operation ID", "FS_RECOVERY_CONFLICT");
  const records = await readMutationRecords(config);
  const record = records.find((candidate) => candidate.id === id && samePath(candidate.workspaceRoot, workspaceRoot));
  if (record === void 0 || record.state !== "committed") throw new FsError3("operation is unavailable or requires reconciliation", "FS_RECOVERY_CONFLICT");
  const source = await resolveLocalTarget(workspaceRoot, record.source);
  const current = record.action === "move" ? await resolveLocalTarget(workspaceRoot, record.destination) : source;
  const transaction = await RecoveryTransaction.prepare(config, current, workspaceRoot, signal, record.action === "move" ? source : void 0, allowOutside);
  try {
    const latest = (await readMutationRecords(config)).find((candidate) => candidate.id === id);
    if (JSON.stringify(latest) !== JSON.stringify(record)) throw new FsError3("recovery record changed; re-read before retrying", "FS_RECOVERY_CONFLICT");
    const info = await probe(current.targetKey);
    if (record.action === "delete") {
      if (info !== null) throw new FsError3("recovery target contains new data", "FS_RECOVERY_CONFLICT");
    } else if (info === null || record.afterVersion === void 0 || info.version !== record.afterVersion || contentHash(await readFile2(current.targetKey)) !== record.afterHash) {
      throw new FsError3("recovery target changed since the operation; current data and backup are preserved", "FS_RECOVERY_CONFLICT");
    }
    if (signal?.aborted) throw new FsError3("recovery aborted", "FS_ABORTED");
    if (record.action === "move") {
      await transaction.relocate(source.targetKey, record.beforeAtimeMs, record.beforeMtimeMs);
    } else if (!record.beforeExists) {
      await transaction.relocate();
    } else {
      const backup = join3(config.root, id, "before.bin");
      const heldBackup = await ProtectedFileHandle.open(backup);
      if (heldBackup === void 0) throw new FsError3("recovery preimage is unavailable", "FS_RECOVERY_CONFLICT");
      try {
        const backupInfo = await lstat3(backup);
        if (!backupInfo.isFile() || backupInfo.isSymbolicLink() || backupInfo.nlink !== 1 || backupInfo.size > config.maxFileBytes) {
          throw new FsError3("recovery preimage is not a supported ordinary file", "FS_RECOVERY_CONFLICT");
        }
        const bytes = await readFile2(backup);
        if (contentHash(bytes) !== record.beforeHash) throw new FsError3("recovery preimage hash mismatch", "FS_RECOVERY_CONFLICT");
        const staged = join3(transaction.directory, "restore.bin");
        await transaction.reserveCandidate(bytes.length, contentHash(bytes));
        const handle = await open2(staged, "wx", 384);
        try {
          await copyFileDaclWin32(backup, staged);
          await handle.writeFile(bytes);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await transaction.publish(staged, record.beforeAtimeMs, record.beforeMtimeMs);
        await transaction.stagingCleaned();
      } finally {
        heldBackup.close();
      }
    }
    const restoredPath = record.action === "move" ? source.targetKey : current.targetKey;
    transaction.record.afterVersion = (await probe(restoredPath))?.version;
    await transaction.save();
    record.state = "restored";
    await saveRecord(resolveRecoveryConfig(config), record);
    return mutationSummary(record);
  } finally {
    transaction.close();
  }
}
var RecoveryTransaction = class _RecoveryTransaction {
  constructor(config, record, directory, original, release) {
    this.config = config;
    this.record = record;
    this.directory = directory;
    this.original = original;
    this.release = release;
  }
  config;
  record;
  directory;
  original;
  release;
  published;
  persistedRecord;
  /** Acquire handles and persist a preimage before allowing mutation of the actual file.
   * @param config - explicitly configured recovery storage.
   * @param target - resolved original file or absent creation target.
   * @param workspaceRoot - trusted current workspace.
   * @param signal - aborts before preparing.
   * @param destination - absent managed-move destination.
   * @param allowOutside - explicit current full-access authorization.
   * @returns owned transaction requiring close in a finally block.
   */
  static async prepare(config, target, workspaceRoot, signal, destination, allowOutside = false) {
    if (process.platform !== "win32" || process.arch !== "x64") throw new FsError3("protected file mutations require the verified Windows x64 NTFS backend", "FS_PROTECTION_UNAVAILABLE");
    if (config === void 0) throw new FsError3("file mutations are unavailable until recovery storage and limits are configured", "FS_PROTECTION_UNAVAILABLE");
    const resolvedConfig = resolveRecoveryConfig(config);
    if (signal?.aborted) throw new FsError3("file mutation aborted", "FS_ABORTED");
    assertScope(target, workspaceRoot, config.root, allowOutside);
    const recoveryInfo = await lstat3(config.root).catch((error) => {
      throw new FsError3("configured recovery storage is unavailable; it will not be recreated", "FS_PROTECTION_UNAVAILABLE", { cause: error });
    });
    if (!recoveryInfo.isDirectory() || recoveryInfo.isSymbolicLink()) throw new FsError3("configured recovery storage is not a real directory", "FS_PROTECTION_UNAVAILABLE");
    if (destination !== void 0) assertScope(destination, workspaceRoot, config.root, allowOutside);
    const releaseRecoveryDirectories = await lockDirectories([join3(config.root, ".lock")], false);
    let releaseDirectories;
    let releaseJournal;
    let original;
    try {
      releaseDirectories = await lockDirectories([target.displayPath, ...destination === void 0 ? [] : [destination.displayPath]], true);
      releaseJournal = await lockRecoveryFile(join3(config.root, ".lock"));
      const records = await pruneRestored(config, await readMutationRecords(config));
      if (records.length >= config.maxEntries) throw new FsError3("recovery entry capacity exhausted; retain unresolved backups", "FS_BACKUP_LIMIT");
      original = await ProtectedFileHandle.open(target.targetKey);
      if (destination !== void 0) {
        const existingDestination = await lstat3(destination.targetKey).catch((error) => {
          if (error.code === "ENOENT") return void 0;
          throw error;
        });
        if (existingDestination !== void 0) throw new FsError3("move destination already exists", "FS_RECOVERY_CONFLICT");
      }
      const before = original === void 0 ? void 0 : await stat2(target.targetKey);
      if (before !== void 0 && before.size > config.maxFileBytes) throw new FsError3("file exceeds the configured backup size limit", "FS_BACKUP_LIMIT");
      await checkCapacity(config, (before?.size ?? 0) * 2);
      const bytes = original === void 0 ? void 0 : await readFile2(target.targetKey);
      const record = {
        schema: 1,
        id: randomUUID3(),
        action: "write",
        source: target.targetKey,
        workspaceRoot: resolve3(workspaceRoot),
        state: "prepared",
        createdAt: Date.now(),
        beforeExists: bytes !== void 0,
        beforeSize: bytes?.length ?? 0,
        ...bytes === void 0 ? {} : { beforeHash: contentHash(bytes) },
        ...before === void 0 ? {} : { beforeMtimeMs: before.mtimeMs, beforeAtimeMs: before.atimeMs }
      };
      const directory = join3(config.root, record.id);
      const releaseOperation = await lockDirectories([join3(directory, "record.json")], true);
      try {
        await writeDurable(join3(directory, "record.json"), JSON.stringify(record) + "\n");
        if (bytes !== void 0) {
          const backup = join3(directory, "before.bin");
          const handle = await open2(backup, "wx", 384);
          try {
            await copyFileDaclWin32(target.targetKey, backup);
            await handle.writeFile(bytes);
            await handle.sync();
          } finally {
            await handle.close();
          }
        }
      } catch (error) {
        releaseOperation();
        throw error;
      }
      const journal = releaseJournal;
      const directories = releaseDirectories;
      return new _RecoveryTransaction(resolvedConfig, record, directory, original, () => {
        try {
          releaseOperation();
        } finally {
          try {
            journal();
          } finally {
            try {
              directories();
            } finally {
              releaseRecoveryDirectories();
            }
          }
        }
      });
    } catch (error) {
      try {
        original?.close();
      } finally {
        try {
          releaseJournal?.();
        } finally {
          try {
            releaseDirectories?.();
          } finally {
            releaseRecoveryDirectories();
          }
        }
      }
      throw error;
    }
  }
  /** Reserve candidate bytes before staging, so newly created files remain recoverable too.
   * @param bytes - full candidate byte count.
   * @param expectedHash - digest of the requested candidate contents.
   */
  async reserveCandidate(bytes, expectedHash) {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > this.config.maxFileBytes) throw new FsError3("replacement exceeds the configured recoverable file limit", "FS_BACKUP_LIMIT");
    await checkCapacity(this.config, bytes + this.record.beforeSize);
    const { bsize } = await statfs(this.config.root);
    this.record.stagingBytes = Math.max(bsize, Math.ceil(bytes / bsize) * bsize) + bsize;
    this.record.expectedAfterHash = expectedHash;
    await this.save();
  }
  /** Clear the conservative reservation only after the known staging directory was removed. */
  async stagingCleaned() {
    this.record.stagingBytes = 0;
    await this.save();
  }
  /** Persist changed metadata through a synced sibling; reuse only this transaction's verified durable version. */
  async save() {
    this.persistedRecord = await publishRecord(this.directory, this.record, this.config, this.persistedRecord);
  }
  /** Publish the prepared file without overwriting any intervening creator.
   * @param temporary - synced candidate whose expected digest was reserved.
   * @param accessMs - optional captured access time for restoration.
   * @param writeMs - optional captured write time for restoration.
   */
  async publish(temporary, accessMs, writeMs) {
    try {
      this.published = await ProtectedFileHandle.open(temporary);
      if (this.published === void 0) throw new FsError3("prepared replacement disappeared", "FS_UNSAFE_TARGET");
      if (this.record.expectedAfterHash === void 0 || contentHash(await readFile2(temporary)) !== this.record.expectedAfterHash) {
        throw new FsError3("prepared replacement bytes changed before publication", "FS_UNSAFE_TARGET");
      }
      this.original?.rename(join3(this.directory, "original"));
      this.published.rename(this.record.source);
      this.record.afterHash = contentHash(await readFile2(this.record.source));
      if (accessMs !== void 0 && writeMs !== void 0) this.published.setTimes(accessMs, writeMs);
      this.record.afterVersion = (await probe(this.record.source))?.version;
      this.record.state = "committed";
      await this.save();
    } catch (error) {
      this.published?.close();
      this.published = void 0;
      this.record.state = "conflict";
      this.record.error = "publication incomplete; inspect original, target and backup before recovery";
      await this.save();
      if (this.original === void 0) {
        const collision = await lstat3(this.record.source).catch(() => void 0);
        if (collision !== void 0) {
          if (!collision.isFile()) throw new FsError3("write target is not a regular file", "FS_NOT_REGULAR_FILE", { cause: error });
          throw new FsError3(`cannot overwrite existing "${this.record.source}" without reading it first`, "FS_NOT_OBSERVED", { cause: error });
        }
      }
      throw error;
    }
  }
  /** Relocate the held original into quarantine or to a checked absent destination.
   * @param destination - absent target path, or omit to remove into recovery.
   * @param accessMs - optional captured access time when restoring a move.
   * @param writeMs - optional captured write time when restoring a move.
   */
  async relocate(destination, accessMs, writeMs) {
    if (this.original === void 0) throw new FsError3("managed operation source does not exist", "FS_NOT_FOUND");
    this.record.action = destination === void 0 ? "delete" : "move";
    if (destination !== void 0) this.record.destination = destination;
    await this.save();
    try {
      this.original.rename(destination ?? join3(this.directory, "original"));
      if (accessMs !== void 0 && writeMs !== void 0) this.original.setTimes(accessMs, writeMs);
      this.record.afterHash = destination === void 0 ? void 0 : this.record.beforeHash;
      this.record.afterVersion = destination === void 0 ? void 0 : (await probe(destination))?.version;
      this.record.state = "committed";
      await this.save();
    } catch (error) {
      this.record.state = "conflict";
      this.record.error = "relocation incomplete; retained preimage requires reconciliation";
      await this.save();
      throw error;
    }
  }
  /** Release all live handles; backups and journals survive provider disposal and restart. */
  close() {
    try {
      this.original?.close();
    } finally {
      try {
        this.published?.close();
      } finally {
        this.release();
      }
    }
  }
};

// dsh-host-isolation/candidates/dsh-alpha2-migration-20260917/source/deepseek-harness-ddefc45fbc7f8e46dd73185e68295696d1297887/packages/fs/fs-local/src/index.ts
var DEFAULT_DIFF_BASIS_MAX_BYTES = 10 * 1024 * 1024;
var MAX_DIFF_BASIS_BYTES = Math.min(
  bufferConstants.MAX_LENGTH,
  bufferConstants.MAX_STRING_LENGTH
);
var LocalFileSystem = class extends FileSystem {
  static Config = z.object({
    recovery: z.union([z.object({
      root: z.string().required(),
      maxFileBytes: z.number().required(),
      maxTotalBytes: z.number().required(),
      maxEntries: z.number().required(),
      retentionMs: z.number().required(),
      recordPublishMaxRetries: z.number().default(3),
      recordPublishRetryDelayMs: z.number().default(25)
    }), z.const(void 0)]),
    cwd: z.string().default(process.cwd()),
    diffBasisMaxBytes: z.number().default(DEFAULT_DIFF_BASIS_MAX_BYTES)
  });
  /** Validated config (schemastery applied the defaults before construction). */
  config;
  get recoveryStatus() {
    if (process.platform !== "win32" || process.arch !== "x64") return "unsupported";
    return this.config.recovery === void 0 ? "unconfigured" : "ready";
  }
  /** Test hook forwarded to fsio for atomic-publication boundaries. */
  internals = {};
  /** Per-store FIFO serializes this instance's quota, journal and file transitions. */
  locks = /* @__PURE__ */ new Map();
  assertWritable(policy) {
    if (policy?.mode === "read-only") throw new FsError4("file access denied under read-only mode", "FS_SANDBOX_DENIED");
  }
  constructor(ctx, config) {
    super(ctx);
    const resolved = config;
    const recovery = resolveRecoveryConfig(resolved.recovery);
    if (!Number.isSafeInteger(resolved.diffBasisMaxBytes) || resolved.diffBasisMaxBytes <= 0 || resolved.diffBasisMaxBytes > MAX_DIFF_BASIS_BYTES) {
      throw new Error(`fs-local: diffBasisMaxBytes must be a positive safe integer no greater than ${MAX_DIFF_BASIS_BYTES}`);
    }
    this.config = { ...resolved, recovery };
  }
  /** Serialize this instance's recovery store, falling back to a target key
   * without recovery configuration. Other instances still face native conflicts. */
  async withLock(targetKey, op) {
    const key = this.config.recovery === void 0 ? targetKey : `recovery:${resolve4(this.config.recovery.root).toLowerCase()}`;
    const prior = this.locks.get(key) ?? Promise.resolve();
    const run = prior.then(op, op);
    const tail = run.then(() => void 0, () => void 0);
    this.locks.set(key, tail);
    try {
      return await run;
    } finally {
      if (this.locks.get(key) === tail) {
        this.locks.delete(key);
      }
    }
  }
  async resolve(path, opts) {
    if (opts?.signal?.aborted) throw new FsError4("resolve aborted", "FS_ABORTED");
    const local = await resolveLocalTarget(opts?.cwd ?? this.config.cwd, path);
    if (opts?.signal?.aborted) throw new FsError4("resolve aborted", "FS_ABORTED");
    return { targetKey: local.targetKey, displayPath: local.displayPath };
  }
  processPath(target) {
    return String(target.targetKey);
  }
  processPathFromHostPath(hostPath) {
    return isAbsolute4(hostPath) ? resolve4(hostPath) : void 0;
  }
  fileUrl(target) {
    return pathToFileURL(this.processPath(target)).href;
  }
  contains(parent, child) {
    const path = relative2(this.processPath(parent), this.processPath(child));
    return path === "" || path !== ".." && !path.startsWith(`..${sep3}`) && !isAbsolute4(path);
  }
  async stat(target, signal) {
    if (signal?.aborted) throw new FsError4("stat aborted", "FS_ABORTED");
    const info = await probe(target.targetKey);
    if (signal?.aborted) throw new FsError4("stat aborted", "FS_ABORTED");
    if (!info) return void 0;
    return { version: info.version, type: info.type, size: info.size };
  }
  async lstat(path, opts, signal) {
    if (signal?.aborted) throw new FsError4("lstat aborted", "FS_ABORTED");
    if (path.trim().length === 0) throw new FsError4("file_path must be a non-empty string", "FS_NOT_FOUND");
    const cwd = opts?.cwd ?? this.config.cwd;
    const info = await probeNoFollow(localDisplayPath(cwd, path));
    if (signal?.aborted) throw new FsError4("lstat aborted", "FS_ABORTED");
    if (!info) return void 0;
    return { version: info.version, type: info.type, size: info.size };
  }
  async readText(target, signal) {
    return readWholeText({ displayPath: target.displayPath, targetKey: target.targetKey }, signal);
  }
  streamText(target, signal) {
    return Promise.resolve(streamWholeText({ displayPath: target.displayPath, targetKey: target.targetKey }, signal));
  }
  async readBytes(target, signal, maxBytes) {
    return readWholeBytes({ displayPath: target.displayPath, targetKey: target.targetKey }, signal, maxBytes, this.internals);
  }
  async readByteRange(target, range, signal) {
    return readByteWindow({ displayPath: target.displayPath, targetKey: target.targetKey }, range, signal);
  }
  async listDir(target, signal) {
    const entries = await listDirectory({ displayPath: target.displayPath, targetKey: target.targetKey }, signal);
    return entries.map((entry) => ({
      name: entry.name,
      type: entry.type,
      target: { targetKey: entry.target.targetKey, displayPath: entry.target.displayPath },
      ...entry.version !== void 0 ? { version: entry.version } : {},
      ...entry.size !== void 0 ? { size: entry.size } : {}
    }));
  }
  async writeText(target, content, expected, signal, sandboxPolicy) {
    this.assertWritable(sandboxPolicy);
    return this.withLock(target.targetKey, async () => {
      const transaction = await RecoveryTransaction.prepare(this.config.recovery, target, sandboxPolicy?.workspaceRoot ?? this.config.cwd, signal, void 0, sandboxPolicy?.mode === "danger-full-access");
      try {
        const existing = await probe(target.targetKey);
        if (existing && existing.type !== "file") {
          throw new FsError4(`cannot write "${target.displayPath}": not a regular file`, "FS_NOT_REGULAR_FILE");
        }
        if (expected?.kind === "replaceIfVersion") {
          if (!existing) throw new FsError4(`cannot write "${target.displayPath}": file no longer exists`, "FS_STALE_VERSION");
          if (existing.version !== expected.version) {
            throw new FsError4(`cannot write "${target.displayPath}": file changed since it was read`, "FS_STALE_VERSION");
          }
        } else if (expected?.kind === "createIfAbsent" && existing) {
          throw new FsError4(`cannot overwrite existing "${target.displayPath}" without reading it first`, "FS_NOT_OBSERVED");
        }
        const diffable = existing !== null && Buffer.byteLength(content, "utf8") < this.config.diffBasisMaxBytes;
        const before = diffable ? await readTextForDiff(target.targetKey, this.config.diffBasisMaxBytes, signal) : null;
        await transaction.reserveCandidate(Buffer.byteLength(content, "utf8"), contentHash(content));
        await writeFileAtomic(
          target.targetKey,
          content,
          existing?.mode,
          signal,
          this.internals,
          expected?.kind === "createIfAbsent" ? { displayPath: target.displayPath } : void 0,
          (temporary) => transaction.publish(temporary)
        );
        await transaction.stagingCleaned();
        const after = await probe(target.targetKey);
        transaction.record.afterVersion = after?.version;
        await transaction.save();
        return {
          mutationId: transaction.record.id,
          operation: existing ? "update" : "create",
          version: this.versionAfterWrite(after, target),
          before,
          // LF-normalized to share the diff basis with `before` (also LF): a CRLF
          // overwrite must not read as every line changed. Line-ending restoration
          // is a storage detail the applied-hunk diff ignores.
          after: normalizeLineEndings(content)
        };
      } finally {
        transaction.close();
      }
    });
  }
  async editText(target, edit, expected, signal, sandboxPolicy) {
    this.assertWritable(sandboxPolicy);
    return this.withLock(target.targetKey, async () => {
      const transaction = await RecoveryTransaction.prepare(this.config.recovery, target, sandboxPolicy?.workspaceRoot ?? this.config.cwd, signal, void 0, sandboxPolicy?.mode === "danger-full-access");
      try {
        const existing = await probe(target.targetKey);
        if (!existing) throw new FsError4(`cannot edit "${target.displayPath}": file changed since it was read`, "FS_STALE_VERSION");
        if (existing.type !== "file") throw new FsError4(`cannot edit "${target.displayPath}": not a regular file`, "FS_NOT_REGULAR_FILE");
        if (expected && existing.version !== expected.version) {
          throw new FsError4(`cannot edit "${target.displayPath}": file changed since it was read`, "FS_STALE_VERSION");
        }
        const original = await readForEdit(target.targetKey, target.displayPath, signal);
        const edited = applyLiteralEdit(original.content, edit.oldString, edit.newString, edit.replaceAll, target.displayPath);
        const content = restoreLineEndings(edited.content, original.lineEndings);
        await transaction.reserveCandidate(Buffer.byteLength(content, "utf8"), contentHash(content));
        await writeFileAtomic(
          target.targetKey,
          content,
          existing.mode,
          signal,
          this.internals,
          void 0,
          (temporary) => transaction.publish(temporary)
        );
        await transaction.stagingCleaned();
        const after = await probe(target.targetKey);
        transaction.record.afterVersion = after?.version;
        await transaction.save();
        return {
          mutationId: transaction.record.id,
          version: this.versionAfterWrite(after, target),
          // The LF-normalized before/after text (the applied-hunk diff basis);
          // line-ending restoration is a storage detail the diff ignores.
          before: original.content,
          after: edited.content
        };
      } finally {
        transaction.close();
      }
    });
  }
  async moveFile(source, destination, expected, signal, policy) {
    this.assertWritable(policy);
    return this.withLock(source.targetKey, async () => {
      const transaction = await RecoveryTransaction.prepare(this.config.recovery, source, policy?.workspaceRoot ?? this.config.cwd, signal, destination, policy?.mode === "danger-full-access");
      try {
        const before = await probe(source.targetKey);
        if (before === null) throw new FsError4("managed move source does not exist", "FS_NOT_FOUND");
        if (expected !== void 0 && before.version !== expected.version) throw new FsError4("managed move source changed", "FS_STALE_VERSION");
        signal?.throwIfAborted();
        await transaction.relocate(destination.targetKey);
        transaction.record.afterVersion = (await probe(destination.targetKey))?.version;
        await transaction.save();
        return mutationSummary(transaction.record);
      } finally {
        transaction.close();
      }
    });
  }
  async removeFile(target, expected, signal, policy) {
    this.assertWritable(policy);
    return this.withLock(target.targetKey, async () => {
      const transaction = await RecoveryTransaction.prepare(this.config.recovery, target, policy?.workspaceRoot ?? this.config.cwd, signal, void 0, policy?.mode === "danger-full-access");
      try {
        const before = await probe(target.targetKey);
        if (before === null) throw new FsError4("managed delete source does not exist", "FS_NOT_FOUND");
        if (expected !== void 0 && before.version !== expected.version) throw new FsError4("managed delete source changed", "FS_STALE_VERSION");
        signal?.throwIfAborted();
        await transaction.relocate();
        return mutationSummary(transaction.record);
      } finally {
        transaction.close();
      }
    });
  }
  /** @param id - operation ID to restore. */
  async restoreMutation(id, signal, policy) {
    this.assertWritable(policy);
    return this.withLock(
      id,
      () => restoreOperation(this.config.recovery, id, policy?.workspaceRoot ?? this.config.cwd, signal, policy?.mode === "danger-full-access")
    );
  }
  async listMutations(policy) {
    const recovery = this.config.recovery;
    if (recovery === void 0) throw new FsError4("recovery storage is not configured", "FS_PROTECTION_UNAVAILABLE");
    const root = resolve4(policy?.workspaceRoot ?? this.config.cwd).toLowerCase();
    return this.withLock(root, async () => (await readMutationRecords(recovery)).filter((record) => record.workspaceRoot.toLowerCase() === root).map(mutationSummary));
  }
  async inspectRecovery(policy) {
    const recovery = this.config.recovery;
    if (recovery === void 0) throw new FsError4("recovery storage is not configured", "FS_PROTECTION_UNAVAILABLE");
    const root = resolve4(policy?.workspaceRoot ?? this.config.cwd).toLowerCase();
    return this.withLock(root, async () => {
      const { records, issues } = await inspectRecoveryRecords(recovery);
      return {
        operations: records.filter((record) => record.workspaceRoot.toLowerCase() === root).map(mutationSummary),
        issues,
        blocked: issues.length > 0
      };
    });
  }
  /* v8 ignore next 5 -- the post-write probe finding the file absent requires a
   * concurrent unlink between rename and stat; fall back to a sentinel version. */
  versionAfterWrite(after, target) {
    if (after) return after.version;
    return FsVersion2(`missing:${target.targetKey}`);
  }
};
var index_default = LocalFileSystem;
export {
  LocalFileSystem,
  index_default as default,
  withProtectedDirectory
};
//# sourceMappingURL=index.js.map
