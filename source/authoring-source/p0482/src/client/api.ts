import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { MemoryControls, MemoryProjectList, MemorySettingsApi, MemorySnapshot } from '../protocol.ts';
import { safeErrorCode } from '../errors.ts';
/** Bind package-private calls to Connection; validate every returned JSON record. */
export function createMemorySettingsApi(rpc: ClientConnectionRpc): MemorySettingsApi {
  const call = async (endpoint: string, payload: unknown, signal?: AbortSignal): Promise<unknown> => {
    const result = await rpc.call('/api', 'sep-memory/' + endpoint, payload, signal);
    if (!result.ok) throw new Error(safeErrorCode(result.error.message));
    return result.value;
  };
  return {
    list: async signal => parseList(await call('list', {}, signal)),
    get: async (projectId, signal) => parseSnapshot(await call('get', { projectId }, signal), projectId),
    update: async (projectId, expected, controls, signal) => parseSnapshot(await call('update', { projectId, expected, controls }, signal), projectId),
  };
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown, maximum: number): value is string { return typeof value === 'string' && value.length > 0 && value.length <= maximum; }
function pair(value: unknown): value is MemoryControls { return record(value) && typeof value.capture === 'boolean' && typeof value.recall === 'boolean'; }
function nullableCode(value: unknown): boolean { return value === null || typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value); }
function invalid(): never { throw new Error('MEMORY_SETTINGS_RESPONSE'); }
function parseList(value: unknown): MemoryProjectList {
  if (!record(value) || value.version !== 1 || typeof value.available !== 'boolean' || !nullableCode(value.reason) || !Array.isArray(value.projects) || value.projects.length > 1024) return invalid();
  const ids = new Set<string>();
  for (const project of value.projects) {
    if (!record(project) || !text(project.id, 4096) || !text(project.label, 32768) || !text(project.root, 32768) || ids.has(project.id)) return invalid();
    ids.add(project.id);
  }
  return value as unknown as MemoryProjectList;
}
function parseSnapshot(value: unknown, projectId: string): MemorySnapshot {
  if (!record(value) || value.version !== 1 || value.projectId !== projectId || !pair(value.controls) || !pair(value.configured) || !pair(value.effective)
    || !record(value.runtime) || !['ready', 'degraded', 'disabled', 'unavailable'].includes(String(value.runtime.state)) || !nullableCode(value.runtime.lastError)
    || value.scope !== 'project' || value.transition !== 'next-operation') return invalid();
  return value as unknown as MemorySnapshot;
}

