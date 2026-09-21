/** Parent-side setup for one explicitly requested inherited control pipe. */
import type { Duplex, Readable, Writable } from 'node:stream';
/**
 * Read the optional extra pipe from Node's stdio tuple.
 * @param child - child whose requested extra pipe was allocated by Node.
 * @param control - requested transport, or undefined when absent.
 * @returns the parent duplex endpoint, absent when not requested or native startup failed.
 */
export declare function controlPipe(child: {
    readonly stdio: ReadonlyArray<Readable | Writable | null | undefined>;
}, control?: 'pipe'): Duplex | undefined;
/**
 * Stamp the private marker on a fresh child environment after rejecting a caller override.
 * @param env - newly materialized child environment, owned by the caller.
 * @param control - requested control transport, or undefined when absent.
 * @returns the same environment with the provider-owned launch marker when requested.
 */
export declare function controlEnvironment<T extends NodeJS.ProcessEnv>(env: T, control?: 'pipe'): T;
