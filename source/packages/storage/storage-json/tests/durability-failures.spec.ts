import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { JsonStorageBackend } from '../src/index.ts'

const fault = vi.hoisted(() => {
  const state: { afterPublish: boolean; recordWrite: boolean; markerAccess: boolean } = { afterPublish: false, recordWrite: false, markerAccess: false }
  return state
})
vi.mock('../src/atomic.ts', async () => {
  const original = await vi.importActual<typeof import('../src/atomic.ts')>('../src/atomic.ts')
  return { ...original, writeAtomic: async (...args: Parameters<typeof original.writeAtomic>) => {
    if (fault.recordWrite && args[0].endsWith('item.json')) throw Object.assign(new Error('record write failed'), { code: 'EIO' })
    await original.writeAtomic(...args)
    if (fault.afterPublish) { fault.afterPublish = false; throw Object.assign(new Error('durability unconfirmed'), { code: 'EIO', storagePublish: { published: true, stage: 'directory-sync' } }) }
  } }
})
vi.mock('node:fs/promises', async () => {
  const fs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return { ...fs, lstat: async (...args: Parameters<typeof fs.lstat>) => {
    if (fault.markerAccess && String(args[0]).endsWith('.sep-bootstrap.pending.json')) throw Object.assign(new Error('marker access denied'), { code: 'EACCES' })
    return fs.lstat(...args)
  } }
})
const roots: string[] = []
async function root(): Promise<string> { const path = await mkdtemp(join(tmpdir(), 'json-durability-')); roots.push(path); return path }
afterEach(async () => {
  fault.afterPublish = false; fault.recordWrite = false; fault.markerAccess = false
  const fs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  for (const path of roots.splice(0)) await fs.rm(path, { recursive: true, force: true })
})
const descriptor = { name: 'unit', version: 1, tables: ['t'], hasGlobal: false }
it('blocks a single-unit handle and queued writes after publication durability becomes unknown', async () => {
  const path = await root(), backend = new JsonStorageBackend(path)
  const unit = await backend.kv.open(descriptor); fault.afterPublish = true
  const first = unit.putRecord('t', 'a', { committed: true }), second = unit.putRecord('t', 'b', { shouldNotRun: true })
  const results = await Promise.allSettled([first, second]); expect(results.map(r => r.status)).toEqual(['rejected', 'rejected'])
  await expect(unit.loadAll()).rejects.toMatchObject({ storagePublish: { published: true } })
  await expect(unit.putRecord('t', 'c', {})).rejects.toThrow('durability unconfirmed')
  await backend.close()
  const reopened = new JsonStorageBackend(path), reader = await reopened.kv.open(descriptor)
  expect(await reader.loadAll()).toEqual({ tables: { t: { a: { committed: true } } }, global: null })
  await reopened.close()
})
it('retains the original legacy file and refuses an incomplete per-record bootstrap', async () => {
  const path = await root(), legacy = JSON.stringify({ unit: { name: 'unit', version: 1 }, global: null, tables: { t: { item: { original: true } } } })
  await writeFile(join(path, 'unit.json'), legacy); const backend = new JsonStorageBackend(path)
  const unit = await backend.kv.open({ ...descriptor, layout: 'per-record' }); fault.recordWrite = true
  await expect(unit.loadAll()).rejects.toMatchObject({ code: 'EIO' }); await backend.close(); fault.recordWrite = false
  const reopened = new JsonStorageBackend(path), reader = await reopened.kv.open({ ...descriptor, layout: 'per-record' })
  await expect(reader.loadAll()).rejects.toMatchObject({ code: 'malformed-medium' })
  await expect(reader.putRecord('t', 'new', {})).rejects.toMatchObject({ code: 'malformed-medium' })
  expect(await readFile(join(path, 'unit.json'), 'utf8')).toBe(legacy)
  expect(JSON.parse(await readFile(join(path, 'unit', '.sep-bootstrap.pending.json'), 'utf8')).unit).toBe('unit')
  await reopened.close()
})
it('does not treat an unreadable bootstrap marker as absence', async () => {
  const path = await root(), backend = new JsonStorageBackend(path), unit = await backend.kv.open({ ...descriptor, layout: 'per-record' })
  fault.markerAccess = true
  await expect(unit.loadAll()).rejects.toMatchObject({ code: 'EACCES' }); await backend.close()
})
it('rejects malformed legacy record maps before materializing a partial tree', async () => {
  const path = await root(), legacy = JSON.stringify({ unit: { name: 'unit', version: 1 }, tables: { t: [] } })
  await writeFile(join(path, 'unit.json'), legacy); const backend = new JsonStorageBackend(path), unit = await backend.kv.open({ ...descriptor, layout: 'per-record' })
  await expect(unit.loadAll()).rejects.toMatchObject({ code: 'malformed-medium' })
  await expect(readFile(join(path, 'unit', '.sep-bootstrap.pending.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(join(path, 'unit.json'), 'utf8')).toBe(legacy); await backend.close()
})