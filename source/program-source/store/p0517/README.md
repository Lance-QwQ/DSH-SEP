# DSH SEP plugin group — isolated.5

This candidate retains the governed Mem0 hint integration from isolated.2 and adds the optional `dsh-sep-plugin-group/compaction` Cordis entry for DSH 0.1.5-rc.2.

The compaction entry replaces the native `dsh-compaction-basic` plugin registration, not its implementation: it subclasses the documented summarize hook. Do not load both engines. Other SEP modules and user plugins remain installed. Configuration requires `projects: [{ id, root }]`; `native` forwards the native compaction configuration (automatic compaction defaults to true). Project roots must be canonical, absolute, non-overlapping paths. The surrounding profile must already load the host LLM/token-meter/session services and the SEP suite (including its normal model/budget interception and memory-context protection).

The hook uses the original model request and summary, then checks exact JSON message coverage and summary linkage in the pinned lossless-claw SummaryStore in volatile Worker SQLite before returning to native commit. It does not call an additional model. Native selection, tool pairing, token shrink checks, replay stability, durable source sequence references and persistence remain authoritative. `verified` counts graph verification, not committed checkpoints.

This is source-integrity integration, not the complete lossless-claw context engine. No persistent LCM DAG, history search or automatic source expansion is installed; original history remains in the native session store. Semantic summary quality is not proven by a matching hash. Project-scope misses and subagents retain native compaction. L4 and ephemeral memory snapshot compaction remain blocked by SEP's existing memory-context listener.

Bounds: 4096 selected messages, 8 MiB total serialized source by default (configurable downward to 1 KiB), 1 MiB summary, at most two integrity Workers per engine, 64 MiB V8 old-generation limit per Worker, 10-second Worker timeout. The heap limit does not bound native SQLite's process-wide memory. The adapter rejects excessive input before the model call; a failure never silently truncates history. These limits do not govern ordinary Shell or other plugins. Worker errors after a successful model response can still incur that model cost. The native automatic-pressure policy may log a failed compaction and continue the turn; it does not commit a bad checkpoint.

Unloading this entry requires restoring the native compaction plugin registration before automatic compaction is available again. It does not erase sessions or memory. This candidate has not been deployed to the daily desktop runtime.


## Read-only history review CLI

`dsh-sep-history --sessions-root <absolute existing JSONL root> --project <absolute project root> --session <id> [--summary <summary event seq>] [--source <source seq> --revision <listing revision>] [--offset <UTF-16 offset> --limit <1..8192>] [--compression none|zstd]`

Run without summary/source to list committed summaries, then with summary to list source metadata. Showing text requires the exact current revision from listing. The project root is explicitly supplied by the human CLI caller, not a separately authenticated project allowlist. Direct user text only; tool/model/plugin and attachment bodies are excluded. Seeded/subagent sessions and non-compaction source replacements are refused. Provenance traversal is limited to depth 16 and 1024 visited nodes. The current physical native-format file must exist; no historical-format translation or backup search is requested. Files must provide verifiable single-link local identity. Reads must retain native revision and physical identity through completion.

This is a human audit viewer, not model-accessible recall. Old user statements may include information subsequently withdrawn from RAG because the original session audit log is a separate retained record. The CLI does not restore those memories or send anything to a model. It adds no body file or body logging; terminal scrollback or a caller's shell redirection remains outside this package. Listings contain no message bodies. JSON-escaped output uses bounded pages and explicit nextOffset. The 64 MiB limit is on the physical stored file; 20,000 logical events are checked after reading. These are not a hard decompression/process memory bound.

This candidate remains isolated; the daily desktop release is unchanged.


## PinchBench local prework gate

This candidate adds a synthetic model-readiness gate before `suite_delegate` creates work children. Set `p1.prework: true` in the existing suite config, retain `p1.enabled: true`, and load this plugin group with every governed project's canonical root in `projects`. Existing Profiles retain their previous behavior unless explicitly enabled. When required, an absent/unloaded group blocks delegation. The isolated integration and archive smoke tests enable the gate.

Three fixed rounds each use the same synthetic prompt bundle derived from PinchBench's sanity, CSV filtering and summary task ideas. Five deterministic checks, each weighted 0.2; all three rounds must score at least 0.8. This is not an official PinchBench score, full agent benchmark, tool-use evaluation, or proof of work-task correctness. Input contains no parent conversation, RAG snapshot, private files or work prompt. Calls offer no tools and use the original LLM waterfall/shared P1 ledger; they do not spawn evaluation subagents. The native child-option resolver supplies the same model and effective reasoning used for the intended work child.

