import { withDatabaseTransaction } from "../transaction-mutex.js";
import { parseUtcTimestampOrNull } from "./parse-utc-timestamp.js";
/**
 * Preparation attempts per pending node before the batch is treated as
 * terminally failed. Retried claims use the node's own backoff window.
 */
export const MAX_PENDING_NODE_RETRIES = 3;
/** Backoff before a failed pending node may be claimed again. */
function retryBackoffMs(retryCount) {
    return Math.min(60_000 * 2 ** Math.max(0, retryCount - 1), 900_000);
}
function toBatchRecord(row) {
    return {
        batchId: row.batch_id,
        conversationId: row.conversation_id,
        sessionKey: row.session_key,
        sessionTargetJson: row.session_target_json,
        status: row.status,
        sourceProjectionFingerprint: row.source_projection_fingerprint,
        compactableStartOrdinal: row.compactable_start_ordinal,
        compactableEndOrdinal: row.compactable_end_ordinal,
        plannedFreshTailStartOrdinal: row.planned_fresh_tail_start_ordinal,
        promptVersion: row.prompt_version,
        model: row.model,
        failureSummary: row.failure_summary,
        createdAt: parseUtcTimestampOrNull(row.created_at) ?? new Date(0),
        updatedAt: parseUtcTimestampOrNull(row.updated_at) ?? new Date(0),
        publishedAt: parseUtcTimestampOrNull(row.published_at),
    };
}
function toNodeRecord(row) {
    return {
        nodeId: row.node_id,
        batchId: row.batch_id,
        conversationId: row.conversation_id,
        kind: row.kind,
        depth: row.depth,
        status: row.status,
        ordinalStart: row.ordinal_start,
        ordinalEnd: row.ordinal_end,
        sourceFingerprint: row.source_fingerprint,
        sourceContextHash: row.source_context_hash,
        content: row.content,
        tokenCount: row.token_count,
        promptVersion: row.prompt_version,
        model: row.model,
        canonicalSummaryId: row.canonical_summary_id,
        leaseOwner: row.lease_owner,
        leaseExpiresAt: parseUtcTimestampOrNull(row.lease_expires_at),
        failureSummary: row.failure_summary,
        retryCount: row.retry_count,
        nextAttemptAfter: parseUtcTimestampOrNull(row.next_attempt_after),
        createdAt: parseUtcTimestampOrNull(row.created_at) ?? new Date(0),
        updatedAt: parseUtcTimestampOrNull(row.updated_at) ?? new Date(0),
        readyAt: parseUtcTimestampOrNull(row.ready_at),
        promotedAt: parseUtcTimestampOrNull(row.promoted_at),
    };
}
function toNodeMessageRecord(row) {
    return {
        messageId: row.message_id,
        transcriptEntryId: row.transcript_entry_id,
        identityHash: row.identity_hash,
    };
}
function toNodeChildRecord(row) {
    return {
        childNodeId: row.child_node_id,
        childSummaryId: row.child_summary_id,
    };
}
function nullableDateToIso(value) {
    return value instanceof Date ? value.toISOString() : null;
}
function normalizeNonNegativeInteger(value) {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Expected a non-negative integer, got ${value}`);
    }
    return Math.floor(value);
}
function normalizeOrdinalRange(start, end) {
    const normalizedStart = normalizeNonNegativeInteger(start);
    const normalizedEnd = normalizeNonNegativeInteger(end);
    if (normalizedEnd < normalizedStart) {
        throw new Error(`Expected ordinal end ${normalizedEnd} to be >= start ${normalizedStart}`);
    }
    return { start: normalizedStart, end: normalizedEnd };
}
/**
 * Store for hidden pending summary batches and nodes.
 *
 * Pending rows are intentionally separate from canonical summaries. The context
 * engine can prepare and retry work here without making it visible to canonical
 * summary readers, FTS, assembly, or expansion.
 */
export class PendingSummaryStore {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Execute multiple pending-summary writes atomically. */
    withTransaction(operation) {
        return withDatabaseTransaction(this.db, "BEGIN", operation);
    }
    /** Create a pending compaction batch. */
    async createBatch(input) {
        const compactableRange = normalizeOrdinalRange(input.compactableStartOrdinal, input.compactableEndOrdinal);
        this.db
            .prepare(`INSERT INTO pending_compaction_batches (
           batch_id,
           conversation_id,
           session_key,
           session_target_json,
           status,
           source_projection_fingerprint,
           compactable_start_ordinal,
           compactable_end_ordinal,
           planned_fresh_tail_start_ordinal,
           prompt_version,
           model
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(input.batchId, input.conversationId, input.sessionKey ?? null, input.sessionTargetJson ?? "{}", input.status ?? "planning", input.sourceProjectionFingerprint, compactableRange.start, compactableRange.end, typeof input.plannedFreshTailStartOrdinal === "number"
            ? normalizeNonNegativeInteger(input.plannedFreshTailStartOrdinal)
            : null, input.promptVersion, input.model);
        const batch = await this.getBatch(input.batchId);
        if (!batch) {
            throw new Error(`Failed to create pending compaction batch ${input.batchId}`);
        }
        return batch;
    }
    /** Load a pending compaction batch by id. */
    async getBatch(batchId) {
        const row = this.db
            .prepare(`SELECT batch_id,
                conversation_id,
                session_key,
                session_target_json,
                status,
                source_projection_fingerprint,
                compactable_start_ordinal,
                compactable_end_ordinal,
                planned_fresh_tail_start_ordinal,
                prompt_version,
                model,
                failure_summary,
                created_at,
                updated_at,
                published_at
         FROM pending_compaction_batches
         WHERE batch_id = ?`)
            .get(batchId);
        return row ? toBatchRecord(row) : null;
    }
    /** Update the active planning target when a pending batch is extended. */
    async updateBatchPlanningTarget(input) {
        const compactableRange = normalizeOrdinalRange(input.compactableStartOrdinal, input.compactableEndOrdinal);
        const result = this.db
            .prepare(`UPDATE pending_compaction_batches
         SET source_projection_fingerprint = ?,
             compactable_start_ordinal = ?,
             compactable_end_ordinal = ?,
             planned_fresh_tail_start_ordinal = ?,
             updated_at = datetime('now')
         WHERE batch_id = ?
           AND status IN ('planning', 'ready')`)
            .run(input.sourceProjectionFingerprint, compactableRange.start, compactableRange.end, typeof input.plannedFreshTailStartOrdinal === "number"
            ? normalizeNonNegativeInteger(input.plannedFreshTailStartOrdinal)
            : null, input.batchId);
        return Number(result.changes ?? 0) > 0;
    }
    /** Load the newest active pending compaction batch for a conversation. */
    async getActiveBatchForConversation(conversationId) {
        const row = this.db
            .prepare(`SELECT batch_id,
                conversation_id,
                session_key,
                session_target_json,
                status,
                source_projection_fingerprint,
                compactable_start_ordinal,
                compactable_end_ordinal,
                planned_fresh_tail_start_ordinal,
                prompt_version,
                model,
                failure_summary,
                created_at,
                updated_at,
                published_at
         FROM pending_compaction_batches
         WHERE conversation_id = ?
           AND status IN ('planning', 'ready', 'publishing')
         ORDER BY created_at DESC, batch_id DESC
         LIMIT 1`)
            .get(conversationId);
        return row ? toBatchRecord(row) : null;
    }
    /** Return whether this debt window already published a canonical batch. */
    async hasPublishedBatchSince(conversationId, since) {
        const row = this.db
            .prepare(`SELECT 1
         FROM pending_compaction_batches
         WHERE conversation_id = ?
           AND status = 'published'
           AND julianday(published_at) >= julianday(?)
         LIMIT 1`)
            .get(conversationId, since.toISOString());
        return row !== undefined;
    }
    /** Mark a pending compaction batch as published. */
    async markBatchPublished(input) {
        this.db
            .prepare(`UPDATE pending_compaction_batches
         SET status = 'published',
             failure_summary = NULL,
             published_at = COALESCE(?, datetime('now')),
             updated_at = datetime('now')
         WHERE batch_id = ?`)
            .run(nullableDateToIso(input.publishedAt), input.batchId);
    }
    /** Mark a pending compaction batch as stale. */
    async markBatchStale(input) {
        await this.withTransaction(async () => {
            this.db
                .prepare(`UPDATE pending_compaction_batches
           SET status = 'stale',
               failure_summary = ?,
               updated_at = datetime('now')
           WHERE batch_id = ?`)
                .run(input.failureSummary ?? null, input.batchId);
            this.db
                .prepare(`UPDATE pending_summary_nodes
           SET status = 'stale',
               lease_owner = NULL,
               lease_expires_at = NULL,
               failure_summary = ?,
               updated_at = datetime('now')
           WHERE batch_id = ?
             AND status IN ('planned', 'running', 'ready', 'failed')`)
                .run(input.failureSummary ?? null, input.batchId);
        });
    }
    /** Insert a pending summary node into a batch. */
    async insertNode(input) {
        const ordinalRange = normalizeOrdinalRange(input.ordinalStart, input.ordinalEnd);
        this.db
            .prepare(`INSERT INTO pending_summary_nodes (
           node_id,
           batch_id,
           conversation_id,
           kind,
           depth,
           status,
           ordinal_start,
           ordinal_end,
           source_fingerprint,
           source_context_hash,
           content,
           token_count,
           prompt_version,
           model
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(input.nodeId, input.batchId, input.conversationId, input.kind, normalizeNonNegativeInteger(input.depth), input.status ?? "planned", ordinalRange.start, ordinalRange.end, input.sourceFingerprint, input.sourceContextHash ?? null, input.content ?? null, typeof input.tokenCount === "number" ? normalizeNonNegativeInteger(input.tokenCount) : null, input.promptVersion, input.model);
        const node = await this.getNode(input.nodeId);
        if (!node) {
            throw new Error(`Failed to create pending summary node ${input.nodeId}`);
        }
        return node;
    }
    /** Load a pending summary node by id. */
    async getNode(nodeId) {
        const row = this.db
            .prepare(`SELECT node_id,
                batch_id,
                conversation_id,
                kind,
                depth,
                status,
                ordinal_start,
                ordinal_end,
                source_fingerprint,
                source_context_hash,
                content,
                token_count,
                prompt_version,
                model,
                canonical_summary_id,
                lease_owner,
                lease_expires_at,
                failure_summary,
                retry_count,
                next_attempt_after,
                created_at,
                updated_at,
                ready_at,
                promoted_at
         FROM pending_summary_nodes
         WHERE node_id = ?`)
            .get(nodeId);
        return row ? toNodeRecord(row) : null;
    }
    /** List pending nodes in batch order. */
    async getNodesByBatch(batchId) {
        const rows = this.db
            .prepare(`SELECT node_id,
                batch_id,
                conversation_id,
                kind,
                depth,
                status,
                ordinal_start,
                ordinal_end,
                source_fingerprint,
                source_context_hash,
                content,
                token_count,
                prompt_version,
                model,
                canonical_summary_id,
                lease_owner,
                lease_expires_at,
                failure_summary,
                retry_count,
                next_attempt_after,
                created_at,
                updated_at,
                ready_at,
                promoted_at
         FROM pending_summary_nodes
         WHERE batch_id = ?
         ORDER BY ordinal_start, depth, node_id`)
            .all(batchId);
        return rows.map(toNodeRecord);
    }
    /** Link a leaf pending node to the raw messages it summarizes. */
    async linkNodeToMessages(nodeId, messages) {
        const stmt = this.db.prepare(`INSERT INTO pending_summary_node_messages (
         node_id,
         message_id,
         ordinal,
         transcript_entry_id,
         identity_hash
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (node_id, message_id) DO UPDATE SET
         ordinal = excluded.ordinal,
         transcript_entry_id = excluded.transcript_entry_id,
         identity_hash = excluded.identity_hash`);
        for (let index = 0; index < messages.length; index++) {
            const message = messages[index];
            stmt.run(nodeId, message.messageId, index, message.transcriptEntryId ?? null, message.identityHash ?? null);
        }
    }
    /** Read the raw message coverage for a pending leaf node. */
    async getNodeMessages(nodeId) {
        const rows = this.db
            .prepare(`SELECT message_id, transcript_entry_id, identity_hash
         FROM pending_summary_node_messages
         WHERE node_id = ?
         ORDER BY ordinal`)
            .all(nodeId);
        return rows.map(toNodeMessageRecord);
    }
    /** Link a pending condensed node to pending or canonical child summaries. */
    async linkNodeToChildren(nodeId, children) {
        const stmt = this.db.prepare(`INSERT INTO pending_summary_node_children (
         node_id,
         ordinal,
         child_node_id,
         child_summary_id
       ) VALUES (?, ?, ?, ?)
       ON CONFLICT (node_id, ordinal) DO UPDATE SET
         child_node_id = excluded.child_node_id,
         child_summary_id = excluded.child_summary_id`);
        for (let index = 0; index < children.length; index++) {
            const child = children[index];
            stmt.run(nodeId, index, child.childNodeId ?? null, child.childSummaryId ?? null);
        }
    }
    /** Read the ordered children for a pending condensed node. */
    async getNodeChildren(nodeId) {
        const rows = this.db
            .prepare(`SELECT child_node_id, child_summary_id
         FROM pending_summary_node_children
         WHERE node_id = ?
         ORDER BY ordinal`)
            .all(nodeId);
        return rows.map(toNodeChildRecord);
    }
    /** Claim the oldest planned node or expired running node. */
    async claimNextPlannedNode(input) {
        return this.withTransaction(async () => {
            const nowIso = (input.now ?? new Date()).toISOString();
            const row = this.db
                .prepare(`SELECT pending_summary_nodes.node_id,
                  pending_summary_nodes.batch_id,
                  pending_summary_nodes.conversation_id,
                  pending_summary_nodes.kind,
                  pending_summary_nodes.depth,
                  pending_summary_nodes.status,
                  pending_summary_nodes.ordinal_start,
                  pending_summary_nodes.ordinal_end,
                  pending_summary_nodes.source_fingerprint,
                  pending_summary_nodes.source_context_hash,
                  pending_summary_nodes.content,
                  pending_summary_nodes.token_count,
                  pending_summary_nodes.prompt_version,
                  pending_summary_nodes.model,
                  pending_summary_nodes.canonical_summary_id,
                  pending_summary_nodes.lease_owner,
                  pending_summary_nodes.lease_expires_at,
                  pending_summary_nodes.failure_summary,
                  pending_summary_nodes.retry_count,
                  pending_summary_nodes.next_attempt_after,
                  pending_summary_nodes.created_at,
                  pending_summary_nodes.updated_at,
                  pending_summary_nodes.ready_at,
                  pending_summary_nodes.promoted_at
           FROM pending_summary_nodes
           JOIN pending_compaction_batches
             ON pending_compaction_batches.batch_id = pending_summary_nodes.batch_id
           WHERE pending_summary_nodes.conversation_id = ?
             AND pending_compaction_batches.status IN ('planning', 'ready', 'publishing')
             AND (
               pending_summary_nodes.status = 'planned'
               OR (
                 pending_summary_nodes.status = 'running'
                 AND lease_expires_at IS NOT NULL
                 AND lease_expires_at <= ?
               )
               OR (
                 pending_summary_nodes.status = 'failed'
                 AND retry_count < ${MAX_PENDING_NODE_RETRIES}
                 AND (next_attempt_after IS NULL OR next_attempt_after <= ?)
               )
             )
             AND NOT EXISTS (
               SELECT 1
               FROM pending_summary_node_children pc
               JOIN pending_summary_nodes child ON child.node_id = pc.child_node_id
               WHERE pc.node_id = pending_summary_nodes.node_id
                 AND child.status NOT IN ('ready', 'promoted')
             )
           ORDER BY pending_summary_nodes.ordinal_start,
                    pending_summary_nodes.depth,
                    pending_summary_nodes.node_id
           LIMIT 1`)
                .get(input.conversationId, nowIso, nowIso);
            if (!row) {
                return null;
            }
            const result = this.db
                .prepare(`UPDATE pending_summary_nodes
           SET status = 'running',
               lease_owner = ?,
               lease_expires_at = ?,
               failure_summary = NULL,
               updated_at = datetime('now')
           WHERE node_id = ?
             AND EXISTS (
               SELECT 1
               FROM pending_compaction_batches
               WHERE pending_compaction_batches.batch_id = pending_summary_nodes.batch_id
                 AND pending_compaction_batches.status IN ('planning', 'ready', 'publishing')
             )
             AND (
               status = 'planned'
               OR (status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
               OR (
                 status = 'failed'
                 AND retry_count < ${MAX_PENDING_NODE_RETRIES}
                 AND (next_attempt_after IS NULL OR next_attempt_after <= ?)
               )
             )
             AND NOT EXISTS (
               SELECT 1
               FROM pending_summary_node_children pc
               JOIN pending_summary_nodes child ON child.node_id = pc.child_node_id
               WHERE pc.node_id = pending_summary_nodes.node_id
                 AND child.status NOT IN ('ready', 'promoted')
             )`)
                .run(input.leaseOwner, input.leaseExpiresAt.toISOString(), row.node_id, nowIso, nowIso);
            if (Number(result.changes ?? 0) === 0) {
                return null;
            }
            return this.getNode(row.node_id);
        });
    }
    /** Mark a running pending node ready with generated content. */
    async markNodeReady(input) {
        const result = this.db
            .prepare(`UPDATE pending_summary_nodes
         SET status = 'ready',
             content = ?,
             token_count = ?,
             model = COALESCE(?, model),
             lease_owner = NULL,
             lease_expires_at = NULL,
             failure_summary = NULL,
             retry_count = 0,
             next_attempt_after = NULL,
             ready_at = COALESCE(?, datetime('now')),
             updated_at = datetime('now')
         WHERE node_id = ?
           AND status = 'running'
           AND lease_owner = ?
           AND lease_expires_at = ?`)
            .run(input.content, normalizeNonNegativeInteger(input.tokenCount), input.model ?? null, nullableDateToIso(input.readyAt), input.nodeId, input.leaseOwner, input.leaseExpiresAt.toISOString());
        return Number(result.changes ?? 0) > 0;
    }
    /**
     * Return a claimed node to the planned pool without recording a failure.
     *
     * Used when preparation was blocked before any model outcome existed (e.g.
     * the summary spend guard refused the call) — the node is not at fault, so
     * its retry bookkeeping is left untouched.
     */
    async releaseNodeClaim(input) {
        const result = this.db
            .prepare(`UPDATE pending_summary_nodes
         SET status = 'planned',
             lease_owner = NULL,
             lease_expires_at = NULL,
             updated_at = datetime('now')
         WHERE node_id = ?
           AND status = 'running'
           AND lease_owner = ?
           AND lease_expires_at = ?`)
            .run(input.nodeId, input.leaseOwner, input.leaseExpiresAt.toISOString());
        return Number(result.changes ?? 0) > 0;
    }
    /**
     * Mark a pending node failed and release its lease.
     *
     * Each failure increments the node's retry count and stamps the exponential
     * backoff window after which `claimNextPlannedNode` may claim it again.
     */
    async markNodeFailed(input) {
        return this.withTransaction(async () => {
            const node = await this.getNode(input.nodeId);
            if (!node) {
                return false;
            }
            const nextRetryCount = node.retryCount + 1;
            const nextAttemptAfter = new Date((input.now ?? new Date()).getTime() + retryBackoffMs(nextRetryCount));
            const result = this.db
                .prepare(`UPDATE pending_summary_nodes
           SET status = 'failed',
               lease_owner = NULL,
               lease_expires_at = NULL,
               failure_summary = ?,
               retry_count = ?,
               next_attempt_after = ?,
               updated_at = datetime('now')
           WHERE node_id = ?
             AND status = 'running'
             AND lease_owner = ?
             AND lease_expires_at = ?`)
                .run(input.failureSummary, nextRetryCount, nextAttemptAfter.toISOString(), input.nodeId, input.leaseOwner, input.leaseExpiresAt.toISOString());
            return Number(result.changes ?? 0) > 0;
        });
    }
    /**
     * Delete ready condensed nodes made obsolete by a wider ready sibling.
     *
     * A node is superseded when another ready/promoted node in the same batch
     * covers the same start ordinal at the same depth with a strictly wider
     * range — frontier selection always prefers the wider node. Nodes still
     * referenced as children by a live parent are kept.
     */
    async pruneSupersededNodes(batchId) {
        const result = this.db
            .prepare(`DELETE FROM pending_summary_nodes
         WHERE batch_id = ?
           AND kind = 'condensed'
           AND status = 'ready'
           AND EXISTS (
             SELECT 1
             FROM pending_summary_nodes wider
             WHERE wider.batch_id = pending_summary_nodes.batch_id
               AND wider.node_id != pending_summary_nodes.node_id
               AND wider.status IN ('ready', 'promoted')
               AND wider.depth = pending_summary_nodes.depth
               AND wider.ordinal_start = pending_summary_nodes.ordinal_start
               AND wider.ordinal_end > pending_summary_nodes.ordinal_end
           )
           AND NOT EXISTS (
             SELECT 1
             FROM pending_summary_node_children pc
             JOIN pending_summary_nodes parent ON parent.node_id = pc.node_id
             WHERE pc.child_node_id = pending_summary_nodes.node_id
               AND parent.status NOT IN ('stale', 'failed')
           )`)
            .run(batchId);
        return Number(result.changes ?? 0);
    }
    /**
     * Drop heavy summary payloads from promoted nodes after publish.
     *
     * Canonical readers use the canonical summary row; the promoted pending row
     * keeps its canonical_summary_id and metadata for doctor/crash-recovery
     * lineage, per AN 0002.
     */
    async clearPromotedPayloads(batchId) {
        const result = this.db
            .prepare(`UPDATE pending_summary_nodes
         SET content = NULL,
             updated_at = datetime('now')
         WHERE batch_id = ?
           AND status = 'promoted'
           AND content IS NOT NULL`)
            .run(batchId);
        return Number(result.changes ?? 0);
    }
    /**
     * Delete finished (stale/failed/published) batches past the retention
     * window. Node rows and link rows follow via cascade.
     */
    async deleteFinishedBatches(input) {
        // Batch timestamps are written with datetime('now') ("YYYY-MM-DD HH:MM:SS"),
        // so the cutoff must use the same format to compare lexicographically.
        const cutoff = input.olderThan.toISOString().replace("T", " ").slice(0, 19);
        const result = this.db
            .prepare(`DELETE FROM pending_compaction_batches
         WHERE conversation_id = ?
           AND status IN ('stale', 'failed', 'published')
           AND updated_at <= ?`)
            .run(input.conversationId, cutoff);
        return Number(result.changes ?? 0);
    }
    /** Record the canonical summary id created from a pending node. */
    async markNodePromoted(input) {
        this.db
            .prepare(`UPDATE pending_summary_nodes
         SET status = 'promoted',
             canonical_summary_id = ?,
             lease_owner = NULL,
             lease_expires_at = NULL,
             failure_summary = NULL,
             promoted_at = COALESCE(?, datetime('now')),
             updated_at = datetime('now')
         WHERE node_id = ?`)
            .run(input.canonicalSummaryId, nullableDateToIso(input.promotedAt), input.nodeId);
    }
}
