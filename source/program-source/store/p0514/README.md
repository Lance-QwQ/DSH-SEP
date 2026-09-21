# @deepseek-ai/dsh-task-checkpoint

English | [中文](README.zh.md)

An optional `task_checkpoint` tool records ordered tasks in the current durable Session. Execution is explicit. The component does not change the agent loop, Stop, goal continuation, or default profiles.

## Configuration

Load after `agents`, `sessions`, `sessionPersistence`, `tools`, and `fs`. Configure JSONL persistence with a pre-created root and `requireExistingRoot: true`; losing that root must block task operations instead of creating empty history.

```yaml
- name: '@deepseek-ai/dsh-task-checkpoint'
  config:
    allowedTools: [write, edit, file_manage]
    maxTasks: 8
    maxSteps: 16
    maxOperations: 64
    maxArtifactBytes: 1048576
    maxStateBytes: 262144
    maxInputBytes: 16384
    maxOutputBytes: 262144
```

`allowedTools` is required, contains 1–64 distinct names, and cannot include `task_checkpoint`. It admits orchestration only: each nested call still traverses the current tool registry's permission, approval, schema, timeout, and cancellation paths.

The example gives the defaults for optional limits. Task, step, and attempt maxima are 32, 64, and 128. Artifact, retained-state, and output byte maxima are 16 MiB; input is at most 1 MiB. Each step has 1–4 files. Input counts the complete JSON arguments, output counts the JSON-encoded result string, and state counts all retained task-event envelopes, including duplicate deliveries. Before accepting an intent, the component reserves the worst encoded settlement record and a cancellation record for every uncancelled task. Insufficient history capacity refuses dispatch. An output-limit error can follow a durable completion; it does not permit repeating the attempt.

## Explicit actions

| Action | Contract |
| --- | --- |
| `create` | Supply a task UUID, objective, and `plan_json`: ordered `{id, description, acceptance, artifacts:[{path, sha256}]}` steps. The exact same task and plan is idempotent. The plan is immutable. |
| `read` | Return recorded task, revision, attempts, and next step without reading artifacts or executing tools. Finished records report `complete_unverified`. |
| `track` | Read actual artifact bytes and compare expected hashes and recorded provider versions; dispatch no work. |
| `execute` | Supply current `expected_revision`, next `step_id`, stable `operation_id` UUID, admitted `tool`, and `arguments_json`. Execute one attempt after its intent is durable. |
| `reconcile` | Report actual artifact facts for prior attempts. Unknown side effects remain `needs_reconciliation`, even when files match. |
| `cancel` | Supply current revision to durably cancel the task permanently, then abort only its owned current attempt. Cancellation does not undo effects that already happened. |

Acceptance prose is retained for people. Automatic completion checks the declared regular-file SHA-256 expectations. Paths must be relative and resolve inside the current project. Reads are byte-bounded, and target identity, size, and provider version are checked around the read. Completed attempts are skipped only while their actual hash and recorded version still match. A different operation UUID cannot bypass an unresolved attempt; cancel and explicitly create a new plan when reconciliation cannot establish the external outcome.

## Durability and scope

The required `task/checkpoint-change` event carries schema 1, immutable task and project ownership, revision, stable step/attempt IDs, outer and inner CallIds, intent sequence, argument digest, outcome code, and verified file evidence. The intent is appended and `SessionStore.flush` must succeed before `ctx.tools.execute` receives the nested call and the registry-owned parent token. This required event owns the nested relation; nested dispatch alone does not imply a canonical `tool/call` event.

The current exact live Agent, Session, and canonical project must match. Seeded or forked records do not grant ownership. Historical permission is never replayed. Before task actions, stored task events must agree with the live task history; malformed schemas, contradictory revisions, missing roots, and durability failures block while preserving the records. Exact revision redelivery folds idempotently; conflicting redelivery refuses. A failed flush blocks the same live Session until actual reload.

On restart, a prepared attempt without its live owner is unknown. The tool never automatically dispatches it, adopts an old job ID, or claims a process by PID. Explicit cancellation remains permanent after restart. A per-Session FIFO serializes checkpoint commits but releases during tool execution, allowing cancellation to commit. Agent disposal aborts its owned executions and later commits recheck the exact live owner. Unload removes the tool, aborts owned executions, and awaits their settlement.

New events are never marked `ignorable`. JSONL format remains 0 under the existing vocabulary-growth mechanism: an older host lacking this event refuses the new log with `SessionFormatUnsupportedError`. An actual frozen P0 reader is tested against a new create/cancel log; the record bytes remain unchanged.

## Verification

Package tests use real Agent and Session services and a real `cordis.yml` through Loader. Windows child tests kill the exact created process after durable intent, after a controlled file effect, after first-step completion, and after cancellation. They reload the same Session, verify unknown refusal and explicit second-step continuation, and apply a current registry guard after restart. Tests also cover artifact conflict, crossed project ownership, damaged stored schema, independent task cancellation, byte reservations, duplicate delivery, and disposal. These fixtures make no external model requests.

## Model Experience

### Tool schema and results

#### What the model sees

The generated [`task_checkpoint` schema](../../../docs/tool-catalog.md#deepseek-aidsh-task-checkpoint) and a bounded JSON string containing `task`, `status`, `nextStep`, `evidence`, and `guidance`. The status distinguishes `ready`, `executing`, `complete`, `complete_unverified`, `needs_reconciliation`, and `cancelled`. Unknown outcomes carry: `Do not retry this operation. Reconcile facts, then explicitly cancel and replan if its effects remain unknown.`

#### Token effect

The opt-in schema adds a fixed input cost. Results grow with the bounded plan, attempts, and evidence. Required task events add no separate model context, and the component makes no model calls.

#### KV Cache effect

The schema is prefix-stable while its visibility and definition remain unchanged. Calls and results append to conversation history. The component does not rewrite earlier request context; enabling or removing its schema can change the reusable prefix.

## Known Limitations and Deferred Work

- Automatic acceptance covers declared file bytes, not arbitrary prose, remote transactions, or every side effect of an admitted tool. Reconciliation reports evidence and never resolves an unknown external outcome automatically.
- File verification is a bounded observation with version checks, not a kernel-atomic snapshot or system-wide isolation. The configured provider and current tool policies retain their own guarantees.
- Task history has no garbage collection. Completed and cancelled identities remain until the Session is archived; lower limits may block an existing history. Reserved settlement space is conservative for providers with large version tokens.
- Cancellation depends on the inner tool observing its signal and does not roll back completed effects. Disposal awaits owned work; it cannot hard-kill arbitrary same-process JavaScript.
- Existing Session storage owns physical log parsing and retention. Task byte limits cover the task event stream and results, not unrelated conversation history or the filesystem's allocation overhead.
