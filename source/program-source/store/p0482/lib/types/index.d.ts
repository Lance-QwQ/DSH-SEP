import type { Context } from '@deepseek-ai/cordis';
import { type MemoryUiConfig } from './config.ts';
export { Config } from './config.ts';
export type { MemoryUiConfig } from './config.ts';
/** Host bridge needs only Connection; a missing suite must not block browser boot. */
export declare const inject: string[];
export declare const name = "client-ui-settings-memory";
interface DesktopTransport {
    readonly kind: 'electron-owned-pipe';
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        sepDesktopTransport: DesktopTransport;
    }
}
/** Register owned exact routes on the shared Web/Desktop carrier; the suite owns project authorization. */
export declare function apply(ctx: Context, config?: MemoryUiConfig): void;
