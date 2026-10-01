import { expect, it } from 'vitest'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AGENT_A, setup } from './helpers.ts'

const host = `
let release;
harness.handle('wait', () => new Promise(resolve => { release = resolve; }));
harness.handle('release', async () => { release('settled'); return true; });
harness.handle('fail', async () => { throw new Error('synthetic-handler-failure'); });
harness.handle('echo', async value => value);
return { name: 'inflight-probe', apply() {} };
`
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'cordis-inflight-')), store = join(root, 'drafts'), project = join(root, 'project')
  await mkdir(store); await mkdir(project)
  const harness = await setup({ persistence: { root: store, projectRoot: project, maxVersionBytes: 1048576, maxTotalBytes: 16777216, maxPlugins: 16, maxVersions: 16, maxPendingFiles: 8 } })
  const defined = harness.runner.define({ sessionId: AGENT_A.id, plugin: { kind: 'new', idPrefix: 'dyn' }, name: 'inflight', purpose: 'synthetic lifecycle', code: { host } })
  const run = await harness.runner.run(AGENT_A, defined.pluginId, defined.packageId, 'run')
  if (!run.ok) throw new Error(run.message)
  return { ...harness, ...defined, run, async close() { await harness.ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) } }
}
it('keeps stop, undefine, new activation and saved-source writes out of an active handler', async () => {
  const f = await fixture(), { runner, pluginId, packageId, run } = f
  try {
    const waiting = runner.invoke(pluginId, run.pluginRunId, 'wait', null)
    try {
      await expect(runner.stop(AGENT_A, pluginId)).resolves.toMatchObject({ ok: false, reason: 'transition-in-flight' })
      await expect(runner.undefine(AGENT_A, pluginId)).resolves.toMatchObject({ ok: false, reason: 'transition-in-flight' })
      await expect(runner.run(AGENT_A, pluginId, packageId, 'run')).resolves.toMatchObject({ ok: false, reason: 'transition-in-flight' })
      await expect(runner.savePackage(AGENT_A, { pluginId, packageId })).rejects.toThrow('work in flight')
    } finally { await runner.invoke(pluginId, run.pluginRunId, 'release', null); await waiting }
    await expect(waiting).resolves.toEqual({ ok: true, value: 'settled' })
    await expect(runner.stop(AGENT_A, pluginId)).resolves.toEqual({ ok: true })
    await expect(runner.invoke(pluginId, run.pluginRunId, 'echo', 'late')).resolves.toMatchObject({ ok: false, code: 'plugin-not-running' })
  } finally { await f.close() }
})
it('releases the active-call count after a handler failure', async () => {
  const f = await fixture()
  try {
    await expect(f.runner.invoke(f.pluginId, f.run.pluginRunId, 'fail', null)).resolves.toMatchObject({ ok: false, code: 'handler-error' })
    await expect(f.runner.undefine(AGENT_A, f.pluginId)).resolves.toMatchObject({ ok: true })
  } finally { await f.close() }
})
it('fences runtime transitions while a source operation is pending and releases them after rejection', async () => {
  const f = await fixture()
  try {
    // The existing minimal Agent fixture has no writable persistence authority.
    // Its real asynchronous save rejection still owns the source-operation slot.
    const saving = f.runner.savePackage(AGENT_A, { pluginId: f.pluginId, packageId: f.packageId }).catch(error => error)
    const invoking = f.runner.invoke(f.pluginId, f.run.pluginRunId, 'echo', 'during')
    const stopping = f.runner.stop(AGENT_A, f.pluginId)
    const undefining = f.runner.undefine(AGENT_A, f.pluginId)
    await expect(invoking).resolves.toMatchObject({ ok: false, code: 'transition-in-flight' })
    await expect(stopping).resolves.toMatchObject({ ok: false, reason: 'transition-in-flight' })
    await expect(undefining).resolves.toMatchObject({ ok: false, reason: 'transition-in-flight' })
    expect(await saving).toBeInstanceOf(Error)
    await expect(f.runner.invoke(f.pluginId, f.run.pluginRunId, 'echo', 'after')).resolves.toEqual({ ok: true, value: 'after' })
    await expect(f.runner.stop(AGENT_A, f.pluginId)).resolves.toEqual({ ok: true })
  } finally { await f.close() }
})