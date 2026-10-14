# Fixed-account first-install controller

Current status: RED scaffold, not implemented or native-verified. Original installation/first-install.mjs and install-native.c remain unchanged.

The contract separates an in-memory, read-only preview from explicit confirmation and durable execution. Cancelling a preview must leave the account, source, target and data unchanged. Confirmation must recheck candidate bytes and native fd-bound account/parent/data facts before any write.

The future native account helper derives the real account from getpwuid, fixes Applications/DSH SEP.app and the existing alpha2-mac-finder-preview data root, and owns a separate private installer journal/lease. All governance paths and record reads/writes use held directory descriptors, no-follow identity checks and durable publication. Node string-path checks cannot replace that boundary.

Durability order:

1. Native fixed-path admission and exclusive installer lease after explicit confirmation.
2. Upper confirmation record reaches durable storage.
3. Unchanged core prepares its plan using the confirmed real parent; the lower plan records the exact confirmation hash.
4. State binds both stored byte hashes before execution.
5. Unchanged core performs copy/verification/no-overwrite publication; its actual completion closes before committed is returned.

Confirmation without a lower plan cannot resume execution. A durably planned transaction can explicitly resume. An executing transaction delegates to core recovery and retains blocked when its journal is missing or unverifiable. A published target with later business data can only complete its known installation record; it cannot roll back or delete data. No method starts the application.

The first controller version has no mid-copy cancellation. Closing admission is separate from ending accepted work. A close timeout or unknown native cleanup must remain blocked; whenClosed resolves only after actual closure.

Native CI has 4 account definitions plus 18 real signed-fixture/controller definitions. The latter cover read-only preview/cancel, wrong hash, changed source/target/data, prior data, aliased parent, durable bindings, corrupt approval, four real SIGKILL phase cases, concurrent lease, stale cancelled references, closed admission, unknown recovery and a lower-plan symlink attack. No mock storage or mocked core is used.

Public AppKit installer, final bundle manifest, complete-package verification through this new controller and downloaded Gatekeeper experience remain later stages.
