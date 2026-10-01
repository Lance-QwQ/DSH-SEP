/**
 * Pure planning for transcript reconciliation. No IO, no store access, no
 * logging — every decision here is unit-testable in isolation, and the
 * engine is responsible only for gathering inputs and executing plans.
 * See specs/transcript-reconciliation-by-entry-id.md (Phase 4).
 */
/**
 * Sanity bound on a single reconciliation import relative to the already
 * persisted conversation size. Guards remain even for entry-id-verified
 * imports: a declared-but-bogus epoch should not be able to flood the store.
 */
export function transcriptImportCap(existingDbCount) {
    return Math.max(Math.floor(existingDbCount * 0.2), 50);
}
export function resolveEpochRoute(params) {
    const checkpointHeaderId = params.checkpointHeaderId ?? null;
    const transcriptHeaderId = params.transcriptHeaderId ?? null;
    if (!checkpointHeaderId || !transcriptHeaderId) {
        return "undeclared";
    }
    return checkpointHeaderId === transcriptHeaderId ? "same-epoch" : "declared-rollover";
}
/**
 * Choose the resume anchor and the missing tail for an all-id transcript.
 *
 * The anchor is the checkpoint's last processed entry id when the transcript
 * still contains it, otherwise the newest entry whose id is already
 * persisted. Entries before the anchor are never imported (mid-history
 * gap-filling would append out of order); entries after it are imported
 * exactly when their id is absent.
 */
export function selectEntryIdTail(params) {
    const { entryIds, existingEntryIds } = params;
    let anchorIndex = params.lastProcessedEntryId
        ? entryIds.lastIndexOf(params.lastProcessedEntryId)
        : -1;
    if (anchorIndex < 0) {
        for (let index = entryIds.length - 1; index >= 0; index -= 1) {
            if (existingEntryIds.has(entryIds[index])) {
                anchorIndex = index;
                break;
            }
        }
        if (anchorIndex < 0) {
            return { kind: "no-id-lineage" };
        }
    }
    if (anchorIndex >= entryIds.length - 1) {
        return { kind: "at-tip", anchorIndex };
    }
    const missingIndexes = [];
    for (let index = anchorIndex + 1; index < entryIds.length; index += 1) {
        if (!existingEntryIds.has(entryIds[index])) {
            missingIndexes.push(index);
        }
    }
    if (missingIndexes.length === 0) {
        return { kind: "at-tip", anchorIndex };
    }
    return { kind: "tail", anchorIndex, missingIndexes };
}
