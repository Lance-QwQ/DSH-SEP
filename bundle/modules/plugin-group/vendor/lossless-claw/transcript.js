import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
/**
 * Symbol-keyed so the metadata survives object spread but stays invisible to
 * JSON serialization and message-content identity hashing.
 */
const TRANSCRIPT_ENTRY_META = Symbol.for("lossless-claw.transcriptEntryMeta");
export function attachTranscriptEntryMeta(message, meta) {
    message[TRANSCRIPT_ENTRY_META] = meta;
    return message;
}
export function getTranscriptEntryMeta(message) {
    const meta = message[TRANSCRIPT_ENTRY_META];
    return meta ?? null;
}
export function getTranscriptEntryId(message) {
    return getTranscriptEntryMeta(message)?.entryId ?? null;
}
export function resolveTranscriptMessageCreatedAt(message) {
    const raw = message;
    const value = raw.timestamp ?? raw.createdAt ?? raw.created_at;
    if (typeof value === "number") {
        const parsed = new Date(value);
        return Number.isFinite(parsed.getTime()) ? parsed : undefined;
    }
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value : undefined;
    }
    if (typeof value === "string" && value.trim()) {
        return value;
    }
    return getTranscriptEntryMeta(message)?.timestamp ?? undefined;
}
/**
 * The full-precision INNER source timestamp of a transcript message
 * (message.timestamp / createdAt / created_at) as resolveTranscriptMessageCreatedAt
 * reads it, BEFORE the store truncates it to a whole second. Returned as a
 * number of epoch milliseconds when parseable, else the trimmed string, else
 * null. The per-entry envelope timestamp is intentionally NOT used as a
 * fallback: OpenClaw re-stamps it fresh on every re-append, so it cannot
 * identify a frozen source event. Used only for replay-twin detection, which
 * must fail open when no inner timestamp is present.
 */
export function resolveTranscriptMessageInnerTimestamp(message) {
    const raw = message;
    const value = raw.timestamp ?? raw.createdAt ?? raw.created_at;
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value.getTime() : null;
    }
    if (typeof value === "string" && value.trim()) {
        return value.trim();
    }
    return null;
}
function normalizeEnvelopeString(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function extractEnvelopeMeta(entry) {
    return {
        entryId: normalizeEnvelopeString(entry.id) ?? normalizeEnvelopeString(entry.uuid),
        parentId: normalizeEnvelopeString(entry.parentId) ?? normalizeEnvelopeString(entry.parentUuid),
        timestamp: normalizeEnvelopeString(entry.timestamp),
    };
}
/** Read the leading session header from a historical transcript file. */
export async function readTranscriptHeader(sessionFile) {
    const empty = { sessionHeaderId: null, parentSession: null };
    try {
        const stream = createReadStream(sessionFile, { encoding: "utf8" });
        const lines = createInterface({
            input: stream,
            crlfDelay: Infinity,
        });
        try {
            for await (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) {
                    continue;
                }
                try {
                    const parsed = JSON.parse(trimmed);
                    if (parsed.type !== "session") {
                        return empty;
                    }
                    return {
                        sessionHeaderId: normalizeEnvelopeString(parsed.id),
                        parentSession: normalizeEnvelopeString(parsed.parentSession),
                    };
                }
                catch {
                    return empty;
                }
            }
        }
        finally {
            lines.close();
            stream.destroy();
        }
    }
    catch {
        return empty;
    }
    return empty;
}
export function isBootstrapMessage(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const msg = value;
    if (typeof msg.role !== "string") {
        return false;
    }
    return "content" in msg || ("command" in msg && "output" in msg);
}
function extractCanonicalBootstrapMessage(value) {
    if (isBootstrapMessage(value)) {
        return value;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const entry = value;
    if ("message" in entry) {
        if (entry.type !== undefined && entry.type !== "message") {
            return null;
        }
        if (!isBootstrapMessage(entry.message)) {
            return null;
        }
        return attachTranscriptEntryMeta(entry.message, extractEnvelopeMeta(entry));
    }
    return null;
}
export function extractBootstrapMessageCandidate(value) {
    return extractCanonicalBootstrapMessage(value);
}
export function parseBootstrapJsonl(raw, options) {
    const messages = [];
    const lines = raw.split(/\r?\n/);
    let sawNonWhitespace = false;
    let hadMalformedLine = false;
    for (const line of lines) {
        const item = line.trim();
        if (!item) {
            continue;
        }
        sawNonWhitespace = true;
        try {
            const parsed = JSON.parse(item);
            const candidate = extractBootstrapMessageCandidate(parsed);
            if (candidate) {
                messages.push(candidate);
                continue;
            }
        }
        catch {
            if (options?.strict) {
                hadMalformedLine = true;
            }
        }
    }
    return { messages, sawNonWhitespace, hadMalformedLine };
}
function selectLeafPathRecords(records) {
    if (records.length === 0) {
        return null;
    }
    const byId = new Map();
    for (const record of records) {
        if (!record.entryId) {
            return null;
        }
        byId.set(record.entryId, record);
    }
    const path = [];
    const visited = new Set();
    let current = records[records.length - 1];
    while (current) {
        const currentId = current.entryId;
        if (visited.has(currentId)) {
            return null;
        }
        visited.add(currentId);
        path.push(current);
        if (current.parentId === null) {
            break;
        }
        const parent = byId.get(current.parentId);
        if (!parent) {
            return null;
        }
        current = parent;
    }
    path.reverse();
    return path;
}
/** Load importable messages from a historical JSON/JSONL transcript file. */
export async function readLeafPathMessages(sessionFile) {
    try {
        let sawNonWhitespace = false;
        let jsonArrayMode = false;
        let jsonArrayBuffer = "";
        const records = [];
        const flattened = [];
        const stream = createReadStream(sessionFile, { encoding: "utf8" });
        const lines = createInterface({
            input: stream,
            crlfDelay: Infinity,
        });
        for await (const line of lines) {
            if (!sawNonWhitespace) {
                const trimmed = line.trim();
                if (trimmed) {
                    sawNonWhitespace = true;
                    if (trimmed.startsWith("[")) {
                        jsonArrayMode = true;
                    }
                }
            }
            if (jsonArrayMode) {
                jsonArrayBuffer += `${line}\n`;
                continue;
            }
            const item = line.trim();
            if (!item) {
                continue;
            }
            let parsed;
            try {
                parsed = JSON.parse(item);
            }
            catch {
                continue;
            }
            if (parsed !== null &&
                typeof parsed === "object" &&
                !Array.isArray(parsed) &&
                parsed.type === "session") {
                continue;
            }
            const candidate = extractBootstrapMessageCandidate(parsed);
            if (candidate) {
                flattened.push(candidate);
            }
            if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
                const meta = extractEnvelopeMeta(parsed);
                if (meta.entryId !== null || candidate) {
                    records.push({ entryId: meta.entryId, parentId: meta.parentId, message: candidate });
                }
            }
        }
        if (jsonArrayMode) {
            const trimmed = jsonArrayBuffer.trim();
            if (!trimmed) {
                return [];
            }
            try {
                const parsed = JSON.parse(trimmed);
                if (!Array.isArray(parsed)) {
                    return [];
                }
                return parsed.filter(isBootstrapMessage);
            }
            catch {
                return [];
            }
        }
        const leafPath = selectLeafPathRecords(records);
        if (leafPath) {
            return leafPath
                .map((record) => record.message)
                .filter((message) => message !== null);
        }
        return flattened;
    }
    catch {
        return [];
    }
}
