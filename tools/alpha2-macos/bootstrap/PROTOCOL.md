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
