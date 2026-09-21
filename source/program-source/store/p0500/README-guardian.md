# Independent owned-process guardian

`src/guardian.mjs` runs in the independent recovery runtime. It must not run inside the DSH child it supervises. No package dependencies or model API calls are used.

## Interface

```js
import { openGuardian } from './src/guardian.mjs';

const guardian = await openGuardian({
  controlRoot: absoluteIndependentControlDirectory,
  command: { file: absoluteNodeExecutable, args: [absoluteHostBootstrap], cwd: absoluteControlCwd },
  restartLimit: 2,
  restartWindowMs: 600000,
  restartDelayMs: 1000,
  shutdownTimeoutMs: 10000,
  readinessTimeoutMs: 30000,
  beforeStart: async ({ generation, automatic }) => {
    // Controller confirms project/maintenance/ownership prerequisites for this launch.
    return await controllerAllowsLaunch(generation, automatic);
  },
  afterExit: async ({ generation, code, signal, forced, errorCode }) => {
    // Must durably fence the old task generation and record unknown operations here.
    await controllerRecordsExit({ generation, code, signal, forced, errorCode });
  },
  onEvent: event => metadataLogger(event),
});

await guardian.start();
const metadata = guardian.status();
await guardian.stop();
await guardian.close();
```

- `start()` resolves a metadata status with `phase: running` only after readiness. A prerequisite refusal or exhausted budget resolves `blocked` / `exhausted` without a child. A child failing before readiness rejects with `GUARDIAN_NOT_READY`; automatic recovery, if allowed, remains bounded in the background. Opening a guardian never starts it by itself.
- Default readiness is child IPC `{type: 'dsh-guardian-ready'}`. The DSH bootstrap must emit it only after Loader and mandatory services are healthy. Alternatively supply `readiness: async ({child, generation, signal}) => true`; it receives the owned child handle and an abort signal. False does not mean ready and expires at the deadline. Late readiness after cancellation cannot revive that generation.
- Default graceful stop sends child IPC `{type: 'dsh-daily-shutdown'}`. Alternatively supply `gracefulStop: async ({child, generation}) => void`. Completing this callback is not shutdown proof: `stop()` waits for the owned child's `close` event and stream drainage. Timeout causes forced termination using the same owned handle, and `lastExit.forced` is true. A forced exit is never reported as a natural drain.
- `beforeStart` defaults to refusal. Exceptions or its `prerequisiteTimeoutMs` deadline (default 10 seconds) result in `blocked` without an automatic retry timer. Only literal `true` authorizes spawning. A manual stop that arrives during this callback fences the pending launch before it can create a child.
- `afterExit` is awaited after a durable exit record and before any automatic replacement is scheduled. Failure or `afterExitTimeoutMs` expiry (default 10 seconds) results in `blocked`. This is the required integration seam for unknown-result recording and old-generation invalidation.
- `onEvent` receives metadata only. It is best-effort, not awaited, and cannot authorize starts or replace `afterExit` fencing. Its errors do not propagate into lifecycle code.
- `status()` is synchronous, returns a copy, and includes `intent`, `phase`, `generation`, `pid`, `restarts`, `restartCount`, byte counts and `lastExit`. It contains no command environment, command arguments, stdout, stderr or private document body.
- `close()` stops an owned running child, waits for lifecycle work, and releases this runtime's exact owner token after a healthy close. Closing an idle/exhausted guardian retains its intent and budget. A faulted guardian preserves its lock for controlled recovery.
- `command.env`, when provided, is the complete child environment; omission inherits the runtime environment. It is never written to journal/events. Callers must supply only their authorized launcher environment and never pass the project directory as a substitute control directory.

## Persistent lifecycle and boundaries

The guardian owns `controlRoot/guardian/owner.json` and `journal.jsonl`. The owner is exclusively created. The append-only journal has a sequence/hash chain; each lifecycle record is synced before the operation it authorizes. `launch-reserved` durably records active intent, generation and consumed automatic retry before `spawn()`. The manual stop intent is synced before any graceful-stop callback or IPC message.

The journal is limited to 8 MiB and fails closed when full. There is no automatic truncation or history reset. Partial, malformed or hash-inconsistent history is preserved and refused on reopening. Concurrent or changed owner tokens, replaced journal identity and multi-linked journal files are refused. A runtime storage failure fences future starts and forces termination of its own child handle; this is fault containment, not successful business cleanup. The underlying filesystem/OS must honor sync; no claim is made against storage hardware that falsely acknowledges durable writes.

An initial launch is followed by at most two automatic launches within the default rolling ten-minute window. Spawn failure, readiness timeout and abnormal process exit consume the same budget. The budget remains in the journal across clean reopening and guardian-process failure. Exhaustion has no timer that silently resets and resumes. An explicit future start can reevaluate an expired window; it does not erase records. A clean child exit (code 0 without signal, forced flag or startup error) is treated as application stop and does not restart. An explicit start following a recorded manual stop is a user launch, rather than an automatic restart.

Child stdout/stderr are continuously drained into byte counters. Neither raw output nor an ever-growing output buffer is retained. Metadata events occur at lifecycle boundaries, avoiding one callback per output chunk. Cleanup operates on this runtime's `ChildProcess` handles only; there is no process-name search, PID-based kill, process-group kill or recursive descendant cleanup. The caller owns any descendants created outside the managed host shutdown contract. This first implementation supervises exit and startup readiness; an ongoing heartbeat/hang detector is not yet provided by this module.

