# Managed-project lifecycle boundary

`openGovernedMacManagedProject(input, {closeDeadlineMs: 5000})` opens the real
Darwin managed-project controller and wraps every business method, including
read-only snapshots, reviews and plan listings. `wrapManagedProject(core, ...)`
is the equivalent trusted assembly boundary for an already-open controller.
It owns that controller exclusively; the underlying `core` must not be leaked
or invoked elsewhere after wrapping.

`close()` immediately closes admission, drains every accepted invocation, then
calls the actual controller close. Concurrent close requests share one receipt
promise. A 1–30,000 ms configured response deadline returns immutable `blocked`
with the pending read/write counts and `resourcesConfirmedReleased: false`.
The underlying work continues to be owned and observed; a response timeout is
never treated as cancellation or proof of process termination. A later close
can report the actual completed result. A temporary blocked result or thrown
close error clears this facade's attempt so a later close really calls the
controller again. Only pass is permanently memoized. Earlier blocked receipts
stay blocked; the controller must make successful resource release idempotent.

`whenClosed()` resolves only after all accepted invocations settled and actual
controller close returned `pass`, with no cleanup uncertainty observed. A
controller close failure, blocked receipt or cleanup-unknown operation keeps
this promise unresolved and close reports blocked. Subsequent close attempts
may still complete resource disposal, but this wrapper cannot clear observed
cleanup uncertainty or convert a controller's permanent blocked result into
pass; a separate recovery decision is required. It also does not kill
processes or impose a deadline on user business work.

Ordinary business errors (for example stale hashes or invalid plan references)
are returned to callers and release their admission slots. They do not imply
resource cleanup failed. Errors describing unconfirmed/blocked cleanup are
retained as bounded public codes and immediately quarantine new admission;
already accepted calls stay owned. Response receipts contain no message, stack,
path or document content. Old captured method references also reject after
admission closes.

Tests use the real transaction controller, SQLite state and native tree helper.
Two cases delay only completion after real reads/writes to exercise long-lived
accepted requests; another delays the real close acknowledgement. Fault cases
inject close/cleanup results at the real controller boundary, including first
attempt blocked/throw followed by a real disposal retry; they do not claim a
real unkillable process was reproduced. The real controller's own permanent
cleanup-unknown latch remains permanent and is never cleared by this facade.

```sh
SEP_MAC_TREE_HELPER=/absolute/path/to/native-tree \
SEP_MAC_LIFECYCLE_TEST_ROOT=/absolute/fresh/synthetic/root \
node --test lifecycle/lifecycle.test.mjs
```

A Linux helper built with `SEP_POSIX_TEST` provides labelled POSIX integration
evidence only. Actual APFS/macOS validation must run the same tests with the
production native helper on a Mac.
