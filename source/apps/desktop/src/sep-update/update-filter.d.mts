/** User-selected release filtering strength. */
export type UpdateFilterStrength = 'weak' | 'medium' | 'strong';
/** Validate a persisted or requested filtering strength.
 * @param value Filtering preference.
 * @returns The validated preference.
 */
export function validateUpdateFilter(value: unknown): UpdateFilterStrength;
/** Check stable or standard alpha.N, beta.N and rc.N versions against the preference.
 * @param version Release version from verified metadata.
 * @param strength Filtering preference.
 * @returns Whether the release channel is allowed.
 */
export function allowsUpdateChannel(version: string, strength: UpdateFilterStrength): boolean;
