# Private product main adapter candidate

`deriveProductMain(bytes)` only accepts the combined workspace-plus-welcome main
SHA256 `7745582ee2f114b6933490c62c4b44a966daba8e23b54291592260f73d177939`.
Its predecessor chain remains original captured main → r35 workspace → welcome.
It returns derived `bytes` and exact `origin` transformations. Apply the original
bare-import rewrite after this final main transformation, with a separate origin.
The frozen capture and previous candidate packages remain unchanged.

The main imports `lib/sep-product-control/electron.cjs` and the new
`lib/sep-product-window-actions.mjs`. The private endpoint's companion
`fixed-program.cjs` and `transport.cjs` must be installed in the same control
directory and bound by the assembler. The endpoint owns physical PROGRAM/ASAR
identity verification and fd3 initialization; the adapter accepts no identity
digest from the renderer, command line or environment.

The endpoint is created after the existing `before-quit` listener is registered
and before the first primary window is created. Each readiness gate reports its
own full receipt to `ready(receipt)`. On delayed initialization, `isReady` checks
the current selected surface, exact window ID, visibility and live document gate.
An obsolete hidden workspace behind a welcome window cannot satisfy it.

`canActivate` is a different callback. It requires the same already-published
current document/window proof but permits the window to be hidden. The fixed
r38 welcome helper is separately derived by `product-gate-derive.mjs` to expose
this internal condition; its visible `snapshot().ready` is unchanged. Workspace
already retains its document proof while hidden. The endpoint uses `canActivate`
before restoring, then the actual focus callback uses visible `isReady` before
acknowledging. This resolves the reproduced combination failure where two
individually reasonable visibility checks made all background restore fail.

`activate` uses the existing owned focus path, then confirms that the same window
is visible and focused and still has a valid document proof, within one second.
It does not interpret creation/spawn or a `focus()` return as activation. The
existing focus callback is synchronous; unknown asynchronous callbacks refuse.
Actual OS focus remains to be validated on macOS.

`requestQuit` calls the existing `app.quit()` and preserves its confirmation.
Only the existing declined branch calls `quitCancelled()`. `finishQuit` sends
`quitting()` before continuing the original cleanup. IPC notification failure
logs only `SEP_PRODUCT_NOTIFICATION_FAILED` and cannot skip that cleanup.
`quitting` is not a closed or resources-released receipt. The broker still needs
its independent host/desktop exit and lease-release proof. A failed private
channel invalidates UI readiness and uses the existing fatal handler when not
already quitting; it does not manufacture a successful exit.

There are 20 product definitions: seven synthetic owned-window callback tests,
five fixed actual main/helper transformation/VM tests, five combinations using
the real endpoint/channel, real document gates and real window callbacks, and
three exact application-input tests. They cover
stale/hidden/mismatched windows, focus timeout, callback exceptions, source-hash
rejection and continued cleanup after notification failure. They do not run the
real Electron carrier, React, Finder or physical focus. The combination tests use
window and duplex-stream models; their endpoint and readiness implementations
are real. The same five definitions reproduced two hidden-window failures before
the fix and passed all five afterwards; these are not counted as ten definitions.

`product-build-candidate.mjs <combined-main> <fresh-output>` writes main, the new
window helper, separately derived welcome helper, origins and source/output
manifest. This is not a complete app;
it does not include the independently owned endpoint files or sign/install it.
The optional `product-ci-steps.yml` follows the welcome candidate job to verify
these same definitions against the native fixed-source candidate.

## Applying to a fresh application draft

`applyReadinessToApplication({applicationRoot,captureRoot,productControlRoot,
evidenceRoot,asarPath})` in `apply-to-application.mjs` accepts only Darwin arm64
and the fresh schema4 layout produced by the parent `stage-application.mjs`.
It requires RUNNER_TEMP destinations, an unsealed draft without PROGRAM or
BOOTSTRAP, the exact r33 ASAR and predecessor PROGRAM hash, and fixed capture
and three endpoint-module hashes. It rejects mismatched old host/ASAR files and
occupied new helper paths before writing.

The thirteen-file plan includes twelve changes and unchanged welcome HTML. Its
main chain is captured base → workspace → welcome → product → original bare
import rewrite. It verifies every old ASAR entry outside the exact edit set is
byte-identical (and retains link/executable/unpacked properties). It updates the
served host renderer separately, rebuilds ASAR header integrity, then ad-hoc
signs and verifies the **inner** app. Original ASAR and renderer bytes plus full
origins remain in the separate evidence directory. Failure leaves a failed
disposable draft, never an activated installation.

The parent must then hash final entries, write PROGRAM/BOOTSTRAP, sign the outer
app **without `--deep`**, and verify the complete app. Deep-signing the outer app
after PROGRAM creation could change the already-bound inner executable. Neither
this assembler nor signature validation proves actual launch/readiness/quit.
