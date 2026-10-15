import { type ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
export type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type { BudgetSettingsApi } from '../budget-protocol.ts';
import type { BudgetLocaleKey } from './budget-locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'settings.sepBudget': BudgetLocaleKey;
    }
}
export interface BudgetSettingsSectionInjected {
    readonly api: BudgetSettingsApi;
    readonly requestTimeoutMs: number;
    readonly hooks: {
        readonly connection: {
            getSnapshot(): unknown;
            subscribe(listener: () => void): () => void;
        };
    };
}
export type BudgetSettingsSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.sepBudget'> & InjectFace<BudgetSettingsSectionInjected>;
export declare function parseLimit(input: string): number | null;
/** Defaults and window overrides are independent CAS writes; reads are authoritative. */
export declare function BudgetSettingsSection({ api, requestTimeoutMs, useConnection, t }: BudgetSettingsSectionProps): ReactNode;
//# sourceMappingURL=BudgetSettingsSection.d.ts.map