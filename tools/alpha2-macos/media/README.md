# macOS attachment-domain IO

This is the fd-bound IO layer for the attachment domain. It does **not** grant
deletion authority, mount the image provider or replace P2. The caller still
holds P2 ownership and the independent attachment-owner lease, reviews the
exact purge plan, records its intent before deletion, and verifies the known
partially deleted prefix when resuming after a crash.

`createMacAttachmentIO({helperPath, helperSha256, lockPath})` exports:

* `inventory(root)`: `{rootIdentity, version, sha256, entries, bytes}`. Every
  file entry contains its relative `path`, `kind`, `size`, `sha256` and exact
  `version`. No file body is returned to the caller.
* `checkDirectory(root)`: native private-directory identity check returning
  `{rootIdentity, dev, ino}`. This checks only the directory, not its children;
  it is suitable for a parent holding other P2 data.
* `removeFile(root, {path, expectedSha256, expectedVersion,
  expectedRootIdentity})`: compare all expected identity/content fields, then
  remove through a no-follow native parent descriptor and sync the directory.
* `publishMetadata(root, {path, text, expectedSha256, expectedVersion,
  expectedRootIdentity})`: exclusive creation uses both expected values
  `"absent"`; replacement uses the exact previous file values. Text is limited
  to 1 MiB. File data receives `F_FULLFSYNC` on Darwin; directory state is synced.
* `syncDirectory(root)`.

The dedicated helper keeps the existing attachment policy bounds: at most
2,000 enumerated entries, 256 MiB total, 20 MiB per file, and depth 16. Both
files and directories consume the entry budget. These are inventory ceilings,
not per-upload allowances: the image/file provider must retain its smaller
upload limits (4 MiB in the existing Profile), queue and domain quotas. The
project tree remains 1,024 entries / 32 MiB / 4 MiB per file. Neither it nor
the generic task's input/output limits is changed.

A descriptor-bound metadata preflight rejects an oversized domain before
transferring its bodies. The normal capture and final verification still run;
the preflight is a quota check, not a substitute for the identity snapshot.
The 30-second native deadline also applies to otherwise valid inventories;
the ceilings do not promise every maximum-size domain finishes on slow media.

The native traversal is mechanically derived from the separately verified
APFS helper. `origin.json` records every exact source hash and replacement;
the test replays both derivations. Every traversed item must be local APFS,
current-user owned, private, regular-file/directory and non-aliased; hard
links and symbolic links are refused. The Node/native transport is bounded,
but internally transfers file bytes to compute SHA-256. This is not a claim
that private bytes never enter the trusted controller's memory.

All mutating helper calls use the configured private native lock. Callers
must fix it for the domain and retain uncertainty after helper cleanup cannot
be confirmed. A deadline or kill request does not prove completion. The
SIGKILL test covers a controller stopping **after one confirmed removal**;
it does not certify arbitrary power loss or all mid-publication windows.
Unknown leftovers, changed identities or a missing/unverifiable deletion
intent must block recovery rather than authorize deletion.

Initial `home`/`purges` directories may be created by the trusted assembler
under a previously checked private parent, with identity checks before and
after and while the ownership leases exclude governed writers. There is no
claim of protection against arbitrary same-UID host code renaming those
parents concurrently. Untrusted tasks must never receive these directories.

Native macOS test runner (fresh absolute output directory):

```sh
node media/run-native-tests.mjs /absolute/fresh/output
```

Portable traversal tests may instead compile `native-attachments.c` with
`-DSEP_POSIX_TEST` on an isolated ext4 filesystem, then set
`SEP_MAC_ATTACHMENT_HELPER` and `SEP_MAC_ATTACHMENT_TEST_ROOT` for
`node --test media/attachment-io.test.mjs`. That is POSIX evidence only;
Darwin/APFS and `F_FULLFSYNC` require the native macOS run.
