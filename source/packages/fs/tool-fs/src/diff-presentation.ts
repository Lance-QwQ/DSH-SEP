/** Bounded asynchronous diff preparation and final committed-mutation notices. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { FileDiff, ToolExecution, ToolExecutionResult, ToolExecutionToken, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { createModuleExecutor } from 'dsh-tool-worker'
import type { WorkerLimits } from 'dsh-tool-worker'
import type { DiffInput } from './diff-worker.ts'

/** Limits shared by write/edit previews belonging to this plugin instance. */
export type DiffWorkerConfig = WorkerLimits

const DEFAULT_LIMITS: Required<WorkerLimits> = {
  timeoutMs: 30000, cancelGraceMs: 100, maxConcurrency: 2,
  maxInputBytes: 1048576, maxConfigBytes: 16384, maxOutputBytes: 1048576,
  maxLogBytes: 1048576, maxJsonDepth: 32, maxJsonNodes: 10000,
  maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4,
}

/** A filesystem provider's successful return, independent of later display/cancellation. */
export interface CommitReceipt {
  committed: true
  path: string
  operation: 'create' | 'update'
  version: string
  mutationId?: string
}

/** Versioned computed data; unavailable previews never fall back to host computation. */
export interface PreparedDiff {
  version: 1
  status: 'ready' | 'unavailable' | 'not_requested'
  reason: string
  diffs: FileDiff[]
}

/** Schema fragment shared by the two filesystem tool results. */
export const preparedDiffSchema = {
  type: 'object', additionalProperties: false, required: true,
  properties: {
    version: { type: 'integer', const: 1, required: true },
    status: { type: 'string', enum: ['ready', 'unavailable', 'not_requested'], required: true },
    reason: { type: 'string', required: true },
    diffs: { type: 'array', required: true, items: {
      type: 'object', additionalProperties: false,
      properties: { path: { type: 'string', required: true },
        oldText: { required: true, oneOf: [{ type: 'string' }, { type: 'null' }] },
        newText: { type: 'string', required: true } },
    } },
  },
} as const

/** Schema for canonical successful-commit metadata. */
export const commitSchema = {
  type: 'object', additionalProperties: false, required: true,
  properties: {
    committed: { type: 'boolean', const: true, required: true },
    path: { type: 'string', required: true },
    operation: { type: 'string', enum: ['create', 'update'], required: true },
    version: { type: 'string', required: true },
    mutationId: { type: 'string' },
  },
} as const

/** Only known stable Worker error codes are exposed; module exception text stays private. */
function failureCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    && /^TOOL_WORKER_[A-Z_]+$/.test(error.code)) return error.code
  return 'DIFF_PREVIEW_FAILED'
}

/** Create one shared executor and metadata-only receipts owned by actual dispatch tokens.
 * @param ctx - plugin context owning module execution and disposal.
 * @param config - validated numeric deployment overrides, never model parameters.
 * @returns commit recording, async preview preparation, and a total final content callback.
 */
export function createDiffPresentation(ctx: Context, config: DiffWorkerConfig) {
  for (const key of Object.keys(config)) {
    if (!Object.hasOwn(DEFAULT_LIMITS, key)) throw new Error(`tool-fs: unknown diffWorker option ${key}`)
  }
  const renderer = createModuleExecutor<DiffInput, { diffs: FileDiff[] }>(ctx, {
    ...DEFAULT_LIMITS, ...config,
    name: 'fs_diff_preview', description: 'Compute bounded file difference presentation',
    module: { url: new URL(import.meta.url.endsWith('.ts') ? './diff-worker.ts' : './diff-worker.js', import.meta.url), exportName: 'execute' },
    parameters: { type: 'object', additionalProperties: false, required: ['path', 'before', 'after'],
      properties: { path: { type: 'string' }, before: { oneOf: [{ type: 'string' }, { type: 'null' }] }, after: { type: 'string' } } },
    output: { schema: { type: 'object', additionalProperties: false, required: ['diffs'], properties: {
      diffs: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['path', 'oldText', 'newText'],
        properties: { path: { type: 'string' }, oldText: { oneOf: [{ type: 'string' }, { type: 'null' }] }, newText: { type: 'string' } } } },
    } } },
  })
  const receipts = new Map<ToolExecutionToken, { commit: CommitReceipt; unavailable: boolean }>()
  return {
    /** Record only after the provider has returned success, before callbacks or preview work. */
    record(exec: ToolRunContext, commit: CommitReceipt): void {
      receipts.set(exec.token, { commit, unavailable: false })
    },
    /** Compute detached presentation; failure changes only the preview, never the file outcome. */
    async prepare(exec: ToolRunContext, input: DiffInput): Promise<PreparedDiff> {
      if (exec.parent !== undefined) return { version: 1, status: 'not_requested', reason: '', diffs: [] }
      try {
        const result = await renderer.execute(input, { signal: exec.signal, callId: exec.callId, rootCallId: exec.rootCallId })
        return { version: 1, status: 'ready', reason: '', diffs: result.diffs }
      } catch (error: unknown) {
        const receipt = receipts.get(exec.token)
        if (receipt) receipt.unavailable = true
        return { version: 1, status: 'unavailable', reason: failureCode(error), diffs: [] }
      }
    },
    /** Preserve known side effects even when the registry selects cancellation or pipeline error. */
    finalizeContent(exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): ContentBlock[] | undefined {
      const receipt = receipts.get(exec.token)
      receipts.delete(exec.token)
      if (!receipt || (!result.isError && !receipt.unavailable)) return undefined
      return [...result.content, { type: 'text', text:
        `File mutation committed: ${JSON.stringify(receipt.commit)}. `
        + (receipt.unavailable ? 'Difference preview unavailable. ' : '')
        + 'Do not repeat this mutation solely because the call was cancelled or its response failed. Read the file or inspect its recovery record before further changes.' }]
    },
  }
}

/** In-process helper used only by the filesystem consumer, with no new model tool. */
export type DiffPresentation = ReturnType<typeof createDiffPresentation>

/** Prepared result metadata is replayable without rerunning the difference algorithm.
 * @param presentation - schema-validated versioned computation result.
 * @param commit - the confirmed provider outcome.
 * @returns contextual hunks and metadata explaining any omitted preview.
 */
export function preparedDiffMeta(presentation: PreparedDiff, commit: CommitReceipt) {
  return { diffs: presentation.diffs.map(({ path, oldText, newText }) => ({ path, oldText, newText })),
    diffPresentation: { version: presentation.version, status: presentation.status, reason: presentation.reason },
    commit: { ...commit } }
}

/** Detect new receipts so an omitted preview cannot expand into the old whole-file fallback. */
export function hasPreparedDiffMeta(meta: unknown): boolean {
  return typeof meta === 'object' && meta !== null && 'diffPresentation' in meta
}
