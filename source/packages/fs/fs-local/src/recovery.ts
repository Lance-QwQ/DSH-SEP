/** Durable preimages and handle-owned Windows mutation publication. @module */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, open, readdir, readFile, rename, stat, statfs, unlink, rmdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { setTimeout as pause } from 'node:timers/promises'
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { FsError } from '@deepseek-ai/dsh-fs'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type { FsMutationSummary, FsRecoveryReport } from '@deepseek-ai/dsh-fs'
import { copyFileDaclWin32 } from './win32.ts'
import { isDirectoryGuard, lockDirectories, lockRecoveryFile, ProtectedFileHandle } from './protected-win32.ts'
import { probe, resolveLocalTarget } from './fsio.ts'

/** Explicit deployment storage and bounds for recoverable file operations. */
export interface RecoveryConfig {
  /** Existing dedicated absolute recovery directory, disjoint from the workspace on the same NTFS volume. */
  root: string
  /** Inclusive byte limit for each original file and replacement candidate. */
  maxFileBytes: number
  /** Recovery storage budget in bytes, including retained files, temporary leftovers and staging reservations. */
  maxTotalBytes: number
  /** Maximum durable operation count; committed and unresolved operations remain until reconciled offline. */
  maxEntries: number
  /** Minimum age in milliseconds before an eligible restored, nonlatest operation may be reclaimed. */
  retentionMs: number
  /** Additional EPERM/EBUSY journal replacement attempts, from 0 to 3; defaults to 3. */
  recordPublishMaxRetries?: number
  /** Base delay for linear journal retry backoff, from 1 to 1000 milliseconds; defaults to 25. */
  recordPublishRetryDelayMs?: number
}

type ResolvedRecoveryConfig = RecoveryConfig & Required<Pick<RecoveryConfig, 'recordPublishMaxRetries' | 'recordPublishRetryDelayMs'>>

/** Metadata-only operation record. Raw preimages remain in private before.bin files. */
export interface MutationRecord {
  schema: 1
  id: string
  action: 'write' | 'move' | 'delete'
  source: string
  destination?: string
  workspaceRoot: string
  state: 'prepared' | 'committed' | 'conflict' | 'restored'
  createdAt: number
  beforeExists: boolean
  beforeHash?: string
  beforeSize: number
  afterHash?: string | undefined
  afterVersion?: string | undefined
  beforeMtimeMs?: number
  beforeAtimeMs?: number
  /** Conservative workspace staging reservation; retained after an interrupted cleanup. */
  stagingBytes?: number
  expectedAfterHash?: string
  error?: string
}

/** Digest used to verify persistent preimages without logging content.
 * @param bytes - complete raw bytes or UTF-8 text.
 * @returns lowercase SHA-256 digest.
 */
export function contentHash(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Validate explicit configuration before any filesystem write occurs.
 * @param config - optional deployment recovery storage configuration.
 */
export function validateRecoveryConfig(config: RecoveryConfig | undefined): void {
  if (config === undefined) return
  if (!config.root.trim() || !isAbsolute(config.root)
    || samePath(config.root, parse(config.root).root) || samePath(config.root, homedir())) {
    throw new Error('fs-local: recovery.root must name a dedicated absolute directory')
  }
  for (const key of ['maxFileBytes', 'maxTotalBytes', 'maxEntries', 'retentionMs'] as const) {
    if (!Number.isSafeInteger(config[key]) || config[key] <= 0) throw new Error(`fs-local: recovery.${key} must be a positive safe integer`)
  }
  if (config.maxFileBytes * 2 > config.maxTotalBytes) throw new Error('fs-local: recovery.maxTotalBytes must reserve at least two preimage copies')
  if (config.recordPublishMaxRetries !== undefined && (!Number.isSafeInteger(config.recordPublishMaxRetries)
    || config.recordPublishMaxRetries < 0 || config.recordPublishMaxRetries > 3)) {
    throw new Error('fs-local: recovery.recordPublishMaxRetries must be an integer from 0 to 3')
  }
  if (config.recordPublishRetryDelayMs !== undefined && (!Number.isSafeInteger(config.recordPublishRetryDelayMs)
    || config.recordPublishRetryDelayMs < 1 || config.recordPublishRetryDelayMs > 1000)) {
    throw new Error('fs-local: recovery.recordPublishRetryDelayMs must be an integer from 1 to 1000')
  }
}

/** Validate deployment policy and fill the journal publication defaults before execution.
 * @param config - optional recovery configuration.
 * @returns explicit publication policy, or undefined when recovery is unconfigured.
 */
export function resolveRecoveryConfig(config: RecoveryConfig | undefined): ResolvedRecoveryConfig | undefined {
  validateRecoveryConfig(config)
  return config === undefined ? undefined : { ...config,
    recordPublishMaxRetries: config.recordPublishMaxRetries ?? 3,
    recordPublishRetryDelayMs: config.recordPublishRetryDelayMs ?? 25 }
}

function samePath(a: string, b: string): boolean { return resolve(a).toLowerCase() === resolve(b).toLowerCase() }
function under(root: string, path: string): boolean {
  const suffix = relative(resolve(root), resolve(path))
  return suffix === '' || (suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix))
}

