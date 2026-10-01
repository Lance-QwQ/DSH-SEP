/** Windows handle ownership for recoverable ordinary-file mutations. @module */
import { dirname, isAbsolute, join, parse, resolve, toNamespacedPath } from 'node:path'
import { randomUUID } from 'node:crypto'
import { lstat, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { FsError } from '@deepseek-ai/dsh-fs'

type Handle = bigint
interface Api {
  create(path: string, access: number, share: number, security: null, disposition: number, flags: number, template: null): Handle
  info(handle: Handle, buffer: Buffer): number
  streams(handle: Handle, kind: number, buffer: Buffer, length: number): number
  volume(handle: Handle, name: null, nameSize: number, serial: null, max: null, flags: null, fs: Buffer, fsSize: number): number
  rename(handle: Handle, kind: number, buffer: Buffer, size: number): number
  times(handle: Handle, creation: null, access: Buffer, write: Buffer): number
  close(handle: Handle): number
  error(): number
}
let apiPromise: Promise<Api> | undefined

async function api(): Promise<Api> {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new FsError('protected file mutations require the verified Windows x64 NTFS backend', 'FS_PROTECTION_UNAVAILABLE')
  }
  return apiPromise ??= (async () => {
    const koffi = (await import('koffi')).default
    const library = koffi.load('kernel32.dll')
    return {
      create: library.func('void * __stdcall CreateFileW(const char16_t *, uint32_t, uint32_t, void *, uint32_t, uint32_t, void *)') as Api['create'],
      info: library.func('int __stdcall GetFileInformationByHandle(void *, void *)') as Api['info'],
      streams: library.func('int __stdcall GetFileInformationByHandleEx(void *, int, void *, uint32_t)') as Api['streams'],
      volume: library.func('int __stdcall GetVolumeInformationByHandleW(void *, void *, uint32_t, void *, void *, void *, void *, uint32_t)') as Api['volume'],
      rename: library.func('int __stdcall SetFileInformationByHandle(void *, int, void *, uint32_t)') as Api['rename'],
      times: library.func('int __stdcall SetFileTime(void *, void *, void *, void *)') as Api['times'],
      close: library.func('int __stdcall CloseHandle(void *)') as Api['close'],
      error: library.func('uint32_t __stdcall GetLastError()') as Api['error'],
    }
  })()
}

function failed(handle: Handle): boolean {
  return !handle || handle === -1n || handle === 0xffffffffffffffffn
}

function failure(operation: string, code: number): FsError {
  return new FsError(`${operation} failed (Win32 ${code}); file protection did not widen access`, 'FS_UNSAFE_TARGET')
}

/** Held file ownership: foreign write/delete opens cannot coexist with this handle. */
export class ProtectedFileHandle {
  private constructor(private readonly native: Api, private handle: Handle) {}

  /** Open an existing ordinary single-link NTFS file.
   * @param path - absolute local path with held ancestors.
   * @returns owned file handle, or undefined for absence.
   */
  static async open(path: string): Promise<ProtectedFileHandle | undefined> {
    const native = await api()
    // GENERIC_READ | DELETE; share READ only. Renames use this same DELETE-capable handle.
    const handle = native.create(toNamespacedPath(path), 0x80010100, 1, null, 3, 0x02200000, null)
    if (failed(handle)) {
      const code = native.error()
      if (code === 2 || code === 3) return undefined
      throw failure('open protected target', code)
    }
    const owned = new ProtectedFileHandle(native, handle)
    try {
      const info = Buffer.alloc(52)
      if (!native.info(handle, info)) throw failure('inspect protected target', native.error())
      if ((info.readUInt32LE(0) & 0x10) !== 0) throw new FsError('mutation target is not a regular file', 'FS_NOT_REGULAR_FILE')
      // Reparse points, directories, EFS, sparse/compressed files and offline files are not promised.
      if ((info.readUInt32LE(0) & (0x400 | 0x10 | 0x4000 | 0x200 | 0x800 | 0x1000)) !== 0 || info.readUInt32LE(40) !== 1) {
        throw new FsError('protected mutations require an ordinary single-link file without reparse, encrypted, compressed or sparse data', 'FS_UNSAFE_TARGET')
      }
      const filesystem = Buffer.alloc(64)
      if (!native.volume(handle, null, 0, null, null, null, filesystem, 32)
        || filesystem.toString('utf16le').replace(/\0.*$/s, '') !== 'NTFS') {
        throw new FsError('protected mutations require a local NTFS volume', 'FS_UNSAFE_TARGET')
      }
      // FileStreamInfo: reject named streams instead of dropping them during byte restoration.
      const streams = Buffer.alloc(65536)
      if (!native.streams(handle, 7, streams, streams.length)) throw failure('inspect file streams', native.error())
      const nameLength = streams.readUInt32LE(4)
      if (streams.readUInt32LE(0) !== 0 || streams.toString('utf16le', 24, 24 + nameLength) !== '::$DATA') {
        throw new FsError('protected mutations do not support alternate data streams', 'FS_UNSAFE_TARGET')
      }
      return owned
    } catch (error) {
      owned.close()
      throw error
    }
  }

