import z from '@deepseek-ai/schemastery';
/** Same row config reaches Host and browser halves. */
export interface MemoryUiConfig { enabled?: boolean; requestTimeoutMs?: number }
export const Config: z<MemoryUiConfig> = z.object({ enabled: z.boolean().default(true), requestTimeoutMs: z.natural().min(1000).max(300000).default(120000) });
/** Validate defaults also for direct non-Loader composition. */
export function resolveConfig(config: MemoryUiConfig = {}): Required<MemoryUiConfig> {
  const enabled = config.enabled ?? true, requestTimeoutMs = config.requestTimeoutMs ?? 120000;
  if (typeof enabled !== 'boolean' || !Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1000 || requestTimeoutMs > 300000) throw new Error('MEMORY_SETTINGS_CONFIG');
  return { enabled, requestTimeoutMs };
}
