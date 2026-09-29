Current build stage: **r4 full source build and real CLI/Web startup**. See [application-r4](application-r4/README.md). Linux passed; macOS is evaluated by the dedicated application workflow. Full installers and interactive desktop validation remain pending.

The following is the preserved r3 component scope:

# Cross-platform diagnostic snapshots

Current: **r3 package preparation and publication components**. See candidate-r3/apps/desktop/src/sep-update/PREPARATION-PORTABILITY.md and CANDIDATE-R3-MANIFEST.json. Local Linux testing is complete for the synthetic component scope; the branch workflow provides the corresponding macOS-native result. Neither result means a full application installer or end-user update channel is ready.

r3 adds exact-platform delta preparation, pinned bounded ZIP parsing, native command-line quiescence checks, schema 2 installation metadata, POSIX shell bootstrap, and plan-bound executable modes during publish/restore. Diagnostic npm dependencies are integrity-locked, with install scripts disabled. Files under candidate-r3 are selected source snapshots, not release artifacts. No private keys, user database, sessions or generated dependency tree is included.

Historical snapshots are unchanged: r2 lifecycle and launcher layout; r1 owner identity/locks; baseline initial portability survey. Their manifests remain available separately. Do not combine their counts as independent current test coverage.

Only codex/sep-cross-platform-20260929 and its CI workflow are in scope. No Release, main branch update or daily deployment is performed here.
