> Current evidence (2026-10-15): the three-stage native revalidation, new installer and two installed-application cycles passed on macOS 15.7.9 ARM64 / APFS. See [EVIDENCE-20261015.md](EVIDENCE-20261015.md). Full public Mac certification remains blocked. Preparation-time not_run/unverified statements below describe the pre-execution state or the scope of one operator; fixed pins and historical receipts remain byte-identical. This documentation update does not change the tested installer.

# Current-source native macOS revalidation

Run only on real macOS 15 ARM64, APFS, Node 24.21.0 with Xcode command-line tools. This test-only entry neither builds an application nor installs or uploads anything. The original SOURCE_INPUTS.json/FREEZE.json remain historical and unchanged. This directory owns a new INPUTS.json generation and a replayable WORKFLOW-ORIGIN.json for the 17 unchanged workflow definitions. The fixture uses the current readonly transaction factory, lifecycle and Profile; user-confirmation authority is explicitly synthetic.

## Invocation

Set SEP_OFFICIAL_HARNESS and SEP_MAC_BUNDLE_ROOT to the hash-verified r44 program hostRoot and bundleRoot (do not point at a daily installation). Parent CI must verify/restore that program before invoking. RUNNER_TEMP must be defined. Use a fresh direct child of its canonical real path:

```sh
temp="$(cd "$RUNNER_TEMP" && pwd -P)"
node tools/alpha2-macos/native-revalidation/run-native.mjs "$temp/mac-native-low-review-r83"
```

The runner reads the actual process platform/architecture, macOS version and diskutil APFS receipt. Unsupported platforms exit 78 before creating output. There is no platform override. Both project/attachment C helpers compile without SEP_POSIX_TEST. Node TAP groups require exactly the planned definitions, zero failures/cancellations/skips/todos. Missing/duplicate summaries fail. Existing native-helper, transaction, Profile and workflow fixtures keep their actual IO; VM/dependency seams remain separately labelled portable evidence.

Groups: native file lifecycle 33; native transactions 29; native attachment IO 12; portable business/authorization/parser contracts 24; portable origin/control 18; pending-source binding 1; current native workflow 17; complete-source derived import 1. Total 135 definitions. The derived-import test uses dependency-hook.mjs only to resolve missing bare dependencies against the verified official Alpha.2 host; it does not replace functions or run a model.

RESULT.json records per-command exits, log hashes, separate group counts, binary hashes and pre/post source verification. Every log is retained. No expected group may be absent. Any failure returns nonzero; consumers must not build/package on failure. Workflow CLEANUP.jsonl is required and records fixture-owned controller receipts. These are not a whole-system zero-resource audit. The outer CI timeout is separate; forced workflow/job cleanup must never rewrite an earlier blocked result as pass. Full desktop, physical interaction, newly installed package and complete Mac certification remain outside this runner.

run-native.test.mjs tests TAP handling and the actual non-Mac refusal; on a native Mac the latter specifically marks itself skipped and is not counted in the 135 native acceptance definitions.
