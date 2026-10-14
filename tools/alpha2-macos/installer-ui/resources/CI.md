# Resource assembly native verification

The r60 stub reached twelve genuine missing-implementation failures after signed fixture setup. Its original logs and source hashes are retained in `installer-resources-native-red-r60`. The unchanged twelve definitions passed in r63 (run 38631108180, job 116082665761; 12/12, zero skips/cancellations). ZIP, TAP, ten input files, sixteen runtime sources and each compiler log were independently matched. This verifies signed synthetic fixtures (43 entries / 131707 bytes), not the full application. To repeat, use the existing native macOS ARM64 image and pinned Node 24.21.0:

    node tools/alpha2-macos/installer-ui/resources/run-native.mjs "$RUNNER_TEMP/installer-resources"

The fresh output parent must be real and already exist. The five files here require the full current alpha2-macos source overlay: the test captures the real controller's reviewed sixteen-module static closure, the two fixed native C helpers, and the existing signed synthetic installation fixture. No payload binary is executed. All fixture signing and later helper compilation use fixed system executables, not a caller command string.

Keep TAP, RESULT and setup outputs. GREEN requires 12/12 with zero skipped/cancelled tests. A compiler, signature, path, setup or timeout failure is not an expected RED after implementation. Tests cover real signed payload accounting, no-overwrite, aliases, receipt/source modification, incomplete runtime closure, failed compilation retaining a partial candidate and restrictive umask.

Artifact selection should include `RESULT.json`, `native.tap`, and eventual `cases/**/RESOURCES-BUILD.json` plus `cases/**/*.log`, not fixture binaries or copied app trees. This stage does not build an outer AppKit shell, sign the installer, install to Applications, execute a product or certify arbitrary untrusted code.

The assembler uses only the verified payload's Node, never the build process's executable. Raw runtime/C inputs and compiler logs go to a fresh sibling `<Installer.app>.resources-build` directory; they are excluded from the payload and installed runtime closure. Compiler failure preserves all partial output. A compiler timeout/failed process is not evidence that every possible compiler descendant exited, and the diagnostic records that boundary. The trusted build workspace is not a sandbox against other code running as the same account.

## Actual fixed r61 payload probe — not yet run

After the separate fixed r61 restorer succeeds, run on a fresh dedicated macOS CI account:

    node tools/alpha2-macos/installer-ui/resources/full-payload-probe.mjs \
      "$RUNNER_TEMP/project-restore/evidence/project-build/RESULT.json" \
      6c0b301d362ab8b576498c44852f0de35e55a0ebb8f040b3f9d429bc699dafa1 \
      "$RUNNER_TEMP/project-restore" "$RUNNER_TEMP/installer-full-resources"

The first argument is the original r61 assembly RESULT, not the normalized restoration RESULT. `candidate-binding.mjs` binds it to the fixed archive, manifest, inventory and new VM's exact restored app path. The probe then verifies the complete live payload and its signature. It uses the actual sixteen-module installer controller closure plus compiled production helpers, with no test-home or executable override. Ensure the CI overlay contains `candidate-binding.mjs`, `candidate-pins.json` and their existing dependencies.

The probe builds only fresh installer resources and starts that resource tree's fixed Node/controller-main pair. It sends only `listRecovery`, `preview`, `cancel`, `listRecovery`, `close`; `confirm` and `resume` are explicitly disallowed. Existing target/data/governance reject the fixture without deletion or adoption. Account paths and source package are rechecked unchanged. Success requires the actual closed receipt, stdout EOF and exact child exit 0; unknown completion requests private-input EOF, retains a blocked result and is left to CI teardown without force killing. This does not test outer installer UI, signing, installation or product launch.

Keep the probe's `RESULT.json`, `ASSEMBLY.json`, `ACCOUNT-*.json`, `Installer.app/Contents/RESOURCES-BUILD.json`, and sibling compiler logs. Do not upload copied application or runtime binaries as part of the diagnostic artifact. The assembly implementation hash remains `fab25ac82c4e991deeb967c8d967ed81872edce1b0e5106664e38c4b26dd99aa`; only this operator and current evidence documents are new.
