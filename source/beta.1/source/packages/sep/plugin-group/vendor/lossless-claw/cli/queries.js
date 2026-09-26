import { decodeCursor, encodeCursor, } from "./args.js";
import { CliError } from "./output.js";
const LIST_PREVIEW_SOURCE_CHARACTERS = 1024;
export { getSummaryDetails, listSummaries, } from "./summary-queries.js";
// Map SQLite integer booleans to the stable JSON representation.
function mapConversationIdentity(row) {
    return { ...row, active: row.active === 1 };
}
// Map an aggregate list row while preserving nullable diagnostic fields.
function mapConversationListItem(row) {
    return { ...row, active: row.active === 1 };
}
// Load grouped summary depth statistics in deterministic depth/kind order.
function getSummaryDepthStats(db, conversationId) {
    const rows = db.prepare(`SELECT kind, depth, COUNT(*) AS count, COALESCE(SUM(token_count), 0) AS tokens
       FROM summaries
      ${conversationId === undefined ? "" : "WHERE conversation_id = ?"}
      GROUP BY kind, depth
      ORDER BY depth ASC, kind ASC`).all(...(conversationId === undefined ? [] : [conversationId]));
    return rows;
}
/** Return database-wide counts, token totals, time coverage, and maintenance state. */
export function getGlobalStatus(db) {
    const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM conversations) AS conversationCount,
      (SELECT COUNT(*) FROM conversations WHERE active = 1) AS activeConversationCount,
      (SELECT COUNT(*) FROM messages) AS messageCount,
      (SELECT COALESCE(SUM(token_count), 0) FROM messages) AS messageTokens,
      (SELECT MIN(created_at) FROM messages) AS earliestMessageAt,
      (SELECT MAX(created_at) FROM messages) AS latestMessageAt,
      (SELECT COUNT(*) FROM summaries) AS summaryCount,
      (SELECT COALESCE(SUM(token_count), 0) FROM summaries) AS summaryTokens,
      (SELECT COALESCE(SUM(source_message_token_count), 0) FROM summaries) AS summarizedSourceTokens,
      (SELECT MIN(COALESCE(earliest_at, created_at)) FROM summaries) AS earliestSummaryAt,
      (SELECT MAX(COALESCE(latest_at, created_at)) FROM summaries) AS latestSummaryAt,
      (SELECT COUNT(*) FROM context_items) AS contextItems,
      (SELECT COALESCE(SUM(tokens), 0) FROM (
        SELECT m.token_count AS tokens
          FROM context_items ci JOIN messages m ON m.message_id = ci.message_id
         WHERE ci.item_type = 'message'
        UNION ALL
        SELECT s.token_count AS tokens
          FROM context_items ci JOIN summaries s ON s.summary_id = ci.summary_id
         WHERE ci.item_type = 'summary'
      )) AS contextTokens,
      (SELECT COUNT(*) FROM conversation_compaction_maintenance WHERE pending = 1) AS maintenancePending,
      (SELECT COUNT(*) FROM conversation_compaction_maintenance WHERE running = 1) AS maintenanceRunning,
      (SELECT COUNT(*) FROM conversation_compaction_maintenance
        WHERE last_failure_summary IS NOT NULL AND TRIM(last_failure_summary) <> '') AS maintenanceFailed
  `).get();
    return {
        conversations: { total: row.conversationCount, active: row.activeConversationCount },
        messages: {
            count: row.messageCount,
            tokens: row.messageTokens,
            earliestAt: row.earliestMessageAt,
            latestAt: row.latestMessageAt,
        },
        summaries: {
            count: row.summaryCount,
            tokens: row.summaryTokens,
            sourceMessageTokens: row.summarizedSourceTokens,
            earliestAt: row.earliestSummaryAt,
            latestAt: row.latestSummaryAt,
            byDepth: getSummaryDepthStats(db),
        },
        context: { items: row.contextItems, tokens: row.contextTokens },
        maintenance: {
            pending: row.maintenancePending,
            running: row.maintenanceRunning,
            failed: row.maintenanceFailed,
        },
    };
}
/** Resolve one persisted conversation from a numeric ID or stable session key. */
export function resolveConversation(db, selector) {
    const select = `SELECT
      conversation_id AS conversationId,
      session_id AS sessionId,
      session_key AS sessionKey,
      active,
      archived_at AS archivedAt,
      title,
      bootstrapped_at AS bootstrappedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM conversations`;
    const row = selector.kind === "conversationId"
        ? db.prepare(`${select} WHERE conversation_id = ?`).get(selector.value)
        : db.prepare(`${select}
        WHERE session_key = ?
        ORDER BY active DESC, julianday(created_at) DESC, conversation_id DESC
        LIMIT 1`).get(selector.value);
    if (!row) {
        throw new CliError("CONVERSATION_NOT_FOUND", selector.kind === "conversationId"
            ? `No conversation matched id ${selector.value}.`
            : `No conversation matched session key ${selector.value}.`, 3, selector);
    }
    return mapConversationIdentity(row);
}
// Query aggregate conversation rows for either one ID or a keyset-paged list.
function queryConversationRows(db, input) {
    const where = [];
    const normalizedTailCount = Math.max(0, Math.floor(input.freshTailCount));
    const normalizedTailTokenCap = typeof input.freshTailMaxTokens === "number"
        && Number.isFinite(input.freshTailMaxTokens)
        && input.freshTailMaxTokens >= 0
        ? Math.floor(input.freshTailMaxTokens)
        : null;
    const args = [];
    if (input.conversationId !== undefined) {
        where.push("c.conversation_id = ?");
        args.push(input.conversationId);
    }
    else if (input.cursor) {
        const cursor = decodeCursor(input.cursor, "conversations");
        if (typeof cursor.id !== "number" || !Number.isInteger(cursor.id)) {
            throw new CliError("INVALID_CURSOR", "Invalid conversations cursor.", 2);
        }
        where.push(`(
      julianday(c.updated_at) < julianday(?)
      OR (julianday(c.updated_at) = julianday(?) AND c.conversation_id < ?)
    )`);
        args.push(cursor.timestamp, cursor.timestamp, cursor.id);
    }
    args.push(input.limit);
    args.push(normalizedTailCount, normalizedTailTokenCap, normalizedTailTokenCap);
    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return db.prepare(`
    WITH
    selected_conversations AS MATERIALIZED (
      SELECT c.*
        FROM conversations c
        ${whereClause}
       ORDER BY julianday(c.updated_at) DESC, c.conversation_id DESC
       LIMIT ?
    ),
    message_stats AS (
      SELECT m.conversation_id, COUNT(*) AS messageCount,
             COALESCE(SUM(token_count), 0) AS messageTokens,
             MIN(m.created_at) AS earliestMessageAt, MAX(m.created_at) AS latestMessageAt
        FROM messages m
        JOIN selected_conversations c ON c.conversation_id = m.conversation_id
       GROUP BY m.conversation_id
    ),
    summary_stats AS (
      SELECT s.conversation_id, COUNT(*) AS summaryCount,
             COALESCE(SUM(s.token_count), 0) AS summaryTokens,
             COALESCE(SUM(s.source_message_token_count), 0) AS summarizedSourceTokens,
             MIN(COALESCE(s.earliest_at, s.created_at)) AS earliestSummaryAt,
             MAX(COALESCE(s.latest_at, s.created_at)) AS latestSummaryAt,
             MAX(s.depth) AS maxSummaryDepth
        FROM summaries s
        JOIN selected_conversations c ON c.conversation_id = s.conversation_id
       GROUP BY s.conversation_id
    ),
    context_stats AS (
      SELECT conversation_id, COUNT(*) AS contextItems, COALESCE(SUM(tokens), 0) AS contextTokens
        FROM (
          SELECT ci.conversation_id, m.token_count AS tokens
            FROM context_items ci
            JOIN selected_conversations c ON c.conversation_id = ci.conversation_id
            JOIN messages m ON m.message_id = ci.message_id
           WHERE ci.item_type = 'message'
          UNION ALL
          SELECT ci.conversation_id, s.token_count AS tokens
            FROM context_items ci
            JOIN selected_conversations c ON c.conversation_id = ci.conversation_id
            JOIN summaries s ON s.summary_id = ci.summary_id
           WHERE ci.item_type = 'summary'
        ) GROUP BY conversation_id
    ),
    ranked_messages AS (
      SELECT ci.conversation_id, m.token_count,
             ROW_NUMBER() OVER (
               PARTITION BY ci.conversation_id ORDER BY ci.ordinal DESC
             ) AS tailRank,
             SUM(m.token_count) OVER (
               PARTITION BY ci.conversation_id ORDER BY ci.ordinal DESC
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
             ) AS cumulativeTokens
        FROM context_items ci
        JOIN selected_conversations c ON c.conversation_id = ci.conversation_id
        JOIN messages m ON m.message_id = ci.message_id
       WHERE ci.item_type = 'message'
    ),
    fresh_tail_stats AS (
      SELECT conversation_id, COUNT(*) AS freshTailMessages,
             COALESCE(SUM(token_count), 0) AS freshTailTokens
        FROM ranked_messages
       WHERE tailRank <= ?
         AND (tailRank = 1 OR ? IS NULL OR cumulativeTokens <= ?)
       GROUP BY conversation_id
    )
    SELECT
      c.conversation_id AS conversationId,
      c.session_id AS sessionId,
      c.session_key AS sessionKey,
      c.active,
      c.archived_at AS archivedAt,
      c.title,
      c.bootstrapped_at AS bootstrappedAt,
      c.created_at AS createdAt,
      c.updated_at AS updatedAt,
      COALESCE(ms.messageCount, 0) AS messageCount,
      COALESCE(ms.messageTokens, 0) AS messageTokens,
      ms.earliestMessageAt,
      ms.latestMessageAt,
      COALESCE(ss.summaryCount, 0) AS summaryCount,
      COALESCE(ss.summaryTokens, 0) AS summaryTokens,
      COALESCE(ss.summarizedSourceTokens, 0) AS summarizedSourceTokens,
      ss.earliestSummaryAt,
      ss.latestSummaryAt,
      ss.maxSummaryDepth,
      COALESCE(cs.contextItems, 0) AS contextItems,
      COALESCE(cs.contextTokens, 0) AS contextTokens,
      COALESCE(fts.freshTailMessages, 0) AS freshTailMessages,
      COALESCE(fts.freshTailTokens, 0) AS freshTailTokens
    FROM selected_conversations c
    LEFT JOIN message_stats ms ON ms.conversation_id = c.conversation_id
    LEFT JOIN summary_stats ss ON ss.conversation_id = c.conversation_id
    LEFT JOIN context_stats cs ON cs.conversation_id = c.conversation_id
    LEFT JOIN fresh_tail_stats fts ON fts.conversation_id = c.conversation_id
    ORDER BY julianday(c.updated_at) DESC, c.conversation_id DESC
  `).all(...args);
}
/** Return one keyset-paginated page of aggregate conversation diagnostics. */
export function listConversations(db, input) {
    const rows = queryConversationRows(db, { ...input, limit: input.limit + 1 });
    const hasMore = rows.length > input.limit;
    const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
    const items = pageRows.map(mapConversationListItem);
    const last = items.at(-1);
    return {
        items,
        pagination: {
            limit: input.limit,
            returned: items.length,
            hasMore,
            nextCursor: hasMore && last
                ? encodeCursor("conversations", last.updatedAt, last.conversationId)
                : null,
        },
    };
}
// Load one conversation's context item counts and token totals in prompt order.
function getContextStats(db, conversationId) {
    return db.prepare(`
    SELECT ci.item_type AS itemType, COUNT(*) AS count,
           COALESCE(SUM(COALESCE(m.token_count, s.token_count, 0)), 0) AS tokens
      FROM context_items ci
      LEFT JOIN messages m ON m.message_id = ci.message_id
      LEFT JOIN summaries s ON s.summary_id = ci.summary_id
     WHERE ci.conversation_id = ?
     GROUP BY ci.item_type
     ORDER BY MIN(ci.ordinal)
  `).all(conversationId);
}
// Load the optional persisted compaction telemetry row.
function getTelemetry(db, conversationId) {
    const row = db.prepare(`SELECT
      last_observed_cache_read AS lastObservedCacheRead,
      last_observed_cache_write AS lastObservedCacheWrite,
      last_observed_prompt_token_count AS lastObservedPromptTokenCount,
      last_observed_cache_hit_at AS lastObservedCacheHitAt,
      last_observed_cache_break_at AS lastObservedCacheBreakAt,
      cache_state AS cacheState,
      consecutive_cold_observations AS consecutiveColdObservations,
      retention,
      last_leaf_compaction_at AS lastLeafCompactionAt,
      turns_since_leaf_compaction AS turnsSinceLeafCompaction,
      tokens_accumulated_since_leaf_compaction AS tokensAccumulatedSinceLeafCompaction,
      last_activity_band AS lastActivityBand,
      last_api_call_at AS lastApiCallAt,
      last_cache_touch_at AS lastCacheTouchAt,
      provider, model, updated_at AS updatedAt
    FROM conversation_compaction_telemetry WHERE conversation_id = ?`).get(conversationId);
    return row ?? null;
}
// Load the optional deferred compaction maintenance row.
function getMaintenance(db, conversationId) {
    const row = db.prepare(`SELECT
      pending, requested_at AS requestedAt, reason, running,
      last_started_at AS lastStartedAt, last_finished_at AS lastFinishedAt,
      last_failure_summary AS lastFailureSummary, token_budget AS tokenBudget,
      current_token_count AS currentTokenCount, projected_token_count AS projectedTokenCount,
      raw_tokens_outside_tail AS rawTokensOutsideTail, context_threshold AS contextThreshold,
      context_threshold_source AS contextThresholdSource, retry_attempts AS retryAttempts,
      next_attempt_after AS nextAttemptAfter, updated_at AS updatedAt
    FROM conversation_compaction_maintenance WHERE conversation_id = ?`).get(conversationId);
    return row ? { ...row, pending: row.pending === 1, running: row.running === 1 } : null;
}
// Load the optional transcript bootstrap frontier without reading the session file.
function getBootstrap(db, conversationId) {
    const bootstrapTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'conversation_bootstrap_state'").get();
    if (!bootstrapTable) {
        return null;
    }
    const bootstrapColumns = new Set(db.prepare("PRAGMA table_info(conversation_bootstrap_state)").all()
        .map((column) => column.name));
    // Pre-epoch databases retain the core file checkpoint without these later
    // reconciliation and fork fields. Diagnostics must remain read-only.
    const sessionHeaderId = bootstrapColumns.has("session_header_id")
        ? "session_header_id"
        : "NULL";
    const lastProcessedEntryId = bootstrapColumns.has("last_processed_entry_id")
        ? "last_processed_entry_id"
        : "NULL";
    const forkBounded = bootstrapColumns.has("fork_bounded") ? "fork_bounded" : "0";
    const forkSourceMessageCount = bootstrapColumns.has("fork_source_message_count")
        ? "fork_source_message_count"
        : "0";
    const row = db.prepare(`SELECT
      session_file_path AS sessionFilePath, last_seen_size AS lastSeenSize,
      last_seen_mtime_ms AS lastSeenMtimeMs, last_processed_offset AS lastProcessedOffset,
      last_processed_entry_hash AS lastProcessedEntryHash, ${sessionHeaderId} AS sessionHeaderId,
      ${lastProcessedEntryId} AS lastProcessedEntryId, ${forkBounded} AS forkBounded,
      ${forkSourceMessageCount} AS forkSourceMessageCount, updated_at AS updatedAt
    FROM conversation_bootstrap_state WHERE conversation_id = ?`).get(conversationId);
    return row ? { ...row, forkBounded: row.forkBounded === 1 } : null;
}
// Count all focus briefs and expose only the newest active brief metadata.
function getFocusBriefStats(db, conversationId) {
    const countRow = db.prepare("SELECT COUNT(*) AS count FROM focus_briefs WHERE conversation_id = ?").get(conversationId);
    const activeBrief = db.prepare(`SELECT
      brief_id AS briefId, prompt, token_count AS tokenCount,
      target_tokens AS targetTokens, covered_latest_at AS coveredLatestAt,
      covered_message_seq AS coveredMessageSeq, generator_run_id AS generatorRunId,
      generator_session_key AS generatorSessionKey, created_at AS createdAt,
      updated_at AS updatedAt
    FROM focus_briefs
    WHERE conversation_id = ? AND status = 'active'
    ORDER BY julianday(created_at) DESC, brief_id DESC LIMIT 1`).get(conversationId);
    return { count: countRow.count, activeBrief: activeBrief ?? null };
}
// Aggregate externalized large-file storage without reading file contents.
function getLargeFileStats(db, conversationId) {
    return db.prepare(`SELECT COUNT(*) AS count,
      COALESCE(SUM(byte_size), 0) AS bytes, MAX(created_at) AS latestAt
    FROM large_files WHERE conversation_id = ?`).get(conversationId);
}
/** Return the complete read-only diagnostic projection for one conversation. */
export function getConversationDiagnostics(db, selector, input) {
    const identity = resolveConversation(db, selector);
    const row = queryConversationRows(db, {
        limit: 1,
        freshTailCount: input.freshTailCount,
        freshTailMaxTokens: input.freshTailMaxTokens,
        conversationId: identity.conversationId,
    })[0];
    if (!row) {
        throw new CliError("CONVERSATION_NOT_FOUND", "Conversation disappeared during query.", 3, selector);
    }
    return {
        conversation: mapConversationListItem(row),
        summaryDepths: getSummaryDepthStats(db, identity.conversationId),
        context: getContextStats(db, identity.conversationId),
        telemetry: getTelemetry(db, identity.conversationId),
        maintenance: getMaintenance(db, identity.conversationId),
        bootstrap: getBootstrap(db, identity.conversationId),
        focusBriefs: getFocusBriefStats(db, identity.conversationId),
        largeFiles: getLargeFileStats(db, identity.conversationId),
    };
}
// Produce a bounded single-line preview without changing stored content.
function previewMessageContent(content, maximumCharacters = 240) {
    const normalized = content.replace(/\s+/g, " ").trim();
    return normalized.length <= maximumCharacters
        ? normalized
        : `${normalized.slice(0, maximumCharacters - 1)}…`;
}
// Map a stored message row to the public list representation.
function mapMessageRow(row, includeContent) {
    return {
        messageId: row.messageId,
        conversationId: row.conversationId,
        seq: row.seq,
        role: row.role,
        tokenCount: row.tokenCount,
        createdAt: row.createdAt,
        largeContent: row.largeContent,
        preview: previewMessageContent(row.content),
        ...(includeContent ? { content: row.content } : {}),
    };
}
/** Return one filtered, keyset-paginated page of stored conversation messages. */
export function listMessages(db, input) {
    const conversation = resolveConversation(db, input.selector);
    const where = ["m.conversation_id = ?"];
    const args = [conversation.conversationId];
    // Add only enumerated role placeholders and bound timestamp/cursor values.
    if (input.roles.length > 0) {
        where.push(`m.role IN (${input.roles.map(() => "?").join(", ")})`);
        args.push(...input.roles);
    }
    if (input.time.after) {
        where.push("julianday(m.created_at) >= julianday(?)");
        args.push(input.time.after.toISOString());
    }
    if (input.time.before) {
        where.push("julianday(m.created_at) < julianday(?)");
        args.push(input.time.before.toISOString());
    }
    if (input.cursor) {
        const cursor = decodeCursor(input.cursor, "messages");
        if (typeof cursor.id !== "number" || !Number.isInteger(cursor.id)) {
            throw new CliError("INVALID_CURSOR", "Invalid messages cursor.", 2);
        }
        where.push(`(
      julianday(m.created_at) < julianday(?)
      OR (julianday(m.created_at) = julianday(?) AND m.message_id < ?)
    )`);
        args.push(cursor.timestamp, cursor.timestamp, cursor.id);
    }
    args.push(input.limit + 1);
    const contentProjection = input.includeContent
        ? "m.content"
        : `substr(m.content, 1, ${LIST_PREVIEW_SOURCE_CHARACTERS})`;
    const rows = db.prepare(`SELECT
      m.message_id AS messageId, m.conversation_id AS conversationId,
      m.seq, m.role, ${contentProjection} AS content, m.token_count AS tokenCount,
      m.created_at AS createdAt, m.large_content AS largeContent
    FROM messages m
    WHERE ${where.join(" AND ")}
    ORDER BY julianday(m.created_at) DESC, m.message_id DESC
    LIMIT ?`).all(...args);
    const hasMore = rows.length > input.limit;
    const items = (hasMore ? rows.slice(0, input.limit) : rows)
        .map((row) => mapMessageRow(row, input.includeContent));
    const last = items.at(-1);
    return {
        conversation,
        items,
        pagination: {
            limit: input.limit,
            returned: items.length,
            hasMore,
            nextCursor: hasMore && last
                ? encodeCursor("messages", last.createdAt, last.messageId)
                : null,
        },
    };
}
/** Return the protected raw-message tail from the current context frontier. */
export function getFreshTail(db, input) {
    const conversationIdentity = resolveConversation(db, input.selector);
    const count = Math.max(0, Math.floor(input.count ?? input.freshTailCount));
    const maxTokens = typeof input.freshTailMaxTokens === "number"
        && Number.isFinite(input.freshTailMaxTokens)
        && input.freshTailMaxTokens >= 0
        ? Math.floor(input.freshTailMaxTokens)
        : null;
    const rows = db.prepare(`SELECT
      m.message_id AS messageId, m.conversation_id AS conversationId,
      m.seq, m.role, m.content, m.token_count AS tokenCount,
      m.created_at AS createdAt, m.large_content AS largeContent
    FROM context_items ci
    JOIN messages m ON m.message_id = ci.message_id
    WHERE ci.conversation_id = ? AND ci.item_type = 'message'
    ORDER BY ci.ordinal DESC
    LIMIT ?`).all(conversationIdentity.conversationId, count);
    // Walk newest to oldest, always preserving the newest row even above the cap.
    const selectedNewestFirst = [];
    let selectedTokens = 0;
    for (const row of rows) {
        if (selectedNewestFirst.length > 0
            && maxTokens !== null
            && selectedTokens + row.tokenCount > maxTokens) {
            break;
        }
        selectedNewestFirst.push(row);
        selectedTokens += row.tokenCount;
    }
    const messages = selectedNewestFirst.reverse().map((row) => mapMessageRow(row, true));
    const totals = db.prepare(`SELECT COUNT(*) AS messages,
      COALESCE(SUM(token_count), 0) AS tokens
    FROM messages WHERE conversation_id = ?`).get(conversationIdentity.conversationId);
    return {
        conversationIdentity,
        limits: { count, maxTokens },
        selected: {
            messages: messages.length,
            tokens: selectedTokens,
            firstSeq: messages[0]?.seq ?? null,
            lastSeq: messages.at(-1)?.seq ?? null,
        },
        conversation: totals,
        messages,
    };
}
