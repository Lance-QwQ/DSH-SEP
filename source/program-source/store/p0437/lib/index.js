import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, isAbsolute, join } from "node:path";
import { createConverter } from "@dsh-sep/office-converter";
import z from "@deepseek-ai/schemastery";
import { brandString } from "@deepseek-ai/dsh-brand";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { constants } from "node:fs";
//#region lib/types/errors.js
/** Classified conversion failure; engine details stay in the cause. */
var OfficeToPdfError = class extends Error {
	code;
	/**
	* @param code - category suitable for a conversion consumer.
	* @param message - diagnostic explaining the failed conversion.
	* @param options - underlying engine or filesystem failure.
	*/
	constructor(code, message, options) {
		super(message, options);
		this.code = code;
		this.name = "OfficeToPdfError";
	}
};
//#endregion
//#region lib/types/identity.js
/** Source locators and converter-owned identities for shared PDF reuse. */
/**
* Label an authorized source locator for pre-read deduplication.
* @param key - unambiguous encoding of authorization scope, execution world, and canonical path.
* @returns branded source locator; source authorization remains the caller's responsibility.
*/
function OfficeSourceKey(key) {
	return brandString(key);
}
/**
* Label a provider lifetime.
* @param value - unique generation created by the provider.
* @returns branded converter generation.
*/
function OfficeToPdfGeneration(value) {
	return brandString(value);
}
/**
* Label a converter-owned content identity.
* @param value - generation and content identity created by the provider.
* @returns branded conversion identity.
*/
function OfficeToPdfKey(value) {
	return brandString(value);
}
//#endregion
//#region lib/types/output.js
/** Read only the bounded, regular PDF created inside a private task directory. */
/**
* Refuse missing, link-shaped, oversized, truncated, and non-PDF output.
* @param path - kit output path in the provider-owned scratch directory.
* @param limit - inclusive PDF byte limit.
* @param signal - conversion lifetime.
* @returns complete bytes independent of the scratch file.
*/
async function readPdf(path, limit, signal) {
	signal.throwIfAborted();
	if (!(await lstat(path)).isFile()) throw new OfficeToPdfError("invalid-output", "The converter output is not a regular file.");
	const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const info = await file.stat();
		if (!info.isFile()) throw new OfficeToPdfError("invalid-output", "The converter output is not a regular file.");
		if (info.size > limit) throw new OfficeToPdfError("output-too-large", "The converted PDF exceeds maxOutputBytes.");
		const bytes = Buffer.alloc(info.size + 1);
		let length = 0;
		while (length < bytes.length) {
			signal.throwIfAborted();
			const read = await file.read(bytes, length, bytes.length - length, null);
			if (read.bytesRead === 0) break;
			length += read.bytesRead;
		}
		signal.throwIfAborted();
		if (length > limit) throw new OfficeToPdfError("output-too-large", "The converted PDF exceeds maxOutputBytes.");
		const pdf = bytes.subarray(0, length);
		if (length !== info.size || !pdf.subarray(0, 8).toString("ascii").match(/^%PDF-\d\.\d/u) || !pdf.subarray(-1024).toString("ascii").trimEnd().endsWith("%%EOF")) throw new OfficeToPdfError("invalid-output", "The converter did not produce a complete PDF.");
		return pdf;
	} finally {
		await file.close();
	}
}
//#endregion
//#region lib/types/queue.js
/** Bounded source admission, shared content conversion, and caller-owned PDF delivery. */
/** One converter generation owns every queued source, conversion, reader, and retained PDF. */
var ConversionQueue = class {
	config;
	generation;
	convert;
	ready = /* @__PURE__ */ new Map();
	aliases = /* @__PURE__ */ new Map();
	sources = /* @__PURE__ */ new Map();
	digests = /* @__PURE__ */ new Map();
	queue = [];
	tasks = /* @__PURE__ */ new Set();
	jobs = /* @__PURE__ */ new Set();
	cachedBytes = 0;
	sourceBytes = 0;
	running = 0;
	background = 0;
	readers = 0;
	disposed = false;
	/**
	* @param config - validated queue, source, reader, and completed-result limits.
	* @param generation - provider lifetime; prevents reuse after engine or font replacement.
	* @param convert - executes one admitted conversion and settles after scratch cleanup.
	*/
	constructor(config, generation, convert) {
		this.config = config;
		this.generation = generation;
		this.convert = convert;
	}
	/**
	* Admit metadata before loading source bytes and share conversion across authorized readers.
	* @param request - already-authorized metadata and deferred bounded source read.
	* @param signal - this reader's cancellation; the final reader cancels shared work.
	* @returns independent PDF bytes; busy or canceled readers reject without releasing active engine capacity early.
	*/
	async read(request, signal) {
		signal?.throwIfAborted();
		if (this.disposed) throw this.unavailable();
		if (request.source.bytes !== void 0 && request.source.bytes > this.config.maxInputBytes) throw new OfficeToPdfError("input-too-large", "The Office source exceeds maxInputBytes.");
		const source = JSON.stringify([
			request.source.key,
			request.source.version,
			request.extension
		]);
		const alias = this.aliases.get(source);
		const cached = alias === void 0 ? void 0 : this.ready.get(alias);
		if (cached !== void 0) {
			this.ready.delete(cached.cacheKey);
			this.ready.set(cached.cacheKey, cached);
			this.aliases.delete(source);
			this.aliases.set(source, cached.cacheKey);
			return this.copy(cached);
		}
		const readerLimit = request.priority === "background" ? this.config.maxReaders - 1 : this.config.maxReaders;
		if (this.readers >= readerLimit) throw this.busy();
		if (request.priority === "background" && this.config.maxBackgroundConversions === 0) throw this.busy();
		let job = this.sources.get(source);
		if (job === void 0) {
			if (this.queue.length >= this.config.maxQueuedJobs) {
				const obsolete = request.priority === "foreground" ? this.queue.find((item) => item.priority === "background") : void 0;
				if (obsolete === void 0) throw this.busy();
				this.fail(obsolete, this.busy());
			}
			job = {
				request,
				priority: request.priority,
				controller: new AbortController(),
				readers: /* @__PURE__ */ new Set(),
				sources: new Set([source]),
				state: "queued"
			};
			this.sources.set(source, job);
			this.jobs.add(job);
			this.queue.push(job);
		}
		const shared = job;
		if (request.priority === "foreground") shared.priority = "foreground";
		this.readers++;
		const promise = new Promise((resolve, reject) => {
			const abort = () => {
				this.release(reader);
				const reason = signal?.reason;
				reject(reason instanceof Error ? reason : new Error("Office conversion cancelled", { cause: reason }));
				if (reader.job.readers.size === 0) this.cancel(reader.job);
				this.drain();
			};
			const reader = {
				job: shared,
				source,
				priority: request.priority,
				resolve,
				reject,
				cleanup: () => signal?.removeEventListener("abort", abort)
			};
			shared.readers.add(reader);
			signal?.addEventListener("abort", abort, { once: true });
		});
		this.drain();
		return promise;
	}
	/** Cancel all readers and wait until actual reads, conversions, and scratch cleanup finish. */
	async dispose() {
		this.disposed = true;
		for (const job of this.jobs) this.fail(job, this.unavailable());
		this.ready.clear();
		this.aliases.clear();
		this.cachedBytes = 0;
		await Promise.allSettled(this.tasks);
	}
	busy() {
		return new OfficeToPdfError("busy", "The document converter has reached its admission limit.");
	}
	unavailable() {
		return new OfficeToPdfError("unavailable", "The document converter is unavailable.");
	}
	copy(result) {
		return {
			...result,
			pdf: Uint8Array.from(result.pdf),
			missingFonts: [...result.missingFonts]
		};
	}
	release(reader) {
		reader.job.readers.delete(reader);
		if (reader.job.state === "queued") reader.job.priority = [...reader.job.readers].some((other) => other.priority === "foreground") ? "foreground" : "background";
		if (![...reader.job.readers].some((other) => other.source === reader.source)) {
			reader.job.sources.delete(reader.source);
			if (this.sources.get(reader.source) === reader.job) this.sources.delete(reader.source);
		}
		reader.cleanup();
		this.readers--;
	}
	cancel(job) {
		job.controller.abort();
		if (job.state === "queued") {
			this.queue.splice(this.queue.indexOf(job), 1);
			job.state = "finished";
			this.jobs.delete(job);
		}
	}
	fail(job, error) {
		for (const reader of job.readers) {
			this.release(reader);
			reader.reject(error);
		}
		this.cancel(job);
	}
	reservation(job) {
		return Math.max(1, job.request.source.bytes ?? this.config.maxInputBytes);
	}
	drain() {
		while (!this.disposed && this.running < this.config.maxConcurrentConversions) {
			const eligible = (job) => this.sourceBytes + this.reservation(job) <= this.config.maxSourceBytes && (job.priority === "foreground" || this.background < Math.min(this.config.maxBackgroundConversions, Math.max(1, this.config.maxConcurrentConversions - 1)));
			const foregroundWaiting = this.queue.some((item) => item.priority === "foreground");
			const job = this.queue.find((item) => (!foregroundWaiting || item.priority === "foreground") && eligible(item));
			if (job === void 0) return;
			this.queue.splice(this.queue.indexOf(job), 1);
			job.state = "running";
			const background = job.priority === "background";
			const reserved = this.reservation(job);
			this.running++;
			if (background) this.background++;
			this.sourceBytes += reserved;
			const task = this.execute(job, reserved).catch((error) => {
				this.fail(job, error);
			}).finally(() => {
				this.running--;
				if (background) this.background--;
				this.sourceBytes -= reserved;
				job.state = "finished";
				this.jobs.delete(job);
				this.tasks.delete(task);
				this.drain();
			});
			this.tasks.add(task);
		}
	}
	async execute(job, reserved) {
		const signal = job.controller.signal;
		signal.throwIfAborted();
		const input = await job.request.source.read(signal, reserved);
		signal.throwIfAborted();
		if (input.version !== job.request.source.version) throw new OfficeToPdfError("source-changed", "The source changed while waiting for conversion.");
		if (input.bytes.byteLength > reserved) throw new OfficeToPdfError("input-too-large", "The source exceeds its reserved read capacity.");
		const digest = createHash("sha256").update(job.request.extension).update("\0").update(input.bytes).digest("hex");
		const key = OfficeToPdfKey(`${this.generation}:${digest}`);
		const cached = this.ready.get(key);
		if (cached !== void 0) {
			this.ready.delete(key);
			this.ready.set(key, cached);
			this.finish(job, cached);
			return;
		}
		const existing = this.digests.get(key);
		if (existing !== void 0 && !existing.controller.signal.aborted) {
			if (job.priority === "foreground") existing.priority = "foreground";
			for (const reader of job.readers) {
				reader.job = existing;
				existing.readers.add(reader);
			}
			job.readers.clear();
			for (const source of job.sources) {
				existing.sources.add(source);
				this.sources.set(source, existing);
			}
			job.sources.clear();
			return;
		}
		this.digests.set(key, job);
		try {
			const converted = await this.convert(input.bytes, job.request.extension, signal);
			signal.throwIfAborted();
			const result = {
				...converted,
				cacheKey: key,
				generation: this.generation
			};
			this.retain(result);
			this.finish(job, result);
		} finally {
			if (this.digests.get(key) === job) this.digests.delete(key);
		}
	}
	finish(job, result) {
		for (const source of job.sources) this.sources.delete(source);
		if (this.ready.has(result.cacheKey)) for (const source of job.sources) {
			this.aliases.delete(source);
			this.aliases.set(source, result.cacheKey);
			while (this.aliases.size > this.config.maxSourceEntries) this.aliases.delete(this.aliases.keys().next().value);
		}
		for (const reader of job.readers) {
			this.release(reader);
			reader.resolve(this.copy(result));
		}
	}
	retain(result) {
		if (result.pdf.byteLength > this.config.maxCachedBytes) return;
		while (this.ready.size >= this.config.maxCachedEntries || this.cachedBytes + result.pdf.byteLength > this.config.maxCachedBytes) {
			const [key, oldest] = this.ready.entries().next().value;
			this.ready.delete(key);
			this.cachedBytes -= oldest.pdf.byteLength;
			for (const [source, digest] of this.aliases) if (digest === key) this.aliases.delete(source);
		}
		this.ready.set(result.cacheKey, result);
		this.cachedBytes += result.pdf.byteLength;
	}
};
//#endregion
//#region lib/types/index.js
/** Host LibreOffice kit provider with reusable converters and private disk input/output. */
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/** Deployment defaults resolved before provider construction. */
const Config = z.object({
	maxConcurrentConversions: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(2),
	maxQueuedJobs: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(8),
	maxReaders: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(32),
	maxSourceBytes: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(104857600),
	maxBackgroundConversions: z.natural().min(0).max(Number.MAX_SAFE_INTEGER).default(1),
	maxCachedEntries: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(8),
	maxCachedBytes: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(134217728),
	maxSourceEntries: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(64),
	timeoutMs: z.natural().min(1).max(2147483647).default(6e4),
	maxInputBytes: z.natural().min(1).max(Number.MAX_SAFE_INTEGER - 1).default(50 * 1024 * 1024),
	maxOutputBytes: z.natural().min(1).max(Number.MAX_SAFE_INTEGER - 1).default(100 * 1024 * 1024),
	maxImageResolution: z.natural().min(1).max(2147483647).default(192),
	maxArchiveEntries: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(1e4),
	maxUncompressedBytes: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(250 * 1024 * 1024),
	fontDirectories: z.array(z.string().min(1)).extra("default", void 0),
	fontFallbacks: z.array(z.array(z.string().pattern(/\S/)).min(2)).extra("default", void 0),
	maxFontFiles: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(2e4),
	maxFontFileBytes: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(256 * 1024 * 1024),
	maxLoadedFontBytes: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(512 * 1024 * 1024)
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
			_getGeneration_decorators = [Remote("generation")];
			__esDecorate(this, null, _render_decorators, {
				kind: "method",
				name: "render",
				static: false,
				private: false,
				access: {
					has: (obj) => "render" in obj,
					get: (obj) => obj.render
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _getGeneration_decorators, {
				kind: "method",
				name: "getGeneration",
				static: false,
				private: false,
				access: {
					has: (obj) => "getGeneration" in obj,
					get: (obj) => obj.getGeneration
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		config = __runInitializers(this, _instanceExtraInitializers);
		static Config = Config;
		/** Changes whenever engine, font, or conversion configuration is replaced. */
		generation = OfficeToPdfGeneration(randomUUID());
		remoteLifetime = new AbortController();
		remoteRequests = /* @__PURE__ */ new Set();
		slots = [];
		queue;
		options;
		/**
		* @param ctx - owning Host context.
		* @param config - resolved rendering, font, and concurrency limits.
		*/
		constructor(ctx, config) {
			super(ctx, "officeToPdf");
			this.config = config;
			if (config.fontDirectories?.some((path) => !isAbsolute(path))) throw new Error("fontDirectories must contain absolute paths.");
			if (config.maxSourceBytes < config.maxInputBytes) throw new Error("maxSourceBytes must be at least maxInputBytes.");
			const { fontDirectories, fontFallbacks, timeoutMs, maxInputBytes, maxOutputBytes, maxImageResolution, maxArchiveEntries, maxUncompressedBytes, maxFontFiles, maxFontFileBytes, maxLoadedFontBytes } = config;
			this.options = {
				timeoutMs,
				maxInputBytes,
				maxOutputBytes,
				maxImageResolution,
				maxArchiveEntries,
				maxUncompressedBytes,
				maxFontFiles,
				maxFontFileBytes,
				maxLoadedFontBytes,
				...fontDirectories === void 0 ? {} : { fontDirectories },
				...fontFallbacks === void 0 ? {} : { fontFallbacks }
			};
			this.queue = new ConversionQueue(config, this.generation, (bytes, extension, signal) => this.convertBytes(bytes, extension, signal));
			ctx.effect(() => async () => {
				this.remoteLifetime.abort();
				await this.queue.dispose();
				await Promise.allSettled(this.remoteRequests);
				const failures = (await Promise.allSettled(this.slots.map(async (slot) => {
					await (await slot.converter)?.dispose();
				}))).filter((result) => result.status === "rejected");
				if (failures.length > 0) throw new AggregateError(failures.map((result) => result.reason), "LibreOffice converter disposal failed.");
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
			} finally {
				this.remoteRequests.delete(operation);
			}
		}
		/**
		* Read the current rendering generation before reusing a Client PDF.
		* @param signal - Remote caller cancellation.
		* @returns provider lifetime, replaced with rendering, font, or engine configuration.
		*/
		getGeneration(signal) {
			signal.throwIfAborted();
			return this.generation;
		}
		async renderFile(scope, path, priority, signal) {
			try {
				signal.throwIfAborted();
				const extension = extname(path).slice(1).toLowerCase();
				if (extension !== "doc" && extension !== "docx" && extension !== "xls" && extension !== "xlsx" && extension !== "ppt" && extension !== "pptx") throw new OfficeToPdfError("unsupported-format", "The path must end in doc, docx, xls, xlsx, ppt, or pptx.");
				const files = this.ctx.get("workspaceFiles");
				const fs = this.ctx.get("fs");
				if (files === void 0 || fs === void 0) throw new OfficeToPdfError("unavailable", "Office file rendering requires workspaceFiles and fs.");
				const authorized = await files.readBytes(scope, path, {
					offset: 0,
					length: 1
				}, signal);
				const source = await files.stat(scope, path, signal);
				const assertUnchanged = (current) => {
					if (current.absolutePath !== source.absolutePath || current.version !== source.version) throw new OfficeToPdfError("source-changed", "The source changed.");
				};
				assertUnchanged(authorized);
				signal.throwIfAborted();
				const result = await this.convert({
					extension,
					priority,
					source: {
						key: brandString(JSON.stringify([
							scope.sessionId,
							scope.workspaceRoot,
							source.absolutePath
						])),
						version: source.version,
						...source.bytes === void 0 ? {} : { bytes: source.bytes },
						read: async (upstream, maxBytes) => {
							const target = await fs.resolve(source.absolutePath, { signal: upstream });
							const info = await fs.stat(target, upstream);
							if (info === void 0 || info.type !== "file") throw new OfficeToPdfError("source-changed", "The source changed.");
							assertUnchanged({
								absolutePath: fs.processPath(target),
								version: info.version
							});
							const bytes = await fs.readBytes(target, upstream, maxBytes).catch(async (cause) => {
								if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "FS_TOO_LARGE") {
									assertUnchanged(await files.stat(scope, path, upstream));
									throw new OfficeToPdfError("input-too-large", "The source exceeds the reserved byte capacity.", { cause });
								}
								throw cause;
							});
							upstream.throwIfAborted();
							assertUnchanged(await files.stat(scope, path, upstream));
							return {
								bytes,
								version: source.version
							};
						}
					}
				}, signal);
				signal.throwIfAborted();
				return {
					absolutePath: source.absolutePath,
					version: source.version,
					offset: 0,
					eof: true,
					bytes: result.pdf.byteLength,
					data: Buffer.from(result.pdf).toString("base64"),
					missingFonts: result.missingFonts,
					fontDiagnostics: result.fontDiagnostics,
					generation: result.generation
				};
			} catch (cause) {
				if (signal.aborted) throw new RemoteError("gateway/cancelled", "The document preview was cancelled.", {}, { cause });
				if (cause instanceof OfficeToPdfError) throw new RemoteError("document-render/failed", "Office conversion failed.", { reason: cause.code }, { cause });
				throw cause;
			}
		}
		async convertBytes(bytes, extension, signal) {
			signal.throwIfAborted();
			let slot = this.slots.find((candidate) => !candidate.busy);
			if (slot === void 0) {
				slot = { busy: false };
				this.slots.push(slot);
			}
			slot.busy = true;
			let directory;
			try {
				if (slot.converter === void 0) slot.converter = createConverter(this.options).catch((error) => {
					delete slot.converter;
					throw error;
				});
				const converter = await slot.converter;
				signal.throwIfAborted();
				directory = await mkdtemp(join(tmpdir(), "dsh-office-to-pdf-"));
				const inputPath = join(directory, `source.${extension}`);
				const outputPath = join(directory, "converted.pdf");
				await writeFile(inputPath, bytes, {
					flag: "wx",
					mode: 384,
					signal
				});
				signal.throwIfAborted();
				const result = await converter.render({
					inputPath,
					outputPath
				}, signal);
				signal.throwIfAborted();
				let pdf;
				try {
					pdf = await readPdf(outputPath, this.config.maxOutputBytes, signal);
				} catch (cause) {
					if (cause instanceof OfficeToPdfError) throw cause;
					throw new OfficeToPdfError("invalid-output", "The converter PDF could not be read.", { cause });
				}
				signal.throwIfAborted();
				return {
					pdf,
					missingFonts: result.missingFonts,
					fontDiagnostics: result.fontDiagnostics
				};
			} catch (cause) {
				signal.throwIfAborted();
				if (cause instanceof OfficeToPdfError) throw cause;
				const code = typeof cause === "object" && cause !== null && "code" in cause ? cause.code : void 0;
				switch (code) {
					case "input-too-large":
					case "output-too-large":
					case "invalid-document":
					case "unsupported-format":
					case "invalid-output":
					case "timeout":
					case "unavailable": throw new OfficeToPdfError(code, "LibreOffice conversion failed.", { cause });
					default: throw new OfficeToPdfError("failed", "LibreOffice conversion failed.", { cause });
				}
			} finally {
				try {
					if (directory !== void 0) await rm(directory, {
						recursive: true,
						force: true
					});
				} finally {
					slot.busy = false;
				}
			}
		}
	};
})();
//#endregion
export { Config, OfficeSourceKey, OfficeToPdf, OfficeToPdf as default, OfficeToPdfError, OfficeToPdfGeneration, OfficeToPdfKey };
