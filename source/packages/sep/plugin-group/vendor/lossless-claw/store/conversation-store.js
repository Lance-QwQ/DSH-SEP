import { randomUUID } from "node:crypto";
import { withDatabaseTransaction } from "../transaction-mutex.js";
import { appendConversationScopeConstraint } from "./conversation-scope.js";
import { sanitizeFts5Query } from "./fts5-sanitize.js";
import { buildLikeSearchPlan, containsCjk, createFallbackSnippet } from "./full-text-fallback.js";
import { buildMessageIdentityHash } from "./message-identity.js";
import { parseUtcTimestamp, parseUtcTimestampOrNull } from "./parse-utc-timestamp.js";
import { buildFtsOrderBy } from "./full-text-sort.js";
import { compileSafeSearchRegex } from "./search-regex.js";
import { parseOpenClawSenderMetadata, serializeOpenClawSenderMetadata, } from "../openclaw-sender-metadata.js";
// Causes the rollover-split doctor must never auto-restore. Ships with
// `manual-reset` only: a deliberate operator wipe is rock-solid intent. The other
// causes are recorded but stay merge-eligible because the safe direction is
// over-restore (today's behavior); promoting `session-deleted` once the host
// deletion contract is confirmed is a one-line follow-up.
export const DELIBERATE_ARCHIVE_CAUSES = new Set(["manual-reset"]);
// ── Row mappers ───────────────────────────────────────────────────────────────
function toConversationRecord(row) {
    return {
        conversationId: row.conversation_id,
        sessionId: row.session_id,
        sessionKey: row.session_key ?? null,
        active: row.active === 1,
        archivedAt: parseUtcTimestampOrNull(row.archived_at),
        title: row.title,
        bootstrappedAt: parseUtcTimestampOrNull(row.bootstrapped_at),
        createdAt: parseUtcTimestamp(row.created_at),
        updatedAt: parseUtcTimestamp(row.updated_at),
    };
}
function formatMessageCreatedAt(value) {
    if (value === undefined) {
        return undefined;
    }
    if (value instanceof Date) {
        return Number.isFinite(value.getTime())
            ? value.toISOString().slice(0, 19).replace("T", " ")
            : undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    const parsed = parseUtcTimestampOrNull(trimmed);
    if (parsed && Number.isFinite(parsed.getTime())) {
        return parsed.toISOString().slice(0, 19).replace("T", " ");
    }
    return undefined;
}
function toMessageRecord(row) {
    return {
        largeContent: row.large_content ?? null,
        transcriptEntryId: row.transcript_entry_id ?? null,
        openClawSenderMetadata: parseOpenClawSenderMetadata(row.openclaw_sender_metadata),
        messageId: row.message_id,
        conversationId: row.conversation_id,
        seq: row.seq,
        role: row.role,
        content: row.content,
        tokenCount: row.token_count,
        createdAt: parseUtcTimestamp(row.created_at),
    };
}
function formatNullableTimestamp(value) {
    if (value == null) {
        return null;
    }
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value.toISOString() : null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function parseMetadataJson(value) {
    if (value == null || value.trim() === "") {
        return null;
    }
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}
function toMessageTranscriptAnchorTrustRecord(row) {
    return {
        messageId: row.message_id,
        conversationId: row.conversation_id,
        transcriptEntryId: row.transcript_entry_id,
        trustState: row.trust_state,
        source: row.source,
        reason: row.reason,
        verifiedAt: parseUtcTimestampOrNull(row.verified_at),
        createdAt: parseUtcTimestamp(row.created_at),
        updatedAt: parseUtcTimestamp(row.updated_at),
    };
}
function toConversationTranscriptEpochRecord(row) {
    return {
        conversationId: row.conversation_id,
        sessionId: row.session_id,
        sessionKey: row.session_key,
        frontierEntryId: row.frontier_entry_id,
        frontierSeq: row.frontier_seq,
        frontierCreatedAt: parseUtcTimestampOrNull(row.frontier_created_at),
        migrationMode: row.migration_mode,
        metadata: parseMetadataJson(row.metadata_json),
        createdAt: parseUtcTimestamp(row.created_at),
        updatedAt: parseUtcTimestamp(row.updated_at),
    };
}
function toTranscriptEntryAnchorCandidate(row) {
    return {
        messageId: row.message_id,
        conversationId: row.conversation_id,
        transcriptEntryId: row.transcript_entry_id,
        role: row.role,
        content: row.content,
    };
}
function toSearchResult(row) {
    return {
        messageId: row.message_id,
        conversationId: row.conversation_id,
        role: row.role,
        snippet: row.snippet,
        createdAt: parseUtcTimestamp(row.created_at),
        rank: row.rank,
    };
}
function toMessagePartRecord(row) {
    return {
        partId: row.part_id,
        messageId: row.message_id,
        sessionId: row.session_id,
        partType: row.part_type,
        ordinal: row.ordinal,
        textContent: row.text_content,
        toolCallId: row.tool_call_id,
        toolName: row.tool_name,
        toolInput: row.tool_input,
        toolOutput: row.tool_output,
        metadata: row.metadata,
    };
}
/** Normalize persisted message text before indexing it in the message FTS table. */
export function normalizeMessageContentForFullTextIndex(content) {
    if (typeof content !== "string")
        return null;
    const trimmed = content.trim();
    if (!trimmed) {
        return null;
    }
    const isExternalizedReference = trimmed.startsWith("[LCM File:") || trimmed.startsWith("[LCM Tool Output:");
    if (!isExternalizedReference) {
        return content;
    }
    const lines = trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    if (lines.length === 0) {
        return null;
    }
    const header = lines[0] ?? "";
    const summaryLines = [];
    let inSummary = false;
    for (let index = 1; index < lines.length; index += 1) {
        const line = lines[index];
        if (line === "Exploration Summary:") {
            inSummary = true;
            continue;
        }
        // Filter both legacy "Use lcm_describe …" and v4.2 "Call lcm_describe(…)"
        // hint lines so they don't pollute the FTS index for unrelated queries.
        if (line.startsWith("Use lcm_describe") || line.startsWith("Call lcm_describe")) {
            continue;
        }
        if (inSummary) {
            summaryLines.push(line);
        }
    }
    const normalized = [header, ...summaryLines].filter((line) => line.length > 0).join("\n");
    return normalized || null;
}
// ── ConversationStore ─────────────────────────────────────────────────────────
export class ConversationStore {
    db;
    fts5Available;
    replayFloodThresholdExternal;
    replayFloodThresholdInternal;
    onStableEventKeyConflict;
    constructor(db, options) {
        this.db = db;
        this.fts5Available = options?.fts5Available ?? true;
        this.replayFloodThresholdExternal = options?.replayFloodThresholdExternal ?? 3;
        this.replayFloodThresholdInternal = options?.replayFloodThresholdInternal ?? 32;
        this.onStableEventKeyConflict = options?.onStableEventKeyConflict;
    }
    // ── Transaction helpers ──────────────────────────────────────────────────
    async withTransaction(operation) {
        return withDatabaseTransaction(this.db, "BEGIN IMMEDIATE", operation);
    }
    // ── Conversation operations ───────────────────────────────────────────────
    async createConversation(input) {
        try {
            const result = this.db
                .prepare(`INSERT INTO conversations (session_id, session_key, active, archived_at, title)
           VALUES (?, ?, ?, ?, ?)`)
                .run(input.sessionId, input.sessionKey ?? null, input.active === false ? 0 : 1, input.archivedAt?.toISOString() ?? null, input.title ?? null);
            const row = this.db
                .prepare(`SELECT conversation_id, session_id, session_key, active, archived_at, title, bootstrapped_at, created_at, updated_at
         FROM conversations WHERE conversation_id = ?`)
                .get(Number(result.lastInsertRowid));
            return toConversationRecord(row);
        }
        catch (err) {
            // Handle UNIQUE constraint race: another writer created the conversation first
            if (err instanceof Error &&
                /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(err.message)) {
                if (input.sessionKey) {
                    const existing = await this.getConversationBySessionKey(input.sessionKey);
                    if (existing)
                        return existing;
                }
                const existing = await this.getActiveConversationBySessionId(input.sessionId);
                if (existing)
                    return existing;
            }
            throw err;
        }
    }
    async getConversation(conversationId) {
        const row = this.db
            .prepare(`SELECT conversation_id, session_id, session_key, active, archived_at, title, bootstrapped_at, created_at, updated_at
       FROM conversations WHERE conversation_id = ?`)
            .get(conversationId);
        return row ? toConversationRecord(row) : null;
    }
    async getConversationBySessionId(sessionId) {
        const row = this.db
            .prepare(`SELECT conversation_id, session_id, session_key, active, archived_at, title, bootstrapped_at, created_at, updated_at
       FROM conversations
       WHERE session_id = ?
       ORDER BY active DESC, created_at DESC
       LIMIT 1`)
            .get(sessionId);
        return row ? toConversationRecord(row) : null;
    }
    async getActiveConversationBySessionId(sessionId) {
        const row = this.db
            .prepare(`SELECT conversation_id, session_id, session_key, active, archived_at, title, bootstrapped_at, created_at, updated_at
       FROM conversations
       WHERE session_id = ?
         AND active = 1
       ORDER BY created_at DESC
       LIMIT 1`)
            .get(sessionId);
        return row ? toConversationRecord(row) : null;
    }
    async getConversationBySessionKey(sessionKey) {
        const row = this.db
            .prepare(`SELECT conversation_id, session_id, session_key, active, archived_at, title, bootstrapped_at, created_at, updated_at
       FROM conversations
       WHERE session_key = ?
         AND active = 1
       ORDER BY created_at DESC
       LIMIT 1`)
            .get(sessionKey);
        return row ? toConversationRecord(row) : null;
    }
    async getConversationFamilyIds(input) {
        const baseConversation = input.conversationId != null
            ? await this.getConversation(input.conversationId)
            : await this.getConversationForSession({
                sessionId: input.sessionId,
                sessionKey: input.sessionKey,
            });
        if (!baseConversation) {
            return [];
        }
        const normalizedSessionKey = baseConversation.sessionKey?.trim();
        if (normalizedSessionKey) {
            const rows = this.db
                .prepare(`SELECT conversation_id
           FROM conversations
           WHERE session_key = ?
           ORDER BY active DESC, created_at DESC, conversation_id DESC`)
                .all(normalizedSessionKey);
            return rows.map((row) => row.conversation_id);
        }
        const rows = this.db
            .prepare(`SELECT conversation_id
         FROM conversations
         WHERE session_id = ?
         ORDER BY active DESC, created_at DESC, conversation_id DESC`)
            .all(baseConversation.sessionId);
        return rows.map((row) => row.conversation_id);
    }
    /** Resolve a conversation by stable session identity. */
    async getConversationForSession(input) {
        const normalizedSessionKey = input.sessionKey?.trim();
        if (normalizedSessionKey) {
            const byKey = await this.getConversationBySessionKey(normalizedSessionKey);
            if (byKey) {
                return byKey;
            }
        }
        const normalizedSessionId = input.sessionId?.trim();
        if (!normalizedSessionId) {
            return null;
        }
        return this.getActiveConversationBySessionId(normalizedSessionId);
    }
    /** List active conversations that may own live session storage. */
    async listActiveConversations(limit) {
        const normalizedLimit = typeof limit === "number" && Number.isFinite(limit) && limit > 0
            ? Math.floor(limit)
            : 1000;
        const rows = this.db
            .prepare(`SELECT conversation_id, session_id, session_key, active, archived_at, title, bootstrapped_at, created_at, updated_at
         FROM conversations
         WHERE active = 1
         ORDER BY updated_at DESC, conversation_id DESC
         LIMIT ?`)
            .all(normalizedLimit);
        return rows.map(toConversationRecord);
    }
    async getOrCreateConversation(sessionId, titleOrOpts) {
        const opts = typeof titleOrOpts === "string" ? { title: titleOrOpts } : titleOrOpts ?? {};
        const normalizedSessionKey = opts.sessionKey?.trim();
        if (normalizedSessionKey) {
            const byKey = await this.getConversationBySessionKey(normalizedSessionKey);
            if (byKey) {
                if (byKey.sessionId !== sessionId) {
                    this.db
                        .prepare(`UPDATE conversations SET session_id = ?, updated_at = datetime('now') WHERE conversation_id = ?`)
                        .run(sessionId, byKey.conversationId);
                    byKey.sessionId = sessionId;
                }
                return byKey;
            }
        }
        const existing = await this.getActiveConversationBySessionId(sessionId);
        if (existing) {
            if (!normalizedSessionKey) {
                return existing;
            }
            if (existing.active && !existing.sessionKey) {
                this.db
                    .prepare(`UPDATE conversations SET session_key = ?, updated_at = datetime('now') WHERE conversation_id = ?`)
                    .run(normalizedSessionKey, existing.conversationId);
                existing.sessionKey = normalizedSessionKey;
                return existing;
            }
            if (existing.active && existing.sessionKey === normalizedSessionKey) {
                return existing;
            }
        }
        return this.createConversation({ sessionId, title: opts.title, sessionKey: normalizedSessionKey });
    }
    async markConversationBootstrapped(conversationId) {
        this.db
            .prepare(`UPDATE conversations
       SET bootstrapped_at = COALESCE(bootstrapped_at, datetime('now')),
           updated_at = datetime('now')
       WHERE conversation_id = ?`)
            .run(conversationId);
    }
    // Single archive funnel: deliberate archives must flow through here with their
    // cause. The direct-insert archived-row path (createConversation active:false)
    // leaves archive_cause NULL = merge-eligible by design.
    async archiveConversation(conversationId, cause) {
        this.db
            .prepare(`UPDATE conversations
       SET active = 0,
           archived_at = COALESCE(archived_at, datetime('now')),
           archive_cause = COALESCE(archive_cause, ?),
           updated_at = datetime('now')
       WHERE conversation_id = ?`)
            .run(cause, conversationId);
    }
    async rebindConversationSession(conversationId, sessionId, sessionKey) {
        const normalizedSessionId = sessionId.trim();
        const normalizedSessionKey = sessionKey?.trim() || null;
        if (!normalizedSessionId) {
            return this.getConversation(conversationId);
        }
        this.db
            .prepare(`UPDATE conversations
         SET session_id = ?,
             session_key = COALESCE(?, session_key),
             active = 1,
             archived_at = NULL,
             updated_at = datetime('now')
         WHERE conversation_id = ?`)
            .run(normalizedSessionId, normalizedSessionKey, conversationId);
        return this.getConversation(conversationId);
    }
    // ── Message operations ────────────────────────────────────────────────────
    /**
     * Insert one prepared row, retrying without its stable key when the unique
     * identity assumption is violated. The row remains durable while later
     * dedup becomes conservative, which is the lossless failure direction.
     */
    runMessageInsert(prepared) {
        const insert = (stableEventKey) => {
            const result = this.db
                .prepare(`INSERT INTO messages (conversation_id, seq, role, content, token_count, identity_hash, openclaw_sender_metadata, transcript_entry_id, stable_event_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(prepared.conversationId, prepared.seq, prepared.role, prepared.content, prepared.tokenCount, prepared.identityHash, serializeOpenClawSenderMetadata(prepared.openClawSenderMetadata), prepared.transcriptEntryId ?? null, stableEventKey, prepared.createdAt);
            return Number(result.lastInsertRowid);
        };
        if (prepared.stableEventKey == null) {
            return insert(null);
        }
        try {
            return insert(prepared.stableEventKey);
        }
        catch (error) {
            const isStableKeyConflict = error instanceof Error &&
                /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(error.message) &&
                error.message.includes("stable_event_key");
            if (!isStableKeyConflict) {
                throw error;
            }
            const messageId = insert(null);
            this.onStableEventKeyConflict?.({
                conversationId: prepared.conversationId,
                stableEventKey: prepared.stableEventKey,
            });
            return messageId;
        }
    }
    async createMessage(input) {
        const prepared = this.prepareMessageInsert(input);
        if (!prepared.skipReplayTimestampFloodGuard) {
            this.assertNoReplayTimestampFlood([prepared]);
        }
        const messageId = this.runMessageInsert(prepared);
        this.indexMessageForFullText(messageId, input.content);
        const row = this.db
            .prepare(`SELECT message_id, conversation_id, seq, role, content, token_count, created_at, large_content, transcript_entry_id, openclaw_sender_metadata
       FROM messages WHERE message_id = ?`)
            .get(messageId);
        return toMessageRecord(row);
    }
    async createMessagesBulk(inputs) {
        if (inputs.length === 0) {
            return [];
        }
        const createdAt = this.currentSqliteTimestamp();
        const preparedInputs = inputs.map((input) => this.prepareMessageInsert(input, createdAt));
        this.assertNoReplayTimestampFlood(preparedInputs.filter((input) => !input.skipReplayTimestampFloodGuard));
        const selectStmt = this.db.prepare(`SELECT message_id, conversation_id, seq, role, content, token_count, created_at, large_content, transcript_entry_id, openclaw_sender_metadata
       FROM messages WHERE message_id = ?`);
        const records = [];
        for (const input of preparedInputs) {
            const messageId = this.runMessageInsert(input);
            this.indexMessageForFullText(messageId, input.content);
            const row = selectStmt.get(messageId);
            records.push(toMessageRecord(row));
        }
        return records;
    }
    async getMessages(conversationId, opts) {
        const afterSeq = opts?.afterSeq ?? -1;
        const limit = opts?.limit;
        if (limit != null) {
            const rows = this.db
                .prepare(`SELECT message_id, conversation_id, seq, role, content, token_count, created_at, large_content, transcript_entry_id, openclaw_sender_metadata
         FROM messages
         WHERE conversation_id = ? AND seq > ?
         ORDER BY seq
         LIMIT ?`)
                .all(conversationId, afterSeq, limit);
            return rows.map(toMessageRecord);
        }
        const rows = this.db
            .prepare(`SELECT message_id, conversation_id, seq, role, content, token_count, created_at, large_content, transcript_entry_id, openclaw_sender_metadata
       FROM messages
       WHERE conversation_id = ? AND seq > ?
       ORDER BY seq`)
            .all(conversationId, afterSeq);
        return rows.map(toMessageRecord);
    }
    /** Return persisted messages in the shape consumed by transcript anchor audit. */
    async listTranscriptAnchorAuditMessages(conversationId) {
        const rows = this.db
            .prepare(`SELECT
           m.message_id,
           m.seq,
           m.role,
           m.content,
           m.transcript_entry_id,
           t.trust_state,
           m.created_at
         FROM messages m
         LEFT JOIN message_transcript_anchor_trust t ON t.message_id = m.message_id
         WHERE m.conversation_id = ?
         ORDER BY m.seq`)
            .all(conversationId);
        return rows.map((row) => ({
            messageId: row.message_id,
            seq: row.seq,
            role: row.role,
            content: row.content,
            transcriptEntryId: row.transcript_entry_id,
            anchorTrustState: row.trust_state,
            createdAt: row.created_at,
        }));
    }
    /** Last `count` messages in seq order (oldest of the tail first). */
    async getLastMessages(conversationId, count) {
        if (count <= 0) {
            return [];
        }
        const rows = this.db
            .prepare(`SELECT message_id, conversation_id, seq, role, content, token_count, created_at, large_content, transcript_entry_id, openclaw_sender_metadata
       FROM messages
       WHERE conversation_id = ?
       ORDER BY seq DESC
       LIMIT ?`)
            .all(conversationId, Math.floor(count));
        return rows.reverse().map(toMessageRecord);
    }
    async getLastMessage(conversationId) {
        const row = this.db
            .prepare(`SELECT message_id, conversation_id, seq, role, content, token_count, created_at, large_content, transcript_entry_id, openclaw_sender_metadata
       FROM messages
       WHERE conversation_id = ?
       ORDER BY seq DESC
       LIMIT 1`)
            .get(conversationId);
        return row ? toMessageRecord(row) : null;
    }
    /** Return the persisted identity hash for the newest message in a conversation. */
    async getLastMessageIdentityHash(conversationId) {
        const row = this.db
            .prepare(`SELECT identity_hash FROM messages
       WHERE conversation_id = ?
       ORDER BY seq DESC
       LIMIT 1`)
            .get(conversationId);
        return row?.identity_hash ?? null;
    }
    /** Return the newest `limit` persisted identity hashes in ascending seq order. */
    async getRecentMessageIdentityHashes(conversationId, limit) {
        const rows = this.db
            .prepare(`SELECT identity_hash FROM messages
       WHERE conversation_id = ?
       ORDER BY seq DESC
       LIMIT ?`)
            .all(conversationId, limit);
        return rows
            .map((r) => r.identity_hash)
            .filter((h) => h !== null)
            .reverse();
    }
    async hasMessage(conversationId, role, content) {
        const identityHash = buildMessageIdentityHash(role, content);
        const row = this.db
            .prepare(`SELECT 1 AS count
       FROM messages
       WHERE conversation_id = ? AND identity_hash = ? AND role = ? AND content = ?
       LIMIT 1`)
            .get(conversationId, identityHash, role, content);
        return row?.count === 1;
    }
    async hasMessageByTranscriptEntryId(conversationId, transcriptEntryId) {
        const row = this.db
            .prepare(`SELECT 1 AS count
       FROM messages
       WHERE conversation_id = ? AND transcript_entry_id = ?
       LIMIT 1`)
            .get(conversationId, transcriptEntryId);
        return row?.count === 1;
    }
    /** Return the stored row currently claiming one transcript entry id. */
    async getTranscriptEntryAnchorCandidate(conversationId, transcriptEntryId) {
        const normalizedTranscriptEntryId = transcriptEntryId.trim();
        if (!normalizedTranscriptEntryId) {
            return null;
        }
        const row = this.db
            .prepare(`SELECT message_id, conversation_id, transcript_entry_id, role, content
         FROM messages
         WHERE conversation_id = ? AND transcript_entry_id = ?
         LIMIT 1`)
            .get(conversationId, normalizedTranscriptEntryId);
        return row ? toTranscriptEntryAnchorCandidate(row) : null;
    }
    /** Clear a false transcript id association while preserving the message row. */
    async clearTranscriptEntryIdForMessage(conversationId, messageId) {
        const result = this.db
            .prepare(`UPDATE messages
         SET transcript_entry_id = NULL
         WHERE conversation_id = ? AND message_id = ?`)
            .run(conversationId, messageId);
        return result.changes > 0;
    }
    /**
     * Whether this conversation already holds a message with the given
     * stable event key (responseId / toolCallId). Used by `ingestSingle`
     * to short-circuit cross-representation duplicates.
     */
    async hasMessageByStableEventKey(conversationId, stableEventKey) {
        const row = this.db
            .prepare(`SELECT 1 AS count
       FROM messages
       WHERE conversation_id = ? AND stable_event_key = ?
       LIMIT 1`)
            .get(conversationId, stableEventKey);
        return row?.count === 1;
    }
    /**
     * Tier-1 replay-twin gate for the append-only reconcile path: does this
     * conversation already hold a row with the same role, identity hash, and
     * created_at SECOND as the candidate? An indexed point lookup
     * (messages_conv_identity_hash_idx), no file read. A miss proves the candidate
     * is genuinely new content, so the append-only fast path proceeds untouched; a
     * hit is ambiguous (a re-append twin OR a legitimate same-second repeat) and
     * the caller resolves it at full inner-timestamp precision.
     */
    async hasPersistedIdentityAtCreatedAtSecond(conversationId, role, content, createdAt) {
        const createdAtSecond = formatMessageCreatedAt(createdAt);
        if (!createdAtSecond) {
            return false;
        }
        const identityHash = buildMessageIdentityHash(role, content);
        const row = this.db
            .prepare(`SELECT 1 AS count
       FROM messages
       WHERE conversation_id = ? AND identity_hash = ? AND role = ? AND created_at = ?
       LIMIT 1`)
            .get(conversationId, identityHash, role, createdAtSecond);
        return row?.count === 1;
    }
    /**
     * Stamp a transcript entry id onto the earliest identity-matching row that
     * has none. Heals rows persisted from the runtime array (flush lag) or
     * before the entry-id migration when the transcript later delivers the
     * same message with its envelope id, instead of importing a duplicate. A
     * matching user row also adopts allowlisted sender identity only when its
     * sender column is still NULL, preserving any identity captured at runtime.
     * Returns true when a row was adopted.
     */
    async adoptTranscriptEntryId(conversationId, role, content, transcriptEntryId, openClawSenderMetadata) {
        if (content.trim() === "")
            return false;
        const candidates = this.db
            .prepare(`SELECT m.message_id FROM messages m WHERE m.conversation_id = ? AND m.transcript_entry_id IS NULL AND m.role = ? AND m.content = ? AND NOT EXISTS (SELECT 1 FROM message_parts p WHERE p.message_id = m.message_id AND (p.part_type != 'text' OR p.tool_call_id IS NOT NULL))`)
            .all(conversationId, role, content);
        if (candidates.length !== 1)
            return false;
        const identityHash = buildMessageIdentityHash(role, content);
        const serializedSenderMetadata = role === "user" ? serializeOpenClawSenderMetadata(openClawSenderMetadata) : null;
        const result = this.db
            .prepare(`UPDATE messages
       SET transcript_entry_id = ?,
           openclaw_sender_metadata = COALESCE(openclaw_sender_metadata, ?)
       WHERE message_id = (
         SELECT message_id
         FROM messages
         WHERE conversation_id = ?
           AND transcript_entry_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM message_parts p WHERE p.message_id = messages.message_id AND (p.part_type != 'text' OR p.tool_call_id IS NOT NULL))
           AND identity_hash = ?
           AND role = ?
           AND content = ?
         ORDER BY seq
         LIMIT 1
       )`)
            .run(transcriptEntryId, serializedSenderMetadata, conversationId, identityHash, role, content);
        return result.changes > 0;
    }
    /** Stamp a transcript entry id onto a unique plain-text unstamped tail row. */
    async adoptRecentTranscriptEntryId(conversationId, role, content, transcriptEntryId, tailWindow) {
        if (content.trim() === "")
            return false;
        const normalizedTailWindow = Math.max(1, Math.floor(tailWindow));
        // Only rows in the adoption window can make this candidate ambiguous.
        const candidates = this.db
            .prepare(`SELECT m.message_id
         FROM (
           SELECT message_id, transcript_entry_id, role, content
           FROM messages
           WHERE conversation_id = ?
           ORDER BY seq DESC
           LIMIT ?
         ) AS m
         WHERE m.transcript_entry_id IS NULL AND m.role = ? AND m.content = ?
           AND NOT EXISTS (
             SELECT 1 FROM message_parts p
             WHERE p.message_id = m.message_id
               AND (p.part_type != 'text' OR p.tool_call_id IS NOT NULL)
           )`)
            .all(conversationId, normalizedTailWindow, role, content);
        if (candidates.length !== 1)
            return false;
        return this.adoptTranscriptEntryIdForMessage(conversationId, candidates[0].message_id, transcriptEntryId);
    }
    /** Stamp a transcript entry id onto one known unstamped message row. */
    async adoptTranscriptEntryIdForMessage(conversationId, messageId, transcriptEntryId) {
        const result = this.db
            .prepare(`UPDATE messages
         SET transcript_entry_id = ?
         WHERE conversation_id = ?
           AND message_id = ?
           AND transcript_entry_id IS NULL`)
            .run(transcriptEntryId, conversationId, messageId);
        return result.changes > 0;
    }
    /**
     * List identity-matching rows that already carry a transcript entry id,
     * oldest first. The engine compares these ids against the transcript's
     * current leaf path to find rows stranded by a host history rewrite
     * (rewriteTranscriptEntries re-appends the suffix under new ids).
     */
    async listTranscriptEntryIdsByIdentity(conversationId, role, content) {
        const identityHash = buildMessageIdentityHash(role, content);
        const rows = this.db
            .prepare(`SELECT message_id, transcript_entry_id
       FROM messages
       WHERE conversation_id = ?
         AND transcript_entry_id IS NOT NULL
         AND identity_hash = ?
         AND role = ?
         AND content = ?
       ORDER BY seq`)
            .all(conversationId, identityHash, role, content);
        return rows.map((row) => ({
            messageId: row.message_id,
            transcriptEntryId: row.transcript_entry_id,
        }));
    }
    /**
     * Return a unique recent identity-and-time matching row whose transcript id is
     * absent from the current visible projection. This is intentionally
     * tail-bounded and ambiguity-aware so a reissued transcript id can heal a
     * flush-lagged row without collapsing older legitimate repeats of the same
     * message content.
     */
    async findUniqueRecentStaleTranscriptEntryIdByIdentityAndCreatedAt(conversationId, role, content, createdAt, currentEntryIds, tailWindow) {
        const normalizedCreatedAt = formatMessageCreatedAt(createdAt);
        if (!normalizedCreatedAt) {
            return { status: "none" };
        }
        const identityHash = buildMessageIdentityHash(role, content);
        const rows = this.db
            .prepare(`SELECT message_id, transcript_entry_id
         FROM (
           SELECT message_id, transcript_entry_id, identity_hash, role, content, created_at
           FROM messages
           WHERE conversation_id = ?
           ORDER BY seq DESC
           LIMIT ?
         )
         WHERE transcript_entry_id IS NOT NULL
           AND identity_hash = ?
           AND role = ?
           AND content = ?
           AND created_at = ?
         ORDER BY message_id DESC`)
            .all(conversationId, Math.max(1, Math.floor(tailWindow)), identityHash, role, content, normalizedCreatedAt);
        const candidates = rows.filter((row) => !currentEntryIds.has(row.transcript_entry_id));
        if (candidates.length === 0) {
            return { status: "none" };
        }
        if (candidates.length > 1) {
            return { status: "ambiguous" };
        }
        const row = candidates[0];
        return {
            status: "found",
            messageId: row.message_id,
            transcriptEntryId: row.transcript_entry_id,
        };
    }
    /**
     * Replace a row's stale transcript entry id with the id the host re-issued
     * for the same message. Missing user sender identity is enriched from the
     * new envelope without overwriting existing metadata. Returns false when
     * the new id already exists for the conversation (unique-index race:
     * another path imported it first).
     */
    async restampTranscriptEntryId(messageId, transcriptEntryId, openClawSenderMetadata) {
        try {
            const serializedSenderMetadata = serializeOpenClawSenderMetadata(openClawSenderMetadata);
            const result = this.db
                .prepare(`UPDATE messages
           SET transcript_entry_id = ?,
               openclaw_sender_metadata = CASE
                 WHEN role = 'user' THEN COALESCE(openclaw_sender_metadata, ?)
                 ELSE openclaw_sender_metadata
               END
           WHERE message_id = ?`)
                .run(transcriptEntryId, serializedSenderMetadata, messageId);
            return result.changes > 0;
        }
        catch (error) {
            if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
                return false;
            }
            throw error;
        }
    }
    /** Return the subset of `entryIds` that already exist for the conversation. */
    async filterExistingTranscriptEntryIds(conversationId, entryIds) {
        const existing = new Set();
        const chunkSize = 400;
        for (let start = 0; start < entryIds.length; start += chunkSize) {
            const chunk = entryIds.slice(start, start + chunkSize);
            const placeholders = chunk.map(() => "?").join(", ");
            const rows = this.db
                .prepare(`SELECT transcript_entry_id
         FROM messages
         WHERE conversation_id = ? AND transcript_entry_id IN (${placeholders})`)
                .all(conversationId, ...chunk);
            for (const row of rows) {
                existing.add(row.transcript_entry_id);
            }
        }
        return existing;
    }
    async countMessagesByIdentity(conversationId, role, content) {
        const identityHash = buildMessageIdentityHash(role, content);
        const row = this.db
            .prepare(`SELECT COUNT(*) AS count
       FROM messages
       WHERE conversation_id = ? AND identity_hash = ? AND role = ? AND content = ?`)
            .get(conversationId, identityHash, role, content);
        return row?.count ?? 0;
    }
    /** Newest persisted transcript entry id (by seq), or null when none. */
    async getNewestTranscriptEntryId(conversationId) {
        const row = this.db
            .prepare(`SELECT transcript_entry_id AS id
       FROM messages
       WHERE conversation_id = ? AND transcript_entry_id IS NOT NULL
       ORDER BY seq DESC
       LIMIT 1`)
            .get(conversationId);
        return row?.id ?? null;
    }
    /**
     * Persist explicit trust classification for one message transcript anchor.
     *
     * A non-null `messages.transcript_entry_id` is not trusted until this table
     * marks it verified or repaired.
     */
    async upsertMessageTranscriptAnchorTrust(input) {
        this.db
            .prepare(`INSERT INTO message_transcript_anchor_trust (
           message_id, conversation_id, transcript_entry_id, trust_state,
           source, reason, verified_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(message_id) DO UPDATE SET
           conversation_id = excluded.conversation_id,
           transcript_entry_id = excluded.transcript_entry_id,
           trust_state = excluded.trust_state,
           source = excluded.source,
           reason = excluded.reason,
           verified_at = excluded.verified_at,
           updated_at = datetime('now')`)
            .run(input.messageId, input.conversationId, input.transcriptEntryId ?? null, input.trustState, input.source, input.reason ?? null, formatNullableTimestamp(input.verifiedAt));
    }
    /** Return the explicit transcript-anchor trust row for one message. */
    async getMessageTranscriptAnchorTrust(messageId) {
        const row = this.db
            .prepare(`SELECT
           message_id,
           conversation_id,
           transcript_entry_id,
           trust_state,
           source,
           reason,
           verified_at,
           created_at,
           updated_at
         FROM message_transcript_anchor_trust
         WHERE message_id = ?`)
            .get(messageId);
        return row ? toMessageTranscriptAnchorTrustRecord(row) : null;
    }
    /** True only for verified or repaired anchors in this conversation. */
    async isTrustedTranscriptAnchor(conversationId, transcriptEntryId) {
        const normalizedTranscriptEntryId = transcriptEntryId.trim();
        if (!normalizedTranscriptEntryId) {
            return false;
        }
        const row = this.db
            .prepare(`SELECT 1 AS found
         FROM message_transcript_anchor_trust
         WHERE conversation_id = ?
           AND transcript_entry_id = ?
           AND trust_state IN ('verified', 'repaired')
         LIMIT 1`)
            .get(conversationId, normalizedTranscriptEntryId);
        return row?.found === 1;
    }
    /** Persist the transcript epoch frontier for one Lossless conversation. */
    async upsertConversationTranscriptEpoch(input) {
        this.db
            .prepare(`INSERT INTO conversation_transcript_epochs (
           conversation_id,
           session_id,
           session_key,
           frontier_entry_id,
           frontier_seq,
           frontier_created_at,
           migration_mode,
           metadata_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(conversation_id) DO UPDATE SET
           session_id = excluded.session_id,
           session_key = excluded.session_key,
           frontier_entry_id = excluded.frontier_entry_id,
           frontier_seq = excluded.frontier_seq,
           frontier_created_at = excluded.frontier_created_at,
           migration_mode = excluded.migration_mode,
           metadata_json = excluded.metadata_json,
           updated_at = datetime('now')`)
            .run(input.conversationId, input.sessionId, input.sessionKey ?? null, input.frontierEntryId ?? null, input.frontierSeq ?? null, formatNullableTimestamp(input.frontierCreatedAt), input.migrationMode, input.metadata === undefined ? null : JSON.stringify(input.metadata));
    }
    /** Return the recorded transcript epoch frontier for one conversation. */
    async getConversationTranscriptEpoch(conversationId) {
        const row = this.db
            .prepare(`SELECT
           conversation_id,
           session_id,
           session_key,
           frontier_entry_id,
           frontier_seq,
           frontier_created_at,
           migration_mode,
           metadata_json,
           created_at,
           updated_at
         FROM conversation_transcript_epochs
         WHERE conversation_id = ?`)
            .get(conversationId);
        return row ? toConversationTranscriptEpochRecord(row) : null;
    }
    /**
     * Whether an identity-matching row WITHIN THE TAIL WINDOW exists that has
     * NOT been stamped with a transcript entry id — i.e. a flush-lagged
     * runtime row (persisted moments ago, always tail-adjacent) that a
     * transcript catch-up entry should adopt instead of importing a
     * duplicate. Legacy pre-migration rows deeper in history also lack entry
     * ids but are NOT flush lag; matching them would defer every repeated
     * content and mis-target adoption.
     */
    async hasRecentUnstampedMessageByIdentity(conversationId, role, content, tailWindow) {
        const identityHash = buildMessageIdentityHash(role, content);
        const row = this.db
            .prepare(`SELECT 1 AS found
       FROM (
         SELECT message_id, transcript_entry_id, identity_hash, role, content
         FROM messages
         WHERE conversation_id = ?
         ORDER BY seq DESC
         LIMIT ?
       )
       WHERE transcript_entry_id IS NULL
         AND identity_hash = ?
         AND role = ?
         AND content = ?
       LIMIT 1`)
            .get(conversationId, Math.max(1, Math.floor(tailWindow)), identityHash, role, content);
        return row?.found === 1;
    }
    /**
     * Return recent unstamped rows of one role for projection reconciliation.
     *
     * The caller performs the decoration-aware comparison before stamping an
     * entry id, so this query deliberately preserves the stored content.
     */
    async listRecentUnstampedMessagesByRole(conversationId, role, tailWindow) {
        const rows = this.db
            .prepare(`SELECT message_id, content
         FROM (
           SELECT message_id, content, transcript_entry_id, role, seq
           FROM messages
           WHERE conversation_id = ?
           ORDER BY seq DESC
           LIMIT ?
         )
         WHERE transcript_entry_id IS NULL AND role = ?
         ORDER BY seq ASC`)
            .all(conversationId, Math.max(1, Math.floor(tailWindow)), role);
        return rows.map((row) => ({ messageId: row.message_id, content: row.content }));
    }
    /**
     * Whether the newest persisted row has the same identity hash and preserved
     * reasoning content. Used to dedup adjacent delivery-mirror messages whose
     * text content is already covered by the immediately preceding response entry.
     */
    async hasPreviousReasonedMessageByIdentity(conversationId, role, content) {
        const identityHash = buildMessageIdentityHash(role, content);
        const row = this.db
            .prepare(`SELECT 1 AS found
       FROM (
         SELECT message_id, identity_hash, role, content
         FROM messages
         WHERE conversation_id = ?
         ORDER BY seq DESC
         LIMIT 1
       ) AS newest
       WHERE newest.identity_hash = ?
         AND newest.role = ?
         AND newest.content = ?
         AND EXISTS (
           SELECT 1
           FROM message_parts AS part
           WHERE part.message_id = newest.message_id
             AND (
               part.part_type = 'reasoning'
               OR (
                 part.metadata IS NOT NULL
                 AND json_valid(part.metadata)
                 AND json_extract(part.metadata, '$.topLevelReasoningField') = 'reasoning_content'
                 AND json_type(part.metadata, '$.topLevelReasoningContent') = 'text'
                 AND length(json_extract(part.metadata, '$.topLevelReasoningContent')) > 0
               )
             )
         )
       LIMIT 1`)
            .get(conversationId, identityHash, role, content);
        return row?.found === 1;
    }
    async countMessagesByIdentityHash(conversationId, role, identityHash) {
        const row = this.db
            .prepare(`SELECT COUNT(*) AS count
       FROM messages
       WHERE conversation_id = ? AND identity_hash = ? AND role = ?`)
            .get(conversationId, identityHash, role);
        return row?.count ?? 0;
    }
    async countMessagesByIdentityBeforeTimestamp(params) {
        return this.countMessagesByIdentityBeforeTimestampSync(params);
    }
    countMessagesByIdentityBeforeTimestampSync(params) {
        const identityHash = buildMessageIdentityHash(params.role, params.content);
        const row = this.db
            .prepare(`SELECT COUNT(*) AS count
       FROM messages
       WHERE conversation_id = ?
         AND identity_hash = ?
         AND role = ?
         AND content = ?
         AND created_at < ?`)
            .get(params.conversationId, identityHash, params.role, params.content, params.beforeCreatedAt);
        return row?.count ?? 0;
    }
    async getMessageById(messageId) {
        const row = this.db
            .prepare(`SELECT message_id, conversation_id, seq, role, content, token_count, created_at, large_content, transcript_entry_id, openclaw_sender_metadata
       FROM messages WHERE message_id = ?`)
            .get(messageId);
        return row ? toMessageRecord(row) : null;
    }
    /** Return the most recent message whose `large_content` sidecar references the given file id. */
    async getMessageByLargeContent(fileId) {
        const row = this.db
            .prepare(`SELECT message_id, conversation_id, seq, role, content, token_count, created_at, large_content, transcript_entry_id, openclaw_sender_metadata
       FROM messages
       WHERE large_content = ?
       ORDER BY seq DESC
       LIMIT 1`)
            .get(fileId);
        return row ? toMessageRecord(row) : null;
    }
    async createMessageParts(messageId, parts) {
        if (parts.length === 0) {
            return;
        }
        const stmt = this.db.prepare(`INSERT INTO message_parts (
         part_id,
         message_id,
         session_id,
         part_type,
         ordinal,
         text_content,
         tool_call_id,
         tool_name,
         tool_input,
         tool_output,
         metadata
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const part of parts) {
            stmt.run(randomUUID(), messageId, part.sessionId, part.partType, part.ordinal, part.textContent ?? null, part.toolCallId ?? null, part.toolName ?? null, part.toolInput ?? null, part.toolOutput ?? null, part.metadata ?? null);
        }
    }
    async getMessageParts(messageId) {
        const rows = this.db
            .prepare(`SELECT
         part_id,
         message_id,
         session_id,
         part_type,
         ordinal,
         text_content,
         tool_call_id,
         tool_name,
         tool_input,
         tool_output,
         metadata
       FROM message_parts
       WHERE message_id = ?
       ORDER BY ordinal`)
            .all(messageId);
        return rows.map(toMessagePartRecord);
    }
    async getMessageCount(conversationId) {
        const row = this.db
            .prepare(`SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?`)
            .get(conversationId);
        return row?.count ?? 0;
    }
    async getMaxSeq(conversationId) {
        const row = this.db
            .prepare(`SELECT COALESCE(MAX(seq), 0) AS max_seq
       FROM messages WHERE conversation_id = ?`)
            .get(conversationId);
        return row?.max_seq ?? 0;
    }
    // ── Deletion ──────────────────────────────────────────────────────────────
    /**
     * Delete messages and their associated records (context_items, FTS, message_parts).
     *
     * Skips messages referenced by canonical or pending summaries to avoid
     * breaking summary DAGs. Returns the count of actually deleted messages.
     */
    async deleteMessages(messageIds) {
        if (messageIds.length === 0) {
            return 0;
        }
        let deleted = 0;
        for (const messageId of messageIds) {
            // Skip if referenced by a summary (ON DELETE RESTRICT would fail anyway)
            const refRow = this.db
                .prepare(`SELECT 1 AS found
           WHERE EXISTS (SELECT 1 FROM summary_messages WHERE message_id = ?)
              OR EXISTS (SELECT 1 FROM pending_summary_node_messages WHERE message_id = ?)`)
                .get(messageId, messageId);
            if (refRow) {
                continue;
            }
            // Remove from context_items first (RESTRICT constraint)
            this.db
                .prepare(`DELETE FROM context_items WHERE item_type = 'message' AND message_id = ?`)
                .run(messageId);
            this.deleteMessageFromFullText(messageId);
            // Delete the message (message_parts cascade via ON DELETE CASCADE)
            this.db.prepare(`DELETE FROM messages WHERE message_id = ?`).run(messageId);
            deleted += 1;
        }
        return deleted;
    }
    // ── Search ────────────────────────────────────────────────────────────────
    async searchMessages(input) {
        const limit = input.limit ?? 50;
        if (input.mode === "full_text") {
            // FTS5 unicode61 can return incomplete matches for CJK text, so route
            // those queries through the existing LIKE fallback path immediately.
            if (containsCjk(input.query)) {
                return this.searchLike(input.query, limit, input.conversationId, input.conversationIds, input.since, input.before);
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
    indexMessageForFullText(messageId, content) {
        if (!this.fts5Available) {
            return;
        }
        const normalizedContent = normalizeMessageContentForFullTextIndex(content);
        if (!normalizedContent) {
            return;
        }
        try {
            this.db
                .prepare(`INSERT INTO messages_fts(rowid, content) VALUES (?, ?)`)
                .run(messageId, normalizedContent);
        }
        catch {
            // Full-text indexing is optional. Message persistence must still succeed.
        }
    }
    currentSqliteTimestamp() {
        const row = this.db
            .prepare(`SELECT datetime('now') AS created_at`)
            .get();
        return row.created_at;
    }
    prepareMessageInsert(input, createdAt = this.currentSqliteTimestamp()) {
        return {
            ...input,
            createdAt: formatMessageCreatedAt(input.createdAt) ?? createdAt,
            identityHash: input.identityHash ?? buildMessageIdentityHash(input.role, input.content),
            openClawSenderMetadata: input.role === "user" ? input.openClawSenderMetadata : null,
            stableEventKey: input.stableEventKey ?? null,
        };
    }
    /**
     * Count already-persisted replay rows for one exact message identity at a
     * timestamp. The guard's threshold is per identical message tuple, not per
     * role-wide same-second burst.
     */
    countExistingReplayRowsAtTimestampForIdentity(conversationId, role, identityHash, content, createdAt) {
        const row = this.db
            .prepare(`SELECT COUNT(*) AS count
       FROM messages AS m
       WHERE m.conversation_id = ?
         AND m.role = ?
         AND m.identity_hash = ?
         AND m.content = ?
         AND m.created_at = ?
         AND length(m.content) > 0
         AND EXISTS (
           SELECT 1
           FROM messages AS prior
           WHERE prior.conversation_id = m.conversation_id
             AND prior.identity_hash = m.identity_hash
             AND prior.role = m.role
             AND prior.content = m.content
             AND prior.created_at < m.created_at
         )`)
            .get(conversationId, role, identityHash, content, createdAt);
        return row?.count ?? 0;
    }
    /**
     * Count already-persisted replay rows across one role and timestamp. This is
     * used only for external user input so distinct rebroadcasted user messages
     * share the same replay budget.
     */
    countExistingReplayRowsAtTimestampForRole(conversationId, role, createdAt) {
        const row = this.db
            .prepare(`SELECT COUNT(*) AS count
       FROM messages AS m
       WHERE m.conversation_id = ?
         AND m.role = ?
         AND m.created_at = ?
         AND length(m.content) > 0
         AND EXISTS (
           SELECT 1
           FROM messages AS prior
           WHERE prior.conversation_id = m.conversation_id
             AND prior.identity_hash = m.identity_hash
             AND prior.role = m.role
             AND prior.content = m.content
             AND prior.created_at < m.created_at
         )`)
            .get(conversationId, role, createdAt);
        return row?.count ?? 0;
    }
    /**
     * Anti-replay guard against floods of identical messages at the same SQLite
     * `created_at` second. SQLite's `datetime('now')` has second-level
     * granularity, so legitimate fast bursts can collide with malicious replays
     * on the raw (conversation, content, created_at) tuple.
     *
     * Role-aware policy (#639 fix):
     *   - role=user        → EXTERNAL input, threshold `replayFloodThresholdExternal`
     *                        (default 3). Preserves classic defense against
     *                        webhook/input rebroadcast attacks.
     *   - role=tool|assistant|system → INTERNAL runtime output, threshold
     *                        `replayFloodThresholdInternal` (default 32).
     *                        Tool results and assistant deltas can legitimately
     *                        repeat (idempotent retries, status pings, etc.) and
     *                        are not vulnerable to third-party rebroadcast.
     *
     * External user input keeps an aggregate role/timestamp budget to preserve
     * replay defense. Internal runtime output uses exact message identity so
     * distinct same-second tool results do not consume each other's budget.
     */
    assertNoReplayTimestampFlood(inputs) {
        if (inputs.length === 0) {
            return;
        }
        const replicatedByGroup = new Map();
        for (const input of inputs) {
            if (input.content.length === 0) {
                continue;
            }
            const priorCount = this.countMessagesByIdentityBeforeTimestampSync({
                conversationId: input.conversationId,
                role: input.role,
                content: input.content,
                beforeCreatedAt: input.createdAt,
            });
            if (priorCount === 0) {
                continue;
            }
            const key = input.role === "user"
                ? JSON.stringify([input.conversationId, input.role, input.createdAt])
                : JSON.stringify([
                    input.conversationId,
                    input.role,
                    input.identityHash,
                    input.content,
                    input.createdAt,
                ]);
            const group = replicatedByGroup.get(key);
            if (group) {
                group.candidateCount += 1;
            }
            else if (input.role === "user") {
                replicatedByGroup.set(key, {
                    scope: "external",
                    conversationId: input.conversationId,
                    role: input.role,
                    createdAt: input.createdAt,
                    candidateCount: 1,
                });
            }
            else {
                replicatedByGroup.set(key, {
                    scope: "internal",
                    conversationId: input.conversationId,
                    role: input.role,
                    content: input.content,
                    identityHash: input.identityHash,
                    createdAt: input.createdAt,
                    candidateCount: 1,
                });
            }
        }
        for (const group of replicatedByGroup.values()) {
            const existingCount = group.scope === "external"
                ? this.countExistingReplayRowsAtTimestampForRole(group.conversationId, group.role, group.createdAt)
                : this.countExistingReplayRowsAtTimestampForIdentity(group.conversationId, group.role, group.identityHash, group.content, group.createdAt);
            const replicatedCount = existingCount + group.candidateCount;
            const threshold = this.replayFloodThresholdForRole(group.role);
            if (replicatedCount >= threshold) {
                throw new Error(`[lcm] refused replay-like message batch: conversation=${group.conversationId} role=${group.role} createdAt=${group.createdAt} replicatedRows=${replicatedCount} threshold=${threshold}`);
            }
        }
    }
    replayFloodThresholdForRole(role) {
        // External-input role: user messages are the rebroadcast surface.
        if (role === "user")
            return this.replayFloodThresholdExternal;
        // Internal-runtime roles: tool, assistant, system.
        return this.replayFloodThresholdInternal;
    }
    deleteMessageFromFullText(messageId) {
        if (!this.fts5Available) {
            return;
        }
        try {
            this.db.prepare(`DELETE FROM messages_fts WHERE rowid = ?`).run(messageId);
        }
        catch {
            // Ignore FTS cleanup failures; the source row deletion is authoritative.
        }
    }
    searchFullText(query, limit, conversationId, conversationIds, since, before, sort) {
        const where = ["messages_fts MATCH ?"];
        const args = [sanitizeFts5Query(query)];
        appendConversationScopeConstraint({
            where,
            args,
            columnExpr: "m.conversation_id",
            conversationId,
            conversationIds,
        });
        if (since) {
            where.push("julianday(m.created_at) >= julianday(?)");
            args.push(since.toISOString());
        }
        if (before) {
            where.push("julianday(m.created_at) < julianday(?)");
            args.push(before.toISOString());
        }
        args.push(limit);
        const orderBy = buildFtsOrderBy(sort, "m.created_at");
        const sql = `SELECT
         m.message_id,
         m.conversation_id,
         m.role,
         snippet(messages_fts, 0, '', '', '...', 32) AS snippet,
         rank,
         m.created_at
       FROM messages_fts
       JOIN messages m ON m.message_id = messages_fts.rowid
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
            where.push("julianday(created_at) >= julianday(?)");
            args.push(since.toISOString());
        }
        if (before) {
            where.push("julianday(created_at) < julianday(?)");
            args.push(before.toISOString());
        }
        args.push(limit);
        const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
        const rows = this.db
            .prepare(`SELECT message_id, conversation_id, seq, role, content, token_count, created_at, large_content, transcript_entry_id, openclaw_sender_metadata
         FROM messages
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT ?`)
            .all(...args);
        return rows
            .map((row) => {
            const normalizedContent = normalizeMessageContentForFullTextIndex(row.content) ?? row.content;
            const haystack = normalizedContent.toLowerCase();
            const matchesAllTerms = plan.terms.every((term) => haystack.includes(term));
            if (!matchesAllTerms) {
                return null;
            }
            return {
                messageId: row.message_id,
                conversationId: row.conversation_id,
                role: row.role,
                snippet: createFallbackSnippet(normalizedContent, plan.terms),
                createdAt: parseUtcTimestamp(row.created_at),
                rank: 0,
            };
        })
            .filter((row) => row !== null);
    }
    searchRegex(pattern, limit, conversationId, conversationIds, since, before) {
        // SQLite has no native POSIX regex; fetch candidates and filter in JS
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
            where.push("julianday(created_at) >= julianday(?)");
            args.push(since.toISOString());
        }
        if (before) {
            where.push("julianday(created_at) < julianday(?)");
            args.push(before.toISOString());
        }
        const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
        const rows = this.db
            .prepare(`SELECT message_id, conversation_id, seq, role, content, token_count, created_at, large_content, transcript_entry_id, openclaw_sender_metadata
         FROM messages
         ${whereClause}
         ORDER BY created_at DESC`)
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
                    messageId: row.message_id,
                    conversationId: row.conversation_id,
                    role: row.role,
                    snippet: match[0],
                    createdAt: parseUtcTimestamp(row.created_at),
                    rank: 0,
                });
            }
        }
        return results;
    }
}
