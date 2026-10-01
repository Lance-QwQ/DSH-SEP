import { createHash, randomUUID } from "node:crypto";
import { contentFromParts } from "./assembler.js";
import { estimateTokens, truncateTextToEstimatedTokens } from "./estimate-tokens.js";
import { extractFileIdsFromContent } from "./large-files.js";
import { NOOP_LCM_LOGGER } from "./lcm-log.js";
import { formatOpenClawSenderForSummary, } from "./openclaw-sender-metadata.js";
import { LcmProviderAuthError } from "./summarize.js";
import { buildDeterministicFallbackSummary, FALLBACK_DIRECTIVE_SUMMARY_MARKER, MIN_FALLBACK_MAX_TOKENS, } from "./summary-fallback.js";
// ── Helpers ──────────────────────────────────────────────────────────────────
function resolveContextThreshold(config, override) {
    if (typeof override === "number" && Number.isFinite(override) && override >= 0 && override <= 1) {
        return override;
    }
    return config.contextThreshold;
}
/** Deterministically cap summary text so the persisted output stays within maxTokens. */
function capSummaryText(content, originalTokens, maxTokens) {
    const suffixes = [
        `\n[Capped from ${originalTokens} tokens to ~${maxTokens}]`,
        `\n[Capped to ~${maxTokens}]`,
        "\n[Capped]",
        "",
    ];
    for (const suffix of suffixes) {
        const contentBudget = Math.max(0, maxTokens - estimateTokens(suffix));
        const capped = `${truncateTextToEstimatedTokens(content, contentBudget)}${suffix}`;
        if (estimateTokens(capped) <= maxTokens) {
            return capped;
        }
    }
    return truncateTextToEstimatedTokens(content, maxTokens);
}
/** Format a timestamp as `YYYY-MM-DD HH:mm TZ` for prompt source text. */
export function formatTimestamp(value, timezone = "UTC") {
    try {
        const fmt = new Intl.DateTimeFormat("en-CA", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
        const parts = Object.fromEntries(fmt.formatToParts(value).map((p) => [p.type, p.value]));
        const tzAbbr = timezone === "UTC" ? "UTC" : shortTzAbbr(value, timezone);
        return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${tzAbbr}`;
    }
    catch {
        // Fallback to UTC on invalid timezone
        const year = value.getUTCFullYear();
        const month = String(value.getUTCMonth() + 1).padStart(2, "0");
        const day = String(value.getUTCDate()).padStart(2, "0");
        const hours = String(value.getUTCHours()).padStart(2, "0");
        const minutes = String(value.getUTCMinutes()).padStart(2, "0");
        return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
    }
}
/** Extract short timezone abbreviation (e.g. "PST", "PDT", "EST"). */
function shortTzAbbr(value, timezone) {
    try {
        const abbr = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            timeZoneName: "short",
        })
            .formatToParts(value)
            .find((p) => p.type === "timeZoneName")?.value;
        return abbr ?? timezone;
    }
    catch {
        return timezone;
    }
}
/** Generate a collision-resistant summary ID from content and a random nonce. */
function generateSummaryId(content) {
    return ("sum_" +
        createHash("sha256")
            .update(content + randomUUID())
            .digest("hex")
            .slice(0, 16));
}
/** Maximum estimated tokens for the deterministic fallback truncation. */
const FALLBACK_MAX_TOKENS = 512;
const DEFAULT_LEAF_CHUNK_TOKENS = 20_000;
/**
 * Default hard cap on per-pass iterations within a single full sweep. Each
 * pass summarizes one raw or summary chunk; large conversations would
 * otherwise drive an unbounded number of passes (observed: 16 passes on a
 * 308K-token conversation), each potentially burning a full summarizer
 * timeout on the turn-critical path.
 */
const DEFAULT_MAX_SWEEP_ITERATIONS = 12;
/**
 * Default wall-clock budget for a single full sweep, in milliseconds. Once a
 * sweep has run this long it stops before starting another pass and returns
 * the consistent partial result, so a slow/rate-limited summarizer cannot
 * hang the agent turn for tens of minutes.
 */
const DEFAULT_SWEEP_DEADLINE_MS = 120_000;
/**
 * Default wall-clock budget for a whole `compactUntilUnder` operation, in
 * milliseconds. `compactUntilUnder` runs up to `maxRounds` sweeps, each of
 * which re-arms its own `DEFAULT_SWEEP_DEADLINE_MS`; without an
 * operation-wide budget the worst case is `maxRounds × sweepDeadlineMs`
 * (~20 minutes at the defaults). 5 minutes leaves room for a few
 * full-deadline sweeps while capping the worst case well below that.
 */
const DEFAULT_COMPACT_UNTIL_UNDER_DEADLINE_MS = 300_000;
/**
 * Yield the Node event loop for one macrotask. Each leaf/condensed pass runs
 * synchronous `node:sqlite` scans that block the event loop; awaiting this
 * between passes lets the gateway service other work during a long sweep.
 */
function yieldToEventLoop() {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}
/**
 * Pattern matching MEDIA:/... file path references that appear in message content
 * when the original message contained only a media attachment (image, file, etc.)
 * with no meaningful text.
 */
const MEDIA_PATH_RE = /^MEDIA:\/.+$/;
const EMBEDDED_DATA_URL_RE = /data:[^;\s"'`]+;base64,[A-Za-z0-9+/=\s]+/gi;
const MEDIA_ATTACHMENT_PART_TYPES = new Set(["file", "snapshot"]);
const MEDIA_ATTACHMENT_RAW_TYPES = new Set(["file", "image", "snapshot"]);
const PROVIDER_REASONING_RAW_TYPES = new Set(["reasoning", "thinking", "redacted_thinking"]);
const STRUCTURED_MEDIA_TEXT_KEYS = ["text", "caption", "alt", "title", "summary"];
const STRUCTURED_MEDIA_NESTED_KEYS = [
    "value",
    "content",
    "parts",
    "items",
    "message",
    "messages",
    "input",
    "arguments",
    "output",
    "result",
    "results",
    "data",
    "query",
    "command",
];
const MAX_STRUCTURED_TEXT_DEPTH = 8;
const LEADING_CLOSED_REASONING_TEXT_BLOCK_RE = /^<\s*(think|thinking|reasoning)(?:\s[^>]*)?>[\s\S]*?<\s*\/\s*\1\s*>/i;
const STANDALONE_CLOSED_REASONING_TEXT_BLOCK_RE = /(^|\n)[ \t]*<\s*(think|thinking|reasoning)(?:\s[^>]*)?>[\s\S]*?<\s*\/\s*\2\s*>[ \t]*(?=\n|$)/gi;
const REASONING_TEXT_START_RE = /^(?:<\s*(?:think|thinking|reasoning)(?:\s[^>]*)?>|<\|\s*(?:start_of_)?(?:think|thinking|reasoning)\s*\|>|\[\s*(?:think|thinking|reasoning)\s*\])/i;
const STANDALONE_REASONING_TEXT_START_RE = /(^|\n)[ \t]*(?:<\s*(?:think|thinking|reasoning)(?:\s[^>]*)?>|<\|\s*(?:start_of_)?(?:think|thinking|reasoning)\s*\|>|\[\s*(?:think|thinking|reasoning)\s*\])[\s\S]*$/i;
const CONDENSED_MIN_INPUT_RATIO = 0.1;
function dedupeOrderedIds(ids) {
    const seen = new Set();
    const ordered = [];
    for (const id of ids) {
        if (!seen.has(id)) {
            seen.add(id);
            ordered.push(id);
        }
    }
    return ordered;
}
/** Parse message-part metadata without throwing on malformed JSON. */
function parseMessagePartMetadata(part) {
    if (typeof part.metadata !== "string" || !part.metadata.trim()) {
        return {};
    }
    try {
        const parsed = JSON.parse(part.metadata);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
}
/** Detect whether a string is mostly binary/base64 payload and not meaningful prose. */
function looksLikeBinaryPayload(value) {
    if (typeof value !== "string")
        return false;
    const trimmed = value.trim();
    if (!trimmed) {
        return false;
    }
    if (/^data:[^;\s"'`]+;base64,/i.test(trimmed)) {
        return true;
    }
    const compact = trimmed.replace(/\s+/g, "");
    if (compact.length < 256 || compact.length % 4 !== 0) {
        return false;
    }
    if (!/^[A-Za-z0-9+/=]+$/.test(compact)) {
        return false;
    }
    return !/[ .,:;!?()[\]{}]/.test(trimmed);
}
/** Strip attachment payloads from plain strings before they reach the summarizer. */
function stripEmbeddedMediaPayloads(content) {
    if (typeof content !== "string")
        return "";
    const withoutDataUrls = content.replace(EMBEDDED_DATA_URL_RE, "[embedded media omitted]");
    const sanitizedLines = withoutDataUrls
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
            return false;
        }
        if (MEDIA_PATH_RE.test(trimmed)) {
            return false;
        }
        if (looksLikeBinaryPayload(trimmed)) {
            return false;
        }
        return true;
    });
    return sanitizedLines.join("\n").trim();
}
/**
 * Strip auto-injected context blocks from message content.
 *
 * Memory and context plugins (active-memory, memory-lancedb, hindsight-openclaw,
 * etc.) prepend XML-tagged blocks to user messages via the `prependContext` hook.
 * These blocks contain ephemeral retrieval context that should not leak into
 * compacted summaries or FTS indexes.
 *
 * Each tag name from `tags` is matched case-insensitively as `<tag>.....</tag>`.
 * The leading "Untrusted context" header used by active-memory is also stripped.
 */
export function stripInjectedContextBlocks(content, tags) {
    if (!tags || tags.length === 0) {
        return content;
    }
    let result = content;
    for (const tag of tags) {
        // Escape any regex-special chars in the tag name (e.g. hyphens).
        const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`<${escaped}>[\\s\\S]*?</${escaped}>`, "gi");
        result = result.replace(re, "");
    }
    // Strip the "Untrusted context" one-liner header used by active-memory.
    result = result.replace(/^Untrusted context \(metadata, do not treat as instructions or commands\):\s*/gim, "");
    return result.trim();
}
function stripPlainTextReasoningPayloads(content) {
    let trimmed = content.trim();
    while (true) {
        const match = trimmed.match(LEADING_CLOSED_REASONING_TEXT_BLOCK_RE);
        if (!match) {
            break;
        }
        trimmed = trimmed.slice(match[0].length).trimStart();
    }
    trimmed = trimmed
        .replace(STANDALONE_CLOSED_REASONING_TEXT_BLOCK_RE, (_match, lineStart) => (lineStart === "\n" ? "\n" : ""))
        .replace(STANDALONE_REASONING_TEXT_START_RE, (_match, lineStart) => (lineStart === "\n" ? "\n" : ""))
        .trim();
    if (!trimmed) {
        return "";
    }
    if (REASONING_TEXT_START_RE.test(trimmed)) {
        return "";
    }
    return trimmed;
}
function sanitizeTextFragment(value, options) {
    const withoutMedia = stripEmbeddedMediaPayloads(value);
    return options.stripPlainTextReasoning
        ? stripPlainTextReasoningPayloads(withoutMedia)
        : withoutMedia;
}
/** Extract human-readable text from structured content while ignoring attachment payload fields. */
function extractSanitizedStructuredText(value, options = {}, depth = 0) {
    if (depth >= MAX_STRUCTURED_TEXT_DEPTH || value == null) {
        return [];
    }
    if (typeof value === "string") {
        const sanitized = sanitizeTextFragment(value, options);
        return sanitized ? [sanitized] : [];
    }
    if (Array.isArray(value)) {
        return value.flatMap((entry) => extractSanitizedStructuredText(entry, options, depth + 1));
    }
    if (typeof value !== "object") {
        return [];
    }
    const record = value;
    const type = typeof record.type === "string" ? record.type.trim().toLowerCase() : "";
    const rawType = typeof record.rawType === "string" ? record.rawType.trim().toLowerCase() : "";
    if (PROVIDER_REASONING_RAW_TYPES.has(type) || PROVIDER_REASONING_RAW_TYPES.has(rawType)) {
        return [];
    }
    const textFragments = [];
    for (const key of STRUCTURED_MEDIA_TEXT_KEYS) {
        const candidate = record[key];
        if (typeof candidate !== "string") {
            continue;
        }
        const sanitized = sanitizeTextFragment(candidate, options);
        if (sanitized) {
            textFragments.push(sanitized);
        }
    }
    if (MEDIA_ATTACHMENT_RAW_TYPES.has(type) || MEDIA_ATTACHMENT_RAW_TYPES.has(rawType)) {
        return textFragments;
    }
    for (const key of STRUCTURED_MEDIA_NESTED_KEYS) {
        textFragments.push(...extractSanitizedStructuredText(record[key], options, depth + 1));
    }
    return textFragments;
}
/**
 * Normalize message content down to human-readable text, excluding
 * binary/media payloads and provider reasoning/thinking blocks.
 *
 * Shared by every summarizer entry point (leaf input, condensed input,
 * prior-summary context) so reasoning blocks introduced at any level —
 * including legacy data persisted before #503 — are stripped before they
 * reach the summarizer.
 *
 * @internal Exported for tests; production code reaches it via the
 * compaction-engine entry points.
 */
