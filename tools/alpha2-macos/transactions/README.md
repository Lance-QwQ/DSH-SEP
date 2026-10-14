# macOS trusted file transactions — integration candidate

This controller manages copied project files. The imported source is retained
unchanged. It is not an arbitrary-shell carrier and does not weaken the Linux
carrier or the Windows protected-profile contract. `run()` refuses with
`SEP_MAC_SHELL_UNAVAILABLE`; the desktop must not silently route that request to
an ordinary host subprocess.

The initial surface is `planWrite`, `review`, `view`, `commit`, `planRestore`,
`current`, `discard`, `recover`, and the governed-document deletion methods.
`planWrite` requires the existing file's SHA-256 or the literal `absent` for a
new file. A file's parent directory must already exist. Candidate review and
commit are separate operations; a sibling commit invalidates older plans.

The controller owns generations, candidates, the SQLite state, and deletion
records outside any untrusted worker container. The native tree helper uses a
single project `.native.lock` for every mutating/copying native call. Reopening
the controller first takes the same native-operation barrier. A still-running
helper makes recovery busy instead of being mistaken for a completed cleanup.
The SQLite owner transaction is an additional exclusive-controller lease.

Publication writes a durable intent, creates and verifies a new generation,
records publication, checks the target, and finally commits the generation,
sequence and `committed` transaction state together. SQLite uses
`synchronous=FULL`, `fullfsync=ON` and `checkpoint_fullfsync=ON`. File durability
is supplied by the fixed native helper. SIGKILL tests exercise process-crash
windows; they are not physical power-loss certification.

Deletion authority is supplied independently (the P2 integration boundary).
The local deletion journal is not restored with file generations. Deletion
purges managed generation and candidate bodies, records every removed content
hash, and rejects their reintroduction at another path. Original imported
source retention is explicit. An unavailable or inconsistent authority blocks
restoration rather than reviving old content.

The store is platform-neutral trusted orchestration. Its default macOS entry
must enforce Darwin and use a packaged, hash-pinned APFS helper. A build with
`SEP_POSIX_TEST` is only a Linux/POSIX test fixture and cannot certify APFS or
be selected by a user-facing runtime setting. All test data are synthetic.

This candidate does not establish App Sandbox isolation between arbitrary
Shell tasks, complete descendant termination, Developer ID signing,
notarization, or physical power-loss resilience. Those properties require
separate integration evidence. Same-user code outside the managed process is
not made untrusted by this controller alone.

Run the integration tests only in an explicitly selected synthetic directory:

```
SEP_MAC_TREE_HELPER=/absolute/path/to/native-tree \
SEP_MAC_TRANSACTION_TEST_ROOT=/absolute/path/to/synthetic-output \
node --test transactions/transactions.test.mjs
```

The helper's source, build flags, binary hash, source inputs, command and full
test log must be bound in the caller's verification record. Testing a
`SEP_POSIX_TEST` binary must be labelled as such in that record.
