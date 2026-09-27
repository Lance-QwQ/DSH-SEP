/** Managed Desktop policy for native plugin-manager mutations, not arbitrary Shell/plugin code. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-jobs'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-plugin-manager'

const protectedPackages = new Set([
  'dsh-enhancement-suite', 'dsh-system-enhancement-package', '@deepseek-ai/dsh-recovery', 'dsh-tool-worker',
  '@deepseek-ai/dsh-task-checkpoint', '@deepseek-ai/dsh-client-ui-settings-memory',
  '@deepseek-ai/dsh-sep-session-migration', 'dsh-sep-plugin-group', 'dsh-sep-context-preparation', 'dsh-sep-trusted-evaluation-entry', 'dsh-sep-brand',
  '@deepseek-ai/dsh-session-log-deepseek', '@deepseek-ai/dsh-session-telemetry-otel',
])
const protectedEntries = new Set(['sep-suite', 'sep-recovery-host', 'sep-continuation', 'sep-memory-ui', 'sep-checkpoint', 'sep-worker', 'sep-brand'])

/** Hold standard Agent/tool admission while the native manager mutates a managed profile. */
export function installSepPluginPolicy(ctx: Context): void {
  let changing = false
  let closing = false
  let admitted = 0
  const assertOpen = (): void => {
    if (closing) throw new Error('SEP_PLUGIN_HOST_CLOSING')
    if (changing) throw new Error('SEP_PLUGIN_CHANGE_ACTIVE')
  }
  const during = async <T>(next: () => Promise<T>): Promise<T> => {
    assertOpen()
    admitted++
    try { return await next() } finally { admitted-- }
  }
  ctx.on('agent/request', (_payload, next) => during(next))
  ctx.on('tools/execute', (_payload, next) => during(next))
  ctx.effect(() => () => { closing = true })
  ctx.provide('pluginManagementPolicy', {
    isProtected: (name, entryId) => protectedEntries.has(entryId?.replace(/^include:/u, '') ?? '')
      || [...protectedPackages].some(pkg => name === pkg || name.startsWith(`${pkg}/`)),
    enter: () => {
      assertOpen()
      const agents = ctx.get('agents')
      const jobs = ctx.get('jobs')
      if (agents === undefined || jobs === undefined) throw new Error('SEP_PLUGIN_TASK_STATE_UNKNOWN')
      const live = agents.list()
      if (admitted > 0 || live.some(agent => agent.status === 'running'
        || agent.inbox.nextTurn.length > 0 || agent.inbox.nextStep.length > 0)
        || [undefined, ...live].some(agent => jobs.list(agent?.id).some(job => job.status === 'running' || job.status === 'stopping'))) {
        throw new Error('SEP_PLUGIN_TASKS_ACTIVE')
      }
      // No await between inspection and admission closure. Read-only inventory and cancellation remain available.
      changing = true
      let released = false
      return () => { if (!released) { released = true; changing = false } }
    },
  })
}
