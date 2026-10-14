# Native test skeleton reproduction

This command intentionally uses the blocked adapter until a reviewed candidate
is implemented. A red `SEP_MAC_WORKFLOW_NOT_IMPLEMENTED` outcome is retained as
RED evidence, never converted into a pass. This document adds no Release or daily
installation step.

Prerequisites: native macOS 15 arm64, Node 24, Xcode command-line tools; all source
inputs match `SOURCE_INPUTS.json`. No external npm package, official desktop
carrier, private Profile, credentials, model service or paid account is needed.
Use a fresh physical `RUNNER_TEMP` child for every run. The native helper is built
from the exact recorded source and its resulting binary hash is passed explicitly.

Run from the repository root after installing the source subset at
`tools/alpha2-macos`:

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
sw_vers > "$root/system.txt"
uname -a >> "$root/system.txt"
node --version >> "$root/system.txt"
set +e
node --test --test-reporter=tap --test-concurrency=1 --test-timeout=30000 \
  tools/alpha2-macos/project-workflow/native-workflow.test.mjs \
  > "$root/native.tap" 2>&1
code=$?
printf '%s\n' "$code" > "$root/EXIT-CODE.txt"
exit "$code"
```

The CI job deadline is 12 minutes, separately from each 30-second test deadline.
If the platform, source binding or helper preflight fails, the native cases remain
unexecuted; do not count cancelled tests as feature failures or passes. If a test
deadline is reached, retain it and the last cleanup record. CI process cleanup
does not prove that a workflow close operation released its resources.

Keep `SOURCE-VERIFIED.json`, `system.txt`, `native.tap`, `EXIT-CODE.txt`,
`fixtures/PREFLIGHT.json`, and `fixtures/CLEANUP.jsonl`. The fixture directories
contain synthetic file bodies only. A later successful retry has its own output
root and does not overwrite this first RED evidence. Do not upload private host
paths, API keys, sessions or environment dumps.

## Transfer allowlist

All files in this new `project-workflow/` directory plus these unchanged baseline
files are required. Do not transfer the whole C: project or existing daily data:

* `apfs-tree/native-tree.c`
* `apfs-tree/project-tree.mjs`
* `transactions/mac-managed-project.mjs`
* `transactions/transaction-store.mjs`
* `transactions/document-copies.mjs`
* `lifecycle/managed-project-lifecycle.mjs`
* `profile/controlled-files.mjs`

The fixture's real storage and Profile cannot provide the planned read-only
generation/diff extension yet. The later origin-pinned extension must be present
in the candidate used for GREEN; a fixture must not implement those product
behaviors on the side or open its own database to make the tests pass.

## Fixed acceptance cases

There are 17 definitions: read-only status/listing, bounded review without queue
recursion, exact one-use approval, forged approval rejection, candidate-byte
drift, baseline drift, newer model candidate, cancellation, document navigation,
close/release, restart/reselection, bounded history and restore planning, durable
intent recovery, bounded diff/omission acknowledgement, exact discard, model
management denial, and malformed/path/unbounded input rejection.

This skeleton does not yet include physical native confirmation UI, browser or
Electron transport authorization, first project import UI, multi-project switching,
external source overwrite/export, unknown cleanup, or application-level shutdown.
