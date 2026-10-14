# Current-project user workflow: contract and native RED fixture

This directory is a new candidate surface. It does not alter the r44 application,
r46 diagnostic, existing transaction store, Profile, or daily installation.
`workflow-adapter.mjs` is deliberately blocked. No application, route, or model
tool currently imports it. The native acceptance definitions are not a claim
that the workflow is implemented or certified.

## Fixed scope

The current, single controlled project gains user-facing status, existing-plan
selection, bounded review, exact approved commit, discard, restore planning,
known-transaction recovery, and generation history. Commit publishes a managed
generation. It never overwrites the original imported source directory. Project
selection/import, export to a new external directory, generic file access,
ordinary Shell, and a new multi-project ledger are outside this increment.

The caller receives no physical candidate/generation path. Model and ordinary
tools retain their existing restricted interfaces. A renderer-provided plan
hash, a checkbox value, or a serialized object cannot itself authorize commit.
Only the trusted Electron main/local controller may issue a one-use approval
after the current window has displayed the bound summary and the user explicitly
confirms it. The native test fixture uses a synthetic WeakMap authority to test
the control layer; it does not certify an actual native confirmation dialog.

## Proposed factory and control API

`openProjectWorkflow({projectId, ownerGeneration, source, controller, project,
authority, closeDeadlineMs})` is called only by trusted composition. `controller`
is the existing private Profile controller; `project` is its same-owner managed
project facade. These capabilities must never be exposed through JSON routes.
The later, origin-pinned candidate adds the two narrow readback methods described
below to that facade. The factory returns the fixed methods in `CONTRACT.json`.

Every user operation receives a separate opaque `context` object. The injected
trusted authority has `assertDocument(context)` and
`consumeConfirmation(approval, binding, context)`. The first validates a current
owner/window/document identity. The second consumes only an approval retained
privately by the trusted issuer and verifies all binding fields. Production
composition must keep the issuer private; the fixture exposes it solely to tests.
No approval object is reconstructed from renderer JSON.

Review returns `reviewId`, `reviewSha256`, `binding`, `changes`, `coverage`, and
bounded `diff` records. `binding` includes project/owner/window/document identity,
the base generation/sequence, exact plan hash, target hash, and expiry. Content
omissions are explicit. A confirmation with omissions must separately acknowledge
them; the review hash includes their metadata. Exceeding the complete changed-file
metadata limit refuses review rather than silently hiding extra files.

`cancel({reviewId}, context)` revokes a review and associated approval without
discarding the staged plan. `discard` is a distinct exact-plan operation. `restore`
only creates a candidate that still needs review and approval. `recover` only
reconciles already-known durable transactions and cannot authorize unknown
process cleanup. Close revokes admission immediately and waits with a deadline;
`blocked` never means resources were released. `whenClosed()` resolves only after
actual confirmed release, and all previous context/approval objects stay stale.

## Minimal lower-layer extensions still needed

1. `listGenerations({after, limit})`: consult the existing owner's authoritative
   generation rows, verify each listed snapshot, and paginate at most 32 records.
   Do not open a second database handle, infer generations from directory names,
   invent timestamps, or return physical paths.
2. `inspectPlan(planHash)`: under the same owned operation, verify the current
   baseline and exact candidate before and after bounded body reads. Return only
   classified file metadata and text hunks under fixed budgets. It cannot accept
   arbitrary paths. Generation or candidate drift invalidates the review.

The Profile's queue is non-reentrant. Calling `current`, `review`, `commit`, or any
other queued controller method from inside its `withView` callback deadlocks.
The derived adapter must provide a single readback operation, and must not solve
this by bypassing ownership or adding an unguarded generic callback/file method.
Existing transaction/Profile source bytes remain unchanged; any derived candidate
must have recorded source hashes, exact transformations and output hashes before
native acceptance. `SOURCE_INPUTS.json` fixes the baseline for this skeleton.

## Verification stages

The `native-workflow.test.mjs` definitions use actual APFS helper operations,
SQLite, transaction store, lifecycle wrapper and Profile. No transaction, disk,
database, model-write staging, or commit is mocked. The only synthetic authority
is the test's trusted user/window capability. The recovery test injects an error
after durable intent; it is not new SIGKILL or power-loss evidence.

The current placeholder causes positive workflow cases to fail with
`SEP_MAC_WORKFLOW_NOT_IMPLEMENTED`. That is the expected initial RED, not an
accepted package. After a real implementation, all fixed cases must execute with
zero skipped tests. No test's failure may be deleted merely to make the run green.
Missing native environment is an explicit preflight failure, never a green skip.

Local Windows syntax checks and source binding checks do not certify APFS, a
native confirmation UI, Finder/LaunchServices, full application shutdown, or
paid-model behavior. See `REPRODUCTION.md` for the bounded native command and
evidence rules.
