/** Boot-free inspection of declared plugin Config schemas using profile module resolution. */
import type { Profile, RuntimeResolution } from '../profile.ts';
import type { ConfigSchemaDiagnostic, ConfigSchemaDump } from './types.ts';
/**
 * Generate JSON Schema from parsed entry rows and root-tree patches without applying plugins or evaluating expressions.
 * Imports, Config getters, and lazy schema builders execute trusted plugin code; transform callbacks do not. Calls must not overlap
 * another profile-resolution interception; module imports remain cached after the interception is released.
 * @param profile - prepared profile whose directory anchors root module and include resolution.
 * @param entries - unvalidated rows from profile composition; malformed rows become positioned diagnostics without losing siblings.
 * @param resolution - the same immutable package resolution used for profile boot.
 * @param diagnostics - existing composition diagnostics; copied into the returned catalog.
 * @returns a JSON Schema document with partial-result diagnostics and Config references under `x-cordis`.
 * @throws when Node's profile module resolution cannot be installed.
 */
export declare function collectConfigSchemas(profile: Profile, entries: readonly unknown[], resolution: RuntimeResolution, diagnostics?: readonly ConfigSchemaDiagnostic[]): Promise<ConfigSchemaDump>;
//# sourceMappingURL=collect.d.ts.map