import { Context } from '@deepseek-ai/cordis'
import { boot } from '@deepseek-ai/dsh-app-boot'
import { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { generationLogPath } from '../src/format.ts'

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !root.includes('sep-v4-migration-')) throw Error('Unsafe test cleanup')
    await rm(root, { recursive: true, force: true })
  }
})
const taskId = '00000000-0000-4000-8000-000000000001'
const scope = (sessionId: string) => ({ schema: 1, taskId, sessionId, agentId: sessionId, project: 'C:\\synthetic' })
const create = (sessionId: string) => ({ type: 'task/checkpoint-change', data: { ...scope(sessionId), revision: 1, action: 'create', objective: 'synthetic migration', steps: [{ id: 'one', description: 'write', acceptance: 'hash', artifacts: [{ path: 'result.txt', sha256: 'a'.repeat(64) }] }] } })
const operation = (intentSeq: number) => ({ id: '00000000-0000-4000-8000-000000000002', stepId: 'one', tool: 'file_write', argumentsHash: 'b'.repeat(64), outerCallId: 'outer', innerCallId: 'inner', intentSeq, state: 'prepared', resultCode: '', artifacts: [] })
const prepare = (id: string, intentSeq: number) => ({ type: 'task/checkpoint-change', data: { ...scope(id), revision: 2, action: 'prepare', operation: operation(intentSeq) } })
const settle = (id: string, intentSeq: number) => ({ type: 'task/checkpoint-change', data: { ...scope(id), revision: 3, action: 'settle', operation: { ...operation(intentSeq), state: 'uncertain', resultCode: 'RESPONSE_LOST' } } })
const recovery = () => ({ type: 'recovery/continuation', ignorable: true, data: { recoveryFromTaskId: taskId, recoveryPlanHash: 'c'.repeat(64), recoveryRequestId: 'request', recoveryProjectId: '00000000-0000-4000-8000-000000000003', recoveryProjectGeneration: 1 } })
type Row = { type: string; data: object; ignorable?: boolean }
async function identity(path: string) {
  const info = await stat(path, { bigint: true })
  return { bytes: await readFile(path), dev: info.dev, ino: info.ino, mtime: info.mtimeNs, ctime: info.ctimeNs }
}
async function fixture(rows: Row[], version = 3) {
  const root = await mkdtemp(join(tmpdir(), 'sep-v4-migration-')); roots.push(root)
  const id = SessionId('parent')
  async function put(sessionId: string, events: Row[], parent?: string) {
    const path = generationLogPath(root, undefined, SessionId(sessionId), version, 'none')
    const header = { type: 'session', version, id: sessionId, createdAt: 1, ...(version >= 2 ? { isSeeded: false } : {}), delegationDepth: parent ? 1 : 0, ...(parent ? { parentSession: parent, origin: 'subagent' } : {}) }
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(header) + '\n' + events.map((e, seq) => JSON.stringify({ ...e, seq, time: seq + 2 }) + '\n').join(''))
    return path
  }
  const path = await put(id, rows)
  async function mount() {
    const config = join(root, 'test-cordis.yml')
    await writeFile(config, JSON.stringify([{ id: 'persistence', name: 'cordis:sep-jsonl', config: { root, compression: 'none' } }]))
    return boot('sep-migration', config, [], ctx => {
      contexts.push(ctx)
      ctx.loader.builtins['sep-jsonl'] = JsonlSessionPersistence
    })
  }
  return { root, id, path, put, mount }
}

