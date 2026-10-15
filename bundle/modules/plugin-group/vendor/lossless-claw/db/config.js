import { homedir } from "os";
import { join } from "path";
import { MIN_FALLBACK_MAX_TOKENS } from "../summary-fallback.js";
/**
 * Resolve the active OpenClaw state directory.
 *
 * Precedence:
 *   1. `OPENCLAW_STATE_DIR` environment variable (set by the host gateway for
 *      non-default profiles, e.g. `~/.openclaw-vesper`)
 *   2. `~/.openclaw` (the historic single-profile default)
 *
 * All paths that used to hardcode `~/.openclaw` should call this helper so
 * that multi-profile hosts don't bleed state across profiles.
 */
export function resolveOpenclawStateDir(env = process.env) {
    const explicit = env.OPENCLAW_STATE_DIR?.trim();
    return explicit || join(homedir(), ".openclaw");
}
/**
 * Legacy default for accepted cache-aware config. Automatic compaction no
 * longer consumes this value, but the resolver keeps it stable for existing
 * plugin config and status surfaces.
 */
export const DEFAULT_CRITICAL_BUDGET_PRESSURE_RATIO = 0.90;
export const DEFAULT_SUMMARY_CALL_WINDOW_MS = 10 * 60 * 1000;
export const DEFAULT_SUMMARY_MAX_CALLS_PER_WINDOW = 24;
export const DEFAULT_SUMMARY_SPEND_BACKOFF_MS = 30 * 60 * 1000;
/** Safely coerce an unknown value to a finite number, or return undefined. */
function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string") {
        const n = Number(value);
        if (Number.isFinite(n))
            return n;
    }
    return undefined;
}
/** Safely parse a finite integer from an environment string, or return undefined.
 *  Unlike raw parseInt(), this returns undefined for NaN so ?? fallback works. */
function parseFiniteInt(value) {
    if (value === undefined)
        return undefined;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}
/** Safely parse a finite float from an environment string, or return undefined. */
function parseFiniteNumber(value) {
    if (value === undefined)
        return undefined;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}
/**
 * Well-known XML tag names used by OpenClaw memory/context plugins to wrap
 * auto-injected context blocks prepended to user messages.
 *
 * Plugins covered:
 *   - active-memory         → <active_memory_plugin>
 *   - memory-lancedb        → <relevant-memories>
 *   - hindsight-openclaw    → <hindsight_memories>
 *   - memory-core (legacy)  → <relevant_memories>
 */
