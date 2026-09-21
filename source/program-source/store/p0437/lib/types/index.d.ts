import { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { WorkspaceFileScope } from '@deepseek-ai/dsh-api-workspace-files';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { OfficeToPdfGeneration } from './identity.ts';
import type { OfficeToPdfRequest, OfficeToPdfResult, OfficeToPdfPriority, RenderedDocumentBytes } from './types.ts';
export * from './errors.ts';
export * from './identity.ts';
export * from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Shared Office conversion and authorized workspace-file rendering. */
        officeToPdf: OfficeToPdf;
    }
}
/** Provider concurrency and kit rendering/font configuration. */
export interface Config {
    /** Maximum simultaneous conversions; queued callers remain cancellable. */
    maxConcurrentConversions: number;
    /** Maximum metadata-only jobs awaiting source admission. */
    maxQueuedJobs: number;
    /** Maximum outstanding conversion readers. */
    maxReaders: number;
    /** Maximum reserved bytes across admitted source reads and conversions. */
    maxSourceBytes: number;
    /** Maximum concurrent background jobs; zero refuses speculative work. */
    maxBackgroundConversions: number;
    /** Maximum retained content-addressed PDFs. */
    maxCachedEntries: number;
    /** Maximum retained PDF bytes. */
    maxCachedBytes: number;
    /** Maximum retained source-version aliases to cached content. */
    maxSourceEntries: number;
    /** Conversion deadline in milliseconds; excludes the DSH queue. */
    timeoutMs: number;
    /** Maximum authorized source bytes. */
    maxInputBytes: number;
    /** Maximum complete PDF bytes. */
    maxOutputBytes: number;
    /** Exported raster-image DPI. */
    maxImageResolution: number;
    /** Maximum OOXML ZIP entries. */
    maxArchiveEntries: number;
    /** Maximum total declared uncompressed OOXML bytes. */
    maxUncompressedBytes: number;
    /** Absolute font roots; omission uses the kit's platform defaults. */
    fontDirectories?: string[];
    /** Ordered font-family preference groups; omission retains the kit defaults. */
    fontFallbacks?: string[][];
    /** Maximum physical font files indexed by each converter. */
    maxFontFiles: number;
    /** Maximum individual font-file bytes. */
    maxFontFileBytes: number;
    /** Maximum original font bytes loaded for a conversion. */
    maxLoadedFontBytes: number;
}
/** Deployment defaults resolved before provider construction. */
export declare const Config: z<Partial<Config>, Config>;
/** A provider lifetime owns all converters, queued calls, and temporary files. */
export declare class OfficeToPdf extends TypertRemoteService {
    private readonly config;
    static Config: z<Partial<Config>, Config>;
    /** Changes whenever engine, font, or conversion configuration is replaced. */
    readonly generation: OfficeToPdfGeneration;
    private readonly remoteLifetime;
    private readonly remoteRequests;
    private readonly slots;
    private readonly queue;
    private readonly options;
    /**
     * @param ctx - owning Host context.
     * @param config - resolved rendering, font, and concurrency limits.
     */
    constructor(ctx: Context, config: Config);
    /**
     * Convert Office bytes without modifying the source or writing Session events.
     * @param request - authorized metadata and deferred bounded source read.
     * @param signal - caller cancellation; provider disposal also stops active work.
     * @returns caller-owned PDF bytes after conversion and scratch cleanup settle; canceled readers reject independently.
     * @throws {OfficeToPdfError} Invalid input, unusable output, or engine failure; cancellation rejects with its reason.
     */
    convert(request: OfficeToPdfRequest, signal?: AbortSignal): Promise<OfficeToPdfResult>;
    /**
     * Read and convert one Office file using the Session's ordinary filesystem authorization.
     * @param workspaceFileScope - Session header lookup shared with workspaceFiles.
     * @param path - absolute or workspace-relative Office path.
     * @param priority - foreground preview or speculative background work.
     * @param signal - Remote cancellation; disposal also cancels outstanding reads and conversions.
     * @returns complete base64 PDF with original source identity and missing font families.
     */
    render(workspaceFileScope: WorkspaceFileScope, path: string, priority: OfficeToPdfPriority, signal: AbortSignal): Promise<RenderedDocumentBytes>;
    /**
     * Read the current rendering generation before reusing a Client PDF.
     * @param signal - Remote caller cancellation.
     * @returns provider lifetime, replaced with rendering, font, or engine configuration.
     */
    getGeneration(signal: AbortSignal): OfficeToPdfGeneration;
    private renderFile;
    private convertBytes;
}
export default OfficeToPdf;
//# sourceMappingURL=index.d.ts.map