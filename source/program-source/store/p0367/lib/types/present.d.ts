/** Pure replay-safe render intents for runtime inspection. */
import type { GenericCallView } from '@deepseek-ai/dsh-tools';
/**
 * Render provider-directory inspection.
 * @returns replay-safe generic call presentation.
 */
export declare function presentInspectListCall(): GenericCallView;
/**
 * Render one provider query.
 * @param args - target platform, provider, and method.
 * @returns replay-safe generic call presentation.
 */
export declare function presentInspectQueryCall(args: {
    platform: string;
    provider: string;
    method: string;
}): GenericCallView;
