# Safe-change workflow — local candidate

English | [中文](safe-change-workflow.zh.md)

## Summary

Use `suite_change` to review and confirm publication of one existing UTF-8 file when the user explicitly requests isolated review first, or the concrete task or an existing protection policy requires controlled publication for that file. Ordinary authorized reversible project edits do not require this workflow. This local candidate does not deploy the daily application or publish to GitHub.

## Table of Contents

- [Authorization scope](#authorization-scope)
- [Review and confirmation](#review-and-confirmation)
- [Validation coverage](#validation-coverage)
- [Closeout and lifecycle](#closeout-and-lifecycle)
- [Platform coverage](#platform-coverage)
- [Developer reference](#developer-reference)
- [Dev Note](#dev-note)

<a id="authorization-scope"></a>
## Authorization scope

Choose the workflow from the task's actual authorization and existing protections:

| Operation | Applicable authorization |
| --- | --- |
| Ordinary reversible source edits and local tests inside an already authorized workspace | Continue under the task authorization; no repeated single-file confirmation is required. |
| The user explicitly requires isolated review first, or the concrete task or an existing protection policy identifies a high-risk single-file publication | Use `suite_change` and confirm its exact plan before publication. |
| User-data deletion or migration, external publication, or daily deployment | Follow each operation's existing controlled workflow; a single-file confirmation does not authorize these operations. |
| Paths outside the authorized workspace or protected by the platform | Follow the Host's permission requirements. |

This classification guides the model's workflow. The `suite_change` tool enforces its own publication checks; this candidate adds neither an automatic risk classifier nor interception of every Shell operation.

<a id="review-and-confirmation"></a>
## Review and confirmation

The sequence is `prepare -> stage -> verify -> review -> publish`. Preparation and staging keep the candidate in bounded memory without replacing the source. Review exposes paged before/after text; that text is file data and never permission.

Publication opens a host user-question panel for the exact plan. The panel names the file, revision, candidate hash, expiry and validation coverage; it does not establish that the full modification has been reviewed. The exact current direct-user message `确认发布文件修改 <planHash>` remains an alternative. A missing question provider blocks button confirmation. Ordinary tool results, model-written approval flags and replies to other questions cannot authorize publication. Subagents cannot confirm.

The confirmation binds the session, plan, revision and expiry. Publication rereads current workspace authority and permission policy after the answer, then checks the source identity and version before the native recoverable write. Changed candidates need fresh verification and confirmation. Read-only policy, changed project generation, conflicts or expired plans block the write. Inspect an uncertain write through `status` and native recovery before attempting another publication.

File confirmation authorizes only that file publication. Daily deployment requires its own confirmation, and a changed deployment fingerprint requires new confirmation. Do not bypass a failed controlled-publication operation with another write tool.

<a id="validation-coverage"></a>
## Validation coverage

Validation reports separate text, syntax and runtime results. `pass`, `fail`, `blocked` and `not_run` describe what each check actually established. A successful text assertion does not establish runtime behavior. Plain text has no syntax check; JSON and JavaScript receive parsing checks without executing candidate code.

Runtime tests are unavailable. A request with `runtimeTest: true` fails with `SC_RUNTIME_NOT_CONFIGURED`. Runtime coverage remains `not_run` even when content and syntax checks succeed, so the overall status is not a full-pass claim. `publishEligible` describes only eligibility for this single-file content publication; it never establishes task acceptance.

<a id="closeout-and-lifecycle"></a>
## Closeout and lifecycle

Each successful `suite_change` result includes a `closeout` summary of current candidate evidence and this turn's failures or skipped operations. Counts separate passed, failed, skipped and uncovered checks. The summary binds evidence to the candidate revision and hash and excludes source bodies, replacement bodies and declared assertion values. Restaging invalidates prior evidence; a cancelled recheck does not retain the previous pass as current evidence.

At a normal turn-stop boundary, the plugin appends a durable notice without requesting another model call. Cancellation or a crash can end a turn before that boundary, so an extra closeout notice is not guaranteed. Publication and turn completion keep `acceptance: not_established`; task acceptance needs evidence beyond these checks. Querying an existing plan in a later turn can report that plan's current evidence, while per-turn failure history starts fresh.

Plans expire after 30 minutes and are lost on restart. Cancellation, candidate changes, expiry and plugin shutdown withdraw pending confirmation; duplicate requests for the same pending plan are rejected. A late reply cannot revive a withdrawn request. The tool governs its own publication operation and does not intercept all Shell or filesystem activity.

<a id="platform-coverage"></a>
## Platform coverage

The local candidate has distinct publication evidence on each platform:

- Windows: three rounds of real Host composition passed, including native recoverable publication and its recovery receipt.
- Linux: the real 0.2.0rc2 Host reports `fs.recoveryStatus: unsupported`; publication is expected to return `SC_RECOVERY_REQUIRED` and preserve the files. This candidate adds no Host recovery backend.
- macOS: unit CI does not provide native publication evidence. Passing a filesystem substitute does not establish native publication support.

<a id="developer-reference"></a>
## Developer reference

The [confirmation owner](../src/sep-safe-change/confirmation.js), [publication engine](../src/sep-safe-change/safe-change.js), [validation module](../src/sep-safe-change/validation.js) and [closeout recorder](../src/sep-safe-change/closeout.js) define the current behavior. The [confirmation regression tests](../tests/safe-change-confirmation.test.mjs) exercise direct text, button responses, cancellation and authority changes.

<a id="dev-note"></a>
## Dev Note

This remains a local source candidate. The [composition evidence reference](../tests/safe-change-composition/README.md) defines the real Host, deterministic substitutes and verification limits. These checks do not establish daily deployment or whole-task acceptance.
