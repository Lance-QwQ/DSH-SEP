# Installer native revalidation operators

These operators create a new evidence generation from the repaired source. The historical r74/r79 operators, native sources, tests and evidence remain unchanged. Running a stage with `pending` pins is intentionally refused. No operator changes main, publishes a release, installs on a user's daily machine, or accepts a platform override.

## Separate trust stages

1. The first Mac CI run executes current native/business tests and builds an application. It then verifies all 84 packaged runtime files against the current source and executes the 41 current-source test definitions using the installed helpers and host. This is source execution plus installed-byte equality evidence; it is not execution of those tests inside the AppKit application. An operator downloads and independently verifies the original output bytes before updating the payload pins.
2. The second run restores only that fixed application and builds/ad-hoc signs/restores an installer. The operator independently reviews and fixes this second run's installer output pins.
3. The third run restores only the fixed installer, verifies its signature and inventory, exercises its actual NSButton/NSAlert installation controls, and launches the installed application twice. Test-only native harness/observer bytes remain identical to r79. No production installer code is patched by the harness.

Two JSON files separate program authority from transport: `installer-pins.json` binds the program and test receipts, while `installer-transport-pins.json` binds the exact GitHub Actions artifacts. A successful same-job JSON document does not authorize the next stage without independently fixed hashes.

## Runtime and output paths

Execution requires the previously scoped **macOS 15.7.x ARM64** GitHub runner with a GUI login session, Node 24, `/usr/bin/python3`, Xcode command line tools (`clang`, `codesign`), `ditto`, `plutil`, `open`, `osascript`, and the original native prerequisites of the pinned application. The installed application's copied Node executable is its runtime authority. The operator's Node runs packaging/verification only. Native desktop interaction is not emulated on Windows.

All arguments must be canonical absolute paths under `RUNNER_TEMP`, with an existing canonical parent and a fresh output leaf. Existing output directories are refused. If a failed run leaves an artifact, use a new output leaf; do not overwrite the failed evidence. No user data or API model credentials are inputs. `SEP_ARTIFACT_TOKEN` is used only by the download step and is omitted from verifier/build/native child environments.

Commands below use `<op>` for the checkout's `tools/alpha2-macos/native-revalidation` and `<T>` for the canonical `RUNNER_TEMP`. CI must substitute actual paths without shell word splitting.

### Stage two: build the installer

```text
node <op>/installer-download.mjs payload <T>/payload-download
node <op>/installer-restore-local.mjs payload <T>/payload-download <T>/payload-restored
node <op>/installer-build.mjs <T>/payload-restored/SOURCE-ASSEMBLY.json <fixed payload assemblySha256> <T>/payload-restored <T>/current-installer
```

The download emits original `RESULT.json`, `PACKAGE-INVENTORY.json`, `DSH-SEP-macOS-Alpha2-project-preview.zip`, `APP-BUILD-REVALIDATION.json`, and `APP-POST-VERIFICATION.json`. It also preserves downloaded outer ZIPs and emits `DOWNLOAD-VERIFIED.json`/`DOWNLOAD-RESULT.json`; these two documents establish transport only, not native certification.

Restore preserves the original assembly bytes as `SOURCE-ASSEMBLY.json`, copies both proof files, extracts into `restored/DSH SEP.app`, and emits a new `RESULT.json`. Build accepts the **original** assembly hash, not the normalization receipt's hash.

`current-installer` emits `RESULT.json`, `PACKAGE-INVENTORY.json`, `RESOURCES.json`, `RESOURCES-BUILD.json`, compiler/signature/archive logs, the final `DSH-SEP-macOS-Alpha2-installer-preview.zip` and its independently restored app. It declares installation and UI certification unverified until stage three.

### Stage three: actual install and two installed-product cycles

```text
node <op>/installer-download.mjs installer <T>/installer-download
node <op>/installer-restore-local.mjs installer <T>/installer-download <T>/installer-restored
node <op>/installer-run-full.mjs <T>/installer-restored/RESULT.json <sha256 of that restore RESULT> <T>/installer-integration
```

