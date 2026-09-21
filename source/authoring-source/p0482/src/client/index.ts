import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import { MemorySettingsSection, type MemorySettingsSectionInjected } from './MemorySettingsSection.tsx';
import { createMemorySettingsApi } from './api.ts';
import { en, zh } from './locales.ts';
import { resolveConfig, type MemoryUiConfig } from '../config.ts';
export { Config } from '../config.ts';
export type { MemorySettingsSectionInjected, MemorySettingsSectionProps } from './MemorySettingsSection.tsx';
export type { MemoryUiConfig } from '../config.ts';
/** Native slot, locale and private transport dependencies. */
export const inject = ['slots', 'locale', 'connection'];
/** Register one project memory settings section without adding a session mode. */
export function apply(ctx: ClientContext, config: MemoryUiConfig = {}): void {
  const resolved = resolveConfig(config);
  if (!resolved.enabled) return;
  const namespace = 'settings.sepMemory';
  ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'memory settings dictionaries');
  const t = ctx.locale.bind(namespace);
  const connection = ctx.get('connection') as ConnectionHandle;
  const api = createMemorySettingsApi(connection.rpc);
  const injected: MemorySettingsSectionInjected = { api, requestTimeoutMs: resolved.requestTimeoutMs, hooks: { connection: connection.generation } };
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'sep-memory', order: 35, label: () => t('title'), locale: namespace, inject: () => injected }, MemorySettingsSection));
}
