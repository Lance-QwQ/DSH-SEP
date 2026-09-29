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
