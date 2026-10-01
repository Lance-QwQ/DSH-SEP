const OPENCLAW_SENDER_KEYS = ["senderId", "senderName", "senderUsername"];
function asRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
// Copy only the three stable host-envelope fields. Values remain byte-for-byte
// intact after non-empty validation so storage is lossless and JSON formatting
// can safely escape control characters at the summarization boundary.
function normalizeSenderMetadata(value) {
    const record = asRecord(value);
    if (!record) {
        return null;
    }
    const metadata = {};
    for (const key of OPENCLAW_SENDER_KEYS) {
        const field = record[key];
        if (typeof field === "string" && field.trim().length > 0) {
            metadata[key] = field;
        }
    }
    return Object.keys(metadata).length > 0 ? metadata : null;
}
/** Extract the allowlisted sender identity from a user message's OpenClaw envelope. */
export function extractOpenClawSenderMetadata(message) {
    const record = asRecord(message);
    if (!record || record.role !== "user") {
        return null;
    }
    return normalizeSenderMetadata(record.__openclaw);
}
/** Serialize sender identity for the nullable SQLite messages column. */
export function serializeOpenClawSenderMetadata(metadata) {
    const normalized = normalizeSenderMetadata(metadata);
    return normalized ? JSON.stringify(normalized) : null;
}
/** Parse an existing SQLite sender-identity value, tolerating legacy or malformed rows. */
export function parseOpenClawSenderMetadata(value) {
    if (typeof value !== "string" || value.length === 0) {
        return null;
    }
    try {
        return normalizeSenderMetadata(JSON.parse(value));
    }
    catch {
        return null;
    }
}
/** Format sender identity for leaf-summary source text as explicitly untrusted metadata. */
export function formatOpenClawSenderForSummary(metadata) {
    const normalized = normalizeSenderMetadata(metadata);
    return normalized
        ? `speaker (untrusted metadata): ${JSON.stringify(normalized)}`
        : null;
}
