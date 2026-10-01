import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Artifact tier: run after building/packing; DSH_TOOL_FS_PACKAGE may select an extracted tarball.
const root = process.env.DSH_TOOL_FS_PACKAGE ?? fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(pathToFileURL(resolve(root, 'package.json')))
const load = name => import(pathToFileURL(require.resolve(name)))
const { Context } = await load('@deepseek-ai/cordis')
const { default: SystemPrompt } = await load('@deepseek-ai/dsh-system-prompt')
const { default: ToolRuntime } = await load('@deepseek-ai/dsh-tools')
const { FileSystem } = await load('@deepseek-ai/dsh-fs')
const plugin = await import(pathToFileURL(resolve(root, process.env.DSH_TEST_SOURCE ? 'src/index.ts' : 'lib/index.js')))
class MemoryFs extends FileSystem {
  async resolve(path) { return { targetKey: path, displayPath: path } }
  async writeText() { return { operation: 'update', before: 'old\n', after: 'new\n', version: 'synthetic-version' } }
}

test('a committed write has a worker-generated preview in the installed package', async () => {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(MemoryFs)
  const fiber = await ctx.plugin(plugin)
  try {
    const result = await ctx.tools.execute({ name: 'write', arguments: { file_path: 'memory.txt', content: 'new\n' },
      callId: 'worker-regression', signal: new AbortController().signal })
    const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('')
    assert.equal(result.isError, false, text)
    assert.equal(result.meta.commit.committed, true)
    assert.equal(result.meta.diffPresentation.status, 'ready', JSON.stringify(result.meta))
    assert.equal(result.meta.diffs.length, 1)
    assert.equal(result.meta.diffs[0].path, 'memory.txt')
  } finally {
    await fiber.dispose()
  }
})
