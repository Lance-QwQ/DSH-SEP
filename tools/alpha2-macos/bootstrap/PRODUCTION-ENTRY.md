# Fixed production bootstrap admission

Status: native manifest admission verified; real controller connection pending. Eight portable
manifest shape tests have a recorded RED/GREEN cycle. Native r37 ran all thirteen
bundle-admission definitions against the previous entry: every binary compiled,
and all thirteen failed for the expected missing validation (not an environment
error). In r38 the new reader exposed a compile-time collision between its
private `pPath` name and an Apple SDK enum; this was renamed without relaxing
tests. Native r39 (`38566612537` / `115860788495`) then passed all thirteen
definitions with zero skips. These are identity fixtures and never execute their
placeholder Node file. Actual controller connection and Finder remain separate.

## Fixed layout

The outer application is an LSUIElement AppKit application. Its running
NSBundle supplies the application location; cwd, environment and command-line
arguments cannot choose another manifest, executable, data root or controller.

```
DSH SEP.app/Contents/
  MacOS/DSH SEP
  Resources/BOOTSTRAP.json
  Resources/PROGRAM.json
  Resources/product/runtime/bootstrap/controller.mjs
  Resources/product/runtime/desktop/...
  Resources/product/payload/...
  Helpers/DSH SEP Desktop.app/Contents/Resources/runtime/
    primary-runtime/dependencies/node/bin/node
```

`BOOTSTRAP.json` is schema 1, layout `macos-app-v1`. Its exact keys are
`schema`, `layout`, `program`, `node`, `controller`, and `closure`. Each role and
closure item has exactly `path` and lowercase `sha256`. All paths are relative
to Contents. The three role paths above are constants. `closure` contains the
controller and every production runtime file in sorted unique path order; the
controller's two hashes must agree. No test/fixture files are allowed there.
The actual runtime file set must exactly equal this closure. Node reads are
streaming and bounded to 256 MiB; the manifest is bounded to 256 KiB, individual
scripts to 4 MiB and the closure to 64 MiB. Native directory traversal uses held
directory descriptors, `openat`/`fstatat` without following links, and at most
1024 files, 2048 entries and 32 levels. Files must be regular with one hard link;
all visited directories and files must belong to this user or root and must not
permit group/world writes. Hash reads recheck file identities and the root path.
`production-manifest.mjs` is the packaging-time validation contract. Native
admission independently enforces the contract before any execution.

Compile `appkit-bootstrap.m` with
`-DSEP_BOOTSTRAP_MANIFEST_SHA256="<64 lowercase hex>"` after generating the
manifest. The expected digest is a compile-time constant, never an environment
variable. PROGRAM schema 4 uses Contents as its controlled root. PROGRAM does
not include the outer binary, avoiding a circular hash dependency. Final
distribution inventory and archive hashes cover the compiled outer application.

## Execution boundary

The future connected entry may execute only the verified role's Node with the
verified controller as its sole script argument. No extra controller CLI is
provided. FD 3 is the private inherited control channel. The first frame binds
the fresh nonce and actual PROGRAM digest. Data lives in the fixed user's
`Library/Application Support/DSH SEP/alpha2-mac-finder-preview`; the controller
derives and checks this value, and does not accept an argv/env replacement.

For this admission stage the valid manifest still returns
`SEP_BOOTSTRAP_PRODUCTION_NOT_CONNECTED` with `manifestVerified: true`. No
resource owner, host, Electron or model is started. Missing compile binding
keeps the original unconditional refusal. The synthetic macro remains a
separate build; no `--synthetic-contract` route exists in production.

The synthetic prototype's five-second overall deadline is not a product
lifetime limit. Product startup and requested shutdown will have separate
deadlines; ordinary running tasks will not inherit an overall timeout. Closing
a window does not authorize stopping its host. Unknown cleanup retains its
owner's isolation and lease; child exit or closed pipes alone prove neither.

## Remaining limits

This stage verifies bundle identities and bytes, not Developer ID, notarization,
Finder readiness or application lifecycle. Existing same-user code capable of
modifying the installed program remains outside the trusted program boundary;
hashing a file before a path-based spawn is not an atomic executable lease.
Production integration must preserve the controlled loader's own hash checks.

## Connected candidate after r40 RED

