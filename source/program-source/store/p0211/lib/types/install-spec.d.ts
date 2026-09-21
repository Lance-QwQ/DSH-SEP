/**
 * Reading an install spec before pnpm sees it: which of pnpm's spec forms it
 * takes, and for a registry name whether it is one the registry can accept.
 * @module @deepseek-ai/dsh-plugin-manager/install-spec
 */
/** One spec read into its form and the parts an inspection needs. */
export type ParsedInstallSpec = {
    readonly kind: 'registry';
    readonly spec: string;
    readonly name: string;
    readonly range?: string;
} | {
    readonly kind: 'path';
    readonly spec: string;
    readonly path: string;
} | {
    readonly kind: 'tarball';
    readonly spec: string;
    readonly path?: string;
} | {
    readonly kind: 'git';
    readonly spec: string;
};
/** A spec neither pnpm nor the registry would take; `reason` is what the person reads. */
export declare class InvalidInstallSpecError extends Error {
    readonly spec: string;
    readonly reason: string;
    /**
     * @param spec - the spec as typed, trimmed.
     * @param reason - why it is refused, as one sentence.
     */
    constructor(spec: string, reason: string);
}
/**
 * Read a spec into its form. A path must be absolute: the Host's working
 * directory means nothing to the person typing into a browser, and a
 * relative path resolved against the profile would point inside it.
 * @param raw - the spec as typed.
 * @returns the parsed spec.
 * @throws {InvalidInstallSpecError} for an empty spec, a relative path, a name the
 * registry would refuse, or a URL that is neither a git host nor a tarball.
 */
export declare function parseInstallSpec(raw: string): ParsedInstallSpec;
