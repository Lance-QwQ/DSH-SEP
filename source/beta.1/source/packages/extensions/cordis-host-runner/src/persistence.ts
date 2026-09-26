/** Bounded immutable drafts, published only after a complete synced write. @module */
import { createHash, randomUUID } from 'node:crypto'
import type { Stats } from 'node:fs'
import { link, lstat, open, opendir, realpath, unlink } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-permission-presets'
import { withProtectedDirectory } from '@deepseek-ai/dsh-fs-local'
import { z } from 'zod'
import { precheckCode } from './sandbox.ts'
import type DynamicCordisRunnerService from './index.ts'
import type { CordisDynamicPackageId, CordisDynamicPluginId } from './types.ts'
import type {
  CordisSavedPluginId, LoadSavedRequest, LoadedPackageReceipt, PersistenceConfig,
  SavePackageRequest, SavedPackageReceipt, SavedPackageListing, UnavailableSavedPackage,
} from './persistence-types.ts'

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const versionFile = new RegExp(`^(${uuid})\\.([1-9][0-9]*)\\.json$`)
const pendingFile = new RegExp(`^\\.pending-${uuid}$`)
const guardFile = /^\.dsh-protect-[0-9a-f-]+\.lock$/
const scopeSchema = z.object({
  sessionId: z.string().min(1), projectRoot: z.string().min(1), storeRoot: z.string().min(1),
  permission: z.object({ preset: z.string().min(1), sandbox: z.string().min(1), approval: z.string().min(1) }).strict(),
}).strict()
const envelopeSchema = z.object({
  schemaVersion: z.literal(1), format: z.literal('cordis-js-function-body-v1'),
  durableId: z.string().regex(new RegExp(`^${uuid}$`)), version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sha256: z.string().regex(/^[0-9a-f]{64}$/), scope: scopeSchema,
  name: z.string().min(1), purpose: z.string().min(1),
  code: z.object({ host: z.string().optional(), client: z.string().optional() }).strict()
    .refine(code => code.host !== undefined || code.client !== undefined, 'a source half is required'),
}).strict()
type Envelope = z.infer<typeof envelopeSchema>
type Scope = z.infer<typeof scopeSchema>
interface Binding {
  agent: Agent
  pluginId: CordisDynamicPluginId
  scope: Scope
  versions: Map<number, { packageId: CordisDynamicPackageId; sha256: string }>
}

function digest(value: Pick<Envelope, 'scope' | 'name' | 'purpose' | 'code'>): string {
  return createHash('sha256').update(JSON.stringify({ scope: value.scope, name: value.name, purpose: value.purpose, code: value.code })).digest('hex')
}
function equalScope(a: Scope, b: Scope): boolean { return JSON.stringify(a) === JSON.stringify(b) }
function receipt(row: Envelope): SavedPackageReceipt {
  return { status: 'saved', active: false, durableId: row.durableId as CordisSavedPluginId,
    version: row.version, sha256: row.sha256, name: row.name, purpose: row.purpose,
    hasHostHalf: row.code.host !== undefined, hasClientHalf: row.code.client !== undefined }
}

/** Private storage owner; all runtime work delegates to the existing Runner. */
export class PackagePersistence {
  private readonly bindings = new Map<CordisSavedPluginId, Binding>()
  private readonly busy = new Set<CordisDynamicPluginId>()
  private readonly active = new Set<Promise<unknown>>()
  private closed = false
  constructor(private readonly ctx: Context, private readonly runner: DynamicCordisRunnerService,
    private readonly config: PersistenceConfig,
    private readonly assertIdle: (pluginId: CordisDynamicPluginId) => void) {
    if (!isAbsolute(config.root) || !isAbsolute(config.projectRoot)) throw new Error('Cordis persistence needs explicit absolute root and projectRoot')
    for (const key of ['maxVersionBytes', 'maxTotalBytes', 'maxPlugins', 'maxVersions', 'maxPendingFiles'] as const) {
      if (!Number.isSafeInteger(config[key]) || config[key] <= 0) throw new Error(`Cordis persistence ${key} must be a positive safe integer`)
    }
    if (config.maxTotalBytes < config.maxVersionBytes) throw new Error('Cordis persistence total budget must fit one version')
    if (!Number.isSafeInteger(config.maxPlugins * config.maxVersions + config.maxPendingFiles + 2)) throw new Error('Cordis persistence entry budget is not a safe integer')
    ctx.effect(() => async () => { this.closed = true; await Promise.allSettled([...this.active]) }, 'cordis saved-source operations')
  }

  /** Whether a source operation presently owns this live Plugin.
   * @param pluginId - exact current registry identity.
   * @returns whether lifecycle transitions and new calls must wait.
   */
  isBusy(pluginId: CordisDynamicPluginId): boolean { return this.busy.has(pluginId) }

