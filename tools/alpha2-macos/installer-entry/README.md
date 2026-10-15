# Fixed-account first-install controller

Current controller status: r55 passed the original 22 native definitions, five
portable boundary definitions and four recovery-list definitions (31 total).
The r53 missing-implementation failures remain historical evidence. Later r79
used the actual controller in a separate installer test entry: six installation
assertions plus two installed-product startup/restart cycles passed. See the
[installer status](../installer-ui/STATUS.md) and [artifact bindings](../package/MAC-PREVIEW-EVIDENCE.md).
These results do not certify physical confirmation in the original installer,
the current unbuilt source changes, or all macOS environments.

The contract separates an in-memory, read-only preview from explicit confirmation and durable execution. Cancelling a preview must leave the account, source, target and data unchanged. Confirmation must recheck candidate bytes and native fd-bound account/parent/data facts before any write.

The native account helper derives the real account from getpwuid, fixes Applications/DSH SEP.app and the existing alpha2-mac-finder-preview data root, and owns a separate private installer journal/lease. Governance records use held directory descriptors, no-follow identity checks and durable publication. Node does not write these records. Files are bounded to 32 MiB, private single-link 0600; directories are 0700. Files use fsync and F_FULLFSYNC and directories use fsync. This does not claim survival of every storage or power-loss failure.

Durability order:

1. Native fixed-path admission and exclusive installer lease after explicit confirmation.
2. Upper confirmation record reaches durable storage.
3. Unchanged core prepares its plan using the confirmed real parent; the lower plan records the exact confirmation hash.
4. State binds both stored byte hashes before execution.
5. Unchanged core performs copy/verification/no-overwrite publication; its actual completion closes before committed is returned.

Confirmation without a lower plan cannot resume execution. A durably planned transaction can explicitly resume. An executing transaction delegates to core recovery and retains blocked when its journal is missing or unverifiable. A published target with later business data can only complete its known installation record; it cannot roll back or delete data. No method starts the application.

The first controller version has no mid-copy cancellation. Closing admission is separate from ending accepted work. A close timeout or unknown native cleanup must remain blocked; whenClosed resolves only after actual closure.

A lower-core cleanup uncertainty retains the upper native lease and blocks later admission. It cannot be converted to pass merely because the caller stopped waiting. Native primitives do not spawn descendants. Same-user external code remains a trusted operating-environment boundary; these journal protections do not sandbox arbitrary host code.

Five separate portable boundary definitions cover quarantine of already queued work, ordinary close draining, every UTF-8 split of a Chinese account path, invalid UTF-8 rejection and byte limits. Initial production-equivalent extraction was 2 pass / 3 fail on Windows; corrected code passed 5/5 on Windows and again on native macOS in r53. They exercise shared pure boundaries rather than native filesystem installation.

Recovery-list extension: listRecovery returns only transaction IDs, phase and blocked/pass classification, without stored plans or paths. The native helper enumerates at most 64 private 32-hex transaction directories under the fixed governance root and keeps its exclusive lease until all accepted reads finish. The controller caps cumulative record reads at 64 MiB and each native record at 32 MiB. Exceeding either bound rejects the whole list; it never silently truncates. Aliases, unsafe directory identity, lease or transport failures also reject the whole list. Logical corrupt records remain visible as blocked entries. A missing governance root returns an empty list without writes. A list native session cannot create records or execute WRITE/BEGIN/OPEN. The UI must not read or enumerate governance paths itself. Original 22 and separate 4 test definitions remain unchanged.

In the list summary, recoverable:true means the validated recorded plan may be submitted to the explicit resume operation; it does not promise the lower staged transaction can complete. For example, an executing entry may still have an interrupted copy whose lower recovery correctly refuses. An incomplete upper confirmation or corrupt record is recoverable:false and remains preserved.

Native CI has 4 account definitions plus 18 real signed-fixture/controller definitions. The latter cover read-only preview/cancel, wrong hash, changed source/target/data, prior data, aliased parent, durable bindings, corrupt approval, four real SIGKILL phase cases, concurrent lease, stale cancelled references, closed admission, unknown recovery and a lower-plan symlink attack. No mock storage or mocked core is used.

The native installer bundle and its manifest now have the separately bound r78/r79 evidence above. Developer ID/notarization, downloaded Gatekeeper experience and original-entry physical confirmation remain unverified; no bypass is provided.
