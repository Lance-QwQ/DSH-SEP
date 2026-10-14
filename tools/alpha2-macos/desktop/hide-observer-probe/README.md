# Independent AppKit hide observation

This is test/operator code only. It neither loads nor alters the product. It
accepts one fresh output directory under the real RUNNER_TEMP; it does not
accept an app, target PID, bundle, executable or product data-root argument.

```
node tools/alpha2-macos/desktop/hide-observer-probe/run-native.mjs "$RUNNER_TEMP/hide-observer-probe"
```

Four fresh, ad-hoc signed, regular AppKit apps each expose one visible window.
The initial fixture receipt must show active, visible, not hidden, finished
launching, regular policy and a hideable window. Each instance receives one
hide call from its own observer process. The fixture itself calls activation
only when first creating its window. Observers never activate or create windows
and never change target or observer activation policy.

| Observer | sharedApplication | Main run loop |
|---|---|---|
| cli | no | no |
| runloop | no | 250 ms before lookup and after the single action |
| shared | yes | no |
| shared-runloop | yes | same 250 ms periods |

The baseline is byte-for-byte package/application-observer.m at SHA-256
bb37b6fae94465da6646609f48d444fc16957f884dfb265c0044b7fce1d99995.
Variants inject only the two initialization factors at exact single anchors.
They retain the PID, canonical bundle path, exact bundle ID, uid, kernel birth
and expected double birth checks and the original hide invocation/return code.
All generated source and input/output hashes are retained. This does not weaken
identity or retry a product failure.

After each attempt, a new baseline observer process takes an independent
snapshot. The target's AppKit delegate separately reports didHide and hidden
through the exact spawned child's stdout. Request BOOL, observed state, source
identity and cleanup are separate fields. Cleanup uses only that owned fixture's
stdin quit command and requires willTerminate plus exact child close code 0,
no signal. No SIGTERM/SIGKILL, process-name search or descendant kill occurs.
An unknown cleanup stops the matrix. A fixture-only 35-second self-termination
records fixtureDeadline and never counts as normal cleanup or product evidence.

RESULT.status pass means that all four comparisons were admitted, observed
and normally cleaned up. Each cases[].hideStatus separately reports pass/fail.
Thus four refused hides can still yield a complete experiment with four fail
outcomes. Incomplete identity/admission/cleanup is blocked. Neither a variant
success nor an all-success baseline proves the Electron product root cause:
productRootCause is always not_run. One observation per cell detects a pattern;
it is not repeated statistical causality evidence. No product re-test is run.

The output includes CASE receipts, raw stdout/stderr for every command and
fixture, source/ORIGIN hashes, sw_vers, uname, SDK path, and exact SDK copies/hashes
of NSRunningApplication.h, NSApplication.h and NSWindow.h. Native compilation
and the four AppKit cases remain not_run until the coordinator executes CI.
Six portable evidence-classification tests have separate RED/GREEN logs.

## Apple documentation checked

- [NSRunningApplication](https://developer.apple.com/documentation/appkit/nsrunningapplication?language=objc): time-varying properties refresh with the main run loop; a synchronous hidden read can be stale. This does not establish that a false hide return becomes success after initializing NSApplication.
- [hide](https://developer.apple.com/documentation/appkit/nsrunningapplication/hide%28%29?changes=_6_7&language=objc): return value distinguishes success; a terminated app or an app type that cannot hide may return false.
- [ActivationPolicy.prohibited](https://developer.apple.com/documentation/appkit/nsapplication/activationpolicy-swift.enum/prohibited?language=objc): prohibited apps cannot activate or create windows; this is the default for an unbundled executable without Info.plist. It does not state that a caller with this policy cannot hide another app.
- [NSWindow.canHide](https://developer.apple.com/documentation/appkit/nswindow/canhide): controls whether a window hides with its app; default is true.

Absence of LSUIElement/LSBackgroundOnly in the product's plist does not by itself
prove its live activation policy, hideability or API outcome. This fixture pins
and records those conditions; any remaining difference from Electron is outside
this experiment. The SDK files from the actual runner are authoritative input
evidence for subsequent diagnosis, not a substituted host SDK assumption.
