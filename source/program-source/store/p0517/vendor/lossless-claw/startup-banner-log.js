const STARTUP_BANNER_LOG_STATE = Symbol.for("@martian-engineering/lossless-claw/startup-banner-log-state");
/** Return the process-global startup banner log state. */
function getStartupBannerLogState() {
    const globalState = globalThis;
    if (!globalState[STARTUP_BANNER_LOG_STATE]) {
        globalState[STARTUP_BANNER_LOG_STATE] = {
            emitted: new Set(),
        };
    }
    return globalState[STARTUP_BANNER_LOG_STATE];
}
/** Emit a startup/config banner only once per process. */
export function logStartupBannerOnce(params) {
    const state = getStartupBannerLogState();
    if (state.emitted.has(params.key)) {
        return;
    }
    state.emitted.add(params.key);
    params.log(params.message);
}
/** Reset startup/config banner dedupe state for tests. */
export function resetStartupBannerLogsForTests() {
    getStartupBannerLogState().emitted.clear();
}