export function extractMeaningfulMessageText(content, options = {}) {
    if (typeof content !== "string")
        return "";
    const trimmed = content.trim();
    if (!trimmed) {
        return "";
    }
    if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
        try {
            const parsed = JSON.parse(trimmed);
            const extracted = extractSanitizedStructuredText(parsed, options)
                .map((fragment) => fragment.trim())
                .filter(Boolean);
            return extracted.join("\n").trim();
        }
        catch {
            // Fall back to plain-text sanitation below.
        }
    }
    return sanitizeTextFragment(content, options);
}
/** Normalize stored summary content before it is fed into a later summarizer pass. */
function extractMeaningfulSummaryText(content) {
    return extractMeaningfulMessageText(content, { stripPlainTextReasoning: true });
}
/** Map stored message roles back to runtime roles for structured reconstruction. */
function runtimeRoleForSummary(role) {
    if (role === "tool") {
        return "toolResult";
    }
    if (role === "user" || role === "system") {
        return "user";
    }
    return "assistant";
}
/** Parse JSON-ish message-part values while preserving plain text values. */
function parseStoredPartValue(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    try {
        return JSON.parse(trimmed);
    }
    catch {
        return trimmed;
    }
}
/** Extract summarizable text from a structured runtime content value. */
function extractMeaningfulStructuredText(value) {
    if (typeof value === "string") {
        return extractMeaningfulMessageText(value);
    }
    const extracted = extractSanitizedStructuredText(value)
        .map((fragment) => fragment.trim())
        .filter(Boolean);
    if (extracted.length > 0) {
        return extracted.join("\n").trim();
    }
    try {
        const serialized = JSON.stringify(value);
        return typeof serialized === "string" ? extractMeaningfulMessageText(serialized) : "";
    }
    catch {
        return "";
    }
}
/** Extract a readable fallback from one structured message part. */
function extractMessagePartSummaryText(part) {
    if (part.partType === "reasoning") {
        return "";
    }
    const sections = [];
    const text = extractMeaningfulStructuredText(part.textContent);
    if (text) {
        sections.push(text);
    }
    const toolName = part.toolName?.trim();
    const toolLabel = toolName ? ` (${toolName})` : "";
    const input = extractMeaningfulStructuredText(parseStoredPartValue(part.toolInput));
    if (input) {
        sections.push(`Tool input${toolLabel}:\n${input}`);
    }
    const output = extractMeaningfulStructuredText(parseStoredPartValue(part.toolOutput));
    if (output) {
        sections.push(`Tool output${toolLabel}:\n${output}`);
    }
    return sections.join("\n\n").trim();
}
/** Identify whether a stored message part represents a media attachment. */
function isMediaAttachmentPart(part) {
    if (MEDIA_ATTACHMENT_PART_TYPES.has(part.partType)) {
        return true;
    }
    const metadata = parseMessagePartMetadata(part);
    const rawType = typeof metadata.rawType === "string"
        ? metadata.rawType.trim().toLowerCase()
        : metadata.raw && typeof metadata.raw === "object" && !Array.isArray(metadata.raw) &&
            typeof metadata.raw.type === "string"
            ? metadata.raw.type.trim().toLowerCase()
            : "";
    return MEDIA_ATTACHMENT_RAW_TYPES.has(rawType);
}
function annotateLeafSummaryMediaContent(content, parts) {
    const hasMediaParts = parts.some((part) => isMediaAttachmentPart(part));
    if (!hasMediaParts) {
        return content;
    }
    const partText = parts
        .filter((part) => !isMediaAttachmentPart(part))
        .map((part) => (typeof part.textContent === "string" ? part.textContent : ""))
        .map((text) => stripEmbeddedMediaPayloads(text))
        .map((text) => text.trim())
        .filter(Boolean)
        .join("\n")
        .trim();
    const fallbackText = extractMeaningfulMessageText(content);
    const meaningfulText = (partText || fallbackText).trim();
    if (!meaningfulText) {
        return "[Media attachment]";
    }
    if (meaningfulText.includes("[with media attachment]")) {
        return meaningfulText;
    }
    return `${meaningfulText} [with media attachment]`;
}
/** Resolve the sanitized message text used as source for leaf summaries. */
export async function resolveLeafSummaryMessageContent(store, msg) {
    const parts = await store.getMessageParts(msg.messageId);
    const annotatedContent = annotateLeafSummaryMediaContent(msg.content, parts);
    const storedText = extractMeaningfulMessageText(annotatedContent);
    if (storedText) {
        return storedText;
    }
    if (parts.length === 0) {
        return "";
    }
    const rehydrated = contentFromParts(parts.map((part) => ({ ...part })), runtimeRoleForSummary(msg.role), msg.content);
    const rehydratedText = extractMeaningfulStructuredText(rehydrated);
    if (rehydratedText) {
        return rehydratedText;
    }
    return parts
        .map(extractMessagePartSummaryText)
        .map((text) => text.trim())
        .filter(Boolean)
        .join("\n\n")
        .trim();
}
// ── CompactionEngine ─────────────────────────────────────────────────────────
export class CompactionEngine {
    conversationStore;
    summaryStore;
    config;
    log;
    /**
     * Per-conversation context items cache, active only during compaction
     * entry points. null when inactive — external callers (e.g., engine.ts
     * evaluateLeafTrigger) get uncached reads.
     *
     * Uses a reference count so concurrent compactions on different
     * conversations don't interfere: each withContextCache increments
     * on entry and decrements on exit; the cache is only destroyed
     * when all users have exited.
     */
    _contextItemsCache = null;
    _contextItemsCacheRefCount = 0;
    constructor(conversationStore, summaryStore, config, log = NOOP_LCM_LOGGER) {
        this.conversationStore = conversationStore;
        this.summaryStore = summaryStore;
        this.config = config;
        this.log = log;
    }
    /** Read context items, using per-phase cache when active. */
    async getContextItemsCached(conversationId) {
        if (this._contextItemsCache) {
            if (this._contextItemsCache.has(conversationId)) {
                return this._contextItemsCache.get(conversationId);
            }
            const items = await this.summaryStore.getContextItems(conversationId);
            this._contextItemsCache.set(conversationId, items);
            return items;
        }
        return this.summaryStore.getContextItems(conversationId);
    }
    /** Invalidate cache for a conversation after context mutation. */
    invalidateContextCache(conversationId) {
        this._contextItemsCache?.delete(conversationId);
    }
    /** Execute with context cache active. Reference-counted for concurrent use. */
    async withContextCache(fn) {
        if (!this._contextItemsCache)
            this._contextItemsCache = new Map();
        this._contextItemsCacheRefCount++;
        try {
            return await fn();
        }
        finally {
            this._contextItemsCacheRefCount--;
            if (this._contextItemsCacheRefCount <= 0) {
                this._contextItemsCache = null;
                this._contextItemsCacheRefCount = 0;
            }
        }
    }
    // ── evaluate ─────────────────────────────────────────────────────────────
    /** Evaluate whether compaction is needed. */
    async evaluate(conversationId, tokenBudget, observedTokenCount, options) {
        const storedTokens = await this.summaryStore.getContextTokenCount(conversationId);
        const liveTokens = typeof observedTokenCount === "number" &&
            Number.isFinite(observedTokenCount) &&
            observedTokenCount > 0
            ? Math.floor(observedTokenCount)
            : 0;
        const rawTokensOutsideTail = liveTokens > 0
            ? await this.countRawTokensOutsideFreshTail(conversationId, options?.freshTailCount)
            : undefined;
        const projectedTokens = liveTokens > 0 ? Math.max(storedTokens, liveTokens) : undefined;
        const currentTokens = Math.max(storedTokens, liveTokens);
        const threshold = Math.floor(resolveContextThreshold(this.config, options?.contextThreshold) * tokenBudget);
        if (currentTokens > threshold) {
            return {
                shouldCompact: true,
                reason: "threshold",
                storedTokens,
                ...(liveTokens > 0 ? { observedTokens: liveTokens } : {}),
                ...(rawTokensOutsideTail !== undefined ? { rawTokensOutsideTail } : {}),
                ...(projectedTokens !== undefined ? { projectedTokens } : {}),
                currentTokens,
                threshold,
            };
        }
        return {
            shouldCompact: false,
            reason: "none",
            storedTokens,
            ...(liveTokens > 0 ? { observedTokens: liveTokens } : {}),
            ...(rawTokensOutsideTail !== undefined ? { rawTokensOutsideTail } : {}),
            ...(projectedTokens !== undefined ? { projectedTokens } : {}),
            currentTokens,
            threshold,
        };
    }
    /**
     * Evaluate whether the raw-message leaf trigger is active.
     *
     * Counts message tokens outside the protected fresh tail and compares against
     * `leafChunkTokens`. Automatic compaction no longer uses this as a trigger,
     * but it remains useful for diagnostics and explicit maintenance commands.
     */
    async evaluateLeafTrigger(conversationId, leafChunkTokensOverride) {
        const rawTokensOutsideTail = await this.countRawTokensOutsideFreshTail(conversationId);
        const threshold = this.resolveLeafChunkTokens(leafChunkTokensOverride);
        return {
            shouldCompact: rawTokensOutsideTail >= threshold,
            rawTokensOutsideTail,
            threshold,
        };
    }
    // ── compact ──────────────────────────────────────────────────────────────
    /** Run a full compaction sweep for a conversation. */
    async compact(input) {
        return this.withContextCache(() => this.compactFullSweep(input));
    }
    /**
     * Run a single leaf pass against the oldest compactable raw chunk.
     *
     * This lower-level helper is used by focused compaction tests and explicit
     * leaf-pass callers; automatic maintenance uses threshold full sweeps.
     */
    async compactLeaf(input) {
        return this.withContextCache(() => this._compactLeafImpl(input));
    }
    async _compactLeafImpl(input) {
        const { conversationId, tokenBudget, summarize, force } = input;
        const tokensBefore = await this.summaryStore.getContextTokenCount(conversationId);
        const threshold = Math.floor(resolveContextThreshold(this.config, input.contextThreshold) * tokenBudget);
        const leafTrigger = await this.evaluateLeafTrigger(conversationId, input.leafChunkTokens);
        if (!force && tokensBefore <= threshold && !leafTrigger.shouldCompact) {
            return {
                actionTaken: false,
                tokensBefore,
                tokensAfter: tokensBefore,
                condensed: false,
            };
        }
        const leafChunk = await this.selectOldestLeafChunk(conversationId, input.leafChunkTokens);
        if (leafChunk.items.length === 0) {
            return {
                actionTaken: false,
                tokensBefore,
                tokensAfter: tokensBefore,
                condensed: false,
            };
        }
        const previousSummaryContent = input.previousSummaryContent ??
            (await this.resolvePriorLeafSummaryContext(conversationId, leafChunk.items));
        const leafResult = await this.leafPass(conversationId, leafChunk.items, summarize, previousSummaryContent, input.summaryModel);
        if (!leafResult) {
            return {
                actionTaken: false,
                tokensBefore,
                tokensAfter: tokensBefore,
                condensed: false,
                authFailure: true,
            };
        }
        if ("skipped" in leafResult) {
            return {
                actionTaken: false,
                tokensBefore,
                tokensAfter: tokensBefore,
                condensed: false,
            };
        }
        // Delta tracking: compute token change from pass results instead of re-querying DB
        const tokensAfterLeaf = Math.max(0, tokensBefore - leafResult.removedTokens + leafResult.addedTokens);
        await this.persistCompactionEvents({
            conversationId,
            tokensBefore,
            tokensAfterLeaf,
            tokensAfterFinal: tokensAfterLeaf,
            leafResult: { summaryId: leafResult.summaryId, level: leafResult.level },
            condenseResult: null,
        });
        let tokensAfter = tokensAfterLeaf;
        let condensed = false;
        let createdSummaryId = leafResult.summaryId;
        let level = leafResult.level;
        const sweepMaxDepth = this.resolveSweepMaxDepth();
        const condensedMinChunkTokens = this.resolveCondensedMinChunkTokens();
        let runningTokens = tokensAfterLeaf;
        if (sweepMaxDepth > 0 && input.allowCondensedPasses !== false) {
            for (let targetDepth = 0; targetDepth < sweepMaxDepth; targetDepth++) {
                const fanout = this.resolveFanoutForDepth(targetDepth, false);
                const chunk = await this.selectOldestChunkAtDepth(conversationId, targetDepth);
                if (chunk.meaningfulCount < fanout || chunk.summaryTokens < condensedMinChunkTokens) {
                    break;
                }
                const passTokensBefore = runningTokens;
                const condenseResult = await this.condensedPass(conversationId, chunk.items, targetDepth, summarize, input.summaryModel);
                if (!condenseResult || "skipped" in condenseResult) {
                    break;
                }
                const passTokensAfter = Math.max(0, passTokensBefore - condenseResult.removedTokens + condenseResult.addedTokens);
                await this.persistCompactionEvents({
                    conversationId,
                    tokensBefore: passTokensBefore,
                    tokensAfterLeaf: passTokensBefore,
                    tokensAfterFinal: passTokensAfter,
                    leafResult: null,
                    condenseResult,
                });
                tokensAfter = passTokensAfter;
                runningTokens = passTokensAfter;
                condensed = true;
                createdSummaryId = condenseResult.summaryId;
                level = condenseResult.level;
                if (passTokensAfter >= passTokensBefore) {
                    break;
                }
            }
        }
        return {
            actionTaken: true,
            tokensBefore,
            tokensAfter,
            createdSummaryId,
            condensed,
            level,
        };
    }
    /**
     * Run a threshold-triggered full sweep:
     *
     * Phase 1: repeatedly compact raw-message chunks outside the fresh tail.
     * Phase 2: repeatedly condense oldest summary chunks while chunk utilization
     *          remains high enough to be worthwhile.
     */
    async compactFullSweep(input) {
        const { conversationId, tokenBudget, summarize, force, hardTrigger } = input;
        const freshTailCountOverride = input.freshTailCount;
        const leafChunkTokensOverride = input.leafChunkTokens;
        const tokensBefore = await this.summaryStore.getContextTokenCount(conversationId);
        const contextThreshold = resolveContextThreshold(this.config, input.contextThreshold);
        const threshold = Math.floor(contextThreshold * tokenBudget);
        const stopAtTokens = typeof input.stopAtTokens === "number" &&
            Number.isFinite(input.stopAtTokens) &&
            input.stopAtTokens > 0
            ? Math.floor(input.stopAtTokens)
            : undefined;
        if (!force &&
            tokensBefore <= threshold &&
            (stopAtTokens === undefined || tokensBefore <= stopAtTokens)) {
            return {
                actionTaken: false,
                tokensBefore,
                tokensAfter: tokensBefore,
                condensed: false,
            };
        }
        const contextItems = await this.getContextItemsCached(conversationId);
        if (contextItems.length === 0) {
            return {
                actionTaken: false,
                tokensBefore,
                tokensAfter: tokensBefore,
                condensed: false,
            };
        }
        let actionTaken = false;
        let condensed = false;
        let createdSummaryId;
        let level;
        let previousSummaryContent;
        let previousTokens = tokensBefore;
        let hadAuthFailure = false;
        let stoppedForNoProgress = false;
        // Sweep bounds: a single full sweep must not run an unbounded number of
        // summarizer passes, nor exceed a wall-clock budget. Both phases share
        // these counters so the *total* sweep stays bounded — important because
        // this can run inline on the turn-critical path (assemble() deferred-debt
        // drain). On hitting either limit the sweep stops cleanly and returns the
        // consistent partial result built so far.
        //
        // When a multi-round caller (compactUntilUnder) passes operationDeadlineAt,
        // the sweep stops at whichever is sooner: its own sweepDeadlineMs or the
        // operation-wide deadline. Without this clamp each round re-arms a fresh
        // full sweepDeadlineMs and the whole operation can run maxRounds × that.
        const maxSweepIterations = this.resolveMaxSweepIterations();
        const sweepDeadlineMs = this.resolveSweepDeadlineMs();
        const sweepStartedAt = Date.now();
        const ownSweepDeadlineAt = sweepStartedAt + sweepDeadlineMs;
        const sweepDeadlineAt = typeof input.operationDeadlineAt === "number" &&
            Number.isFinite(input.operationDeadlineAt)
            ? Math.min(ownSweepDeadlineAt, input.operationDeadlineAt)
            : ownSweepDeadlineAt;
        let sweepIterations = 0;
        let stoppedAtBudget = false;
        /**
         * Check whether another pass is permitted. Logs a single warning the
         * first time a limit is hit, then returns false for all later checks.
         */
        const sweepBudgetExhausted = (phase) => {
            if (stoppedAtBudget) {
                return true;
            }
            const hitIterationCap = sweepIterations >= maxSweepIterations;
            const hitDeadline = Date.now() >= sweepDeadlineAt;
            if (hitIterationCap || hitDeadline) {
                stoppedAtBudget = true;
                const clampedByOperation = hitDeadline && sweepDeadlineAt < ownSweepDeadlineAt;
                const limit = hitIterationCap
                    ? `iteration cap ${maxSweepIterations}`
                    : clampedByOperation
                        ? `compactUntilUnder operation deadline`
                        : `wall-clock deadline ${sweepDeadlineMs}ms`;
                this.log.warn(`[lcm] compactFullSweep stopped at ${limit} in ${phase} phase: ` +
                    `conversation=${conversationId} passes=${sweepIterations} ` +
                    `elapsedMs=${Date.now() - sweepStartedAt} ` +
                    `tokensBefore=${tokensBefore} tokensSoFar=${runningTokens} ` +
                    `(returning partial result)`);
                return true;
            }
            return false;
        };
        // Phase 1: leaf passes over oldest raw chunks outside the protected tail.
        // Delta tracking: maintain a running token count instead of re-querying DB
        // after each pass. The arithmetic is exact: tokensAfter = tokensBefore - removed + added.
        let runningTokens = tokensBefore;
        let leafScanAfterOrdinal;
        while (true) {
            if (sweepBudgetExhausted("leaf")) {
                break;
            }
            const leafChunk = await this.selectOldestLeafChunk(conversationId, leafChunkTokensOverride, freshTailCountOverride, leafScanAfterOrdinal);
            if (leafChunk.items.length === 0) {
                break;
            }
            if (sweepBudgetExhausted("leaf")) {
                break;
            }
            sweepIterations++;
            const passTokensBefore = runningTokens;
            const passPreviousSummaryContent = previousSummaryContent ??
                (leafScanAfterOrdinal !== undefined
                    ? await this.resolvePriorLeafSummaryContext(conversationId, leafChunk.items)
                    : undefined);
            const leafResult = await this.leafPass(conversationId, leafChunk.items, summarize, passPreviousSummaryContent, input.summaryModel);
            if (!leafResult) {
                hadAuthFailure = true;
                break;
            }
            if ("skipped" in leafResult) {
                leafScanAfterOrdinal = leafChunk.items[leafChunk.items.length - 1]?.ordinal;
                await yieldToEventLoop();
                continue;
            }
            const passTokensAfter = Math.max(0, passTokensBefore - leafResult.removedTokens + leafResult.addedTokens);
            await this.persistCompactionEvents({
                conversationId,
                tokensBefore: passTokensBefore,
                tokensAfterLeaf: passTokensAfter,
                tokensAfterFinal: passTokensAfter,
                leafResult: { summaryId: leafResult.summaryId, level: leafResult.level },
                condenseResult: null,
            });
            actionTaken = true;
            createdSummaryId = leafResult.summaryId;
            level = leafResult.level;
            previousSummaryContent = leafResult.content;
            runningTokens = passTokensAfter;
            if (stopAtTokens !== undefined && runningTokens <= stopAtTokens) {
                break;
            }
            if (passTokensAfter >= passTokensBefore || passTokensAfter >= previousTokens) {
                break;
            }
            previousTokens = passTokensAfter;
            // Yield the event loop between the synchronous node:sqlite scans so a
            // long sweep does not freeze the gateway for its entire duration.
            await yieldToEventLoop();
        }
        // Phase 2: depth-aware condensed passes, always processing shallowest depth first.
        const preferredMaxSourceDepth = this.resolveSweepMaxDepth();
        const summaryPrefixTargetTokens = this.resolveSummaryPrefixTargetTokens(tokenBudget, contextThreshold);
        const hasSummaryPrefixPressure = async () => (await this.countSummaryTokensOutsideFreshTail(conversationId, freshTailCountOverride)) > summaryPrefixTargetTokens;
        const hasStopTargetPressure = () => stopAtTokens !== undefined && runningTokens > stopAtTokens;
        const hasCondensationPressure = async () => hasStopTargetPressure() || await hasSummaryPrefixPressure();
        const runCondensationPass = async (params) => {
            const candidate = await this.selectShallowestCondensationCandidate({
                conversationId,
                hardTrigger: params.useHardFanout,
            });
            if (!candidate) {
                return "no-candidate";
            }
            if (params.enforcePreferredDepth && candidate.targetDepth >= preferredMaxSourceDepth) {
                return "depth-cap";
            }
            if (sweepBudgetExhausted("condensed")) {
                return "budget";
            }
            sweepIterations++;
            const passTokensBefore = runningTokens;
            const condenseResult = await this.condensedPass(conversationId, candidate.chunk.items, candidate.targetDepth, summarize, input.summaryModel);
            if (!condenseResult) {
                hadAuthFailure = true;
                return "auth-failure";
            }
            if ("skipped" in condenseResult) {
                return "no-progress";
            }
            const passTokensAfter = Math.max(0, passTokensBefore - condenseResult.removedTokens + condenseResult.addedTokens);
            await this.persistCompactionEvents({
                conversationId,
                tokensBefore: passTokensBefore,
                tokensAfterLeaf: passTokensBefore,
                tokensAfterFinal: passTokensAfter,
                leafResult: null,
                condenseResult,
            });
            actionTaken = true;
            condensed = true;
            createdSummaryId = condenseResult.summaryId;
            level = condenseResult.level;
            runningTokens = passTokensAfter;
            if (stopAtTokens !== undefined && passTokensAfter <= stopAtTokens) {
                previousTokens = passTokensAfter;
                return "progress";
            }
            if (!force && passTokensAfter <= threshold) {
                previousTokens = passTokensAfter;
                return "progress";
            }
            if (passTokensAfter >= passTokensBefore || passTokensAfter >= previousTokens) {
                return "no-progress";
            }
            previousTokens = passTokensAfter;
            return "progress";
        };
        while (await hasCondensationPressure()) {
            if (sweepBudgetExhausted("condensed")) {
                break;
            }
            const status = await runCondensationPass({
                enforcePreferredDepth: true,
                useHardFanout: hardTrigger === true,
            });
            if (status !== "progress") {
                if (status === "no-progress") {
                    stoppedForNoProgress = true;
                }
                break;
            }
            // Yield between the synchronous node:sqlite scans of consecutive passes.
            await yieldToEventLoop();
        }
        while (!hadAuthFailure &&
            !stoppedForNoProgress &&
            !stoppedAtBudget &&
            await hasCondensationPressure()) {
            if (sweepBudgetExhausted("condensed")) {
                break;
            }
            const status = await runCondensationPass({
                enforcePreferredDepth: false,
                useHardFanout: true,
            });
            if (status !== "progress") {
                if (status === "no-progress") {
                    stoppedForNoProgress = true;
                }
                break;
            }
            // Yield between the synchronous node:sqlite scans of consecutive passes.
            await yieldToEventLoop();
        }
        const tokensAfter = runningTokens;
        return {
            actionTaken,
            tokensBefore,
            tokensAfter,
            createdSummaryId,
            condensed,
            level,
            ...(hadAuthFailure ? { authFailure: true } : {}),
            ...(stoppedAtBudget ? { stoppedAtBudget: true } : {}),
        };
    }
    // ── compactUntilUnder ────────────────────────────────────────────────────
    /** Compact until under the requested target, running up to maxRounds. */
    async compactUntilUnder(input) {
        return this.withContextCache(() => this._compactUntilUnderImpl(input));
    }
    async _compactUntilUnderImpl(input) {
        const { conversationId, tokenBudget, summarize } = input;
        const targetTokens = typeof input.targetTokens === "number" &&
            Number.isFinite(input.targetTokens) &&
            input.targetTokens > 0
            ? Math.floor(input.targetTokens)
            : tokenBudget;
        const storedTokens = await this.summaryStore.getContextTokenCount(conversationId);
        const liveTokens = typeof input.currentTokens === "number" &&
            Number.isFinite(input.currentTokens) &&
            input.currentTokens > 0
            ? Math.floor(input.currentTokens)
            : 0;
        let lastTokens = Math.max(storedTokens, liveTokens);
        // For forced overflow recovery, callers may pass an observed count that
        // equals the context budget. Treat equality as still needing a compaction
        // attempt so we can create headroom for provider-side framing overhead.
        if (lastTokens < targetTokens) {
            return { success: true, rounds: 0, finalTokens: lastTokens };
        }
        // Operation-wide wall-clock bound. Each round runs a compactFullSweep that
        // re-arms its own sweepDeadlineMs; without an operation-wide deadline the
        // worst case is maxRounds × sweepDeadlineMs (~20 min at the defaults). The
        // shared deadline is threaded into each sweep (so a sweep stops at
        // whichever is sooner) and checked here before starting the next round.
        const operationDeadlineMs = this.resolveCompactUntilUnderDeadlineMs();
        const operationStartedAt = Date.now();
        const operationDeadlineAt = operationStartedAt + operationDeadlineMs;
        for (let round = 1; round <= this.config.maxRounds; round++) {
            // Stop before starting another round once the operation budget is spent.
            // The in-flight round may overrun by at most one clamped sweep.
            if (round > 1 && Date.now() >= operationDeadlineAt) {
                this.log.warn(`[lcm] compactUntilUnder stopped at wall-clock deadline ` +
                    `${operationDeadlineMs}ms: conversation=${conversationId} ` +
                    `rounds=${round - 1} elapsedMs=${Date.now() - operationStartedAt} ` +
                    `finalTokens=${lastTokens} targetTokens=${targetTokens} ` +
                    `(returning partial result)`);
                return {
                    success: lastTokens <= targetTokens,
                    rounds: round - 1,
                    finalTokens: lastTokens,
                };
            }
            const result = await this.compact({
                conversationId,
                tokenBudget,
                contextThreshold: input.contextThreshold,
                ...(input.freshTailCount !== undefined
                    ? { freshTailCount: input.freshTailCount }
                    : {}),
                ...(input.leafChunkTokens !== undefined
                    ? { leafChunkTokens: input.leafChunkTokens }
                    : {}),
                summarize,
                force: true,
                summaryModel: input.summaryModel,
                operationDeadlineAt,
            });
            if (result.authFailure) {
                return {
                    success: false,
                    rounds: round,
                    finalTokens: result.tokensAfter,
                    authFailure: true,
                };
            }
            if (result.tokensAfter <= targetTokens) {
                return {
                    success: true,
                    rounds: round,
                    finalTokens: result.tokensAfter,
                };
            }
            // No progress -- bail to avoid infinite loop
            if (!result.actionTaken || result.tokensAfter >= lastTokens) {
                return {
                    success: false,
                    rounds: round,
                    finalTokens: result.tokensAfter,
                };
            }
            lastTokens = result.tokensAfter;
        }
        // Exhausted all rounds — use the last known token count from compact() result
        const finalTokens = lastTokens;
        return {
            success: finalTokens <= targetTokens,
            rounds: this.config.maxRounds,
            finalTokens,
        };
    }
    // ── Private helpers ──────────────────────────────────────────────────────
    /** Normalize configured leaf chunk size to a safe positive integer. */
    resolveLeafChunkTokens(leafChunkTokensOverride) {
        if (typeof leafChunkTokensOverride === "number" &&
            Number.isFinite(leafChunkTokensOverride) &&
            leafChunkTokensOverride > 0) {
            return Math.floor(leafChunkTokensOverride);
        }
        if (typeof this.config.leafChunkTokens === "number" &&
            Number.isFinite(this.config.leafChunkTokens) &&
            this.config.leafChunkTokens > 0) {
            return Math.floor(this.config.leafChunkTokens);
        }
        return DEFAULT_LEAF_CHUNK_TOKENS;
    }
    /** Normalize configured fresh tail count to a safe non-negative integer. */
    resolveFreshTailCount() {
        if (typeof this.config.freshTailCount === "number" &&
            Number.isFinite(this.config.freshTailCount) &&
            this.config.freshTailCount > 0) {
            return Math.floor(this.config.freshTailCount);
        }
        return 0;
    }
    /** Normalize configured fresh tail token cap to a safe non-negative integer. */
    resolveFreshTailMaxTokens() {
        if (typeof this.config.freshTailMaxTokens === "number" &&
            Number.isFinite(this.config.freshTailMaxTokens) &&
            this.config.freshTailMaxTokens >= 0) {
            return Math.floor(this.config.freshTailMaxTokens);
        }
        return undefined;
    }
    /**
     * Compute the ordinal boundary for protected fresh messages.
     *
     * Messages with ordinal >= returned value are preserved as fresh tail.
     */
    async resolveFreshTailOrdinal(contextItems, freshTailCountOverride, messageCache = new Map()) {
        const freshTailCount = (freshTailCountOverride !== undefined && freshTailCountOverride > 0
            ? freshTailCountOverride
            : this.resolveFreshTailCount());
        if (freshTailCount <= 0) {
            return Infinity;
        }
        const freshTailMaxTokens = this.resolveFreshTailMaxTokens();
        const rawMessageItems = contextItems.filter((item) => item.itemType === "message" && item.messageId != null);
        if (rawMessageItems.length === 0) {
            return Infinity;
        }
        let protectedCount = 0;
        let protectedTokens = 0;
        let tailStartOrdinal = Infinity;
        const latestUserOrdinal = await this.resolveLatestRawUserOrdinal(rawMessageItems, messageCache);
        for (let idx = rawMessageItems.length - 1; idx >= 0; idx--) {
            const latestUserProtected = latestUserOrdinal === undefined || tailStartOrdinal <= latestUserOrdinal;
            if (latestUserProtected && protectedCount >= freshTailCount) {
                break;
            }
            const item = rawMessageItems[idx];
            if (!item || item.messageId == null) {
                continue;
            }
            const messageTokens = await this.getMessageTokenCount(item.messageId, messageCache);
            const wouldExceedBudget = latestUserProtected &&
                protectedCount > 0 &&
                typeof freshTailMaxTokens === "number" &&
                protectedTokens + messageTokens > freshTailMaxTokens;
            if (wouldExceedBudget) {
                break;
            }
            tailStartOrdinal = item.ordinal;
            protectedCount++;
            protectedTokens += messageTokens;
        }
        return tailStartOrdinal;
    }
    /** Find the newest raw user ordinal so fresh-tail limits cannot split its turn. */
    async resolveLatestRawUserOrdinal(rawMessageItems, messageCache) {
        for (let idx = rawMessageItems.length - 1; idx >= 0; idx--) {
            const item = rawMessageItems[idx];
            if (!item?.messageId) {
                continue;
            }
            const message = await this.getMessageByIdCached(item.messageId, messageCache);
            if (message?.role === "user") {
                return item.ordinal;
            }
        }
        return undefined;
    }
    /** Read one message at most once while resolving a fresh-tail boundary. */
    async getMessageByIdCached(messageId, messageCache) {
        if (!messageCache.has(messageId)) {
            messageCache.set(messageId, await this.conversationStore.getMessageById(messageId));
        }
        return messageCache.get(messageId) ?? null;
    }
    /** Resolve leaf-source token count, including rendered sender identity. */
    async getMessageTokenCount(messageId, messageCache) {
        const message = messageCache
            ? await this.getMessageByIdCached(messageId, messageCache)
            : await this.conversationStore.getMessageById(messageId);
        if (!message) {
            return 0;
        }
        return this.resolveMessageTokenCount(message);
    }
    /** Sum raw message tokens outside the protected fresh tail. */
    async countRawTokensOutsideFreshTail(conversationId, freshTailCountOverride) {
        const contextItems = await this.getContextItemsCached(conversationId);
        const messageCache = new Map();
        const freshTailOrdinal = await this.resolveFreshTailOrdinal(contextItems, freshTailCountOverride, messageCache);
        let rawTokens = 0;
        for (const item of contextItems) {
            if (item.ordinal >= freshTailOrdinal) {
                break;
            }
            if (item.itemType !== "message" || item.messageId == null) {
                continue;
            }
            rawTokens += await this.getMessageTokenCount(item.messageId, messageCache);
        }
        return rawTokens;
    }
    /** Sum summary tokens outside the protected fresh tail. */
    async countSummaryTokensOutsideFreshTail(conversationId, freshTailCountOverride) {
        const contextItems = await this.getContextItemsCached(conversationId);
        const freshTailOrdinal = await this.resolveFreshTailOrdinal(contextItems, freshTailCountOverride);
        let summaryTokens = 0;
        for (const item of contextItems) {
            if (item.ordinal >= freshTailOrdinal) {
                break;
            }
            if (item.itemType !== "summary" || item.summaryId == null) {
                continue;
            }
            const summary = await this.summaryStore.getSummary(item.summaryId);
            if (summary) {
                summaryTokens += this.resolveSummaryTokenCount(summary);
            }
        }
        return summaryTokens;
    }
    /**
     * Select the oldest contiguous raw-message chunk outside fresh tail.
     *
     * The selected chunk size is capped by `leafChunkTokens`, but we always pick
     * at least one message when any compactable message exists.
     */
    async selectOldestLeafChunk(conversationId, leafChunkTokensOverride, freshTailCountOverride, afterOrdinal) {
        const contextItems = await this.getContextItemsCached(conversationId);
        const freshTailOrdinal = await this.resolveFreshTailOrdinal(contextItems, freshTailCountOverride);
        const threshold = this.resolveLeafChunkTokens(leafChunkTokensOverride);
        let rawTokensOutsideTail = 0;
        for (const item of contextItems) {
            if (item.ordinal >= freshTailOrdinal) {
                break;
            }
            if (item.itemType !== "message" || item.messageId == null) {
                continue;
            }
            rawTokensOutsideTail += await this.getMessageTokenCount(item.messageId);
        }
        const chunk = [];
        let chunkTokens = 0;
        let started = false;
        for (const item of contextItems) {
            if (item.ordinal >= freshTailOrdinal) {
                break;
            }
            if (afterOrdinal !== undefined && item.ordinal <= afterOrdinal) {
                continue;
            }
            if (!started) {
                if (item.itemType !== "message" || item.messageId == null) {
                    continue;
                }
                started = true;
            }
            else if (item.itemType !== "message" || item.messageId == null) {
                break;
            }
            if (item.messageId == null) {
                continue;
            }
            const messageTokens = await this.getMessageTokenCount(item.messageId);
            if (chunk.length > 0 && chunkTokens + messageTokens > threshold) {
                break;
            }
            chunk.push(item);
            chunkTokens += messageTokens;
            if (chunkTokens >= threshold) {
                break;
            }
        }
        return { items: chunk, rawTokensOutsideTail, threshold };
    }
    /**
     * Resolve recent summary continuity for a leaf pass.
     *
     * Collects up to two most recent summary context items that precede the
     * compacted raw-message chunk and returns their combined content.
     */
    async resolvePriorLeafSummaryContext(conversationId, messageItems) {
        if (messageItems.length === 0) {
            return undefined;
        }
        const startOrdinal = Math.min(...messageItems.map((item) => item.ordinal));
        const priorSummaryItems = (await this.getContextItemsCached(conversationId))
            .filter((item) => item.ordinal < startOrdinal &&
            item.itemType === "summary" &&
            typeof item.summaryId === "string");
        if (priorSummaryItems.length === 0) {
            return undefined;
        }
        const summaryContents = [];
        for (const item of [...priorSummaryItems].reverse()) {
            if (typeof item.summaryId !== "string") {
                continue;
            }
            const summary = await this.summaryStore.getSummary(item.summaryId);
            const rawContent = typeof summary?.content === "string" ? summary.content : "";
            // Leaf continuity context is also summarizer input. Sanitize legacy
            // summary rows here so pre-#503 reasoning blocks cannot leak forward
            // when the next raw chunk is compacted.
            const sanitized = extractMeaningfulSummaryText(rawContent).trim();
            if (sanitized) {
                summaryContents.push(sanitized);
                if (summaryContents.length >= 2) {
                    break;
                }
            }
        }
        if (summaryContents.length === 0) {
            return undefined;
        }
        return [...summaryContents].reverse().join("\n\n");
    }
    /** Resolve summary token count with content-length fallback. */
    resolveSummaryTokenCount(summary) {
        if (typeof summary.tokenCount === "number" &&
            Number.isFinite(summary.tokenCount) &&
            summary.tokenCount > 0) {
            return summary.tokenCount;
        }
        return estimateTokens(summary.content);
    }
    summaryHasMeaningfulCondensedSource(summary) {
        return extractMeaningfulSummaryText(summary.content).trim().length > 0;
    }
    /** Resolve leaf-source tokens with content and rendered sender metadata. */
    resolveMessageTokenCount(message) {
        const contentTokens = typeof message.tokenCount === "number" &&
            Number.isFinite(message.tokenCount) &&
            message.tokenCount > 0
            ? message.tokenCount
            : estimateTokens(message.content);
        const sender = message.role === "user"
            ? formatOpenClawSenderForSummary(message.openClawSenderMetadata)
            : null;
        return contentTokens + (sender ? estimateTokens(sender) : 0);
    }
    resolveLeafMinFanout() {
        if (typeof this.config.leafMinFanout === "number" &&
            Number.isFinite(this.config.leafMinFanout) &&
            this.config.leafMinFanout > 0) {
            return Math.floor(this.config.leafMinFanout);
        }
        return 8;
    }
    resolveCondensedMinFanout() {
        if (typeof this.config.condensedMinFanout === "number" &&
            Number.isFinite(this.config.condensedMinFanout) &&
            this.config.condensedMinFanout > 0) {
            return Math.floor(this.config.condensedMinFanout);
        }
        return 4;
    }
    resolveCondensedMinFanoutHard() {
        if (typeof this.config.condensedMinFanoutHard === "number" &&
            Number.isFinite(this.config.condensedMinFanoutHard) &&
            this.config.condensedMinFanoutHard > 0) {
            return Math.floor(this.config.condensedMinFanoutHard);
        }
        return 2;
    }
    resolveSweepMaxDepth() {
        const configured = typeof this.config.sweepMaxDepth === "number" && Number.isFinite(this.config.sweepMaxDepth)
            ? this.config.sweepMaxDepth
            : this.config.incrementalMaxDepth;
        if (typeof configured === "number" &&
            Number.isFinite(configured)) {
            if (configured < 0)
                return Infinity;
            if (configured > 0)
                return Math.floor(configured);
        }
        return 0;
    }
    /** Resolve the hard per-pass iteration cap for a single full sweep. */
    resolveMaxSweepIterations() {
        const configured = this.config.maxSweepIterations;
        if (typeof configured === "number" && Number.isFinite(configured) && configured >= 1) {
            return Math.floor(configured);
        }
        return DEFAULT_MAX_SWEEP_ITERATIONS;
    }
    /** Resolve the wall-clock budget (ms) for a single full sweep. */
    resolveSweepDeadlineMs() {
        const configured = this.config.sweepDeadlineMs;
        if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) {
            return Math.floor(configured);
        }
        return DEFAULT_SWEEP_DEADLINE_MS;
    }
    /** Resolve the wall-clock budget (ms) for a whole compactUntilUnder run. */
    resolveCompactUntilUnderDeadlineMs() {
        const configured = this.config.compactUntilUnderDeadlineMs;
        if (typeof configured === "number" && Number.isFinite(configured) && configured > 0) {
            return Math.floor(configured);
        }
        return DEFAULT_COMPACT_UNTIL_UNDER_DEADLINE_MS;
    }
    /** Resolve the summarized-prefix pressure target for this token budget. */
    resolveSummaryPrefixTargetTokens(tokenBudget, contextThresholdOverride) {
        if (typeof this.config.summaryPrefixTargetTokens === "number" &&
            Number.isFinite(this.config.summaryPrefixTargetTokens) &&
            this.config.summaryPrefixTargetTokens > 0) {
            return Math.floor(this.config.summaryPrefixTargetTokens);
        }
        const threshold = Math.max(1, Math.floor(resolveContextThreshold(this.config, contextThresholdOverride) * tokenBudget));
        const derivedTarget = Math.floor(threshold * 0.5);
        return Math.max(this.config.condensedTargetTokens, Math.min(this.resolveLeafChunkTokens(), derivedTarget));
    }
    resolveFanoutForDepth(targetDepth, hardTrigger) {
        if (hardTrigger) {
            return this.resolveCondensedMinFanoutHard();
        }
        if (targetDepth === 0) {
            return this.resolveLeafMinFanout();
        }
        return this.resolveCondensedMinFanout();
    }
    /** Minimum condensed input size before we run another condensed pass. */
    resolveCondensedMinChunkTokens() {
        const chunkTarget = this.resolveLeafChunkTokens();
        const ratioFloor = Math.floor(chunkTarget * CONDENSED_MIN_INPUT_RATIO);
        return Math.max(this.config.condensedTargetTokens, ratioFloor);
    }
    /**
     * Find the shallowest depth with an eligible same-depth summary chunk.
     */
    async selectShallowestCondensationCandidate(params) {
        const { conversationId, hardTrigger } = params;
        const contextItems = await this.getContextItemsCached(conversationId);
        const freshTailOrdinal = await this.resolveFreshTailOrdinal(contextItems);
        const minChunkTokens = this.resolveCondensedMinChunkTokens();
        const depthLevels = await this.summaryStore.getDistinctDepthsInContext(conversationId, {
            maxOrdinalExclusive: freshTailOrdinal,
        });
        for (const targetDepth of depthLevels) {
            const fanout = this.resolveFanoutForDepth(targetDepth, hardTrigger);
            const chunk = await this.selectOldestChunkAtDepth(conversationId, targetDepth, freshTailOrdinal);
            if (chunk.meaningfulCount < fanout) {
                continue;
            }
            if (chunk.summaryTokens < minChunkTokens) {
                continue;
            }
            return { targetDepth, chunk };
        }
        return null;
    }
    /**
     * Select the oldest contiguous summary chunk at a specific summary depth.
     *
     * Once selection starts, any non-summary item or depth mismatch terminates
     * the chunk to prevent mixed-depth condensation.
     */
    async selectOldestChunkAtDepth(conversationId, targetDepth, freshTailOrdinalOverride) {
        const contextItems = await this.getContextItemsCached(conversationId);
        const freshTailOrdinal = typeof freshTailOrdinalOverride === "number"
            ? freshTailOrdinalOverride
            : await this.resolveFreshTailOrdinal(contextItems);
        const chunkTokenBudget = this.resolveLeafChunkTokens();
        const chunk = [];
        let summaryTokens = 0;
        let meaningfulCount = 0;
        for (const item of contextItems) {
            if (item.ordinal >= freshTailOrdinal) {
                break;
            }
            if (item.itemType !== "summary" || item.summaryId == null) {
                if (chunk.length > 0) {
                    break;
                }
                continue;
            }
            const summary = await this.summaryStore.getSummary(item.summaryId);
            if (!summary) {
                if (chunk.length > 0) {
                    break;
                }
                continue;
            }
            if (summary.depth !== targetDepth) {
                if (chunk.length > 0) {
                    break;
                }
                continue;
            }
            const hasMeaningfulSource = this.summaryHasMeaningfulCondensedSource(summary);
            if (!hasMeaningfulSource && chunk.length === 0) {
                continue;
            }
            const tokenCount = this.resolveSummaryTokenCount(summary);
            if (hasMeaningfulSource && chunk.length > 0 && summaryTokens + tokenCount > chunkTokenBudget) {
                break;
            }
            chunk.push(item);
            if (hasMeaningfulSource) {
                meaningfulCount++;
                summaryTokens += tokenCount;
            }
            if (summaryTokens >= chunkTokenBudget) {
                break;
            }
        }
        return { items: chunk, summaryTokens, meaningfulCount };
    }
    async resolvePriorSummaryContextAtDepth(conversationId, summaryItems, targetDepth) {
        if (summaryItems.length === 0) {
            return undefined;
        }
        const startOrdinal = Math.min(...summaryItems.map((item) => item.ordinal));
        const priorSummaryItems = (await this.getContextItemsCached(conversationId))
            .filter((item) => item.ordinal < startOrdinal &&
            item.itemType === "summary" &&
            typeof item.summaryId === "string");
        if (priorSummaryItems.length === 0) {
            return undefined;
        }
        const summaryContents = [];
        for (const item of [...priorSummaryItems].reverse()) {
            if (typeof item.summaryId !== "string") {
                continue;
            }
            const summary = await this.summaryStore.getSummary(item.summaryId);
            if (!summary || summary.depth !== targetDepth) {
                continue;
            }
            const rawContent = typeof summary.content === "string" ? summary.content : "";
            // Apply the same reasoning/thinking-block sanitizer used at the leaf
            // input (PR #503) so prior-summary context fed back into the summarizer
            // can never reintroduce raw thinking blocks at higher levels.  See #564.
            //
            // An empty `sanitized` is a deliberate signal: the stored summary was
            // structurally reasoning-only (or otherwise had no meaningful text).
            // Skip such summaries entirely — falling back to `rawContent` would
            // re-introduce the very thinking/reasoning payload this sanitizer is
            // trying to keep out of higher-level summarizer inputs.
            const sanitized = extractMeaningfulSummaryText(rawContent).trim();
            if (sanitized) {
                summaryContents.push(sanitized);
                if (summaryContents.length >= 2) {
                    break;
                }
            }
        }
        if (summaryContents.length === 0) {
            return undefined;
        }
        return [...summaryContents].reverse().join("\n\n");
    }
    /**
     * Run three-level summarization escalation:
     * normal -> aggressive -> deterministic fallback.
     *
     * Provider-auth failures are treated as non-compacting skips so we do not
     * persist truncation artifacts into the summary DAG.
     */
    async summarizeWithEscalation(params) {
        const sourceText = typeof params.sourceText === "string" ? params.sourceText.trim() : "";
        if (!sourceText) {
            return null;
        }
        const inputTokens = Math.max(1, estimateTokens(sourceText));
        const fallbackMaxTokens = typeof this.config.fallbackMaxTokens === "number" &&
            Number.isFinite(this.config.fallbackMaxTokens) &&
            this.config.fallbackMaxTokens >= MIN_FALLBACK_MAX_TOKENS
            ? Math.floor(this.config.fallbackMaxTokens)
            : FALLBACK_MAX_TOKENS;
        const buildDeterministicFallback = () => {
            const truncationNote = `[Truncated from ${inputTokens} tokens]`;
            const directiveOmissionNote = [
                FALLBACK_DIRECTIVE_SUMMARY_MARKER,
                truncationNote,
            ].join("\n");
            const content = buildDeterministicFallbackSummary(sourceText, fallbackMaxTokens, {
                maxTokens: fallbackMaxTokens,
                truncationNote,
                directiveOmissionNote,
                alwaysAppendNote: true,
            });
            return {
                content,
                level: "fallback",
            };
        };
        const authFailure = Symbol("authFailure");
        const runSummarizer = async (aggressiveMode) => {
            let output;
            try {
                output = await params.summarize(sourceText, aggressiveMode, params.options);
            }
            catch (err) {
                if (err instanceof LcmProviderAuthError) {
                    return authFailure;
                }
                throw err;
            }
            const trimmed = output.trim();
            return trimmed || null;
        };
        const initialSummary = await runSummarizer(false);
        if (initialSummary === authFailure) {
            return null;
        }
        if (initialSummary === null) {
            // Empty provider output should still compact deterministically so a
            // silent no-op does not stall compaction forever.
            return buildDeterministicFallback();
        }
        let summaryText = initialSummary;
        let level = "normal";
        if (estimateTokens(summaryText) >= inputTokens) {
            const aggressiveSummary = await runSummarizer(true);
            if (aggressiveSummary === authFailure) {
                return null;
            }
            if (aggressiveSummary === null) {
                return buildDeterministicFallback();
            }
            summaryText = aggressiveSummary;
            level = "aggressive";
            if (estimateTokens(summaryText) >= inputTokens) {
                return buildDeterministicFallback();
            }
        }
        // Hard cap: enforce maximum summary size relative to the kind-appropriate target.
        const summaryTokens = estimateTokens(summaryText);
        const maxTokens = Math.ceil(params.targetTokens * this.config.summaryMaxOverageFactor);
        if (summaryTokens > Math.ceil(params.targetTokens * 1.5)) {
            this.log.warn(`[lcm] summary exceeds target by ${Math.round((summaryTokens / params.targetTokens - 1) * 100)}%: ${summaryTokens} tokens vs target ${params.targetTokens}`);
        }
        if (summaryTokens > maxTokens) {
            summaryText = capSummaryText(summaryText, summaryTokens, maxTokens);
            level = "capped";
        }
        return { content: summaryText, level };
    }
    // ── Private: Leaf Pass ───────────────────────────────────────────────────
    /**
     * Summarize a chunk of messages into one leaf summary.
     */
    async leafPass(conversationId, messageItems, summarize, previousSummaryContent, summaryModel) {
        // Fetch full message content for each context item
        const messageContents = [];
        for (const item of messageItems) {
            if (item.messageId == null) {
                continue;
            }
            const msg = await this.conversationStore.getMessageById(item.messageId);
            if (msg) {
                messageContents.push({
                    messageId: msg.messageId,
                    role: msg.role,
                    content: await resolveLeafSummaryMessageContent(this.conversationStore, msg),
                    createdAt: msg.createdAt,
                    tokenCount: this.resolveMessageTokenCount(msg),
                    openClawSenderMetadata: msg.openClawSenderMetadata,
                });
            }
        }
        if (messageContents.length === 0) {
            this.log.warn(`[lcm] leaf compaction skipped; no valid messages; conversationId=${conversationId}; items=${messageItems.length}`);
            return { skipped: "empty-source" };
        }
        const concatenated = messageContents
            .map((message) => {
            // Strip injected plugin context blocks (memory/hindsight XML tags) first,
            // then strip provider reasoning/thinking blocks so encrypted signatures and
            // non-visible metadata don't pollute the summary.
            const cleaned = stripInjectedContextBlocks(message.content, this.config.stripInjectedContextTags);
            const text = extractMeaningfulMessageText(cleaned);
            if (!text)
                return null;
            // Role stays in the header line so the summarizer can tell an operator
            // instruction from material a tool fetched out of another conversation.
            const sender = message.role === "user"
                ? formatOpenClawSenderForSummary(message.openClawSenderMetadata)
                : null;
            const senderSuffix = sender ? ` | ${sender}` : "";
            return `[${formatTimestamp(message.createdAt, this.config.timezone)} | ${message.role}${senderSuffix}]\n${text}`;
        })
            .filter((s) => s !== null)
            .join("\n\n");
        if (!concatenated.trim()) {
            this.log.warn(`[lcm] leaf compaction skipped; no meaningful content; conversationId=${conversationId}; chunkMessages=${messageContents.length}`);
            return { skipped: "empty-source" };
        }
        const fileIds = dedupeOrderedIds(messageContents.flatMap((message) => extractFileIdsFromContent(message.content)));
        const summary = await this.summarizeWithEscalation({
            sourceText: concatenated,
            summarize,
            options: {
                previousSummary: previousSummaryContent,
                isCondensed: false,
            },
            targetTokens: this.config.leafTargetTokens,
        });
        if (!summary) {
            this.log.warn(`[lcm] leaf compaction skipped summary write; conversationId=${conversationId}; chunkMessages=${messageContents.length}`);
            return null;
        }
        // Persist the leaf summary
        const summaryId = generateSummaryId(summary.content);
        const tokenCount = estimateTokens(summary.content);
        // removedTokens reflects the complete leaf source, including rendered sender
        // identity and the content fallback for invalid stored token counts. It can
        // exceed getContextTokenCount(), which stores content tokens only, but that
        // keeps chunk/progress accounting aligned with actual summarizer input.
        // For summaries, removedTokens matches the DB exactly (same tokenCount column).
        const removedTokens = messageContents.reduce((sum, message) => sum + Math.max(0, Math.floor(message.tokenCount)), 0);
        await this.summaryStore.withTransaction(async () => {
            await this.summaryStore.insertSummary({
                summaryId,
                conversationId,
                kind: "leaf",
                depth: 0,
                content: summary.content,
                tokenCount,
                fileIds,
                earliestAt: messageContents.length > 0
                    ? new Date(Math.min(...messageContents.map((message) => message.createdAt.getTime())))
                    : undefined,
                latestAt: messageContents.length > 0
                    ? new Date(Math.max(...messageContents.map((message) => message.createdAt.getTime())))
                    : undefined,
                descendantCount: 0,
                descendantTokenCount: 0,
                sourceMessageTokenCount: removedTokens,
                model: summaryModel,
            });
            // Link to source messages before the context swap becomes visible.
            const messageIds = messageContents.map((m) => m.messageId);
            await this.summaryStore.linkSummaryToMessages(summaryId, messageIds);
            // Replace the message range in context with the new summary.
            const ordinals = messageItems.map((ci) => ci.ordinal);
            const startOrdinal = Math.min(...ordinals);
            const endOrdinal = Math.max(...ordinals);
            await this.summaryStore.replaceContextRangeWithSummary({
                conversationId,
                startOrdinal,
                endOrdinal,
                summaryId,
            });
        });
        this.invalidateContextCache(conversationId);
        return { summaryId, level: summary.level, content: summary.content, removedTokens, addedTokens: tokenCount };
    }
    // ── Private: Condensed Pass ──────────────────────────────────────────────
    /**
     * Condense one ratio-sized summary chunk into a single condensed summary.
     */
    async condensedPass(conversationId, summaryItems, targetDepth, summarize, summaryModel) {
        // Fetch full summary records
        const summaryRecords = [];
        for (const item of summaryItems) {
            if (item.summaryId == null) {
                continue;
            }
            const rec = await this.summaryStore.getSummary(item.summaryId);
            if (rec) {
                summaryRecords.push(rec);
            }
        }
        // Sanitize stored summary content before re-summarizing.  Leaves persisted
        // before #503 (and any future leak from a reasoning-capable summaryModel)
        // may carry embedded thinking/reasoning blocks; strip them at every
        // summarizer boundary, not only at the leaf input.  See #564.
        //
        // An empty sanitized body is the deterministic signal that the stored
        // summary was thinking/reasoning-only (or otherwise had no meaningful
        // text).  Drop those records entirely — falling back to the raw stored
        // content would feed reasoning payloads right back into the condensed
        // summarizer input, undermining the boundary sanitizer.
        const concatenated = summaryRecords
            .map((summary) => {
            const earliestAt = summary.earliestAt ?? summary.createdAt;
            const latestAt = summary.latestAt ?? summary.createdAt;
            const tz = this.config.timezone;
            const header = `[${formatTimestamp(earliestAt, tz)} - ${formatTimestamp(latestAt, tz)}]`;
            const sanitized = extractMeaningfulSummaryText(summary.content).trim();
            return sanitized ? `${header}\n${sanitized}` : "";
        })
            .filter((entry) => entry.trim().length > 0)
            .join("\n\n");
        if (!concatenated.trim()) {
            this.log.warn(`[lcm] condensed compaction skipped summary write; conversationId=${conversationId}; depth=${targetDepth}; chunkSummaries=${summaryRecords.length}; sanitized_source=empty`);
            return { skipped: "empty-source" };
        }
        const fileIds = dedupeOrderedIds(summaryRecords.flatMap((summary) => [
            ...summary.fileIds,
            ...extractFileIdsFromContent(summary.content),
        ]));
        const previousSummaryContent = targetDepth === 0
            ? await this.resolvePriorSummaryContextAtDepth(conversationId, summaryItems, targetDepth)
            : undefined;
        const condensed = await this.summarizeWithEscalation({
            sourceText: concatenated,
            summarize,
            options: {
                previousSummary: previousSummaryContent,
                isCondensed: true,
                depth: targetDepth + 1,
            },
            targetTokens: this.config.condensedTargetTokens,
        });
        if (!condensed) {
            this.log.warn(`[lcm] condensed compaction skipped summary write; conversationId=${conversationId}; depth=${targetDepth}; chunkSummaries=${summaryRecords.length}`);
            return null;
        }
        // Persist the condensed summary
        const summaryId = generateSummaryId(condensed.content);
        const tokenCount = estimateTokens(condensed.content);
        await this.summaryStore.withTransaction(async () => {
            await this.summaryStore.insertSummary({
                summaryId,
                conversationId,
                kind: "condensed",
                depth: targetDepth + 1,
                content: condensed.content,
                tokenCount,
                fileIds,
                earliestAt: summaryRecords.length > 0
                    ? new Date(Math.min(...summaryRecords.map((summary) => (summary.earliestAt ?? summary.createdAt).getTime())))
                    : undefined,
                latestAt: summaryRecords.length > 0
                    ? new Date(Math.max(...summaryRecords.map((summary) => (summary.latestAt ?? summary.createdAt).getTime())))
                    : undefined,
                descendantCount: summaryRecords.reduce((count, summary) => {
                    const childDescendants = typeof summary.descendantCount === "number" && Number.isFinite(summary.descendantCount)
                        ? Math.max(0, Math.floor(summary.descendantCount))
                        : 0;
                    return count + childDescendants + 1;
                }, 0),
                descendantTokenCount: summaryRecords.reduce((count, summary) => {
                    const childDescendantTokens = typeof summary.descendantTokenCount === "number" &&
                        Number.isFinite(summary.descendantTokenCount)
                        ? Math.max(0, Math.floor(summary.descendantTokenCount))
                        : 0;
                    return count + Math.max(0, Math.floor(summary.tokenCount)) + childDescendantTokens;
                }, 0),
                sourceMessageTokenCount: summaryRecords.reduce((count, summary) => {
                    const sourceTokens = typeof summary.sourceMessageTokenCount === "number" &&
                        Number.isFinite(summary.sourceMessageTokenCount)
                        ? Math.max(0, Math.floor(summary.sourceMessageTokenCount))
                        : 0;
                    return count + sourceTokens;
                }, 0),
                model: summaryModel,
            });
            // Link to parent summaries before the context swap becomes visible.
            const parentSummaryIds = summaryRecords.map((s) => s.summaryId);
            await this.summaryStore.linkSummaryToParents(summaryId, parentSummaryIds);
            // Replace all summary items in context with the condensed summary.
            const ordinals = summaryItems.map((ci) => ci.ordinal);
            const startOrdinal = Math.min(...ordinals);
            const endOrdinal = Math.max(...ordinals);
            await this.summaryStore.replaceContextRangeWithSummary({
                conversationId,
                startOrdinal,
                endOrdinal,
                summaryId,
            });
        });
        this.invalidateContextCache(conversationId);
        const removedTokens = summaryRecords.reduce((sum, s) => sum + Math.max(0, Math.floor(s.tokenCount)), 0);
        return { summaryId, level: condensed.level, removedTokens, addedTokens: tokenCount };
    }
    /** Emit compaction telemetry without mutating canonical conversation history. */
    async persistCompactionEvents(input) {
        const { conversationId, tokensBefore, tokensAfterLeaf, tokensAfterFinal, leafResult, condenseResult, } = input;
        if (!leafResult && !condenseResult) {
            return;
        }
        const conversation = await this.conversationStore.getConversation(conversationId);
        if (!conversation) {
            return;
        }
        const createdSummaryIds = [leafResult?.summaryId, condenseResult?.summaryId].filter((id) => typeof id === "string" && id.length > 0);
        const condensedPassOccurred = condenseResult !== null;
        if (leafResult) {
            await this.persistCompactionEvent({
                conversationId,
                sessionId: conversation.sessionId,
                pass: "leaf",
                level: leafResult.level,
                tokensBefore,
                tokensAfter: tokensAfterLeaf,
                createdSummaryId: leafResult.summaryId,
                createdSummaryIds,
                condensedPassOccurred,
            });
        }
        if (condenseResult) {
            await this.persistCompactionEvent({
                conversationId,
                sessionId: conversation.sessionId,
                pass: "condensed",
                level: condenseResult.level,
                tokensBefore: tokensAfterLeaf,
                tokensAfter: tokensAfterFinal,
                createdSummaryId: condenseResult.summaryId,
                createdSummaryIds,
                condensedPassOccurred,
            });
        }
    }
    /** Log one compaction event without appending a synthetic chat message. */
    async persistCompactionEvent(input) {
        const content = `LCM compaction ${input.pass} pass (${input.level}): ${input.tokensBefore} -> ${input.tokensAfter}`;
        this.log.info(`[lcm] ${content} conversation=${input.conversationId} summary=${input.createdSummaryId}`);
    }
}