  private operate<T>(pluginId: CordisDynamicPluginId | undefined, job: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Cordis persistence owner is disposed'))
    if (pluginId !== undefined) {
      if (this.busy.has(pluginId)) return Promise.reject(new Error('Cordis Plugin has a source operation in flight'))
      this.assertIdle(pluginId)
      this.busy.add(pluginId)
    }
    const task = Promise.resolve().then(job)
    this.active.add(task)
    return task.finally(() => { this.active.delete(task); if (pluginId !== undefined) this.busy.delete(pluginId) })
  }

  /** Recheck authority at every native activation entry, including the Client panel.
   * @param agent - current bound Session owner.
   * @param pluginId - exact current registry identity.
   */
  assertActivation(agent: Agent, pluginId: CordisDynamicPluginId): void {
    const bound = [...this.bindings.values()].find(binding => binding.pluginId === pluginId)
    if (bound === undefined) return
    const permissions = this.ctx.get('permissionPresets')
    if (bound.agent !== agent || permissions === undefined) throw new Error('Cordis saved Plugin current Session or permission scope changed')
    const preset = permissions.current(agent.session), spec = permissions.resolve(preset)
    if (JSON.stringify({ preset, sandbox: spec.sandbox, approval: spec.approval }) !== JSON.stringify(bound.scope.permission)) throw new Error('Cordis saved Plugin permission scope changed')
  }

  /** Recheck the bound current owner after an asynchronous activation boundary.
   * @param pluginId - exact current registry identity.
   */
  assertActivationCurrent(pluginId: CordisDynamicPluginId): void {
    const bound = [...this.bindings.values()].find(binding => binding.pluginId === pluginId)
    if (bound !== undefined) this.assertActivation(bound.agent, pluginId)
  }

  private async scope(agent: Agent): Promise<Scope> {
    const permissions = this.ctx.get('permissionPresets')
    if (permissions === undefined) throw new Error('Cordis persistence requires the current permission service')
    if (agent.id !== agent.session.id || agent.session.header.cwd === undefined) throw new Error('Cordis persistence requires a current Session with project metadata')
    const project = await realpath(this.config.projectRoot)
    if ((await realpath(agent.session.header.cwd)).toLowerCase() !== project.toLowerCase()) throw new Error('Cordis persistence project conflict')
    const preset = permissions.current(agent.session)
    const spec = permissions.resolve(preset)
    if (spec.sandbox !== 'workspace-write' && spec.sandbox !== 'danger-full-access') throw new Error('Cordis persistence requires a writable known permission scope')
    return { sessionId: String(agent.id), projectRoot: project.toLowerCase(), storeRoot: (await realpath(this.config.root)).toLowerCase(),
      permission: { preset, sandbox: spec.sandbox, approval: spec.approval } }
  }

  private async entries(): Promise<string[]> {
    const entries: string[] = []
    const limit = this.config.maxPlugins * this.config.maxVersions + this.config.maxPendingFiles + 2
    for await (const entry of await opendir(this.config.root)) {
      if (entries.length >= limit) throw new Error('Cordis persistence directory entry limit exceeded')
      entries.push(entry.name)
    }
    return entries
  }

  private async assertLinks(path: string, stat: Stats): Promise<void> {
    if (stat.nlink === 1) return
    const name = basename(path)
    if (stat.nlink !== 2 || (!versionFile.test(name) && !pendingFile.test(name))) throw new Error('Cordis persistence refuses foreign hard links')
    // Publication creates one complete version hard link before removing staging. A crash may
    // retain exactly those two names; no foreign link or extra alias is accepted or deleted.
    const matching: string[] = []
    for (const entry of await this.entries()) {
      const other = await lstat(join(this.config.root, entry))
      if (other.isFile() && other.dev === stat.dev && other.ino === stat.ino) matching.push(entry)
    }
    if (matching.length !== 2 || matching.filter(entry => versionFile.test(entry)).length !== 1
      || matching.filter(entry => pendingFile.test(entry)).length !== 1) throw new Error('Cordis persistence refuses foreign hard links')
  }