function assertScope(target: FsTarget, workspaceRoot: string, recoveryRoot: string, allowOutside: boolean): void {
  if (samePath(workspaceRoot, parse(workspaceRoot).root) || samePath(workspaceRoot, homedir())) {
    throw new FsError('protected mutations require a dedicated project workspace', 'FS_UNSAFE_TARGET')
  }
  if (samePath(workspaceRoot, target.targetKey)) throw new FsError('mutation target is not a regular file', 'FS_NOT_REGULAR_FILE')
  if ((!allowOutside && !under(workspaceRoot, target.targetKey)) || under(recoveryRoot, target.targetKey)) {
    throw new FsError('protected mutation target must be a file inside the current workspace', 'FS_SANDBOX_DENIED')
  }
  if (!samePath(target.displayPath, target.targetKey)) throw new FsError('protected mutations refuse symbolic-link aliases', 'FS_UNSAFE_TARGET')
  if (under(workspaceRoot, recoveryRoot) || under(recoveryRoot, workspaceRoot)) {
    throw new FsError('recovery directory and workspace must be separate', 'FS_UNSAFE_TARGET')
  }
  if (!samePath(parse(target.targetKey).root, parse(recoveryRoot).root)) {
    throw new FsError('protected mutations require recovery storage on the same NTFS volume', 'FS_UNSAFE_TARGET')
  }
}

/** Public metadata projection without backup contents.
 * @param record - validated durable operation record.
 * @returns metadata suitable for the tool consumer.
 */
export function mutationSummary(record: MutationRecord): FsMutationSummary {
  return { mutationId: record.id, action: record.action, source: record.source,
    ...record.destination === undefined ? {} : { destination: record.destination },
    state: record.state, createdAt: record.createdAt }
}

interface DurableFileIdentity { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint }

async function writeDurable(path: string, data: string | Uint8Array): Promise<DurableFileIdentity> {
  const handle = await open(path, 'wx', 0o600)
  try {
    await handle.writeFile(data)
    await handle.sync()
    return await handle.stat({ bigint: true })
  } finally { await handle.close() }
}

/** Inspect every journal entry; valid records remain visible alongside explicit damage reports.
 * @param config - configured recovery directory and bounds.
 * @returns verified records and entry-specific issues.
 */