The wrapper additionally requires `restored.source` to be byte-structure equivalent to the separately committed installer pin, then checks exact original assembly, inventory, installer manifest and tree. The caller-supplied normalization hash cannot substitute a different candidate. The integration records native installer startup/normal close, six real control assertions, receipts for a fresh-profile and same-profile application cycle, and installation-tree stability. Boundaries such as physical input, private-data continuation, Developer ID/notarization and complete public certification remain separately declared.

## Fixed program pin schema

Both stages need `status: ready`, a 40-hex original build `commit`, exact `artifact` filename, `assemblySha256/assemblyBytes`, `archiveSha256/archiveBytes`, `inventorySha256/inventoryBytes`, and `treeSha256`.

Payload also requires `programSha256`, `bootstrapSha256`, `sourceTreeSha256`, `entries`, `totalBytes`, the exact ordered 84 `runtime` rows (`path/source/sha256`), and exactly these ordered `verification` rows (`name/bytes/sha256`):

- `APP-BUILD-REVALIDATION.json`: original `<current-app>-REVALIDATION.json` bytes. Its commit, source tree, assembly hash, program/bootstrap, archive/tree, runtime count and unchanged claims must match the fixed payload.
- `APP-POST-VERIFICATION.json`: original application post-build `<post>/RESULT.json` bytes. It must be `mode: built`, bind the same commit/source tree/assembly/program, report exactly 41 passed and no failed/skipped/cancelled tests, no paid calls, and unchanged source/application.

Installer also requires `manifestSha256`; `payload` with `sourceAssemblySha256` plus the fixed payload program/bootstrap/archive/tree/entries/totalBytes; exact ordered `nativeInputs` (11), `runtimeInputs` (16) and `helperInputs` (2) path/hash rows.

`installer-sources.json` independently pins the unchanged 11 production native sources, 16 controller runtime modules, two helpers and all derivation inputs. Four `.origin.json` files mechanically replay the transformations of the historical operators into the current operators. Changing this source contract requires another explicit reviewed generation.

## Fixed transport pin schema

Top-level `schema: 1` and `repository: Lance-QwQ/DSH-SEP`; each stage has `status: ready`, `sourceCommit` equal to its program pin's commit, original `runId`, and:

```json
{
  "artifacts": [{
    "id": 123, "name": "exact-actions-artifact-name",
    "bytes": 1234, "sha256": "64 hex",
    "members": [{"path": "exact/member/name", "bytes": 123, "sha256": "64 hex"}]
  }],
  "outputs": [{"name": "RESULT.json", "artifactId": 123, "member": "exact/member/name"}],
  "parts": [{"index": 1, "artifactId": 123, "member": "archive.zip", "bytes": 1000, "sha256": "64 hex"}]
}
```

`members` enumerates **every** regular outer ZIP member, including empty diagnostics. Duplicate/unlisted/traversal/symlink/encrypted members are refused. ZIP metadata, every member hash and bounded expanded length are checked without extracting member paths. `outputs` enumerates exactly the two assembly/inventory documents and, for payload, the two proof files above. `parts` can contain one complete archive or sequential fixed fragments; the reconstructed whole must equal the fixed archive size/hash. Paths inside the artifact may differ from output names; output names are never taken from arbitrary ZIP entries.

Before download, authenticated GitHub API metadata must match id/name/run/head SHA/size/digest and report not expired. The token is never forwarded to signed blob URLs, and non-HTTPS/foreign hosts/extra redirects are refused. Missing old artifact digests or expired artifacts are errors, not reasons to skip verification.

## Local binding tests

These tests inspect production operator bytes and synthetic pinned ZIPs; they do not claim Mac native execution:

```text
node --test <op>/installer-binding.test.mjs <op>/installer-source.test.mjs <op>/installer-transport.test.mjs
SEP_INSTALLER_TEST_ROOT=<fresh allowed test root> python3 -B <op>/installer-verify-download.test.py
```

The Python test leaves its small, uniquely named fixtures under the explicitly configured root. On this Windows preparation host all outputs use `D:\AIData\ProjectWork\DSH\macos-native-revalidation-20261015-r1\installer-unit`. The source tests replay all four derivations, check unchanged native/controller/helper bytes, and reject unavailable stage pins. Remote network transfer, `ditto`, code signing and GUI lifecycle remain unverified until their actual Mac CI runs finish.
