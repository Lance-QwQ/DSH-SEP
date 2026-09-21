/** The UI owns no durable state or authoritative event stream to compare. */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "client-ui-settings-memory-invariant";
export declare const inject: string[];
/** Reserve companion ownership; behavior and disposal are covered through real composition tests. */
export declare const apply: (ctx: Context) => Promise<() => void>;
