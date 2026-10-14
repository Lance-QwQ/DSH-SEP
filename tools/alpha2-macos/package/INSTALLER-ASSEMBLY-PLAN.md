# Installer application build plan

This is a new build operator, separate from the frozen r61 application and the verified installer runtime. It does not install, start a UI or publish a release. The eleven native source inputs are now frozen with `installer-native-inputs.json` status `build-ready`: this means ready for compilation only. The r68 application delegate tests passed 8/8 and fixed opener tests passed 7/7; production `main` composition and the complete Installer.app have not yet been compiled or exercised. No release readiness follows from this pin status.

Inputs are the fixed r61 original assembly RESULT plus its SHA-256 and an explicitly restored root under the current CI `RUNNER_TEMP`. The existing `candidate-binding.mjs` verifies the raw report, archive, inventory and exact current VM app path. Full live payload verification and signature checks remain required after binding. The source root is derived from the operator's own location and constrained to the checked-out CI workspace.

The new bundle is `DSH SEP Installer.app`, executable `Contents/MacOS/DSH SEP Installer`, with independent identifier `app.dshsep.macos.installer.alpha2.preview`. It is a regular visible installer application. It does not share the product's bundle identifier or data ownership. The product target and data directory remain the production controller's fixed current-account paths; this build operator never creates them.

The steps are:

1. Require a build-ready, exact eleven-file native source pin list: six implementation files and five headers. Read identity-bound regular source files, preserve raw bytes and hashes in an external build evidence directory, reject unlisted quoted local includes and test files. Production flags include only the actual INSTALLER hash; no test macro, arbitrary caller flags or runtime path override.
2. Use the already verified `assembleInstallerResources` implementation to create fresh resources, complete signed payload, fixed Node, exact sixteen-module JS closure and the two production helpers. Tests and UI source are absent from the installed JS runtime closure.
3. Write fixed Info.plist. Compile the captured native production entry, UI, admission, transport, application delegate and fixed opener. Recheck original source identities/hashes, captured bytes and pin bytes after compilation.
4. Sign only the outer app, without `--deep`. Do not re-sign or modify any Node, helper or payload role already bound by INSTALLER. Rebuild/compare the resource manifest and reload full configuration after signing. Nested signature verification uses `--deep --strict` only in verify mode.
5. Inventory the complete final installer, archive with `ditto`, restore to a separate fresh directory, verify inventory byte-for-byte, verify signatures and full fixed configuration again. Preserve all failed builds and logs; a failed/timed-out tool is not a claim that its whole process family was reaped.

First run the inexpensive compile-only preflight. It uses the same six sources,
five headers and compiler flags with an explicitly dummy manifest hash, and
**does not execute the resulting binary**. A success proves compilation only.

    node tools/alpha2-macos/package/preflight-installer-native.mjs "$RUNNER_TEMP/installer-native-preflight"

Only after that succeeds, run the complete build:

    node tools/alpha2-macos/package/assemble-installer-application.mjs \
      "$RUNNER_TEMP/project-restore/evidence/project-build/RESULT.json" \
      6c0b301d362ab8b576498c44852f0de35e55a0ebb8f040b3f9d429bc699dafa1 \
      "$RUNNER_TEMP/project-restore" "$RUNNER_TEMP/installer-application"

The output parent must exist and the final build directory must not exist. Keep RESULT, RESOURCES, package inventory, native input hashes and bounded command logs. Large installer archives should be transferred separately with byte counts and hashes, not embedded in diagnostic artifacts. Actual installer UI interaction, first-install confirmation, LaunchServices lifecycle, physical Mac behavior and Developer ID/notarization remain later verification scopes. The ad-hoc signature is not a boundary against same-account modification and re-signing.

The next integration order is build/restore → original Installer.app LaunchServices startup and normal close with the account still fresh → separate test-main linked to unchanged production UI/controller modules for actual buttons/sheet installation → fixed installed r61 product startup. The latter must bind PROGRAM `0e8867766b0c01307959b935ced963ae0edd0eeb576cb62eb1c1c3a84ee1a732`, BOOTSTRAP `3b36e6443d277fce03502c2913cf27ff74660cdef12124a00c6a812aa2818836`, and tree `1f984a51666bb94068141be79e5d46fcf9d79d0cb6f1ba84127f4fb99d879991`; historical r44 identity constants must not be reused. These three runtime evidence scopes stay separate. No AX/TCC changes or physical user operation are required by the test-only button harness.
