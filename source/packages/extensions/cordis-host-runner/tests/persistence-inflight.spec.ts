import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Timer from '@deepseek-ai/cordis-plugin-timer'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRegistry from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import LocalSandboxProvider from '@deepseek-ai/dsh-sandbox-local'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import SandboxPwshExecutor from '@deepseek-ai/dsh-pwsh-sandbox'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import PermissionPresetService from '@deepseek-ai/dsh-permission-presets'
import DynamicCordisRunnerService from '../src/index.ts'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rename, rm, realpath } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const gate = vi.hoisted(() => ({
  directory: undefined as string | undefined,
  reached: undefined as ((paths: { source: string; destination: string }) => void) | undefined,
  proceed: undefined as Promise<void> | undefined,
}))
vi.mock('node:fs/promises', async () => {
  const fs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return { ...fs, link: async (...args: Parameters<typeof fs.link>) => {
    const source = String(args[0]), destination = String(args[1])
    if (gate.directory === dirname(destination) && basename(source).startsWith('.pending-')) {
      gate.reached?.({ source, destination })
      await gate.proceed
    }
    return fs.link(...args)
  } }
})

const contexts: Context[] = [], roots: string[] = []
afterEach(async () => {
  gate.directory = undefined; gate.reached = undefined; gate.proceed = undefined
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function compose(project: string, store: string) {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(Timer)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRegistry)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(LocalSandboxProvider)
  await ctx.plugin(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: project })
  await ctx.plugin(SandboxPwshExecutor, { cwd: project })
  await ctx.plugin(ApprovalService, { policy: 'ask' })
  await ctx.plugin(PermissionPresetService, { defaultPreset: 'workspace-write' })
  await ctx.plugin(DynamicCordisRunnerService, { persistence: { root: store, projectRoot: project,
    maxVersionBytes: 1048576, maxTotalBytes: 16777216, maxPlugins: 16, maxVersions: 16, maxPendingFiles: 8 } })
  // A real idle Agent and Session: no model turn or shell command is executed.
  const agent = await ctx.agentLoop.create(SessionId('persist-inflight'), {}, { cwd: project })
  expect(ctx.permissionPresets.current(agent.session)).toBe('workspace-write')
  expect(ctx.permissionPresets.resolve('workspace-write')).toMatchObject({ sandbox: 'workspace-write', approval: 'ask' })
  return { ctx, agent, runner: ctx.dynamicCordisRunner }
}

it.skipIf(process.platform !== 'win32' || process.arch !== 'x64')('fences transitions during a real protected source save and cold-loads exact committed bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cordis-persistence-inflight-')); roots.push(root)
  const project = join(root, 'project'), store = join(root, 'drafts')
  await mkdir(project); await mkdir(store)
  const f = await compose(project, store)
  const host = "harness.handle('echo', async value => value); return { name: 'persistent-inflight', apply() {} };"
  const defined = f.runner.define({ sessionId: f.agent.id, plugin: { kind: 'new', idPrefix: 'store' },
    name: 'Persistence concurrency', purpose: 'Synthetic source publication', code: { host } })
  const run = await f.runner.run(f.agent, defined.pluginId, defined.packageId, 'run')
  if (!run.ok) throw new Error(run.message)

  const reached = Promise.withResolvers<{ source: string; destination: string }>(), release = Promise.withResolvers<void>()
  gate.directory = store; gate.reached = reached.resolve; gate.proceed = release.promise
  const saving = f.runner.savePackage(f.agent, { pluginId: defined.pluginId, packageId: defined.packageId })
  // Reject promptly on an unexpected save error instead of waiting for the gate timeout.
  const boundary = await Promise.race([reached.promise, saving.then(() => { throw new Error('save bypassed the publication gate') })])
  let staged: Buffer
  try {
    staged = await readFile(boundary.source)
    await expect(readFile(boundary.destination)).rejects.toMatchObject({ code: 'ENOENT' })
    // This is the real NTFS directory lease, not a substituted protection callback.
    await expect(rename(store, join(root, 'moved-drafts'))).rejects.toHaveProperty('code')
    await expect(f.runner.stop(f.agent, defined.pluginId)).resolves.toMatchObject({ ok: false, reason: 'transition-in-flight' })
    await expect(f.runner.undefine(f.agent, defined.pluginId)).resolves.toMatchObject({ ok: false, reason: 'transition-in-flight' })
    await expect(f.runner.invoke(defined.pluginId, run.pluginRunId, 'echo', 'during')).resolves.toMatchObject({ ok: false, code: 'transition-in-flight' })
    await expect(f.runner.run(f.agent, defined.pluginId, defined.packageId, 'run')).resolves.toMatchObject({ ok: false, reason: 'transition-in-flight' })
  } finally { release.resolve() }
  const saved = await saving
  gate.directory = undefined
  // The same directory can move again once the genuine native lease is released.
  await rename(store, join(root, 'moved-drafts'))
  await rename(join(root, 'moved-drafts'), store)
  expect(saved).toMatchObject({ status: 'saved', active: false, version: 1 })
  expect(await readFile(boundary.destination)).toEqual(staged)
  await expect(readFile(boundary.source)).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(f.runner.invoke(defined.pluginId, run.pluginRunId, 'echo', 'after')).resolves.toEqual({ ok: true, value: 'after' })

  // Authority is still enforced by the actual service when the saved scope changes.
  f.ctx.permissionPresets.set(f.agent.session, 'danger-full-access')
  await expect(f.runner.savePackage(f.agent, { pluginId: defined.pluginId, packageId: defined.packageId,
    durableId: saved.durableId, expectedVersion: saved.version })).rejects.toThrow('Cordis saved Plugin is not bound to this current Session')
  expect(await readFile(boundary.destination)).toEqual(staged)
  f.ctx.permissionPresets.set(f.agent.session, 'workspace-write')
  await expect(f.runner.stop(f.agent, defined.pluginId)).resolves.toEqual({ ok: true })
  await expect(f.runner.undefine(f.agent, defined.pluginId)).resolves.toMatchObject({ ok: true })
  await f.ctx.fiber.dispose()

  // A new service tree reads disk, with no old runtime registry or binding cache.
  const cold = await compose(project, store)
  const listed = await cold.runner.listSaved(cold.agent)
  expect(listed).toContainEqual(saved)
  const loaded = await cold.runner.loadSaved(cold.agent, { durableId: saved.durableId, version: saved.version, sha256: saved.sha256 })
  expect(loaded).toMatchObject({ status: 'loaded', active: false, sha256: saved.sha256 })
  expect(cold.runner.inspectPackage(cold.agent, loaded.pluginId, loaded.packageId).code).toEqual({ host })
  const scope = { sessionId: String(cold.agent.id), projectRoot: (await realpath(project)).toLowerCase(),
    storeRoot: (await realpath(store)).toLowerCase(), permission: { preset: 'workspace-write', sandbox: 'workspace-write', approval: 'ask' } }
  const content = { scope, name: 'Persistence concurrency', purpose: 'Synthetic source publication', code: { host } }
  const digest = createHash('sha256').update(JSON.stringify(content)).digest('hex')
  expect(digest).toBe(saved.sha256)
  const expected = { schemaVersion: 1, format: 'cordis-js-function-body-v1', durableId: saved.durableId,
    version: 1, sha256: digest, ...content }
  expect(await readFile(boundary.destination, 'utf8')).toBe(JSON.stringify(expected) + '\n')
  expect((await readdir(store)).filter(name => name.endsWith('.json'))).toEqual([basename(boundary.destination)])
})
