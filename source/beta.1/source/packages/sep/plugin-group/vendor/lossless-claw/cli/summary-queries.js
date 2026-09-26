import { decodeCursor, encodeCursor, } from "./args.js";
import { CliError } from "./output.js";
const LIST_PREVIEW_SOURCE_CHARACTERS = 1024;
const SUMMARY_COVERAGE_TIME = "COALESCE(s.latest_at, s.created_at)";
// Build the shared summary projection with either full or bounded content.
function buildSummarySelect(includeContent) {
    const contentProjection = includeContent
        ? "s.content"
        : `substr(s.content, 1, ${LIST_PREVIEW_SOURCE_CHARACTERS})`;
    return `
  SELECT
    s.summary_id AS summaryId,
    s.conversation_id AS conversationId,
    s.kind,
    s.depth,
    ${contentProjection} AS content,
    s.token_count AS tokenCount,
    s.earliest_at AS earliestAt,
    s.latest_at AS latestAt,
    ${SUMMARY_COVERAGE_TIME} AS coverageAt,
    s.descendant_count AS descendantCount,
    s.descendant_token_count AS descendantTokenCount,
    s.source_message_token_count AS sourceMessageTokenCount,
    s.created_at AS createdAt,
    s.file_ids AS fileIdsJson,
    s.model,
    (SELECT COUNT(*) FROM summary_parents sp
      JOIN summaries related ON related.summary_id = sp.summary_id
     WHERE sp.parent_summary_id = s.summary_id
       AND related.conversation_id = s.conversation_id) AS parentCount,
    (SELECT COUNT(*) FROM summary_parents sp
      JOIN summaries related ON related.summary_id = sp.parent_summary_id
     WHERE sp.summary_id = s.summary_id
       AND related.conversation_id = s.conversation_id) AS childCount,
    (SELECT COUNT(*) FROM summary_messages sm
      JOIN messages m ON m.message_id = sm.message_id
     WHERE sm.summary_id = s.summary_id
       AND m.conversation_id = s.conversation_id) AS sourceMessageCount
  FROM summaries s`;
}
const SUMMARY_SELECT = buildSummarySelect(true);
// Resolve optional summary-list scope without importing the broader query module.
function resolveConversationId(db, selector) {
    const row = selector.kind === "conversationId"
        ? db.prepare("SELECT conversation_id AS conversationId FROM conversations WHERE conversation_id = ?")
            .get(selector.value)
        : db.prepare(`SELECT conversation_id AS conversationId
        FROM conversations WHERE session_key = ?
        ORDER BY active DESC, julianday(created_at) DESC, conversation_id DESC LIMIT 1`)
            .get(selector.value);
    if (!row) {
        throw new CliError("CONVERSATION_NOT_FOUND", selector.kind === "conversationId"
            ? `No conversation matched id ${selector.value}.`
            : `No conversation matched session key ${selector.value}.`, 3, selector);
    }
    return row.conversationId;
}
// Parse persisted file identifiers while treating malformed legacy values as empty.
function parseFileIds(value) {
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed)
            ? parsed.filter((item) => typeof item === "string")
            : [];
    }
    catch {
        return [];
    }
}
// Produce a bounded one-line summary preview.
function previewSummaryContent(content, maximumCharacters = 240) {
    const normalized = content.replace(/\s+/g, " ").trim();
    return normalized.length <= maximumCharacters
        ? normalized
        : `${normalized.slice(0, maximumCharacters - 1)}…`;
}
// Map a private SQLite row to the public summary representation.
function mapSummaryRow(row, includeContent) {
    return {
        summaryId: row.summaryId,
        conversationId: row.conversationId,
        kind: row.kind,
        depth: row.depth,
        tokenCount: row.tokenCount,
        earliestAt: row.earliestAt,
        latestAt: row.latestAt,
        coverageAt: row.coverageAt,
        descendantCount: row.descendantCount,
        descendantTokenCount: row.descendantTokenCount,
        sourceMessageTokenCount: row.sourceMessageTokenCount,
        createdAt: row.createdAt,
        fileIds: parseFileIds(row.fileIdsJson),
        model: row.model,
        parentCount: row.parentCount,
        childCount: row.childCount,
        sourceMessageCount: row.sourceMessageCount,
        preview: previewSummaryContent(row.content),
        ...(includeContent ? { content: row.content } : {}),
    };
}
/** Return one filtered, keyset-paginated page of summaries. */
export function listSummaries(db, input) {
    const conversationId = input.selector ? resolveConversationId(db, input.selector) : null;
    const where = [];
    const args = [];
    // Add each optional filter with bound values and an enumerated column expression.
    if (conversationId !== null) {
        where.push("s.conversation_id = ?");
        args.push(conversationId);
    }
    if (input.depth !== undefined) {
        where.push("s.depth = ?");
        args.push(input.depth);
    }
    if (input.kind) {
        where.push("s.kind = ?");
        args.push(input.kind);
    }
    if (input.time.after) {
        where.push(`julianday(${SUMMARY_COVERAGE_TIME}) >= julianday(?)`);
        args.push(input.time.after.toISOString());
    }
    if (input.time.before) {
        where.push(`julianday(${SUMMARY_COVERAGE_TIME}) < julianday(?)`);
        args.push(input.time.before.toISOString());
    }
    if (input.cursor) {
        const cursor = decodeCursor(input.cursor, "summaries");
        if (typeof cursor.id !== "string" || !cursor.id) {
            throw new CliError("INVALID_CURSOR", "Invalid summaries cursor.", 2);
        }
        where.push(`(
      julianday(${SUMMARY_COVERAGE_TIME}) < julianday(?)
      OR (julianday(${SUMMARY_COVERAGE_TIME}) = julianday(?) AND s.summary_id < ?)
    )`);
        args.push(cursor.timestamp, cursor.timestamp, cursor.id);
    }
    args.push(input.limit + 1);
    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = db.prepare(`${buildSummarySelect(input.includeContent)}
    ${whereClause}
    ORDER BY julianday(${SUMMARY_COVERAGE_TIME}) DESC, s.summary_id DESC
    LIMIT ?`).all(...args);
    const hasMore = rows.length > input.limit;
    const items = (hasMore ? rows.slice(0, input.limit) : rows)
        .map((row) => mapSummaryRow(row, input.includeContent));
    const last = items.at(-1);
    return {
        conversationId,
        items,
        pagination: {
            limit: input.limit,
            returned: items.length,
            hasMore,
            nextCursor: hasMore && last
                ? encodeCursor("summaries", last.coverageAt, last.summaryId)
                : null,
        },
    };
}
// Load one summary row and normalize the not-found error contract.
function getSummaryRow(db, summaryId) {
    const row = db.prepare(`${SUMMARY_SELECT} WHERE s.summary_id = ?`).get(summaryId);
    if (!row) {
        throw new CliError("SUMMARY_NOT_FOUND", `No summary matched id ${summaryId}.`, 3, { summaryId });
    }
    return row;
}
// Load intuitive higher-depth parents that consume the selected summary.
function getSummaryParents(db, summary) {
    return db.prepare(`${SUMMARY_SELECT}
    JOIN summary_parents edge ON edge.summary_id = s.summary_id
    WHERE edge.parent_summary_id = ? AND s.conversation_id = ?
    ORDER BY s.depth ASC, s.summary_id ASC`).all(summary.summaryId, summary.conversationId);
}
// Load lower-depth source children in their persisted compaction order.
function getSummaryChildren(db, summary) {
    return db.prepare(`${SUMMARY_SELECT}
    JOIN summary_parents edge ON edge.parent_summary_id = s.summary_id
    WHERE edge.summary_id = ? AND s.conversation_id = ?
    ORDER BY edge.ordinal ASC`).all(summary.summaryId, summary.conversationId);
}
// Load direct raw sources and reject malformed cross-conversation links.
function getSummarySourceMessages(db, summary) {
    return db.prepare(`SELECT
      m.message_id AS messageId, m.seq, m.role, m.token_count AS tokenCount,
      m.created_at AS createdAt, m.content
    FROM summary_messages sm
    JOIN messages m ON m.message_id = sm.message_id
    WHERE sm.summary_id = ? AND m.conversation_id = ?
    ORDER BY sm.ordinal ASC`).all(summary.summaryId, summary.conversationId);
}
/** Return one full summary with direct DAG relations and ordered raw sources. */
export function getSummaryDetails(db, summaryId) {
    const row = getSummaryRow(db, summaryId);
    return {
        summary: mapSummaryRow(row, true),
        parents: getSummaryParents(db, row).map((parent) => mapSummaryRow(parent, true)),
        children: getSummaryChildren(db, row).map((child) => mapSummaryRow(child, true)),
        sourceMessages: getSummarySourceMessages(db, row),
    };
}
