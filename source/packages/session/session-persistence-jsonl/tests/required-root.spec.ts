import { Context } from '@deepseek-ai/cordis'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, readdir, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { meta } from '../../session-persistence/tests/contract.ts'

let temporary: string, root: string, ctx: Context
beforeEach(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'dsh-required-root-'))
  root = join(temporary, 'sessions')
  ctx = new Context()
})
afterEach(async () => {
  await ctx.fiber.dispose()
  await rm(temporary, { recursive: true, force: true })
})
it('still creates a missing root for the default native provider', async () => {
  await ctx.plugin(JsonlSessionPersistence, { root })
  const handle = await ctx.sessionPersistence.create(meta('native-root'))
  await handle.flush()
  await handle.close()
  expect(await readdir(root)).not.toEqual([])
})
it('refuses a missing explicitly required root without recreating it', async () => {
  await expect(ctx.plugin(JsonlSessionPersistence, { root, requireExistingRoot: true })).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readdir(root)).rejects.toMatchObject({ code: 'ENOENT' })
})
it('refuses writes after an explicitly required root disappears', async () => {
  await mkdir(root)
  await ctx.plugin(JsonlSessionPersistence, { root, requireExistingRoot: true })
  await rm(root, { recursive: true })
  await expect(ctx.sessionPersistence.create(meta('missing-root'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readdir(root)).rejects.toMatchObject({ code: 'ENOENT' })
})
it('rejects replacement of the required root before cached handle operations', async () => {
  await mkdir(root)
  await ctx.plugin(JsonlSessionPersistence, { root, requireExistingRoot: true })
  const handle = await ctx.sessionPersistence.create(meta('replaced-root'))
  await handle.flush()
  await rename(root, join(temporary, 'original'))
  await mkdir(root)
  await expect(handle.flush()).rejects.toMatchObject({ code: 'SESSION_ROOT_IDENTITY_CHANGED' })
  expect(await readdir(root)).toEqual([])
  await rm(root, { recursive: true })
  await rename(join(temporary, 'original'), root)
  await handle.close()
})