export async function inspectRecoveryRecords(config: RecoveryConfig): Promise<{ records: MutationRecord[]; issues: FsRecoveryReport['issues'] }> {
  const entries = await readdir(config.root, { withFileTypes: true })
  const records: MutationRecord[] = []
  const issues: FsRecoveryReport['issues'] = []
  for (const entry of entries) {
    if (entry.name === '.lock') continue
    try {
      if (isDirectoryGuard(entry.name)) {
        const guard = await lstat(join(config.root, entry.name))
        if (!guard.isFile() || guard.isSymbolicLink() || guard.size !== 0 || guard.nlink !== 1) throw new FsError('invalid directory guard', 'FS_RECOVERY_CONFLICT')
        continue
      }
      if (!entry.isDirectory() || !/^[0-9a-f-]{36}$/.test(entry.name)) throw new FsError('unexpected recovery entry; manual reconciliation required', 'FS_RECOVERY_CONFLICT')
      const path = join(config.root, entry.name, 'record.json')
      const info = await lstat(path)
      if (!info.isFile() || info.isSymbolicLink() || info.size > 32768) throw new FsError('invalid recovery record', 'FS_RECOVERY_CONFLICT')
      const value: unknown = JSON.parse(await readFile(path, 'utf8'))
      const record = value as Partial<MutationRecord>
      if (record.schema !== 1 || record.id !== entry.name || typeof record.source !== 'string' || typeof record.workspaceRoot !== 'string'
      || !['write', 'move', 'delete'].includes(String(record.action)) || !['prepared', 'committed', 'conflict', 'restored'].includes(String(record.state))
      || !Number.isSafeInteger(record.beforeSize) || (record.beforeSize as number) < 0
      || !Number.isSafeInteger(record.createdAt) || (record.createdAt as number) < 0
      || (record.stagingBytes !== undefined && (!Number.isSafeInteger(record.stagingBytes) || record.stagingBytes < 0))
      || !isAbsolute(record.source) || !isAbsolute(record.workspaceRoot)
      || (record.action === 'move' && (typeof record.destination !== 'string' || !isAbsolute(record.destination)))) {
        throw new FsError('unsupported or damaged recovery record', 'FS_RECOVERY_CONFLICT')
      }
      const digest = (value: unknown): boolean => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
      const time = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 8640000000000000
      const hasAfter = record.state === 'committed' || record.state === 'restored'
      if (typeof record.beforeExists !== 'boolean'
      || (record.beforeExists ? !digest(record.beforeHash) || !time(record.beforeMtimeMs) || !time(record.beforeAtimeMs)
        : record.beforeSize !== 0 || record.beforeHash !== undefined
          || record.beforeMtimeMs !== undefined || record.beforeAtimeMs !== undefined)
      || (record.action !== 'write' && !record.beforeExists)
      || (record.action !== 'move' && record.destination !== undefined)
      || (record.action === 'move' && typeof record.destination === 'string' && samePath(record.source, record.destination))
      || (record.afterHash !== undefined && !digest(record.afterHash))
      || (record.expectedAfterHash !== undefined && !digest(record.expectedAfterHash))
      || (record.afterVersion !== undefined && (typeof record.afterVersion !== 'string' || record.afterVersion.length === 0 || record.afterVersion.length > 4096))
      || (hasAfter && record.action !== 'delete' && (!digest(record.afterHash) || record.afterVersion === undefined))
      || (hasAfter && record.action === 'write' && record.expectedAfterHash !== record.afterHash)
      || (record.action === 'delete' && (record.afterHash !== undefined || record.afterVersion !== undefined))
      || (record.error !== undefined && (typeof record.error !== 'string' || record.error.length > 1024))) {
        throw new FsError('inconsistent recovery operation fields', 'FS_RECOVERY_CONFLICT')
      }
      if (record.beforeHash !== undefined) {
        if (!/^[0-9a-f]{64}$/.test(record.beforeHash)) throw new FsError('invalid preimage digest', 'FS_RECOVERY_CONFLICT')
        // Restored entries may be partially reclaimed; their retained metadata is
        // still inspectable and they cannot be selected for another restoration.
        if (record.state !== 'restored') {
          const backup = await lstat(join(config.root, entry.name, 'before.bin'))
          if (!backup.isFile() || backup.isSymbolicLink() || backup.nlink !== 1 || backup.size !== record.beforeSize) throw new FsError('preimage missing or damaged', 'FS_RECOVERY_CONFLICT')
        }
      }
      records.push(record as MutationRecord)
    } catch {
      issues.push({ entry: entry.name, problem: 'Entry is incomplete, damaged or unsupported; preserve it for offline reconciliation.' })
    }
  }
  return { records, issues }
}

/** Strict mutation reads fail closed; diagnostics retain visibility through inspection.
 * @param config - configured recovery directory and bounds.
 * @returns validated operation records, or throws on damaged history.
 */
export async function readMutationRecords(config: RecoveryConfig): Promise<MutationRecord[]> {
  const { records, issues } = await inspectRecoveryRecords(config)
  if (issues.length > 0) throw new FsError('recovery journal requires reconciliation; inspectRecovery reports affected entries', 'FS_RECOVERY_CONFLICT')
  if (records.length > config.maxEntries) throw new FsError('recovery entry limit exceeded', 'FS_BACKUP_LIMIT')
  return records
}

