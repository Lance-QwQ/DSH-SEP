# Alpha.2 native macOS desktop carrier

This is the desktop component of the forthcoming full SEP package. A successful
carrier build or UI smoke does **not** certify the complete protected SEP Profile.
Only the dedicated macOS test branch is in scope; no Release or daily switch.

Fixed official source: `deepseek-ai/deepseek-harness` commit
`d743267388641bc76f17c45ce8b4c231aed1d32c` (DSH 0.2.1-alpha.2).
On 2026-10-14 the GitHub release assets list was empty and the official
`https://download.deepseek.com/dsh-desk/feeds/mac-arm64/nightly-mac.yml` pointed to
0.2.0-rc.2. Therefore this job builds the fixed source; that older public binary
is not accepted as Alpha.2 evidence.

Upload allowlist: `carrier-origin.mjs`, `carrier-origin.test.mjs`,
`build-carrier.mjs`, `smoke-carrier.mjs`, `run-command.mjs`,
`run-command.test.mjs`, this README and the CI job template.
There are no source snapshots, credentials, real sessions or personal files.

`ci-job.yml` is a job template to merge into the authorized test workflow. The
native job requires Darwin arm64, Node 24.19.0 and the macOS 15 runner tools.
It installs pnpm 11.28.5 after checking its archive against the SHA-512 in the
official lock, preserves the frozen lock and explicit minimumReleaseAge=1440,
then invokes the official unsigned directory packaging command. Official native
runtime/Office smoke is included. Python/Office payload preparation is retained.
Install is bounded at 20 minutes, packaging at 45 minutes and the job at 90
minutes. These are safety deadlines, not a measured completion estimate.

Four exact official inputs receive narrowly declared transformations. The
result has BundleID `ai.dshsep.alpha2.preview`, product name `DSH SEP`, its own
`dsh-sep://` protocol, and separate home/settings/logs. `ORIGIN.json` records
source and result hashes plus every replacement. Other versions or bytes fail.
The local six tests were observed red against the identity baseline, then green.
Two additional real subprocess tests cover complete log streaming and deadline
termination. The command runner waits for log completion before reading a
receipt. After a deadline it allows at most ten seconds to join its own process
and five seconds to settle the log; unconfirmed cleanup is `blocked`.

The UI smoke preserves all three planned rounds. It runs the actual assembled
app with a test-only loopback Inspector. The observer records native child IPC
without changing ready/exit results. It skips onboarding using the real welcome
API, opens the real workspace without paid requests, checks close-to-background,
dispatches the Electron Dock activation callback, and requests normal quit.
Successful rounds require the same window and Host PID on reopening and real
Host `shutdown-complete` followed by exit 0. Failure cleanup has its own record
and cannot be counted as normal shutdown success.

Physical Dock clicks, TCC consent, screenshots/dragging, protected work-copy
transactions, full SEP plugins, Developer ID signing/notarization, public
installation and automatic updates remain separate checks. macOS official
Desktop does not create the Windows tray; the native convention is Dock
activation and the application menu.
