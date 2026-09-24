# Bounded startup diagnostics

The host's existing fatal IPC now carries an explicitly allowlisted `code`, with its compatibility `message` equal to that same code. The original exception message, stack, keys, arbitrary stderr and document text are not sent by this fatal catch. Unknown classifications become `SEP_HOST_START_FAILED`.

Guardian accepts fatal diagnostics only from the current owned child while it is still starting and not aborted. It retains the first valid `hostCode` and ignores raw `message`, arbitrary prefixes, unsupported codes and late generations. Its lifecycle error remains `GUARDIAN_NOT_READY`; the optional bounded `hostCode` describes the observed host failure. This avoids treating host failures as guardian storage faults or giving diagnostic text control over ownership/restart policy.

The server and client independently filter `hostCode` through the same exact allowlist. The bootstrap can display `error.hostCode` only after its own `safeHostCode()` validation; otherwise it should retain `error.code`. The bootstrap change is owned by the root integration task.

`overlay/` must be applied **after** the core, host-lifecycle and managed overlays. It preserves the already-reviewed guardian journal gate, native ownership, onSpawn hook and explicit manual-start changes. Files include guardian/server/client, the host fatal catch and per-package helper modules. `source/` contains the corresponding host TypeScript change. `manifest.json` binds source inputs and output hashes; it is not a claim that prior test logs cover later edits.

Evidence: `red.log` reproduced three missing-feature assertions (alongside three existing negative controls). `green.log` reports 8/8 tests, including real child IPC and the actual Guardian → HTTP RPC → client path. Key-bearing messages, invented code prefixes, missing explicit code fields and untrusted RPC code fields do not propagate. No model calls or daily instance were used.

The diagnostic code is supporting evidence from the owned host. It does not prove a general root cause, authorize deletion or make unresolved operations retryable. Ordinary runtime tool errors do not enter this startup-only path.
