# Installer UI boundary candidate

`PLAN.md` describes the intended AppKit installer. It is not implemented or
certified by the files in this directory. The present executable work is the
private transport validator, with 17 local contract definitions.

`protocol.mjs` accepts only `preview`, `listRecovery`, `confirm`, `cancel`,
`resume` and `close`. A request binds protocol version, a 256-bit session nonce,
a strictly expected sequence and exact input keys. Request frames are at most
4 KiB; a response is one UTF-8 JSON line at most 16 KiB. The reader rejects
extra/duplicate frames, malformed UTF-8, unknown keys, wrong bindings and
incomplete EOF. Caller mutation cannot replace the captured response binding.

Responses contain a bounded preview or recovery summary and classified
outcomes. They contain no full journal or source manifest. A `committed`
receipt explicitly says the application was not started; `closed` requires
actual resource release. `blocked` and `fail` never become `pass` merely
because parsing succeeded. Neither a displayed path nor a received hash is
installation authority; the future controller bridge must repeat its own
bound plan and account validation.

The sequence supplied to these validators must come from the exact owned
parent/child state machine, not from the received message. No renderer, HTTP,
model or public command-line bridge is present. Native bundle/manifest
admission, actual AppKit confirmation, child lifecycle and full-package
installation remain not_run for this UI layer.

Local development observed 10/10 and then 14/14 missing-implementation failures,
14/14 initial successes, followed by 3 new boundary failures in 17 definitions
and 17/17 successes after correction. These are separate runs, not 58 unique
passing tests. Only the latest 17 definitions describe this candidate; the
native controller's 22 definitions are a different suite.
