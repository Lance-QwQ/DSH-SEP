# Lifecycle-aware transport — isolated.5

Adds optional generationId configuration and X-SEP-Generation on every request; configured generation and lifecycle protocol must match health responses. The trusted entry always uses this binding; direct legacy configurations remain supported. New lifecycle.py and lifecycle_worker.py are owned by the trusted entry package. See its top-level README for shutdown and recovery contracts.

The following sections are historical inherited behavior and evidence, not claims that the new lifecycle is already covered by those tests.

# Error classification correction — isolated.4

Missing retained job records now return JOB_NOT_FOUND; corrupt/unreadable records remain STATE_CORRUPT. The native message for a missing record asks to check project, ID and history, warns that absence does not prove an external operation never happened, and forbids automatic resubmission. It no longer recommends polling the same nonexistent ID. Actual corruption asks for controller-state inspection.

The isolated trial stop controller is a separate launcher module, not part of this plugin archive. This plugin does not impose stop-on-error on daily Agents. Historical results below describe the inherited implementation; the new release report gives current synthetic verification.

# DSH SEP native official grading — isolated.3

The four lifecycle tools negotiate `fixed-command-v1` or `swebench-official-v1` with a trusted local backend. Run `suite_eval_status {}` to discover the evaluator and authorized IDs. Official submission:

```json
{"jobId":"stable-job-id","assessmentId":"official-swebench","artifactId":"reviewed-artifact-id"}
```

A fifth native tool, `suite_eval_artifact_register`, accepts `{snapshotSha256,edits:[{path,old,new}]}`. Obtain the current snapshot hash from `suite_eval_status {}`. Exact replacements are compiled only against files in the administrator-authorized public snapshot. No raw diff, shell command, image, timeout, reference patch or test definition is accepted. This is not a general filesystem uploader. Registration means identity and edit-scope validation, not semantic safety approval or repair success.

At most 16 edits and 48000 serialized ASCII-escaped JSON bytes per answer; compiled patch at most 48000 UTF-8 bytes. Python syntax, unique old text, path membership and nonempty actual patch are checked. Source files remain unchanged. Registered artifact ID is the compiled patch SHA-256. Maximum 16 dynamic artifacts in addition to up to 16 seed artifacts. The private `state/admitted/<sha>.json` record binds project, snapshot, stable catalogue and edits. Same compiled patch is idempotent (also at quota); publication uses file fsync, atomic replacement and directory fsync under the state lock. No automatic replay on request timeout. Query the catalogue first.

The official worker independently reloads and recompiles registered edits. Live lookups revalidate persisted records and reject malformed records, mismatched hashes/project/catalogue and multiple hardlinks. Catalogue identity excludes dynamic entries, so adding an artifact preserves existing task bindings and completed receipts. Native catalogue queries refresh entries and expose metadata only. Orphan atomic-write temporary files are not admitted; exceeding 64 directory entries fails closed. Operator cleanup is required; automated registry TTL/deletion is not implemented. State directory is trusted, private, single-owner local storage; this is not an authenticated defense against an administrator rewriting all state.

The public source snapshot SHA, dataset SHA, baseline commit, patch hash, immutable image and selected official source hashes remain bound. Seed answers are reviewed preparation inputs. Newly registered answers are untrusted generated edits, and can only be executed through the existing isolated grading container.

Native configuration remains `{enabled:true,projects:[{projectId,root,endpoint,token,catalogSha256}]}`. Canonical project root and real Agent session checks apply. IPv4 loopback endpoint, ephemeral token and catalogue binding are supplied by the trusted service launcher, not model arguments. Fixed-command submission omits artifactId; old fixed-command results retain `resolved:null`.

## Trusted official backend

