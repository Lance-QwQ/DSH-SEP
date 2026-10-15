# Independent managed Mac renderer-readiness candidate

This is a fixed-byte candidate and contract test set. It is not installed in the
frozen carrier, image preview, daily application, or final Finder bootstrap.
The actual Electron hydration/commit path is **not_run**. There are no model
requests and this does not investigate or fix the historical settings closure.

## What ready means

The managed workspace is ready only after these gates meet for one document:

1. The official frontend's successful loader path finishes its active-plugin
   check and mount request.
2. A stable React child surrounding the original application tree actually runs
   its layout effect. The original `BootHandoff` placeholder, hooks and provider
   subtree remain unchanged. The callback is not placed after `hydrateRoot` or
   inside the placeholder's first layout effect.
3. The sandboxed preload has both events and the main-issued document nonce.
4. The main process accepts the current owned BrowserWindow, current `mainFrame`,
   fixed `dsh-app://app` origin and exact nonce. The owned workspace is visible.

This proves the root commit and loader completion, not the correctness of every
widget, settings dialog, asynchronous provider or child component. A caught
component error may still commit an error boundary. Welcome is a separate
surface and has no new ready proof in this candidate.

The preload closure is new per document. Navigation revokes an old nonce even if
Electron reuses the same frame object. Boot/preload/load/renderer failure prevents
late success. Duplicate callbacks are harmless. The main gate has an internal
`onReady` observer, but this candidate does not wire it to a broker or add a test
backdoor. That observer must be connected by the subsequent trusted main adapter.

The host also serves the renderer module to an ordinary authenticated browser.
When the desktop bridge is absent, the wrapper preserves that browser's original
root commit and sends no receipt. The managed main therefore remains unready;
absence of a bridge is never converted to a successful desktop proof. The
ASAR-only frontend boot-completed hook remains strict.

## Exact inputs and installation domains

`SOURCE_INPUTS` in `derive.mjs` is authoritative. Main and preload are the sanitized
r32 managed capture, before the existing ESM import rewrite. Frontend and renderer
are fixed r28 Mac package bytes, not Windows approximations.

| Candidate output | Required eventual destination |
| --- | --- |
| `main.js` | Inner `.app/Contents/Resources/app.asar/lib/main.js`, followed by the existing exact import rewriting |
| `preload.cjs` | ASAR `lib/preload-app.cjs` |
| `frontend.js` | ASAR `dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-C5TXjxs_.js` |
| `ui-renderer.js` | Managed host `node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js` |
| `sep-renderer-readiness.mjs` | ASAR `lib/sep-renderer-readiness.mjs` |

Packaged `runtimeResources()` ignores `DSH_DESKTOP_DSH_DIR` for static frontend
assets. Modifying the host's duplicate frontend file does not install the hook.
Before applying, compare the actual ASAR frontend bytes to the pinned input hash;
refuse any mismatch. Then record every changed entry, rebuild ASAR header integrity
and code signature, refresh PROGRAM's ASAR hash and the final package inventory.
Do not transplant this input hash onto a later import-rewritten main file. Compose
the two derivations in their declared order and preserve both origin records.

The default official update path stays disabled; this candidate adds no installer
capability or unmanaged fallback. The controller remains the sole application
lease owner. Readiness never permits releasing an active or blocked generation.

## Reproduction

Set `SEP_RENDERER_READINESS_INPUTS` to a fresh directory containing the four
`SOURCE_INPUTS` filenames, with their exact bytes. Tests need Node 24 and no npm
dependencies:

```text
node --test gate.test.mjs preload-bridge.test.mjs derive.test.mjs
node build-candidate.mjs <exact-input-directory> <fresh-output-directory>
```

Place input, output and logs in the authorized D: project work root on Windows,
or `RUNNER_TEMP` on native CI. The builder refuses an existing output directory.
`CANDIDATE.json` binds all inputs, derivations, helpers and test files. Its `pass`
means deterministic generation only, never native application certification.

Local tests use real pure gate/bridge functions and the actual fixed source bytes.
The wrapper contract test records hook scheduling in a small VM; it does not run
React hydration and is not reported as doing so. Native follow-up must exercise
the actual renderer: placeholder before commit, delayed/failing mount, successful
hydration, stale/subframe proof rejection, hide/reopen, and existing normal quit.

## Remaining integration work

- Connect the internal observer to the separately verified private Electron
  transport and the existing broker lease, without using host-ready as UI-ready.
- Connect controlled activate and quit/cancel to the original desktop closures.
- Integrate outer AppKit launch through Launch Services and restore the final
  signed package before testing.
- Preserve and test explicit welcome/workspace readiness states.
- Add the missing **SEP** badge beside HARNESS, keeping the required separate
  32 × 14 pixel SEP block. The current Mac screenshots do not certify this branding.
- Keep the historical intermittent settings closure unresolved unless future
  evidence identifies it. This work is independent of that issue.
