/** Compose Loader entry/patch structure and discovered plugin input schemas into one JSON Schema document. */
import type { CollectedConfigEntry, ConfigSchemaDiagnostic, ConfigSchemaDump } from './types.ts';
/**
 * Build a schema for the composed entry list and a separately addressable root-tree patch list.
 * Unknown plugin names remain open; only collected schemas supply plugin-specific constraints.
 * @param profile - selected profile name.
 * @param collected - declarations discovered without mounting plugins, including include descendants.
 * @param targets - last-id-wins patch targets from the root tree's patch index, excluding include descendants.
 * @param initialDiagnostics - composition and import diagnostics already collected.
 * @returns one JSON Schema document with explicit collection and projection annotations.
 */
export declare function buildConfigSchemaDocument(profile: string, collected: readonly CollectedConfigEntry[], targets: ReadonlyMap<string, CollectedConfigEntry>, initialDiagnostics: readonly ConfigSchemaDiagnostic[]): Promise<ConfigSchemaDump>;
//# sourceMappingURL=document.d.ts.map