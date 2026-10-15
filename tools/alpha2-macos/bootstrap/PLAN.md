# Finder bootstrap proposal

Status: design only. This file does not enable a new product entry, change the
frozen runtime, switch the daily installation, or certify physical Mac usage.

## Recommended shape

Use one small native AppKit outer application with `LSUIElement=YES`, containing
the existing managed Electron application. The outer application creates no
additional Dock icon. Keep the inner Electron `CFBundleExecutable` and its
`requireManagedInvocation` refusal intact. Do not add an unmanaged-host fallback.

This is a native launcher, not another Electron shell. Reuse `launch-full.mjs`
for the actual program verification, application lease, generation record,
managed business host, discovery record and desktop connection.

Put the complete distribution inside the outer application: native bootstrap in
`Contents/MacOS`, the existing controlled desktop in `Contents/Helpers`, and
scripts/data in `Contents/Resources`. Sign nested components before the outer
bundle, then verify deeply and strictly. The present program loader derives its
root from the manifest's directory, so this layout needs an explicit fixed-root
layout/schema addition. Do not relax its prohibition on `..` or symlink paths.
Keep `.command` as a diagnostic fallback invoking the same controller.

Keeping a launcher next to external payload would avoid that layout addition,
but Finder relocation or application translocation can separate it from its
dependencies. It is not the recommended reliable installation shape.

## First launch: acquiring ownership

1. Resolve the application from `NSBundle`, not the working directory. Verify a
   bound bootstrap inventory containing Node, the broker entry and its closure,
   and the expected `PROGRAM.json` hash. Use fixed argv and a minimal environment;
   do not construct a shell command or inherit runtime injection variables.
2. Spawn the one exact Node broker. The broker remains the sole authority for
   the data lease. It must validate the old generation before starting anything;
   `active`, `starting`, or `blocked` cannot be replaced merely because a former
   launcher PID is gone.
3. Use dedicated inherited private control channels for bootstrap-to-broker and
   broker-to-desktop, or an equivalently authenticated local transport. Bind the
   handshake to a fresh launch nonce, program hash, current generation, and the
   actual connection to the owned child. Do not discover ownership by process
   name or a bare PID. Bound message size (proposed 4 KiB) and accept only status,
   activate and request-quit operations; never arbitrary paths/code/commands.
4. Report startup separately from UI readiness. Existing `launchFull` returns
   `running` after spawning the desktop; existing `desktopReady` returns host
   connection information. Neither alone proves the window loaded. Add a narrow
   desktop acknowledgment after the actual managed window/page is ready. The
   existing native smoke's separate window and HTTP proofs remain valid.
5. On failure, show a native diagnostic containing an allowlisted code, bounded
   log location and cleanup state. Do not expose RPC credentials, content, or
   stack traces. A startup deadline starts controlled cleanup; it is not proof
   that children ended.

## Reopen: activating the existing generation

An AppKit reopen event forwards `activate` over the already held channel. The
broker verifies lease/generation and forwards to the exact existing Electron
connection, which restores/focuses the existing window and acknowledges it.
Combine repeated activation during startup into one pending request. Reject it
while closing; do not start a second host to satisfy an activation request.

Launch Services routing is not the ownership lock. An explicit second process
(`open -n`, direct invocation, or another copy) must still fail the broker lease.
Without a proven existing-owner control channel, the initial implementation may
report already-running/cleanup-unconfirmed instead of adopting that instance.
A vanished outer launcher is not permission to remove a lock or reset a stale
generation. Recovery/reattachment needs its own authenticated ownership proof.

## Background operation and bounded exit

Closing the Electron window retains the established background behavior; it
does not stop the host, broker or bootstrap. Reopening restores the same instance.

Normal quit uses Electron's existing task inspection, user confirmation and quit
flow. The outer application requests that flow; it must not treat
`launchFull.close({requestDesktop:true})` and its SIGTERM as normal clean exit.
If the user cancels quit, retain the running instance. AppKit termination replies
must be bounded and must not force a clean receipt merely to end a UI wait.

Release the application lease only after the actual desktop normal exit, real
business close acknowledgment and exit, and RPC drain have all succeeded. Only
then persist the closed generation and end the outer bootstrap. Unknown or
timed-out cleanup returns `blocked` and retains the generation/lease. EOF, a
leader exit, a closed pipe, or a caller timeout alone is not cleanup evidence.
These receipts continue to cover the owned desktop main and managed business
host; they do not certify arbitrary descendant process-family cleanup.

## Verification before claiming Finder support

Use actual macOS Launch Services (`open` on the assembled outer application),
and collect application callbacks plus real window/HTTP/lease evidence:

- Cold start, window readiness, close-to-background, reopen with unchanged host
  PID and generation, normal quit, then a second cold launch.
- Repeated open during startup; explicit duplicate process; stale activate
  nonce/generation; activation or quit during closing.
- Direct inner-application launch still refuses before creating an ordinary
  host. Node/broker/manifest tampering, alias roots and wrong OS are refused.
- Startup failure, IPC loss, outer-controller death, and close deadline retain
  the truthful blocked state without deleting or reusing the old generation.
- Bound diagnostics and log retention; no bearer token or private document in
  the output. Record any later test cleanup separately from the initial receipt.
- Verify the assembled outer and inner signatures, then launch the extracted
  final archive, rather than merely testing a source-tree binary.

CI can prove its actual Launch Services path and native callbacks. Calling
`app.emit('activate')` through Inspector proves only the callback and cannot be
relabeled physical Finder/Dock interaction. Physical Finder/Dock clicks, initial
Gatekeeper approval, quarantine/translocation behavior from the actual download,
and TCC prompts remain separate user-machine acceptance items. No Developer ID
or notarization is supplied, and the package must not remove quarantine or
disable Gatekeeper automatically.

## Decisions and sequencing

Complete the document/UI integrated package first. Then approve and implement
this independent bootstrap using tests before production changes. The concrete
choices are a single outer application layout, continued ad-hoc preview signing,
and conservative refusal instead of automatic takeover after uncertain cleanup.
Signing/notarization or automatic recovery is a later scope decision.

Primary platform references:

- [Apple Launch Services keys and LSUIElement](https://developer.apple.com/library/archive/documentation/General/Reference/InfoPlistKeyReference/Articles/LaunchServicesKeys.html)
- [Apple nested code signing guidance](https://developer.apple.com/library/archive/technotes/tn2206/_index.html)
- [Apple guidance for explicitly opening unverified apps](https://support.apple.com/en-us/102445)

Reviewed against the local Mac candidate on 2026-10-14. This is a proposal, not
native test evidence or a public release declaration.
