# Current candidate: lifecycle gates (r2)

`candidate-r2/` and `CANDIDATE-R2-MANIFEST.json` bind the second adaptation slice:
platform process identity, signed update-worker leases, live-parent cancellation,
publisher output/deadline behavior, Guardian IPC/deadline/blocked shutdown and
platform launcher paths/environment. Prior baseline and r1 snapshots are retained.

The native lifecycle suite has 19 scenarios. Profile/semver/YAML imports are
throwing external test stubs and must not execute; process inspection, signed
lease state, queued update control and real child processes are the actual source.
This is not a full profile boot, native installer, desktop launch or update-package
publication. The bootstrap source copy is included and byte-matched to the runtime.
A simulated refused termination requires later test cleanup, separate from the
product's blocked close. See `apps/desktop/src/sep-update/LIFECYCLE-PORTABILITY.md`.

CI now selects r2 and retains the original 30 budget cases, 28 owner-lock cases
and five storage/recovery probes. Results are tied to each CI commit; do not apply
r1's passing result to an unexecuted r2 commit. No Release or daily installation is
changed. Local/CI temporary state is synthetic and does not contain API keys.

---

Historical r1 candidate description follows:
# Current candidate: POSIX owner-lock adaptation

`candidate-r1/` contains the selected current source and new owner-lock adapter;
`CANDIDATE-R1-MANIFEST.json` binds its exact bytes. The unchanged `baseline/` and
its manifest retain the initial failures for comparison. The workflow now runs
the candidate: syntax/hash verification, 30 original budget cases, 28 lock cases
and five native integration probes. macOS CI outcomes remain authoritative; local
Windows/Linux success is not a substitute for macOS execution.

Linux native ext4 ownership and the empty P2/Recovery probes passed locally.
Windows regression preserves schema-1 records; POSIX uses schema 2 with boot and
process-birth evidence. See each package's `docs/owner-portability.md` for the
second-precision macOS limitation, foreign records, supported filesystems and
unverified full-application surfaces. No changes to release source or daily data.

Candidate command: `node tools/cross-platform/verify-source.mjs --candidate`.
For the native probe set `SEP_PLATFORM_SOURCE=tools/cross-platform/candidate-r1`;
it otherwise deliberately retains the original baseline default.

---

The following is the **historical diagnostic baseline**, not the current result:
# macOS / Linux diagnostic baseline

This test branch adds selected current SEP source modules under `baseline/` with SHA256 bindings in `SOURCE-MANIFEST.json`. It does not replace release code, modify the default branch, install SEP, or publish a Release. The snapshot supplements the older public source with exactly the modules under investigation; it is not a complete new application distribution.

The manual and branch-push macOS workflow verifies source bytes and syntax, runs the existing 30 budget arithmetic cases, and executes native filesystem, SQLite lease, owner-file, governed storage and recovery probes. A syntax check is not an application build. Core functionality has known Windows-only checks; failures remain failures and the workflow will be red until the relevant platform implementation is complete. This diagnostic push is explicitly for establishing that baseline, not an ordinary passing release candidate push.

The probe allocates a unique temporary root. It closes acquired leases/controllers in `finally`; artifacts contain only results, error codes, Node/OS architecture and timestamps. No model requests, user profiles, personal data, keys, secrets or desktop interactions are involved. Inputs are read from an explicit source snapshot. Failed-case synthetic files remain inside the ephemeral runner for diagnosis. Separate concurrent probe processes use distinct roots; output filenames must also be distinct when running concurrently.

APFS can be case-insensitive: the filesystem case probe observes the actual behavior instead of requiring Linux ext4 semantics on macOS. PID reuse checks, native OS cleanup, installer/updater adaptation, full build, GUI/TCC authorization, clicks, menus, Only/Full packaging and coexistence remain future gates. A successful arithmetic or SQLite test alone does not establish platform compatibility.

Local equivalent:

```sh
node tools/cross-platform/verify-source.mjs
node --test tools/cross-platform/baseline/packages/sep/system-enhancement-package/tests/budget-pricing.test.mjs
node tools/cross-platform/platform-probe.mjs
```

GitHub runs use read-only repository permissions and pinned official Actions. Only this test branch triggers the added push workflow. No release publishing step exists.
`baseline/` preserves original file bytes, including existing whitespace and line endings. Its local Git attributes disable text normalization and whitespace lint only for that immutable fixture; harness/workflow changes retain normal checks. SHA256 verification rejects any fixture byte change.