describe('SEP migration through a real Loader and JSONL service', () => {
  it('publishes a V4 successor, preserves V3 bytes and uncertain operations, then reopens independently', async () => {
    const f = await fixture([create('parent'), prepare('parent', 1), settle('parent', 1), recovery()])
    const before = await identity(f.path), ctx = await f.mount()
    const reader = await ctx.sessionPersistence.open(f.id, 'read')
    const prepared = await reader.read(); await reader.close()
    expect(await identity(f.path)).toEqual(before)
    expect(await readdir(dirname(f.path))).toEqual(['session.v3.jsonl'])
    expect(prepared.events.map(e => e.type)).toEqual(['task/checkpoint-change', 'task/checkpoint-change', 'task/checkpoint-change', 'recovery/continuation'])
    expect(prepared.events[2]).toMatchObject({ data: { operation: { state: 'uncertain', resultCode: 'RESPONSE_LOST' } } })
    const writer = await ctx.sessionPersistence.open(f.id, 'write'); expect(writer.header.version).toBe(4); await writer.close()
    expect(await identity(f.path)).toEqual(before)
    const independent = await f.mount(), reopened = await independent.sessionPersistence.open(f.id, 'read')
    expect((await reopened.read()).events).toEqual(prepared.events); await reopened.close()
  })
  it('rebases persisted task intent references when upstream inserts an interrupted turn end', async () => {
    const f = await fixture([create('parent'), { type: 'turn/start', data: { turn: 1 } }, { type: 'agent/inbox/spliced', data: { target: 'next-turn', inserted: [{ id: 'next', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'continue' }] }] } }, { type: 'turn/start', data: { turn: 2 } }, prepare('parent', 4), settle('parent', 4)])
    const ctx = await f.mount(), writer = await ctx.sessionPersistence.open(f.id, 'write'), result = await writer.read(); await writer.close()
    expect(result.events[5]).toMatchObject({ type: 'task/checkpoint-change', data: { operation: { intentSeq: 5 } } })
    expect(result.events[6]).toMatchObject({ data: { operation: { intentSeq: 5, state: 'uncertain' } } })
  })
  it('discovers a child containing required SEP events without silently degrading its descriptor', async () => {
    const f = await fixture([create('parent')])
    await f.put('child', [create('child'), { type: 'subagent/descriptor', data: { version: 3, mode: 'continuable', provider: 'spawn', label: 'SEP child' } }], 'parent')
    const ctx = await f.mount(), reader = await ctx.sessionPersistence.open(f.id, 'read'), result = await reader.read(); await reader.close()
    expect(result.events.find(e => e.type === 'subagent/catalog')).toMatchObject({ data: { childId: 'child', mode: 'continuable', label: 'SEP child' } })
    expect(result.events[0]).toMatchObject({ type: 'task/checkpoint-change' })
  })
  it.each([
    ['unknown required', [{ type: 'unknown/required', data: {} }]],
    ['revision gap', [create('parent'), { ...prepare('parent', 1), data: { ...prepare('parent', 1).data, revision: 4 } }]],
    ['requiredness changed', [{ ...create('parent'), ignorable: true }]],
  ] satisfies [string, Row[]][])('refuses %s without publishing or changing the source', async (_name, events) => {
    const f = await fixture(events), before = await identity(f.path), ctx = await f.mount()
    await expect(ctx.sessionPersistence.open(f.id, 'write').then(async handle => { await handle.close(); return 'unexpected successful publication' })).rejects.toThrow()
    expect(await identity(f.path)).toEqual(before)
    expect((await readdir(dirname(f.path))).filter(n => n !== 'session.lock')).toEqual(['session.v3.jsonl'])
  })
  it('refuses migration when another stored header is unreadable and child coverage is unknown', async () => {
    const f = await fixture([]), bad = await f.put('unreadable', [], 'parent')
    await writeFile(bad, '{broken-header}\n')
    const ctx = await f.mount()
    await expect(ctx.sessionPersistence.open(f.id, 'write').then(async handle => { await handle.close(); return 'unexpected successful publication' })).rejects.toThrow(/coverage|header|corrupt/i)
    expect((await readdir(dirname(f.path))).filter(n => n !== 'session.lock')).toEqual(['session.v3.jsonl'])
  })
  it.each([0, 1, 2])('preserves existing SEP events through the complete V%i to V4 chain', async version => {
    const f = await fixture([create('parent'), prepare('parent', 1), settle('parent', 1), recovery()], version)
    const before = await identity(f.path), ctx = await f.mount(), writer = await ctx.sessionPersistence.open(f.id, 'write')
    expect(writer.header.version).toBe(4)
    expect((await writer.read()).events).toMatchObject([{ type: 'task/checkpoint-change' }, { data: { operation: { state: 'prepared', intentSeq: 1 } } }, { data: { operation: { state: 'uncertain', intentSeq: 1 } } }, { type: 'recovery/continuation', ignorable: true }])
    await writer.close(); expect(await identity(f.path)).toEqual(before)
  })
  it('cancellation before open neither publishes a target nor changes source bytes', async () => {
    const f = await fixture([create('parent')]), before = await identity(f.path), ctx = await f.mount()
    const cancel = new AbortController(); cancel.abort(new Error('synthetic cancellation'))
    await expect(ctx.sessionPersistence.open(f.id, 'write', { signal: cancel.signal })).rejects.toThrow('synthetic cancellation')
    expect(await identity(f.path)).toEqual(before)
    expect((await readdir(dirname(f.path))).filter(n => n !== 'session.lock')).toEqual(['session.v3.jsonl'])
  })
})
