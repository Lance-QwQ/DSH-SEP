# Managed host lifecycle candidate — 2026-09-24

This isolated overlay addresses verified startup/shutdown defects in the public Windows alpha.2 host. It has not changed the daily installation or sealed public artifacts.

The original `p0498/lib/index.js` installed disconnect handling after starting `runProfile`, waited without a local deadline for startup and shutdown, and could keep installing office components after a shutdown request. A managed invocation with no IPC parent could also boot an unowned writer. Source references: original lines 261–280, 308–340, 341–356.

The candidate installs the lifetime controller before the first asynchronous startup operation. A managed invocation requires connected parent IPC. Once shutdown or disconnect is observed, application creation, later setup and ready publication are rejected. The default shutdown deadline is **40 seconds total**, including a pending application promise, application shutdown and acknowledgement. Timeout or a rejected shutdown exits with code 1 and emits no clean acknowledgement. A partially failed boot without an acquired application handle cannot be declared drained; it exits with an unknown outcome. Parent loss is an interrupted exit, not a normal user close. No data is replayed, restored or unlocked by this helper; the separate ownership/journal admission gate decides whether a subsequent boot is permitted.

This timer is an event-loop deadline. A native fatal fault or a synchronous main-thread hang still requires the independent parent/OS supervisor. A resolved application shutdown means its shutdown contract completed; the guardian separately observes actual process exit and output completion.

## Artifacts

- `overlay/p0498/lib/index.js`: narrowly transformed public host entry.
- `overlay/p0498/lib/sep-host-lifecycle.mjs`: controller.
- `overlay/p0498/package.json`: adds the controller to the package file allowlist.
- `source/apps/desktop-host/src/index.ts`, controller and `.d.mts`: corresponding source and type contract.
- `overlay-manifest.json`: source and output SHA-256 bindings. The original dangling source-map directive is removed; no claim is made that the old map describes the changed entry.
- `build-overlay.mjs`: exact-anchor reconstruction; refuses unexpected input shape.

## Evidence

`red.log`: six tests against the original main function; **4 failed, 2 passed** for the reasons above. `red-partial-start.log`: rejected partial startup retained a synthetic interval until the test deadline.

`final-tests.log`: **24/24 pass**. Six tests execute the actual transformed main function with bounded synthetic facilities. Eighteen use real Node child processes and IPC: five key scenarios are each repeated three times, plus missing IPC, shutdown rejection and partial startup rejection. The process fixtures do not load a real model or private data.

`green-process.log` and `ipc-diagnostic.log` preserve a test harness failure: on this Node/Windows runtime, parent-initiated `child.disconnect()` produced an observed child `exit` and exitCode 1 but no `close` event. The first harness waited for `close` indefinitely and was explicitly terminated. The corrected harness waits for `exit` **and** both output streams to finish, with its own deadline. `green-process-v2.log` is the 17-test intermediate run; `final-tests.log` adds partial startup rejection. This does not establish the reason for past users' unexplained process exits.

To reproduce final tests, rebuild the overlay, set `SEP_HOST_TEST_ENTRY` to its absolute `overlay/p0498/lib/index.js`, then run Node `--test main.test.mjs process.test.mjs`. The default main-test input intentionally remains the original package for RED reproduction.
