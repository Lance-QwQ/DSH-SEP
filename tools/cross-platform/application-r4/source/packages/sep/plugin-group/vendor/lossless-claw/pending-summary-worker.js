/**
 * Deterministic summary payload used when safety sanitation removes an entire
 * pending source. Canonical leaf lineage still links to every raw source
 * message, so this marker closes the publish range without inventing content
 * or discarding the lossless expansion path. Condensed marker nodes preserve
 * those leaf links through their parent lineage.
 */
export const PENDING_EMPTY_SOURCE_COVERAGE_CONTENT = "[Lossless Claw empty-source coverage marker: no summarizable text remained after safety sanitization; no model was called, and the raw source remains linked for retrieval.]";
/** Summary provenance recorded for deterministic empty-source coverage. */
export const PENDING_EMPTY_SOURCE_COVERAGE_MODEL = "lossless-claw/empty-source";
/**
 * Explicit signal from a source loader that lineage was verified but safety
 * sanitation removed every summarizable byte.
 *
 * A plain empty string is not sufficient evidence: it can also indicate
 * missing links or records and remains a retryable preparation failure.
 */
export class PendingSummaryEmptySourceCoverage extends Error {
    constructor() {
        super("pending summary source sanitized empty");
        this.name = "PendingSummaryEmptySourceCoverage";
    }
}
function describeError(error) {
    if (error instanceof Error && typeof error.message === "string" && error.message.length > 0) {
        return error.message;
    }
    if (typeof error === "string" && error.length > 0) {
        return error;
    }
    return "unknown pending summary preparation failure";
}
function normalizeLeaseMs(value) {
    if (Number.isFinite(value) && value > 0) {
        return Math.floor(value);
    }
    return 60_000;
}
function normalizeTokenCount(value) {
    if (Number.isFinite(value) && value >= 0) {
        return Math.floor(value);
    }
    return 0;
}
/**
 * Claims and prepares one hidden pending summary node.
 *
 * This worker intentionally performs the LLM call after `claimNextPlannedNode`
 * returns. The claim and result writes are short store operations; source
 * loading and summarization happen between them.
 */
export class PendingSummaryPreparationWorker {
    store;
    leaseOwner;
    leaseMs;
    now;
    loadSourceText;
    summarize;
    estimateTokens;
    isAuthFailure;
    isSpendLimitFailure;
    constructor(options) {
        this.store = options.store;
        this.leaseOwner = options.leaseOwner;
        this.leaseMs = normalizeLeaseMs(options.leaseMs);
        this.now = options.now ?? (() => new Date());
        this.loadSourceText = options.loadSourceText;
        this.summarize = options.summarize;
        this.estimateTokens = options.estimateTokens;
        this.isAuthFailure = options.isAuthFailure ?? (() => false);
        this.isSpendLimitFailure = options.isSpendLimitFailure ?? (() => false);
    }
    /** Prepare one pending summary node for a conversation, if work is claimable. */
    async prepareOne(input) {
        const claimedAt = this.now();
        const node = await this.store.claimNextPlannedNode({
            conversationId: input.conversationId,
            leaseOwner: this.leaseOwner,
            leaseExpiresAt: new Date(claimedAt.getTime() + this.leaseMs),
            now: claimedAt,
        });
        if (!node) {
            return { status: "idle" };
        }
        if (!node.leaseExpiresAt) {
            return { status: "idle" };
        }
        try {
            const sourceText = (await this.loadSourceText(node)).trim();
            if (!sourceText) {
                throw new Error("empty pending summary source");
            }
            const content = (await this.summarize(sourceText, node)).trim();
            if (!content) {
                throw new Error("empty pending summary content");
            }
            const saved = await this.store.markNodeReady({
                nodeId: node.nodeId,
                leaseOwner: this.leaseOwner,
                leaseExpiresAt: node.leaseExpiresAt,
                content,
                tokenCount: normalizeTokenCount(this.estimateTokens(content)),
                readyAt: this.now(),
            });
            if (!saved) {
                return { status: "idle" };
            }
            return { status: "prepared", nodeId: node.nodeId };
        }
        catch (error) {
            if (error instanceof PendingSummaryEmptySourceCoverage) {
                const saved = await this.store.markNodeReady({
                    nodeId: node.nodeId,
                    leaseOwner: this.leaseOwner,
                    leaseExpiresAt: node.leaseExpiresAt,
                    content: PENDING_EMPTY_SOURCE_COVERAGE_CONTENT,
                    tokenCount: normalizeTokenCount(this.estimateTokens(PENDING_EMPTY_SOURCE_COVERAGE_CONTENT)),
                    model: PENDING_EMPTY_SOURCE_COVERAGE_MODEL,
                    readyAt: this.now(),
                });
                if (!saved) {
                    return { status: "idle" };
                }
                return { status: "prepared", nodeId: node.nodeId, emptySource: true };
            }
            // A spend-guard refusal is not a node failure: no model outcome exists,
            // so the claim is released untouched and the node stays planned.
            if (this.isSpendLimitFailure(error)) {
                await this.store.releaseNodeClaim({
                    nodeId: node.nodeId,
                    leaseOwner: this.leaseOwner,
                    leaseExpiresAt: node.leaseExpiresAt,
                });
                return { status: "spend-limited", nodeId: node.nodeId };
            }
            const failureSummary = describeError(error);
            const authFailure = this.isAuthFailure(error);
            const saved = await this.store.markNodeFailed({
                nodeId: node.nodeId,
                leaseOwner: this.leaseOwner,
                leaseExpiresAt: node.leaseExpiresAt,
                failureSummary,
            });
            if (!saved) {
                return { status: "idle" };
            }
            return {
                status: "failed",
                nodeId: node.nodeId,
                failureSummary,
                ...(authFailure ? { authFailure } : {}),
            };
        }
    }
}
