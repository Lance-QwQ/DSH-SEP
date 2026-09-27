/** Explicit task checkpoints over the current durable Session. @module @deepseek-ai/dsh-task-checkpoint */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installTaskTool } from './tool.ts'
import './events.ts'
export { TaskId, TaskStepId, TaskOperationId } from './ids.ts'
export type { TaskState, TaskStep, TaskOperation, TaskArtifact, TaskArtifactEvidence, TaskChange } from './types.ts'
/** Cordis plugin name. */
export const name = 'task-checkpoint'
/** Current execution, filesystem and durability services. */
export const inject = ['agents', 'sessions', 'sessionPersistence', 'tools', 'fs']
/** Explicit tool admission and bounded task resources. */
export interface Config {
  /** Registered tool names allowed for explicit task execution; no default grants. */
  allowedTools: string[]
  /** Maximum tasks retained per Session; defaults to 8, maximum 32. */
  maxTasks?: number
  /** Maximum ordered steps per task; defaults to 16, maximum 64. */
  maxSteps?: number
  /** Maximum retained attempts per task; defaults to 64, maximum 128. */
  maxOperations?: number
  /** Maximum bytes read from one artifact; defaults to 1 MiB, maximum 16 MiB. */
  maxArtifactBytes?: number
  /** Maximum total serialized required task-event bytes; defaults to 256 KiB, maximum 16 MiB. */
  maxStateBytes?: number
  /** Maximum complete input bytes, including JSON wrappers; defaults to 16 KiB, maximum 1 MiB. */
  maxInputBytes?: number
  /** Maximum canonical output string bytes, including JSON quoting; defaults to 256 KiB, maximum 16 MiB. */
  maxOutputBytes?: number
}
/** Install the opt-in task tool.
 * @param ctx - owner of the registration.
 * @param config - explicit admission and resource limits.
 */
export function apply(ctx: Context, config: Config): void {
  installTaskTool(ctx, Config(config))
}

/** Loader configuration with finite positive integer limits. */
export const Config: z<Config> = z.object({
  allowedTools: z.array(z.string()).required(),
  maxTasks: z.number().step(1).min(1).max(32).default(8),
  maxSteps: z.number().step(1).min(1).max(64).default(16),
  maxOperations: z.number().step(1).min(1).max(128).default(64),
  maxArtifactBytes: z.number().step(1).min(1).max(16 * 1024 * 1024).default(1024 * 1024),
  maxStateBytes: z.number().step(1).min(1024).max(16 * 1024 * 1024).default(256 * 1024),
  maxInputBytes: z.number().step(1).min(256).max(1024 * 1024).default(16 * 1024),
  maxOutputBytes: z.number().step(1).min(256).max(16 * 1024 * 1024).default(256 * 1024),
})
