/**
 * Host-filesystem implementation of `ctx.fs`. Reads preserve canonical aliases; protected mutations refuse aliases and own Windows file/directory handles.
 * @module @deepseek-ai/dsh-fs-local
 */

import { Context } from '@deepseek-ai/cordis'
import { constants as bufferConstants } from 'node:buffer'
import { once } from 'node:events'
import { watch } from 'chokidar'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { FileSystem, FsError, FsVersion } from '@deepseek-ai/dsh-fs'
import type {
  FsDirEntry,
  FsEditOutcome,
  FsEditRequest,
  FsInfo,
  FsPathInfo,
  FsTarget,
  FsWriteIntent,
  FsWriteOutcome,
  FsMutationSummary,
  FsRecoveryReport,
} from '@deepseek-ai/dsh-fs'
import {
  applyLiteralEdit,
  listDirectory,
  localDisplayPath,
  normalizeLineEndings,
  probe,
  probeNoFollow,
  readForEdit,
  readByteWindow,
  readTextForDiff,
  readWholeBytes,
  readWholeText,
  resolveLocalTarget,
  restoreLineEndings,
  streamWholeText,
  writeFileAtomic,
} from './fsio.ts'
import type { FsIoInternals } from './fsio.ts'
import { RecoveryTransaction, resolveRecoveryConfig, readMutationRecords, inspectRecoveryRecords, mutationSummary, restoreOperation, contentHash } from './recovery.ts'
import type { RecoveryConfig } from './recovery.ts'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-fs'

export { withProtectedDirectory } from './protected-win32.ts'

/** Configuration for the local filesystem backend. */
export interface Config {
  /** Explicit, bounded, same-volume recovery storage. Missing configuration denies mutations. */
  recovery?: RecoveryConfig | undefined
  /** Base directory for relative paths. Defaults to `process.cwd()`. */
  cwd?: string
  /**
   * Exclusive UTF-8 byte limit on each overwrite-diff side, capped by the
   * runtime's safe allocation/decode maximum. Defaults to 10 MiB.
   */
  diffBasisMaxBytes?: number
}

type ResolvedConfig = Required<Omit<Config, 'recovery'>> & Pick<Config, 'recovery'>
const DEFAULT_DIFF_BASIS_MAX_BYTES = 10 * 1024 * 1024
const MAX_DIFF_BASIS_BYTES = Math.min(
  bufferConstants.MAX_LENGTH,
  bufferConstants.MAX_STRING_LENGTH,
)

/**
 * The host-filesystem backend. Reads resolve relative paths from {@link Config.cwd}
 * for resolution. Protected mutations use the trusted per-call workspace, or this
 * default for agentless calls, and require explicitly configured recovery storage.
 */
export class LocalFileSystem extends FileSystem {
  override async watch(target: FsTarget, changed: (error?: Error) => void, signal: AbortSignal): Promise<() => Promise<void>> {
    signal.throwIfAborted()
    const path = resolve(this.processPath(target))
    const directory = (await this.stat(target, signal))?.type === 'directory'
    signal.throwIfAborted()
    const root = directory ? path : dirname(path)
    const watcher = watch(root, {
      ignoreInitial: true, depth: 0,
      ignored: entry => !directory && resolve(entry) !== root && resolve(entry) !== path,
    })
    watcher.on('all', (_event, entry) => {
      if (directory || resolve(entry) === path) changed()
    })
    watcher.on('error', (error) => { changed(error instanceof Error ? error : new Error(String(error))) })
    try {
      await once(watcher, 'ready', { signal })
      return () => watcher.close()
    } catch (error) {
      await watcher.close()
      throw error
    }
  }

  static Config: z<Config> = z.object({
    recovery: z.union([z.object({
      root: z.string().required(),
      maxFileBytes: z.number().required(),
      maxTotalBytes: z.number().required(),
      maxEntries: z.number().required(),
      retentionMs: z.number().required(),
      recordPublishMaxRetries: z.number().default(3),
      recordPublishRetryDelayMs: z.number().default(25),
    }), z.const(undefined)]),
    cwd: z.string().default(process.cwd()),
    diffBasisMaxBytes: z.number().default(DEFAULT_DIFF_BASIS_MAX_BYTES),
  })

  /** Validated config (schemastery applied the defaults before construction). */
  readonly config: ResolvedConfig
  override get recoveryStatus(): 'unsupported' | 'unconfigured' | 'ready' {
    if (process.platform !== 'win32' || process.arch !== 'x64') return 'unsupported'
    return this.config.recovery === undefined ? 'unconfigured' : 'ready'
  }
  /** Test hook forwarded to fsio for atomic-publication boundaries. */
  internals: FsIoInternals = {}
  /** Per-store FIFO serializes this instance's quota, journal and file transitions. */
  private locks = new Map<string, Promise<unknown>>()

