# Isolated native reproduction

Requirements: macOS 15 arm64, Node 24.21.0, Xcode command-line tools. No npm
dependency, desktop carrier, private Profile, credentials or model service is
needed. Install the fixed subset at `tools/alpha2-macos`; use a fresh real
`RUNNER_TEMP` child on every run. The CI template records both test groups and
their independent exit codes; missing preflight is a failure, never a green skip.

```bash
set -euo pipefail
root="$(cd "$RUNNER_TEMP" && pwd -P)/project-workflow-native"
mkdir "$root"
node tools/alpha2-macos/project-workflow/verify-inputs.mjs > "$root/SOURCE-VERIFIED.json"
xcrun clang -std=c11 -O2 -Wall -Wextra -Werror -arch arm64 \
  tools/alpha2-macos/apfs-tree/native-tree.c -o "$root/native-tree"
export SEP_MAC_TREE_HELPER="$root/native-tree"
export SEP_MAC_TREE_HELPER_SHA256="$(shasum -a 256 "$root/native-tree" | cut -d ' ' -f 1)"
export SEP_MAC_WORKFLOW_TEST_ROOT="$root/fixtures"
export SEP_MAC_WORKFLOW_UNIT_ROOT="$root/unit-fixtures"
sw_vers > "$root/system.txt"
uname -a >> "$root/system.txt"
node --version >> "$root/system.txt"
node --test --test-reporter=tap --test-concurrency=1 --test-timeout=30000 \
  tools/alpha2-macos/project-workflow/preview.test.mjs \
  tools/alpha2-macos/project-workflow/derive-sources.test.mjs \
  tools/alpha2-macos/project-workflow/control-boundaries.test.mjs \
  > "$root/supplemental.tap" 2>&1
set +e
node --test --test-reporter=tap --test-concurrency=1 --test-timeout=30000 \
  tools/alpha2-macos/project-workflow/native-workflow.test.mjs \
  > "$root/native.tap" 2>&1
code=$?
printf '%s\n' "$code" > "$root/EXIT-CODE.txt"
exit "$code"
```

CI allows 12 minutes separately from the per-test 30-second limit. Retain
`SOURCE-VERIFIED.json`, system/exit files, both TAP logs, `fixtures/PREFLIGHT.json`
and `fixtures/CLEANUP.jsonl`. Missing cleanup is not release evidence; CI process
cleanup cannot retroactively turn blocked workflow close into pass.

## Source and transfer binding

`FREEZE.json` lists the exact new directory files; `SOURCE_INPUTS.json` fixes
seven unchanged baseline files. `verify-inputs.mjs` checks both lists, the original
17-test SHA and replayed read-only derivation before native execution. The baseline:

* `apfs-tree/native-tree.c`, `apfs-tree/project-tree.mjs`
* `transactions/mac-managed-project.mjs`, `transactions/transaction-store.mjs`,
  `transactions/document-copies.mjs`
* `lifecycle/managed-project-lifecycle.mjs`
* `profile/controlled-files.mjs`

Only that source subset and the new directory are needed. Do not transfer an
entire local project, daily installation, data, credentials or environment dump.
The baseline files are not edited. Generated `derived-transaction-store.mjs` and
`derived-lifecycle.mjs` are verified by exact replay against `READONLY-ORIGIN.json`.
`build-derived.mjs` is an operator regeneration command, not a runtime mutation.

The native fixture's two import changes select the candidate factory and derived
lifecycle. All native helper, database, transaction, Profile and staging code
is real. The original 17 definitions are unchanged. Supplemental counts are
separate: preview 9, origin 2, control 5. Do not add repeated runs to unique counts.

## Auxiliary POSIX only

`prepare-posix-replay.mjs <fresh-absolute-output-directory>` records source and
result hashes for a Linux-only test fixture and the unchanged 17 definitions.
It replaces the fixture factory/preflight and test fixture import only; the
production Darwin factory is unchanged. Linux builds the exact original helper
with `-DSEP_POSIX_TEST` and may need `-Wno-error=unused-result` for GCC. These
compiler switches and helper hash must be recorded. This replay is not macOS/APFS
acceptance and has no public installation use.

The r48 initial native RED and earlier POSIX setup failures remain separate
historical evidence. New outputs never overwrite them. Native confirmation UI,
owned cross-process transport, first project import, multiple projects, source
export, Finder/LaunchServices and application-wide shutdown are outside these
control-layer tests and remain unverified here.
