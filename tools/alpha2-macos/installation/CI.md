# First-install native RED contract

Run on the same pinned macOS 15.7.9 ARM64 runner with Node 24.21.0. The historical r46 source intentionally returned `SEP_INSTALL_NOT_IMPLEMENTED`; all 13 tests failed at that missing implementation after their real signed schema4 fixture was built. Setup/compiler/signing failures do not count as RED. The r47 candidate implements the same API and is awaiting native verification; its implementation must not be described as passing until the original definitions have actually run successfully.

```
node tools/alpha2-macos/installation/run-native.mjs "$RUNNER_TEMP/first-install"
```

Retain `RESULT.json`, `native.log`, OS metadata and input hashes regardless of exit status. The source dependency closure is installation's six `.mjs`/`.c` files plus package/package-inventory.mjs, package/bootstrap-manifest-builder.mjs, desktop/managed-broker/program-manifest.mjs and bootstrap/production-manifest.mjs. Existing full source overlay already contains those read-only imports. No artifact app is executed. Synthetic signed fixtures are deliberately small and do not replace the later full-package install/first-boot test.

`prepareFirstInstall({sourceApp,parent,dataRoot,receipt,helperPath,helperSha256})` is a trusted internal core API. The future product wrapper will derive a fixed account target/data root; this test harness passes fresh temporary paths. There is currently no public CLI or production bootstrap integration. A plan fixes transactionId, source/parent identities, receipt and desired final basename `DSH SEP.app`. Execute/recover accept that immutable plan and exact helper binding; optional `onProgress` is a trusted control-plane observer, never a model-supplied callback or command.

The two SIGKILL cases interrupt after reliable verified/published phases. A still-live native coordinator must hold the same installation lease and make recovery BUSY. No automatic deletion or rollback occurs. Cancel/timeout cannot stand in for native completion. More granular interruption during an individual large-file copy remains a separate test to add after this initial contract.
