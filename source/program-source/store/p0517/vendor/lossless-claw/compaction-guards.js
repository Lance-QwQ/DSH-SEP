import { extractProviderAuthFailure, LcmProviderAuthError, LcmSummarySpendLimitError, } from "./summarize.js";
import { resolvePositiveInteger } from "./value-utils.js";
export class CompactionGuards {
    config;
    deps;
    // ── Circuit breaker for compaction auth failures ──
    circuitBreakerStates = new Map();
    // ── Non-auth spend guard for model-backed summarization calls ───────────
    summarySpendGuardStates = new Map();
    constructor(config, deps) {
        this.config = config;
        this.deps = deps;
    }
    getCircuitBreakerState(key) {
        let state = this.circuitBreakerStates.get(key);
        if (!state) {
            state = { failures: 0, openSince: null };
            this.circuitBreakerStates.set(key, state);
        }
        return state;
    }
    isCircuitBreakerOpen(key) {
        const state = this.circuitBreakerStates.get(key);
        if (!state || state.openSince === null)
            return false;
        const elapsed = Date.now() - state.openSince;
        if (elapsed >= this.config.circuitBreakerCooldownMs) {
            this.resetCircuitBreaker(key);
            return false;
        }
        return true;
    }
    recordCompactionAuthFailure(key) {
        const state = this.getCircuitBreakerState(key);
        state.failures++;
        const halfThreshold = Math.ceil(this.config.circuitBreakerThreshold / 2);
        if (state.failures === halfThreshold && state.failures < this.config.circuitBreakerThreshold) {
            this.deps.log.warn(`[lcm] WARNING: compaction degraded — ${state.failures}/${this.config.circuitBreakerThreshold} consecutive auth failures for ${key}`);
        }
        if (state.failures >= this.config.circuitBreakerThreshold) {
            state.openSince = Date.now();
            const cooldownMin = Math.round(this.config.circuitBreakerCooldownMs / 60000);
            this.deps.log.warn(`[lcm] CIRCUIT BREAKER OPEN: compaction disabled for ${key}. Auto-retry in ${cooldownMin}m. LCM is operating in degraded mode.`);
        }
    }
    recordCompactionSuccess(key) {
        const state = this.circuitBreakerStates.get(key);
        if (!state) {
            return;
        }
        if (state.failures > 0 || state.openSince !== null) {
            this.deps.log.info(`[lcm] compaction circuit breaker CLOSED: successful compaction for ${key} after ${state.failures} prior failures.`);
        }
        this.resetCircuitBreaker(key);
    }
    resetCircuitBreaker(key) {
        this.circuitBreakerStates.delete(key);
    }
    resolveSummarySpendGuardConfig() {
        return {
            windowMs: resolvePositiveInteger(this.config.summaryCallWindowMs, 10 * 60 * 1000),
            maxCalls: resolvePositiveInteger(this.config.summaryMaxCallsPerWindow, 24),
            backoffMs: resolvePositiveInteger(this.config.summarySpendBackoffMs, 30 * 60 * 1000),
        };
    }
    resolveSummarySpendScope(params) {
        const scope = params.scope?.trim() || "global";
        return `${params.kind}:${scope}`;
    }
    openSummarySpendBackoff(params) {
        const now = params.now ?? Date.now();
        const { backoffMs } = this.resolveSummarySpendGuardConfig();
        const state = this.summarySpendGuardStates.get(params.scopeKey) ?? {
            windowStartedAt: now,
            calls: 0,
            backoffUntil: null,
            lastReason: null,
        };
        state.backoffUntil = now + backoffMs;
        state.lastReason = params.reason;
        this.summarySpendGuardStates.set(params.scopeKey, state);
        return new Date(state.backoffUntil);
    }
    /**
     * Clear an open spend backoff for a scope, returning the prior expiry if
     * one was open. Used by manual compaction and force-driven recovery:
     * manual repair is informed consent to spend, and force-driven repair must
     * not silently no-op behind a backoff opened by an earlier automatic attempt.
     */
    clearSummarySpendBackoff(scopeKey) {
        const state = this.summarySpendGuardStates.get(scopeKey);
        if (!state?.backoffUntil || state.backoffUntil <= Date.now()) {
            return null;
        }
        const previous = new Date(state.backoffUntil);
        state.backoffUntil = null;
        state.lastReason = null;
        state.windowStartedAt = Date.now();
        state.calls = 0;
        return previous;
    }
    assertSummarySpendCallAllowed(params) {
        const now = Date.now();
        const { windowMs, maxCalls } = this.resolveSummarySpendGuardConfig();
        let state = this.summarySpendGuardStates.get(params.scopeKey);
        if (state?.backoffUntil !== null && state?.backoffUntil !== undefined) {
            if (now < state.backoffUntil) {
                throw new LcmSummarySpendLimitError({
                    scopeKey: params.scopeKey,
                    backoffUntil: new Date(state.backoffUntil),
                });
            }
            state.windowStartedAt = now;
            state.calls = 0;
            state.backoffUntil = null;
            state.lastReason = null;
        }
        if (!state || now - state.windowStartedAt >= windowMs) {
            state = {
                windowStartedAt: now,
                calls: 0,
                backoffUntil: null,
                lastReason: null,
            };
            this.summarySpendGuardStates.set(params.scopeKey, state);
        }
        if (state.calls >= maxCalls) {
            const backoffUntil = this.openSummarySpendBackoff({
                scopeKey: params.scopeKey,
                reason: params.reason,
                now,
            });
            this.deps.log.warn(`[lcm] summary spend guard opened scope=${params.scopeKey} calls=${state.calls}/${maxCalls} reason=${params.reason.replaceAll(" ", "_")} backoffUntil=${backoffUntil.toISOString()}`);
            throw new LcmSummarySpendLimitError({
                scopeKey: params.scopeKey,
                backoffUntil,
            });
        }
        state.lastReason = params.reason;
    }
    recordSummarySpendCall(params) {
        const now = Date.now();
        const { windowMs } = this.resolveSummarySpendGuardConfig();
        let state = this.summarySpendGuardStates.get(params.scopeKey);
        if (!state || now - state.windowStartedAt >= windowMs) {
            state = {
                windowStartedAt: now,
                calls: 0,
                backoffUntil: null,
                lastReason: null,
            };
            this.summarySpendGuardStates.set(params.scopeKey, state);
        }
        state.calls += 1;
        state.lastReason = params.reason;
    }
    getSummarySpendBackoffUntil(scopeKey) {
        const state = this.summarySpendGuardStates.get(scopeKey);
        if (!state?.backoffUntil) {
            return null;
        }
        return state.backoffUntil > Date.now() ? new Date(state.backoffUntil) : null;
    }
    buildSummarySpendGuardedDeps(params) {
        const complete = async (input) => {
            this.assertSummarySpendCallAllowed({
                scopeKey: params.scopeKey,
                reason: params.reason,
            });
            try {
                const result = await this.deps.complete(input);
                if (!extractProviderAuthFailure(result, { requireStructuralSignal: true })) {
                    this.recordSummarySpendCall({
                        scopeKey: params.scopeKey,
                        reason: params.reason,
                    });
                }
                return result;
            }
            catch (err) {
                if (!extractProviderAuthFailure(err)) {
                    this.recordSummarySpendCall({
                        scopeKey: params.scopeKey,
                        reason: params.reason,
                    });
                }
                throw err;
            }
        };
        return {
            ...this.deps,
            complete,
        };
    }
    guardCustomSummarize(params) {
        return async (text, aggressive, options) => {
            this.assertSummarySpendCallAllowed({
                scopeKey: params.scopeKey,
                reason: "custom summarizer call",
            });
            try {
                const result = await params.summarize(text, aggressive, options);
                this.recordSummarySpendCall({
                    scopeKey: params.scopeKey,
                    reason: "custom summarizer call",
                });
                return result;
            }
            catch (err) {
                if (!(err instanceof LcmProviderAuthError)) {
                    this.recordSummarySpendCall({
                        scopeKey: params.scopeKey,
                        reason: "custom summarizer call",
                    });
                }
                throw err;
            }
        };
    }
}
