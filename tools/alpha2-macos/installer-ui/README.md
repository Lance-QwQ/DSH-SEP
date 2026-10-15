# Native installer integration candidate

Current delivered evidence is the r78 installer / r79 acceptance described in
[STATUS.md](STATUS.md) and the [artifact index](../package/MAC-PREVIEW-EVIDENCE.md).
The separate r79 test entry connected unchanged production modules, the actual
controller, private pipes and real AppKit controls: six installation assertions
passed, followed by two installed-product startup/restart cycles with normal
closure. This is not physical input certification of the original installer.
Full Mac certification remains blocked. The low-priority review changes in the
current source are not retroactively included in that signed installer.

`PLAN.md` remains the implementation contract. The originally separate layer
tests below are retained as history; they must not replace the later, explicitly
bounded integration result.

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
installation authority; the installed controller bridge must repeat its own
bound plan and account validation.

The sequence supplied to these validators must come from the exact owned
parent/child state machine, not from the received message. No renderer, HTTP,
model or public command-line bridge is present. The original-entry physical confirmation path remains not_run. The separate
r79 integration result above does not promote isolated layer tests into full
original-entry certification.

Local development observed 10/10 and then 14/14 missing-implementation failures,
14/14 initial successes, followed by 3 new boundary failures in 17 definitions
and 17/17 successes after correction. These are separate runs, not 58 unique
passing tests. Only the latest 17 definitions describe this candidate; the
native controller's original 22 definitions are a different suite; its current
31-definition result also includes five boundary checks and four recovery-list
checks. Repeated executions are not additional unique definitions.
