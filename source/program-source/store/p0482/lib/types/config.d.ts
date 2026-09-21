import z from '@deepseek-ai/schemastery';
/** Same row config reaches Host and browser halves. */
export interface MemoryUiConfig {
    enabled?: boolean;
    requestTimeoutMs?: number;
}
export declare const Config: z<MemoryUiConfig>;
/** Validate defaults also for direct non-Loader composition. */
export declare function resolveConfig(config?: MemoryUiConfig): Required<MemoryUiConfig>;
