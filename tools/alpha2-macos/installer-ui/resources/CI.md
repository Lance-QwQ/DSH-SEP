# Resource assembly native verification

The r60 stub reached twelve genuine missing-implementation failures after signed fixture setup. Its original logs and source hashes are retained in `installer-resources-native-red-r60`; the subsequent implementation is a candidate pending native GREEN. Run the same twelve unchanged definitions using the existing native macOS ARM64 image and pinned Node 24.21.0:

    node tools/alpha2-macos/installer-ui/resources/run-native.mjs "$RUNNER_TEMP/installer-resources"

The fresh output parent must be real and already exist. The five files here require the full current alpha2-macos source overlay: the test captures the real controller's reviewed sixteen-module static closure, the two fixed native C helpers, and the existing signed synthetic installation fixture. No payload binary is executed. All fixture signing and later helper compilation use fixed system executables, not a caller command string.

Keep TAP, RESULT and setup outputs. GREEN requires 12/12 with zero skipped/cancelled tests. A compiler, signature, path, setup or timeout failure is not an expected RED after implementation. Tests cover real signed payload accounting, no-overwrite, aliases, receipt/source modification, incomplete runtime closure, failed compilation retaining a partial candidate and restrictive umask.

Artifact selection should include `RESULT.json`, `native.tap`, and eventual `cases/**/RESOURCES-BUILD.json` plus `cases/**/*.log`, not fixture binaries or copied app trees. This stage does not build an outer AppKit shell, sign the installer, install to Applications, execute a product or certify arbitrary untrusted code.

The assembler uses only the verified payload's Node, never the build process's executable. Raw runtime/C inputs and compiler logs go to a fresh sibling `<Installer.app>.resources-build` directory; they are excluded from the payload and installed runtime closure. Compiler failure preserves all partial output. A compiler timeout/failed process is not evidence that every possible compiler descendant exited, and the diagnostic records that boundary. The trusted build workspace is not a sandbox against other code running as the same account.
