import type { Context } from '@deepseek-ai/cordis';
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader';
import { type PatchOptions } from '@deepseek-ai/cordis-plugin-include';
/** Prepare profile or preset rows before the owning DSH caller passes them to Loader.
 * Only a compatibility conflict denies a row: an entry whose manifest cannot be resolved keeps
 * the Loader's own import failure. A denied ordinary row gains `disabled`; a native Include that
 * reaches a denied plugin is denied as a whole, because its file is never rewritten.
 * @param ctx Context carrying launcher-owned profile facts; non-profile contexts retain their rows.
 * @param entries Complete effective entry list, after patch composition.
 * @param parentURL Resolution base of the tree that will import these rows.
 * @param binName Diagnostic prefix for a denied row; defaults to `dsh`.
 * @returns Detached rows with incompatible entries denied; reads the profile compatibility file once.
 * @throws For malformed compatibility permissions or a profile composition without a resolution base.
 */
export declare function prepareProfileEntries(ctx: Context, entries: readonly EntryOptions[], parentURL: string | undefined, binName?: string): EntryOptions[];
/** Apply compatibility policy to the complete patch composition over a profile's empty root.
 * The caller passes every patch layer of the profile, because this returns one insertion patch for
 * that empty root: a non-empty root config would lose the caller's override patches by id.
 * @param ctx Profile context prepared by the launcher.
 * @param patches Original ordered profile patches; these remain unchanged.
 * @param parentURL Root Include's resolution base.
 * @param binName Diagnostic prefix for a denied row; defaults to `dsh`.
 * @returns One prepared insertion patch for profiles, or the original patches for non-profile callers.
 */
export declare function prepareProfilePatches(ctx: Context, patches: PatchOptions[], parentURL: string, binName?: string): PatchOptions[];
//# sourceMappingURL=compatibility-preflight.d.ts.map