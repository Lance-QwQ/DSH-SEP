import { closeSync, mkdtempSync, openSync, rmdirSync, unlinkSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
//#region lib/types/output.js
/** Bounded output tails and private spill files shared by process providers. */
let spillCounter = 0;
let defaultSpillDir;
/**
* The default spill location: a private (0700) per-process directory under
* the OS tmpdir, created lazily. Predictable world-readable paths would let
* other local users read command output or pre-create symlinks. At a
* JavaScript-observable process exit the directory is removed only when it
* holds no completed spill file (spill files are retained as full-output
* recovery artifacts until an external cleanup).
*/
function privateSpillDir() {
	defaultSpillDir ??= mkdtempSync(join(tmpdir(), "dsh-subprocess-"));
	return defaultSpillDir;
}
/* v8 ignore next 4 -- exit listeners run after the coverage dump; removal is verified by the CI /tmp residue measurement. */
process.once("exit", () => {
	if (defaultSpillDir === void 0) return;
	try {
		rmdirSync(defaultSpillDir);
	} catch {}
});
/**
* Prepare fallible output storage before starting a managed native process.
* @param internals - optional caller-owned spill directory.
* @returns binding inputs whose spill directory is ready for use.
*/
function prepareManagedProcessBinding(internals = {}) {
	return { spillDir: internals.spillDir ?? privateSpillDir() };
}
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
var OutputCollector = class {
	maxBytes;
	maxSpillBytes;
	label;
	spillDir;
	chunks = [];
	bytes = 0;
	dropped = false;
	spillFd;
	spillFile;
	spillDisabled;
	/** Total bytes ever pushed (not just retained). */
	total = 0;
	constructor(maxBytes, maxSpillBytes, label, spillDir) {
		this.maxBytes = maxBytes;
		this.maxSpillBytes = maxSpillBytes;
		this.label = label;
		this.spillDir = spillDir;
		this.spillDisabled = maxSpillBytes === void 0;
	}
	/**
	* Ingest one stream chunk, counting it toward the whole-stream total. On
	* first overflow of the in-memory cap a spill file is opened (when spilling
	* is enabled) and every chunk (already-collected ones included) is appended
	* there from then on; the in-memory tail then drops whole chunks from its
	* head (or the head of a single over-cap chunk) until it fits the cap again.
	* @param chunk - the raw bytes from one stream 'data' event.
	*/
	push(chunk) {
		this.total += chunk.length;
		const overflows = this.bytes + chunk.length > this.maxBytes;
		if (!this.spillDisabled && (overflows || this.spillFd !== void 0)) this.spillAll(chunk);
		this.chunks.push(chunk);
		this.bytes += chunk.length;
		while (this.bytes > this.maxBytes) {
			const head = this.chunks[0];
			const excess = this.bytes - this.maxBytes;
			if (head.length <= excess) {
				this.chunks.shift();
				this.bytes -= head.length;
			} else {
				this.chunks[0] = head.subarray(excess);
				this.bytes -= excess;
			}
			this.dropped = true;
		}
	}
	/** Open the spill file lazily and append `chunk` (and any prior chunks once). */
	spillAll(chunk) {
		if (this.maxSpillBytes !== void 0 && this.total > this.maxSpillBytes) {
			this.discardSpill();
			return;
		}
		if (this.spillFd === void 0) {
			this.spillFile = join(this.spillDir, `dsh-subprocess-${process.pid}-${++spillCounter}-${randomBytes(6).toString("hex")}-${this.label}.log`);
			this.spillFd = openSync(this.spillFile, "wx", 384);
			for (const prior of this.chunks) writeSync(this.spillFd, prior);
		}
		writeSync(this.spillFd, chunk);
	}
	/** Stop spilling and remove the file once it can no longer hold the complete stream. */
	discardSpill() {
		const fd = this.spillFd;
		const file = this.spillFile;
		this.spillFd = void 0;
		this.spillFile = void 0;
		this.spillDisabled = true;
		if (fd !== void 0) try {
			closeSync(fd);
		} catch {
			this.spillFd = fd;
		}
		if (file !== void 0) try {
			unlinkSync(file);
		} catch {}
	}
	/**
	* Incremental read in whole-stream byte coordinates: returns everything
	* pushed since `fromByte`. When `fromByte` has already slid out of the
	* in-memory tail window, the read is `lossy` — it returns the whole
	* retained tail and the gap is only recoverable from the spill file.
	* @param fromByte - whole-stream offset to resume from (a prior read's `nextOffset`; 0 for the first read).
	* @returns the delta text, the offset for the next read, the `lossy` flag, and the spill path when one was created.
	*/
	readFrom(fromByte) {
		const windowStart = this.total - this.bytes;
		const buffer = Buffer.concat(this.chunks);
		const lossy = fromByte < windowStart;
		return {
			text: (lossy ? buffer : buffer.subarray(fromByte - windowStart)).toString("utf8"),
			nextOffset: this.total,
			lossy,
			...this.spillFile !== void 0 ? { spillPath: this.spillFile } : {}
		};
	}
	/**
	* Copy the retained raw tail with its position in the complete observed stream.
	* @returns independent tail bytes and the total byte count before truncation.
	*/
	snapshot() {
		return {
			bytes: Buffer.concat(this.chunks),
			totalBytes: this.total
		};
	}
	/**
	* Close the spill file once the stream has ended. A failed close (delayed
	* writeback fault) stops advertising the spill path — the file may be
	* missing its tail — while every in-memory read keeps working. Idempotent;
	* the spawn path seals both collectors at settlement so reads after exit
	* never point at a still-open file.
	*/
	seal() {
		if (this.spillFd === void 0) return;
		try {
			closeSync(this.spillFd);
		} catch {
			this.spillFile = void 0;
		}
		this.spillFd = void 0;
	}
	/**
	* Seal the spill file and return the final output.
	* @returns the final collected output: tail text, truncation flag, and the spill path when intact.
	*/
	finalize() {
		this.seal();
		return {
			text: Buffer.concat(this.chunks).toString("utf8"),
			truncated: this.dropped,
			...this.spillFile !== void 0 ? { spillPath: this.spillFile } : {}
		};
	}
};
//#endregion
export { OutputCollector, prepareManagedProcessBinding };
