import { Context } from '@deepseek-ai/cordis'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import type { Config } from '../src/index.ts'
import { FsVersion } from '@deepseek-ai/dsh-fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'

let root: string, workspace: string, recoveryRoot: string, file: string, ctx: Context
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sep-protection-'))
  workspace = join(root, 'workspace'); recoveryRoot = join(root, 'recovery'); file = join(workspace, '中文.txt')
  await mkdir(workspace); await mkdir(recoveryRoot); await writeFile(file, 'original original')
  ctx = new Context()
})
afterEach(async () => {
  await ctx.fiber.dispose()
  if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !root.includes('sep-protection-')) throw Error('Unsafe test cleanup')
  await rm(root, { recursive: true, force: true })
})
function recovery() {
  return { root: recoveryRoot, maxFileBytes: 1024, maxTotalBytes: 1048576, maxEntries: 3, retentionMs: 1 }
}
async function mount(config: Config = {}) {
  await ctx.plugin(LocalFileSystem, { cwd: workspace, ...config })
  return ctx.fs.resolve(file)
}
async function records(): Promise<string[]> {
  return (await readdir(recoveryRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name)
}

it('keeps ordinary native writes and edits available without recovery configuration', async () => {
  const target = await mount()
  const written = await ctx.fs.writeText(target, 'native')
  expect(written.mutationId).toBeUndefined()
  const edited = await ctx.fs.editText(target, { oldString: 'native', newString: 'edited', replaceAll: false })
  expect(edited.mutationId).toBeUndefined()
  expect(await readFile(file, 'utf8')).toBe('edited')
  await expect(ctx.fs.writeText(target, 'stale', { kind: 'replaceIfVersion', version: written.version })).rejects.toMatchObject({ code: 'FS_STALE_VERSION' })
})
it('fails closed for explicitly managed writes and edits when recovery configuration is missing', async () => {
  const target = await mount({ requireRecovery: true })
  await expect(ctx.fs.writeText(target, 'changed')).rejects.toMatchObject({ code: 'FS_PROTECTION_UNAVAILABLE' })
  await expect(ctx.fs.editText(target, { oldString: 'original', newString: 'changed', replaceAll: true })).rejects.toMatchObject({ code: 'FS_PROTECTION_UNAVAILABLE' })
  expect(await readFile(file, 'utf8')).toBe('original original')
})
it('does not fall back to native writes when configured recovery storage is unavailable', async () => {
  await rm(recoveryRoot, { recursive: true })
  const target = await mount({ recovery: recovery(), requireRecovery: false })
  await expect(ctx.fs.writeText(target, 'changed')).rejects.toMatchObject({ code: 'FS_PROTECTION_UNAVAILABLE' })
  await expect(readdir(recoveryRoot)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(file, 'utf8')).toBe('original original')
})
it.skipIf(process.platform === 'win32' && process.arch === 'x64')('rejects explicitly configured protection on unsupported platforms', async () => {
  const target = await mount({ recovery: recovery() })
  await expect(ctx.fs.writeText(target, 'changed')).rejects.toMatchObject({ code: 'FS_PROTECTION_UNAVAILABLE' })
})

describe.skipIf(process.platform !== 'win32' || process.arch !== 'x64')('protected Windows mutations', () => {
  it('protects configured writes even when requireRecovery is omitted', async () => {
    const target = await mount({ recovery: recovery() })
    const result = await ctx.fs.writeText(target, 'changed')
    expect(result.mutationId).toBeTypeOf('string')
    expect(await readFile(join(recoveryRoot, result.mutationId!, 'before.bin'), 'utf8')).toBe('original original')
    expect((await ctx.fs.listMutations())[0]?.state).toBe('committed')
  })
  it('rejects stale writes before creating any durable backup or consuming entry quota', async () => {
    const target = await mount({ recovery: recovery() })
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(ctx.fs.writeText(target, 'stale', { kind: 'replaceIfVersion', version: FsVersion('stale') })).rejects.toMatchObject({ code: 'FS_STALE_VERSION' })
      expect(await records()).toEqual([])
    }
    await ctx.fs.writeText(target, 'accepted')
    expect(await records()).toHaveLength(1)
  })
  it('rejects create guards and literal edit failures before creating backups', async () => {
    const target = await mount({ recovery: recovery() })
    await expect(ctx.fs.writeText(target, 'blind', { kind: 'createIfAbsent' })).rejects.toMatchObject({ code: 'FS_NOT_OBSERVED' })
    expect(await records()).toEqual([])
    await expect(ctx.fs.editText(target, { oldString: 'missing', newString: 'x', replaceAll: false })).rejects.toMatchObject({ code: 'FS_EDIT_NOT_FOUND' })
    expect(await records()).toEqual([])
    await expect(ctx.fs.editText(target, { oldString: 'original', newString: 'x', replaceAll: false })).rejects.toMatchObject({ code: 'FS_AMBIGUOUS_EDIT' })
    expect(await records()).toEqual([])
    expect(await readFile(file, 'utf8')).toBe('original original')
  })
  it('rejects oversized candidates before persisting a prepared operation', async () => {
    const target = await mount({ recovery: recovery() })
    await expect(ctx.fs.writeText(target, 'x'.repeat(1025))).rejects.toMatchObject({ code: 'FS_BACKUP_LIMIT' })
    expect(await records()).toEqual([])
  })
  it('backs up only the winner of competing guarded writes', async () => {
    const target = await mount({ recovery: recovery() })
    const current = await ctx.fs.stat(target)
    if (!current) throw Error('missing fixture')
    const outcomes = await Promise.allSettled(['first', 'second'].map(content => ctx.fs.writeText(target, content, { kind: 'replaceIfVersion', version: current.version })))
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.find(outcome => outcome.status === 'rejected')).toMatchObject({ reason: { code: 'FS_STALE_VERSION' } })
    expect(await records()).toHaveLength(1)
  })
  it('keeps the original held against competing writers through candidate staging', async () => {
    const target = await mount({ recovery: recovery() })
    const local = ctx.fs as LocalFileSystem
    local.internals.inspectTemp = async () => {
      await expect(writeFile(file, 'external')).rejects.toHaveProperty('code')
      expect(await readFile(file, 'utf8')).toBe('original original')
    }
    await ctx.fs.writeText(target, 'accepted')
    expect(await readFile(file, 'utf8')).toBe('accepted')
  })
  it('retains recovery history when committed staging cleanup fails', async () => {
    const target = await mount({ recovery: recovery() })
    const local = ctx.fs as LocalFileSystem
    local.internals.removeStagingDir = async () => { throw Error('injected cleanup failure') }
    await expect(ctx.fs.writeText(target, 'committed')).rejects.toThrow()
    const [id] = await records()
    expect(id).toBeTypeOf('string')
    expect(await readFile(join(recoveryRoot, id!, 'before.bin'), 'utf8')).toBe('original original')
    expect(await readFile(file, 'utf8')).toBe('committed')
    expect((await ctx.fs.listMutations())[0]?.state).toBe('committed')
  })
  it('restores the captured preimage through the same protected transaction', async () => {
    const target = await mount({ recovery: recovery() })
    const written = await ctx.fs.writeText(target, 'changed')
    if (!written.mutationId) throw Error('missing recovery ID')
    const restored = await ctx.fs.restoreMutation(written.mutationId)
    expect(restored.state).toBe('restored')
    expect(await readFile(file, 'utf8')).toBe('original original')
    expect(await records()).toHaveLength(2)
  })
  it('retains both the competing creation and the uncertain publication record', async () => {
    const target = await mount({ recovery: recovery() })
    const absent = await ctx.fs.resolve(join(workspace, 'new.txt'))
    const local = ctx.fs as LocalFileSystem
    local.internals.inspectTemp = async () => { await writeFile(absent.targetKey, 'competing creator') }
    await expect(ctx.fs.writeText(absent, 'candidate', { kind: 'createIfAbsent' })).rejects.toMatchObject({ code: 'FS_NOT_OBSERVED' })
    expect(await readFile(absent.targetKey, 'utf8')).toBe('competing creator')
    expect(await readFile(target.targetKey, 'utf8')).toBe('original original')
    expect(await records()).toHaveLength(1)
    expect((await ctx.fs.listMutations())[0]?.state).toBe('conflict')
  })
  it('rejects an aborted request without creating a backup', async () => {
    const target = await mount({ recovery: recovery() })
    await expect(ctx.fs.writeText(target, 'aborted', undefined, AbortSignal.abort())).rejects.toMatchObject({ code: 'FS_ABORTED' })
    expect(await records()).toEqual([])
    expect(await readFile(file, 'utf8')).toBe('original original')
  })
  it('rejects a restore conflict without adding another unrecoverable preimage', async () => {
    const target = await mount({ recovery: recovery() })
    const written = await ctx.fs.writeText(target, 'changed')
    if (!written.mutationId) throw Error('missing recovery ID')
    await writeFile(file, 'external change')
    await expect(ctx.fs.restoreMutation(written.mutationId)).rejects.toMatchObject({ code: 'FS_RECOVERY_CONFLICT' })
    expect(await records()).toEqual([written.mutationId])
    expect(await readFile(file, 'utf8')).toBe('external change')
  })
  it('rejects stale moves and deletions before consuming backup quota', async () => {
    const target = await mount({ recovery: recovery() })
    const destination = await ctx.fs.resolve(join(workspace, 'moved.txt'))
    await expect(ctx.fs.moveFile(target, destination, { version: FsVersion('stale') })).rejects.toMatchObject({ code: 'FS_STALE_VERSION' })
    expect(await records()).toEqual([])
    await expect(ctx.fs.removeFile(target, { version: FsVersion('stale') })).rejects.toMatchObject({ code: 'FS_STALE_VERSION' })
    expect(await records()).toEqual([])
  })
})

