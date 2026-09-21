import type { Branded } from '@deepseek-ai/dsh-brand';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { FsTargetKey, FsVersion } from '@deepseek-ai/dsh-fs';
/** Stable task identity, validated as a UUID at every external boundary. */
export type TaskId = Branded<'TaskId'>;
/** Stable task-local ordered step identity. */
export type TaskStepId = Branded<'TaskStepId'>;
/** Stable effect-attempt identity, validated as a UUID at every external boundary. */
export type TaskOperationId = Branded<'TaskOperationId'>;
/** Fixed file-artifact acceptance expectation. */
export interface TaskArtifact {
    /** Relative path confined to the task's current project. */
    path: string;
    /** Expected lowercase SHA-256 of the complete file bytes. */
    sha256: string;
}
/** One immutable ordered task step. */
export interface TaskStep {
    /** Stable task-local step key. */
    id: TaskStepId;
    /** Human-readable work description. */
    description: string;
    /** Human-readable acceptance requirement; not executed as code. */
    acceptance: string;
    /** Files whose bytes must match before this step can complete. */
    artifacts: TaskArtifact[];
}
/** File evidence captured from a stable provider read. */
export interface TaskArtifactEvidence extends TaskArtifact {
    /** Opaque provider version at verification. */
    version: FsVersion;
    /** Actual complete file byte count. */
    bytes: number;
}
/** Durable attempt identity; an unfinished attempt is never automatically retried. */
export interface TaskOperation {
    /** Globally unique attempt UUID. */
    id: TaskOperationId;
    /** Stable step key. */
    stepId: TaskStepId;
    /** Registered tool requested by the current call. */
    tool: string;
    /** SHA-256 of the exact JSON arguments. */
    argumentsHash: string;
    /** Actual outer checkpoint tool call identity. */
    outerCallId: ToolCallId;
    /** Registry call identity reserved for the nested tool. */
    innerCallId: ToolCallId;
    /** Required event sequence durably recorded before dispatch. */
    intentSeq: number;
    /** Prepared and uncertain attempts both require explicit reconciliation after restart. */
    state: 'prepared' | 'completed' | 'uncertain';
    /** Compact tool result code, without its potentially sensitive payload. */
    resultCode: string;
    /** Verified file evidence, populated only after successful completion. */
    artifacts: TaskArtifactEvidence[];
}
/** Strictly reconstructed same-session task state. */
export interface TaskState {
    /** Stable task UUID. */
    id: TaskId;
    /** Compare-and-set revision beginning at one. */
    revision: number;
    /** Owning actual Session identity. */
    sessionId: SessionId;
    /** Owning actual Agent identity. */
    agentId: SessionId;
    /** Canonical provider project identity. */
    project: FsTargetKey;
    /** Immutable task objective. */
    objective: string;
    /** Immutable ordered steps. */
    steps: TaskStep[];
    /** Attempts retained permanently within the configured task budget. */
    operations: TaskOperation[];
    /** Permanent cancellation tombstone. */
    cancelled: boolean;
}
/** Required version-one task event. Missing fields are never defaulted during replay. */
export type TaskChange = {
    schema: 1;
    taskId: TaskId;
    revision: number;
    sessionId: SessionId;
    agentId: SessionId;
    project: FsTargetKey;
} & ({
    action: 'create';
    objective: string;
    steps: TaskStep[];
} | {
    action: 'prepare';
    operation: TaskOperation;
} | {
    action: 'settle';
    operation: TaskOperation;
} | {
    action: 'cancel';
});
