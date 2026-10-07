/** Identity checks at the plugin-export and lazy-builder boundaries. */
import type { NativeConfigSchema } from './types.ts';
/**
 * Recognize the native Schemastery graph protocol without invoking a validator or serialization hook.
 * @param value - plugin Config export or lazy-builder result.
 * @returns whether native schema fields can be inspected.
 */
export declare function isNativeConfigSchema(value: unknown): value is NativeConfigSchema;
//# sourceMappingURL=native.d.ts.map