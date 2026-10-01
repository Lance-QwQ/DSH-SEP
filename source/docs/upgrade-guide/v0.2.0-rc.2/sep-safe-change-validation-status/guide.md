---
kind: upgrade-guide
description: "SEP suite_change verification results separate incomplete test coverage from single-file publication eligibility."
---

# SEP safe-change verification no longer reports unrun tests as a pass

English | [中文](guide.zh.md)

## Change

For installations that enable the local SEP `suite_change` tool, `action: verify` previously returned top-level `status: pass` and `validation.status: pass` when its declared content and syntax checks passed, although runtime tests had not run. These fields now report `not_run` when runtime coverage is absent. Text files also report their syntax check as `not_run`. Tool-result consumers that branch on the old values must distinguish publication eligibility from validation coverage. The tool arguments and the lifecycle status returned by `action: status` are not renamed.

`validation.publishEligible` describes only the controlled single-file content publication conditions. Neither that field, a committed publication nor a completed turn establishes task acceptance. This change requires no stored Session migration and does not deploy the local candidate.

## Migration

1. Update client adapters, tool-result renderers and scripts that read a `suite_change` verification result. Report `validation.results` by category and status; preserve `blocked` and `not_run` instead of converting them to a pass.
2. Where a consumer used `status === 'pass'` or `validation.status === 'pass'` solely to decide whether to request controlled file publication, use `validation.publishEligible === true`. Keep the current plan hash, revision, expiry and user-confirmation requirements. Do not use this substitution for whole-task acceptance or relax a user's required build or runtime tests; `runtimeTest: true` still blocks without a runtime executor.
3. Confirm the distinction with a candidate whose declared content and applicable syntax checks pass: verification reports `not_run`, runtime coverage remains `not_run`, and publication eligibility can be true. A failing content or syntax check must make eligibility false. The [validation tests](../../../../packages/sep/system-enhancement-package/tests/safe-change-validation.test.mjs) and [engine tests](../../../../packages/sep/system-enhancement-package/tests/safe-change-engine.test.mjs) cover these cases.
