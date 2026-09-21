/** Bounded asynchronous diff preparation and final committed-mutation notices. @module */
import type { Context } from '@deepseek-ai/cordis';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { FileDiff, ToolExecution, ToolExecutionResult, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { WorkerLimits } from 'dsh-tool-worker';
import type { DiffInput } from './diff-worker.ts';
/** Limits shared by write/edit previews belonging to this plugin instance. */
export type DiffWorkerConfig = WorkerLimits;
/** A filesystem provider's successful return, independent of later display/cancellation. */
export interface CommitReceipt {
    committed: true;
    path: string;
    operation: 'create' | 'update';
    version: string;
    mutationId?: string;
}
/** Versioned computed data; unavailable previews never fall back to host computation. */
export interface PreparedDiff {
    version: 1;
    status: 'ready' | 'unavailable' | 'not_requested';
    reason: string;
    diffs: FileDiff[];
}
/** Schema fragment shared by the two filesystem tool results. */
export declare const preparedDiffSchema: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: true;
    readonly properties: {
        readonly version: {
            readonly type: "integer";
            readonly const: 1;
            readonly required: true;
        };
        readonly status: {
            readonly type: "string";
            readonly enum: readonly ["ready", "unavailable", "not_requested"];
            readonly required: true;
        };
        readonly reason: {
            readonly type: "string";
            readonly required: true;
        };
        readonly diffs: {
            readonly type: "array";
            readonly required: true;
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly path: {
                        readonly type: "string";
                        readonly required: true;
                    };
                    readonly oldText: {
                        readonly required: true;
                        readonly oneOf: readonly [{
                            readonly type: "string";
                        }, {
                            readonly type: "null";
                        }];
                    };
                    readonly newText: {
                        readonly type: "string";
                        readonly required: true;
                    };
                };
            };
        };
    };
};
/** Schema for canonical successful-commit metadata. */
export declare const commitSchema: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: true;
    readonly properties: {
        readonly committed: {
            readonly type: "boolean";
            readonly const: true;
            readonly required: true;
        };
        readonly path: {
            readonly type: "string";
            readonly required: true;
        };
        readonly operation: {
            readonly type: "string";
            readonly enum: readonly ["create", "update"];
            readonly required: true;
        };
        readonly version: {
            readonly type: "string";
            readonly required: true;
        };
        readonly mutationId: {
            readonly type: "string";
        };
    };
};
/** Create one shared executor and metadata-only receipts owned by actual dispatch tokens.
 * @param ctx - plugin context owning module execution and disposal.
 * @param config - validated numeric deployment overrides, never model parameters.
 * @returns commit recording, async preview preparation, and a total final content callback.
 */
export declare function createDiffPresentation(ctx: Context, config: DiffWorkerConfig): {
    /** Record only after the provider has returned success, before callbacks or preview work. */
    record(exec: ToolRunContext, commit: CommitReceipt): void;
    /** Compute detached presentation; failure changes only the preview, never the file outcome. */
    prepare(exec: ToolRunContext, input: DiffInput): Promise<PreparedDiff>;
    /** Preserve known side effects even when the registry selects cancellation or pipeline error. */
    finalizeContent(exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): ContentBlock[] | undefined;
};
/** In-process helper used only by the filesystem consumer, with no new model tool. */
export type DiffPresentation = ReturnType<typeof createDiffPresentation>;
/** Prepared result metadata is replayable without rerunning the difference algorithm.
 * @param presentation - schema-validated versioned computation result.
 * @param commit - the confirmed provider outcome.
 * @returns contextual hunks and metadata explaining any omitted preview.
 */
export declare function preparedDiffMeta(presentation: PreparedDiff, commit: CommitReceipt): {
    diffs: {
        path: string;
        oldText: string | null;
        newText: string;
    }[];
    diffPresentation: {
        version: 1;
        status: "ready" | "unavailable" | "not_requested";
        reason: string;
    };
    commit: {
        committed: true;
        path: string;
        operation: "create" | "update";
        version: string;
        mutationId?: string;
    };
};
/** Detect new receipts so an omitted preview cannot expand into the old whole-file fallback. */
export declare function hasPreparedDiffMeta(meta: unknown): boolean;
