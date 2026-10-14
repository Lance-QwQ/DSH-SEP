# Background DSH update assessment

English | [中文](update-assessment.zh.md)

This reference describes the optional SEP assessment service. The native **Update assessment** setting is off by default and requires the existing P1 budget service. Enabling it permits paid background model requests. It does not install updates, prepare a release, or change plugin code.

## Trigger and evidence

The existing desktop discovery runs at startup and every three hours. A newer official DSH release with a release ID supplies public release notes and the current static plugin report. Discovery continues while assessment is off, but makes no assessment model request. Enabling starts an unattempted current report; failed or interrupted reports require an explicit manual retry.

The service performs analysis and then a separate evidence-review request using the configured P1 model. The second request receives the first result but must check it against the same evidence. Two agreeing responses do not constitute execution evidence. Static incompatible plugins or reported conflicts prevent a passing combined result. Every result retains `installable: false`; API, schema, host-interface and runtime validation remain unperformed. The installer never consumes model approval as admission evidence.

Only bounded public release metadata, package names, versions, static verdicts and reason codes reach the model. Equal public plugin metadata is grouped with an instance count. Paths, configuration values, credentials, conversations, memories and project files are excluded. All plugin instances remain bound locally by the report and their fingerprints. Release notes and model text are untrusted input, without tool access. Input limits reject oversized inventories or requests rather than silently certifying omitted plugins: 10,000 instances, 600,000 bytes of normalized local evidence, and 90,000 bytes of model request data.

## Cost and cancellation

Both stages use the existing shared budget ledger and request settlement helper with one background task identity per attempt. They do not create a user Session. Analysis and evidence review share the configured P1 `taskLimitCny` allowance for that attempt, checked alongside the shared limit before dispatch. Binding a later lower limit reduces the allowance; it never raises an allowance already recorded for that task. The settings page separates reported input/output tokens, calculated cost estimates and unresolved reservations. No reported usage means “not reported,” not a claim of zero tokens. Estimates are not provider invoices; accounting failure hides unavailable amounts.

Disabling prevents subsequent dispatch and cancels local waits. A dispatched request can still cost money and its returned usage still needs settlement. An unknown outcome retains its reservation. A manual retry creates a new background task and is a new potentially paid attempt; previous spending remains in the shared ledger. Reopening settings, restarting the Host, or repeating discovery does not automatically retry it.

## Persistence and recovery

`update-assessment.sqlite` lives beside the configured budget ledger. SQLite `user_version=1` contains an enabled/latest settings row and immutable-input run records. A transactional claim precedes model dispatch. The key binds release content, current Host/SEP/configuration/report fingerprints and the model policy. Changed evidence creates another assessment; an old response cannot overwrite a new attempt. New records also preserve normalized discovery input separately from the policy-bound input. Enabling, discovery and retry derive the key from that original input and the current model policy, so a switch change or repeated discovery alone does not create another attempt. The existing budget ledger format is unchanged.

A crash leaves the claimed attempt recorded. After its deadline, reads show an interrupted, blocked outcome; recovery requires an explicit retry. Stage deadlines also bound a nonresponsive provider while the Node event loop remains responsive. An already dispatched remote request is not guaranteed to stop. Storage failure makes assessment unavailable without disabling the suite's existing budget safeguards. Do not delete the assessment database or budget ledger to reset a failed attempt or spending.

An older record without original discovery input is shown as blocked and interrupted with `ASSESSMENT_REDISCOVERY_REQUIRED`. Its analysis, review and usage remain available. Enabling only saves the switch, and ordinary retry is unavailable. Use the existing check for official updates to obtain fresh discovery evidence; no database or ledger reset is needed. Discovery for the same key adds the missing metadata without rerunning an attempted assessment. Changed evidence or policy that produces a different key creates a new assessment.

## Host and client integration

The settings plugin exposes authenticated local `get`, `update`, `observe` and `retry` routes under `/api/sep-assessment/`. Only the owned desktop carrier can submit discovery evidence. The native settings client can read status, change the switch and request a retry. Neither route nor service is an Agent tool. Results use `pass`, `fail`, `blocked` and `not_run`; running/detected/interrupted are separate lifecycle phases.

The core, service and desktop projection tests use injected model responses. The owned-host health harness uses an exhausted synthetic budget and an empty isolated Profile. These checks do not establish real provider output quality, native desktop visual correctness, or cross-platform installation readiness.
