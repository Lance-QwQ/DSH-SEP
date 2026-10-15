# Native admission validation

Use the existing pinned macOS 15.7.9 / 24G830 / Darwin 24.6.0 ARM64 CI image and Node 24.21.0. The output parent must already exist and be its real path; the output itself must be new.

    node tools/alpha2-macos/installer-ui/admission/run-native.mjs "$RUNNER_TEMP/installer-admission"

Required inputs: all nine files in this directory and the read-only `installer-ui/manifest.mjs`. No dependency installation, Node child execution or real payload is needed. `run-native.mjs` invokes the system clang with ARC, warnings-as-errors and Foundation for each independently compiled bundle. It records exact input hashes, system versions, per-case compile/stdout/stderr logs, native TAP and RESULT.

There are 29 unchanged definitions. Historical r56 completed expected RED: all fixtures passed their compile assertions and then failed at the missing implementation; the positive case observed the bound stub's exit 78 and the remaining 28 observed its explicit `SEP_INSTALLER_ADMISSION_NOT_IMPLEMENTED` code. Its artifact retained TAP/RESULT but omitted per-case logs. Both read-boundary tests stopped before their mutations. The current implementation awaits GREEN, requiring 29/29, zero skipped/cancelled definitions and no setup failure. A compile failure, timeout, malformed fixture or missing TAP count is never feature RED.

Upload `RESULT.json`, `native.tap`, `system.txt`, `cases/**/*.log` and `cases/**/hook.json`. Do not upload the synthetic bundle binaries or payload copies. The two hook receipts must show `mutated:true`, no hook error, exit 78, no signal and cleanup `none`; a timeout/forced probe termination is a failed test even if a later cleanup removes the process.

The two explicit read-boundary tests use an inherited private fd 3, a fixed 5-second rendezvous and a 12-second probe deadline. Only a hung, precisely spawned synthetic probe can be terminated by the test runner; that exceptional cleanup is recorded in `hook.json`. It does not prove global process cleanup and is not production behavior. Ordinary probe execution has a 6-second bound, each definition 45 seconds, and the runner 16 minutes. The inert fixture cannot spawn product/helper work.

Later production linkage includes `installer-admission.m` and its header, the fixed manifest hash macro and the real AppKit main. It must not define `SEP_INSTALLER_ADMISSION_REPORT` or `SEP_INSTALLER_ADMISSION_TEST_HOOK`, and must not ship this probe, tests or runner. The separate signed bundle-config tests and actual installer UI tests remain separate evidence groups.
