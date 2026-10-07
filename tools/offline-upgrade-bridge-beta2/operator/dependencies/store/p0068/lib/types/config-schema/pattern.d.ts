/** Conservative compatibility checks between native RegExp validation and Unicode JSON Schema patterns. */
/**
 * Create a checker for patterns that can retain native acceptance under Unicode regex semantics.
 * Unrecognized flagless syntax stays explicitly partial rather than becoming a misleading constraint.
 * @returns the compatibility predicate; parsing never executes the regular expression against config values.
 */
export declare function createPatternCheck(): Promise<(source: string, flags?: string) => boolean>;
//# sourceMappingURL=pattern.d.ts.map