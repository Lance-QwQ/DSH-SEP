const SHARED_KEY = Symbol.for("@martian-engineering/lossless-claw/shared-init");
function getStore() {
    const g = globalThis;
    if (!g[SHARED_KEY]) {
        g[SHARED_KEY] = new Map();
    }
    return g[SHARED_KEY];
}
export function getSharedInit(dbPath) {
    return getStore().get(dbPath);
}
export function setSharedInit(dbPath, init) {
    getStore().set(dbPath, init);
}
export function removeSharedInit(dbPath) {
    getStore().delete(dbPath);
}
/** Clear all shared init state. Intended for tests only. */
export function clearAllSharedInit() {
    getStore().clear();
}
