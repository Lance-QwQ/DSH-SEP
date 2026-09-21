/** Document view state belongs to tab records, including while their bodies are hidden. */
import type { Context } from '@deepseek-ai/cordis';
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit';
/**
 * Release retained view state on tab closure or plugin disposal.
 * @param ctx - owning preview plugin context.
 * @returns a callback accepting the tab, its lifetime signal, and its store's forget action; repeated holds share one listener.
 */
export declare function retainDocumentTabs(ctx: Context): (tabId: TabId, signal: AbortSignal, forget: (tabId: TabId) => void) => void;
//# sourceMappingURL=tab-lifetime.d.ts.map