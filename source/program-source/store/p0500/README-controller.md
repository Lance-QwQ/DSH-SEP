# Recovery controller API

`src/controller.mjs` exports `openRecovery({controlRoot, limits?})`. The controller owns a separate local directory. Use one controller process; a leftover writer lock requires explicit, identity-checked operator recovery, never automatic deletion.

Methods are async except `status()`, which returns a detached public JSON snapshot. Mutations serialize. Errors carry `code`. No API executes tools or replays operations.

- `addProject({root,memoryKey?,id?})` returns a project `{id,root,identity,memoryKey,generation,state,reason}`. IDs remain stable across approved rebind. The default memory key is SHA-256 of the original canonical path, lowercased on Windows to match SEP; existing SEP integrations may supply their exact existing key through the trusted controller integration. This option is not exposed as raw SEP configuration.
- `inspectProject(id)` verifies directory identity, returns project, and durably pauses/increments its generation on first missing/replaced detection. It never auto-recreates directories or automatically unpauses them.
- `planRebind({projectId,newRoot})` returns a persistent preview `{planId,confirmationHash,projectId,oldRoot,newRoot,identity,projectGeneration,revision}`. Show the entire preview before confirmation. It binds current controller revision and directory identity. Any intervening state mutation invalidates it.
- `commitRebind({planId,confirmationHash})` rechecks the plan and directory identity, durably records the approved new root, increments generation, and returns the project. Existing historical operation roots stay unchanged.
- `beginOperation({projectId,taskId,operationId,effect:'read'|'write'|'external',summary?})` verifies the project before durably recording dispatch and returns an operation `{operationId,projectId,taskId,generation,effect,status:'dispatched',root}`. It rejects duplicate IDs. The caller may dispatch only after this resolves. Summary is stored as a hash, never as raw text.
- `finishOperation({operationId,generation,outcome:'succeeded'|'failed'|'unknown',resultHash?})` returns `{accepted:true,operation}` or `{accepted:false,reason:'STALE_GENERATION'}`. Late generations are audited and cannot advance operations.
- `interruptOperations({projectId?,operationIds?,reason:'host-exit'|'cancelled'|'guardian-restart'})` marks selected pending operations unknown and advances each affected project generation. Because generation belongs to the project, **all** pending operations of an affected project become unknown. Returns `{operationIds,projectIds,reason}`. Omit both selectors only for a guardian that owns all controller tasks. Report host-only crash through this API before attempting another dispatch; it does not terminate processes.
- `planResume({taskId})` returns `{taskId,canResume,operations:[{operationId,effect,status,decision}],confirmationHash}`. Decisions are `retain`, `review`, or `retry-after-review`; pending/unknown outcomes prevent automatic resume. The plan never executes anything.
- `reconcileOperation({operationId,confirmationHash,outcome,resultHash?})` accepts the current planResume confirmation hash after external result review, resolves only unknown operations, and returns the operation. It does not retry it.
- `close()` syncs/releases only its own exact lock and is idempotent.

`status()` returns `{schemaVersion,revision,generation,projects:[],operations:[],plans:[],audit:[],limits,writerState}`. Pending dispatched operations become `unknown` on a clean controller reopen and their project generation advances. The host dying while the controller survives must be reported through interruptOperations; the controller does not inspect arbitrary PIDs.

Journal uses bounded hash-chained append records with fsync before success. Corrupt/torn logs refuse writes without truncation. Record, byte, project, operation, and plan limits fail closed. A mid-write I/O failure poisons the current writer. Filesystem identity checks reject symlinks/reparse aliases along the path and require nonzero dev/ino; these checks do not sandbox arbitrary Shell/native code or eliminate malicious concurrent filesystem replacement between check and external execution.

Defaults: 10,000 records; 16 MiB journal; 64 KiB per record; 128 projects; 4,096 operations; 256 outstanding rebind previews; 128 in-memory audit entries (the complete bounded journal retains events). `limits` can lower these ceilings. At capacity the controller stops new writes; no automatic record deletion/rollover is implemented. Repeated plans and completed operations consume retained capacity. Directory creation metadata durability under sudden power loss is subject to the Windows filesystem; fsync confirms journal file writes, not universal hardware persistence.

## SEP candidate integration

The current recovery candidate admits SEP `0.1.0-alpha.14.rc2-session.1` with DSH rc.2 components. The integration below originated in the historical alpha.13 candidate; its maintenance restriction remains in force and is not broadened by the component port.

The separate suite candidate accepts `recovery:{enabled:true}` and an optional UUID `projects[].recoveryProjectId`. Provide the native host `recoveryHost` service before activating the suite. Its async `projectById({id})` and `projectForPath({cwd})` return verified public controller project objects; a missing path lookup may return null. No raw memory key is accepted by SEP config.

Recovery-enabled Scope resolves the current approved project root and original memory owner. A paused project does not disable a separate ready project. Each caller validates current authority; stale session cwd and old descriptor generations are rejected. Approved rebind creates a fresh descriptor; historical memory and operation root metadata is retained. Native settings refresh its selected project without requiring a model task and rechecks authority within the settings commit queue. A missing recovery service fails closed. Legacy configurations without recovery retain their original behavior.

The `src/p2/recovery-maintenance.js` helper supports read-only trusted-host preflight: `preflightRecoveryScope({config,fs,recoveryHost,legacyRoots})` returns `{scope,proof,recheck}` with `publicationPermitted:false`. `legacyRoots` is an owner-key to stored-root metadata map. Historical root metadata is accepted only when persisted controller `originRoot` and its normalized path digest prove that original namespace. `recheck()` binds the approved current root, generation, identity and configuration again.

Existing subprocess P2 health/update entries, adoption preparation/health and document CLI cannot carry a live trusted authority and explicitly refuse recovery-enabled configuration with `RECOVERY_MAINTENANCE_REQUIRED` before mutation. This is precise refusal plus runtime preflight support, not recovery-enabled publication support. Ordinary Shell execution is not sandboxed by these gates.

## Development evidence

`evidence/host-recovery-20260912/controller/green04.log`: 24 controller tests passed, including real process exclusion/reopen, moved/replaced roots, stale callbacks, hash-chain/torn log rejection, journal replacement, limits and body-free receipts.

`evidence/host-recovery-20260912/controller/sep-green04-regression.log`: 31 targeted tests passed, comprising 10 new recovery/SEP integration tests and 21 existing relevant memory/settings/retrieval checks. `sep-green03-regression.log` retains the earlier 30/31 attempt: one PDF fixture was missing because that run used the repository root instead of candidate cwd. It was rerun with the existing fixture from the correct cwd; no acceptance requirement was changed.

These are development/regression results. They do not replace the root task's fixed three-round combined validation or imply daily deployment.

`maintenance-green03-regression.log`: 36/36 passed (8 recovery-maintenance cases and existing updater/adoption-health regression). `maintenance-green02-regression.log`: 30/30 passed in the preceding governed settings and runtime integration set; these sets overlap and are not additive. `maintenance-green01.log` also reran all 24 controller cases after adding immutable originRoot. Development red logs and one automatic-approval timeout were preserved; the timeout authorized retry once, which completed.
