/** Explicit source-draft tools; running and stopping use the existing Runner tools. @module */
import type { Context } from '@deepseek-ai/cordis';
/** Register only when the deployment explicitly configured bounded local storage.
 * @param ctx - the existing Cordis tool composition.
 */
export declare function registerPersistenceTools(ctx: Context): void;
