import { DatabaseTransactionTimeoutError, withExclusiveDatabaseLock } from "../transaction-mutex.js";
import { formatTimestamp } from "../compaction.js";
import { createLcmSummarizeFromLegacyParams } from "../summarize.js";
import { createLcmDatabaseBackup } from "./lcm-db-backup.js";
import { detectDoctorMarker, loadDoctorTargets } from "./lcm-doctor-shared.js";
import { estimateTokens } from "../estimate-tokens.js";
const DOCTOR_APPLY_DATABASE_LOCK_TIMEOUT_MS = 30_000;
/**
 * Repair broken summaries for a single resolved conversation.
 */
export async function applyScopedDoctorRepair(params) {
    const targets = loadDoctorTargets(params.db, params.conversationId);
    if (targets.length === 0) {
        return {
            kind: "applied",
            detected: 0,
            repaired: 0,
            unchanged: 0,
            skipped: [],
            repairedSummaryIds: [],
        };
    }
    const summarize = await resolveDoctorApplySummarize(params);
    if (!summarize) {
        return {
            kind: "unavailable",
            reason: "Lossless Claw could not resolve a summarizer for native doctor apply through the normal model/auth chain.",
        };
    }
    const ordered = orderDoctorTargets(params.db, params.conversationId, targets);
    const overrides = new Map();
    const skipped = [];
    const repairedSummaryIds = [];
    let backupPath;
    let unchanged = 0;
    for (const target of ordered) {
        try {
            const sourceText = buildSummarySourceText({
                db: params.db,
                target,
                timezone: params.config.timezone,
                overrides,
            });
            if (!sourceText.trim()) {
                skipped.push({
                    summaryId: target.summaryId,
                    reason: "source text resolved empty",
                });
                continue;
            }
            const previousSummary = resolvePreviousSummaryContext({
                db: params.db,
                target,
                overrides,
            });
            const rewritten = (await summarize(sourceText, false, {
                previousSummary,
                isCondensed: isCondensedTarget(target),
                ...(isCondensedTarget(target) ? { depth: target.depth } : {}),
            })).trim();
            if (!rewritten) {
                skipped.push({
                    summaryId: target.summaryId,
                    reason: "summarizer returned empty output",
                });
                continue;
            }
            if (detectDoctorMarker(rewritten)) {
                skipped.push({
                    summaryId: target.summaryId,
                    reason: "rewritten content still contains a doctor marker",
                });
                continue;
            }
            if (rewritten === (typeof target.content === "string" ? target.content.trim() : "")) {
                unchanged += 1;
                continue;
            }
            const tokenCount = estimateTokens(rewritten);
            overrides.set(target.summaryId, {
                content: rewritten,
                tokenCount,
            });
            repairedSummaryIds.push(target.summaryId);
        }
        catch (error) {
            skipped.push({
                summaryId: target.summaryId,
                reason: error instanceof Error ? error.message : "unknown repair failure",
            });
        }
    }
    if (repairedSummaryIds.length > 0) {
        try {
            const unavailable = await withExclusiveDatabaseLock(params.db, { timeoutMs: DOCTOR_APPLY_DATABASE_LOCK_TIMEOUT_MS }, () => {
                if (params.db.isTransaction) {
                    return {
                        kind: "unavailable",
                        reason: "Lossless Claw obtained exclusive doctor apply access, but the shared database connection is still inside another transaction.",
                    };
                }
                const createdBackupPath = createLcmDatabaseBackup(params.db, {
                    databasePath: params.config.databasePath,
                    label: "scoped-doctor-repair",
                });
                if (!createdBackupPath) {
                    return {
                        kind: "unavailable",
                        reason: "Lossless Claw could not determine a doctor apply backup path.",
                    };
                }
                backupPath = createdBackupPath;
                params.db.exec("BEGIN IMMEDIATE");
                try {
                    for (const summaryId of repairedSummaryIds) {
                        const override = overrides.get(summaryId);
                        if (!override) {
                            continue;
                        }
                        params.db
                            .prepare(`UPDATE summaries
                   SET content = ?, token_count = ?
                   WHERE summary_id = ?`)
                            .run(override.content, override.tokenCount, summaryId);
                        updateSummaryFts(params.db, summaryId, override.content);
                    }
                    params.db.exec("COMMIT");
                }
                catch (error) {
                    params.db.exec("ROLLBACK");
                    throw error;
                }
                return null;
            });
            if (unavailable) {
                return unavailable;
            }
        }
        catch (error) {
            if (error instanceof DatabaseTransactionTimeoutError) {
                return {
                    kind: "unavailable",
                    reason: `Lossless Claw waited ${Math.floor(DOCTOR_APPLY_DATABASE_LOCK_TIMEOUT_MS / 1000)}s for the database to become idle, but another transaction never finished.`,
                };
            }
            throw error;
        }
    }
    return {
        kind: "applied",
        detected: targets.length,
        repaired: repairedSummaryIds.length,
        unchanged,
        skipped,
        repairedSummaryIds,
        ...(backupPath ? { backupPath } : {}),
    };
}
async function resolveDoctorApplySummarize(params) {
    if (typeof params.summarize === "function") {
        return params.summarize;
    }
    if (!params.deps) {
        return undefined;
    }
    const runtimeSummarizer = await createLcmSummarizeFromLegacyParams({
        deps: params.deps,
        legacyParams: {
            config: params.runtimeConfig,
            ...(params.runtimeContext ?? {}),
            ...(params.sessionKey ? { sessionKey: params.sessionKey } : {}),
        },
        customInstructions: params.config.customInstructions || undefined,
    });
    return runtimeSummarizer?.fn;
}
function isCondensedTarget(target) {
    return !(target.depth === 0 || target.kind === "leaf");
}
function orderDoctorTargets(db, conversationId, targets) {
    const leafOrdinals = loadDoctorLeafOrdinals(db, conversationId);
    const activeLeaves = [];
    const orphanLeaves = [];
    const condensed = [];
    for (const target of targets) {
        if (!isCondensedTarget(target)) {
            const contextOrdinal = leafOrdinals.get(target.summaryId);
            if (typeof contextOrdinal === "number") {
                activeLeaves.push({ ...target, contextOrdinal });
            }
            else {
                orphanLeaves.push(target);
            }
            continue;
        }
        condensed.push(target);
    }
    activeLeaves.sort((left, right) => left.contextOrdinal - right.contextOrdinal);
    orphanLeaves.sort(compareDoctorTargets);
    condensed.sort(compareDoctorTargets);
    return [...activeLeaves, ...orphanLeaves, ...condensed];
}
function compareDoctorTargets(left, right) {
    if (left.depth !== right.depth) {
        return left.depth - right.depth;
    }
    if (left.createdAt !== right.createdAt) {
        return left.createdAt.localeCompare(right.createdAt);
    }
    return left.summaryId.localeCompare(right.summaryId);
}
function loadDoctorLeafOrdinals(db, conversationId) {
    const rows = db
        .prepare(`SELECT ci.summary_id, ci.ordinal, COALESCE(s.content, '') AS content
       FROM context_items ci
       JOIN summaries s ON s.summary_id = ci.summary_id
       WHERE ci.conversation_id = ?
         AND ci.item_type = 'summary'
         AND COALESCE(s.depth, 0) = 0
       ORDER BY ci.ordinal ASC`)
        .all(conversationId);
    const ordinals = new Map();
    for (const row of rows) {
        if (!detectDoctorMarker(row.content ?? "")) {
            continue;
        }
        ordinals.set(row.summary_id, row.ordinal);
    }
    return ordinals;
}
function buildSummarySourceText(params) {
    return isCondensedTarget(params.target)
        ? buildCondensedSourceText(params)
        : buildLeafSourceText(params);
}
function buildLeafSourceText(params) {
    const rows = params.db
        .prepare(`SELECT m.created_at, m.role, COALESCE(m.content, '') AS content
       FROM summary_messages sm
       JOIN messages m ON m.message_id = sm.message_id
       WHERE sm.summary_id = ?
       ORDER BY sm.ordinal ASC`)
        .all(params.target.summaryId);
    if (rows.length === 0) {
        throw new Error("no messages linked to summary");
    }
    return rows
        .map((row) => `[${formatSqliteTimestamp(row.created_at, params.timezone)} | ${row.role ?? "unknown"}]\n${row.content}`)
        .join("\n\n");
}
function buildCondensedSourceText(params) {
    const rows = params.db
        .prepare(`SELECT
         sp.parent_summary_id AS summary_id,
         COALESCE(s.content, '') AS content,
         s.earliest_at,
         s.latest_at,
         s.created_at
       FROM summary_parents sp
       JOIN summaries s ON s.summary_id = sp.parent_summary_id
       WHERE sp.summary_id = ?
       ORDER BY sp.ordinal ASC`)
        .all(params.target.summaryId);
    if (rows.length === 0) {
        throw new Error("no child summaries linked to summary");
    }
    const parts = rows
        .map((row) => {
        const override = params.overrides.get(row.summary_id);
        const rawContent = override?.content ?? row.content;
        const content = typeof rawContent === "string" ? rawContent.trim() : String(rawContent ?? "");
        if (!content) {
            return null;
        }
        const timeRange = resolveSummaryTimeRange({
            earliestAt: row.earliest_at,
            latestAt: row.latest_at,
            createdAt: row.created_at,
        });
        const header = formatSummaryTimeRange(timeRange, params.timezone);
        return header ? `${header}\n${content}` : content;
    })
        .filter((value) => typeof value === "string");
    if (parts.length === 0) {
        throw new Error("child summaries resolved empty");
    }
    return parts.join("\n\n");
}
function resolvePreviousSummaryContext(params) {
    return (previousViaContextItems(params) ??
        previousViaSummaryParents(params) ??
        previousViaTimestamp(params));
}
function previousViaContextItems(params) {
    const targetRow = params.db
        .prepare(`SELECT ordinal
       FROM context_items
       WHERE conversation_id = ?
         AND item_type = 'summary'
         AND summary_id = ?
       LIMIT 1`)
        .get(params.target.conversationId, params.target.summaryId);
    if (!targetRow) {
        return undefined;
    }
    const previousRow = params.db
        .prepare(`SELECT s.summary_id
       FROM context_items ci
       JOIN summaries s ON s.summary_id = ci.summary_id
       WHERE ci.conversation_id = ?
         AND ci.item_type = 'summary'
         AND COALESCE(s.depth, 0) = ?
         AND ci.ordinal < ?
       ORDER BY ci.ordinal DESC
       LIMIT 1`)
        .get(params.target.conversationId, params.target.depth, targetRow.ordinal);
    return resolveSummaryContent(params.db, previousRow?.summary_id, params.overrides);
}
function previousViaSummaryParents(params) {
    const parentRow = params.db
        .prepare(`SELECT summary_id, ordinal
       FROM summary_parents
       WHERE parent_summary_id = ?
       LIMIT 1`)
        .get(params.target.summaryId);
    if (!parentRow) {
        return undefined;
    }
    const previousRow = params.db
        .prepare(`SELECT parent_summary_id AS summary_id
       FROM summary_parents
       WHERE summary_id = ?
         AND ordinal < ?
       ORDER BY ordinal DESC
       LIMIT 1`)
        .get(parentRow.summary_id, parentRow.ordinal);
    return resolveSummaryContent(params.db, previousRow?.summary_id, params.overrides);
}
function previousViaTimestamp(params) {
    if (typeof params.target.createdAt !== "string" || !params.target.createdAt.trim()) {
        return undefined;
    }
    const previousRow = params.db
        .prepare(`SELECT summary_id
       FROM summaries
       WHERE conversation_id = ?
         AND COALESCE(depth, 0) = ?
         AND (created_at < ? OR (created_at = ? AND summary_id < ?))
       ORDER BY created_at DESC, summary_id DESC
       LIMIT 1`)
        .get(params.target.conversationId, params.target.depth, params.target.createdAt, params.target.createdAt, params.target.summaryId);
    return resolveSummaryContent(params.db, previousRow?.summary_id, params.overrides);
}
function resolveSummaryContent(db, summaryId, overrides) {
    if (!summaryId) {
        return undefined;
    }
    const override = overrides.get(summaryId);
    if (typeof override?.content === "string" && override.content.trim()) {
        return override.content.trim();
    }
    const row = db
        .prepare(`SELECT COALESCE(content, '') AS content FROM summaries WHERE summary_id = ?`)
        .get(summaryId);
    const content = typeof row?.content === "string" ? row.content.trim() : "";
    return content ? content : undefined;
}
function resolveSummaryTimeRange(params) {
    const earliestAt = parseSqliteTimestamp(params.earliestAt) ?? parseSqliteTimestamp(params.createdAt);
    const latestAt = parseSqliteTimestamp(params.latestAt) ?? parseSqliteTimestamp(params.createdAt);
    return {
        earliestAt,
        latestAt,
    };
}
function formatSummaryTimeRange(range, timezone) {
    if (!range.earliestAt || !range.latestAt) {
        return "";
    }
    return `[${formatTimestamp(range.earliestAt, timezone)} - ${formatTimestamp(range.latestAt, timezone)}]`;
}
function formatSqliteTimestamp(value, timezone) {
    const date = parseSqliteTimestamp(value);
    if (date) {
        return formatTimestamp(date, timezone);
    }
    const fallback = typeof value === "string" ? value.trim() : String(value ?? "");
    return fallback || "unknown";
}
function parseSqliteTimestamp(value) {
    const normalized = typeof value === "string" ? value.trim() : undefined;
    if (!normalized) {
        return null;
    }
    const direct = new Date(normalized);
    if (!Number.isNaN(direct.getTime())) {
        return direct;
    }
    const sqlite = new Date(normalized.replace(" ", "T") + "Z");
    if (!Number.isNaN(sqlite.getTime())) {
        return sqlite;
    }
    return null;
}
function updateSummaryFts(db, summaryId, content) {
    try {
        const update = db
            .prepare(`UPDATE summaries_fts SET content = ? WHERE summary_id = ?`)
            .run(content, summaryId);
        if (Number(update.changes ?? 0) === 0) {
            db.prepare(`INSERT INTO summaries_fts(summary_id, content) VALUES (?, ?)`).run(summaryId, content);
        }
    }
    catch {
        // FTS repair is best-effort; the primary source of truth is summaries.
    }
}
