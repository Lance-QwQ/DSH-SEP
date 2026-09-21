import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import type { MemorySettingsApi } from '../protocol.ts';
/** Bind package-private calls to Connection; validate every returned JSON record. */
export declare function createMemorySettingsApi(rpc: ClientConnectionRpc): MemorySettingsApi;
