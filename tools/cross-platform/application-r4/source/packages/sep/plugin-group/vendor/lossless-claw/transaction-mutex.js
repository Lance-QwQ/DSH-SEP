/**
 * Per-database async transaction mutex.
 *
 * Hotfix for https://github.com/Martian-Engineering/lossless-claw/issues/260
 *
 * Problem: Multiple async operations (from different sessions) share one
 * synchronous DatabaseSync handle. SQLite does not support nested transactions.
 * When two async code paths both try to BEGIN while an earlier BEGIN is still
 * in-flight (awaiting async work inside the transaction), the second BEGIN
 * fails with "cannot start a transaction within a transaction".
 *
 * Solution: A per-database async mutex that serializes all explicit transaction
 * entry points. Uses a WeakMap keyed on the DatabaseSync instance so each
 * database gets its own queue, and databases are garbage-collected normally.
 */
import { AsyncLocalStorage } from "node:async_hooks";
const mutexMap = new WeakMap();
const heldLockContext = new AsyncLocalStorage();
let nextSavepointId = 0;
function getOrCreateMutex(db) {
    let state = mutexMap.get(db);
    if (!state) {
        state = { tail: Promise.resolve() };
        mutexMap.set(db, state);
    }
    return state;
}
function getHeldLockDepth(db) {
    return heldLockContext.getStore()?.get(db) ?? 0;
}
function nextSavepointName() {
    nextSavepointId += 1;
    return `lcm_txn_savepoint_${nextSavepointId}`;
}
/**
 * Acquire exclusive async access to the database for a transaction.
 *
 * Direct lock acquisition is intentionally low-level and non-reentrant.
 * Callers that need nested transaction scopes should use
 * `withDatabaseTransaction()`, which reuses the held lock and isolates nested
 * work with SQLite savepoints.
 *
 * Usage:
 *   const release = await acquireTransactionLock(this.db);
 *   try {
 *     this.db.exec("BEGIN IMMEDIATE");
 *     // ... do work ...
 *     this.db.exec("COMMIT");
 *   } catch (err) {
 *     this.db.exec("ROLLBACK");
 *     throw err;
 *   } finally {
 *     release();
 *   }
 *
 * Returns a release function that MUST be called in a finally block.
 */
export function acquireTransactionLock(db) {
    const mutex = getOrCreateMutex(db);
    let releaseResolve;
    const releasePromise = new Promise((resolve) => {
        releaseResolve = resolve;
    });
    // Capture the current tail — we wait on it
    const waitOn = mutex.tail;
    // Advance the tail — next acquirer will wait on our release
    mutex.tail = releasePromise;
    // Wait for the previous holder to release, then return our release fn
    return waitOn.then(() => releaseResolve);
}
/** Raised when exclusive DB access does not become available before the deadline. */
export class DatabaseTransactionTimeoutError extends Error {
    constructor(timeoutMs) {
        super(`Timed out after ${timeoutMs}ms waiting for exclusive database access.`);
        this.name = "DatabaseTransactionTimeoutError";
    }
}
/**
 * Acquire exclusive DB access, but give up after the provided timeout.
 *
 * If acquisition completes after the timeout fires, this helper releases the
 * late-acquired slot immediately so the mutex queue does not get stuck behind
 * an abandoned waiter.
 */
export async function acquireTransactionLockWithTimeout(db, timeoutMs) {
    const normalizedTimeoutMs = Math.floor(timeoutMs);
    const acquisition = acquireTransactionLock(db);
    if (!Number.isFinite(normalizedTimeoutMs) || normalizedTimeoutMs < 0) {
        return acquisition;
    }
    let timeoutHandle;
    try {
        return await Promise.race([
            acquisition,
            new Promise((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    reject(new DatabaseTransactionTimeoutError(normalizedTimeoutMs));
                }, normalizedTimeoutMs);
            }),
        ]);
    }
    catch (error) {
        acquisition.then((release) => release(), () => { });
        throw error;
    }
    finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}
/**
 * Run work while holding the per-database mutex, without opening a transaction.
 *
 * Use this when the caller must wait for all in-flight transactions to finish
 * before performing work on the shared connection, but needs to control the
 * exact transaction boundaries manually.
 */
export async function withExclusiveDatabaseLock(db, options, operation) {
    const release = await acquireTransactionLockWithTimeout(db, options.timeoutMs);
    try {
        const heldLocks = new Map(heldLockContext.getStore() ?? []);
        heldLocks.set(db, (heldLocks.get(db) ?? 0) + 1);
        return await heldLockContext.run(heldLocks, async () => operation());
    }
    finally {
        release();
    }
}
/**
 * Run an operation inside a serialized database transaction.
 *
 * The first scope on an async path acquires the per-database mutex and opens
 * the requested transaction mode. Nested scopes on the same database reuse the
 * held lock and isolate their work with a savepoint instead of hanging.
 */
export async function withDatabaseTransaction(db, beginStatement, operation) {
    if (getHeldLockDepth(db) > 0) {
        const savepointName = nextSavepointName();
        db.exec(`SAVEPOINT ${savepointName}`);
        try {
            const result = await operation();
            db.exec(`RELEASE SAVEPOINT ${savepointName}`);
            return result;
        }
        catch (error) {
            db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
            db.exec(`RELEASE SAVEPOINT ${savepointName}`);
            throw error;
        }
    }
    const release = await acquireTransactionLock(db);
    try {
        const heldLocks = new Map(heldLockContext.getStore() ?? []);
        heldLocks.set(db, (heldLocks.get(db) ?? 0) + 1);
        return await heldLockContext.run(heldLocks, async () => {
            db.exec(beginStatement);
            try {
                const result = await operation();
                db.exec("COMMIT");
                return result;
            }
            catch (error) {
                db.exec("ROLLBACK");
                throw error;
            }
        });
    }
    finally {
        release();
    }
}