const DEFAULT_STRIP_INJECTED_CONTEXT_TAGS = [
    "active_memory_plugin",
    "relevant-memories",
    "relevant_memories",
    "hindsight_memories",
];
/** Parse a comma-separated list of tag names from an env string. */
function parseStripTags(value) {
    if (value === undefined)
        return undefined;
    if (value.trim() === "")
        return []; // explicit empty = disable
    return value.split(",").map((t) => t.trim()).filter(Boolean);
}
/** Parse fallback providers from env string (format: "provider/model,provider/model"). */
function parseFallbackProviders(value) {
    if (!value?.trim())
        return undefined;
    const entries = [];
    for (const part of value.split(",")) {
        const trimmed = part.trim();
        if (!trimmed)
            continue;
        const slashIdx = trimmed.indexOf("/");
        if (slashIdx > 0 && slashIdx < trimmed.length - 1) {
            const provider = trimmed.slice(0, slashIdx).trim();
            const model = trimmed.slice(slashIdx + 1).trim();
            if (provider && model) {
                entries.push({ provider, model });
            }
        }
    }
    return entries.length > 0 ? entries : undefined;
}
/** Parse fallback providers from plugin config array (object items only). */
function toFallbackProviderArray(value) {
    if (!Array.isArray(value))
        return undefined;
    const entries = [];
    for (const item of value) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
            const p = toStr(item.provider);
            const m = toStr(item.model);
            if (p && m)
                entries.push({ provider: p, model: m });
        }
    }
    return entries.length > 0 ? entries : undefined;
}
/** Safely coerce an unknown value to a boolean, or return undefined. */
function toBool(value) {
    if (typeof value === "boolean")
        return value;
    if (value === "true")
        return true;
    if (value === "false")
        return false;
    return undefined;
}
/** Safely coerce an unknown value to a trimmed non-empty string, or return undefined. */
function toStr(value) {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
    return undefined;
}
function toProactiveThresholdCompactionMode(value) {
    const normalized = toStr(value)?.toLowerCase();
    if (normalized === "inline" || normalized === "deferred") {
        return normalized;
    }
    return undefined;
}
/** Coerce a byte threshold to a positive integer. */
function toPositiveInteger(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return undefined;
    }
    return Math.max(1, Math.floor(value));
}
/** Accept only positive integer config values. Invalid values fall back. */
function toStrictPositiveInteger(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return undefined;
    }
    if (!Number.isInteger(value) || value < 1) {
        return undefined;
    }
    return value;
}
/** Accept only integer config values at or above a minimum. Invalid values fall back. */
function toIntegerAtLeast(value, minimum) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return undefined;
    }
    if (!Number.isInteger(value) || value < minimum) {
        return undefined;
    }
    return value;
}
/** Coerce a plugin config value into a trimmed string array when possible. */
function toStrArray(value) {
    if (Array.isArray(value)) {
        const normalized = value
            .map((entry) => toStr(entry))
            .filter((entry) => typeof entry === "string");
        return normalized.length > 0 ? normalized : [];
    }
    const single = toStr(value);
    if (!single) {
        return undefined;
    }
    return single
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}
function toRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
function parseContextThresholdOverrideThreshold(value, path) {
    const threshold = toNumber(value);
    if (threshold === undefined ||
        !Number.isFinite(threshold) ||
        threshold < 0 ||
        threshold > 1) {
        throw new Error(`${path}.contextThreshold must be a finite number between 0 and 1`);
    }
    return threshold;
}
function parsePositiveIntegerMatcher(value, path) {
    if (value === undefined) {
        return undefined;
    }
    const parsed = toNumber(value);
    if (parsed === undefined ||
        !Number.isFinite(parsed) ||
        !Number.isInteger(parsed) ||
        parsed < 1) {
        throw new Error(`${path} must be a positive integer`);
    }
    return parsed;
}
function parseNonEmptyStringMatcher(value, path) {
    if (value === undefined) {
        return undefined;
    }
    const parsed = toStr(value);
    if (parsed === undefined) {
        throw new Error(`${path} must be a non-empty string`);
    }
    return parsed;
}
function toContextThresholdOverrides(value) {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new Error("contextThresholdOverrides must be an array");
    }
    return value.map((entry, index) => {
        const path = `contextThresholdOverrides[${index}]`;
        const record = toRecord(entry);
        if (!record) {
            throw new Error(`${path} must be an object`);
        }
        const matchRecord = toRecord(record.match);
        if (!matchRecord) {
            throw new Error(`${path}.match must be an object`);
        }
        const model = parseNonEmptyStringMatcher(matchRecord.model, `${path}.match.model`);
        const sessionPattern = parseNonEmptyStringMatcher(matchRecord.sessionPattern, `${path}.match.sessionPattern`);
        const modelContextWindowMin = parsePositiveIntegerMatcher(matchRecord.modelContextWindowMin, `${path}.match.modelContextWindowMin`);
        const modelContextWindowMax = parsePositiveIntegerMatcher(matchRecord.modelContextWindowMax, `${path}.match.modelContextWindowMax`);
        if (model === undefined &&
            sessionPattern === undefined &&
            modelContextWindowMin === undefined &&
            modelContextWindowMax === undefined) {
            throw new Error(`${path}.match must include at least one matcher`);
        }
        if (modelContextWindowMin !== undefined &&
            modelContextWindowMax !== undefined &&
            modelContextWindowMin > modelContextWindowMax) {
            throw new Error(`${path}.match.modelContextWindowMin must be <= modelContextWindowMax`);
        }
        const overrideFreshTailCount = record.freshTailCount !== undefined
            ? parsePositiveIntegerMatcher(record.freshTailCount, `${path}.freshTailCount`)
            : undefined;
        const overrideLeafChunkTokens = record.leafChunkTokens !== undefined
            ? parsePositiveIntegerMatcher(record.leafChunkTokens, `${path}.leafChunkTokens`)
            : undefined;
        return {
            ...(toStr(record.name) ? { name: toStr(record.name) } : {}),
            match: {
                ...(model ? { model } : {}),
                ...(modelContextWindowMin !== undefined ? { modelContextWindowMin } : {}),
                ...(modelContextWindowMax !== undefined ? { modelContextWindowMax } : {}),
                ...(sessionPattern ? { sessionPattern } : {}),
            },
            contextThreshold: parseContextThresholdOverrideThreshold(record.contextThreshold, path),
            ...(overrideFreshTailCount !== undefined ? { freshTailCount: overrideFreshTailCount } : {}),
            ...(overrideLeafChunkTokens !== undefined ? { leafChunkTokens: overrideLeafChunkTokens } : {}),
        };
    });
}
function parseEnvStrArray(value) {
    if (value === undefined) {
        return undefined;
    }
    return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}