/** Charge actual flat journal files (including leftovers), plus durable workspace staging reservations. */
async function checkCapacity(config: RecoveryConfig, additional: number): Promise<void> {
  const records = await readMutationRecords(config)
  const space = await statfs(config.root, { bigint: true })
  const block = Number(space.bsize)
  const allocated = (size: number): number => Math.max(block, Math.ceil(size / block) * block)
  let used = block
  for (const record of records) {
    used += block + (record.stagingBytes ?? 0)
    for (const entry of await readdir(join(config.root, record.id), { withFileTypes: true })) {
      if (!entry.isFile()) throw new FsError('unexpected nested recovery content; inspect before continuing', 'FS_RECOVERY_CONFLICT')
      const info = await lstat(join(config.root, record.id, entry.name))
      if (!info.isFile() || info.isSymbolicLink()) throw new FsError('unsafe recovery content', 'FS_RECOVERY_CONFLICT')
      used += allocated(info.size)
    }
  }
  // Include two bounded record replacements and one directory; this is a conservative
  // content/cluster budget, not a promise about NTFS MFT or volume-wide allocations.
  const reserve = allocated(additional) + 65536
  if (used + reserve > config.maxTotalBytes || space.bavail * space.bsize < BigInt(reserve)) {
    throw new FsError('insufficient recovery capacity; original remains unchanged', 'FS_BACKUP_LIMIT')
  }
}

interface PersistedRecord { bytes: string; version: string }

