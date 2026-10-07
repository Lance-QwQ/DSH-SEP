/** Read plugin display text and icons through exported resources without evaluating plugin code. */
import type { PluginLocalizedMeta } from '@deepseek-ai/dsh-package-manifest';
/**
 * Resolve a plugin resource through the active Node ESM resolver without evaluating it.
 * @param specifier - complete resource module specifier, including its locale filename.
 * @param parentURL - owning module-resolution base.
 * @returns the local filesystem path selected by Node and the active profile.
 * @throws when the resolver is unavailable or the resource cannot resolve to a local file.
 */
export declare function resolvePluginResource(specifier: string, parentURL: string): string;
/**
 * Read localized display text and the icon declared in a plugin's exported package.json.
 * Icons are manifest-relative SVG, PNG, JPEG, or WebP files of at most 256 KiB,
 * contained in the manifest directory after realpath resolution. Icon failures retain display text.
 * Non-package specifiers are skipped without invoking the resource resolver.
 * Language files share the directory containing the resolved English resource;
 * each file is resolved through the complete plugin specifier before reading.
 * Missing fields use the same address's package.json name/description. Translation
 * maps retain an English fallback, ultimately the full module specifier for titles and empty for descriptions.
 * @param specifier - configured plugin module name, including any package subpath.
 * @param parentURL - owning Loader tree's module-resolution base.
 * @returns display fields and any icon diagnostic, or undefined for non-package specifiers or absent metadata.
 */
export declare function readPluginMeta(specifier: string, parentURL: string): PluginLocalizedMeta | undefined;
//# sourceMappingURL=package-meta.d.ts.map