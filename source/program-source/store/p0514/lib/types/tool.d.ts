import type { Context } from '@deepseek-ai/cordis';
import type { Config } from './index.ts';
/** Install the bounded explicit tool and its owned operation cleanup.
 * @param ctx - current execution and persistence services.
 * @param config - normalized configuration.
 */
export declare function installTaskTool(ctx: Context, config: Config): void;