  private assertWritable(policy?: SandboxExecutionPolicy): void {
    if (policy?.mode === 'read-only') throw new FsError('file access denied under read-only mode', 'FS_SANDBOX_DENIED')
  }

  constructor(ctx: Context, config: Config) {
    super(ctx)
    const resolved = config as ResolvedConfig
    const recovery = resolveRecoveryConfig(resolved.recovery)
    if (!Number.isSafeInteger(resolved.diffBasisMaxBytes)
      || resolved.diffBasisMaxBytes <= 0
      || resolved.diffBasisMaxBytes > MAX_DIFF_BASIS_BYTES) {
      throw new Error(`fs-local: diffBasisMaxBytes must be a positive safe integer no greater than ${MAX_DIFF_BASIS_BYTES}`)
    }
    this.config = { ...resolved, recovery }
  }

  /** Serialize this instance's recovery store, falling back to a target key
   * without recovery configuration. Other instances still face native conflicts. */
  private async withLock<T>(targetKey: string, op: () => Promise<T>): Promise<T> {
    const key = this.config.recovery === undefined ? targetKey : `recovery:${resolve(this.config.recovery.root).toLowerCase()}`
    const prior = this.locks.get(key) ?? Promise.resolve()
    const run = prior.then(op, op)
    // Keep the chain alive but swallow this op's result/throw for the *next* waiter.
    const tail = run.then(() => undefined, () => undefined)
    this.locks.set(key, tail)
    try {
      return await run
    } finally {
      if (this.locks.get(key) === tail) {
        this.locks.delete(key)
      }
    }
  }

  override async resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget> {
    if (opts?.signal?.aborted) throw new FsError('resolve aborted', 'FS_ABORTED')
    const local = await resolveLocalTarget(opts?.cwd ?? this.config.cwd, path)
    if (opts?.signal?.aborted) throw new FsError('resolve aborted', 'FS_ABORTED')
    return { targetKey: local.targetKey, displayPath: local.displayPath }
  }

  override processPath(target: FsTarget): string {
    return String(target.targetKey)
  }

  override processPathFromHostPath(hostPath: string): string | undefined {
    return isAbsolute(hostPath) ? resolve(hostPath) : undefined
  }

  override fileUrl(target: FsTarget): string {
    return pathToFileURL(this.processPath(target)).href
  }

  override contains(parent: FsTarget, child: FsTarget): boolean {
    const path = relative(this.processPath(parent), this.processPath(child))
    return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  }

  override async stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> {
    if (signal?.aborted) throw new FsError('stat aborted', 'FS_ABORTED')
    const info = await probe(target.targetKey)
    if (signal?.aborted) throw new FsError('stat aborted', 'FS_ABORTED')
    if (!info) return undefined
    return { version: info.version, type: info.type, size: info.size }
  }

  override async lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined> {
    if (signal?.aborted) throw new FsError('lstat aborted', 'FS_ABORTED')
    if (path.trim().length === 0) throw new FsError('file_path must be a non-empty string', 'FS_NOT_FOUND')
    const cwd = opts?.cwd ?? this.config.cwd
    const info = await probeNoFollow(localDisplayPath(cwd, path))
    if (signal?.aborted) throw new FsError('lstat aborted', 'FS_ABORTED')
    if (!info) return undefined
    return { version: info.version, type: info.type, size: info.size }
  }

  override async readText(target: FsTarget, signal?: AbortSignal): Promise<string> {
    return readWholeText({ displayPath: target.displayPath, targetKey: target.targetKey }, signal)
  }