  /** Move the held object to a non-existing name; never resolves the old path again.
   * @param destination - absent same-volume destination with held ancestors.
   */
  rename(destination: string): void {
    // Windows permits CreateHardLink even with our sharing flags. Reject links
    // observed here; the object is never edited in place, including if a link
    // is created after this inspection. This is not an atomic link-count CAS.
    const info = Buffer.alloc(52)
    if (!this.native.info(this.handle, info)) throw failure('reinspect held target', this.native.error())
    if (info.readUInt32LE(40) !== 1) throw new FsError('a hard link appeared during the protected mutation', 'FS_UNSAFE_TARGET')
    // Match CreateFileW's extended-length path handling without replacing the
    // held source handle or weakening the no-replace rename decision.
    const name = Buffer.from(toNamespacedPath(resolve(destination)), 'utf16le')
    // Windows x64 FILE_RENAME_INFO: BOOLEAN@0, HANDLE@8, DWORD@16, WCHAR[]@20.
    const data = Buffer.alloc(24 + name.length)
    data.writeUInt32LE(name.length, 16)
    name.copy(data, 20)
    if (!this.native.rename(this.handle, 3, data, data.length)) throw failure('rename held target without replacement', this.native.error())
  }

  /** Restore captured times through the owned handle without reopening a raced path.
   * @param accessMs - captured last-access milliseconds since Unix epoch.
   * @param writeMs - captured last-write milliseconds since Unix epoch.
   */
  setTimes(accessMs: number, writeMs: number): void {
    const fileTime = (milliseconds: number): Buffer => {
      const buffer = Buffer.alloc(8)
      buffer.writeBigUInt64LE(BigInt(Math.round(milliseconds * 10000)) + 116444736000000000n)
      return buffer
    }
    if (!this.native.times(this.handle, null, fileTime(accessMs), fileTime(writeMs))) throw failure('restore file times', this.native.error())
  }

  /** Release exactly this owned handle. */
  close(): void {
    if (this.handle === 0n) return
    const held = this.handle
    this.handle = 0n
    if (!this.native.close(held)) throw failure('close protected target', this.native.error())
  }
}

/** Hold ancestors against deletion/rename; create missing directories one level at a time.
 * @param paths - absolute local file paths whose ancestors must remain stable.
 * @param createParents - whether missing ancestors may be created.
 * @returns release function that reports native close failures.
 */
