import { type ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
export type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type { MemorySettingsApi } from '../protocol.ts';
import type { MemoryLocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'settings.sepMemory': MemoryLocaleKey;
    }
}
/** Registration-owned transport callbacks and connection generation invalidation. */
export interface MemorySettingsSectionInjected {
    readonly api: MemorySettingsApi;
    readonly requestTimeoutMs: number;
    readonly hooks: {
        readonly connection: {
            getSnapshot(): unknown;
            subscribe(listener: () => void): () => void;
        };
    };
}
/** Native Settings section's derived owner, locale and injected props. */
export type MemorySettingsSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.sepMemory'> & InjectFace<MemorySettingsSectionInjected>;
/** Project-scoped controls display the last confirmed Host state until save settles. */
export declare function MemorySettingsSection({ api, requestTimeoutMs, useConnection, t }: MemorySettingsSectionProps): ReactNode;