Run `official.py <config.json>` in the existing dedicated Linux/WSL runtime. Config fields: `state` (private absolute directory), `projectId`, immutable `image`, `snapshot`, `snapshotSha256`, `dataset`, `datasetSha256`, and `runtime:{version,files:{absoluteOfficialSourcePath:sha256}}`. Only reviewed SWE-bench 5.0.2 is currently supported. The source snapshot contains exactly `visibility:'public'`, four-field public `task`, source `files` and `answers` mapping artifact IDs to exact old/new edits. The existing deterministic compiler produces scoped patches; malformed or missing edits, out-of-scope files and oversized artifacts are refused. Dataset stays trusted and must contain exactly the matching public instance. Image assets are unsupported.

`public` is an operator assertion, not automatic privacy classification. Snapshot byte identity does not independently prove Git provenance; the preparation stage must bind the original sources to their baseline. Current validation reuses the earlier verified public SymPy snapshot and model answer.

The backend prints its ephemeral connection credentials to its trusted launcher once. Do not send that line to a model or public log. Close stdin for orderly shutdown. A service lease prevents two backends controlling the same directory. Unfinished jobs recovered after restart are retired as unknown without replay; completed results stay readable. Changing catalogue or runtime identity requires explicit new version/state treatment.

## Isolation and official semantics

The controller owns a single container per active job. It persists the artifact binding before creation, installs an independent systemd deadline before start, and validates ownership before deletion. Official evaluation requires an ephemeral **writable container root and root UID**, matching the earlier official grader's needs. This is limited to the official profile: no host mounts/socket/network, no added capabilities, all capabilities dropped, no-new-privileges, 2 GiB memory, two CPUs and 256 PIDs. Fixed-command profile retains read-only root/non-root UID/256 MiB. Neither profile provides a tested disk quota.

A separate trusted worker uses the installed official `run_instance`, official test script and `get_eval_report`. Worker-local hooks replace only creation/start/cleanup with the pre-owned container; no unreviewed image pull or CAP_SYS_ADMIN is enabled. Oracle data stays in trusted grading files/container and is absent from model-visible tool output. This does not claim resistance against benchmark test gaming by arbitrary malicious patches.

Worker constraints: Linux parent-death signal, 1 GiB address-space limit, 16 MiB per-file limit, numerical-library threads fixed to one. It executes no patch code on the host. The official test execution timeout is 120 seconds; independent container retirement deadline is 180 seconds. Transport timeout is not cancellation of the job. Model/native request cancellation does not establish whether dispatch happened; query the same ID, never blindly create a new one. Explicit `suite_eval_cancel` retires the container and terminates/reaps the owned worker.

Official proof is persisted before terminal completion under the task lock. Cancellation winning that lock prevents late publication. Only a completed task with a bound, hash-verified official report yields `resolved:true/false`; errors/worker loss/cancellation yield `blocked` and `resolved:null`, not a failed-patch score. Native code verifies artifact fields, evaluator kind, result semantics and receipt hash. A negative patch may have `exitCode:0` for successful grading and still `status:fail,resolved:false`.

If the worker dies after proof write while the record is still `running`, recovery returns unknown/blocked. If a completed `retiring` intent is already durable, recovery completes ownership-checked cleanup and preserves that intent; the official proof/report must still validate before a result is returned. A trusted administrator can rewrite both evidence and hashes; SHA-256 is integrity binding, not a cryptographic signature against that administrator.

## Scope

This candidate tests one public instance with the previously generated model patch plus a nonfunctional negative edit. Repeated grading is not new model generation, multiple task coverage or a full SWE-bench score. It is not installed into the daily version, does not install a permanent service or solve Windows/WSL whole-machine restart, arbitrary runtime migration, private retention/deletion, automatic repository acquisition or free-form patch admission.


## Verification scope for this candidate

Three planned rounds: 59 backend tests, 8 native official tests and 13 legacy native tests per round. An offline LLM adapter exercises the real Agent loop to emit a new synthetic edit, register it and submit the returned artifact ID; the test then polls its official negative result. This is not new live-model generation. The positive dynamic test registers the prior real-model answer under its content hash. One public SymPy task only. No daily deployment or new paid API calls. Whole-machine reboot recovery, arbitrary repository capture, broad benchmark coverage, disk quota and private-data lifecycle remain outside this candidate.
