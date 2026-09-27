import { Context } from '@deepseek-ai/cordis'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'

it('refuses an unprotected standard file write without changing the source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sep-protection-')), ctx = new Context(), file = join(root, '中文.txt')
  try {
    await writeFile(file, 'original')
    await ctx.plugin(LocalFileSystem, { cwd: root })
    const target = await ctx.fs.resolve(file)
    await expect(ctx.fs.writeText(target, 'changed')).rejects.toMatchObject({ code: 'FS_PROTECTION_UNAVAILABLE' })
    expect(await readFile(file, 'utf8')).toBe('original')
  } finally {
    await ctx.fiber.dispose()
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !root.includes('sep-protection-')) throw Error('Unsafe test cleanup')
    await rm(root, { recursive: true, force: true })
  }
})
