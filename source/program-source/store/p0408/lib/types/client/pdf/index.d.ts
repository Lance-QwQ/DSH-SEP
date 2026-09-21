/** Builtin PDF registration through document metadata and the keyed body slot. */
import type { Context } from '@deepseek-ai/cordis';
import type { DocumentPreviewDefinition } from '../document/registry.ts';
import type { PdfBodyInjected } from './pdf.tsx';
import type { BoundActions } from '@deepseek-ai/dsh-client-store';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { type PdfStore } from './store.ts';
/** PDF metadata and keyed body share this package-local implementation identity. */
export declare const PDF_BODY_ID = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/pdf";
/**
 * Describe the builtin PDF renderer independently from its keyed body slot.
 * @param title - locale-owned implementation name.
 * @returns the complete-file PDF registration.
 */
export declare function pdfBodyDefinition(title: () => string): DocumentPreviewDefinition;
/** @param ctx - context carrying the locale, document registry, and slot registry. */
export declare function apply(ctx: Context): void;
/**
 * Retain PDF viewing state for a document entry's tab lifetime.
 * @param ctx - owning registration context.
 * @returns the store and injection shared by ordinary and Office PDF registrations.
 */
export declare function pdfBodyRegistration(ctx: Context): {
    store: PdfStore;
    inject: (sessionId: SessionId, actions: BoundActions<PdfStore>) => PdfBodyInjected;
};
//# sourceMappingURL=index.d.ts.map