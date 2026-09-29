import type { Context } from '@deepseek-ai/cordis';
import type { HostConnectionHandle, ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection';
import { resolveConfig, type MemoryUiConfig } from './config.ts';
import { safeErrorCode } from './errors.ts';
export { Config } from './config.ts';
export type { MemoryUiConfig } from './config.ts';
/** Host bridge needs only Connection; a missing suite must not block browser boot. */
export const inject = ['connection'];
export const name = 'client-ui-settings-memory';
type Method = 'list' | 'get' | 'update' | 'updateDefault';
type SettingsMethod = (payload: unknown, options: { signal: AbortSignal }) => Promise<unknown>;
interface SuiteHandle { readonly memorySettings?: Partial<Record<Method, SettingsMethod>>; readonly budgetSettings?: Partial<Record<Method, SettingsMethod>> }
/** Bound a settings envelope before parsing, independently of the carrier's attachment limit. */
async function readEnvelope(request: Request): Promise<unknown | Response> {
  const reader = request.body?.getReader();
  if (reader === undefined) return new Response('empty body', { status: 400 });
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > 16384) { await reader.cancel(); return new Response('body limit', { status: 413 }); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch { return new Response('invalid body', { status: 400 }); }
  finally { reader.releaseLock(); }
}
/** Register owned exact routes on the shared Web/Desktop carrier; the suite owns project authorization. */
export function apply(ctx: Context, config: MemoryUiConfig = {}): void {
  if (!resolveConfig(config).enabled) return;
  const connection = ctx.get('connection') as HostConnectionHandle;
  for (const budget of [false, true]) {
  const prefix = budget ? 'sep-budget/' : 'sep-memory/';
  const unavailable = budget ? 'BUDGET_SETTINGS_UNAVAILABLE' : 'MEMORY_SETTINGS_UNAVAILABLE';
  const handler = async (endpoint: string, payload: unknown, signal: AbortSignal): Promise<Awaited<ReturnType<ConnectionRpcHandler>>> => {
    if (endpoint !== 'list' && endpoint !== 'get' && endpoint !== 'update' && !(budget && endpoint === 'updateDefault')) return { ok: false, error: { code: 'bad-request', message: 'MEMORY_SETTINGS_INPUT', details: { issues: [] } } };
    if (signal.aborted) return { ok: false, error: { code: 'cancelled', message: 'ABORTED', details: {} } };
    const method = (ctx.get('suiteEnhancements') as SuiteHandle | undefined)?.[budget ? 'budgetSettings' : 'memorySettings']?.[endpoint as Method];
    if (method === undefined) return endpoint === 'list'
      ? { ok: true, value: budget ? { version: 1, available: false, reason: unavailable, sessions: [] } : { version: 1, available: false, reason: unavailable, projects: [] } }
      : { ok: false, error: { code: 'internal', message: unavailable, details: {} } };
    try { return { ok: true, value: await method(payload, { signal }) }; }
    catch (error) {
      const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined;
      return { ok: false, error: { code: 'internal', message: budget ? safeBudgetErrorCode(code) : safeErrorCode(code), details: {} } };
    }
  };
  for (const method of (budget ? ['list', 'get', 'update', 'updateDefault'] : ['list', 'get', 'update'])) {
    const endpoint = prefix + method;
    connection.fetch.register({ path: '/api/' + endpoint, methods: ['POST'], requestBody: 'buffered',
      async fetch(request) {
        // Web carrier authentication runs before dispatch. The actual bind address,
        // rather than a spoofable Host header, restricts this local settings surface.
        // Desktop ownership is provided only by the private Desktop Host entry.
        const ownedDesktop = (ctx.get('sepDesktopTransport') as { readonly kind?: string } | undefined)?.kind === 'electron-owned-pipe';
        const web = ctx.get('webServer') as { readonly host?: string } | undefined;
        const url = new URL(request.url);
        const localWeb = web?.host === '127.0.0.1' && (url.protocol === 'http:' || url.protocol === 'https:');
        if (!(ownedDesktop && url.protocol === 'dsh-app:') && !localWeb) return new Response('forbidden', { status: 403 });
        if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return new Response('content type', { status: 415 });
        const body = await readEnvelope(request);
        if (body instanceof Response) return body;
        if (body === null || typeof body !== 'object' || !('type' in body) || body.type !== 'client-request'
          || !('rpcId' in body) || typeof body.rpcId !== 'string' || body.rpcId.length > 256
          || !('method' in body) || body.method !== endpoint || !('payload' in body)) return new Response('invalid envelope', { status: 400 });
        const result = await handler(method, body.payload, request.signal);
        return Response.json({ type: 'server-response', rpcId: body.rpcId, result });
      },
    });
  }
  }
}

const BUDGET_PUBLIC_CODES = new Set(['BUDGET_SETTINGS_CONFLICT', 'BUDGET_SETTINGS_SESSION', 'BUDGET_SETTINGS_UNAVAILABLE', 'BUDGET_SETTINGS_INPUT', 'BUDGET_LEDGER_MISSING', 'BUDGET_LEDGER_CHANGED', 'BUDGET_LOCKED', 'DISPOSED', 'ABORTED']);
function safeBudgetErrorCode(value: unknown): string { return typeof value === 'string' && BUDGET_PUBLIC_CODES.has(value) ? value : 'BUDGET_SETTINGS_UNAVAILABLE'; }
