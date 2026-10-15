/**
 * Small generic value/format helpers shared by the engine and its extracted modules.
 *
 * Extracted from engine.ts (Phase 1 of the engine decomposition).
 */
import { createHash } from "node:crypto";
import { resolve as resolvePath } from "node:path";
export function getErrorCode(error) {
    if (!(error instanceof Error)) {
        return undefined;
    }
    const { code } = error;
    return typeof code === "string" ? code : undefined;
}
export function isMissingFileError(error) {
    const code = getErrorCode(error);
    return code === "ENOENT" || code === "ENOTDIR";
}
export function normalizeSessionFilePathForComparison(filePath) {
    const trimmed = filePath.trim();
    return trimmed ? resolvePath(trimmed) : "";
}
export function toJson(value) {
    const encoded = JSON.stringify(value);
    return typeof encoded === "string" ? encoded : "";
}
export function hashSerializedMessages(messages) {
    return createHash("sha256").update(JSON.stringify(messages)).digest("hex").slice(0, 16);
}
export function safeString(value) {
    return typeof value === "string" ? value : undefined;
}
export function formatDurationMs(durationMs) {
    return `${durationMs}ms`;
}
export function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
export function safeBoolean(value) {
    return typeof value === "boolean" ? value : undefined;
}
/** Coerce a config value to a positive integer, falling back when unset/invalid. */
export function resolvePositiveInteger(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : fallback;
}
/** Normalize an optional count: non-negative finite numbers floor to int, everything else is undefined. */
export function normalizeOptionalCount(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return undefined;
    }
    return Math.floor(value);
}