export async function lockDirectories(paths: readonly string[], createParents: boolean): Promise<() => void> {
  const native = await api()
  const held: Handle[] = []
  const seen = new Set<string>()
  const downgrade = (index: number, path: string): void => {
    const replacement = native.create(toNamespacedPath(path), 0x80, 1, null, 3, 0x02200000, null)
    if (failed(replacement)) throw failure('retain stable ancestor identity', native.error())
    const previous = held[index]
    if (previous === undefined) throw new FsError('protected directory ownership is missing', 'FS_UNSAFE_TARGET')
    held[index] = replacement
    if (!native.close(previous)) throw failure('release exclusive ancestor inspection', native.error())
  }
  const release = (): void => {
    const errors: FsError[] = []
    for (const handle of held.splice(0).reverse()) {
      if (!native.close(handle)) errors.push(failure('close protected ancestor', native.error()))
    }
    if (errors.length > 0) throw new AggregateError(errors, 'protected ancestor handles could not all be released')
  }
  try {
    for (const path of paths) {
      if (!isAbsolute(path) || path.startsWith('\\\\') || path.includes(':', 2)) {
        throw new FsError('protected paths must be local absolute drive paths without streams', 'FS_UNSAFE_TARGET')
      }
      const chain: string[] = []
      let directory = dirname(path)
      while (true) {
        chain.unshift(directory)
        const parent = dirname(directory)
        if (parent === directory) break
        directory = parent
      }
      let prior: { index: number; path: string } | undefined
      for (const item of chain) {
        const key = item.toLowerCase()
        if (seen.has(key)) continue
        // A data-reading directory handle enforces sharing during acquisition.
        // Attribute-only handles do not block in-place reparse conversion.
        let handle = native.create(toNamespacedPath(item), 0x80000000, 1, null, 3, 0x02200000, null)
        if (failed(handle)) {
          const code = native.error()
          if (!createParents || (code !== 2 && code !== 3) || item === parse(item).root) throw failure(`lock ancestor ${item}`, code)
          await mkdir(item).catch((error: unknown) => { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error })
          handle = native.create(toNamespacedPath(item), 0x80000000, 1, null, 3, 0x02200000, null)
          if (failed(handle)) throw failure('lock created ancestor', native.error())
        }
        held.push(handle)
        const info = Buffer.alloc(52)
        if (!native.info(handle, info)) throw failure('inspect ancestor', native.error())
        if ((info.readUInt32LE(0) & 0x400) !== 0 || (info.readUInt32LE(0) & 0x10) === 0) {
          throw new FsError('protected mutations refuse reparse-point ancestors', 'FS_UNSAFE_TARGET')
        }
        // The held child makes its parent nonempty and cannot itself be unlinked.
        if (prior !== undefined) downgrade(prior.index, prior.path)
        prior = { index: held.length - 1, path: item }
        seen.add(key)
      }
      if (prior !== undefined) {
        // A held delete-on-close marker keeps the leaf nonempty. This permits
        // ordinary child renames while NTFS refuses setting a junction in place.
        // The OS removes the marker on normal release and process termination.
        const marker = join(prior.path, `.dsh-protect-${randomUUID()}.lock`)
        const guard = native.create(toNamespacedPath(marker), 0x80010000, 1, null, 1, 0x04200080, null)
        if (failed(guard)) throw failure('pin protected directory contents', native.error())
        held.push(guard)
        downgrade(prior.index, prior.path)
      }
    }
    return release
  } catch (error) {
    release()
    throw error
  }
}

/** Identify the reserved zero-byte directory-guard names; callers still verify their metadata.
 * @param name - one directory entry basename.
 * @returns whether the basename belongs to the native directory-guard namespace.
 */
export function isDirectoryGuard(name: string): boolean {
  return /^\.dsh-protect-[0-9a-f-]{36}\.lock$/.test(name)
}

/** Exclusive live-process ownership of a recovery directory; a crash releases the OS lock.
 * @param path - lock file inside an already held recovery directory.
 * @returns release function for the owned OS handle.
 */
