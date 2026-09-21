/** Required task-stream invariant companion. @module @deepseek-ai/dsh-task-checkpoint/invariant */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion name. */
export declare const name = "task-checkpoint-invariant";
/** Invariant registry dependency. */
export declare const inject: string[];
/** Register strict revision, identity and permanent-cancellation checks.
 * @param ctx - context carrying the invariant registry.
 * @returns the companion registration disposer.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
