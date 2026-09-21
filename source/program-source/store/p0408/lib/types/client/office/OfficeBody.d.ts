/** Office owns source loading, conversion failures, and font notices around the shared PDF view. */
import { type ReactNode } from 'react';
import type { PropsLocale, PropsRenderSlots, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type { RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client';
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit';
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import type { DocumentBodyOwner, DocumentPreviewProps } from '../document/contract.ts';
import type { ReadOfficeDocument } from './cache.ts';
import type { OfficeStore } from './store.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /** PDF presentation supplied with Office-owned converted bytes. */
        'sidebar.right.tab.document.office.pdf': {
            kind: 'keyed';
            scope: 'session';
            owner: DocumentBodyOwner;
            hookContext: UseSidebarRightTabInfo;
            inject: {
                hooks: {
                    tabInfo: SlotHookFactory<'sidebar.right.tab.document', UseSidebarRightTabInfo>;
                };
            };
        };
    }
}
/** Office loading callbacks supplied by the registration's services. */
export interface OfficeBodyInjected {
    readonly read: ReadOfficeDocument;
    /** @param failure - declared file-read failure or conversion exception message. @returns localized display text. */
    readonly describeFailure: (failure: RemoteFailure | {
        readonly message: string;
    }) => string;
    /** @param tab - owning tab. @param signal - tab lifetime, including hidden bodies. */
    readonly retainTab: (tab: TabId, signal: AbortSignal) => void;
}
/** Office body inputs and its private PDF child. */
export type OfficeBodyProps = DocumentPreviewProps & PropsStore<OfficeStore> & OfficeBodyInjected & PropsLocale<'sidebarOffice'> & PropsRenderSlots<'sidebar.right.tab.document.office.pdf'>;
/**
 * Load one Office revision and preserve its result while its tab remains open.
 * @param props - renderer loading request, tab state, conversion callbacks, and PDF slot.
 * @returns conversion status or the font notice and PDF scrollport.
 */
export declare function OfficeBody(props: OfficeBodyProps): ReactNode;
//# sourceMappingURL=OfficeBody.d.ts.map