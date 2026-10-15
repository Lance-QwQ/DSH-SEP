# AppKit implementation candidate after r55 RED

r55 compiled the fixed Objective-C inputs and produced 15 expected failures
against the missing implementation. The test file and header remain the exact
RED bytes. `InstallerUI.m` now implements a real window, buttons, bounded
review summary, recovery table and NSAlert sheets. This file is a candidate;
native GREEN must be recorded before treating the behavior as verified.

The first read lists recovery records. Only an empty verified list proceeds
to a new preview. Confirm and recovery buttons capture the exact displayed
plan/transaction and dispatch once after the actual alert is accepted.
Cancellation does not install; changed-plan errors do not replace approval.
Accepted work disables duplicate controls. Closing while it is active keeps
the window and displays continued-waiting status; it sends no parallel close,
termination or kill. Closing when idle first ends UI admission. Successful
resource release needs both `closed/resourcesReleased` and a separately
observed, non-signalled child exit 0, in either arrival order. A 10-second UI
observation deadline reports blocked without terminating the owner. A later
observation does not erase that blocked outcome.

`committed` requires the expected transaction, exact reviewed target for new
installs and `applicationStarted: false`. Open is a separate button invoking
the injected LaunchServices adapter for only the committed file URL. Dispatch
success is explicitly distinct from application health. This candidate still
uses the synthetic opener in tests; it does not supply the production adapter.

Native `SEPInstallerPrivateTransport` must already enforce nonce, sequence and
exact wire schemas; this UI adds bounded immutable reply capture and semantic
review/commit checks. Production NSBundle admission, native wire transport,
real account installer composition, actual LaunchServices opening and physical
interaction remain separate, unverified stages. No stdout/stdin/model/HTTP
entry or environment-supplied program path is introduced.

Run the new `green-ci-job.yml` alongside independent admission tests. Preserve
the original `ci-job.yml` and r55 archive as the RED record; do not relabel
historical inputs as though they contained this implementation.