export async function lockRecoveryFile(path: string): Promise<() => void> {
  const native = await api()
  const handle = native.create(toNamespacedPath(path), 0xc0000000, 1, null, 4, 0x00200080, null)
  if (failed(handle)) throw failure('lock recovery directory', native.error())
  try {
    const info = Buffer.alloc(52)
    if (!native.info(handle, info)) throw failure('inspect directory lock', native.error())
    if ((info.readUInt32LE(0) & (0x400 | 0x10 | 0x4000 | 0x200 | 0x800 | 0x1000)) !== 0
      || info.readUInt32LE(40) !== 1 || info.readUInt32LE(32) !== 0 || info.readUInt32LE(36) !== 0) {
      throw new FsError('directory lock must be an empty ordinary single-link file', 'FS_UNSAFE_TARGET')
    }
    const streams = Buffer.alloc(65536)
    if (!native.streams(handle, 7, streams, streams.length)) throw failure('inspect directory lock streams', native.error())
    if (streams.readUInt32LE(0) !== 0 || streams.toString('utf16le', 24, 24 + streams.readUInt32LE(4)) !== '::$DATA') {
      throw new FsError('directory lock must not contain alternate streams', 'FS_UNSAFE_TARGET')
    }
  } catch (error) {
    if (!native.close(handle)) throw new AggregateError([error, failure('close rejected directory lock', native.error())], 'directory lock validation and cleanup failed')
    throw error
  }
  return () => { if (!native.close(handle)) throw failure('close recovery lock', native.error()) }
}

/** Hold an exclusive native lease on one preexisting dedicated local NTFS directory.
 * The reserved `.dsh-directory.lock` file remains as an empty marker after release;
 * ownership is the live OS handle, never its existence, a PID or an expiry time.
 * This lease grants no filesystem authority or recovery policy to the callback.
 * @param root - preexisting dedicated directory; volume/home roots and aliases are refused.
 * @param operation - work that independently uses its current permissions while the lease is held.
 * @returns the callback result after all owned handles have been released.
 */
export async function withProtectedDirectory<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const native = await api()
  if (typeof root !== 'string' || !root.trim() || !isAbsolute(root) || root.startsWith('\\\\') || root.startsWith('//') || root.includes(':', 2)
    || resolve(root).toLowerCase() === parse(resolve(root)).root.toLowerCase()
    || resolve(root).toLowerCase() === resolve(homedir()).toLowerCase()) {
    throw new FsError('directory lease requires a dedicated local absolute root', 'FS_UNSAFE_TARGET')
  }
  const rootHandle = native.create(toNamespacedPath(root), 0x80, 7, null, 3, 0x02200000, null)
  if (failed(rootHandle)) throw failure('inspect directory lease root', native.error())
  try {
    const info = Buffer.alloc(52)
    if (!native.info(rootHandle, info)) throw failure('inspect directory lease root', native.error())
    if ((info.readUInt32LE(0) & 0x10) === 0 || (info.readUInt32LE(0) & 0x400) !== 0) {
      throw new FsError('directory lease requires an ordinary directory', 'FS_UNSAFE_TARGET')
    }
    const filesystem = Buffer.alloc(64)
    if (!native.volume(rootHandle, null, 0, null, null, null, filesystem, 32)
      || filesystem.toString('utf16le').replace(/\0.*$/s, '') !== 'NTFS') {
      throw new FsError('directory lease requires local NTFS storage', 'FS_UNSAFE_TARGET')
    }
  } finally { if (!native.close(rootHandle)) throw failure('close directory preflight', native.error()) }
  const path = join(root, '.dsh-directory.lock')
  const releaseDirectories = await lockDirectories([path], false)
  let releaseLock: (() => void) | undefined
  let originalError: unknown
  let rejected = false
  try {
    releaseLock = await lockRecoveryFile(path)
    // The lock handle denies write/delete opens, while the ancestor chain pins
    // its name. Metadata inspection therefore observes the held lock object.
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size !== 0) {
      throw new FsError('reserved directory lock must be an empty single-link regular file', 'FS_UNSAFE_TARGET')
    }
    return await operation()
  } catch (error) {
    originalError = error
    rejected = true
    throw error
  } finally {
    const errors: unknown[] = []
    try { releaseLock?.() } catch (error) { errors.push(error) }
    try { releaseDirectories() } catch (error) { errors.push(error) }
    if (errors.length > 0) throw new AggregateError(rejected ? [originalError, ...errors] : errors, 'directory lease cleanup failed')
  }
}
