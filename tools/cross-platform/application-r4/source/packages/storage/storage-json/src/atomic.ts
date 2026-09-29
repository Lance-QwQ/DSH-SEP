/**
 * Atomic whole-file replacement for the JSON backend.
 *
 * Publish protocol: write a same-directory temp file, fsync it, then
 * `rename()` over the target. Rename is an atomic replace on POSIX and on
 * Windows (libuv maps it to `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)`),
 * and replacement is the intended semantic here — unlike the session-log
 * backend's link()+unlink() no-clobber protocol, a unit file has exactly one
 * writer per process and last-write-wins is correct. After the rename the
 * parent directory is fsynced on POSIX so the new entry is crash-durable.
 * @module @deepseek-ai/dsh-storage-json/src/atomic
 */

import { open, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

/** Bounded Windows rename recovery; retries never repeat serialization or a business callback. */
export interface RenameRetryOptions {
  /** Additional attempts after the first rename. */
  maxRetries: number
  /** Linear backoff base; retry n waits n times this value. */
  delayMs: number
}

/** Publication progress attached to the original native error. */
export interface JsonPublishFailure {
  /** Last failed I/O operation. */
  stage: 'open' | 'write' | 'sync' | 'close' | 'rename' | 'directory-sync'
  /** Number of rename calls, excluding preparation I/O. */
  attempts: number
  /** True once rename has published the target, even if durability confirmation failed. */
  published: boolean
  /** A failed cleanup can leave a private same-directory temporary file. */
  cleanupError?: { stage: 'cleanup'; code?: string; message: string }
  /** A failed close while handling an earlier failure must not replace that error. */
  closeError?: { stage: 'close'; code?: string; message: string }
}

/**
 * Durably replace `path` with `data`.
 * @param path - Absolute target file path.
 * @param data - Full new file content.
 * @param retry - Validated Windows rename retry policy.
 * @returns resolution after the replacement is crash-durable.
 */
export async function writeAtomic(path: string, data: string, retry: RenameRetryOptions): Promise<void> {
  const tmp = join(dirname(path), `.${randomUUID()}.tmp`)
  const progress: JsonPublishFailure = { stage: 'open', attempts: 0, published: false }
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(tmp, 'wx', 0o600)
    progress.stage = 'write'
    await handle.writeFile(data, 'utf8')
    progress.stage = 'sync'
    await handle.sync()
    progress.stage = 'close'
    const completed = handle
    handle = undefined
    await completed.close()
    progress.stage = 'rename'
    for (;;) {
      progress.attempts++
      try {
        await rename(tmp, path)
        break
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (process.platform !== 'win32' || (code !== 'EPERM' && code !== 'EBUSY') || progress.attempts > retry.maxRetries) throw error
        await delay(retry.delayMs * progress.attempts)
      }
    }
    progress.published = true
    progress.stage = 'directory-sync'
    await fsyncDirectory(dirname(path), progress)
  } catch (error) {
    if (handle) {
      try { await handle.close() } catch (closeError) {
        progress.closeError = describeSecondary('close', closeError)
      }
    }
    if (!progress.published) {
      try { await rm(tmp, { force: true }) } catch (cleanupError) {
        progress.cleanupError = describeSecondary('cleanup', cleanupError)
      }
    }
    // Native I/O errors retain their identity, code, syscall and stack. Secondary
    // cleanup diagnostics contain no payload and never replace the first error.
    const failure = error instanceof Error ? error : new Error('JSON publication failed', { cause: error })
    throw Object.assign(failure, { storagePublish: progress })
  }
}

function describeSecondary<S extends 'close' | 'cleanup'>(stage: S, error: unknown): { stage: S; code?: string; message: string } {
  const code = (error as NodeJS.ErrnoException).code
  return { stage, ...(typeof code === 'string' ? { code } : {}), message: error instanceof Error ? error.message : String(error) }
}

/** fsync a POSIX directory so a just-renamed entry is crash-durable. */
/* v8 ignore start -- Windows rejects O_RDONLY directory opens; POSIX coverage exercises this. */
async function fsyncDirectory(path: string, progress: JsonPublishFailure): Promise<void> {
  if (process.platform === 'win32') return
  const handle = await open(path, 'r')
  try {
    await handle.sync()
  } catch (error) {
    try { await handle.close() } catch (closeError) {
      progress.closeError = describeSecondary('close', closeError)
    }
    throw error
  }
  await handle.close()
}
/* v8 ignore stop */
