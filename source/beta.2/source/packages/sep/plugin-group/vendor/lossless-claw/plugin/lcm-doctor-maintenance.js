import { parseUtcTimestampOrNull } from "../store/parse-utc-timestamp.js";
import { CompactionMaintenanceStore } from "../store/compaction-maintenance-store.js";
import { createLcmDatabaseBackup } from "./lcm-db-backup.js";
const INACTIVE_EXAMPLE_LIMIT = 5;
/** Read-only global scan of pending compaction debt grouped by conversation activity. */
export function scanCompactionMaintenanceDebt(db, options) {
    const reasonRows = db
        .prepare(`SELECT
         conversations.active,
         COALESCE(NULLIF(TRIM(maintenance.reason), ''), 'reason unknown') AS reason,
         COUNT(*) AS count
       FROM conversation_compaction_maintenance maintenance
       JOIN conversations
         ON conversations.conversation_id = maintenance.conversation_id
       WHERE maintenance.pending = 1
       GROUP BY conversations.active, COALESCE(NULLIF(TRIM(maintenance.reason), ''), 'reason unknown')
       ORDER BY conversations.active DESC, reason ASC`)
        .all();
    const requestedLimit = options?.inactiveExampleLimit ?? INACTIVE_EXAMPLE_LIMIT;
    const inactiveExampleLimit = Number.isFinite(requestedLimit)
        ? Math.max(0, Math.floor(requestedLimit))
        : INACTIVE_EXAMPLE_LIMIT;
    const inactiveRows = db
        .prepare(`SELECT
         maintenance.conversation_id,
         conversations.session_key,
         COALESCE(NULLIF(TRIM(maintenance.reason), ''), 'reason unknown') AS reason,
         maintenance.requested_at
       FROM conversation_compaction_maintenance maintenance
       JOIN conversations
         ON conversations.conversation_id = maintenance.conversation_id
       WHERE maintenance.pending = 1
         AND conversations.active = 0
       ORDER BY maintenance.requested_at DESC, maintenance.conversation_id DESC
       LIMIT ?`)
        .all(inactiveExampleLimit);
    const reasonCounts = reasonRows.map((row) => ({
        active: row.active === 1,
        reason: row.reason,
        count: row.count,
    }));
    const activeCount = reasonCounts
        .filter((row) => row.active)
        .reduce((total, row) => total + row.count, 0);
    const inactiveCount = reasonCounts
        .filter((row) => !row.active)
        .reduce((total, row) => total + row.count, 0);
    return {
        activeCount,
        inactiveCount,
        reasonCounts,
        inactiveExamples: inactiveRows.map((row) => ({
            conversationId: row.conversation_id,
            sessionKey: row.session_key,
            reason: row.reason,
            requestedAt: parseUtcTimestampOrNull(row.requested_at),
        })),
        inactiveExamplesOmitted: Math.max(0, inactiveCount - inactiveRows.length),
    };
}
function loadMaintenanceTarget(db, conversationId) {
    return (db
        .prepare(`SELECT
           conversations.active,
           maintenance.pending,
           maintenance.running,
           maintenance.resolution_reason,
           maintenance.maintenance_revision
         FROM conversations
         LEFT JOIN conversation_compaction_maintenance maintenance
           ON maintenance.conversation_id = conversations.conversation_id
         WHERE conversations.conversation_id = ?`)
        .get(conversationId) ?? null);
}
function getTargetRefusalReason(target) {
    if (!target)
        return "conversation-not-found";
    if (target.active === 1)
        return "active-conversation";
    if (target.running === 1)
        return "running";
    if (target.pending === 1)
        return null;
    if (target.resolution_reason === "operator-ignored")
        return "already-resolved";
    return "not-pending";
}
/** Backup-first administrative close for one eligible inactive maintenance row. */
export async function closeInactiveCompactionMaintenanceDebt(params) {
    if (!params.confirmed) {
        return { kind: "refused", reason: "missing-confirmation" };
    }
    const target = loadMaintenanceTarget(params.db, params.conversationId);
    const refusalReason = getTargetRefusalReason(target);
    if (refusalReason) {
        return { kind: "refused", reason: refusalReason };
    }
    let backupPath;
    try {
        backupPath = createLcmDatabaseBackup(params.db, {
            databasePath: params.databasePath,
            label: `maintenance-close-${params.conversationId}`,
        });
    }
    catch (error) {
        return {
            kind: "refused",
            reason: "backup-failed",
            error: error instanceof Error ? error.message : String(error),
        };
    }
    if (!backupPath) {
        return { kind: "refused", reason: "backup-unavailable" };
    }
    const resolvedAt = new Date();
    let closed;
    try {
        closed = await new CompactionMaintenanceStore(params.db).closeInactiveCompactionDebt({
            conversationId: params.conversationId,
            expectedRevision: target?.maintenance_revision ?? 0,
            resolvedAt,
        });
    }
    catch (error) {
        return {
            kind: "refused",
            reason: "close-failed",
            backupPath,
            error: error instanceof Error ? error.message : String(error),
        };
    }
    if (!closed) {
        return { kind: "refused", reason: "state-changed", backupPath };
    }
    return {
        kind: "applied",
        conversationId: params.conversationId,
        backupPath,
        resolvedAt,
    };
}
