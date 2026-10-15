# Independent hide-effect product probe

This test-only candidate preserves the original r44 signed product and original application-observer.m. It does not replace r45/r48 evidence or change product behavior. Native product execution is not_run until its independent CI job completes.

r48's four independent AppKit specimens each returned requestSent=false / exit1 while a fresh exact-identity snapshot and the target didHide event proved hidden. Original hideStatus fail remains preserved. r48-cases.json contains all four CASE records and their raw observer stdout/stderr/command metadata, bound to run38586423216, commit116d36363a8f3d97991b244e0a250715dda7c633 and artifact SHA066514dc2d8069e1281b08dfc72c7a02d8494eafc4ae27e6aa823aade6a0e645.

The new observer classifier first admits a clean native snapshot with hidden=false. A single hide then supplies raw technical evidence. Only exit0/true or hide-specific exit1/false with parsed status pass, exact PID, kernel birth, bundle identifier and checked bundle path can proceed. Signals, killed commands, noninteger exit codes, errorCode, malformed output and identity changes reject. Each subsequent snapshot is another native process, must exit0 and match the same identity. A true API Boolean alone cannot establish an effect. The snapshot observation window is 10 seconds; each subprocess has the original 5-second command deadline, so an in-flight final snapshot can finish later but never yield a late pass.

derive.mjs accepts only exercise-application.mjs SHAecb9321b2c23ee9ef4e67117f31fbe6b86de9745c5f5a47994690c124e59d979. Four exact single-occurrence transformations add the classifier import, raw-evidence option, scoped raw-return branch, and single-hide effect observation. ORIGIN.json records all before/after text and output SHA. Three original cycles, controlled readiness, reopen acknowledgement, generation checks, normal quit and inventory revalidation remain. Actual hidden must be observed before reopen. The original failure cleanup may establish controlled inner closed without independently proving outer exit; it remains cleanup evidence, never a passing cycle.

Commands on a fresh macOS CI VM:

    node --test --test-reporter=tap tools/alpha2-macos/desktop/hide-effect-probe/observation.test.mjs tools/alpha2-macos/desktop/hide-effect-probe/derive.test.mjs
    node tools/alpha2-macos/package/restore-fixed-application-r44.mjs "$RUNNER_TEMP/hide-effect-r44"
    node tools/alpha2-macos/desktop/hide-effect-probe/run-product.mjs "$RUNNER_TEMP/hide-effect-r44" "$RUNNER_TEMP/hide-effect-product"

Only restore receives the artifact token. run-product uses a minimal child environment, account home, RUNNER_TEMP output and TMPDIR, no inspector/provider credentials. It binds the fixed r44 archive, PROGRAM, BOOTSTRAP and inventory receipt, records the exact input closure, and waits for the exact Node child. Its 15-minute deadline does not kill the child or product: missing close is blocked/cleanupUnknown. Normal failure cleanup remains inside the original derived operator. No later test may reuse that VM's data after unknown cleanup.

Outputs: hide-effect-product/RESULT.json, INPUTS.json, ORIGIN.json, generated exact source closure, runner stdout/stderr; lifecycle/RESULT.json, observation.jsonl and three cycle logs. This tests programmatic LaunchServices behavior, not physical Finder/Dock input. No paid model call is used.