## Guardian crash and controlled owner recovery

If a previous guardian disappears, its owner file is **not** automatically deleted. `GUARDIAN_OWNER_UNPROVEN` retains the journal, run intent, budget and original owner bytes. PID absence alone is not sufficient to authorize takeover: the old host or its children could still exist, and a PID may have been reused.

An external controlled recovery procedure must establish the exact owner generation, prove the previous guardian and managed writer generation have ended, verify maintenance and data state, and archive the exact old owner token under a recorded recovery authorization. Only then may `openGuardian` reopen the unchanged journal. This module intentionally exposes no shortcut that bypasses that proof. An old DSH suite lock similarly belongs to its own recovery protocol and is never deleted here.

The actual guardian-process crash test uses a synthetic owner whose exit is observed from its parent-owned handle and whose synthetic children are proved terminated. Its test-only operator then archives that exact lock and reopens the journal; one remaining automatic attempt is allowed, with no budget reset. This proves persistence and refusal/recovery boundaries in that controlled scope; it does not establish arbitrary production orphan attribution.

## Verification

`tests/guardian.test.mjs` runs actual local Node child processes for readiness, flood drainage, graceful/forced stop, sentinel survival, capped crash loops, guardian process crash, owner-lock refusal, corruption refusal, exit fencing and cancellation/storage races. Fixtures contain no credentials or external calls. Runtime scratch artifacts remain under `tests/.runs/guardian-*`. Red failures, diagnostic attempts and the final three full rounds are retained separately in `dsh-host-isolation/evidence/host-recovery-20260912/guardian/`; results bind the exact source and test bytes in that directory's index. Tests use no broad process cleanup.

The initial three component rounds retain 17/17, 16/17 and 17/17 respectively. The middle round's failed assertion counted fixture JS-entry receipts as if every OS-created process necessarily finished JS startup before a 70 ms readiness deadline. The journal recorded the three actual launches; two were terminated before writing their fixture receipt. The test now counts actual `child-spawned` events and independently requires zero readiness events, generation 3 and two consumed retries. The guardian code did not change for this assertion correction. Three supplemental full rounds passed 17/17 each. Original test bytes and all original logs remain separate; the failed original sample is not relabeled as passing.

## Bounded SEP lock adapter

`src/sep-lock-recovery.mjs` is the integration adapter for the suite's two existing locks. It does not replace the official SEP P2 protocol.

```js
// Before spawn, while no previous managed host owns these paths:
const prepared = await prepareSepLockScope({ suiteLockDirectory, storageRoot });

// After the owned child has opened SEP, while that same handle is still alive:
const receipt = await captureSepLockReceipt({
  child, generation, prepared, suiteLockDirectory, storageRoot,
});

// Called from awaited guardian afterExit, using the trusted, already-imported candidate export:
const result = await recoverSepOwnedLocks({
  receipt, exit: { generation, code, signal }, openControl,
});
if (result.status !== 'pass') {
  // Controller records maintenance refusal; no replacement is authorized.
  throw Object.assign(new Error(result.reason), { code: result.reason });
}
```

Paths are explicit configuration supplied by the controller; no HOME inference, URL-to-module import or external UI path is accepted by the adapter. `storageRoot` is optional only for a suite without P2; daily P2 integration must provide it. Preparation requires existing, locally verifiable directories and absent lock files. Capture verifies the matching child PID, lock creation after preparation, exact lock bytes/hash and local identities. The receipt and prepared scope are capabilities held in `WeakMap`s; copying their JSON cannot authorize recovery. Capture must complete before the child exits. Missing capture or an independent guardian crash loses that ownership proof and safely blocks automatic cleanup.

Recovery requires an observed `close` event from the same child handle, matching generation/code/signal, and verified PID absence; PID absence alone never grants authority. Both original lock bytes and all captured directory/file identities are rechecked. The official `openControl({storageRoot, mode:'maintenance', recoverLockToken})` archives the old P2 owner according to its own protocol. The adapter requires a valid checkpoint, an open barrier, no pending operations or incomplete deletion cleanup, and `withAccess` verification of all governed data fingerprints. Only then does it archive the captured suite store lock into `suiteLockDirectory/guardian-recovered-locks/<receipt-id>.json`. These files contain lock metadata, never memory bodies. The recovery guard is exclusively created and removed only when its exact captured identity and bytes still match.

If P2 verification fails, its official recovery may already have archived the old P2 token before reporting the failure. The suite store lock remains, no data is restored, and the controller must keep maintenance blocked. This is a deliberately preserved failure scene, not an automatic rollback. A normal child shutdown with both original locks already absent is also checked through P2 before returning `pass, recovered:false`. Recovered data and P2 journal are never overwritten by this adapter. A disputed recovery guard or coordinator close failure cannot produce a passing result.

This scope covers the specific host generation created by this guardian and the configured official suite writer protocol. It does not authorize unrelated standalone writers, restore ownership after arbitrary guardian failure, recover unresolved business transactions, or automatically clean all stale locks. Three separate adapter rounds exercise real synthetic child processes and the actual candidate P2 module. Native Windows ancestor identity checks require the native execution permission; an initial sandbox `EPERM` run is retained as an environment limitation, not a passing test.
