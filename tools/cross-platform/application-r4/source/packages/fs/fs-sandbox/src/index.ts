/**
 * `SandboxedFileSystem`: the sandbox-enforcing implementation of the
 * `@deepseek-ai/dsh-fs` Service Definition. It extends `LocalFileSystem` so all
 * reads and recoverable mutations remain owned by the local implementation.
 * Per-call policy rejects read-only mutations and checks workspace intent;
 * the provider subsequently holds real file/directory identities during mutation.
 * Its stricter recovery scope refuses broad roots, aliases and shared temporary
 * directories even when the general Shell policy permits those locations.
 * Explicit danger-full-access widens target scope without removing recovery
 * restrictions. This protects standard file operations, not arbitrary Shell
 * commands or native plugin APIs. The tool consumer owns approval escalation.
 *
 * @module @deepseek-ai/dsh-fs-sandbox
 */

import { Context } from '@deepseek-ai/cordis'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import type { Config as LocalConfig } from '@deepseek-ai/dsh-fs-local'
import { FsError } from '@deepseek-ai/dsh-fs'
import type { FsEditOutcome, FsEditRequest, FsTarget, FsVersion, FsWriteIntent, FsWriteOutcome, FsMutationSummary, FsRecoveryReport } from '@deepseek-ai/dsh-fs'
import { writableRoots } from '@deepseek-ai/dsh-sandbox'
import type { SandboxExecutionPolicy, SandboxMode } from '@deepseek-ai/dsh-sandbox'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { isPathUnder } from './containment.ts'

/**
 * Plugin config: the local backend's knobs verbatim (`cwd` resolution default
 * and `diffBasisMaxBytes` overwrite-presentation bound). The sandbox default
 * (mode + `workspace-write` fallback root) is NOT here — `ctx.sandboxPolicy`
 * resolves each calling session for every enforcing capability.
 */
export type Config = LocalConfig

/**
 * Sandbox-enforcing filesystem backend. Registers as `ctx.fs` (loading it
 * INSTEAD OF `dsh-fs-local`, together with a `ctx.sandboxPolicy`, is the whole
 * swap — the model-facing tools are untouched). Its configured default mode is
 * the capability fact exposed by {@link sandboxMode}; `dsh-tool-fs` resolves
 * each session's mode and cwd into a policy for every mutation, while an
 * approved escalation may stamp a strictly wider mode for one call.
 */
export class SandboxedFileSystem extends LocalFileSystem {
  static inject = ['sandboxPolicy']

  private readonly defaultMode: SandboxMode
  constructor(ctx: Context, config: Config) {
    super(ctx, config)
    this.defaultMode = ctx.sandboxPolicy.defaultMode
  }

  /** The deployment default mode — the capability fact the tool layer reads to advertise escalation. */
  override get sandboxMode(): SandboxMode {
    return this.defaultMode
  }

  /**
   * Fence the write by the per-call policy, then delegate to the inherited
   * atomic write. See {@link checkedTarget}.
   * @param target - the resolved target to write.
   * @param content - the full new file content.
   * @param expected - the write intent guarding the write; omit for unconditional.
   * @param signal - aborts before atomic publication takes effect.
   * @param sandboxPolicy - the per-call mode and workspace root; omit to use
   *   the deployment fallback.
   * @returns the write outcome from the inherited backend.
   */
  override async writeText(
    target: FsTarget,
    content: string,
    expected?: FsWriteIntent,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsWriteOutcome> {
    const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()
    return super.writeText(await this.checkedTarget(target, policy), content, expected, signal, policy)
  }

  /**
   * Fence the edit by the per-call policy, then delegate to the inherited
   * atomic edit. See {@link checkedTarget}.
   * @param target - the resolved target to edit.
   * @param edit - the literal search/replace request.
   * @param expected - the version guard; omit for an unconditional edit.
   * @param signal - aborts before atomic publication takes effect.
   * @param sandboxPolicy - the per-call mode and workspace root; omit to use
   *   the deployment fallback.
   * @returns the edit outcome from the inherited backend.
   */
  override async editText(
    target: FsTarget,
    edit: FsEditRequest,
    expected?: { version: FsVersion },
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsEditOutcome> {
    const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()
    return super.editText(await this.checkedTarget(target, policy), edit, expected, signal, policy)
  }

  /** @param sandboxPolicy - trusted current mode and workspace; omit for deployment policy. */
  override async moveFile(
    source: FsTarget, destination: FsTarget, expected?: { version: FsVersion },
    signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsMutationSummary> {
    const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()
    return super.moveFile(await this.checkedTarget(source, policy), await this.checkedTarget(destination, policy), expected, signal, policy)
  }

  /** @param sandboxPolicy - trusted current mode and workspace; omit for deployment policy. */
  override async removeFile(
    target: FsTarget, expected?: { version: FsVersion }, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsMutationSummary> {
    const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()
    return super.removeFile(await this.checkedTarget(target, policy), expected, signal, policy)
  }

  /** @param sandboxPolicy - trusted current mode and workspace; omit for deployment policy. */
  override async restoreMutation(id: string, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsMutationSummary> {
    return super.restoreMutation(id, signal, sandboxPolicy ?? this.ctx.sandboxPolicy.resolve())
  }

  /** @param sandboxPolicy - trusted current mode and workspace; omit for deployment policy. */
  override async listMutations(sandboxPolicy?: SandboxExecutionPolicy): Promise<FsMutationSummary[]> {
    return super.listMutations(sandboxPolicy ?? this.ctx.sandboxPolicy.resolve())
  }

  /** @param sandboxPolicy - trusted current mode and workspace; omit for deployment policy. */
  override async inspectRecovery(sandboxPolicy?: SandboxExecutionPolicy): Promise<FsRecoveryReport> {
    return super.inspectRecovery(sandboxPolicy ?? this.ctx.sandboxPolicy.resolve())
  }

  /**
   * Enforce the per-call policy against `target` and return the EXACT target the
   * mutation must use, so the checked identity is the mutated one (no
   * check-here-write-there TOCTOU). `read-only` denies; `workspace-write`
   * re-canonicalizes NOW (`resolve` realpaths the deepest existing ancestor,
   * reflecting a concurrently swapped symlink), requires containment under a
   * writable root, and returns THAT fresh target; `danger-full-access` returns
   * the caller's target unfenced. Throws the structured `FS_SANDBOX_DENIED` on
   * refusal — the tool layer maps it to the model-facing `[sandbox: …]` marker
   * and the escalation hint.
   */
  private async checkedTarget(target: FsTarget, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsTarget> {
    const policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()
    const { mode } = policy
    if (mode === 'danger-full-access') return target
    if (mode === 'read-only') {
      throw new FsError(`cannot write "${target.displayPath}": file access denied under read-only mode`, 'FS_SANDBOX_DENIED')
    }
    // workspace-write: containment on the FRESH canonical path (catches a
    // symlink ancestor swapped since the tool resolved this target), and the
    // mutation delegates with THIS fresh target — never the stale one.
    const fresh = await this.resolve(target.displayPath)
    let contained = false
    for (const root of writableRoots(policy)) {
      if (await isPathUnder(fresh.targetKey, root)) {
        contained = true
        break
      }
    }
    if (!contained) {
      throw new FsError(`cannot write "${target.displayPath}": file access denied under workspace-write mode`, 'FS_SANDBOX_DENIED')
    }
    return fresh
  }
}

export default SandboxedFileSystem
