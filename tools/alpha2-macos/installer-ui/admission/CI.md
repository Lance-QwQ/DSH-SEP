# Native RED command

Use the existing pinned macOS 15.7.9 / 24G830 / Darwin 24.6.0 ARM64 CI image and Node 24.21.0. The output parent must already exist and be its real path; the output itself must be new.

    node tools/alpha2-macos/installer-ui/admission/run-native.mjs "$RUNNER_TEMP/installer-admission"

Required inputs: all nine files in this directory and the read-only `installer-ui/manifest.mjs`. No dependency installation, Node child execution or real payload is needed. `run-native.mjs` invokes the system clang with ARC, warnings-as-errors and Foundation for each independently compiled bundle. It records exact input hashes, system versions, per-case compile/stdout/stderr logs, native TAP and RESULT.

There are 29 definitions. The current implementation is deliberately absent. Expected RED means all fixtures compile and all 29 reach `SEP_INSTALLER_ADMISSION_NOT_IMPLEMENTED` assertion failures. A compile failure, timeout, malformed fixture or missing TAP count is not feature RED. Preserve the original output and classify it before implementing. GREEN requires 29/29, zero skipped/cancelled definitions and no setup failure.

The two explicit read-boundary tests use an inherited private fd 3, a fixed 5-second rendezvous and a 12-second probe deadline. Only a hung, precisely spawned synthetic probe can be terminated by the test runner; that exceptional cleanup is recorded in `hook.json`. It does not prove global process cleanup and is not production behavior. Ordinary probe execution has a 6-second bound, each definition 45 seconds, and the runner 16 minutes. The inert fixture cannot spawn product/helper work.

Later production linkage includes `installer-admission.m` and its header, the fixed manifest hash macro and the real AppKit main. It must not define `SEP_INSTALLER_ADMISSION_REPORT` or `SEP_INSTALLER_ADMISSION_TEST_HOOK`, and must not ship this probe, tests or runner. The separate signed bundle-config tests and actual installer UI tests remain separate evidence groups.
