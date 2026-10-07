> Current public candidate: DSH SEP 0.2.1-beta.2 / DSH 0.2.0-rc.2, Windows x64 Beta. Package-level historical candidate labels below do not override the release version or validation scope. See the installation docs/DOCS_INDEX.md and VERIFICATION-RESULT.json. No private data is included.

本地工作流候选：受控文件发布支持可信按钮确认、分项验证和不增加模型调用的收尾摘要。普通已授权可回退编辑无需反复确认。[中文说明](docs/safe-change-workflow.zh.md) | [English reference](docs/safe-change-workflow.md)。日常部署与 GitHub 发布仍需各自授权。

隔离适配候选（2026-09-29）：新增 Linux ext4 / macOS APFS 的所有权锁后端，Windows 锁格式保持不变。该项不代表整套应用已支持跨平台。[机制与验证边界](docs/owner-portability.md)。

本次修复 BUDGET-01：已有预算账本缺失时明确阻断，消费与设置不清零；v3 格式保持不变。[机制、恢复方法与限制](docs/budget-ledger-continuity.md)。当前日常版已完成产品切换及局部启动器继任修复；宿主与记忆/预算设置 API 可用，窗口存在已核实，视觉效果未验收。下方保留此前候选阶段说明，不应据其判断当前部署状态。

本地候选新增：**设置 → 会话预算**，默认每会话 100 元，可调整默认值或单会话上限。[使用和兼容说明](docs/session-budget.md)。本说明不代表已切换日常版。

# DSH SEP — Windows local candidate

## Budget policy repair candidate (2026-09-27)

The cumulative ceiling remains CNY 100. A trusted root turn and its bound subagents share a separate task ceiling (default CNY 5); a new turn does not reset cumulative accounting. Cache reads are priced separately, and request reservations use reviewed input fields plus conservative allowances. Local accounting is an upper bound, not the provider invoice.

The first ledger write upgrades v1 to v2 after an exact-byte checkpoint. Beta.2 cannot directly read v2; do not restore an old ledger after new spending just to downgrade code. Historical repricing is a separate, explicit, fingerprint-bound maintenance operation; it preserves unknown reservations and the original records. No automatic ledger reset is included. See [the policy, maintenance tool and verification scope](docs/budget-policy-20260927.md).

## Native images in a P1 Profile

P1 accepts native user attachments and tool images only when its existing provider/model policy permits the route, the current Host model declares image input, the attachment service is mounted, and the Host supplies image pricing. A retained image on a text-only or unverified route returns `P1_IMAGE_NOT_ALLOWED`; it is not silently removed. Offloaded history remains a text placeholder and is not restored by SEP.

Every retained occurrence reserves the published DeepSeek ceiling of 1024 image tokens plus the Host's image-handle text; repeated references are charged separately. Offloaded occurrences reserve only placeholder text. Provider usage settles the same shared ledger. Missing, incomplete or unsupported image pricing returns `BUDGET_ESTIMATE` before provider dispatch. The existing model, output, request-JSON-byte and total-budget limits remain in force. Capability/pricing refusals and cancellation while resolving capability do not reserve funds. Cancellation known before entering the dispatch boundary releases a prepared reservation with an audit record. Failures after the durable dispatch marker retain an unknown reservation; neither a reservation nor that marker proves a network request reached the provider. The JSON limit does not measure encoded image bytes: the native attachment store and adapter enforce image identity, normalization, byte/count limits and transport rules.

### Model Experience

Images continue through the native Host representation and DeepSeek serializer; this policy neither rewrites recorded messages nor makes an extra vision request. `suite_extract` handles document text and cannot replace image understanding. `suite_vision` remains a separate, explicitly authorized single-image request. [Native image tests](tests/native-images/README.md) describe the isolated accounting evidence.

### Known Limitations and Deferred Work

The reviewed image ceiling is specific to the permitted DeepSeek routes. A new provider or pricing rule requires adaptation. Passing a keyless fixture is not evidence that every remote image or model service succeeds; paid online validation and daily deployment are separate steps.

## Workflow history capacity

`p1.historyMaxBytes` bounds the retained workflow JSON in UTF-8 bytes: default 16 MiB, accepted integer range 1–64 MiB. Existing runs and reviews are retained without a project-lifetime record count. New P1 writes exceeding the configured capacity return `P1_HISTORY_BYTES_LIMIT` without pruning records; each currently admitted child reserves 64 KiB for its final report. Raising this setting changes the local storage allowance, not model spending limits. Already oversized data remains intact and requires an explicit capacity decision.

Automatic turn completion with no configured criteria does not create a permanent `not_run` review. Explicit `suite_review` still records its result. `suite_tasks` accepts optional `offset`, `limit` (1–20, default 20), or exact `id`; results remain limited to the calling parent session, newest first, with `nextOffset` and `total`. A response is at most 64 KiB; follow `nextOffset` for remaining records. A single older report exceeding the output allowance returns `P1_HISTORY_OUTPUT_LIMIT` without changing its stored body.

The JSON backend still loads the whole project; this limit bounds new P1 history writes, not pre-read memory for arbitrary pre-existing files. No cold archive table or storage-domain migration is included. Once either array exceeds 200 records, older SEP programs retaining the former schema reject it; direct downgrade is unsupported. Keep the corresponding program checkpoint with its data checkpoint, and never restore old data over newer work. See the [upgrade guide](../../../docs/upgrade-guide/v0.2.0-rc.2/sep-workflow-history-capacity/guide.md).

## Document archives and P2 journal recovery