  private async read(path: string): Promise<Envelope> {
    if ((await lstat(path)).isSymbolicLink()) throw new Error('Cordis persistence refuses linked source')
    const handle = await open(path, 'r')
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size > this.config.maxVersionBytes) throw new Error('Cordis saved version is not a bounded regular file')
      await this.assertLinks(path, stat)
      const buffer = Buffer.alloc(this.config.maxVersionBytes + 1)
      let length = 0
      while (length < buffer.length) {
        const chunk = await handle.read(buffer, length, buffer.length - length, length)
        if (chunk.bytesRead === 0) break
        length += chunk.bytesRead
      }
      if (length > this.config.maxVersionBytes) throw new Error('Cordis saved version exceeds byte limit')
      const bytes = buffer.subarray(0, length)
      const row = envelopeSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
      if (digest(row) !== row.sha256) throw new Error('Cordis saved version checksum mismatch')
      if (row.code.host !== undefined) precheckCode(row.code.host, 'code.host')
      if (row.code.client !== undefined) precheckCode(row.code.client, 'code.client')
      return row
    } finally { await handle.close() }
  }

  private async scan(tolerateInvalid = false): Promise<{
    rows: Envelope[]
    unavailable: UnavailableSavedPackage[]
    bytes: number
    pending: number
  }> {
    const files = await this.entries()
    const rows: Envelope[] = []
    const unavailable: UnavailableSavedPackage[] = []
    let bytes = 0, pending = 0
    const inodes = new Set<string>()
    for (const file of files) {
      const path = join(this.config.root, file), stat = await lstat(path)
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Cordis persistence contains an unsupported entry')
      await this.assertLinks(path, stat)
      if (file === '.dsh-directory.lock' || guardFile.test(file)) {
        if (stat.size !== 0) throw new Error('Cordis persistence lock is not empty')
        continue
      }
      const inode = `${stat.dev}:${stat.ino}`
      if (!inodes.has(inode)) bytes += stat.size
      inodes.add(inode)
      if (bytes > this.config.maxTotalBytes) throw new Error('Cordis persistence total byte limit exceeded')
      if (pendingFile.test(file)) {
        if (++pending > this.config.maxPendingFiles) throw new Error('Cordis persistence pending file limit exceeded')
        continue
      }
      const match = versionFile.exec(file)
      if (match === null || !Number.isSafeInteger(Number(match[2]))) throw new Error('Cordis persistence contains an unknown entry')
      try {
        const row = await this.read(path)
        if (row.durableId !== match[1] || row.version !== Number(match[2])) throw new Error('Cordis saved version identity mismatch')
        rows.push(row)
      } catch (error) {
        if (!tolerateInvalid) throw error
        unavailable.push({ status: 'unavailable', durableId: match[1] as CordisSavedPluginId, version: Number(match[2]),
          message: 'Saved source is invalid or unavailable. Keep its files; explicitly select a verified version.' })
      }
    }
    return { rows, unavailable, bytes, pending }
  }

  /** Publish a bounded immutable source file, retaining incomplete staging on failure.
   * @param agent - current owner and authority scope.
   * @param request - exact runtime source and optional expected durable version.
   * @returns a committed receipt; no activation is requested.
   */
  async save(agent: Agent, request: SavePackageRequest): Promise<SavedPackageReceipt> {
    const inspected = this.runner.inspectPackage(agent, request.pluginId, request.packageId)
    return this.operate(request.pluginId, () => withProtectedDirectory(this.config.root, async () => {
      const scope = await this.scope(agent), inventory = await this.scan()
      if (inventory.pending >= this.config.maxPendingFiles) throw new Error('Cordis persistence pending file limit reached')
      const prior = [...this.bindings.entries()].find(([, bound]) => bound.pluginId === request.pluginId)
      if (prior === undefined && (request.durableId !== undefined || request.expectedVersion !== undefined)) throw new Error('Cordis save requires an existing durable identity before supplying a version expectation')
      if (prior !== undefined && request.durableId !== prior[0]) throw new Error('Cordis save requires the existing durable identity and expected version')
      const id = request.durableId ?? randomUUID() as CordisSavedPluginId
      const existing = inventory.rows.filter(row => row.durableId === id)
      const binding = this.bindings.get(id)
      if (existing.length > 0 && (binding?.agent !== agent || binding.pluginId !== request.pluginId || !equalScope(binding.scope, scope))) throw new Error('Cordis saved Plugin is not bound to this current Session')
      if (existing.some(row => !equalScope(row.scope, scope))) throw new Error('Cordis saved scope conflict')
      const latest = Math.max(0, ...existing.map(row => row.version))
      if (latest !== (request.expectedVersion ?? 0)) throw new Error('Cordis saved version conflict')
      if (existing.length >= this.config.maxVersions) throw new Error('Cordis saved version count limit reached')
      if (latest === 0 && new Set(inventory.rows.map(row => row.durableId)).size >= this.config.maxPlugins) throw new Error('Cordis saved Plugin count limit reached')
      const content = { scope, name: inspected.name, purpose: inspected.purpose, code: inspected.code }
      const row: Envelope = { schemaVersion: 1, format: 'cordis-js-function-body-v1', durableId: id, version: latest + 1, sha256: digest(content), ...content }
      envelopeSchema.parse(row)
      const bytes = Buffer.from(JSON.stringify(row) + '\n')
      if (bytes.length > this.config.maxVersionBytes || bytes.length + inventory.bytes > this.config.maxTotalBytes) throw new Error('Cordis saved version exceeds storage byte limit')
      const pending = join(this.config.root, `.pending-${randomUUID()}`)
      const destination = join(this.config.root, `${id}.${row.version}.json`)
      const handle = await open(pending, 'wx')
      try {
        await handle.writeFile(bytes)
        await handle.sync()
      } finally { await handle.close() }
      const staged = await this.read(pending)
      if (staged.sha256 !== row.sha256 || !equalScope(scope, await this.scope(agent))) throw new Error('Cordis saved scope changed before commit')
      this.runner.inspectPackage(agent, request.pluginId, request.packageId)
      this.assertIdle(request.pluginId)
      await link(pending, destination)
      await unlink(pending)
      const current = binding ?? { agent, pluginId: request.pluginId, scope, versions: new Map() }
      current.versions.set(row.version, { packageId: request.packageId, sha256: row.sha256 })
      this.bindings.set(id, current)
      return receipt(row)
    }))
  }

  /** Read source-free descriptors under the configured native directory lease.
   * @param agent - current Session and project selection.
   * @returns bounded descriptors, including individually damaged entries.
   */
  async list(agent: Agent): Promise<SavedPackageListing[]> {
    return this.operate(undefined, () => withProtectedDirectory(this.config.root, async () => {
      const scope = await this.scope(agent)
      const inventory = await this.scan(true)
      const rows = [...inventory.rows.filter(row => equalScope(row.scope, scope)).map(receipt), ...inventory.unavailable]
      // Include the exact outer object and whitespace rendered by the normal tool.
      if (Buffer.byteLength(JSON.stringify({ versions: rows }, null, 2)) > this.config.maxTotalBytes) throw new Error('Cordis saved listing exceeds byte limit')
      return rows
    }))
  }

  /** Validate one selected version and bind fresh runtime identities without running.
   * @param agent - exact current owner; another live Agent cannot reuse the binding.
   * @param request - durable identity, immutable version and expected digest.
   * @returns the deduplicated current registry binding.
   */
  async load(agent: Agent, request: LoadSavedRequest): Promise<LoadedPackageReceipt> {
    if (!new RegExp(`^${uuid}$`).test(request.durableId) || !Number.isSafeInteger(request.version) || request.version < 1 || !/^[0-9a-f]{64}$/.test(request.sha256)) throw new Error('Invalid saved Plugin selection')
    return this.operate(this.bindings.get(request.durableId)?.pluginId, () => withProtectedDirectory(this.config.root, async () => {
      const scope = await this.scope(agent)
      const row = await this.read(join(this.config.root, `${request.durableId}.${request.version}.json`))
      if (row.durableId !== request.durableId || row.version !== request.version || row.sha256 !== request.sha256) throw new Error('Cordis saved version identity or checksum conflict')
      if (!equalScope(row.scope, scope)) throw new Error('Cordis saved scope conflict')
      let binding = this.bindings.get(request.durableId)
      if (binding !== undefined && (binding.agent !== agent || !equalScope(binding.scope, scope))) throw new Error('Cordis saved Plugin belongs to another current Session')
      const previous = binding?.versions.get(row.version)
      if (previous !== undefined && previous.sha256 !== row.sha256) throw new Error('Cordis saved version changed since it was bound; keep its files and select a verified immutable version')
      if (binding !== undefined && this.runner.reference(agent, binding.pluginId) === undefined) binding = undefined
      let packageId = binding?.versions.get(row.version)?.packageId
      if (packageId === undefined) {
        const defined = this.runner.define({ sessionId: agent.id, plugin: binding === undefined ? { kind: 'new', idPrefix: 'saved' } : { kind: 'existing', pluginId: binding.pluginId }, name: row.name, purpose: row.purpose,
          code: { ...row.code.host === undefined ? {} : { host: row.code.host },
            ...row.code.client === undefined ? {} : { client: row.code.client } } })
        binding ??= { agent, pluginId: defined.pluginId, scope, versions: new Map() }
        packageId = defined.packageId
        binding.versions.set(row.version, { packageId, sha256: row.sha256 })
        this.bindings.set(request.durableId, binding)
      }
      if (binding === undefined) throw new Error('Cordis saved binding was not established')
      return { status: 'loaded', durableId: request.durableId, version: request.version, sha256: request.sha256, pluginId: binding.pluginId, packageId,
        active: this.runner.inspectPlugin(agent, binding.pluginId).activeRun?.packageId === packageId }
    }))
  }
}

