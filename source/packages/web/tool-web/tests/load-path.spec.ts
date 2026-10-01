/**
 * Real Loader-path guard for an injected namespace plugin. A default export would make
 * `unwrapExports` collapse the namespace and drop `inject`, causing access to `ctx.web` to fail.
 * Hand-built mounting bypasses that path, so this test unwraps through the real Loader first; see
 * postmortem 0001.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as toolWeb from '@deepseek-ai/dsh-tool-web'

describe('dsh-tool-web real-load-path guard', () => {
  it('has no default export and keeps name/inject/Config through unwrapExports', () => {
    expect('default' in toolWeb).toBe(false)

    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(toolWeb) as Record<string, unknown>
    expect(unwrapped).toBe(toolWeb)
    expect(unwrapped.name).toBe('tool-web')
    expect(unwrapped.inject).toEqual(['tools', 'web', 'systemPrompt'])
    expect(typeof unwrapped.apply).toBe('function')
  })

  it('boots over ctx.web through the unwrapped module without an inject error', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(WebRuntime, {})

    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(toolWeb) as Parameters<Context['plugin']>[0]
    // Mounting the collapsed shape would throw for missing injection here.
    const fiber = await ctx.plugin(unwrapped)
    expect(ctx.tools.schemas().map(s => s.name)).toEqual(expect.arrayContaining(['web_search', 'web_fetch']))
    await fiber.dispose()
  })
})

// Actual Loader entries exercise namespace unwrapping, config parsing and injection.
it('executes and unloads the fetch worker through a real Loader composition', async () => {
  const ctx = new Context()
  await ctx.plugin(Loader, { baseUrl: import.meta.url })
  Object.assign(ctx.loader.builtins, { systemPrompt: SystemPrompt, tools: ToolRuntime, web: WebRuntime, toolWeb })
  try {
    for (const name of ['systemPrompt', 'tools', 'web']) await ctx.loader.create({ name: 'cordis:' + name, config: {} })
    ctx.web.registerFetchProvider({ id: 'memory', available: () => true,
      fetch: async request => ({ url: request.url, statusCode: 200, body: { kind: 'text', content: 'loader body' }, truncated: false }) })
    const entry = await ctx.loader.create({ name: 'cordis:toolWeb', config: { fetchMaxOutputChars: 400 } })
    await ctx.loader.await()
    const result = await ctx.tools.execute({ name: 'web_fetch', arguments: { url: 'https://example.invalid/loader' },
      callId: ToolCallId('loader-fetch'), signal: new AbortController().signal })
    expect(result.isError).toBe(false)
    expect(result.content).toEqual([{ type: 'text', text: expect.stringContaining('loader body') }])
    await ctx.loader.update(entry, { disabled: true })
    await ctx.loader.await()
    expect(ctx.tools.get('web_fetch')).toBeUndefined()
  } finally {
    await ctx.fiber.dispose()
  }
})
