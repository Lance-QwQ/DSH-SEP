/** Project native Config input constraints without executing their validators or transform callbacks. */
import type { ConfigJsonSchema, ConfigJsonSchemaObject, NativeConfigSchema } from './types.ts';
/** Definition that projected value positions reference as `#/$defs/loaderExpression`; an enclosing document must define it. */
export declare const LOADER_EXPRESSION_SCHEMA: ConfigJsonSchemaObject;
/** One Config projection; unknown omission behavior is explicit rather than an invented default. */
export interface ConfigProjection {
    /** Object-form root: value positions are wrapped in `anyOf` with the loader-expression reference. */
    schema: ConfigJsonSchemaObject;
    definitions: Record<string, ConfigJsonSchema>;
    acceptsMissing: boolean | 'unknown';
    limitations: string[];
}
/**
 * Create an invocation-local projector. Ajv checks only literal defaults against generated schemas;
 * it does not fill defaults, coerce input, or call native plugin validators. Opaque input or metadata effects
 * widen validation with explicit limitations instead of simulating native mutation.
 * @returns a function projecting one trusted native Config graph into the enclosing document's definitions.
 */
export declare function createConfigProjector(): Promise<(root: NativeConfigSchema, prefix: string) => ConfigProjection>;
//# sourceMappingURL=projector.d.ts.map