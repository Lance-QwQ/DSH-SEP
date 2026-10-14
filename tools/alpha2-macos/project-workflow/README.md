# Current-project user control candidate

This isolated candidate implements the current, single controlled project's
status, plan selection, bounded review, exact approved commit, discard, restore
planning, known-transaction recovery and generation history. It is not connected
to the application, a route or a model tool. macOS acceptance of this implementation
is pending. The r44 application, r46 diagnostic, original transaction/Profile
files and daily installation remain unchanged.

Commit publishes a managed generation; it never overwrites the original imported
source. Project import/selection UI, multi-project switching, export to an
external source, ordinary Shell and arbitrary file access are outside this step.
No physical candidate or generation path is returned to the caller.

## Private capabilities and confirmation

`openProjectWorkflow({projectId, ownerGeneration, source, controller, project,
authority, closeDeadlineMs})` is called by trusted composition only. `controller`
is the existing private Profile controller; `project` is its same-owner facade
using the two derived read-only methods below. Neither is exposed through JSON.

Every operation uses an opaque current window/document context. The private
authority implements `assertDocument(context)` and
`consumeConfirmation(approval, binding, context)`. The latter must consume a
one-use capability issued only after the current window displayed the bound
summary and an explicit user confirmation. A renderer-provided hash, checkbox,
JSON object or copied token is not authorization. Tests use a WeakMap authority;
actual native confirmation UI and owned IPC integration remain unimplemented.

The future Electron main and business host run in different processes. A WeakMap
object cannot be sent as JSON. The issuer must stay inside the business host;
trusted main may deliver precisely bound confirmation facts through an owned,
versioned private channel. That future adapter must bind the current window and
document. This candidate does not invent a generic approval RPC.

Review returns a random `reviewId`, `reviewSha256`, `binding`, `changes`, `diff`
and `coverage`. Binding includes project/owner/window/document, generation,
sequence, baseline/target/plan hashes and a five-minute expiry. Candidate and
baseline bytes are rechecked before confirmation consumption and again by the
original transaction at commit. Navigation, close, cancel, selection or byte
changes invalidate prior authority. The caller receives a clone of the review.

Cancellation while confirmation is being consumed can consume that one-use
capability, but it prevents commit dispatch. A new review and confirmation are
then required. Once commit dispatch has begun, cancel returns
`SEP_MAC_WORKFLOW_COMMIT_IN_FLIGHT`; it does not claim rollback. Normal transaction
and bounded close rules still apply. `blocked` close never claims release;
`whenClosed()` resolves only after the actual queue and owned controller confirm
release. A later successful cleanup is separate from an earlier blocked receipt.

## Boundaries and read-only derivation

`derive-sources.mjs` binds the original transaction store and lifecycle SHA-256
values, applies exactly two and one documented transformations respectively,
and records both directions in `READONLY-ORIGIN.json`. Existing sources remain
byte-for-byte unchanged. `project-factory.mjs` verifies the original inputs,
replay and shipped derived bytes before opening the same native owner/store.
Its production gate still requires Darwin arm64.

* `listGenerations({after, limit})` reads the same owner's authoritative SQLite
  generation rows, verifies each snapshot and returns at most 32 metadata rows.
  It does not infer generations from directories or open another database.
* `inspectPlan({planHash, signal})` runs as one owner-exclusive operation. It
  verifies exact current baseline and candidate before and after bounded file
  reads. No caller file path or callback is accepted.

The Profile queue is non-reentrant. The workflow calls its queued methods from
outside `withView`, then invokes the independent same-owner readback operation;
it never recursively queues a controller method inside a `withView` callback.

Plan listing allows at most 256 plans, at most 256 changes per plan and a 256 KiB
UTF-8 JSON response. Overflow rejects the whole response. Review allows 256
changed-file metadata entries, 16 KiB per file side, 64 KiB total read bytes and
400 diff lines. Binary, invalid UTF-8, file size, total size and line omissions
are explicit; committing such a review requires bound omission acknowledgment.
Directory/file type changes display the file side as an addition or deletion.
No body is silently omitted while claiming complete text review.

## Evidence and scope

The initial r48 native RED reached the missing adapter after real native setup
in all 17 fixed cases, with 17 confirmed fixture cleanup receipts. The original
test file remains SHA-256
`a9cd12ce226cf53e3a72e94b0a6f6de1384c99b44d836f788248518a5277ec8a`.

The candidate has auxiliary POSIX replay and 16 supplementary definitions:
preview 9, reversible origin 2, control boundary 5. POSIX replay uses a separately
recorded Linux-only fixture/factory derivation and the existing helper's explicit
`SEP_POSIX_TEST` build. It does not alter the production platform gate and is not
APFS certification. Its initial compiler/platform setup failures are retained.

The 17 native cases use real storage, SQLite, native helper, lifecycle and Profile.
Only the user/window authority is synthetic. Durable-intent recovery injects a
failure after intent persistence; it is not a power-loss or SIGKILL test. The five
supplementary control tests isolate asynchronous authority and controller timing;
they do not replace the real storage cases. No credentials or paid models are used.
See `REPRODUCTION.md` for commands and the exact transfer allowlist.