An archived document with a verified file identity and matching cold payload does not restrict unrelated user-message history. Missing, mismatched or unknown archives and withdrawn message origins still fail closed; document deletion authority is unchanged.

On exclusive startup, P2 may advance an old head over a complete validated journal tail after a head-publication interruption. It verifies identity, the complete hash chain, replay invariants and that the previous head is a valid prefix. It neither replays business callbacks nor removes pending intents or maintenance barriers. Truncated journals, identity mismatches and missing authority heads remain blocked.

## Historical memory context

With four-layer memory enabled, context retirement recognizes both `dsh-system-enhancement-package/memory` and the persisted pre-rename identifier `dsh-enhancement-suite/memory`. Only suite-owned snapshot and notice messages are retired. The append-only audit history remains intact; unrelated producers and unauthorized projects are excluded. See [the pinned Loader regression](tests/memory-context/README.md) for synthetic request, compaction and JSONL resume coverage.

## Registered workspace memory

With `recovery.enabled: true`, `recovery.followRegisteredProjects` defaults to
`true`: the suite accepts project identities already registered by the trusted
Host. New workspaces use their stable recovery memory key in the existing JSON
backend. Existing L2/L3 records are read without rebuilding the store. Unknown,
paused or identity-replaced roots remain blocked. Set the option to `false` to
keep the initial configured project list only.

Newly admitted projects start with no RAG file sources and no shared user profile;
configure these explicitly to grant file indexing or cross-project sharing.
This does not import arbitrary JSON files or adopt unmanaged private databases.

## Windows semantic click plugin

The bundle declares `dsh-system-enhancement-package/computer-click`, disabled by
default. Enable its `sep-computer-click` row with `enabled: true` and the installed
Windows MCP's `serverName` (`sep_windows`). The plugin adds `suite_computer_click`
over that server's `ui_click` and optional `ui_wait`; it does not replace native
computer tools. Missing provider tools return `SEP_CLICK_PROVIDER_UNAVAILABLE`.

Supply a previously observed window and element ID or exact selector. The plugin
requires a unique target, serializes clicks, and never substitutes coordinates.
An optional expected condition is observed after one click. An observed condition
does not prove business completion. Dispatch/verification errors remain errors
and say the outcome is unknown; inspect the target instead of retrying blindly.
Same-request receipts prevent duplicate dispatch only within the loaded plugin's
lifetime; they are not durable transaction receipts across restarts.

### Model Experience

Enabling the plugin adds one tool schema and a minimal click or wait summary to the model context. Provider UI trees, arbitrary fields and raw messages are omitted even when their size is below the old observation cap. Read needed window content through a separate scoped tool. The plugin makes no model requests and adds no background model token cost.
Memory remains scoped to the requesting project's trusted identity.

### Deadlines and uncertain input

`operationTimeoutMs` bounds waiting inside the admitted enhanced tool body (default 180000 ms, range 100–600000); it excludes Host policies before that body or after its result. `verificationTimeoutMs` remains the provider query/condition timeout (default 5000 ms). Cancellation also returns from the body without indefinitely waiting on a noncooperative provider. A preflight that settles late cannot proceed to input. These timers require a responsive Node event loop; they cannot interrupt synchronous native code.

An uncertain input dispatch retains process-wide exclusion and returns `SEP_CLICK_PROVIDER_QUARANTINED` on new enhanced actions. Reloading the plugin cannot clear it. Stop the owned provider, confirm its old execution can no longer send input, and restart the Host before observing the target and deciding whether a new action is appropriate. The plugin does not perform that recovery or claim that timeout cancels a remote click. Raw MCP/native tools and other processes remain outside its exclusion.

`shutdownTimeoutMs` bounds plugin teardown waiting (default 5000 ms, range 100–30000). If work remains pending, teardown raises `SEP_CLICK_SHUTDOWN_BLOCKED`; Cordis routes the disposal error to its logger while removing the plugin. Exclusion remains. Completion of framework disposal is not confirmation that provider resources have stopped. An acknowledged click followed by a failed read-only verification remains an unknown business outcome, but does not alone quarantine an already settled input dispatch.

`maxObservationBytes` remains accepted for configuration compatibility; the fixed minimal observation is below its minimum accepted value. It does not authorize returning raw UI text. The model-visible `outcome` values and the request receipt key remain unchanged.

[Pinned-host tests](tests/computer-click/README.md) cover missing providers, redaction, cancellation, late completion, Loader composition and recorded Agent results without model credentials or real desktop input.

### Known Limitations and Deferred Work

This hardening candidate verifies Loader composition and synthetic UI dispatch, not real Windows click accuracy. No fallback can guarantee clicks on controls that
do not expose UI Automation. The wrapper does not stop direct calls to native
computer tools or the underlying MCP. Private deployment is separately gated.

## Historical isolated Mem0 integration notes

See docs/71-mem0-governed-integration.md in the project. Requires the matching suite core and plugin group. Not installed in daily DSH. Model responses were injected in regression tests.

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

Unknown/malformed/old memory origins, unmigrated legacy memory and P2 document-deletion authority without message provenance still fail closed. Verified document archives use their matching file identity and cold payload instead of user-message origins; missing or inconsistent document payloads remain blocked.
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
not the full persistent multilevel lossless-claw engine. Daily deployment and
real-model quality validation are not part of this isolated release.

## Optional background update assessment

The native update-assessment switch defaults to off. Enabling permits two budgeted model stages when desktop discovery finds a new official DSH release. Assessment has no installation authority. See the [service reference](docs/update-assessment.md) for evidence, cost, cancellation and SQLite recovery rules.
