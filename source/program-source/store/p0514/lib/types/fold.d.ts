/** Strict replay for required task changes. @module @deepseek-ai/dsh-task-checkpoint */
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { z } from 'zod';
import type { TaskState } from './types.ts';
/** Reconstruct bounded task state from required events.
 * @param events - current session log.
 * @param maxBytes - maximum retained task-event bytes.
 * @returns tasks indexed by stable identity.
 */
export declare function foldTasks(events: readonly SessionEvent[], maxBytes: number): Map<string, TaskState>;
/** Strict input schema shared by plan creation and durable replay. */
export declare const stepSchema: z.ZodObject<{
    id: z.ZodPipe<z.ZodString, z.ZodTransform<import("./types.ts").TaskStepId, string>>;
    description: z.ZodString;
    acceptance: z.ZodString;
    artifacts: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        sha256: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
