# Native bootstrap draft protocol

Scope: independent synthetic contract, not wired to the broker or product package.
`session.mjs` passed 12 local state-machine tests after the missing-feature RED
run. This does not prove a native AppKit launcher, Finder, or an owned real host.

The proposed AppKit executable owns exactly one fixed Node controller and a
private inherited full-duplex descriptor 3. Stdout/stderr are diagnostics only.
Use a socket pair with close-on-exec set everywhere except the explicit child
descriptor. Never use PID/name discovery as the source of the session object.

Frames are UTF-8 JSON objects, at most 4096 bytes excluding the newline. An
accumulator must enforce that limit before collecting an entire line. No URLs,
credentials, code, environment variables or filesystem paths occur in frames.

The native parent creates a random 32-byte nonce and binds the expected program
SHA-256 before the spawn. Its initial frame is exactly:

```json
{"protocol":1,"kind":"initialize","nonce":"64 lowercase hex","programSha256":"64 lowercase hex"}
```

After the controller actually acquires the existing broker lease, its `owned`
frame adds the 32-hex generation. All later frames carry the same five base keys:
`protocol`, `kind`, `nonce`, `programSha256`, `generation`. Extra or absent keys
are errors. The current contract uses these extensions:

| Direction / kind | Additional keys | Meaning |
| --- | --- | --- |
| controller → `owned` | none | The broker acquired its real current-generation lease. |
| controller → `ready` | `desktopReady: true` | Actual managed UI ready acknowledgment, not spawn or host URL alone. |
| parent → `activate` | `requestId` (24 hex) | Restore the existing window. |
| controller → `activated` | matching `requestId` | The existing window was restored. |
| parent → `requestQuit` | `requestId` (24 hex) | Enter the actual desktop inspection/confirmation flow. |
| controller → `quitCancelled` | matching `requestId` | User declined quit; instance stays alive. |
| controller → `quitting` | none | Quit was accepted; no release is implied. |
| controller → `closed` | `status: pass`, `resourcesConfirmedReleased: true` | Broker verified its owned desktop/host/RPC release and lease completion. |
| controller → `blocked` | allowlisted `code`, `resourcesConfirmedReleased: false` | Completion is unknown; no new activation or takeover. |

`closed` still needs the exact controller child's actual code-0, signal-free
exit. Exit can precede the final drained frame; EOF or timeout cannot supply a
missing receipt. An invalid frame poisons that channel rather than accepting a
later purported success. A valid blocked result may be superseded only by a real
late clean receipt plus real child exit. A copied frame is not ownership proof;
the private channel's actual creation/child identity are prerequisites.

`session.mjs` is the executable reference contract. Its public methods are
`receive`, `activate`, `requestQuit`, `childExit`, `transportClosed`, `deadline`,
and `status`. It owns no OS processes and performs no filesystem operations.

## Native RED harness

The original `appkit-bootstrap.m` stub returned `SEP_BOOTSTRAP_NOT_IMPLEMENTED`.
Native macOS run 38556022717 / job 115825236337 compiled successfully and all
four fixed cases failed with that code, confirming the missing-feature RED.
The current thin implementation is awaiting native GREEN verification. It is
not a releasable launcher. The test build
uses `SEP_BOOTSTRAP_TESTING`, an external synthetic descriptor, and a literal
Node fixture; those test entry points must not be accepted by a production build.

`run-native.mjs <fresh output>` compiles the prototype into a separate
`Bootstrap Contract.app` and runs four native contracts. Their planned results
are clean activation/quit, cancelled quit then retry, exit without cleanup, and
wrong nonce. The original failed run is retained, without counting it as platform
validation. No real host,
private profile, parser or daily instance is invoked by this harness.

The thin implementation targets these same four fixed tests. Its non-test build
refuses execution with `SEP_BOOTSTRAP_PRODUCTION_NOT_CONNECTED`. Its later Finder
`open` path, bundle identity/signing,
production fixed resource manifest and real broker adaptation need their own
integration tests. Direct executable invocation here does not prove Finder.

Blocked cases terminate only the exact unreaped, non-forking synthetic child as
separate test cleanup. If wait ownership becomes unknown, no PID signal is sent.
This is not permission to abandon an unknown production broker or release its
lease. Program-path replacement between hash verification and spawn, sustained
hostile IPC traffic, and unexpected descendants are outside this prototype's
certified scope and require the production adapter's own tests.

The five-second overall deadline belongs only to this synthetic contract. A
production launcher must use separate bounded startup and shutdown phases;
ordinary background operation and long tasks must have no overall lifetime
deadline inherited from this fixture.

The runner now separately compiles the same source **without** the test macro
and executes one additional regression. Both no-argument launch and a complete
external synthetic descriptor must return code 78 and
`SEP_BOOTSTRAP_PRODUCTION_NOT_CONNECTED`; the descriptor's side-effect marker
must remain absent. Its `production-compile.log` and `production.log` remain
separate from the original four native contract cases. This independent test
passed in native r34 and is included again in the pending rerun; it does not imply
a connected production launcher.

## r34 diagnosis and modal deadline regression

Native r34 compiled both binaries. Of the original four contract definitions,
two refusal cases passed and the two positive cases reached the outer 15-second
test timeout without a receipt. The independent non-test entry test passed.
The outer timeout did not record the descendants' final state; CI teardown and
unconfirmed fixture cleanup must not be described as zero residual processes.

The positive path synchronously entered `terminate:` while executing the polling
timer, then returned `NSTerminateLater`. AppKit switches to the modal run-loop
mode, while `scheduledTimer` had registered only in default mode. Thus neither
IPC progress nor the internal deadline could proceed. The replacement schedules
termination on a later default-mode turn, registers the polling timer in common
modes, and supplies the actual termination reply only after recording the result.
This follows Apple's [terminateLater contract](https://developer.apple.com/documentation/appkit/nsapplication/terminatereply/terminatelater)
and [run-loop timer modes](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/Multithreading/RunLoopManagement/RunLoopManagement.html).

A separate POSIX execution of the exact fixed Node fixture also established that
its `socket.end()` leaves its read half open: the child remained running after
the parent observed EOF and exited normally only after the parent closed its
write half. The native transport now performs `shutdown(SHUT_WR)` after peer EOF;
this never substitutes for the still-required actual child exit and clean receipt.
This POSIX diagnostic is not macOS AppKit evidence.

The current pending suite retains the four original cases and adds one native
`quit-no-reply` case: the controller acknowledges activation but withholds its
quit response. While AppKit awaits termination, the internal 500 ms fixture
deadline must return blocked, and separately recorded fixture cleanup must reap
the actual child within a seven-second test bound. The runner now reports five
synthetic native definitions plus the one non-test refusal definition; the 12
portable session definitions remain separate. No production total lifetime limit
is introduced.