The separate `SEP_BOOTSTRAP_PRODUCT_CONNECTED=1` build now has a candidate
implementation in `production-runtime.inc.m`. Native r43 passed the original
six connected contracts; a seventh diagnostic-CAS regression failed at its
intended assertion. Its fix awaits the same seven-contract GREEN run. The
thirteen admission contracts retain their unconnected compile mode.
Native r40 (`38568832436` / `115868359955`) compiled all six connected tests;
each failed at the expected missing-feature `PRODUCTION_NOT_CONNECTED` receipt,
with zero skips. The exact original logs and artifact `11895769139` are retained.

The connected candidate uses the fixed verified Node/controller pair, a private
inherited FD 3, a fresh nonce, and actual PROGRAM digest. No argv or environment
value can select a different runtime or state root. It derives the account home
from the operating-system account record. Startup and requested shutdown each
have a 60-second deadline. Ordinary running has no total lifetime deadline.
The six synthetic-controller contracts use separately compiled 1800 ms phase
deadlines; this is not a production setting or an environment override.

After a real `ready` frame the native parent requests activation; it records
`activated` only after the matching controller acknowledgment. Reopen targets
the same generation. User cancellation returns to running. Normal window close
does not imply host termination. A timeout or unknown cleanup keeps the native
owner and channel alive and displays a nonmodal diagnostic; it never kills the
controller or takes over an old generation. A poisoned channel cannot provide
later cleanup proof. A non-poisoned late `closed` receipt can establish resource
release only together with actual EOF and the exact child's normal exit.

Resource release and successful operation are separate outcomes. A startup
failure followed by verified cleanup and child exit 1 records `closed`,
`resourcesConfirmedReleased:true`, `desktopReady:false`, and `outcome:failed`.
The native diagnostic stays until acknowledged or normally quit; it then exits
nonzero. A prior deadline remains a failed outcome even when late cleanup is
confirmed. Successful ready/quitting/closed and child exit 0 exits normally.

Structured native diagnostic lines carry an observation-only `sessionId`,
sequence, child/parent PID, actual program hash, generation, phase, readiness,
release flag and classified code. They never contain the channel nonce. The
fixed `launcher/bootstrap-ui.json` receipt is published only after `owned`,
under the user's private state root, as an atomic mode-0600 file. It rejects
aliases, hardlinks, foreign owners and nonprivate directories. A separate
nonblocking file lock plus session/generation compare-and-swap prevents an old
session's late event from replacing a new owner's observation. This file is
never an authorization, lease, or recovery credential. Diagnostic write failure
cannot change the true cleanup outcome. It may leave the observation stale.

`run-connected-native.mjs <fresh output>` now defines seven actual AppKit adapter
contracts with a captured synthetic controller and the real normal-termination
observer. It does not certify the actual product broker. Root package tests
separately use LaunchServices, the same non-test application bytes, actual
managed renderer readiness, exact bundle/PID/birth checks, and normal exit.
Physical Finder input, Developer ID, notarization and arbitrary descendant
ownership remain outside these adapter contracts.

The additional seventh definition targets a review-discovered diagnostic CAS
window: when the first `owned` receipt cannot be written, an old session must
not later claim the latest slot over a different session's observation. A
real native flock holder prevents that first write, and a synthetic replacement
observation is installed under the lock. The application then quits normally;
the test separately checks its actual closed/exit proof and the observation
bytes. Native r41 and r42 stopped before this assertion because the test
observer used nullable `NSRunningApplication.launchDate` as process birth. Their
original failures and unconfirmed cleanup receipts remain preserved. The test
observer now reads kernel `proc_bsdinfo` birth twice, checks UID/PID and unchanged
start seconds/microseconds, and still requires the exact registered application
bundle identity. Normal hide/quit refuses an incorrect expected birth. Every
observer result is recorded before assertions; no force termination was added.

Native r43 (`38574839463` / `115889100903`) compiled and ran all seven definitions:
six passed; the seventh failed at the expected newer-receipt preservation
assertion, after real closed/exit confirmation. Its original artifact
`11898662859` has SHA-256
`ee130858dd04d2a4143f27590b39218c6d72bc08727016628aa9fe012cc522da`.
The candidate fix permits only the original `owned` event to claim the latest
slot. Later events must match an existing session and generation even when the
first publication failed. This changes observation handling, not resource
ownership or cleanup proof. The original seventh failure remains evidence;
the fixed version has not yet been certified by the subsequent native run.
