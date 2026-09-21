import { type OfficeToPdfGeneration } from './identity.ts';
import type { OfficeExtension, OfficeToPdfRequest, OfficeToPdfResult } from './types.ts';
import type { Config } from './index.ts';
type Converted = Pick<OfficeToPdfResult, 'pdf' | 'missingFonts'>;
type Convert = (bytes: Uint8Array, extension: OfficeExtension, signal: AbortSignal) => Promise<Converted>;
/** One converter generation owns every queued source, conversion, reader, and retained PDF. */
export declare class ConversionQueue {
    private readonly config;
    private readonly generation;
    private readonly convert;
    private readonly ready;
    private readonly aliases;
    private readonly sources;
    private readonly digests;
    private readonly queue;
    private readonly tasks;
    private readonly jobs;
    private cachedBytes;
    private sourceBytes;
    private running;
    private background;
    private readers;
    private disposed;
    /**
     * @param config - validated queue, source, reader, and completed-result limits.
     * @param generation - provider lifetime; prevents reuse after engine or font replacement.
     * @param convert - executes one admitted conversion and settles after scratch cleanup.
     */
    constructor(config: Config, generation: OfficeToPdfGeneration, convert: Convert);
    /**
     * Admit metadata before loading source bytes and share conversion across authorized readers.
     * @param request - already-authorized metadata and deferred bounded source read.
     * @param signal - this reader's cancellation; the final reader cancels shared work.
     * @returns independent PDF bytes; busy or canceled readers reject without releasing active engine capacity early.
     */
    read(request: OfficeToPdfRequest, signal?: AbortSignal): Promise<OfficeToPdfResult>;
    /** Cancel all readers and wait until actual reads, conversions, and scratch cleanup finish. */
    dispose(): Promise<void>;
    private busy;
    private unavailable;
    private copy;
    private release;
    private cancel;
    private fail;
    private reservation;
    private drain;
    private execute;
    private finish;
    private retain;
}
export {};
//# sourceMappingURL=queue.d.ts.map