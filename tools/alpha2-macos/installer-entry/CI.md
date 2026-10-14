# Installer controller native validation

Historical r50 has 22 genuine missing-implementation failures and no setup failures. In r53, the original 22 and all 5 boundary definitions passed; the independent list 4 failed exactly at its missing-implementation entry. Both runs have immutable artifacts and independently checked input hashes. The current list candidate awaits GREEN and regression of the original 22. Do not call it a product installer.

Run on the already pinned native macOS 15.7.9 / 24G830 / Darwin 24.6.0 ARM64 image, Node 24.21.0:

    node tools/alpha2-macos/installer-entry/run-native.mjs "$RUNNER_TEMP/installer-entry"

Four native account definitions and eighteen controller definitions must all pass with zero skips/cancellations before acceptance. A compile, package-signing, fixture or transport failure is not feature RED. The runner saves compile logs, TAP logs, exact source hashes and RESULT even when setup fails. The original test bytes are unchanged.

Required source closure additionally includes controller-core.mjs, candidate.mjs and native-client.mjs; unchanged installation/first-install.mjs, install-native.c, fixture.mjs; package/package-inventory.mjs, bootstrap-manifest-builder.mjs; desktop/managed-broker/program-manifest.mjs; bootstrap/production-manifest.mjs. The existing full source overlay contains these imports. No package runtime or original core is edited.

After the original 22 pass, run the independent list extension:

    node tools/alpha2-macos/installer-entry/run-list-native.mjs "$RUNNER_TEMP/installer-entry-list"

It has four unchanged definitions, now expected to pass. The r53 RED evidence retains the previous explicit SEP_INSTALLER_RECOVERY_LIST_NOT_IMPLEMENTED failures. Its three populated-record cases use real completed signed-fixture installs, so failures before list invocation must be classified separately. Keep its RESULT/TAP distinct from the original 22. Boundary tests may run independently with node --test boundaries.test.mjs (five definitions).

The real signed fixture does not execute its app. Temporary test homes exist only under the runner's private output and are accepted exclusively by a separately compiled SEP_INSTALLER_ENTRY_TESTING helper and testing.mjs. The production helper must reject that argument. A production read-only account check may inspect the runner account but must not create files.

The fixed test-only onProgress callback pauses at durable boundaries. SIGKILL applies only to the known fixture Node controller. Tests wait for that exact child's exit and use production leases/recovery for continuation; they do not claim that killing the caller proves all helper processes were gone. Initial scaffold failures start no installation helper work.

Production packaging must exclude testing.mjs, fixtures, tests, test native binary, CI scripts and any test home override. The eventual native AppKit/NSBundle entry is a separate stage; current source/receipt/helper inputs are trusted internal assembler configuration, not public CLI or model parameters.
