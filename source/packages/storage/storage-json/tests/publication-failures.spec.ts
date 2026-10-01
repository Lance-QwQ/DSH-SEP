import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeAtomic } from '../src/atomic.ts'

const fault = vi.hoisted(() => {
  const state: { stage: string; primary: unknown; close: unknown; cleanup: unknown; renameFailures: number } = { stage: '', primary: null, close: null, cleanup: null, renameFailures: 0 }
  return state
})
vi.mock('node:fs/promises', async () => {
  const fs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return { ...fs,
    open: async (...args: Parameters<typeof fs.open>) => {
      if (fault.stage === 'open' || (fault.stage === 'directory-open' && args[1] === 'r')) throw fault.primary
      const handle = await fs.open(...args)
      if (fault.stage === 'write') vi.spyOn(handle, 'writeFile').mockImplementation(async () => { throw fault.primary })
      if (fault.stage === 'sync') vi.spyOn(handle, 'sync').mockImplementation(async () => { throw fault.primary })
      if (fault.close !== null || fault.stage === 'close') {
        const close = handle.close.bind(handle)
        vi.spyOn(handle, 'close').mockImplementation(async () => { await close(); throw fault.stage === 'close' ? fault.primary : fault.close })
      }
      return handle
    },
    rename: async (...args: Parameters<typeof fs.rename>) => {
      if (fault.renameFailures-- > 0) throw fault.primary
      return fs.rename(...args)
    },
    rm: async (...args: Parameters<typeof fs.rm>) => {
      if (fault.cleanup !== null) throw fault.cleanup
      return fs.rm(...args)
    },
  }
})
const roots: string[] = []
async function target(): Promise<string> { const root = await mkdtemp(join(tmpdir(), 'json-publication-')); roots.push(root); return join(root, 'state.json') }
afterEach(async () => {
  fault.stage = ''; fault.primary = null; fault.close = null; fault.cleanup = null; fault.renameFailures = 0
  const fs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})
it.each(['open', 'write', 'sync', 'close'])('preserves the %s error and does not publish candidate bytes', async (stage) => {
  const path = await target(); fault.stage = stage; fault.primary = Object.assign(new Error('primary'), { code: 'EIO' })
  await expect(writeAtomic(path, 'candidate', { maxRetries: 2, delayMs: 1 })).rejects.toMatchObject({ code: 'EIO', storagePublish: { stage, published: false, attempts: 0 } })
  await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readdir(roots.at(-1)!)).toEqual([])
})
it('keeps secondary close and cleanup diagnostics without replacing the first error', async () => {
  const path = await target(); fault.stage = 'write'; fault.primary = new Error('first')
  fault.close = Object.assign(new Error('close failed'), { code: 'EBADF' }); fault.cleanup = Object.assign(new Error('cleanup failed'), { code: 'EACCES' })
  await expect(writeAtomic(path, 'candidate', { maxRetries: 0, delayMs: 1 })).rejects.toMatchObject({ message: 'first', storagePublish: { closeError: { stage: 'close', code: 'EBADF', message: 'close failed' }, cleanupError: { stage: 'cleanup', code: 'EACCES', message: 'cleanup failed' } } })
  await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
})
it('wraps non-Error failures and retains non-Error secondary details', async () => {
  const path = await target(); fault.stage = 'write'; fault.primary = 'primary value'; fault.close = 'secondary close'; fault.cleanup = 'secondary cleanup'
  await expect(writeAtomic(path, 'candidate', { maxRetries: 0, delayMs: 1 })).rejects.toMatchObject({ message: 'JSON publication failed', cause: 'primary value', storagePublish: { closeError: { stage: 'close', message: 'secondary close' }, cleanupError: { stage: 'cleanup', message: 'secondary cleanup' } } })
})
it.each(['EPERM', 'EBUSY'])('publishes once after bounded Windows %s rename retries', async (code) => {
  if (process.platform !== 'win32') return
  const path = await target(); fault.primary = Object.assign(new Error('transient'), { code }); fault.renameFailures = 2
  await writeAtomic(path, 'committed', { maxRetries: 2, delayMs: 1 })
  expect(await readFile(path, 'utf8')).toBe('committed'); expect(await readdir(roots.at(-1)!)).toEqual(['state.json'])
})
it('stops retrying when the rename allowance is exhausted', async () => {
  const path = await target(); fault.primary = Object.assign(new Error('busy'), { code: 'EBUSY' }); fault.renameFailures = 10
  await expect(writeAtomic(path, 'candidate', { maxRetries: 2, delayMs: 1 })).rejects.toMatchObject({ code: 'EBUSY', storagePublish: { stage: 'rename', attempts: process.platform === 'win32' ? 3 : 1, published: false } })
  await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
})
it('does not retry a permanent rename error', async () => {
  const path = await target(); fault.primary = Object.assign(new Error('disk'), { code: 'ENOSPC' }); fault.renameFailures = 10
  await expect(writeAtomic(path, 'candidate', { maxRetries: 2, delayMs: 1 })).rejects.toMatchObject({ code: 'ENOSPC', storagePublish: { attempts: 1, published: false } })
})
it('retains published bytes when the POSIX directory durability step fails', async () => {
  const path = await target(), platform = Object.getOwnPropertyDescriptor(process, 'platform')
  if (!platform) throw new Error('platform descriptor missing')
  fault.stage = 'directory-open'; fault.primary = Object.assign(new Error('directory sync unavailable'), { code: 'EIO' })
  // Only the OS branch and failing directory open are substituted; temp write,
  // file sync, atomic rename and the published target are real filesystem work.
  Object.defineProperty(process, 'platform', { ...platform, value: 'linux' })
  try {
    await expect(writeAtomic(path, 'published', { maxRetries: 2, delayMs: 1 })).rejects.toMatchObject({ code: 'EIO', storagePublish: { stage: 'directory-sync', attempts: 1, published: true } })
  } finally { Object.defineProperty(process, 'platform', platform) }
  expect(await readFile(path, 'utf8')).toBe('published'); expect(await readdir(roots.at(-1)!)).toEqual(['state.json'])
})
