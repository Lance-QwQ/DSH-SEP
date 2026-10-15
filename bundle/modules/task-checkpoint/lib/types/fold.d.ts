/** Strict replay for required task changes. @module @deepseek-ai/dsh-task-checkpoint */
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { z } from 'zod';
import { SessionId } from '@deepseek-ai/dsh-session';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { FsTargetKey, FsVersion } from '@deepseek-ai/dsh-fs';
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
export declare const changeSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    action: z.ZodLiteral<"create">;
    objective: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        id: z.ZodPipe<z.ZodString, z.ZodTransform<import("./types.ts").TaskStepId, string>>;
        description: z.ZodString;
        acceptance: z.ZodString;
        artifacts: z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            sha256: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    schema: z.ZodLiteral<1>;
    taskId: z.ZodPipe<z.ZodUUID, z.ZodTransform<import("./types.ts").TaskId, string>>;
    revision: z.ZodNumber;
    sessionId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
    agentId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
    project: z.ZodPipe<z.ZodString, z.ZodTransform<FsTargetKey, string>>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"prepare">;
    operation: z.ZodObject<{
        id: z.ZodPipe<z.ZodUUID, z.ZodTransform<import("./types.ts").TaskOperationId, string>>;
        stepId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./types.ts").TaskStepId, string>>;
        tool: z.ZodString;
        argumentsHash: z.ZodString;
        outerCallId: z.ZodPipe<z.ZodString, z.ZodTransform<ToolCallId, string>>;
        innerCallId: z.ZodPipe<z.ZodString, z.ZodTransform<ToolCallId, string>>;
        intentSeq: z.ZodNumber;
        state: z.ZodEnum<{
            prepared: "prepared";
            completed: "completed";
            uncertain: "uncertain";
        }>;
        resultCode: z.ZodString;
        artifacts: z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            sha256: z.ZodString;
            version: z.ZodPipe<z.ZodString, z.ZodTransform<FsVersion, string>>;
            bytes: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    schema: z.ZodLiteral<1>;
    taskId: z.ZodPipe<z.ZodUUID, z.ZodTransform<import("./types.ts").TaskId, string>>;
    revision: z.ZodNumber;
    sessionId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
    agentId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
    project: z.ZodPipe<z.ZodString, z.ZodTransform<FsTargetKey, string>>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"settle">;
    operation: z.ZodObject<{
        id: z.ZodPipe<z.ZodUUID, z.ZodTransform<import("./types.ts").TaskOperationId, string>>;
        stepId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./types.ts").TaskStepId, string>>;
        tool: z.ZodString;
        argumentsHash: z.ZodString;
        outerCallId: z.ZodPipe<z.ZodString, z.ZodTransform<ToolCallId, string>>;
        innerCallId: z.ZodPipe<z.ZodString, z.ZodTransform<ToolCallId, string>>;
        intentSeq: z.ZodNumber;
        state: z.ZodEnum<{
            prepared: "prepared";
            completed: "completed";
            uncertain: "uncertain";
        }>;
        resultCode: z.ZodString;
        artifacts: z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            sha256: z.ZodString;
            version: z.ZodPipe<z.ZodString, z.ZodTransform<FsVersion, string>>;
            bytes: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    schema: z.ZodLiteral<1>;
    taskId: z.ZodPipe<z.ZodUUID, z.ZodTransform<import("./types.ts").TaskId, string>>;
    revision: z.ZodNumber;
    sessionId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
    agentId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
    project: z.ZodPipe<z.ZodString, z.ZodTransform<FsTargetKey, string>>;
}, z.core.$strict>, z.ZodObject<{
    action: z.ZodLiteral<"cancel">;
    schema: z.ZodLiteral<1>;
    taskId: z.ZodPipe<z.ZodUUID, z.ZodTransform<import("./types.ts").TaskId, string>>;
    revision: z.ZodNumber;
    sessionId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
    agentId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
    project: z.ZodPipe<z.ZodString, z.ZodTransform<FsTargetKey, string>>;
}, z.core.$strict>], "action">;
//# sourceMappingURL=fold.d.ts.map