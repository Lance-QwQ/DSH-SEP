# Independent welcome readiness candidate

This adds a separate welcome surface proof to the frozen r35 workspace readiness
candidate. It does not change the existing capture, product packages or daily
installation. Local tests execute real fixed-source fragments with synthetic
Electron/React boundaries. They do not certify a real React or Electron welcome
window, Finder launch, provider access, physical input, or production transport.

## Contract and ownership

`createWelcomeReadinessGate({window, expectedUrl, isClosing, onReady})` binds one
owned window to its current primary frame and the **exact** file URL of
`renderer/welcome.html`. The document obtains an independent 32-byte random nonce.
Neither the workspace `dsh-app://app` proof nor a successful `loadFile` can satisfy
this gate. Unknown receipt fields, wrong frames/URLs, stale nonces, navigation,
closing, preload failure and renderer loss refuse readiness.

The fixed welcome script emits two signals: after synchronous account-state
subscription installation in its existing effect, and after `flushSync` returns
and final pagehide cleanup registration completes. Existing hooks, providers,
account handlers and cleanup order remain in place. Notice/login/analytics
Promises are not readiness conditions. The preload privately latches the two
signals before requesting the current document nonce and acknowledging once.

`waitForReady(loadPromise)` bounds the combined load and receipt at 5 seconds.
Failure reuses the existing owned-window destroy and handler cleanup path. After
the outer `showWelcome` has assigned `welcomeWindow` and checked closing/recovery/
workspace transition, `windowShown()` publishes only when that same document is
visible. Its internal callback receives:

```js
{schema: 1, surface: 'welcome', rootCommitted: true,
 handlersBound: true, windowId}
```

This is distinct from the workspace receipt's `loaderCompleted`. User Skip or
login is not required; a transition to the workspace waits for its independent
root commit and loader proof. The production controller is not connected yet.
The callback is an internal fixed main closure option, not renderer-supplied.

## Exact derivation and assembler API

`await composeDesktopReadiness(inputs)` is exported by `welcome-compose.mjs`.
`inputs` contains Buffers under these keys:

| Key | Fixed input |
| --- | --- |
| `main` | captured main `ae32d9e0…` |
| `preload` | captured application preload `8d5a4517…` |
| `frontend` | actual carrier ASAR frontend `1819a4e8…` |
| `ui-renderer` | actual carrier renderer client `e40ba7ee…` |
| `welcome-preload` | captured welcome preload `af3e3ca7…` |
| `welcome-script` | captured welcome script `a1658ac7…` |
| `welcome-html` | unchanged fixed HTML `02a6b02c…` |

The main chain is mandatory: original `ae32…` → r35 workspace `2ac292bb…` →
welcome. An already-derived main is rejected at the entry. Each unique text
transformation records its source/result SHA256 and exact replacement, so the
chain can be replayed. All full hashes live in the two derive modules.

The result has nine `outputs`, each with `key`, `domain` (`asar` or `host`),
relative `path`, `bytes`, `sha256`, and ordered `origins`. The two new helper files
are explicit ASAR inputs; they have no original predecessor. The frontend must
be replaced **inside ASAR**, while the UI renderer is the module served by the
host payload. Replacing only a host frontend copy does not affect packaged
desktop loading.

After composition, an assembler may run the existing fixed `rewriteDesktopImports`
as a separate recorded transformation. It must rebuild ASAR header integrity,
sign the derived app, update its PROGRAM binding and whole-package inventory,
and actually validate the product before claiming readiness. This candidate
builder does none of those installation actions.

## Reproduction

First use the unchanged r35 `prepare-inputs.mjs` to bind the actual fixed carrier,
signature and ASAR sources. Then `welcome-prepare-inputs.mjs` adds the three fixed
capture inputs and creates the intermediate main strictly through r35. It only
writes a new directory beneath RUNNER_TEMP. The job template records both input
receipts, the download receipt, signature, new test log and candidate origins.

Run the four **new** welcome test files with `SEP_RENDERER_READINESS_INPUTS` set
to the r35 raw input directory and `SEP_WELCOME_READINESS_INPUTS` to the welcome
input directory. There are 28 new definitions: 11 gate, 5 preload, 9 fixed-source
derivation/VM and 3 composition tests. The old r35 28 tests are not rerun or counted
as new evidence. Pending notice Promises, script errors, late proof, frame changes
and exact base-hash rejection are covered. VM boundaries remain synthetic.

Use `welcome-build-candidate.mjs <raw-workspace-inputs> <welcome-inputs> <fresh-out>`
to write the nine derived files plus a CANDIDATE manifest. Its origin chain and
input/source/output hashes are part of the review material.
