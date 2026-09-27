import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { expect, it, vi } from 'vitest'
import * as WorkspaceChanges from '../src/index.ts'

it('keeps human questions responsive while preserving the snapshot barrier for other tools', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-question-priority-'))
  const ctx = new Context()
  const release = Promise.withResolvers<void>()
  try {
    await ctx.plugin(SessionStore)
    await ctx.plugin(LocalSubprocessRuntime)
    const resolver = vi.spyOn(ctx.subprocess, 'resolveExecutable').mockImplementation(async () => {
      await release.promise
      throw new Error('synthetic unavailable git')
    })
    await ctx.plugin(WorkspaceChanges)
    const session = ctx.sessions.create(SessionId('question-priority'), { meta: { cwd } })
    session.append('turn/start', { turn: 1 })
    await vi.waitFor(() => expect(resolver).toHaveBeenCalled())
    let mutationAllowed = false
    const mutating = ctx.waterfall('tools/pre-execute', { agent: { session }, name: 'write' } as never, async () => {
      mutationAllowed = true
      return { kind: 'allow' as const }
    })
    const question = ctx.waterfall('tools/pre-execute', { agent: { session }, name: 'ask_user_question' } as never,
      async () => ({ kind: 'deny' as const, reason: 'downstream policy still runs' }))
    await expect(question).resolves.toEqual({ kind: 'deny', reason: 'downstream policy still runs' })
    expect(mutationAllowed).toBe(false)
    release.resolve()
    await mutating
    expect(mutationAllowed).toBe(true)
  } finally {
    release.resolve()
    await ctx.fiber.dispose()
    vi.restoreAllMocks()
    await rm(cwd, { recursive: true, force: true })
  }
})
