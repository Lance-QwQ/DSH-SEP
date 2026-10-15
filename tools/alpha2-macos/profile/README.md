# macOS controlled file Profile service

Current repair status (2026-10-15): the code-only model errors and directory
close fixes were exercised with the real POSIX test helper, SQLite and
lifecycle in isolated WSL. Native macOS/APFS replay and a new installed Mac
package containing these changes remain not_run; historical Mac results
bind the earlier frozen bytes. See [current repair scope](../MACOS-LOW-REVIEW-RESPONSE.md).

This is the trusted service between the host's tool registration layer and the
managed transaction controller. It does not mount a Loader, start a model,
install an application, or provide arbitrary Shell isolation.

Create the real project through `openGovernedMacManagedProject`, then pass its
lifecycle facade, the canonical logical `source`, and a trusted `authorize`
callback to `createControlledFileProfile`. The callback must verify that the
execution's agent is currently registered with the host and derive
`{sessionId, cwd, depth}` from that real agent. Tool JSON cannot supply these
fields. `cwd` must equal the stable logical source. A direct agent has depth
zero; one child level may read; further depth and child mutation are refused.
The caller also supplies its actual execution abort signal.

The factory returns two separate capabilities:

- `execute(kind, args, exec)` is the only capability to wire to model tools.
  It accepts `read`, `write` and `edit`. `bash`, `mcp_call` and
  `context_prepare` are explicitly unavailable; no ordinary subprocess is a
  fallback. Unknown actions, including commit and restore, are refused.
- `controller` is retained by trusted composition and user-confirmation code.
  It offers current/plans, resume, review, commit, discard, restore, recover,
  withView, status, close and whenClosed. Never register it as a model tool or
  expose it as a general RPC object. Review must precede exact-plan commit;
  the embedding UI must obtain the user's approval for that reviewed hash.

The model uses project-relative `file_path`. Paths with traversal, aliases,
absolute prefixes, backslashes, control characters or ambiguous suffixes are
refused. Reads return bounded strict UTF-8 (32 KiB maximum) from the current
managed candidate/generation; the original import is never the physical read
target. Both whole-view verification and held-file identity/content checks
surround the read. Returned content is data, not instruction or authorization. The model-facing execute boundary rebuilds errors from their bounded SEP/FS classification only; raw filesystem messages, paths, causes and stack traces are not passed through. Unknown native errors become FS_IO_ERROR. Trusted controller operations retain their separate diagnostic boundary.

Each session earns its own observation when a successful read returns. A
verified missing file under an existing parent returns `version: "absent"`,
allowing a subsequent create. A write requires that session's current-view
observation. Edits require exactly one nonempty match. Writes are at most
4 MiB, remain in a candidate, invalidate all observations, and do not publish
automatically. Later edits compose onto the selected candidate. A failed old
candidate cleanup returns control to explicit plan selection rather than
hiding extra plans.

On restart, existing plans require trusted selection or discard. Restore also
creates a candidate which needs review and approval. Original source files are
retained. `source` and session scope stay stable across generations.

All public operations are serialized, including trusted `withView` callbacks.
`withView(callback)` supplies `(verifiedView, lifetimeSignal)` and holds the
Profile's admission until the callback settles. The callback must not call a
queued method on this same Profile: doing so would wait on itself. It must not
retain the view for later use. The successor service also exposes trusted
`bindDocumentAuthority` and `withDocumentView`. The latter passes
`(verifiedView, documentOperations, lifetimeSignal)`; only its ephemeral
`review(path)` and `delete({marker, expectedPlanHash})` capabilities can reach
the managed-copy deletion controller. The capability is revoked at callback
exit and accepted operations are drained. P2 records its deletion marker and
purges managed copies within that same callback. A restart with a durable
marker but unfinished purge must bind/recover authority before asking for a
new view. Deletion invalidates candidate selections and all observations.
The model entry does not expose these capabilities; imported source remains.

Closing synchronously refuses new admission, signals cancellation, waits for
all accepted Profile calls, and then closes the lifecycle facade. Its response
deadline is bounded (default five seconds). A deadline returns `blocked` with
`resourcesConfirmedReleased: false` while actual cleanup continues. It never
turns an inner deadline into permanent failure: later verified completion can
resolve `whenClosed`, and ordinary blocked cleanup can be retried. Persistent
cleanup uncertainty in the underlying facade remains blocked. No resource is
declared released because a caller merely stopped waiting.

Run the real-core integration tests using an explicit synthetic output path:

```sh
SEP_MAC_TREE_HELPER=/absolute/path/to/hash-bound/native-tree \
SEP_MAC_PROFILE_TEST_ROOT=/absolute/path/to/synthetic-output \
node --test profile/controlled-files.test.mjs
```

The 22 tests use actual SQLite, native file operations and the real lifecycle
facade. Caller identity is supplied by a test-owned authority map; these are
service tests, not native Loader/Agent certification. One lifecycle test holds
the completion boundary of a real verified read to exercise nested deadlines;
it is not proof of an unkillable native process. A Linux `SEP_POSIX_TEST` helper
run is explicitly POSIX evidence. Darwin selects the production Mac entry and
must be tested separately. No paid model, private data, desktop interaction or
GitHub release is part of this suite.