  override streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    return Promise.resolve(streamWholeText({ displayPath: target.displayPath, targetKey: target.targetKey }, signal))
  }

  override async readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array> {
    return readWholeBytes({ displayPath: target.displayPath, targetKey: target.targetKey }, signal, maxBytes, this.internals)
  }

  override async readByteRange(target: FsTarget, range: { offset: number; length: number }, signal?: AbortSignal): Promise<Uint8Array> {
    return readByteWindow({ displayPath: target.displayPath, targetKey: target.targetKey }, range, signal)
  }

  override async listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]> {
    const entries = await listDirectory({ displayPath: target.displayPath, targetKey: target.targetKey }, signal)
    return entries.map(entry => ({
      name: entry.name,
      type: entry.type,
      target: { targetKey: entry.target.targetKey, displayPath: entry.target.displayPath },
      ...(entry.version !== undefined ? { version: entry.version } : {}),
      ...(entry.size !== undefined ? { size: entry.size } : {}),
    }))
  }

  override async writeText(
    target: FsTarget,
    content: string,
    expected?: FsWriteIntent,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsWriteOutcome> {
    this.assertWritable(sandboxPolicy)
    return this.withLock(target.targetKey, async () => {
      const transaction = await RecoveryTransaction.prepare(this.config.recovery, target, sandboxPolicy?.workspaceRoot ?? this.config.cwd, signal, undefined, sandboxPolicy?.mode === 'danger-full-access')
      try {
        const existing = await probe(target.targetKey)
        if (existing && existing.type !== 'file') {
          throw new FsError(`cannot write "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
        }

        if (expected?.kind === 'replaceIfVersion') {
        // Stale guard: the file must still exist at the version the owner observed.
          if (!existing) throw new FsError(`cannot write "${target.displayPath}": file no longer exists`, 'FS_STALE_VERSION')
          if (existing.version !== expected.version) {
            throw new FsError(`cannot write "${target.displayPath}": file changed since it was read`, 'FS_STALE_VERSION')
          }
        } else if (expected?.kind === 'createIfAbsent' && existing) {
        // createIfAbsent onto an existing file: a blind overwrite — require a read first.
          throw new FsError(`cannot overwrite existing "${target.displayPath}" without reading it first`, 'FS_NOT_OBSERVED')
        }
        // Omitting a version guard does not remove recovery or handle ownership.

        // Capture an optional contextual-diff basis before the write. The bounded
        // reader checks the opened file itself, so an external replacement after
        // `probe()` cannot turn this best-effort presentation read into an
        // unbounded allocation. Either side at/above the configured limit yields
        // `before: null`; consumers retain their whole-file fallback.
        const diffable = existing !== null
        && Buffer.byteLength(content, 'utf8') < this.config.diffBasisMaxBytes
        const before = diffable
          ? await readTextForDiff(target.targetKey, this.config.diffBasisMaxBytes, signal)
          : null
        await transaction.reserveCandidate(Buffer.byteLength(content, 'utf8'), contentHash(content))
        await writeFileAtomic(
          target.targetKey,
          content,
          existing?.mode,
          signal,
          this.internals,
          expected?.kind === 'createIfAbsent' ? { displayPath: target.displayPath } : undefined,
          temporary => transaction.publish(temporary),
        )
        await transaction.stagingCleaned()
        const after = await probe(target.targetKey)
        transaction.record.afterVersion = after?.version
        await transaction.save()
        return {
          mutationId: transaction.record.id,
          operation: existing ? 'update' : 'create',
          version: this.versionAfterWrite(after, target),
          before,
          // LF-normalized to share the diff basis with `before` (also LF): a CRLF
          // overwrite must not read as every line changed. Line-ending restoration
          // is a storage detail the applied-hunk diff ignores.
          after: normalizeLineEndings(content),
        }
      } finally { transaction.close() }
    })
  }

  override async editText(
    target: FsTarget,
    edit: FsEditRequest,
    expected?: { version: FsVersion },
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsEditOutcome> {
    this.assertWritable(sandboxPolicy)
    return this.withLock(target.targetKey, async () => {
      const transaction = await RecoveryTransaction.prepare(this.config.recovery, target, sandboxPolicy?.workspaceRoot ?? this.config.cwd, signal, undefined, sandboxPolicy?.mode === 'danger-full-access')
      try {
        const existing = await probe(target.targetKey)
        // Stale guard before literal matching: an edit based on an old read reports
        // FS_STALE_VERSION, not FS_EDIT_NOT_FOUND/FS_AMBIGUOUS_EDIT against newer content.
        // Missing targets use the same stale code on guarded and unconditional edit paths.
        if (!existing) throw new FsError(`cannot edit "${target.displayPath}": file changed since it was read`, 'FS_STALE_VERSION')
        if (existing.type !== 'file') throw new FsError(`cannot edit "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
        // expected === undefined: unconditional edit of the current content — no
        // version guard. Still inside the recovery-store FIFO, so the read→match→write
        // window is serialized while the original is held against write/delete opens.
        if (expected && existing.version !== expected.version) {
          throw new FsError(`cannot edit "${target.displayPath}": file changed since it was read`, 'FS_STALE_VERSION')
        }

        const original = await readForEdit(target.targetKey, target.displayPath, signal)
        const edited = applyLiteralEdit(original.content, edit.oldString, edit.newString, edit.replaceAll, target.displayPath)
        const content = restoreLineEndings(edited.content, original.lineEndings)
        await transaction.reserveCandidate(Buffer.byteLength(content, 'utf8'), contentHash(content))
        await writeFileAtomic(
          target.targetKey, content, existing.mode, signal, this.internals, undefined, temporary => transaction.publish(temporary),
        )
        await transaction.stagingCleaned()

        const after = await probe(target.targetKey)
        transaction.record.afterVersion = after?.version
        await transaction.save()
        return {
          mutationId: transaction.record.id,
          version: this.versionAfterWrite(after, target),
          // The LF-normalized before/after text (the applied-hunk diff basis);
          // line-ending restoration is a storage detail the diff ignores.
          before: original.content,
          after: edited.content,
        }
      } finally { transaction.close() }
    })
  }

  override async moveFile(
    source: FsTarget, destination: FsTarget, expected?: { version: FsVersion }, signal?: AbortSignal, policy?: SandboxExecutionPolicy,
  ): Promise<FsMutationSummary> {
    this.assertWritable(policy)
    return this.withLock(source.targetKey, async () => {
      const transaction = await RecoveryTransaction.prepare(this.config.recovery, source, policy?.workspaceRoot ?? this.config.cwd, signal, destination, policy?.mode === 'danger-full-access')
      try {
        const before = await probe(source.targetKey)
        if (before === null) throw new FsError('managed move source does not exist', 'FS_NOT_FOUND')
        if (expected !== undefined && before.version !== expected.version) throw new FsError('managed move source changed', 'FS_STALE_VERSION')
        signal?.throwIfAborted()
        await transaction.relocate(destination.targetKey)
        transaction.record.afterVersion = (await probe(destination.targetKey))?.version
        await transaction.save()
        return mutationSummary(transaction.record)
      } finally { transaction.close() }
    })
  }

  override async removeFile(
    target: FsTarget, expected?: { version: FsVersion }, signal?: AbortSignal, policy?: SandboxExecutionPolicy,
  ): Promise<FsMutationSummary> {
    this.assertWritable(policy)
    return this.withLock(target.targetKey, async () => {
      const transaction = await RecoveryTransaction.prepare(this.config.recovery, target, policy?.workspaceRoot ?? this.config.cwd, signal, undefined, policy?.mode === 'danger-full-access')
      try {
        const before = await probe(target.targetKey)
        if (before === null) throw new FsError('managed delete source does not exist', 'FS_NOT_FOUND')
        if (expected !== undefined && before.version !== expected.version) throw new FsError('managed delete source changed', 'FS_STALE_VERSION')
        signal?.throwIfAborted()
        await transaction.relocate()
        return mutationSummary(transaction.record)
      } finally { transaction.close() }
    })
  }

  /** @param id - operation ID to restore. */
  override async restoreMutation(id: string, signal?: AbortSignal, policy?: SandboxExecutionPolicy): Promise<FsMutationSummary> {
    this.assertWritable(policy)
    return this.withLock(id, () =>
      restoreOperation(this.config.recovery, id, policy?.workspaceRoot ?? this.config.cwd, signal, policy?.mode === 'danger-full-access'),
    )
  }

  override async listMutations(policy?: SandboxExecutionPolicy): Promise<FsMutationSummary[]> {
    const recovery = this.config.recovery
    if (recovery === undefined) throw new FsError('recovery storage is not configured', 'FS_PROTECTION_UNAVAILABLE')
    const root = resolve(policy?.workspaceRoot ?? this.config.cwd).toLowerCase()
    return this.withLock(root, async () => (await readMutationRecords(recovery))
      .filter(record => record.workspaceRoot.toLowerCase() === root).map(mutationSummary))
  }

  override async inspectRecovery(policy?: SandboxExecutionPolicy): Promise<FsRecoveryReport> {
    const recovery = this.config.recovery
    if (recovery === undefined) throw new FsError('recovery storage is not configured', 'FS_PROTECTION_UNAVAILABLE')
    const root = resolve(policy?.workspaceRoot ?? this.config.cwd).toLowerCase()
    return this.withLock(root, async () => {
      const { records, issues } = await inspectRecoveryRecords(recovery)
      return {
        operations: records.filter(record => record.workspaceRoot.toLowerCase() === root).map(mutationSummary),
        issues, blocked: issues.length > 0,
      }
    })
  }

  /* v8 ignore next 5 -- the post-write probe finding the file absent requires a
   * concurrent unlink between rename and stat; fall back to a sentinel version. */
  private versionAfterWrite(after: { version: FsVersion } | null, target: FsTarget): FsVersion {
    if (after) return after.version
    return FsVersion(`missing:${target.targetKey}`)
  }
}

export default LocalFileSystem