function resolvePatternArray(params) {
    const pluginPatterns = toStrArray(params.pluginValue);
    const pluginHasPatterns = (pluginPatterns?.length ?? 0) > 0;
    if (params.envValue !== undefined) {
        return {
            patterns: parseEnvStrArray(params.envValue) ?? [],
            source: "env",
            envOverridesPluginConfig: pluginHasPatterns,
        };
    }
    if (pluginPatterns !== undefined) {
        return {
            patterns: pluginPatterns,
            source: "plugin-config",
            envOverridesPluginConfig: false,
        };
    }
    return {
        patterns: [],
        source: "default",
        envOverridesPluginConfig: false,
    };
}
export function describeLcmConfigSource(source) {
    switch (source) {
        case "env":
            return "env";
        case "plugin-config":
            return "plugin config";
        case "default":
            return "defaults";
    }
}
export function resolveLcmConfigWithDiagnostics(env = process.env, pluginConfig) {
    const pc = pluginConfig ?? {};
    const cacheAwareCompaction = toRecord(pc.cacheAwareCompaction);
    const dynamicLeafChunkTokens = toRecord(pc.dynamicLeafChunkTokens);
    const independentLogFile = toRecord(pc.independentLogFile);
    const proactiveThresholdCompactionMode = toProactiveThresholdCompactionMode(env.LCM_PROACTIVE_THRESHOLD_COMPACTION_MODE) ?? toProactiveThresholdCompactionMode(pc.proactiveThresholdCompactionMode) ?? "deferred";
    const resolvedLeafChunkTokens = parseFiniteInt(env.LCM_LEAF_CHUNK_TOKENS)
        ?? toNumber(pc.leafChunkTokens) ?? 20000;
    const resolvedBootstrapMaxTokens = parseFiniteInt(env.LCM_BOOTSTRAP_MAX_TOKENS)
        ?? toNumber(pc.bootstrapMaxTokens)
        ?? Math.max(6000, Math.floor(resolvedLeafChunkTokens * 0.3));
    const resolvedSweepMaxDepth = parseFiniteInt(env.LCM_SWEEP_MAX_DEPTH)
        ?? parseFiniteInt(env.LCM_INCREMENTAL_MAX_DEPTH)
        ?? toNumber(pc.sweepMaxDepth)
        ?? toNumber(pc.incrementalMaxDepth)
        ?? 1;
    const resolvedSummaryPrefixTargetTokens = toPositiveInteger(parseFiniteInt(env.LCM_SUMMARY_PREFIX_TARGET_TOKENS)
        ?? toNumber(pc.summaryPrefixTargetTokens));
    const resolvedMaxSweepIterations = toPositiveInteger(parseFiniteInt(env.LCM_MAX_SWEEP_ITERATIONS)
        ?? toNumber(pc.maxSweepIterations)) ?? 12;
    const resolvedSweepDeadlineMs = toPositiveInteger(parseFiniteInt(env.LCM_SWEEP_DEADLINE_MS)
        ?? toNumber(pc.sweepDeadlineMs)) ?? 120_000;
    const resolvedCompactUntilUnderDeadlineMs = toPositiveInteger(parseFiniteInt(env.LCM_COMPACT_UNTIL_UNDER_DEADLINE_MS)
        ?? toNumber(pc.compactUntilUnderDeadlineMs)) ?? 300_000;
    const resolvedSummaryCallWindowMs = toPositiveInteger(parseFiniteInt(env.LCM_SUMMARY_CALL_WINDOW_MS)
        ?? toNumber(pc.summaryCallWindowMs)) ?? DEFAULT_SUMMARY_CALL_WINDOW_MS;
    const resolvedSummaryMaxCallsPerWindow = toPositiveInteger(parseFiniteInt(env.LCM_SUMMARY_MAX_CALLS_PER_WINDOW)
        ?? toNumber(pc.summaryMaxCallsPerWindow)) ?? DEFAULT_SUMMARY_MAX_CALLS_PER_WINDOW;
    const resolvedSummarySpendBackoffMs = toPositiveInteger(parseFiniteInt(env.LCM_SUMMARY_SPEND_BACKOFF_MS)
        ?? toNumber(pc.summarySpendBackoffMs)) ?? DEFAULT_SUMMARY_SPEND_BACKOFF_MS;
    const envDelegationTimeoutMs = env.LCM_DELEGATION_TIMEOUT_MS !== undefined
        ? toNumber(env.LCM_DELEGATION_TIMEOUT_MS)
        : undefined;
    const resolvedDynamicLeafChunkMax = Math.max(resolvedLeafChunkTokens, parseFiniteInt(env.LCM_DYNAMIC_LEAF_CHUNK_TOKENS_MAX)
        ?? toNumber(dynamicLeafChunkTokens?.max)
        ?? Math.floor(resolvedLeafChunkTokens * 2));
    const resolvedHotCachePressureFactor = Math.max(1, parseFiniteNumber(env.LCM_HOT_CACHE_PRESSURE_FACTOR)
        ?? toNumber(cacheAwareCompaction?.hotCachePressureFactor)
        ?? 4);
    const resolvedHotCacheBudgetHeadroomRatio = Math.min(0.95, Math.max(0, parseFiniteNumber(env.LCM_HOT_CACHE_BUDGET_HEADROOM_RATIO)
        ?? toNumber(cacheAwareCompaction?.hotCacheBudgetHeadroomRatio)
        ?? 0.2));
    const resolvedColdCacheObservationThreshold = Math.max(1, Math.floor(parseFiniteNumber(env.LCM_COLD_CACHE_OBSERVATION_THRESHOLD)
        ?? toNumber(cacheAwareCompaction?.coldCacheObservationThreshold)
        ?? 3));
    // parseFiniteNumber and toNumber both filter out non-finite values, so the
    // `?? DEFAULT_CRITICAL_BUDGET_PRESSURE_RATIO` fallback always yields a
    // finite number. Just clamp to [0, 1].
    const resolvedCriticalBudgetPressureRatio = Math.min(1, Math.max(0, parseFiniteNumber(env.LCM_CRITICAL_BUDGET_PRESSURE_RATIO)
        ?? toNumber(cacheAwareCompaction?.criticalBudgetPressureRatio)
        ?? DEFAULT_CRITICAL_BUDGET_PRESSURE_RATIO));
    const ignoreSessionPatterns = resolvePatternArray({
        envValue: env.LCM_IGNORE_SESSION_PATTERNS,
        pluginValue: pc.ignoreSessionPatterns,
    });
    const statelessSessionPatterns = resolvePatternArray({
        envValue: env.LCM_STATELESS_SESSION_PATTERNS,
        pluginValue: pc.statelessSessionPatterns,
    });
    return {
        config: {
            enabled: env.LCM_ENABLED !== undefined
                ? env.LCM_ENABLED !== "false"
                : toBool(pc.enabled) ?? true,
            hostFallbackMode: (() => {
                const raw = env.LCM_HOST_FALLBACK_MODE?.trim() || toStr(pc.hostFallbackMode) || "";
                return raw === "capture-only" ? "capture-only" : "error";
            })(),
            databasePath: env.LCM_DATABASE_PATH
                ?? toStr(pc.dbPath)
                ?? toStr(pc.databasePath)
                ?? join(resolveOpenclawStateDir(env), "lcm.db"),
            largeFilesDir: env.LCM_LARGE_FILES_DIR?.trim()
                ?? toStr(pc.largeFilesDir)
                ?? join(resolveOpenclawStateDir(env), "lcm-files"),
            ignoreSessionPatterns: ignoreSessionPatterns.patterns,
            statelessSessionPatterns: statelessSessionPatterns.patterns,
            skipStatelessSessions: env.LCM_SKIP_STATELESS_SESSIONS !== undefined
                ? env.LCM_SKIP_STATELESS_SESSIONS === "true"
                : toBool(pc.skipStatelessSessions) ?? true,
            contextThreshold: parseFiniteNumber(env.LCM_CONTEXT_THRESHOLD)
                ?? toNumber(pc.contextThreshold) ?? 0.75,
            contextThresholdOverrides: toContextThresholdOverrides(pc.contextThresholdOverrides),
            freshTailCount: parseFiniteInt(env.LCM_FRESH_TAIL_COUNT)
                ?? toNumber(pc.freshTailCount) ?? 64,
            freshTailMaxTokens: parseFiniteInt(env.LCM_FRESH_TAIL_MAX_TOKENS)
                ?? toNumber(pc.freshTailMaxTokens) ?? undefined,
            promptAwareEviction: env.LCM_PROMPT_AWARE_EVICTION_ENABLED !== undefined
                ? env.LCM_PROMPT_AWARE_EVICTION_ENABLED === "true"
                : toBool(pc.promptAwareEviction) ?? false,
            // v4.2 §B — config + env-var propagation for the stub-tier flag.
            // Default false. Mirror the env-takes-precedence-over-config
            // pattern used by every other boolean LCM flag.
            stubLargeToolPayloads: env.LCM_STUB_LARGE_TOOL_PAYLOADS !== undefined
                ? env.LCM_STUB_LARGE_TOOL_PAYLOADS === "true"
                : toBool(pc.stubLargeToolPayloads) ?? false,
            newSessionRetainDepth: parseFiniteInt(env.LCM_NEW_SESSION_RETAIN_DEPTH)
                ?? toNumber(pc.newSessionRetainDepth) ?? 2,
            leafMinFanout: parseFiniteInt(env.LCM_LEAF_MIN_FANOUT)
                ?? toNumber(pc.leafMinFanout) ?? 8,
            condensedMinFanout: parseFiniteInt(env.LCM_CONDENSED_MIN_FANOUT)
                ?? toNumber(pc.condensedMinFanout) ?? 4,
            condensedMinFanoutHard: parseFiniteInt(env.LCM_CONDENSED_MIN_FANOUT_HARD)
                ?? toNumber(pc.condensedMinFanoutHard) ?? 2,
            sweepMaxDepth: resolvedSweepMaxDepth,
            incrementalMaxDepth: resolvedSweepMaxDepth,
            leafChunkTokens: resolvedLeafChunkTokens,
            summaryPrefixTargetTokens: resolvedSummaryPrefixTargetTokens,
            maxSweepIterations: resolvedMaxSweepIterations,
            sweepDeadlineMs: resolvedSweepDeadlineMs,
            compactUntilUnderDeadlineMs: resolvedCompactUntilUnderDeadlineMs,
            bootstrapMaxTokens: resolvedBootstrapMaxTokens,
            leafTargetTokens: parseFiniteInt(env.LCM_LEAF_TARGET_TOKENS)
                ?? toNumber(pc.leafTargetTokens) ?? 2400,
            condensedTargetTokens: parseFiniteInt(env.LCM_CONDENSED_TARGET_TOKENS)
                ?? toNumber(pc.condensedTargetTokens) ?? 2000,
            maxExpandTokens: parseFiniteInt(env.LCM_MAX_EXPAND_TOKENS)
                ?? toNumber(pc.maxExpandTokens) ?? 4000,
            largeFileTokenThreshold: parseFiniteInt(env.LCM_LARGE_FILE_TOKEN_THRESHOLD)
                ?? toNumber(pc.largeFileThresholdTokens)
                ?? toNumber(pc.largeFileTokenThreshold)
                ?? 25000,
            summaryProvider: env.LCM_SUMMARY_PROVIDER?.trim() ?? toStr(pc.summaryProvider) ?? "",
            summaryModel: env.LCM_SUMMARY_MODEL?.trim() ?? toStr(pc.summaryModel) ?? "",
            largeFileSummaryProvider: env.LCM_LARGE_FILE_SUMMARY_PROVIDER?.trim() ?? toStr(pc.largeFileSummaryProvider) ?? "",
            largeFileSummaryModel: env.LCM_LARGE_FILE_SUMMARY_MODEL?.trim() ?? toStr(pc.largeFileSummaryModel) ?? "",
            expansionProvider: env.LCM_EXPANSION_PROVIDER?.trim() ?? toStr(pc.expansionProvider) ?? "",
            expansionModel: env.LCM_EXPANSION_MODEL?.trim() ?? toStr(pc.expansionModel) ?? "",
            delegationTimeoutMs: envDelegationTimeoutMs ?? toNumber(pc.delegationTimeoutMs) ?? 120000,
            summaryTimeoutMs: parseFiniteInt(env.LCM_SUMMARY_TIMEOUT_MS)
                ?? toNumber(pc.summaryTimeoutMs) ?? 60000,
            summaryCallWindowMs: resolvedSummaryCallWindowMs,
            summaryMaxCallsPerWindow: resolvedSummaryMaxCallsPerWindow,
            summarySpendBackoffMs: resolvedSummarySpendBackoffMs,
            timezone: env.TZ ?? toStr(pc.timezone) ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
            pruneHeartbeatOk: env.LCM_PRUNE_HEARTBEAT_OK !== undefined
                ? env.LCM_PRUNE_HEARTBEAT_OK === "true"
                : toBool(pc.pruneHeartbeatOk) ?? false,
            preserveHeartbeatPoll: env.LCM_PRESERVE_HEARTBEAT_POLL !== undefined
                ? env.LCM_PRESERVE_HEARTBEAT_POLL === "true" ||
                    env.LCM_PRESERVE_HEARTBEAT_POLL === "1"
                : toBool(pc.preserveHeartbeatPoll) ?? false,
            enableSummaryThinking: env.LCM_ENABLE_SUMMARY_THINKING !== undefined
                ? env.LCM_ENABLE_SUMMARY_THINKING === "true"
                : toBool(pc.enableSummaryThinking) ?? true,
            proactiveThresholdCompactionMode,
            independentLogFile: {
                enabled: env.LCM_LOG_FILE_ENABLED !== undefined
                    ? env.LCM_LOG_FILE_ENABLED !== "false"
                    : toBool(independentLogFile?.enabled) ?? true,
                file: env.LCM_LOG_FILE?.trim() ?? toStr(independentLogFile?.file),
                maxFileBytes: toPositiveInteger(parseFiniteInt(env.LCM_LOG_MAX_FILE_BYTES))
                    ?? toPositiveInteger(toNumber(independentLogFile?.maxFileBytes))
                    ?? 100 * 1024 * 1024,
            },
            maxAssemblyTokenBudget: parseFiniteInt(env.LCM_MAX_ASSEMBLY_TOKEN_BUDGET)
                ?? toNumber(pc.maxAssemblyTokenBudget) ?? undefined,
            summaryMaxOverageFactor: parseFiniteNumber(env.LCM_SUMMARY_MAX_OVERAGE_FACTOR)
                ?? toNumber(pc.summaryMaxOverageFactor) ?? 3,
            fallbackMaxTokens: toIntegerAtLeast(parseFiniteInt(env.LCM_FALLBACK_MAX_TOKENS), MIN_FALLBACK_MAX_TOKENS)
                ?? toIntegerAtLeast(toNumber(pc.fallbackMaxTokens), MIN_FALLBACK_MAX_TOKENS) ?? 512,
            customInstructions: env.LCM_CUSTOM_INSTRUCTIONS?.trim() ?? toStr(pc.customInstructions) ?? "",
            circuitBreakerThreshold: parseFiniteInt(env.LCM_CIRCUIT_BREAKER_THRESHOLD)
                ?? toNumber(pc.circuitBreakerThreshold) ?? 5,
            circuitBreakerCooldownMs: parseFiniteInt(env.LCM_CIRCUIT_BREAKER_COOLDOWN_MS)
                ?? toNumber(pc.circuitBreakerCooldownMs) ?? 1_800_000,
            replayFloodThresholdExternal: toStrictPositiveInteger(parseFiniteInt(env.LCM_REPLAY_FLOOD_THRESHOLD_EXTERNAL))
                ?? toStrictPositiveInteger(toNumber(pc.replayFloodThresholdExternal)) ?? 3,
            replayFloodThresholdInternal: toStrictPositiveInteger(parseFiniteInt(env.LCM_REPLAY_FLOOD_THRESHOLD_INTERNAL))
                ?? toStrictPositiveInteger(toNumber(pc.replayFloodThresholdInternal)) ?? 32,
            fallbackProviders: parseFallbackProviders(env.LCM_FALLBACK_PROVIDERS)
                ?? toFallbackProviderArray(pc.fallbackProviders) ?? [],
            cacheAwareCompaction: {
                enabled: env.LCM_CACHE_AWARE_COMPACTION_ENABLED !== undefined
                    ? env.LCM_CACHE_AWARE_COMPACTION_ENABLED !== "false"
                    : toBool(cacheAwareCompaction?.enabled) ?? true,
                cacheTTLSeconds: parseFiniteInt(env.LCM_CACHE_TTL_SECONDS)
                    ?? toNumber(cacheAwareCompaction?.cacheTTLSeconds)
                    ?? 300,
                maxColdCacheCatchupPasses: parseFiniteInt(env.LCM_MAX_COLD_CACHE_CATCHUP_PASSES)
                    ?? toNumber(cacheAwareCompaction?.maxColdCacheCatchupPasses)
                    ?? 2,
                hotCachePressureFactor: resolvedHotCachePressureFactor,
                hotCacheBudgetHeadroomRatio: resolvedHotCacheBudgetHeadroomRatio,
                coldCacheObservationThreshold: resolvedColdCacheObservationThreshold,
                criticalBudgetPressureRatio: resolvedCriticalBudgetPressureRatio,
            },
            dynamicLeafChunkTokens: {
                enabled: env.LCM_DYNAMIC_LEAF_CHUNK_TOKENS_ENABLED !== undefined
                    ? env.LCM_DYNAMIC_LEAF_CHUNK_TOKENS_ENABLED === "true"
                    : toBool(dynamicLeafChunkTokens?.enabled) ?? true,
                max: resolvedDynamicLeafChunkMax,
            },
            stripInjectedContextTags: parseStripTags(env.LCM_STRIP_INJECTED_CONTEXT_TAGS)
                ?? toStrArray(pc.stripInjectedContextTags)
                ?? DEFAULT_STRIP_INJECTED_CONTEXT_TAGS,
        },
        diagnostics: {
            ignoreSessionPatternsSource: ignoreSessionPatterns.source,
            statelessSessionPatternsSource: statelessSessionPatterns.source,
            ignoreSessionPatternsEnvOverridesPluginConfig: ignoreSessionPatterns.envOverridesPluginConfig,
            statelessSessionPatternsEnvOverridesPluginConfig: statelessSessionPatterns.envOverridesPluginConfig,
        },
    };
}
/**
 * Resolve LCM configuration with three-tier precedence:
 *   1. Environment variables (highest — backward compat)
 *   2. Plugin config object (from plugins.entries.lossless-claw.config)
 *   3. Hardcoded defaults (lowest)
 */
export function resolveLcmConfig(env = process.env, pluginConfig) {
    return resolveLcmConfigWithDiagnostics(env, pluginConfig).config;
}
