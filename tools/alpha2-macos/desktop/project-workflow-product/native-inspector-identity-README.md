# r5 Inspector identity carrier

This is a test-only successor to the frozen r74 r4 carrier. Product bytes, UI actions, deadlines and ownership cleanup are unchanged.

r74 built and restored successfully, but its first UI round failed at `inspector-early` while requiring Electron. The reader failed before returning its process identity. The evidence does not distinguish early module initialization from a wrong Inspector target. The ASAR path in the require stack was provided by the test, and does not establish target identity. Cleanup was attempted but remained unconfirmed; round 2 was not run.

r5 first reads only `process.pid`, `process.execPath`, `process.versions.electron` and `process.type`. It saves these technical fields and applies the existing exact owned desktop PID check immediately. This sample does not authorize UI actions. After the unchanged trusted surface-ready wait, the original Electron reader and exact appPath/isReady checks still apply. No import or failed identity check is retried.

The actual worker source seam is exercised in a controlled VM where Electron import is unavailable. The same final six tests report old r4 RED (2 pass, 4 fail), then r5 GREEN (6 pass). The original fifteen contracts plus these six report 21 pass, zero failures/skips/cancellations on Windows Node 24.21.0. These are portable contracts, not native UI evidence.

Verify without generating or modifying files:

```sh
node tools/alpha2-macos/desktop/project-workflow-product/derive-inspector-identity.mjs --verify
node --test --test-reporter=tap \
  tools/alpha2-macos/desktop/project-workflow-product/native-contract.test.mjs \
  tools/alpha2-macos/desktop/project-workflow-product/native-authority-derive.test.mjs \
  tools/alpha2-macos/desktop/project-workflow-product/native-readiness.test.mjs \
  tools/alpha2-macos/desktop/project-workflow-product/native-readiness-derive.test.mjs \
  tools/alpha2-macos/desktop/project-workflow-product/native-inspector-identity.test.mjs
```

The identity test defaults to r5. `SEP_IDENTITY_TEST_WORKER=native-worker-r4.mjs` selects the preserved RED carrier only for regression evidence.

After the root operator restores and verifies the exact r74 package into RUNNER_TEMP, invoke:

```sh
node tools/alpha2-macos/desktop/project-workflow-product/native-operator-r5.mjs "$RESTORE_RESULT" "$RESTORE_RESULT_SHA256" "$OUTPUT/round1" "$OUTPUT/data" 1
node tools/alpha2-macos/desktop/project-workflow-product/native-operator-r5.mjs "$RESTORE_RESULT" "$RESTORE_RESULT_SHA256" "$OUTPUT/round2" "$OUTPUT/data" 2
```

Run the second command only if the first succeeds. Use fresh absolute RUNNER_TEMP output paths. The operator uses the verified package Node, records 21 operator inputs, and preserves the old bounded cleanup/unknown ownership behavior. Archive all original evidence plus `IDENTITY-early.json` and `IDENTITY-surface-ready.json`, even on failure. Exact early PID mismatch remains an immediate rejection. Native UI, actual confirmation and physical interaction remain `not_run` until separately observed.
