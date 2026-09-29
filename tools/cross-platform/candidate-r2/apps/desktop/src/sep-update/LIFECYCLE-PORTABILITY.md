# POSIX lifecycle candidate (2026-09-29)

The updater now distinguishes Windows, Linux and macOS process evidence. POSIX
identity records carry identityVersion 2, platform, bootId, namespace, pid, birth
and exe. Linux uses procfs; macOS uses sysctl and ps in UTC/C locale. ps comm is
corroborating text, never authority to signal a PID or execute its reported path.
The same-second macOS birth ambiguity remains conservatively alive. Two samples
around kill(0) must agree; access failures, unsupported systems and contradictory
evidence block the update. Unknown legacy POSIX records need explicit maintenance
review, not automatic retirement. Windows retains its existing record fields;
CIM and kill(0) corroborate absence instead of treating query failure as exit.

Publisher deadlines retain blocked/unknown and do not kill or retry a potentially
committed operation. The Guardian separately owns actual ChildProcess handles:
normal close sends IPC, then the configured deadline forces only that handle
(SIGKILL on POSIX, existing forced termination on Windows). A further bounded
wait includes the exit fence plus 1000 ms; no confirmed exit yields
GUARDIAN_STOP_TIMEOUT and keeps ownership. A failed close can be retried. A
blocked close is not evidence of zero remaining resources. Tests which simulate
refused termination release the synthetic child via later test cleanup.

Launcher paths select electron.exe, Linux electron or Electron.app's executable.
POSIX uses case-sensitive canonical-path comparison and installation-owned HOME,
XDG config/data/cache/state and TMPDIR; desktop-session connection variables are
preserved. Windows layout remains unchanged. Bootstrap and update-runtime copies
are synchronized. This slice does not supply a Linux/macOS installer, .desktop
file, complete .app bundle, signatures or a real desktop acceptance result.

Tests use real child processes and synthetic state. Only unavailable external
semver/profile-composition dependencies have throwing import stubs; those APIs
must never run in these lifecycle tests. No real keys, provider calls, user data
or actual update publication are involved. The update's process gates and signed
worker lease run directly; complete candidate preparation and native installation
remain separate validation.