/** Office preview registration backed by authorized Host rendering and the existing PDF body. */
import type { Context } from '@deepseek-ai/cordis';
import { type OfficePreviewKey } from './locales.ts';
import type { Config } from '../../config.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        sidebarOffice: OfficePreviewKey;
    }
}
/**
 * Register Office previews with versioned PDF reuse and missing-font notices.
 * @param ctx - Client renderer registry, localized copy, and optional Host Remotes.
 * @param config - Resolved Office preview cache limits.
 */
export declare function apply(ctx: Context, config: Config['office']): void;
//# sourceMappingURL=index.d.ts.map