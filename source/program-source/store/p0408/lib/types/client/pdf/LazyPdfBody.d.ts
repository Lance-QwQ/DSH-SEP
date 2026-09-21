/** Load the PDF renderer only after a PDF body is mounted. */
import { type ReactNode } from 'react';
import type { PdfBodyProps } from './pdf.tsx';
/**
 * Suspend while the package-local PDF chunk arrives.
 * @param props - PDF body props supplied by the document slot.
 * @returns the deferred PDF renderer.
 */
export declare function LazyPdfBody(props: PdfBodyProps): ReactNode;
//# sourceMappingURL=LazyPdfBody.d.ts.map