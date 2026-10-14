# Fixed r61 application lifecycle operator

This is a test-only wrapper around the passing r49 LaunchServices exercise. The original r44 package, r49 scripts, 34-file product build freeze and 11-file native UI probe freeze stay unchanged. No rebuild, re-sign, daily installation, TCC modification, model call or physical interaction occurs here.

`restore-project-application-r61.mjs <fresh absolute output root>` requires macOS arm64, RUNNER_TEMP and SEP_ARTIFACT_TOKEN. It is an exact derivation of the fixed r44 restorer with the r61 artifact IDs, hashes, sizes and evidence location. Three authenticated artifact ZIPs are streamed and verified; the two parts are checked individually and recombined with short-write handling, then the full 647522618-byte ZIP hash is verified. After extraction it verifies the exact package inventory, PROGRAM, BOOTSTRAP and existing signature. It writes a new **restore** RESULT.json with this VM's restored path. It preserves the original assembly RESULT at `evidence/project-build/RESULT.json` byte for byte.

The lifecycle command is:

```
node candidate-lifecycle.mjs ORIGINAL_RESULT ORIGINAL_RESULT_SHA RESTORE_ROOT FRESH_OUTPUT_ROOT
```

ORIGINAL_RESULT_SHA is fixed to `6c0b301d362ab8b576498c44852f0de35e55a0ebb8f040b3f9d429bc699dafa1`. RESTORE_ROOT contains the verified original archive, PACKAGE-INVENTORY.json and `restored/DSH SEP.app`. The wrapper uses this explicit fixed child path, not the original assembly's previous-VM absolute path. It binds the r61 commit, both manifests, inventory and streamed archive bytes before starting the unchanged lifecycle body.

The exercise derives through the exact r49 hide-effect transform first, then changes only its input binding. All code from the first cycle through final cleanup is byte-identical to r49. Each fresh cycle opens the actual outer app through `open -n -W`, requires the bound committed ready/activation observations, makes one hide call, and evaluates a new exact-PID/kernel-birth/bundle snapshot. A raw hide `false`/exit 1 is preserved and can be followed by a successful observed hidden state; wrong identity, malformed output, signals and timeout errors are not relaxed. Reopen must retain the same generation and desktop PID; success requires real closed, normal LaunchServices wait exit 0, outer/inner absence and the unchanged final package inventory. No SIGKILL or broad process matching is introduced. Failure cleanup remains a separate subsequent normal request and cannot retroactively pass the failed cycle.

`CANDIDATE-ORIGIN.json` records source hashes and exact transformations for the supervisor, exercise and restorer. Seven local candidate contracts and the 12 unchanged hide contracts are distinct from native execution. No new native success is claimed before CI runs this wrapper.

## Frozen native UI probe integration

The existing native-operator uses `readAssemblyReceipt`, which accepts a pass receipt containing programSha256 and restoredApplication. The raw original r61 assembly receipt contains a previous runner's absolute path and must **not** be passed directly across VMs. Pass the new verified restore `RESULT.json` and its actual SHA instead. Its source.assemblySha256 points back to the preserved original assembly evidence. The new path then goes through real `loadProgram` validation and the worker runs with that package's verified Node.

Stage all 11 files and seven dependencies in NATIVE-FREEZE.json for the two-round UI job. In particular, its fixed-source tests need settings-product/worker.mjs and operator.mjs; its runtime test imports need settings-ui/desktop-onboarding.mjs, desktop/smoke-inspector.mjs, workspace-diagnostic.mjs, product-control/native-launch-runner.mjs and managed-broker/program-manifest.mjs. The explicit 76-file application runtime comes from the restored package, not from test source. Supply the restored RESULT path/SHA to native-ci-step.yml. That job uses a separate fresh RUNNER_TEMP data root and never touches the fixed Finder data directory used by LaunchServices. Round 1 must pass with exact normal exit before round 2.

Native confirmation selection remains `not_run`; the read-only AX capability probe neither requests authority nor proves a dialog action. The LaunchServices wrapper verifies welcome lifecycle without Inspector. The two-round UI probe verifies actual renderer/preload/main/private-host traffic with Inspector. Their scopes remain separate.