Receipts bind project, work arguments, model/effort, public tool definitions and registration identities, model metadata, native spawn-provider identity, P1 lifetime, LLM adapter-topology epoch, token/time limits and the frozen benchmark/grader hash. Conditions are checked again before child creation. These checks are not a hash of every third-party plugin implementation or a sandbox against malicious in-process changes.

Cache: at most 64 receipts in process memory, 24-hour validity, no disk cache trusted for admission. Restarts/unloads invalidate it. Repeated failures/blocked results reuse the same receipt rather than charging again. `/sep-prework-reset` is a human command that clears this project's cached receipts without a model call; the next request reassesses. It is not a model tool; it refuses arguments/attachments and active assessment resets. Profiles without the native commands service can clear receipts by reloading the group. Successful work records retain the bounded receipt statistics and output hashes, never the raw probe answer.

All three planned sample rows are retained. Grading failure counts as zero in aggregate statistics. An execution block ends further model calls, with remaining rounds explicitly not_run and counted as zero; a blocked result cannot pass even if a median looks favorable. There is no extra automatic rerun. Existing P1 output and total budget caps apply. Per-round timeout uses the configured P1 timeout and transport cancellation; it is not an OS-level kill guarantee for an adapter that ignores cancellation. Work-slot reservations include the prework interval, preserving the maximum of two admitted work tasks through suite_delegate.

The daily release has not been changed. Real model readiness scores remain unmeasured in the delivered test evidence; offline response injection verifies routing, guards, grading and lifecycle only.

## Message-level governed expansion (current isolated candidate)

Suite 0.1.0-alpha.14.rc2-provenance.1 and group 0.1.0-isolated.7 use protocol 2.
Both matching packages are required for model history expansion. The tool and
explicit current-user request, current-project/session scope, four-call turn
limit, 4096 UTF-16 page size, source revision binding and retirement remain.

New memory origins bind session ID, direct user message ID and SHA-256 of the
whole text message. Duplicate saves merge origins, capped at 512 (overflow
refuses the write). Revision archives retain their old origins. Withdrawal and
purge retain body-free origins across the record's revision/promotion history.
Source fields are captured from host events, never accepted as tool arguments.

Complete new origins restrict their affected messages; unrelated messages remain
readable. If one message contains several facts, an affected fact restricts the
whole message. A matching message ID with a changed body is also refused. This
is not semantic matching of paraphrases or copies under unrelated message IDs.
Archives, withdrawn markers and lifecycle-eligible records are checked at read
and before redispatch of an active expanded result. The output receipt also binds
the current source graph. This does not retract a request already dispatched.

Unknown/malformed/old origins, unmigrated legacy memory and document archives or
P2 document-deletion authority without message provenance still fail closed.
Old provenance is not guessed or upgraded from textual similarity. Restoring a
memory into active storage does not automatically authorize its archived raw
source. Human review remains separate. P2 journal and snapshot restore preserve
new restrictions, including after cold payload erasure; absent old restrictions
never become a new proof of readability.

Only direct user plain text qualifies. Attachments, assistant/tool/plugin text,
seeded/fork and subagent sessions remain excluded. Pattern-based credential and
code checks are not complete secret/document classification. Source limits are
admission limits on already loaded sessions, not an OS memory cap.

Expanded tool bodies retire from the native model surface at idle/next turn and
are barred from active compaction. Native append-only audit still retains the
original and tool result; this is not physical erasure and does not guarantee
removal of assistant paraphrases. No separate body database or sidecar is added.

This is native compaction plus verified links and controlled source expansion,
not the full persistent multilevel lossless-claw engine. Daily deployment is
not part of this isolated release.

## Flow candidate (2026-09-15)

The model-facing tool now includes bounded `workflow.nextCalls`, a stage,
`originalTextRead`, `sourceComplete` and an actual remaining call count.
Directory results are not body reads. Navigation only proposes existing,
eligible sources and never bypasses revision/governance checks. The current
explicit request authorizes this read sequence without another confirmation;
refusals and the four-call limit still stop it. Page completion is distinct
from completion of the user's task. Only narrowly recognized whole anti-guessing
clauses are excluded from the conservative negation gate; arbitrary natural
language authorization is not implemented.

Three real DeepSeek Flash/off synthetic rounds completed body reads and invalid
source refusals with a 2048-token native compaction output limit. The default
compaction configuration was not changed. Model prose can still misstate source
or remaining-call details; structured receipts are the authoritative evidence.

The prework prompt, grader, 0.8 gate and inherited reasoning behavior remain
unchanged. A separate synthetic investigation found wrong southern filtering
in 3/3 original/off and 3/3 clarified/off probes, versus 3/3 correct for each
low condition. This is a small diagnostic, not a general accuracy guarantee,
official PinchBench score or authorization to silently override reasoning.
