import { createHash } from "node:crypto";
function defaultCanonicalSummaryIdForNode(node) {
    const digest = createHash("sha256")
        .update(`${node.batchId}\0${node.nodeId}\0${node.sourceFingerprint}`)
        .digest("hex")
        .slice(0, 16);
    return `sum_${digest}`;
}
function requireReadyNode(node) {
    if (node.status !== "ready" && node.status !== "promoted") {
        throw new Error(`Pending summary node ${node.nodeId} is not ready for publish`);
    }
    if (node.status === "ready" && (node.content == null || node.tokenCount == null)) {
        throw new Error(`Pending summary node ${node.nodeId} is ready without summary content`);
    }
}
function rangeFromDates(dates) {
    let earliestAt;
    let latestAt;
    for (const date of dates) {
        if (!(date instanceof Date)) {
            continue;
        }
        if (!earliestAt || date < earliestAt) {
            earliestAt = date;
        }
        if (!latestAt || date > latestAt) {
            latestAt = date;
        }
    }
    return {
        ...(earliestAt ? { earliestAt } : {}),
        ...(latestAt ? { latestAt } : {}),
    };
}
/**
 * Publishes a ready pending summary frontier into canonical summary tables.
 *
 * The publisher canonicalizes every pending ancestor needed by the selected
 * frontier, links lineage, swaps the active context ranges to the frontier
 * summaries, and marks pending rows promoted inside one store transaction.
 */
