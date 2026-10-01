import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Artifact tier: run after building/packing; DSH_TOOL_WEB_PACKAGE may select an extracted tarball.
const root = process.env.DSH_TOOL_WEB_PACKAGE ?? fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(pathToFileURL(resolve(root, 'package.json')))
const load = name => import(pathToFileURL(require.resolve(name)))
const { Context } = await load('@deepseek-ai/cordis')
const { default: SystemPrompt } = await load('@deepseek-ai/dsh-system-prompt')
const { default: ToolRuntime } = await load('@deepseek-ai/dsh-tools')
const { default: WebRuntime } = await load('@deepseek-ai/dsh-web')
const plugin = await import(pathToFileURL(resolve(root, process.env.DSH_TEST_SOURCE ? 'src/index.ts' : 'lib/index.js')))

test('web_fetch executes its owned worker and bounds the complete untrusted output', async () => {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(WebRuntime, {})
  ctx.web.registerFetchProvider({ id: 'memory', available: () => true,
    fetch: async () => ({ url: 'https://example.invalid/test', statusCode: 200,
      body: { kind: 'text', content: 'remote body '.repeat(100) }, truncated: false,
      rendered: { version: 1, maxOutputChars: 400, text: 'PROVIDER_RENDERED_' + 'x'.repeat(1000), truncated: false } }) })
  const fiber = await ctx.plugin(plugin, { fetchMaxOutputChars: 400 })
  try {
    const result = await ctx.tools.execute({ name: 'web_fetch', arguments: { url: 'https://example.invalid/test' },
      callId: 'worker-regression', signal: new AbortController().signal })
    const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('')
    assert.equal(result.isError, false, text)
    assert.ok(text.includes('External web content follows.'), text)
    assert.ok(text.includes('remote body'), text)
    assert.ok(!text.includes('PROVIDER_RENDERED_'), text)
    assert.ok(text.length <= 400, String(text.length))
  } finally {
    await fiber.dispose()
  }
})
