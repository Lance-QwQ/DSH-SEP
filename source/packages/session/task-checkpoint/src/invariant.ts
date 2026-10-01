/** Required task-stream invariant companion. @module @deepseek-ai/dsh-task-checkpoint/invariant */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import { foldTasks } from './fold.ts'

/** Cordis companion name. */
export const name = 'task-checkpoint-invariant'
/** Invariant registry dependency. */
export const inject = ['invariants']

const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  const check = (session: import('@deepseek-ai/dsh-session').Session): void => {
    try { foldTasks(session.snapshotEvents(), 16 * 1024 * 1024) }
    catch (error) { fail(`required task stream is invalid: ${String(error)}`) }
  }
  for (const session of ctx.sessions.list()) check(session)
  ctx.on('session/created', check, { global: true })
  ctx.on('session/event', (session, event) => {
    if (event.type === 'task/checkpoint-change') check(session)
  }, { global: true })
}, { inject: ['sessions'] })

/** Register strict revision, identity and permanent-cancellation checks.
 * @param ctx - context carrying the invariant registry.
 * @returns the companion registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register('@deepseek-ai/dsh-task-checkpoint', install))