export class PendingSummaryPublisher {
    conversationStore;
    pendingSummaryStore;
    summaryStore;
    canonicalSummaryIdForNode;
    constructor(options) {
        this.conversationStore = options.conversationStore;
        this.pendingSummaryStore = options.pendingSummaryStore;
        this.summaryStore = options.summaryStore;
        this.canonicalSummaryIdForNode =
            options.canonicalSummaryIdForNode ?? defaultCanonicalSummaryIdForNode;
    }
    /** Publish a ready frontier and return the canonical ids created or reused. */
    async publishReadyFrontier(input) {
        if (input.frontierNodeIds.length === 0) {
            throw new Error("Cannot publish an empty pending summary frontier");
        }
        const batchBeforeTransaction = await this.pendingSummaryStore.getBatch(input.batchId);
        if (!batchBeforeTransaction) {
            throw new Error(`Pending compaction batch ${input.batchId} was not found`);
        }
        if (batchBeforeTransaction.status === "published") {
            return this.readPublishedResult(input);
        }
        if (input.expectedSourceProjectionFingerprint != null &&
            batchBeforeTransaction.sourceProjectionFingerprint !== input.expectedSourceProjectionFingerprint) {
            await this.pendingSummaryStore.markBatchStale({
                batchId: input.batchId,
                failureSummary: "source projection fingerprint changed before publish",
            });
            throw new Error(`Pending compaction batch ${input.batchId} source fingerprint is stale`);
        }
        return this.summaryStore.withTransaction(async () => {
            const batch = await this.pendingSummaryStore.getBatch(input.batchId);
            if (!batch) {
                throw new Error(`Pending compaction batch ${input.batchId} was not found`);
            }
            if (batch.status === "published") {
                return this.readPublishedResult(input);
            }
            const frontierNodes = [];
            for (const nodeId of input.frontierNodeIds) {
                const node = await this.pendingSummaryStore.getNode(nodeId);
                if (!node) {
                    throw new Error(`Pending summary frontier node ${nodeId} was not found`);
                }
                if (node.batchId !== input.batchId) {
                    throw new Error(`Pending summary frontier node ${nodeId} belongs to another batch`);
                }
                requireReadyNode(node);
                frontierNodes.push(node);
            }
            const orderedAncestors = await this.collectPendingAncestors(frontierNodes);
            const canonicalIdsByNodeId = new Map();
            for (const node of orderedAncestors) {
                const canonicalSummaryId = node.canonicalSummaryId ?? this.canonicalSummaryIdForNode(node);
                canonicalIdsByNodeId.set(node.nodeId, canonicalSummaryId);
            }
            for (const node of orderedAncestors) {
                const canonicalSummaryId = canonicalIdsByNodeId.get(node.nodeId);
                if (!canonicalSummaryId) {
                    throw new Error(`Missing canonical id for pending summary node ${node.nodeId}`);
                }
                await this.insertCanonicalNode(node, canonicalSummaryId, canonicalIdsByNodeId);
                await this.pendingSummaryStore.markNodePromoted({
                    nodeId: node.nodeId,
                    canonicalSummaryId,
                    promotedAt: input.publishedAt,
                });
            }
            const frontierSummaryIds = frontierNodes.map((node) => {
                const canonicalSummaryId = canonicalIdsByNodeId.get(node.nodeId);
                if (!canonicalSummaryId) {
                    throw new Error(`Missing canonical id for frontier node ${node.nodeId}`);
                }
                return canonicalSummaryId;
            });
            await this.summaryStore.replaceContextRangesWithSummaries({
                conversationId: batch.conversationId,
                replacements: frontierNodes
                    .map((node, index) => ({
                    startOrdinal: node.ordinalStart,
                    endOrdinal: node.ordinalEnd,
                    summaryId: frontierSummaryIds[index],
                }))
                    .sort((a, b) => a.startOrdinal - b.startOrdinal),
            });
            await this.pendingSummaryStore.markBatchPublished({
                batchId: input.batchId,
                publishedAt: input.publishedAt,
            });
            return {
                batchId: input.batchId,
                canonicalSummaryIds: orderedAncestors.map((node) => canonicalIdsByNodeId.get(node.nodeId)),
                frontierSummaryIds,
            };
        });
    }
    async readPublishedResult(input) {
        const frontierNodes = [];
        for (const nodeId of input.frontierNodeIds) {
            const node = await this.pendingSummaryStore.getNode(nodeId);
            if (!node?.canonicalSummaryId) {
                throw new Error(`Published frontier node ${nodeId} has no canonical summary id`);
            }
            frontierNodes.push(node);
        }
        const orderedAncestors = await this.collectPendingAncestors(frontierNodes);
        return {
            batchId: input.batchId,
            canonicalSummaryIds: orderedAncestors
                .map((node) => node.canonicalSummaryId)
                .filter((summaryId) => typeof summaryId === "string"),
            frontierSummaryIds: frontierNodes.map((node) => node.canonicalSummaryId),
        };
    }
    async collectPendingAncestors(frontierNodes) {
        const visited = new Set();
        const ordered = [];
        const visit = async (node) => {
            if (visited.has(node.nodeId)) {
                return;
            }
            visited.add(node.nodeId);
            requireReadyNode(node);
            const children = await this.readChildSummaryLinks(node.nodeId);
            for (const childNodeId of children
                .filter((child) => child.kind === "pending")
                .map((child) => child.childNodeId)) {
                const childNode = await this.pendingSummaryStore.getNode(childNodeId);
                if (!childNode) {
                    throw new Error(`Pending child summary node ${childNodeId} was not found`);
                }
                await visit(childNode);
            }
            ordered.push(node);
        };
        for (const node of frontierNodes) {
            await visit(node);
        }
        return ordered;
    }
    async insertCanonicalNode(node, canonicalSummaryId, canonicalIdsByNodeId) {
        const existing = await this.summaryStore.getSummary(canonicalSummaryId);
        if (node.kind === "leaf") {
            const messageIds = (await this.pendingSummaryStore.getNodeMessages(node.nodeId)).map((message) => message.messageId);
            if (!existing) {
                await this.summaryStore.insertSummary({
                    summaryId: canonicalSummaryId,
                    conversationId: node.conversationId,
                    kind: node.kind,
                    depth: node.depth,
                    content: node.content ?? "",
                    tokenCount: node.tokenCount ?? 0,
                    model: node.model,
                    ...(await this.buildLeafCoverageMetadata(messageIds)),
                });
            }
            await this.summaryStore.linkSummaryToMessages(canonicalSummaryId, messageIds);
            return;
        }
        const childLinks = await this.readChildSummaryLinks(node.nodeId);
        const parentSummaryIds = childLinks.map((child) => {
            if (child.kind === "pending") {
                const canonicalChildId = canonicalIdsByNodeId.get(child.childNodeId);
                if (!canonicalChildId) {
                    throw new Error(`Missing canonical id for pending child node ${child.childNodeId}`);
                }
                return canonicalChildId;
            }
            return child.summaryId;
        });
        if (!existing) {
            await this.summaryStore.insertSummary({
                summaryId: canonicalSummaryId,
                conversationId: node.conversationId,
                kind: node.kind,
                depth: node.depth,
                content: node.content ?? "",
                tokenCount: node.tokenCount ?? 0,
                model: node.model,
                ...(await this.buildCondensedCoverageMetadata(parentSummaryIds)),
            });
        }
        await this.summaryStore.linkSummaryToParents(canonicalSummaryId, parentSummaryIds);
    }
    async buildLeafCoverageMetadata(messageIds) {
        const messages = [];
        for (const messageId of messageIds) {
            const message = await this.conversationStore.getMessageById(messageId);
            if (message) {
                messages.push(message);
            }
        }
        return {
            ...rangeFromDates(messages.map((message) => message.createdAt)),
            descendantCount: 0,
            descendantTokenCount: 0,
            sourceMessageTokenCount: messages.reduce((total, message) => total + Math.max(0, Math.floor(message.tokenCount)), 0),
        };
    }
    async buildCondensedCoverageMetadata(parentSummaryIds) {
        const parents = [];
        for (const summaryId of parentSummaryIds) {
            const summary = await this.summaryStore.getSummary(summaryId);
            if (summary) {
                parents.push(summary);
            }
        }
        return {
            ...rangeFromDates(parents.flatMap((summary) => [
                summary.earliestAt ?? summary.createdAt,
                summary.latestAt ?? summary.createdAt,
            ])),
            descendantCount: parents.reduce((total, summary) => total + Math.max(0, summary.descendantCount) + 1, 0),
            descendantTokenCount: parents.reduce((total, summary) => total + Math.max(0, summary.tokenCount) + Math.max(0, summary.descendantTokenCount), 0),
            sourceMessageTokenCount: parents.reduce((total, summary) => total + Math.max(0, summary.sourceMessageTokenCount), 0),
        };
    }
    async readChildSummaryLinks(nodeId) {
        const children = await this.pendingSummaryStore.getNodeChildren(nodeId);
        const links = [];
        for (const child of children) {
            if (typeof child.childNodeId === "string") {
                links.push({ kind: "pending", childNodeId: child.childNodeId });
                continue;
            }
            if (typeof child.childSummaryId === "string") {
                links.push({ kind: "canonical", summaryId: child.childSummaryId });
            }
        }
        return links;
    }
}
