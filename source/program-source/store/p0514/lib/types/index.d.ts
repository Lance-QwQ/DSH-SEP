/** Explicit task checkpoints over the current durable Session. @module @deepseek-ai/dsh-task-checkpoint */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import './events.ts';
export { TaskId, TaskStepId, TaskOperationId } from './ids.ts';
export type { TaskState, TaskStep, TaskOperation, TaskArtifact, TaskArtifactEvidence, TaskChange } from './types.ts';
/** Cordis plugin name. */
export declare const name = "task-checkpoint";
/** Current execution, filesystem and durability services. */
export declare const inject: string[];
/** Explicit tool admission and bounded task resources. */
export interface Config {
    /** Registered tool names allowed for explicit task execution; no default grants. */
    allowedTools: string[];
    /** Maximum tasks retained per Session; defaults to 8, maximum 32. */
    maxTasks?: number;
    /** Maximum ordered steps per task; defaults to 16, maximum 64. */
    maxSteps?: number;
    /** Maximum retained attempts per task; defaults to 64, maximum 128. */
    maxOperations?: number;
    /** Maximum bytes read from one artifact; defaults to 1 MiB, maximum 16 MiB. */
    maxArtifactBytes?: number;
    /** Maximum total serialized required task-event bytes; defaults to 256 KiB, maximum 16 MiB. */
    maxStateBytes?: number;
    /** Maximum complete input bytes, including JSON wrappers; defaults to 16 KiB, maximum 1 MiB. */
    maxInputBytes?: number;
    /** Maximum canonical output string bytes, including JSON quoting; defaults to 256 KiB, maximum 16 MiB. */
    maxOutputBytes?: number;
}
/** Install the opt-in task tool.
 * @param ctx - owner of the registration.
 * @param config - explicit admission and resource limits.
 */
export declare function apply(ctx: Context, config: Config): void;
/** Loader configuration with finite positive integer limits. */
export declare const Config: z<Config>;
