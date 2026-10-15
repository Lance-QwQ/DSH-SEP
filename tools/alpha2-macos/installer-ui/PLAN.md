# Limited macOS native installer user entry — implementation plan

This is an implementation contract, not a passing verification record. The
first-install core and its signed synthetic fixtures passed separately. The
user controller, native account journal, AppKit UI and assembled installer
must each retain their own source-bound native outcomes.

## Ownership and immutable package

The deliverable is a separate `Install DSH SEP.app`. Its fixed `NSBundle`
contains one application payload, one Node runtime, the controller, the two
native helpers and their complete code closure. The native front end embeds
the manifest SHA-256 at build time. No command line, environment variable,
URL, renderer, model or downloaded metadata may supply a helper, Node binary,
payload, installation target or home directory.

The current system account comes from `getpwuid(geteuid())`. The target is
`~/Applications/DSH SEP.app`; business data remains in the existing fixed
account data location. The installer never launches a shell. Its own child
communicates over private pipes with an exact, bounded protocol; no loopback
HTTP endpoint is introduced. Holding a path or an old recovery locator does
not authorize installation.

The original r44 payload is a verification fixture. Later integration may
package a new complete candidate, but must recompute the complete manifest,
compile the binding, sign, archive, restore and test those final bytes. An
installer result cannot transfer passing claims to a different payload.

## Review and native confirmation

Opening the installer requests a read-only preview. The window shows the
fixed target, whether its parent will be created, the application version,
package size, the separate data location and whether existing installation or
data prevents first adoption. Preview/cancel must create no account directory,
journal or business data.

The Install button is enabled only for the current verified preview. Clicking
it presents an AppKit confirmation bound to the exact plan hash. The child
then repeats the source/account/path checks before durably recording approval
and entering the existing copy/publication transaction. A changed plan is
rejected; neither UI nor controller auto-accepts a replacement plan.

Duplicate clicks are disabled and cannot enqueue a second installation.
Cancellation before dispatch invalidates the preview. During accepted copy or
publication, window close offers continued waiting; it does not kill the
helper, erase the journal, delete a staged tree or claim rollback.

## Interrupted operation and close

The UI obtains a bounded recovery list only from the controller's native
`listRecovery()` entry, which enumerates strict transaction names and checks
its own fixed records. It exposes classifications and transaction IDs, not
record bodies or arbitrary paths. A locator remains untrusted: only the
controller can validate the native journal and bound core plan. A missing,
corrupted, mismatched or incomplete journal remains blocked, and cannot be
silently omitted as if no recovery were needed. No renderer directory scan or
user-selected JSON becomes authority. Recovery requires a new visible user
action and never automatically starts the installed application.

Closing first closes admission, then waits for accepted work and actual child
closure. A deadline or missing receipt reports blocked and preserves the
owner; a pipe close or process-exit request is not resource-release evidence.
Native test teardown is reported separately from production cleanup.

## After commit

`committed` means verified program publication and durable records; it does
not mean the application is running or all SEP features passed. A separate
Open DSH SEP button invokes LaunchServices for the exact fixed installed app.
The UI reports dispatch separately from application health. Failed opening
does not erase the committed installation or existing business data.

## Fixed validation to add before a package-ready statement

1. Native account/first-install controller: preview, changed source/path,
   existing data, alias rejection, bound confirmation, lease collision and
   actual crash/recovery windows, without touching an official DSH sentinel.
2. Private protocol: byte/shape/sequence limits, one-use confirmation,
   unsolicited responses, dropped pipes, wrong owner/plan and close races.
3. Real AppKit actions against a signed synthetic payload: cancel unchanged,
   confirm, duplicate click refusal, running-copy close, blocked recovery and
   separate post-commit open. Automated AppKit control is identified as such.
4. Assemble the complete installer with final payload and exact manifests;
   verify signatures, archive/restore and final inventories, install then run
   the actual application twice from the final path, retaining the same data.

Physical Finder/Dock input, Developer ID, Apple notarization and arbitrary
macOS versions remain unverified until they are actually tested. This route
adds no administrator service or Endpoint Security entitlement.
