# Native installer UI — RED candidate

This directory contains 15 fixed behavior definitions and a deliberately
unimplemented `SEPInstallerUI` stub. Native CI must first compile and record
these actual AppKit assertions failing for missing UI behavior before runtime
implementation. A compilation failure is not the intended RED result.

Tests invoke actual NSButton actions, inspect actual NSWindow/NSAlert sheets,
and pump the native main run loop. The transport and application opener are
synthetic and never install or open a payload. Acceptance is an AppKit test
action, not physical mouse/keyboard or Finder certification. The model has no
route to this interface. Production NSBundle/manifest/child-path admission,
native wire decoding and real LaunchServices dispatch are separate work.

The internal transport delivers already nonce/sequence/schema-validated
responses and actual child-termination observations. The UI still binds
confirmation to the reviewed exact plan, disables duplicate dispatch and
requires both the closed release receipt and non-signalled exit 0. Busy close
cannot terminate or race accepted installation work. Recovery list unknowns
remain visible and cannot be resumed as if verified. The Open button is a
separate user action after commit and passes only the verified installed URL.
Startup first requests the read-only recovery list. Only an empty verified
list proceeds automatically to a fresh preview; recovery itself always needs
an explicit user action and confirmation.

The fixture tears down only its own synthetic windows and alerts. It creates
no account directories, native journal, child installer or production owner.
No source/destination/helper/runtime path is read from argv or environment by
the UI. CI output uses RUNNER_TEMP. No existing product or r44 package changes.
