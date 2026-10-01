import { withDatabaseTransaction } from "../transaction-mutex.js";
import { parseUtcTimestampOrNull } from "./parse-utc-timestamp.js";
function toConversationCompactionTelemetryRecord(row) {
    return {
        conversationId: row.conversation_id,
        lastObservedCacheRead: row.last_observed_cache_read,
        lastObservedCacheWrite: row.last_observed_cache_write,
        lastObservedPromptTokenCount: row.last_observed_prompt_token_count,
        lastObservedCacheHitAt: parseUtcTimestampOrNull(row.last_observed_cache_hit_at),
        lastObservedCacheBreakAt: parseUtcTimestampOrNull(row.last_observed_cache_break_at),
        cacheState: row.cache_state,
        consecutiveColdObservations: row.consecutive_cold_observations ?? 0,
        retention: row.retention,
        lastLeafCompactionAt: parseUtcTimestampOrNull(row.last_leaf_compaction_at),
        turnsSinceLeafCompaction: row.turns_since_leaf_compaction ?? 0,
        tokensAccumulatedSinceLeafCompaction: row.tokens_accumulated_since_leaf_compaction ?? 0,
        lastActivityBand: row.last_activity_band ?? "low",
        lastApiCallAt: parseUtcTimestampOrNull(row.last_api_call_at),
        lastCacheTouchAt: parseUtcTimestampOrNull(row.last_cache_touch_at),
        provider: row.provider,
        model: row.model,
        updatedAt: parseUtcTimestampOrNull(row.updated_at) ?? new Date(0),
    };
}
/**
 * Persist and query per-conversation prompt-cache telemetry used by
 * status reporting and legacy cache-aware diagnostics.
 */
export class CompactionTelemetryStore {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Execute multiple telemetry writes atomically. */
    withTransaction(fn) {
        return withDatabaseTransaction(this.db, "BEGIN", fn);
    }
    /** Load the latest persisted telemetry for a conversation. */
    async getConversationCompactionTelemetry(conversationId) {
        const row = this.db
            .prepare(`SELECT
           conversation_id,
           last_observed_cache_read,
           last_observed_cache_write,
           last_observed_prompt_token_count,
           last_observed_cache_hit_at,
           last_observed_cache_break_at,
           cache_state,
           consecutive_cold_observations,
           retention,
           last_leaf_compaction_at,
           turns_since_leaf_compaction,
           tokens_accumulated_since_leaf_compaction,
           last_activity_band,
           last_api_call_at,
           last_cache_touch_at,
           provider,
           model,
           updated_at
         FROM conversation_compaction_telemetry
         WHERE conversation_id = ?`)
            .get(conversationId);
        return row ? toConversationCompactionTelemetryRecord(row) : null;
    }
    /** Upsert the current cache telemetry snapshot for a conversation. */
    async upsertConversationCompactionTelemetry(input) {
        this.db
            .prepare(`INSERT INTO conversation_compaction_telemetry (
           conversation_id,
           last_observed_cache_read,
           last_observed_cache_write,
           last_observed_prompt_token_count,
           last_observed_cache_hit_at,
           last_observed_cache_break_at,
           cache_state,
           consecutive_cold_observations,
           retention,
           last_leaf_compaction_at,
           turns_since_leaf_compaction,
           tokens_accumulated_since_leaf_compaction,
           last_activity_band,
           last_api_call_at,
           last_cache_touch_at,
           provider,
           model,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(conversation_id) DO UPDATE SET
           last_observed_cache_read = excluded.last_observed_cache_read,
           last_observed_cache_write = excluded.last_observed_cache_write,
           last_observed_prompt_token_count = excluded.last_observed_prompt_token_count,
           last_observed_cache_hit_at = excluded.last_observed_cache_hit_at,
           last_observed_cache_break_at = excluded.last_observed_cache_break_at,
           cache_state = excluded.cache_state,
           consecutive_cold_observations = excluded.consecutive_cold_observations,
           retention = excluded.retention,
           last_leaf_compaction_at = excluded.last_leaf_compaction_at,
           turns_since_leaf_compaction = excluded.turns_since_leaf_compaction,
           tokens_accumulated_since_leaf_compaction = excluded.tokens_accumulated_since_leaf_compaction,
           last_activity_band = excluded.last_activity_band,
           last_api_call_at = excluded.last_api_call_at,
           last_cache_touch_at = excluded.last_cache_touch_at,
           provider = excluded.provider,
           model = excluded.model,
           updated_at = datetime('now')`)
            .run(input.conversationId, input.lastObservedCacheRead ?? null, input.lastObservedCacheWrite ?? null, input.lastObservedPromptTokenCount ?? null, input.lastObservedCacheHitAt?.toISOString() ?? null, input.lastObservedCacheBreakAt?.toISOString() ?? null, input.cacheState, input.consecutiveColdObservations ?? 0, input.retention ?? null, input.lastLeafCompactionAt?.toISOString() ?? null, input.turnsSinceLeafCompaction ?? 0, input.tokensAccumulatedSinceLeafCompaction ?? 0, input.lastActivityBand ?? "low", input.lastApiCallAt?.toISOString() ?? null, input.lastCacheTouchAt?.toISOString() ?? null, input.provider ?? null, input.model ?? null);
    }
}
