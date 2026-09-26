import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import LocalJobRegistry from '@deepseek-ai/dsh-jobs-local'
import { expect, it } from 'vitest'
it('issues distinct job identities across independent registry lifetimes', async () => {
  const roots = [new Context(), new Context()]
  try {
    const ids = []
    for (const ctx of roots) {
      await ctx.plugin(AgentRegistry); await ctx.plugin(LocalJobRegistry)
      ctx.jobs.attachController('synthetic')
      ids.push(ctx.jobs.start({ kind: 'bash', label: 'synthetic', run: handle => {
        handle.append('started')
        return { cancel() {}, done: Promise.resolve({ status: 'completed' as const }) }
      } }))
    }
    expect(ids[0]).not.toBe(ids[1])
  } finally { for (const ctx of roots.reverse()) await ctx.fiber.dispose() }
})
