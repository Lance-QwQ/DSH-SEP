/**
 * Derive the total tool deadline and delegated-work deadline from existing
 * caller and plugin timeout budgets.
 */
export function createExpansionDeadline(params) {
    const dynamicToolTimeoutMs = Math.max(1, Math.floor(params.dynamicToolTimeoutMs));
    const delegationTimeoutMs = Math.max(1, Math.floor(params.delegationTimeoutMs));
    const headroomMs = Math.max(0, Math.floor(params.headroomMs));
    const totalDeadlineMs = params.nowMs + dynamicToolTimeoutMs;
    return {
        startedAtMs: params.nowMs,
        totalDeadlineMs,
        workDeadlineMs: Math.min(params.nowMs + delegationTimeoutMs, Math.max(params.nowMs, totalDeadlineMs - headroomMs)),
    };
}
/** Return the non-negative whole milliseconds left before a deadline. */
export function remainingDeadlineMs(deadlineMs, nowMs) {
    return Math.max(0, Math.floor(deadlineMs - nowMs));
}
/**
 * Split a global token cap across ranked buckets without exceeding the cap.
 * The returned array contains one positive allocation per runnable bucket.
 */
export function allocateExpansionTokenCaps(params) {
    const bucketCount = Math.max(0, Math.floor(params.bucketCount));
    const tokenCap = Math.max(1, Math.floor(params.tokenCap));
    const allocatedBucketCount = Math.min(bucketCount, tokenCap);
    if (allocatedBucketCount === 0) {
        return [];
    }
    const baseAllocation = Math.floor(tokenCap / allocatedBucketCount);
    const remainder = tokenCap % allocatedBucketCount;
    return Array.from({ length: allocatedBucketCount }, (_, index) => baseAllocation + (index < remainder ? 1 : 0));
}
