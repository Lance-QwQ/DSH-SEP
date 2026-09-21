/** Loaded Office previews survive body remounts until reload or tab closure. */
import { type EngineStoreHandle } from '@deepseek-ai/dsh-client-store';
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit';
import type { OfficeFileBytes } from './cache.ts';
/** One requested source revision and its settled preview. */
export interface OfficeView {
    readonly revision: number;
    readonly file?: OfficeFileBytes;
    readonly failure?: {
        readonly code: string;
        readonly message: string;
    };
}
/** Office-owned content, isolated by tab identity. */
export interface OfficeState {
    byTab: Record<TabId, OfficeView>;
}
type OfficeActions = {
    loading: (state: OfficeState, tab: TabId, revision: number) => void;
    complete: (state: OfficeState, tab: TabId, revision: number, file: OfficeFileBytes) => void;
    failed: (state: OfficeState, tab: TabId, revision: number, failure: NonNullable<OfficeView['failure']>) => void;
    forget: (state: OfficeState, tab: TabId) => void;
};
/**
 * Retain Office contents across body remounts within a Session.
 * @returns the tab-content store declaration.
 */
export declare function createOfficeStore(): EngineStoreHandle<OfficeState, OfficeActions>;
/** Store declaration used by the Office body. */
export type OfficeStore = ReturnType<typeof createOfficeStore>;
export {};
//# sourceMappingURL=store.d.ts.map