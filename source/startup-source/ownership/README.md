# Windows process-owned owner files

`owner-file.mjs` is the reusable Node.js 24 Windows implementation. It operates only on an ownership metadata file and its sibling `<owner>.sep-owner` directory; it never restores application data or kills an owner process.

```js
const owner = await acquireOwnerFile({
  path: absoluteCanonicalLocalOwnerPath,
  payload: { ...existingMetadata, pid: process.pid },
  validatePrior: async (prior, { bytes }) => {
    // Validate the component-specific schema and its authoritative journal.
    // Throw or return false to refuse recovery.
  },
});
// owner.bytes is already durable UTF-8 text; do not write it again.
// owner.handle is an ordinary FileHandle, retained for existing callers.
await owner.assertOwned();
await owner.release();
// Use release({ remove: false }) only when deliberately retaining poisoned
// metadata. It releases the OS lease but keeps the owner record.
```

The published JSON preserves payload fields and adds `sepOwner: { schema: 1, pid, startTimeUtcTicks }`. `archived` contains the actual retired legacy metadata paths. `close` aliases `release`. Callers must release the returned owner object, not merely close its FileHandle.

`lease.sqlite` holds a `BEGIN IMMEDIATE` transaction for the entire owner lifetime. Windows releases SQLite byte-range locks when that process exits, including abnormal termination. Metadata is a durable record, not the admission lock. An alive owner, native busy lease, inaccessible process identity, or invalid source remains protected.

Publication uses a second SQLite database with `synchronous=FULL` to commit a specific intent before creating a staging file. Complete staging bytes are flushed before a no-replace hard-link publication. The temporary second link is immediately removed. Crash recovery accepts two links only when the receipt binds the exact target, staging path, bytes, and process creation identity. Partial staging files are attributable to the durable intent and recoverable; unrelated or malformed legacy files are never silently removed.

The old metadata is archived only after caller validation and a Windows process-identity check. Absence requires both a successful CIM query showing no process and Node's `kill(pid, 0)` returning `ESRCH`. Reused PIDs are distinguished by exact process creation ticks; legacy records without that field cannot use a living PID as proof of staleness. No mtime heuristic is used. Permission or inspection uncertainty refuses takeover.

`inspectOwnerFile({ path, validatePrior })` returns `absent`, `stale`, `alive`, or `unknown`. It never creates absent owner state and never changes owner metadata. When a lease database already exists, it briefly attempts a native transaction to detect a live holder. This is an admission probe, not a snapshot/data recovery operation.

Error codes: `OWNER_LEASE_BUSY`, `OWNER_ALIVE`, `OWNER_UNKNOWN`, `OWNER_INVALID`, `OWNER_PATH`, and `OWNER_CHANGED`. Callers may map these to their existing component error codes while preserving `cause` for diagnostics.

Windows local fixed/removable/RAM volumes with canonical paths are supported. Network paths, reparse/junction redirects, multiple hard links without a matching publication receipt, corrupted ledgers, and unknown identity are refused. Tests use directory junctions because file-symlink creation privilege is unavailable in this environment; those two Windows facilities should not be conflated in coverage claims.

The real-process test command is `node --test owner-file.test.mjs`. `final-tests.log` records the latest run. Test-created processes and metadata live under `fixtures/`; no daily instance or private data is used. Production PowerShell is read-only process/volume inspection; only the test harness terminates its own explicitly spawned child process.

The core behavior was developed from failing tests. Additional failures caught and fixed: the read-only preflight rejected an explained two-link publication interruption; empty receipt databases created just before a crash were misclassified; and a regular publication exception left its own live-process intent blocking same-process retry.
