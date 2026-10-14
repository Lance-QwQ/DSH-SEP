# Resource assembly native RED

The current implementation is deliberately absent. Run the twelve fixed definitions before implementation, using the existing native macOS ARM64 image and pinned Node 24.21.0:

    node tools/alpha2-macos/installer-ui/resources/run-native.mjs "$RUNNER_TEMP/installer-resources"

The fresh output parent must be real and already exist. The five files here require the full current alpha2-macos source overlay: the test captures the real controller's reviewed sixteen-module static closure, the two fixed native C helpers, and the existing signed synthetic installation fixture. No payload binary is executed. All fixture signing and later helper compilation use fixed system executables, not a caller command string.

Expected RED is twelve missing-implementation failures after fixture setup. A compiler, signature, path, setup or timeout error is not feature RED. Keep TAP, RESULT and setup outputs. GREEN requires 12/12 with zero skipped/cancelled tests. Tests cover real signed payload accounting, no-overwrite, aliases, receipt/source modification, incomplete runtime closure, failed compilation retaining a partial candidate and restrictive umask.

Artifact selection should include `RESULT.json`, `native.tap`, and eventual `cases/**/RESOURCES-BUILD.json` plus `cases/**/*.log`, not fixture binaries or copied app trees. This stage does not build an outer AppKit shell, sign the installer, install to Applications, execute a product or certify arbitrary untrusted code.
