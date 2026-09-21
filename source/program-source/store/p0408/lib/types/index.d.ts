/** Host configuration for browser document previews. */
import type { Context } from '@deepseek-ai/cordis';
import type { Config } from './config.ts';
export { Config } from './config.ts';
/**
 * Embed validated preview settings in browser pages.
 * @param ctx - Host context serving browser pages.
 * @param config - Cache limits adopted when the page loads.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map