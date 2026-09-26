import type { Context } from '@deepseek-ai/cordis';
import type { ObjectJsonSchema, JsonSchemaNode, ToolOutputDefinition } from '@deepseek-ai/dsh-tools';
import type z from '@deepseek-ai/schemastery';

/** Per-executor tunables; runtime registration validates all inclusive ranges. */
export type WorkerLimits = Partial<Record<
  'timeoutMs' | 'cancelGraceMs' | 'maxConcurrency' | 'maxInputBytes' | 'maxConfigBytes' |
  'maxOutputBytes' | 'maxLogBytes' | 'maxJsonDepth' | 'maxJsonNodes' |
  'maxOldGenerationSizeMb' | 'maxYoungGenerationSizeMb' | 'stackSizeMb', number>>;
/** Reviewed local module and bounded input/output declarations. */
export type ModuleExecutorOptions = WorkerLimits & {
  name: string;
  description: string;
  parameters: ObjectJsonSchema;
  output: { schema: JsonSchemaNode };
  module: { url: string | URL; exportName?: string; config?: unknown };
};
/** Registered tools may also supply a host-thread renderer. */
export type ModuleToolOptions = Omit<ModuleExecutorOptions, 'output'> & {
  output: Pick<ToolOutputDefinition, 'schema'> & Partial<Pick<ToolOutputDefinition, 'render'>>;
};
/** Only cancellation and correlation identifiers cross to internal computation. */
export interface ModuleExecution {
  signal?: AbortSignal;
  callId?: string;
  rootCallId?: string;
}
/** Metadata excludes inputs, output text, credentials, logs, and live handles. */
export interface WorkerInspection {
  readonly started: number;
  readonly exited: number;
  readonly settled: number;
  readonly closed: boolean;
  readonly activeWorkers: number;
  readonly activeTimers: number;
  readonly lastOutcome: Readonly<{
    code: string; threadId: number | null; exitCode: number | null;
    timedOut: boolean; cancelled: boolean; forced: boolean; terminationRequested: boolean;
    stdoutBytes: number; stderrBytes: number; elapsedMs: number;
  }> | null;
}
/** A disposer settles only after its owned Workers have exited. */
export interface ModuleDisposer {
  (): Promise<void>;
  inspect(): WorkerInspection;
}
/** Internal execution is not a model-visible tool or an independent approval path. */
export interface ModuleExecutor<Input = unknown, Output = unknown> {
  readonly execute: (args: Input, execution?: ModuleExecution) => Promise<Output>;
  readonly dispose: ModuleDisposer;
  readonly inspect: () => WorkerInspection;
}
/** Create scoped computation; Input/Output must correspond to the supplied runtime schemas. */
export function createModuleExecutor<Input = unknown, Output = unknown>(ctx: Context, options: ModuleExecutorOptions): ModuleExecutor<Input, Output>;
/** Register an explicitly selected module as a normal DSH tool. */
export function registerModuleTool(ctx: Context, options: ModuleToolOptions): ModuleDisposer;
export const name: 'tool-worker';
export const inject: string[];
export interface PluginConfig { modules?: ModuleToolOptions[]; }
export const Config: z<PluginConfig>;
/** Apply validated module registrations to the owning plugin context. */
export function apply(ctx: Context, config?: PluginConfig): void;
