# Private Node installer session

`runInstallerSession({ controller, nonce, input, output, fixedInventory,
closeDeadlineMs })` is an internal adapter for streams supplied by a trusted,
fixed-bundle parent. It is not a CLI, HTTP route, renderer API or general stdin
service. It creates no controller from caller-selected paths. Production must
establish NSBundle/program/parent authority before constructing it; a nonce is
channel binding, not independent installation authority.

Only one request may be accepted at a time. A complete exact-schema request is
limited to 4 KiB and must match the private nonce and next sequence. Pipelined,
busy, malformed, oversized, wrong-nonce and replayed requests close admission;
none can enqueue a second operation. A preview is consumed before confirm or
cancel dispatch. The confirmation must match the current preview. Request
payloads cannot supply a source, target, helper, home or inventory.

Preview returns only the verified plan identity, fixed target/data location,
parent-creation flag and count/bytes from fixed configuration inventory. The
full plan and errors' free text are excluded. All responses pass the existing
16 KiB exact protocol validator. `committed` is accepted only when the actual
controller says `applicationStarted: false`; it is not normalized from true.
Recovery rows with incomplete/unknown journals remain explicit blocked rows.

Close shuts admission first, waits for accepted work, calls the controller's
close and requires its real whenClosed receipt. A successful close request is
flushed before this session resolves whenClosed, so a parent may then close
its pipes. The default response deadline is 5 seconds (test-only callers use
a shorter value). Deadline/blocked cleanup preserves a referenced session and
does not kill the process or claim release. Late actual completion can resolve
whenClosed but cannot rewrite an already blocked protocol response. Controller
close returning blocked can be retried by the trusted in-process owner; no
new wire requests are admitted. EOF/output failure suppresses late operation
replies and closes admission while accepted work finishes under its controller.

The tests use actual Node child processes and private fd 3/fd 4 pipes, with a
synthetic controller and separate test IPC for releasing controlled delays.
They verify this adapter, not the native account journal, installation, AppKit
confirmation, physical interaction or final installer app admission.

Run with Node 24.21.0:

```
node --test --test-reporter=tap tools/alpha2-macos/installer-ui/protocol.test.mjs tools/alpha2-macos/installer-ui/controller-session.test.mjs
```

Evidence keeps the initial 11 missing-implementation failures. Before the
clean RED, the test fixture itself left its empty private pipes open; its
identified test children were explicitly cleaned up, separately from any
production cleanup claim. The fixture was fixed before clean RED. Subsequent
tests caught a real adapter ordering issue (whenClosed resolved before the
closed wire response was flushed), which was corrected. The EOF assertion
waits for the actual observed pipe closure rather than assuming Windows
delivery within a 160 ms sleep. Final counts: 17 existing protocol definitions
and 11 child-session definitions, 28 pass, no skipped/cancelled definitions.

No production AppKit/NSBundle entry is wired by this module or these tests.