/** Publish one immutable metadata candidate while its caller holds the journal and directory locks. */
async function publishRecord(
  directory: string, record: MutationRecord, config: ResolvedRecoveryConfig, previous?: PersistedRecord,
): Promise<PersistedRecord> {
  const bytes = JSON.stringify(record) + '\n'
  const destination = join(directory, 'record.json')
  if (previous?.bytes === bytes) {
    const held = await ProtectedFileHandle.open(destination)
    if (held !== undefined) {
      try {
        // Equality alone is not durability evidence: only this transaction's own
        // synced publication, at the same held file version, can be reused.
        if ((await probe(destination))?.version === previous.version && await readFile(destination, 'utf8') === bytes) return previous
      } finally { held.close() }
    }
  }
  const temporary = join(directory, `${randomUUID()}.json.tmp`)
  const candidate = await writeDurable(temporary, bytes)
  for (let attempt = 0; ; attempt++) {
    try { await rename(temporary, destination); break } catch (error) {
      // Only this immutable metadata candidate is retried; the user file is not republished.
      if (attempt >= config.recordPublishMaxRetries || !['EPERM', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
      await pause(config.recordPublishRetryDelayMs * (attempt + 1))
    }
  }
  const held = await ProtectedFileHandle.open(destination)
  if (held === undefined) throw new FsError('published recovery record disappeared; inspect before continuing', 'FS_RECOVERY_CONFLICT')
  try {
    const actual = await stat(destination, { bigint: true })
    if (actual.dev !== candidate.dev || actual.ino !== candidate.ino || actual.size !== candidate.size
      || actual.mtimeNs !== candidate.mtimeNs || await readFile(destination, 'utf8') !== bytes) {
      throw new FsError('published recovery record differs from the synced candidate; inspect before continuing', 'FS_RECOVERY_CONFLICT')
    }
    const persisted = await probe(destination)
    if (persisted === null) throw new FsError('published recovery record disappeared; inspect before continuing', 'FS_RECOVERY_CONFLICT')
    return { bytes, version: persisted.version }
  } finally { held.close() }
}

async function saveRecord(config: ResolvedRecoveryConfig, record: MutationRecord): Promise<void> {
  const directory = join(config.root, record.id)
  const release = await lockDirectories([join(directory, 'record.json')], false)
  try { await publishRecord(directory, record, config) } finally { release() }
}

async function pruneRestored(config: RecoveryConfig, records: MutationRecord[]): Promise<MutationRecord[]> {
  const latest = new Map<string, MutationRecord>()
  for (const record of records) {
    const key = record.source.toLowerCase()
    if ((latest.get(key)?.createdAt ?? -Infinity) < record.createdAt) latest.set(key, record)
  }
  const removed = new Set<string>()
  for (const record of records) {
    if (record.state !== 'restored' || (record.stagingBytes ?? 0) > 0 || Date.now() - record.createdAt < config.retentionMs || latest.get(record.source.toLowerCase()) === record) continue
    const directory = join(config.root, record.id)
    const release = await lockDirectories([join(directory, 'record.json')], false)
    try {
      const entries = (await readdir(directory, { withFileTypes: true })).filter(entry => !isDirectoryGuard(entry.name))
      if (entries.some(entry => !entry.isFile() || !['record.json', 'before.bin', 'original', 'restore.bin'].includes(entry.name))) {
        throw new FsError('unexpected backup contents prevent history cleanup', 'FS_RECOVERY_CONFLICT')
      }
      // Flat ordinary files only; unlink never recursively traverses a substituted directory.
      for (const entry of entries.sort((a, b) => Number(a.name === 'record.json') - Number(b.name === 'record.json'))) await unlink(join(directory, entry.name))
    } finally { release() }
    await rmdir(directory)
    removed.add(record.id)
  }
  return records.filter(record => !removed.has(record.id))
}

/** Restore one committed operation while retaining the current state as a new recoverable operation.
 * @param config - configured recovery storage; absence denies restoration.
 * @param id - durable operation identifier.
 * @param workspaceRoot - current trusted workspace.
 * @param signal - aborts before publication.
 * @param allowOutside - explicit current full-access authorization.
 * @returns the restored operation's metadata.
 */
export async function restoreOperation(
  config: RecoveryConfig | undefined, id: string, workspaceRoot: string, signal?: AbortSignal, allowOutside = false,
): Promise<FsMutationSummary> {
  if (config === undefined) throw new FsError('recovery storage is not configured', 'FS_PROTECTION_UNAVAILABLE')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new FsError('invalid recovery operation ID', 'FS_RECOVERY_CONFLICT')
  const records = await readMutationRecords(config)
  const record = records.find(candidate => candidate.id === id && samePath(candidate.workspaceRoot, workspaceRoot))
  if (record === undefined || record.state !== 'committed') throw new FsError('operation is unavailable or requires reconciliation', 'FS_RECOVERY_CONFLICT')
  const source = await resolveLocalTarget(workspaceRoot, record.source)
  const current = record.action === 'move'
    ? await resolveLocalTarget(workspaceRoot, record.destination as string)
    : source
  let transaction: RecoveryTransaction | undefined
  let heldBackup: ProtectedFileHandle | undefined
  let backup = '', bytes = Buffer.alloc(0)
  try {
    transaction = await RecoveryTransaction.prepare(config, current, workspaceRoot, signal, record.action === 'move' ? source : undefined, allowOutside, async () => {
      const latest = (await readMutationRecords(config)).find(candidate => candidate.id === id)
      if (JSON.stringify(latest) !== JSON.stringify(record)) throw new FsError('recovery record changed; re-read before retrying', 'FS_RECOVERY_CONFLICT')
      const info = await probe(current.targetKey)
      if (record.action === 'delete') {
        if (info !== null) throw new FsError('recovery target contains new data', 'FS_RECOVERY_CONFLICT')
      } else if (info === null || record.afterVersion === undefined || info.version !== record.afterVersion
        || contentHash(await readFile(current.targetKey)) !== record.afterHash) {
        throw new FsError('recovery target changed since the operation; current data and backup are preserved', 'FS_RECOVERY_CONFLICT')
      }
      if (signal?.aborted) throw new FsError('recovery aborted', 'FS_ABORTED')
      if (record.action !== 'move' && record.beforeExists) {
        backup = join(config.root, id, 'before.bin')
        heldBackup = await ProtectedFileHandle.open(backup)
        if (heldBackup === undefined) throw new FsError('recovery preimage is unavailable', 'FS_RECOVERY_CONFLICT')
        const backupInfo = await lstat(backup)
        if (!backupInfo.isFile() || backupInfo.isSymbolicLink() || backupInfo.nlink !== 1 || backupInfo.size > config.maxFileBytes) {
          throw new FsError('recovery preimage is not a supported ordinary file', 'FS_RECOVERY_CONFLICT')
        }
        bytes = await readFile(backup)
        const hash = contentHash(bytes)
        if (hash !== record.beforeHash) throw new FsError('recovery preimage hash mismatch', 'FS_RECOVERY_CONFLICT')
        return { bytes: bytes.length, hash }
      }
    })
    if (record.action === 'move') {
      await transaction.relocate(source.targetKey, record.beforeAtimeMs, record.beforeMtimeMs)
    } else if (!record.beforeExists) {
      await transaction.relocate()
    } else {
      // Stage original bytes verbatim, retaining its captured DACL. Recovery does not decode text.
      const staged = join(transaction.directory, 'restore.bin')
      const handle = await open(staged, 'wx', 0o600)
      try { await copyFileDaclWin32(backup, staged); await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
      await transaction.publish(staged, record.beforeAtimeMs, record.beforeMtimeMs)
      await transaction.stagingCleaned()
    }
    const restoredPath = record.action === 'move' ? source.targetKey : current.targetKey
    transaction.record.afterVersion = (await probe(restoredPath))?.version
    await transaction.save()
    record.state = 'restored'
    // Absence was rejected before restoration; resolution preserves configured storage.
    await saveRecord(resolveRecoveryConfig(config) as ResolvedRecoveryConfig, record)
    return mutationSummary(record)
  } finally { try { heldBackup?.close() } finally { transaction?.close() } }
}

/** One transaction owns its handles, durable preimage and publication decision until disposal. */
export class RecoveryTransaction {
  private published: ProtectedFileHandle | undefined
  private persistedRecord: PersistedRecord | undefined
  private constructor(
    private readonly config: ResolvedRecoveryConfig,
    readonly record: MutationRecord,
    readonly directory: string,
    private readonly original: ProtectedFileHandle | undefined,
    private readonly release: () => void,
  ) {}

  /** Acquire handles and persist a preimage before allowing mutation of the actual file.
   * @param config - explicitly configured recovery storage.
   * @param target - resolved original file or absent creation target.
   * @param workspaceRoot - trusted current workspace.
   * @param signal - aborts before preparing.
   * @param destination - absent managed-move destination.
   * @param allowOutside - explicit current full-access authorization.
   * @param preflight - validate the request while the original is held, before any durable record or preimage; optionally reserve candidate bytes.
   * @returns owned transaction requiring close in a finally block.
   */
  static async prepare(
    config: RecoveryConfig | undefined, target: FsTarget, workspaceRoot: string,
    signal?: AbortSignal, destination?: FsTarget, allowOutside = false,
    preflight?: () => Promise<{ bytes: number; hash: string } | void>,
  ): Promise<RecoveryTransaction> {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new FsError('protected file mutations require the verified Windows x64 NTFS backend', 'FS_PROTECTION_UNAVAILABLE')
    if (config === undefined) throw new FsError('file mutations are unavailable until recovery storage and limits are configured', 'FS_PROTECTION_UNAVAILABLE')
    // The preceding guard establishes configured storage for this transaction.
    const resolvedConfig = resolveRecoveryConfig(config) as ResolvedRecoveryConfig
    if (signal?.aborted) throw new FsError('file mutation aborted', 'FS_ABORTED')
    assertScope(target, workspaceRoot, config.root, allowOutside)
    const recoveryInfo = await lstat(config.root).catch((error: unknown) => {
      throw new FsError('configured recovery storage is unavailable; it will not be recreated', 'FS_PROTECTION_UNAVAILABLE', { cause: error })
    })
    if (!recoveryInfo.isDirectory() || recoveryInfo.isSymbolicLink()) throw new FsError('configured recovery storage is not a real directory', 'FS_PROTECTION_UNAVAILABLE')
    if (destination !== undefined) assertScope(destination, workspaceRoot, config.root, allowOutside)
    // The configured root is an existing boundary: never recreate it after a path race.
    const releaseRecoveryDirectories = await lockDirectories([join(config.root, '.lock')], false)
    let releaseDirectories: (() => void) | undefined
    let releaseJournal: (() => void) | undefined
    let original: ProtectedFileHandle | undefined
    try {
      releaseDirectories = await lockDirectories([target.displayPath, ...destination === undefined ? [] : [destination.displayPath]], true)
      releaseJournal = await lockRecoveryFile(join(config.root, '.lock'))
      original = await ProtectedFileHandle.open(target.targetKey)
      if (destination !== undefined) {
        const existingDestination = await lstat(destination.targetKey).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
          throw error
        })
        if (existingDestination !== undefined) throw new FsError('move destination already exists', 'FS_RECOVERY_CONFLICT')
      }
      const before = original === undefined ? undefined : await stat(target.targetKey)
      if (before !== undefined && before.size > config.maxFileBytes) throw new FsError('file exceeds the configured backup size limit', 'FS_BACKUP_LIMIT')
      // Validation owns the same source handle as publication. A rejected guard or
      // edit must not leave a prepared operation that can never be restored/pruned.
      const candidate = await preflight?.()
      if (candidate !== undefined && (!Number.isSafeInteger(candidate.bytes) || candidate.bytes < 0 || candidate.bytes > config.maxFileBytes)) {
        throw new FsError('replacement exceeds the configured recoverable file limit', 'FS_BACKUP_LIMIT')
      }
      if (signal?.aborted) throw new FsError('file mutation aborted', 'FS_ABORTED')
      const records = await pruneRestored(config, await readMutationRecords(config))
      if (records.length >= config.maxEntries) throw new FsError('recovery entry capacity exhausted; retain unresolved backups', 'FS_BACKUP_LIMIT')
      const { bsize } = await statfs(config.root)
      // Cover both preimage copies, candidate staging and journal/directory clusters
      // before creating the operation; later IO failures retain inspectable evidence.
      await checkCapacity(config, (before?.size ?? 0) * 2 + (candidate?.bytes ?? 0) + bsize * 4)
      const bytes = original === undefined ? undefined : await readFile(target.targetKey)
      const record: MutationRecord = {
        schema: 1, id: randomUUID(), action: 'write', source: target.targetKey,
        workspaceRoot: resolve(workspaceRoot), state: 'prepared', createdAt: Date.now(),
        ...candidate === undefined ? {} : { expectedAfterHash: candidate.hash, stagingBytes: Math.max(bsize, Math.ceil(candidate.bytes / bsize) * bsize) + bsize },
        beforeExists: bytes !== undefined,
        beforeSize: bytes?.length ?? 0, ...bytes === undefined ? {} : { beforeHash: contentHash(bytes) },
        ...before === undefined ? {} : { beforeMtimeMs: before.mtimeMs, beforeAtimeMs: before.atimeMs },
      }
      const directory = join(config.root, record.id)
      const releaseOperation = await lockDirectories([join(directory, 'record.json')], true)
      try {
        // Persist the prepared state first. A failed backup remains an inspectable operation.
        await writeDurable(join(directory, 'record.json'), JSON.stringify(record) + '\n')
        if (bytes !== undefined) {
          const backup = join(directory, 'before.bin')
          // Empty owner-only backup receives the source DACL before sensitive bytes are copied.
          const handle = await open(backup, 'wx', 0o600)
          try {
            await copyFileDaclWin32(target.targetKey, backup)
            await handle.writeFile(bytes)
            await handle.sync()
          } finally { await handle.close() }
        }
      } catch (error) { releaseOperation(); throw error }
      const journal = releaseJournal
      const directories = releaseDirectories
      return new RecoveryTransaction(resolvedConfig, record, directory, original, () => {
        try { releaseOperation() } finally { try { journal() } finally { try { directories() } finally { releaseRecoveryDirectories() } } }
      })
    } catch (error) {
      try { original?.close() } finally {
        try { releaseJournal?.() } finally { try { releaseDirectories?.() } finally { releaseRecoveryDirectories() } }
      }
      throw error
    }
  }

  /** Reserve candidate bytes before staging, so newly created files remain recoverable too.
   * @param bytes - full candidate byte count.
   * @param expectedHash - digest of the requested candidate contents.
   */
  async reserveCandidate(bytes: number, expectedHash: string): Promise<void> {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > this.config.maxFileBytes) throw new FsError('replacement exceeds the configured recoverable file limit', 'FS_BACKUP_LIMIT')
    // The original may still move into the journal after this reservation.
    await checkCapacity(this.config, bytes + this.record.beforeSize)
    const { bsize } = await statfs(this.config.root)
    this.record.stagingBytes = Math.max(bsize, Math.ceil(bytes / bsize) * bsize) + bsize
    this.record.expectedAfterHash = expectedHash
    await this.save()
  }

  /** Clear the conservative reservation only after the known staging directory was removed. */
  async stagingCleaned(): Promise<void> {
    this.record.stagingBytes = 0
    await this.save()
  }

  /** Persist changed metadata through a synced sibling; reuse only this transaction's verified durable version. */
  async save(): Promise<void> {
    this.persistedRecord = await publishRecord(this.directory, this.record, this.config, this.persistedRecord)
  }

  /** Publish the prepared file without overwriting any intervening creator.
   * @param temporary - synced candidate whose expected digest was reserved.
   * @param accessMs - optional captured access time for restoration.
   * @param writeMs - optional captured write time for restoration.
   */
  async publish(temporary: string, accessMs?: number, writeMs?: number): Promise<void> {
    try {
      this.published = await ProtectedFileHandle.open(temporary)
      if (this.published === undefined) throw new FsError('prepared replacement disappeared', 'FS_UNSAFE_TARGET')
      if (this.record.expectedAfterHash === undefined || contentHash(await readFile(temporary)) !== this.record.expectedAfterHash) {
        throw new FsError('prepared replacement bytes changed before publication', 'FS_UNSAFE_TARGET')
      }
      this.original?.rename(join(this.directory, 'original'))
      this.published.rename(this.record.source)
      this.record.afterHash = contentHash(await readFile(this.record.source))
      // The final digest read can advance atime. Reapply captured times only
      // after it closes, then capture the version of that restored metadata.
      if (accessMs !== undefined && writeMs !== undefined) this.published.setTimes(accessMs, writeMs)
      this.record.afterVersion = (await probe(this.record.source))?.version
      this.record.state = 'committed'
      await this.save()
    } catch (error) {
      this.published?.close()
      this.published = undefined
      this.record.state = 'conflict'
      this.record.error = 'publication incomplete; inspect original, target and backup before recovery'
      await this.save()
      if (this.original === undefined) {
        const collision = await lstat(this.record.source).catch(() => undefined)
        if (collision !== undefined) {
          if (!collision.isFile()) throw new FsError('write target is not a regular file', 'FS_NOT_REGULAR_FILE', { cause: error })
          throw new FsError(`cannot overwrite existing "${this.record.source}" without reading it first`, 'FS_NOT_OBSERVED', { cause: error })
        }
      }
      throw error
    }
  }

  /** Relocate the held original into quarantine or to a checked absent destination.
   * @param destination - absent target path, or omit to remove into recovery.
   * @param accessMs - optional captured access time when restoring a move.
   * @param writeMs - optional captured write time when restoring a move.
   */
  async relocate(destination?: string, accessMs?: number, writeMs?: number): Promise<void> {
    if (this.original === undefined) throw new FsError('managed operation source does not exist', 'FS_NOT_FOUND')
    this.record.action = destination === undefined ? 'delete' : 'move'
    if (destination !== undefined) this.record.destination = destination
    await this.save()
    try {
      this.original.rename(destination ?? join(this.directory, 'original'))
      // Restore metadata after all preimage/current-content reads and rename,
      // using the same held object; the committed version includes this change.
      if (accessMs !== undefined && writeMs !== undefined) this.original.setTimes(accessMs, writeMs)
      this.record.afterHash = destination === undefined ? undefined : this.record.beforeHash
      this.record.afterVersion = destination === undefined ? undefined : (await probe(destination))?.version
      this.record.state = 'committed'
      await this.save()
    } catch (error) {
      this.record.state = 'conflict'
      this.record.error = 'relocation incomplete; retained preimage requires reconciliation'
      await this.save()
      throw error
    }
  }

  /** Release all live handles; backups and journals survive provider disposal and restart. */
  close(): void {
    try { this.original?.close() } finally { try { this.published?.close() } finally { this.release() } }
  }
}
