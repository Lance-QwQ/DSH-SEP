import type { CollectedOutput } from '@deepseek-ai/dsh-subprocess';
/**
 * Prepare fallible output storage before starting a managed native process.
 * @param internals - optional caller-owned spill directory.
 * @returns binding inputs whose spill directory is ready for use.
 */
export declare function prepareManagedProcessBinding(internals?: {
    spillDir?: string;
}): {
    spillDir: string;
};
/**
 * Collects one stream with a bounded in-memory tail. With a spill cap, on
 * first overflow a spill file is created and every chunk (including those
 * already collected) is appended there while the full stream remains within
 * the cap; without one, only the in-memory tail is ever retained (the
 * diagnostic-tail shape — a language server's stderr).
 *
 * Tail-keep rationale (pi/OpenCode): errors and final results cluster at the
 * end of command output; the spill file covers the head.
 */
export declare class OutputCollector {
    private readonly maxBytes;
    private readonly maxSpillBytes;
    private readonly label;
    private readonly spillDir;
    private chunks;
    private bytes;
    private dropped;
    private spillFd;
    private spillFile;
    private spillDisabled;
    /** Total bytes ever pushed (not just retained). */
    private total;
    constructor(maxBytes: number, maxSpillBytes: number | undefined, label: string, spillDir: string);
    /**
     * Ingest one stream chunk, counting it toward the whole-stream total. On
     * first overflow of the in-memory cap a spill file is opened (when spilling
     * is enabled) and every chunk (already-collected ones included) is appended
     * there from then on; the in-memory tail then drops whole chunks from its
     * head (or the head of a single over-cap chunk) until it fits the cap again.
     * @param chunk - the raw bytes from one stream 'data' event.
     */
    push(chunk: Buffer): void;
    /** Open the spill file lazily and append `chunk` (and any prior chunks once). */
    private spillAll;
    /** Stop spilling and remove the file once it can no longer hold the complete stream. */
    private discardSpill;
    /**
     * Incremental read in whole-stream byte coordinates: returns everything
     * pushed since `fromByte`. When `fromByte` has already slid out of the
     * in-memory tail window, the read is `lossy` — it returns the whole
     * retained tail and the gap is only recoverable from the spill file.
     * @param fromByte - whole-stream offset to resume from (a prior read's `nextOffset`; 0 for the first read).
     * @returns the delta text, the offset for the next read, the `lossy` flag, and the spill path when one was created.
     */
    readFrom(fromByte: number): {
        text: string;
        nextOffset: number;
        lossy: boolean;
        spillPath?: string;
    };
    /**
     * Copy the retained raw tail with its position in the complete observed stream.
     * @returns independent tail bytes and the total byte count before truncation.
     */
    snapshot(): {
        bytes: Buffer;
        totalBytes: number;
    };
    /**
     * Close the spill file once the stream has ended. A failed close (delayed
     * writeback fault) stops advertising the spill path — the file may be
     * missing its tail — while every in-memory read keeps working. Idempotent;
     * the spawn path seals both collectors at settlement so reads after exit
     * never point at a still-open file.
     */
    seal(): void;
    /**
     * Seal the spill file and return the final output.
     * @returns the final collected output: tail text, truncation flag, and the spill path when intact.
     */
    finalize(): CollectedOutput;
}
