/** Managed Desktop policy for native plugin-manager mutations, not arbitrary Shell/plugin code. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-jobs'
import type {} from '@deepseek-ai/dsh-tools'
import type { BundleRowInfo, ManagedBundleRuntime, PluginEntryId } from '@deepseek-ai/dsh-plugin-manager'

const protectedPackages = new Set([
  'dsh-enhancement-suite', 'dsh-system-enhancement-package', '@deepseek-ai/dsh-recovery', 'dsh-tool-worker',
  '@deepseek-ai/dsh-task-checkpoint', '@deepseek-ai/dsh-client-ui-settings-memory',
  '@deepseek-ai/dsh-sep-session-migration', 'dsh-sep-plugin-group', 'dsh-sep-context-preparation', 'dsh-sep-trusted-evaluation-entry', 'dsh-sep-brand',
  '@deepseek-ai/dsh-session-log-deepseek', '@deepseek-ai/dsh-session-telemetry-otel',
])
const protectedEntries = new Set(['sep-suite', 'sep-recovery-host', 'sep-continuation', 'sep-memory-ui', 'sep-checkpoint', 'sep-worker', 'sep-brand'])

const managedRows = [
  { rowId: 'sep-suite', moduleName: 'dsh-system-enhancement-package' },
  { rowId: 'sep-memory-ui', moduleName: '@deepseek-ai/dsh-client-ui-settings-memory' },
  { rowId: 'sep-computer-click', moduleName: 'dsh-system-enhancement-package/computer-click' },
] as const

/** Describe only the current package's fixed managed entries, never generic installed/protected packages. */
function describeSepRuntime(ctx: Context, name: string): ManagedBundleRuntime | undefined {
  if (name !== 'dsh-system-enhancement-package') return undefined
  let rows: BundleRowInfo[] = managedRows.map(row => ({ ...row }))
  try {
    const entries = [...ctx.get('loader')?.entries() ?? []]
    const matches = managedRows.map(row => entries.filter(entry => entry.options.id === row.rowId))
    rows = managedRows.map((row, index) => {
      const candidates = matches[index]!
      return { ...row, ...(candidates.length === 1 ? { entryId: candidates[0]!.id as PluginEntryId } : {}) }
    })
    const cores = matches[0]!
    const runtime = (state: ManagedBundleRuntime['state']): ManagedBundleRuntime => ({ kind: 'sep', state, rows })
    if (cores.length !== 1) return runtime('unknown')
    const core = cores[0]!
    if (core.disabled) return runtime('disabled')
    // Cordis FiberState values match the host inventory's public phase mapping.
    switch (core.fiber?.state) {
      case 0: case 1: return runtime('starting')
      case 5: return runtime('stopping')
      case 3: return runtime('failed')
      case 2: break
      default: return runtime('unknown')
    }
    const service = ctx.get('suiteEnhancements') as unknown as { enabled?: unknown; modules?: unknown } | undefined
    if (service?.enabled === false) return runtime('disabled')
    if (service?.enabled !== true) return runtime('unknown')
    const modules = service.modules
    if (modules !== null && typeof modules === 'object'
      && Object.values(modules).some(state => state === 'failed' || state === 'degraded')) return runtime('degraded')
    return runtime('active')
  } catch {
    // Missing lifecycle evidence must not be promoted to active; no private diagnostics are sent to clients.
    return { kind: 'sep', state: 'unknown', rows }
  }
}

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
    describeManagedRuntime: name => describeSepRuntime(ctx, name),
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
