# POSIX owner-lock adaptation — isolated candidate, 2026-09-29

This change enables owner-file transactions on canonical local ext4 directories
on Linux and local APFS block volumes on macOS. Network filesystems, WSL host
mounts, unverified volumes, symlink aliases and ambiguous ownership fail closed.
Windows retains its existing schema-1 process creation-time identity and volume
checks. This is not an installer, desktop or full-platform support declaration.

POSIX records use `sepOwner` schema 2: `platform`, `pid`, `bootId`, `namespace`
and `birth`. Linux reads boot ID, PID namespace and `/proc/<pid>/stat` field 22.
macOS uses `kern.bootsessionuuid` and `ps lstart` in fixed UTC/C locale. macOS
birth time has second precision: identical values remain alive, including an
ambiguous same-second PID reuse; they never authorize takeover. Process evidence
is sampled twice around kill(0), and missing evidence/permissions/timeouts remain
unknown. A different verified boot permits retirement; another PID namespace in
the same boot does not. Windows/unknown-format records are not auto-migrated.

SQLite exclusion, durable publication receipts, no-replace hardlink publication,
file identity checks and interrupted-publication reconciliation are unchanged.
Both independently distributable packages retain the same POSIX adapter source;
the portability tests exercise both copies. The change does not reset budgets,
request a model, rewrite memory, or alter the active Windows installation.

Validation must include fresh ownership, exclusive contenders, release, five
abrupt publication exits, PID reuse classification, live orphan records, foreign
records, malformed records and hardlink/symlink rejection. Empty P2 storage and
Recovery initialization are separate integration probes. Full application build,
GUI behavior, host supervision, installation and private-data migration remain
outside this adaptation slice.