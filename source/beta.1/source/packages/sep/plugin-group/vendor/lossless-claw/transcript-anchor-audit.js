function identityKey(role, content) {
    return `${role}\0${content}`;
}
function hasDuplicate(values) {
    return new Set(values).size !== values.length;
}
function classifyStampedAnchor(message, entry) {
    const transcriptEntryId = message.transcriptEntryId;
    if (!transcriptEntryId) {
        return null;
    }
    if (!entry) {
        return {
            messageId: message.messageId,
            transcriptEntryId,
            trustState: "suspect",
            reason: "entry id missing from projection",
        };
    }
    if (entry.role !== message.role) {
        return {
            messageId: message.messageId,
            transcriptEntryId,
            trustState: "suspect",
            reason: "entry id role mismatch",
        };
    }
    if (entry.content !== message.content) {
        return {
            messageId: message.messageId,
            transcriptEntryId,
            trustState: "suspect",
            reason: "entry id content mismatch",
        };
    }
    if ((message.structuredIdentity != null || entry.structuredIdentity != null) &&
        message.structuredIdentity !== entry.structuredIdentity) {
        return {
            messageId: message.messageId,
            transcriptEntryId,
            trustState: "suspect",
            reason: "entry id structured content mismatch",
        };
    }
    const hasExplicitTrust = message.anchorTrustState === "verified" || message.anchorTrustState === "repaired";
    if (message.content.trim() === "" && message.structuredIdentity == null) {
        return {
            messageId: message.messageId,
            transcriptEntryId,
            trustState: "suspect",
            reason: "blank content cannot prove entry id",
        };
    }
    if (!hasExplicitTrust) {
        return {
            messageId: message.messageId,
            transcriptEntryId,
            trustState: "suspect",
            reason: "entry id lacks explicit trust",
        };
    }
    return {
        messageId: message.messageId,
        transcriptEntryId,
        trustState: "verified",
        reason: "entry id matches role and content",
    };
}
function inspectSequenceAlignment(params) {
    const { messages, entries } = params;
    if (messages.length === 0 || messages.length > entries.length) {
        return { aligned: false, uniqueNonEmpty: false };
    }
    const keys = [];
    for (let index = 0; index < messages.length; index += 1) {
        const message = messages[index];
        const entry = entries[index];
        if (message.role !== entry.role ||
            message.content !== entry.content ||
            message.structuredIdentity !== entry.structuredIdentity) {
            return { aligned: false, uniqueNonEmpty: false };
        }
        if (message.content.trim() === "") {
            return { aligned: true, uniqueNonEmpty: false };
        }
        keys.push(identityKey(message.role, message.content));
    }
    return { aligned: true, uniqueNonEmpty: !hasDuplicate(keys) };
}
function buildRepairProposals(params) {
    const { messages, entries, alignment } = params;
    if (!alignment.aligned || !alignment.uniqueNonEmpty) {
        return [];
    }
    const repairs = [];
    for (let index = 0; index < messages.length; index += 1) {
        const message = messages[index];
        if (message.transcriptEntryId) {
            continue;
        }
        repairs.push({
            messageId: message.messageId,
            transcriptEntryId: entries[index].entryId,
            reason: "unique non-empty sequence alignment",
        });
    }
    return repairs;
}
/**
 * Classify whether existing LCM transcript entry ids are safe anchors.
 *
 * This function is intentionally pure. It never repairs data by itself; callers
 * must persist explicit trust rows or epoch boundaries based on the result.
 */
export function classifyTranscriptAnchors(params) {
    const entriesById = new Map(params.entries.map((entry) => [entry.entryId, entry]));
    const anchorDecisions = [];
    // First classify ids that already exist in LCM. A populated id column is only
    // a candidate; it becomes trustworthy only when the source entry matches.
    for (const message of params.messages) {
        const decision = classifyStampedAnchor(message, message.transcriptEntryId ? entriesById.get(message.transcriptEntryId) : undefined);
        if (decision) {
            anchorDecisions.push(decision);
        }
    }
    const hasSuspectAnchor = anchorDecisions.some((decision) => decision.trustState === "suspect");
    if (hasSuspectAnchor) {
        return {
            classification: "legacy_prefix",
            anchorDecisions,
            repairProposals: [],
            requiresEpochBoundary: true,
        };
    }
    const allMessagesStamped = params.messages.length > 0 && params.messages.every((message) => message.transcriptEntryId);
    if (allMessagesStamped) {
        return {
            classification: "verified",
            anchorDecisions,
            repairProposals: [],
            requiresEpochBoundary: false,
        };
    }
    const alignment = inspectSequenceAlignment(params);
    const repairProposals = buildRepairProposals({
        messages: params.messages,
        entries: params.entries,
        alignment,
    });
    if (repairProposals.length > 0) {
        return {
            classification: "repairable",
            anchorDecisions,
            repairProposals,
            requiresEpochBoundary: false,
        };
    }
    return {
        classification: params.messages.length === 0 ? "verified" : "legacy_prefix",
        anchorDecisions,
        repairProposals: [],
        requiresEpochBoundary: params.messages.length > 0,
    };
}
