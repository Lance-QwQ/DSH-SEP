/**
 * Filename suffix matching shared by the preview registry and the owner's
 * unviewable list, so every consumer normalizes paths and suffixes alike.
 */
/**
 * Normalize one declared suffix for comparison.
 * @param extension - declared file suffix, with or without a leading dot.
 * @returns the suffix lowercased with any leading dot dropped.
 */
export declare function normalizeSuffix(extension: string): string;
/**
 * The filename a path's suffixes are matched against.
 * @param path - decoded filename or file path; `\` is accepted as a separator.
 * @returns the lowercased final path segment.
 */
export declare function documentFileName(path: string): string;
/**
 * The longest declared suffix ending the filename.
 * @param name - lowercased filename from {@link documentFileName}.
 * @param extensions - declared suffixes; compound suffixes such as `tar.gz` are accepted.
 * @returns the matched suffix's normalized length, or 0 when none matches.
 */
export declare function matchedSuffixLength(name: string, extensions: readonly string[]): number;
//# sourceMappingURL=suffix.d.ts.map