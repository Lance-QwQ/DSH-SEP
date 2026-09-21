/**
 * Refuse missing, link-shaped, oversized, truncated, and non-PDF output.
 * @param path - kit output path in the provider-owned scratch directory.
 * @param limit - inclusive PDF byte limit.
 * @param signal - conversion lifetime.
 * @returns complete bytes independent of the scratch file.
 */
export declare function readPdf(path: string, limit: number, signal: AbortSignal): Promise<Uint8Array>;
//# sourceMappingURL=output.d.ts.map