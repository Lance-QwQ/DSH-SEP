var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
/** Host LibreOffice kit provider with reusable converters and private disk input/output. */
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, isAbsolute, join } from 'node:path';
import { createConverter } from '@dsh-sep/office-converter';
import z from '@deepseek-ai/schemastery';
import { brandString } from '@deepseek-ai/dsh-brand';
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { OfficeToPdfError } from "./errors.js";
import { OfficeToPdfGeneration } from "./identity.js";
import { readPdf } from "./output.js";
import { ConversionQueue } from "./queue.js";
export * from "./errors.js";
export * from "./identity.js";
export * from "./types.js";
/** Deployment defaults resolved before provider construction. */
export const Config = z.object({
    maxConcurrentConversions: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(2),
    maxQueuedJobs: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(8),
    maxReaders: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(32),
    maxSourceBytes: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(104857600),
    maxBackgroundConversions: z.natural().min(0).max(Number.MAX_SAFE_INTEGER).default(1),
    maxCachedEntries: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(8),
    maxCachedBytes: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(134217728),
    maxSourceEntries: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(64),
    timeoutMs: z.natural().min(1).max(2_147_483_647).default(60_000),
    maxInputBytes: z.natural().min(1).max(Number.MAX_SAFE_INTEGER - 1).default(50 * 1024 * 1024),
    maxOutputBytes: z.natural().min(1).max(Number.MAX_SAFE_INTEGER - 1).default(100 * 1024 * 1024),
    maxImageResolution: z.natural().min(1).max(2_147_483_647).default(192),
    maxArchiveEntries: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(10_000),
    maxUncompressedBytes: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(250 * 1024 * 1024),
    fontDirectories: z.array(z.string().min(1)).extra('default', undefined),
    fontFallbacks: z.array(z.array(z.string().pattern(/\S/)).min(2)).extra('default', undefined),
    maxFontFiles: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(20_000),
    maxFontFileBytes: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(256 * 1024 * 1024),
    maxLoadedFontBytes: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(512 * 1024 * 1024),
});
/** A provider lifetime owns all converters, queued calls, and temporary files. */
let OfficeToPdf = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _render_decorators;
    let _getGeneration_decorators;
    return class OfficeToPdf extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _render_decorators = [Remote];
            _getGeneration_decorators = [Remote('generation')];
            __esDecorate(this, null, _render_decorators, { kind: "method", name: "render", static: false, private: false, access: { has: obj => "render" in obj, get: obj => obj.render }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getGeneration_decorators, { kind: "method", name: "getGeneration", static: false, private: false, access: { has: obj => "getGeneration" in obj, get: obj => obj.getGeneration }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        config = __runInitializers(this, _instanceExtraInitializers);
        static Config = Config;
        /** Changes whenever engine, font, or conversion configuration is replaced. */
        generation = OfficeToPdfGeneration(randomUUID());
        remoteLifetime = new AbortController();
        remoteRequests = new Set();
        slots = [];
        queue;
        options;
        /**
         * @param ctx - owning Host context.
         * @param config - resolved rendering, font, and concurrency limits.
         */
        constructor(ctx, config) {
            super(ctx, 'officeToPdf');
            this.config = config;
            if (config.fontDirectories?.some(path => !isAbsolute(path)))
                throw new Error('fontDirectories must contain absolute paths.');
            if (config.maxSourceBytes < config.maxInputBytes)
                throw new Error('maxSourceBytes must be at least maxInputBytes.');
            const { fontDirectories, fontFallbacks, timeoutMs, maxInputBytes, maxOutputBytes, maxImageResolution, maxArchiveEntries, maxUncompressedBytes, maxFontFiles, maxFontFileBytes, maxLoadedFontBytes } = config;
            this.options = { timeoutMs, maxInputBytes, maxOutputBytes, maxImageResolution, maxArchiveEntries, maxUncompressedBytes,
                maxFontFiles, maxFontFileBytes, maxLoadedFontBytes,
                ...(fontDirectories === undefined ? {} : { fontDirectories }),
                ...(fontFallbacks === undefined ? {} : { fontFallbacks }),
            };
            this.queue = new ConversionQueue(config, this.generation, (bytes, extension, signal) => this.convertBytes(bytes, extension, signal));
            ctx.effect(() => async () => {
                this.remoteLifetime.abort();
                await this.queue.dispose();
                await Promise.allSettled(this.remoteRequests);
                const results = await Promise.allSettled(this.slots.map(async (slot) => {
                    const converter = await slot.converter;
                    await converter?.dispose();
                }));
                const failures = results.filter(result => result.status === 'rejected');
                if (failures.length > 0)
                    throw new AggregateError(failures.map((result) => result.reason), 'LibreOffice converter disposal failed.');
            });
        }
        /**
         * Convert Office bytes without modifying the source or writing Session events.
         * @param request - authorized metadata and deferred bounded source read.
         * @param signal - caller cancellation; provider disposal also stops active work.
         * @returns caller-owned PDF bytes after conversion and scratch cleanup settle; canceled readers reject independently.
         * @throws {OfficeToPdfError} Invalid input, unusable output, or engine failure; cancellation rejects with its reason.
         */
        convert(request, signal) {
            return this.queue.read(request, signal);
        }
        /**
         * Read and convert one Office file using the Session's ordinary filesystem authorization.
         * @param workspaceFileScope - Session header lookup shared with workspaceFiles.
         * @param path - absolute or workspace-relative Office path.
         * @param priority - foreground preview or speculative background work.
         * @param signal - Remote cancellation; disposal also cancels outstanding reads and conversions.
         * @returns complete base64 PDF with original source identity and missing font families.
         */
        async render(workspaceFileScope, path, priority, signal) {
            const upstream = AbortSignal.any([signal, this.remoteLifetime.signal]);
            const operation = this.renderFile(workspaceFileScope, path, priority, upstream);
            this.remoteRequests.add(operation);
            try {
                return await operation;
            }
            finally {
                this.remoteRequests.delete(operation);
            }
        }
        /**
         * Read the current rendering generation before reusing a Client PDF.
         * @param signal - Remote caller cancellation.
         * @returns provider lifetime, replaced with rendering, font, or engine configuration.
         */
        getGeneration(signal) { signal.throwIfAborted(); return this.generation; }
        async renderFile(scope, path, priority, signal) {
            try {
                signal.throwIfAborted();
                const extension = extname(path).slice(1).toLowerCase();
                if (extension !== 'doc' && extension !== 'docx' && extension !== 'xls'
                    && extension !== 'xlsx' && extension !== 'ppt' && extension !== 'pptx') {
                    throw new OfficeToPdfError('unsupported-format', 'The path must end in doc, docx, xls, xlsx, ppt, or pptx.');
                }
                const files = this.ctx.get('workspaceFiles');
                const fs = this.ctx.get('fs');
                if (files === undefined || fs === undefined)
                    throw new OfficeToPdfError('unavailable', 'Office file rendering requires workspaceFiles and fs.');
                const authorized = await files.readBytes(scope, path, { offset: 0, length: 1 }, signal);
                const source = await files.stat(scope, path, signal);
                const assertUnchanged = (current) => {
                    if (current.absolutePath !== source.absolutePath || current.version !== source.version) {
                        throw new OfficeToPdfError('source-changed', 'The source changed.');
                    }
                };
                assertUnchanged(authorized);
                signal.throwIfAborted();
                const result = await this.convert({ extension, priority, source: {
                        key: brandString(JSON.stringify([scope.sessionId, scope.workspaceRoot, source.absolutePath])),
                        version: source.version, ...(source.bytes === undefined ? {} : { bytes: source.bytes }),
                        read: async (upstream, maxBytes) => {
                            const target = await fs.resolve(source.absolutePath, { signal: upstream });
                            const info = await fs.stat(target, upstream);
                            if (info === undefined || info.type !== 'file')
                                throw new OfficeToPdfError('source-changed', 'The source changed.');
                            assertUnchanged({ absolutePath: fs.processPath(target), version: info.version });
                            const bytes = await fs.readBytes(target, upstream, maxBytes).catch(async (cause) => {
                                if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'FS_TOO_LARGE') {
                                    assertUnchanged(await files.stat(scope, path, upstream));
                                    throw new OfficeToPdfError('input-too-large', 'The source exceeds the reserved byte capacity.', { cause });
                                }
                                throw cause;
                            });
                            upstream.throwIfAborted();
                            const after = await files.stat(scope, path, upstream);
                            assertUnchanged(after);
                            return { bytes, version: source.version };
                        },
                    } }, signal);
                signal.throwIfAborted();
                return { absolutePath: source.absolutePath, version: source.version,
                    offset: 0, eof: true, bytes: result.pdf.byteLength, data: Buffer.from(result.pdf).toString('base64'), missingFonts: result.missingFonts, fontDiagnostics: result.fontDiagnostics, generation: result.generation };
            }
            catch (cause) {
                if (signal.aborted)
                    throw new RemoteError('gateway/cancelled', 'The document preview was cancelled.', {}, { cause });
                if (cause instanceof OfficeToPdfError) {
                    throw new RemoteError('document-render/failed', 'Office conversion failed.', { reason: cause.code }, { cause });
                }
                throw cause;
            }
        }
        async convertBytes(bytes, extension, signal) {
            signal.throwIfAborted();
            let slot = this.slots.find(candidate => !candidate.busy);
            if (slot === undefined) {
                slot = { busy: false };
                this.slots.push(slot);
            }
            slot.busy = true;
            let directory;
            try {
                if (slot.converter === undefined) {
                    slot.converter = createConverter(this.options).catch((error) => {
                        delete slot.converter;
                        throw error;
                    });
                }
                const converter = await slot.converter;
                signal.throwIfAborted();
                directory = await mkdtemp(join(tmpdir(), 'dsh-office-to-pdf-'));
                const inputPath = join(directory, `source.${extension}`);
                const outputPath = join(directory, 'converted.pdf');
                await writeFile(inputPath, bytes, { flag: 'wx', mode: 0o600, signal });
                signal.throwIfAborted();
                const result = await converter.render({ inputPath, outputPath }, signal);
                signal.throwIfAborted();
                let pdf;
                try {
                    pdf = await readPdf(outputPath, this.config.maxOutputBytes, signal);
                }
                catch (cause) {
                    if (cause instanceof OfficeToPdfError)
                        throw cause;
                    throw new OfficeToPdfError('invalid-output', 'The converter PDF could not be read.', { cause });
                }
                signal.throwIfAborted();
                return { pdf, missingFonts: result.missingFonts, fontDiagnostics: result.fontDiagnostics };
            }
            catch (cause) {
                signal.throwIfAborted();
                if (cause instanceof OfficeToPdfError)
                    throw cause;
                const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined;
                switch (code) {
                    case 'input-too-large':
                    case 'output-too-large':
                    case 'invalid-document':
                    case 'unsupported-format':
                    case 'invalid-output':
                    case 'timeout':
                    case 'unavailable':
                        throw new OfficeToPdfError(code, 'LibreOffice conversion failed.', { cause });
                    default: throw new OfficeToPdfError('failed', 'LibreOffice conversion failed.', { cause });
                }
            }
            finally {
                try {
                    if (directory !== undefined)
                        await rm(directory, { recursive: true, force: true });
                }
                finally {
                    slot.busy = false;
                }
            }
        }
    };
})();
export { OfficeToPdf };
export default OfficeToPdf;
//# sourceMappingURL=index.js.map