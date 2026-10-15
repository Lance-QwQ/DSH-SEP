import { type ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { AssessmentApi } from './assessment-api.ts';
import type { AssessmentLocaleKey } from './assessment-locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'settings.sepAssessment': AssessmentLocaleKey;
    }
}
export interface AssessmentSettingsInjected {
    readonly api: AssessmentApi;
    readonly requestTimeoutMs: number;
    readonly hooks: {
        readonly connection: {
            getSnapshot(): unknown;
            subscribe(listener: () => void): () => void;
        };
    };
}
type Props = PropsRuntime<'settings.section'> & PropsLocale<'settings.sepAssessment'> & InjectFace<AssessmentSettingsInjected>;
/** Saved state owns the switch; uncertain writes are read back without retrying a paid task. */
export declare function AssessmentSettingsSection({ api, requestTimeoutMs, useConnection, t }: Props): ReactNode;
export {};
//# sourceMappingURL=AssessmentSettingsSection.d.ts.map