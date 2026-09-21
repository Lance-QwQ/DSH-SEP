/** Missing-font notice and a non-modal details panel for one source version. */
import { type ReactNode } from 'react';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
/** Notice inputs supplied by the document owner and Office locale registration. */
export type FontNoticeProps = PropsLocale<'sidebarOffice'> & {
    readonly resourceAddress: string;
    readonly sourceVersion: string;
    readonly fonts: readonly string[];
};
/**
 * Show missing fonts; dismissal applies to the same source version while this component stays mounted.
 * @param props - source identity, converted content, and localized copy.
 * @returns a collapsible notice and its anchored details, or nothing when fonts are available.
 */
export declare function FontNotice({ resourceAddress, sourceVersion, fonts, t }: FontNoticeProps): ReactNode;
//# sourceMappingURL=FontNotice.d.ts.map