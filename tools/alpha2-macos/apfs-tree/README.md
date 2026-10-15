# macOS APFS work-tree foundation

Current repair status (2026-10-15): the close/next race fixes have isolated
WSL/Linux POSIX-test evidence only. The native command below is available for
future execution; the repaired source has not yet passed macOS/APFS or a new
installed Mac package. INPUTS.json remains the historical frozen baseline,
not the current source manifest. See [current repair scope](../MACOS-LOW-REVIEW-RESPONSE.md).

The production native helper is Darwin/APFS-only. It opens every directory segment with directory-relative `openat` and `O_NOFOLLOW`, and binds file reads/copies to validated descriptors. Node receives bounded hex records and hashes the returned bytes. It never recursively opens user content through string paths or `/proc`.

`createProjectTree({helperPath, helperSha256, lockPath})` returns `tree(root,{copyTo})`, `directory(root,privateRoot)`, `syncDirectory(root)`, `applyFile(root,{path,expectedSha256,text})` and the immutable `lockPath`. Deletion uses `{path,expectedSha256,delete:true}`; creation uses `expectedSha256:'absent'`. Existing parent directories are required. `tree` preserves the Linux receipt shape `{sha256,version,entries,bytes}`. The directory handle supports asynchronous `stat({bigint:true})`, `sync()` and `close()`; it is not a Node numeric file descriptor. Closing synchronously rejects new commands, drains an already accepted stat/sync under its existing deadline, and shares the actual cleanup result with concurrent close callers. A failed cleanup remains retryable; no pending response waiter is replaced.

Production callers must supply a shared controller-root `.native.lock` path. Native tree/copy/mutation/sync calls acquire its nonblocking exclusive flock and retain it until native process exit. Recovery must call `syncDirectory(controllerRoot)` as a barrier before considering work by a crashed controller finished. A busy native lock is a reason to keep recovery blocked. The lock is never manually deleted to bypass a live owner.

Limits: 1,024 entries, 32 MiB total, 4 MiB per file, depth 16, 200 UTF-8 bytes per name; names with controls, invalid UTF-8 or dot traversal are refused. Symlinks, hard-linked files, foreign-owned entries, different device IDs and special files are refused. Copy destinations must be private, fresh and empty. They remain private evidence if an operation fails; this helper does not recursively erase failed copies. Source trees must be quiescent under the caller's authority: the native second pass detects observed source changes but is not an OS-level atomic snapshot of a hostile writer.

The capture protocol waits for `verify` after `prepared`, then securely traverses again before emitting `committed`. Tests modify source bytes and exchange source/destination roots at that boundary. Partial output is never a successful public receipt. Every file write requests `fsync` and, on Darwin, `F_FULLFSYNC`; directories request `fsync`. Unsupported/failed durability operations return `SEP_PROJECT_SYNC`. This does not constitute a physical power-loss certification.

`applyFile` is for an exclusive private controller directory, with cooperating callers serialized by the controller's lock. It is not protection against arbitrary malicious same-UID host code. It performs fd-relative precondition checks, private temporary write, durability requests and publication. Failed publication can be uncertain; the transaction layer must retain intent and verify/recover rather than replay automatically. Arbitrary Shell execution is outside this interface.

Run on a real macOS arm64 machine:

```sh
node run-tests.mjs /absolute/canonical/fresh/output
```

The runner builds the native binary with `xcrun clang` and runs 30 native plus 11 adapter tests for three rounds, retaining all logs. Non-Mac execution returns `not_run`/78 before creating output.

For separately labelled POSIX development tests on Linux ext4, compile `cc -std=c11 -DSEP_POSIX_TEST -Wall -Wextra -Werror native-tree.c -o native-tree-posix`, then run `python3 test-native.py /absolute/native-tree-posix /absolute/fresh-test-root`; use `SEP_APFS_HELPER` and `SEP_APFS_TEST_ROOT` for `node --test project-tree.test.mjs`. The explicit test build has no production APFS claim and must not be shipped as the Mac binary.
