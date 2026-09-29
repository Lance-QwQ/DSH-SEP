import { open, realpath } from "node:fs/promises";
import { resolve as resolvePath, sep as pathSep } from "node:path";
import { withDatabaseTransaction } from "../transaction-mutex.js";
import { appendConversationScopeConstraint } from "./conversation-scope.js";
import { sanitizeFts5Query } from "./fts5-sanitize.js";
import { buildLikeSearchPlan, containsCjk, createFallbackSnippet } from "./full-text-fallback.js";
import { parseUtcTimestamp, parseUtcTimestampOrNull } from "./parse-utc-timestamp.js";
import { buildFtsOrderBy } from "./full-text-sort.js";
import { compileSafeSearchRegex } from "./search-regex.js";
export const DEFAULT_LARGE_FILE_SEARCH_MAX_BYTES = 512_000;
const SUMMARY_SEARCH_TIME_EXPR = "COALESCE(s.latest_at, s.created_at)";
const SUMMARY_SEARCH_TIME_EXPR_UNQUALIFIED = "COALESCE(latest_at, created_at)";
const CJK_QUERY_SEGMENT_RE = /[\u2E80-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\uAC00-\uD7AF\u3040-\u309F\u30A0-\u30FF]+/g;
const LATIN_QUERY_TOKEN_RE = /[a-zA-Z0-9][\w./-]*/g;
// ── Row mappers ───────────────────────────────────────────────────────────────
function toSummaryRecord(row) {
    let fileIds = [];
    try {
        fileIds = JSON.parse(row.file_ids);
    }
    catch {
        // ignore malformed JSON
    }
    return {
        summaryId: row.summary_id,
        conversationId: row.conversation_id,
        kind: row.kind,
        depth: row.depth,
        content: row.content,
        tokenCount: row.token_count,
        fileIds,
        earliestAt: parseUtcTimestampOrNull(row.earliest_at),
        latestAt: parseUtcTimestampOrNull(row.latest_at),
        descendantCount: typeof row.descendant_count === "number" &&
            Number.isFinite(row.descendant_count) &&
            row.descendant_count >= 0
            ? Math.floor(row.descendant_count)
            : 0,
        descendantTokenCount: typeof row.descendant_token_count === "number" &&
            Number.isFinite(row.descendant_token_count) &&
            row.descendant_token_count >= 0
            ? Math.floor(row.descendant_token_count)
            : 0,
        sourceMessageTokenCount: typeof row.source_message_token_count === "number" &&
            Number.isFinite(row.source_message_token_count) &&
            row.source_message_token_count >= 0
            ? Math.floor(row.source_message_token_count)
            : 0,
        model: typeof row.model === "string" ? row.model : "unknown",
        createdAt: parseUtcTimestamp(row.created_at),
    };
}
function toContextItemRecord(row) {
    return {
        conversationId: row.conversation_id,
        ordinal: row.ordinal,
        itemType: row.item_type,
        messageId: row.message_id,
        summaryId: row.summary_id,
        createdAt: parseUtcTimestamp(row.created_at),
    };
}
function toSearchResult(row) {
    return {
        summaryId: row.summary_id,
        conversationId: row.conversation_id,
        kind: row.kind,
        snippet: row.snippet,
        createdAt: parseUtcTimestamp(row.created_at),
        rank: row.rank,
    };
}
function toLargeFileRecord(row) {
    return {
        fileId: row.file_id,
        conversationId: row.conversation_id,
        fileName: row.file_name,
        mimeType: row.mime_type,
        byteSize: row.byte_size,
        lineCount: row.line_count,
        storageUri: row.storage_uri,
        explorationSummary: row.exploration_summary,
        createdAt: parseUtcTimestamp(row.created_at),
    };
}
function isTextLikeMimeType(mimeType) {
    if (mimeType == null) {
        return true;
    }
    const lower = mimeType.toLowerCase();
    if (lower.startsWith("text/")) {
        return true;
    }
    if (lower.includes("json") ||
        lower.includes("javascript") ||
        lower.includes("xml") ||
        lower.includes("yaml") ||
        lower.includes("yml") ||
        lower.includes("toml")) {
        return true;
    }
    return false;
}
function findRegexMatches(content, pattern, maxMatches) {
    const regex = compileSafeSearchRegex(pattern, "g");
    if (!regex) {
        return [];
    }
    const matches = [];
    let match;
    while ((match = regex.exec(content)) !== null && matches.length < maxMatches) {
        matches.push({ index: match.index, length: match[0].length, text: match[0] });
        if (match.index === regex.lastIndex) {
            regex.lastIndex++;
        }
    }
    return matches;
}
function findFullTextMatches(content, query, maxMatches) {
    const terms = parseFullTextTerms(query);
    if (terms.length === 0) {
        return [];
    }
    const lowerContent = content.toLowerCase();
    const lowerTerms = terms.map((t) => t.toLowerCase());
    // AND semantics: every term must appear somewhere in the document.
    for (const term of lowerTerms) {
        if (!lowerContent.includes(term)) {
            return [];
        }
    }
    const matches = [];
    const firstTerm = lowerTerms[0];
    let searchFrom = 0;
    while (matches.length < maxMatches) {
        const index = lowerContent.indexOf(firstTerm, searchFrom);
        if (index === -1) {
            break;
        }
        matches.push({
            index,
            length: terms[0].length,
            text: content.slice(index, index + terms[0].length),
        });
        searchFrom = index + 1;
    }
    return matches;
}
function lineNumberAt(content, index) {
    let line = 1;
    for (let i = 0; i < index && i < content.length; i++) {
        if (content[i] === "\n") {
            line++;
        }
    }
    return line;
}
function parseFullTextTerms(query) {
    const terms = [];
    let inQuote = false;
    let current = "";
    for (const char of query.trim()) {
        if (char === '"') {
            if (inQuote) {
                if (current.length > 0) {
                    terms.push(current);
                    current = "";
                }
                inQuote = false;
            }
            else {
                inQuote = true;
            }
            continue;
        }
        if (char === " " && !inQuote) {
            if (current.length > 0) {
                terms.push(current);
                current = "";
            }
            continue;
        }
        current += char;
    }
    if (current.length > 0) {
        terms.push(current);
    }
    return terms;
}
function createSearchSnippet(content, index, length) {
    const context = 80;
    const start = Math.max(0, index - context);
    const end = Math.min(content.length, index + length + context);
    let snippet = content.slice(start, end).replace(/\n/g, " ").trim();
    if (start > 0) {
        snippet = "..." + snippet;
    }
    if (end < content.length) {
        snippet = snippet + "...";
    }
    return snippet;
}
function byteOffsetAt(content, index) {
    return Buffer.byteLength(content.slice(0, index), "utf8");
}
// ── SummaryStore ──────────────────────────────────────────────────────────────
export class SummaryStore {
    db;
    fts5Available;
    constructor(db, options) {
        this.db = db;
        this.fts5Available = options?.fts5Available ?? true;
    }
    // ── Summary CRUD ──────────────────────────────────────────────────────────
    async insertSummary(input) {
        const fileIds = JSON.stringify(input.fileIds ?? []);
        const earliestAt = input.earliestAt instanceof Date ? input.earliestAt.toISOString() : null;
        const latestAt = input.latestAt instanceof Date ? input.latestAt.toISOString() : null;
        const descendantCount = typeof input.descendantCount === "number" &&
            Number.isFinite(input.descendantCount) &&
            input.descendantCount >= 0
            ? Math.floor(input.descendantCount)
            : 0;
        const descendantTokenCount = typeof input.descendantTokenCount === "number" &&
            Number.isFinite(input.descendantTokenCount) &&
            input.descendantTokenCount >= 0
            ? Math.floor(input.descendantTokenCount)
            : 0;
        const sourceMessageTokenCount = typeof input.sourceMessageTokenCount === "number" &&
            Number.isFinite(input.sourceMessageTokenCount) &&
            input.sourceMessageTokenCount >= 0
            ? Math.floor(input.sourceMessageTokenCount)
            : 0;
        const depth = typeof input.depth === "number" && Number.isFinite(input.depth) && input.depth >= 0
            ? Math.floor(input.depth)
            : input.kind === "leaf"
                ? 0
                : 1;
        this.db
            .prepare(`INSERT INTO summaries (
          summary_id,
          conversation_id,
          kind,
          depth,
          content,
          token_count,
          file_ids,
          earliest_at,
          latest_at,
          descendant_count,
          descendant_token_count,
          source_message_token_count,
          model
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(input.summaryId, input.conversationId, input.kind, depth, input.content, input.tokenCount, fileIds, earliestAt, latestAt, descendantCount, descendantTokenCount, sourceMessageTokenCount, input.model ?? "unknown");
        const row = this.db
            .prepare(`SELECT summary_id, conversation_id, kind, depth, content, token_count, file_ids,
                earliest_at, latest_at, descendant_count, created_at
                , descendant_token_count, source_message_token_count, model
       FROM summaries WHERE summary_id = ?`)
            .get(input.summaryId);
        // Index in FTS5 as best-effort; compaction flow must continue even if
        // FTS indexing fails for any reason.
        if (!this.fts5Available) {
            return toSummaryRecord(row);
        }
        try {
            this.db
                .prepare(`INSERT INTO summaries_fts(summary_id, content) VALUES (?, ?)`)
                .run(input.summaryId, input.content);
        }
        catch {
            // FTS indexing failed — search won't find this summary but
            // compaction and assembly will still work correctly.
        }
        // Also index into the CJK trigram FTS table for CJK substring search.
        try {
            this.db
                .prepare(`INSERT INTO summaries_fts_cjk(summary_id, content) VALUES (?, ?)`)
                .run(input.summaryId, input.content);
        }
        catch {
            // CJK trigram FTS table may not exist yet (pre-migration); ignore.
        }
        return toSummaryRecord(row);
    }
    async getSummary(summaryId) {
        const row = this.db
            .prepare(`SELECT summary_id, conversation_id, kind, depth, content, token_count, file_ids,
                earliest_at, latest_at, descendant_count, created_at
                , descendant_token_count, source_message_token_count, model
       FROM summaries WHERE summary_id = ?`)
            .get(summaryId);
        return row ? toSummaryRecord(row) : null;
    }
    /** Return the min/max source message sequence linked to a summary or its parent summaries. */
    async getSummaryMessageSeqRange(summaryId) {
        // SQLite preserves CROSS JOIN order: visit this lineage before looking up its messages.
        // Reordering these joins can scan every conversation's message links once per summary,
        // blocking context assembly on synchronous database reads.
        const row = this.db
            .prepare(`WITH RECURSIVE source_summaries(summary_id) AS (
           SELECT ?
           UNION
           SELECT sp.parent_summary_id
           FROM summary_parents sp
           JOIN source_summaries source ON source.summary_id = sp.summary_id
         )
         SELECT MIN(m.seq) AS min_seq,
                MAX(m.seq) AS max_seq
         FROM source_summaries source
         CROSS JOIN summary_messages sm ON sm.summary_id = source.summary_id
         CROSS JOIN messages m ON m.message_id = sm.message_id
         `)
            .get(summaryId);
        return {
            minSeq: row?.min_seq ?? null,
            maxSeq: row?.max_seq ?? null,
        };
    }
    async getSummariesByConversation(conversationId) {
        const rows = this.db
            .prepare(`SELECT summary_id, conversation_id, kind, depth, content, token_count, file_ids,
                earliest_at, latest_at, descendant_count, created_at
                , descendant_token_count, source_message_token_count, model
       FROM summaries
       WHERE conversation_id = ?
       ORDER BY created_at`)
            .all(conversationId);
        return rows.map(toSummaryRecord);
    }
    // ── Lineage ───────────────────────────────────────────────────────────────
    async linkSummaryToMessages(summaryId, messageIds) {
        if (messageIds.length === 0) {
            return;
        }
        const stmt = this.db.prepare(`INSERT INTO summary_messages (summary_id, message_id, ordinal)
       VALUES (?, ?, ?)
       ON CONFLICT (summary_id, message_id) DO NOTHING`);
        for (let idx = 0; idx < messageIds.length; idx++) {
            stmt.run(summaryId, messageIds[idx], idx);
        }
    }
    async linkSummaryToParents(summaryId, parentSummaryIds) {
        if (parentSummaryIds.length === 0) {
            return;
        }
        const stmt = this.db.prepare(`INSERT INTO summary_parents (summary_id, parent_summary_id, ordinal)
       VALUES (?, ?, ?)
       ON CONFLICT (summary_id, parent_summary_id) DO NOTHING`);
        for (let idx = 0; idx < parentSummaryIds.length; idx++) {
            stmt.run(summaryId, parentSummaryIds[idx], idx);
        }
    }
    async getSummaryMessages(summaryId) {
        const rows = this.db
            .prepare(`SELECT message_id FROM summary_messages
       WHERE summary_id = ?
       ORDER BY ordinal`)
            .all(summaryId);
        return rows.map((r) => r.message_id);
    }
    /**
     * Return the deepest persisted summary depth for a conversation.
     */
    async getConversationMaxSummaryDepth(conversationId) {
        const row = this.db
            .prepare(`SELECT MAX(depth) AS max_depth
         FROM summaries
         WHERE conversation_id = ?`)
            .get(conversationId);
        return typeof row?.max_depth === "number" ? row.max_depth : null;
    }
    /**
     * Resolve raw message hits back to their linked leaf summaries.
     */
    async getLeafSummaryLinksForMessageIds(conversationId, messageIds) {
        const normalizedMessageIds = Array.from(new Set(messageIds.filter((messageId) => Number.isInteger(messageId) && messageId > 0)));
        if (normalizedMessageIds.length === 0) {
            return [];
        }
        const placeholders = normalizedMessageIds.map(() => "?").join(", ");
        const rows = this.db
            .prepare(`SELECT sm.message_id, sm.summary_id
         FROM summary_messages sm
         JOIN summaries s ON s.summary_id = sm.summary_id
         WHERE s.conversation_id = ?
           AND s.kind = 'leaf'
           AND sm.message_id IN (${placeholders})
         ORDER BY sm.ordinal ASC, s.created_at ASC`)
            .all(conversationId, ...normalizedMessageIds);
        const summaryIdsByMessageId = new Map();
        for (const row of rows) {
            const existing = summaryIdsByMessageId.get(row.message_id) ?? [];
            if (!existing.includes(row.summary_id)) {
                existing.push(row.summary_id);
                summaryIdsByMessageId.set(row.message_id, existing);
            }
        }
        const orderedLinks = [];
        for (const messageId of normalizedMessageIds) {
            for (const summaryId of summaryIdsByMessageId.get(messageId) ?? []) {
                orderedLinks.push({
                    messageId,
                    summaryId,
                });
            }
        }
        return orderedLinks;
    }
    async getSummaryChildren(parentSummaryId) {
        const rows = this.db
            .prepare(`SELECT s.summary_id, s.conversation_id, s.kind, s.depth, s.content, s.token_count,
                s.file_ids, s.earliest_at, s.latest_at, s.descendant_count, s.created_at
                , s.descendant_token_count, s.source_message_token_count, s.model
       FROM summaries s
       JOIN summary_parents sp ON sp.summary_id = s.summary_id
       WHERE sp.parent_summary_id = ?
       ORDER BY sp.ordinal`)
            .all(parentSummaryId);
        return rows.map(toSummaryRecord);
    }
    // NOTE: historical naming is confusing here.
    // getSummaryParents(summaryId) returns the source summaries compacted into
    // `summaryId`. Expansion should use this direction for replay.
    async getSummaryParents(summaryId) {
        const rows = this.db
            .prepare(`SELECT s.summary_id, s.conversation_id, s.kind, s.depth, s.content, s.token_count,
                s.file_ids, s.earliest_at, s.latest_at, s.descendant_count, s.created_at
                , s.descendant_token_count, s.source_message_token_count, s.model
       FROM summaries s
       JOIN summary_parents sp ON sp.parent_summary_id = s.summary_id
       WHERE sp.summary_id = ?
       ORDER BY sp.ordinal`)
            .all(summaryId);
        return rows.map(toSummaryRecord);
    }
    async getSummarySubtree(summaryId) {
        const rows = this.db
            .prepare(`WITH RECURSIVE subtree(summary_id, parent_summary_id, depth_from_root, path) AS (
           SELECT ?, NULL, 0, ''
           UNION ALL
           SELECT
             sp.summary_id,
             sp.parent_summary_id,
             subtree.depth_from_root + 1,
             CASE
               WHEN subtree.path = '' THEN printf('%04d', sp.ordinal)
               ELSE subtree.path || '.' || printf('%04d', sp.ordinal)
             END
           FROM summary_parents sp
           JOIN subtree ON sp.parent_summary_id = subtree.summary_id
         )
         SELECT
           s.summary_id,
           s.conversation_id,
           s.kind,
           s.depth,
           s.content,
           s.token_count,
           s.file_ids,
           s.earliest_at,
           s.latest_at,
           s.descendant_count,
           s.descendant_token_count,
           s.source_message_token_count,
           s.model,
           s.created_at,
           subtree.depth_from_root,
           subtree.parent_summary_id,
           subtree.path,
           (
             SELECT COUNT(*) FROM summary_parents sp2
             WHERE sp2.parent_summary_id = s.summary_id
           ) AS child_count
         FROM subtree
         JOIN summaries s ON s.summary_id = subtree.summary_id
         ORDER BY subtree.depth_from_root ASC, subtree.path ASC, s.created_at ASC`)
            .all(summaryId);
        const seen = new Set();
        const output = [];
        for (const row of rows) {
            if (seen.has(row.summary_id)) {
                continue;
            }
            seen.add(row.summary_id);
            output.push({
                ...toSummaryRecord(row),
                depthFromRoot: Math.max(0, Math.floor(row.depth_from_root ?? 0)),
                parentSummaryId: row.parent_summary_id ?? null,
                path: typeof row.path === "string" ? row.path : "",
                childCount: typeof row.child_count === "number" && Number.isFinite(row.child_count)
                    ? Math.max(0, Math.floor(row.child_count))
                    : 0,
            });
        }
        return output;
    }
    // ── Context items ─────────────────────────────────────────────────────────
    async getContextItems(conversationId) {
        const rows = this.db
            .prepare(`SELECT conversation_id, ordinal, item_type, message_id, summary_id, created_at
       FROM context_items
       WHERE conversation_id = ?
       ORDER BY ordinal`)
            .all(conversationId);
        return rows.map(toContextItemRecord);
    }
    async getDistinctDepthsInContext(conversationId, options) {
        const maxOrdinalExclusive = options?.maxOrdinalExclusive;
        const useOrdinalBound = typeof maxOrdinalExclusive === "number" &&
            Number.isFinite(maxOrdinalExclusive) &&
            maxOrdinalExclusive !== Infinity;
        const sql = useOrdinalBound
            ? `SELECT DISTINCT s.depth
         FROM context_items ci
         JOIN summaries s ON s.summary_id = ci.summary_id
         WHERE ci.conversation_id = ?
           AND ci.item_type = 'summary'
           AND ci.ordinal < ?
         ORDER BY s.depth ASC`
            : `SELECT DISTINCT s.depth
         FROM context_items ci
         JOIN summaries s ON s.summary_id = ci.summary_id
         WHERE ci.conversation_id = ?
           AND ci.item_type = 'summary'
         ORDER BY s.depth ASC`;
        const rows = useOrdinalBound
            ? this.db
                .prepare(sql)
                .all(conversationId, Math.floor(maxOrdinalExclusive))
            : this.db.prepare(sql).all(conversationId);
        return rows.map((row) => row.depth);
    }
    /** Serialize a multi-step summary write sequence on the shared database. */
    async withTransaction(operation) {
        return withDatabaseTransaction(this.db, "BEGIN", operation);
    }
    async pruneForNewSession(conversationId, retainDepth) {
        if (Number.isFinite(retainDepth) && retainDepth < 0) {
            return;
        }
        this.db
            .prepare(`DELETE FROM context_items
       WHERE conversation_id = ?
         AND item_type = 'message'`)
            .run(conversationId);
        if (!Number.isFinite(retainDepth)) {
            this.db
                .prepare(`DELETE FROM context_items
         WHERE conversation_id = ?
           AND item_type = 'summary'`)
                .run(conversationId);
            return;
        }
        this.db
            .prepare(`DELETE FROM context_items
       WHERE conversation_id = ?
         AND item_type = 'summary'
         AND summary_id IN (
           SELECT summary_id
           FROM summaries
           WHERE conversation_id = ?
             AND depth < ?
         )`)
            .run(conversationId, conversationId, Math.floor(retainDepth));
    }
    async appendContextMessage(conversationId, messageId) {
        const row = this.db
            .prepare(`SELECT COALESCE(MAX(ordinal), -1) AS max_ordinal
       FROM context_items WHERE conversation_id = ?`)
            .get(conversationId);
        this.db
            .prepare(`INSERT INTO context_items (conversation_id, ordinal, item_type, message_id)
       VALUES (?, ?, 'message', ?)`)
            .run(conversationId, row.max_ordinal + 1, messageId);
    }
    async appendContextMessages(conversationId, messageIds) {
        if (messageIds.length === 0) {
            return;
        }
        const row = this.db
            .prepare(`SELECT COALESCE(MAX(ordinal), -1) AS max_ordinal
       FROM context_items WHERE conversation_id = ?`)
            .get(conversationId);
        const baseOrdinal = row.max_ordinal + 1;
        const stmt = this.db.prepare(`INSERT INTO context_items (conversation_id, ordinal, item_type, message_id)
       VALUES (?, ?, 'message', ?)`);
        for (let idx = 0; idx < messageIds.length; idx++) {
            stmt.run(conversationId, baseOrdinal + idx, messageIds[idx]);
        }
    }
    async appendContextSummary(conversationId, summaryId) {
        const row = this.db
            .prepare(`SELECT COALESCE(MAX(ordinal), -1) AS max_ordinal
       FROM context_items WHERE conversation_id = ?`)
            .get(conversationId);
        this.db
            .prepare(`INSERT INTO context_items (conversation_id, ordinal, item_type, summary_id)
       VALUES (?, ?, 'summary', ?)`)
            .run(conversationId, row.max_ordinal + 1, summaryId);
    }
    async replaceContextRangeWithSummary(input) {
        await this.withTransaction(() => {
            this.replaceContextRangeWithSummaryInTransaction(input);
        });
    }
    async replaceContextRangesWithSummaries(input) {
        await this.withTransaction(() => {
            this.replaceContextRangesWithSummariesInTransaction(input);
        });
    }
    // Update the context slice in-place while the caller already owns the txn.
    replaceContextRangeWithSummaryInTransaction(input) {
        this.replaceContextRangesWithSummariesInTransaction({
            conversationId: input.conversationId,
            replacements: [
                {
                    startOrdinal: input.startOrdinal,
                    endOrdinal: input.endOrdinal,
                    summaryId: input.summaryId,
                },
            ],
        });
    }
    replaceContextRangesWithSummariesInTransaction(input) {
        const { conversationId } = input;
        const replacements = [...input.replacements].sort((a, b) => a.startOrdinal - b.startOrdinal);
        let previousEndOrdinal = -1;
        for (const replacement of replacements) {
            if (replacement.startOrdinal < 0 || replacement.endOrdinal < replacement.startOrdinal) {
                throw new Error(`Invalid context replacement range ${replacement.startOrdinal}-${replacement.endOrdinal}`);
            }
            if (replacement.startOrdinal <= previousEndOrdinal) {
                throw new Error("Context replacement ranges must not overlap");
            }
            previousEndOrdinal = replacement.endOrdinal;
        }
        // 1. Delete all covered context items.
        const deleteStmt = this.db.prepare(`DELETE FROM context_items
       WHERE conversation_id = ?
         AND ordinal >= ?
         AND ordinal <= ?`);
        for (const replacement of replacements) {
            deleteStmt.run(conversationId, replacement.startOrdinal, replacement.endOrdinal);
        }
        // 2. Insert replacement summary items at their original start ordinals.
        const insertStmt = this.db.prepare(`INSERT INTO context_items (conversation_id, ordinal, item_type, summary_id)
       VALUES (?, ?, 'summary', ?)`);
        for (const replacement of replacements) {
            insertStmt.run(conversationId, replacement.startOrdinal, replacement.summaryId);
        }
        // 3. Resequence all ordinals to maintain contiguity (no gaps).
        this.resequenceContextItemsInTransaction(conversationId);
    }
    resequenceContextItemsInTransaction(conversationId) {
        // Pre-compute ranks from a SELECT, then apply a 2-pass UPDATE loop using
        // negative temps to avoid UNIQUE constraint violations.
        const items = this.db
            .prepare(`SELECT ordinal FROM context_items
         WHERE conversation_id = ?
         ORDER BY ordinal`)
            .all(conversationId);
        if (items.length > 0 && items.some((item, i) => item.ordinal !== i)) {
            const updateStmt = this.db.prepare(`UPDATE context_items SET ordinal = ?
         WHERE conversation_id = ? AND ordinal = ?`);
            for (let i = 0; i < items.length; i++) {
                updateStmt.run(-(i + 1), conversationId, items[i].ordinal);
            }
            for (let i = 0; i < items.length; i++) {
                updateStmt.run(i, conversationId, -(i + 1));
            }
        }
    }
    async getContextTokenCount(conversationId) {
        const row = this.db
            .prepare(`SELECT COALESCE(SUM(token_count), 0) AS total
       FROM (
         SELECT m.token_count
         FROM context_items ci
         JOIN messages m ON m.message_id = ci.message_id
         WHERE ci.conversation_id = ?
           AND ci.item_type = 'message'

         UNION ALL

         SELECT s.token_count
         FROM context_items ci
         JOIN summaries s ON s.summary_id = ci.summary_id
         WHERE ci.conversation_id = ?
           AND ci.item_type = 'summary'
       ) sub`)
            .get(conversationId, conversationId);
        return row?.total ?? 0;
    }
    // ── Search ────────────────────────────────────────────────────────────────
    async searchSummaries(input) {
        const limit = input.limit ?? 50;
        if (input.mode === "full_text") {
            // FTS5 unicode61 cannot segment CJK ideographs, so CJK queries route
            // through the trigram FTS table first, then fall back to LIKE with OR
            // semantics (instead of the original AND logic which fails when the
            // user's phrasing doesn't exactly match the summary text).
            if (containsCjk(input.query)) {
                const cjkSegments = this.extractCjkSegments(input.query);
                const hasShortCjkSegment = cjkSegments.some((segment) => segment.length < 3);
                if (!hasShortCjkSegment) {
                    try {
                        const trigramResults = this.searchCjkTrigram(input.query, limit, input.conversationId, input.conversationIds, input.since, input.before, input.sort);
                        if (trigramResults.length > 0) {
                            return trigramResults;
                        }
                    }
                    catch {
                        // trigram table may not exist; fall through to LIKE OR
                    }
                }
                return this.searchLikeCjk(input.query, limit, input.conversationId, input.conversationIds, input.since, input.before);
            }
            if (this.fts5Available) {
                try {
                    return this.searchFullText(input.query, limit, input.conversationId, input.conversationIds, input.since, input.before, input.sort);
                }
                catch {
                    return this.searchLike(input.query, limit, input.conversationId, input.conversationIds, input.since, input.before);
                }
            }
            return this.searchLike(input.query, limit, input.conversationId, input.conversationIds, input.since, input.before);
        }
        return this.searchRegex(input.query, limit, input.conversationId, input.conversationIds, input.since, input.before);
    }
    searchFullText(query, limit, conversationId, conversationIds, since, before, sort) {
        const where = ["summaries_fts MATCH ?"];
        const args = [sanitizeFts5Query(query)];
        appendConversationScopeConstraint({
            where,
            args,
            columnExpr: "s.conversation_id",
            conversationId,
            conversationIds,
        });
        if (since) {
            where.push(`julianday(${SUMMARY_SEARCH_TIME_EXPR}) >= julianday(?)`);
            args.push(since.toISOString());
        }
        if (before) {
            where.push(`julianday(${SUMMARY_SEARCH_TIME_EXPR}) < julianday(?)`);
            args.push(before.toISOString());
        }
        args.push(limit);
        const orderBy = buildFtsOrderBy(sort, SUMMARY_SEARCH_TIME_EXPR);
        const sql = `SELECT
         summaries_fts.summary_id,
         s.conversation_id,
         s.kind,
         snippet(summaries_fts, 1, '', '', '...', 32) AS snippet,
         rank,
         ${SUMMARY_SEARCH_TIME_EXPR} AS created_at
       FROM summaries_fts
       JOIN summaries s ON s.summary_id = summaries_fts.summary_id
       WHERE ${where.join(" AND ")}
       ORDER BY ${orderBy}
       LIMIT ?`;
        const rows = this.db.prepare(sql).all(...args);
        return rows.map(toSearchResult);
    }
    searchLike(query, limit, conversationId, conversationIds, since, before) {
        const plan = buildLikeSearchPlan("content", query);
        if (plan.terms.length === 0) {
            return [];
        }
        const where = [...plan.where];
        const args = [...plan.args];
        appendConversationScopeConstraint({
            where,
            args,
            columnExpr: "conversation_id",
            conversationId,
            conversationIds,
        });
        if (since) {
            where.push(`julianday(${SUMMARY_SEARCH_TIME_EXPR_UNQUALIFIED}) >= julianday(?)`);
            args.push(since.toISOString());
        }
        if (before) {
            where.push(`julianday(${SUMMARY_SEARCH_TIME_EXPR_UNQUALIFIED}) < julianday(?)`);
            args.push(before.toISOString());
        }
        args.push(limit);
        const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
        const rows = this.db
            .prepare(`SELECT summary_id, conversation_id, kind, depth, content, token_count, file_ids,
                earliest_at, latest_at, descendant_count, descendant_token_count,
                source_message_token_count, model,
                ${SUMMARY_SEARCH_TIME_EXPR_UNQUALIFIED} AS created_at
         FROM summaries
         ${whereClause}
         ORDER BY ${SUMMARY_SEARCH_TIME_EXPR_UNQUALIFIED} DESC
         LIMIT ?`)
            .all(...args);
        return rows.map((row) => ({
            summaryId: row.summary_id,
            conversationId: row.conversation_id,
            kind: row.kind,
            snippet: createFallbackSnippet(row.content, plan.terms),
            createdAt: parseUtcTimestamp(row.created_at),
            rank: 0,
        }));
    }
    extractCjkSegments(query) {
        return query.match(CJK_QUERY_SEGMENT_RE) ?? [];
    }
    extractLatinTokens(query) {
        const tokens = query.match(LATIN_QUERY_TOKEN_RE) ?? [];
        return [...new Set(tokens.map((token) => token.toLowerCase()))];
    }
    escapeLikeTerm(term) {
        return term.replace(/([\\%_])/g, "\\$1");
    }
    // ── CJK trigram FTS search ──────────────────────────────────────────────
    // Each CJK segment of 3+ chars is split into overlapping 4-char chunks for
    // trigram MATCH with OR semantics within the segment. Segment groups are
    // combined with AND, and Latin tokens are applied as LIKE filters so mixed
    // queries still require every part of the user's intent.
    /**
     * Split a CJK string into overlapping chunks of `size` characters.
     * E.g. "端到端测试结果" with size=4 →
     *   ["端到端测", "到端测试", "端测试结", "测试结果"]
     */
    splitCjkChunks(text, size) {
        const chunks = [];
        for (let i = 0; i <= text.length - size; i++) {
            const chunk = text.slice(i, i + size);
            if (!chunks.includes(chunk)) {
                chunks.push(chunk);
            }
        }
        return chunks;
    }
    searchCjkTrigram(query, limit, conversationId, conversationIds, since, before, sort) {
        const cjkSegments = this.extractCjkSegments(query).filter((segment) => segment.length >= 3);
        if (cjkSegments.length === 0) {
            return [];
        }
        const latinTokens = this.extractLatinTokens(query);
        // Build one OR group per CJK segment, then require every segment group and
        // every Latin token to match so mixed queries preserve full-intent search.
        const cjkGroups = [];
        for (const segment of cjkSegments) {
            const segmentTerms = segment.length <= 4 ? [segment] : this.splitCjkChunks(segment, 4);
            const groupExpr = [...new Set(segmentTerms)]
                .map((term) => `"${term.replace(/"/g, '""')}"`)
                .join(" OR ");
            cjkGroups.push(`(${groupExpr})`);
        }
        const where = ["summaries_fts_cjk MATCH ?"];
        const args = [cjkGroups.join(" AND ")];
        for (const token of latinTokens) {
            where.push("LOWER(s.content) LIKE ? ESCAPE '\\'");
            args.push(`%${this.escapeLikeTerm(token)}%`);
        }
        appendConversationScopeConstraint({
            where,
            args,
            columnExpr: "s.conversation_id",
            conversationId,
            conversationIds,
        });
        if (since) {
            where.push(`julianday(${SUMMARY_SEARCH_TIME_EXPR}) >= julianday(?)`);
            args.push(since.toISOString());
        }
        if (before) {
            where.push(`julianday(${SUMMARY_SEARCH_TIME_EXPR}) < julianday(?)`);
            args.push(before.toISOString());
        }
        args.push(limit);
        const orderBy = buildFtsOrderBy(sort, SUMMARY_SEARCH_TIME_EXPR);
        const sql = `SELECT
         f.summary_id,
         s.conversation_id,
         s.kind,
         snippet(summaries_fts_cjk, 1, '', '', '...', 32) AS snippet,
         rank,
         ${SUMMARY_SEARCH_TIME_EXPR} AS created_at
       FROM summaries_fts_cjk f
       JOIN summaries s ON s.summary_id = f.summary_id
       WHERE ${where.join(" AND ")}
       ORDER BY ${orderBy}
       LIMIT ?`;
        const rows = this.db.prepare(sql).all(...args);
        return rows.map(toSearchResult);
    }
    // ── CJK LIKE fallback ────────────────────────────────────────────────────
    // When the trigram table is unavailable, split each CJK segment into
    // sliding-window terms so partial matches still work. Terms within a single
    // segment are ORed together, but each segment and Latin token still has to
    // match so mixed queries keep full-intent semantics.
    searchLikeCjk(query, limit, conversationId, conversationIds, since, before) {
        const cjkSegments = this.extractCjkSegments(query);
        const latinTokens = this.extractLatinTokens(query);
        if (cjkSegments.length === 0 && latinTokens.length === 0) {
            return [];
        }
        const cjkTerms = [];
        const cjkClauses = [];
        const cjkArgs = [];
        for (const segment of cjkSegments) {
            const segmentTerms = segment.length === 1
                ? [segment]
                : segment.length === 2
                    ? [segment]
                    : this.splitCjkChunks(segment, 2);
            const uniqueTerms = [...new Set(segmentTerms)];
            cjkTerms.push(...uniqueTerms);
            cjkClauses.push(`(${uniqueTerms.map(() => `LOWER(content) LIKE ? ESCAPE '\\'`).join(" OR ")})`);
            cjkArgs.push(...uniqueTerms.map((term) => `%${this.escapeLikeTerm(term.toLowerCase())}%`));
        }
        const latinClauses = latinTokens.map(() => `LOWER(content) LIKE ? ESCAPE '\\'`);
        const latinArgs = latinTokens.map((token) => `%${this.escapeLikeTerm(token)}%`);
        const where = [...cjkClauses, ...latinClauses];
        const args = [...cjkArgs, ...latinArgs];
        appendConversationScopeConstraint({
            where,
            args,
            columnExpr: "conversation_id",
            conversationId,
            conversationIds,
        });
        if (since) {
            where.push(`julianday(${SUMMARY_SEARCH_TIME_EXPR_UNQUALIFIED}) >= julianday(?)`);
            args.push(since.toISOString());
        }
        if (before) {
            where.push(`julianday(${SUMMARY_SEARCH_TIME_EXPR_UNQUALIFIED}) < julianday(?)`);
            args.push(before.toISOString());
        }
        args.push(limit);
        const rows = this.db
            .prepare(`SELECT summary_id, conversation_id, kind, depth, content, token_count, file_ids,
                earliest_at, latest_at, descendant_count, descendant_token_count,
                source_message_token_count, model,
                ${SUMMARY_SEARCH_TIME_EXPR_UNQUALIFIED} AS created_at
         FROM summaries
         WHERE ${where.join(" AND ")}
         ORDER BY ${SUMMARY_SEARCH_TIME_EXPR_UNQUALIFIED} DESC
         LIMIT ?`)
            .all(...args);
        const snippetTerms = cjkTerms.length > 0 ? [...new Set([...cjkTerms, ...latinTokens])] : latinTokens;
        return rows.map((row) => ({
            summaryId: row.summary_id,
            conversationId: row.conversation_id,
            kind: row.kind,
            snippet: createFallbackSnippet(row.content, snippetTerms),
            createdAt: new Date(row.created_at),
            rank: 0,
        }));
    }
    searchRegex(pattern, limit, conversationId, conversationIds, since, before) {
        const re = compileSafeSearchRegex(pattern);
        if (!re) {
            return [];
        }
        const where = [];
        const args = [];
        appendConversationScopeConstraint({
            where,
            args,
            columnExpr: "conversation_id",
            conversationId,
            conversationIds,
        });
        if (since) {
            where.push(`julianday(${SUMMARY_SEARCH_TIME_EXPR_UNQUALIFIED}) >= julianday(?)`);
            args.push(since.toISOString());
        }
        if (before) {
            where.push(`julianday(${SUMMARY_SEARCH_TIME_EXPR_UNQUALIFIED}) < julianday(?)`);
            args.push(before.toISOString());
        }
        const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
        const rows = this.db
            .prepare(`SELECT summary_id, conversation_id, kind, depth, content, token_count, file_ids,
                earliest_at, latest_at, descendant_count, descendant_token_count,
                source_message_token_count, model,
                ${SUMMARY_SEARCH_TIME_EXPR_UNQUALIFIED} AS created_at
         FROM summaries
         ${whereClause}
         ORDER BY ${SUMMARY_SEARCH_TIME_EXPR_UNQUALIFIED} DESC`)
            .all(...args);
        const MAX_ROW_SCAN = 10_000;
        const results = [];
        let scanned = 0;
        for (const row of rows) {
            if (results.length >= limit || scanned >= MAX_ROW_SCAN) {
                break;
            }
            scanned++;
            const match = re.exec(row.content);
            if (match) {
                results.push({
                    summaryId: row.summary_id,
                    conversationId: row.conversation_id,
                    kind: row.kind,
                    snippet: match[0],
                    createdAt: parseUtcTimestamp(row.created_at),
                    rank: 0,
                });
            }
        }
        return results;
    }
    // ── Large files ───────────────────────────────────────────────────────────
    async insertLargeFile(input) {
        this.db
            .prepare(`INSERT INTO large_files (file_id, conversation_id, file_name, mime_type, byte_size, line_count, storage_uri, exploration_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(input.fileId, input.conversationId, input.fileName ?? null, input.mimeType ?? null, input.byteSize ?? null, input.lineCount ?? null, input.storageUri, input.explorationSummary ?? null);
        const row = this.db
            .prepare(`SELECT file_id, conversation_id, file_name, mime_type, byte_size, line_count, storage_uri, exploration_summary, created_at
       FROM large_files WHERE file_id = ?`)
            .get(input.fileId);
        return toLargeFileRecord(row);
    }
    async getLargeFile(fileId) {
        const row = this.db
            .prepare(`SELECT file_id, conversation_id, file_name, mime_type, byte_size, line_count, storage_uri, exploration_summary, created_at
       FROM large_files WHERE file_id = ?`)
            .get(fileId);
        return row ? toLargeFileRecord(row) : null;
    }
    async getLargeFilesByConversation(conversationId) {
        const rows = this.db
            .prepare(`SELECT file_id, conversation_id, file_name, mime_type, byte_size, line_count, storage_uri, exploration_summary, created_at
       FROM large_files
       WHERE conversation_id = ?
       ORDER BY created_at DESC`)
            .all(conversationId);
        return rows.map(toLargeFileRecord);
    }
    async getAllLargeFiles() {
        const rows = this.db
            .prepare(`SELECT file_id, conversation_id, file_name, mime_type, byte_size, line_count, storage_uri, exploration_summary, created_at
       FROM large_files
       ORDER BY created_at DESC`)
            .all();
        return rows.map(toLargeFileRecord);
    }
    /**
     * Search the contents of persisted large files using regex or simple full-text
     * matching. Each file is read up to `maxBytesPerFile` (default 512KB) and only
     * text-like MIME types are scanned.
     */
    async searchLargeFiles(input) {
        const limit = input.limit ?? 50;
        const requestedMaxBytes = input.maxBytesPerFile ?? DEFAULT_LARGE_FILE_SEARCH_MAX_BYTES;
        const maxBytesPerFile = Number.isFinite(requestedMaxBytes)
            ? Math.max(0, Math.trunc(requestedMaxBytes))
            : DEFAULT_LARGE_FILE_SEARCH_MAX_BYTES;
        const maxMatchesPerFile = 10;
        let files = [];
        if (input.fileIds && input.fileIds.length > 0) {
            for (const fileId of input.fileIds) {
                const file = await this.getLargeFile(fileId);
                if (file) {
                    files.push(file);
                }
            }
        }
        else if (input.conversationIds && input.conversationIds.length > 0) {
            for (const conversationId of input.conversationIds) {
                const convFiles = await this.getLargeFilesByConversation(conversationId);
                files.push(...convFiles);
            }
        }
        else if (input.conversationId != null) {
            files = await this.getLargeFilesByConversation(input.conversationId);
        }
        else if (input.allConversations) {
            files = await this.getAllLargeFiles();
        }
        if (input.since) {
            files = files.filter((f) => f.createdAt.getTime() >= input.since.getTime());
        }
        if (input.before) {
            files = files.filter((f) => f.createdAt.getTime() < input.before.getTime());
        }
        if (input.conversationIds && input.conversationIds.length > 0) {
            const conversationIds = new Set(input.conversationIds);
            files = files.filter((f) => conversationIds.has(f.conversationId));
        }
        else if (input.conversationId != null) {
            files = files.filter((f) => f.conversationId === input.conversationId);
        }
        const results = [];
        for (const file of files) {
            if (results.length >= limit) {
                break;
            }
            if (!isTextLikeMimeType(file.mimeType)) {
                continue;
            }
            const readResult = await this.readValidatedLargeFileContentUpTo(file.storageUri, {
                largeFilesDir: input.largeFilesDir,
                maxBytes: maxBytesPerFile,
            });
            if (readResult == null) {
                continue;
            }
            const { content, scannedBytes, scanTruncated } = readResult;
            const matches = input.mode === "regex"
                ? findRegexMatches(content, input.query, maxMatchesPerFile)
                : findFullTextMatches(content, input.query, maxMatchesPerFile);
            for (const match of matches) {
                if (results.length >= limit) {
                    break;
                }
                results.push({
                    fileId: file.fileId,
                    conversationId: file.conversationId,
                    fileName: file.fileName,
                    matchedText: match.text,
                    lineNumber: lineNumberAt(content, match.index),
                    byteOffset: byteOffsetAt(content, match.index),
                    snippet: createSearchSnippet(content, match.index, match.length),
                    scannedBytes,
                    scanByteLimit: maxBytesPerFile,
                    scanTruncated,
                    createdAt: file.createdAt,
                });
            }
        }
        return results;
    }
    /**
     * Return true when one externalized text payload exactly matches content.
     */
    async largeFileContentEquals(fileId, content, options) {
        return this.largeFileBufferEquals(fileId, Buffer.from(content, "utf8"), options);
    }
    /**
     * Return true when one externalized binary/text payload exactly matches bytes.
     */
    async largeFileBufferEquals(fileId, content, options) {
        const byteSize = content.byteLength;
        const row = this.db
            .prepare(`SELECT storage_uri
       FROM large_files
       WHERE file_id = ?
         AND byte_size = ?
       LIMIT 1`)
            .get(fileId, byteSize);
        if (!row) {
            return false;
        }
        return this.validatedLargeFileBufferEquals(row.storage_uri, content, options);
    }
    /** Read a persisted large-file payload from disk, returning null when unavailable. */
    async getLargeFileContent(fileId, options) {
        const row = this.db
            .prepare(`SELECT storage_uri
       FROM large_files
       WHERE file_id = ?
       LIMIT 1`)
            .get(fileId);
        if (!row) {
            return null;
        }
        return this.readValidatedLargeFileContent(row.storage_uri, options);
    }
    async validatedLargeFileContentEquals(storageUri, expectedContent, options) {
        return this.validatedLargeFileBufferEquals(storageUri, Buffer.from(expectedContent, "utf8"), options);
    }
    async validatedLargeFileBufferEquals(storageUri, expected, options) {
        try {
            const file = await this.openValidatedLargeFile(storageUri, options);
            if (!file) {
                return false;
            }
            try {
                const stats = await file.stat();
                if (!stats.isFile() || stats.size !== expected.length) {
                    return false;
                }
                const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, Math.max(1, expected.length)));
                let offset = 0;
                while (offset < expected.length) {
                    const length = Math.min(buffer.length, expected.length - offset);
                    const { bytesRead } = await file.read(buffer, 0, length, offset);
                    if (bytesRead !== length) {
                        return false;
                    }
                    if (!buffer.subarray(0, length).equals(expected.subarray(offset, offset + length))) {
                        return false;
                    }
                    offset += length;
                }
                return true;
            }
            finally {
                await file.close().catch(() => undefined);
            }
        }
        catch {
            return false;
        }
    }
    async readValidatedLargeFileContent(storageUri, options) {
        try {
            const file = await this.openValidatedLargeFile(storageUri, options);
            if (!file) {
                return null;
            }
            try {
                const stats = await file.stat();
                if (!stats.isFile() || (options.maxBytes != null && stats.size > options.maxBytes)) {
                    return null;
                }
                return await file.readFile({ encoding: "utf8" });
            }
            finally {
                await file.close().catch(() => undefined);
            }
        }
        catch {
            return null;
        }
    }
    async readValidatedLargeFileContentUpTo(storageUri, options) {
        try {
            const file = await this.openValidatedLargeFile(storageUri, options);
            if (!file) {
                return null;
            }
            try {
                const stats = await file.stat();
                if (!stats.isFile()) {
                    return null;
                }
                const maxBytes = options.maxBytes ?? stats.size;
                const readLimit = Math.min(maxBytes, stats.size);
                const buffer = Buffer.alloc(readLimit);
                let bytesRead = 0;
                while (bytesRead < buffer.length) {
                    const result = await file.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
                    if (result.bytesRead === 0) {
                        break;
                    }
                    bytesRead += result.bytesRead;
                }
                return {
                    content: buffer.subarray(0, bytesRead).toString("utf8"),
                    scannedBytes: bytesRead,
                    scanTruncated: bytesRead < stats.size,
                };
            }
            finally {
                await file.close().catch(() => undefined);
            }
        }
        catch {
            return null;
        }
    }
    async openValidatedLargeFile(storageUri, options) {
        const safeRoot = await realpath(resolvePath(options.largeFilesDir));
        const realTarget = await realpath(resolvePath(storageUri));
        if (realTarget !== safeRoot && !realTarget.startsWith(safeRoot + pathSep)) {
            return null;
        }
        return open(realTarget, "r");
    }
}
