# Alpha.2 macOS managed desktop overlay candidate

This is a desktop adapter candidate, **not a complete SEP package**. The real
macOS carrier build remains the native binary/runtime base. No Windows native
module, desktop-host bootstrap, private Profile or GTK quit patch is imported.

## Inputs and adaptation

`capture-r6.mjs` accepts the fixed Alpha.2 R6 desktop package through
`SEP_MAC_R6_DESKTOP`. It captures only package metadata, runtime JS/CSS, renderer
documents and icons plus the pure-JavaScript `yauzl@3.4.0` / `pend@1.2.0`
dependency closure and licenses. Tests, `.env`, sessions and user configuration
are excluded. Its output includes original/derived SHA-256 for every file and
the exact replacement strings. Raw compiled source directories remain only in
local operator evidence. `sanitize-capture-local.mjs` creates a fresh public r3
whose 131 replacements across nine files are limited to compiler comments and
CommonJS factory display names; module imports are unchanged. The public manifest
records prefix hashes and replacement counts; exact original prefixes stay in
`LOCAL-ORIGIN-NOT-FOR-UPLOAD.json`. The scan rejects private-user and key literals.

The current public r3 capture has 91 files and `CAPTURE.json` SHA-256
`c7a1d78b577648ceaa6e94006e8d910cfaff579c1a23bdec240921c2d4f2c597`.
There are seven main-process and six updater transformations. The main source
is `7b73e57d9f520b76a9dc149bbb08d7e7f3dbaaeb9f961809d3217f546efec357`;
the updater source is
`8476632f8533b443fadc675b8d8a57b68878f20c5db254e4561da15b22e41047`.

The production invocation requires exactly one
`--sep-recovery-connection=/absolute/discovery.json` and explicit
`DSH_SEP_DATA_ROOT`, `DSH_DESKTOP_DSH_DIR`, and `DSH_DESKTOP_NODE_BINARY` (a separate
`node` executable). Missing inputs refuse before desktop initialization; they do
not fall back to an ordinary Host. These are shape checks. The existing R6
discovery reader and the future native broker retain local identity authority.

App data, logs, home and `dsh-sep://` are separate. The real R6 protocol-4 client
performs identity/start/ready/task-inspection/stop RPC. Its production broker is
not supplied by this overlay. Official automatic and mandatory update channels
are forcibly disabled. SEP checks/filter preferences remain available, but all
preparation/publication/worker-spawn/recovery entrances are blocked by
`SEP_MAC_UPDATE_INSTALL_NOT_INTEGRATED`. The Windows-layout `deployment-rc2.json`
preparer is never a Mac installation authority.

## Isolated reproduction

The local origin tests use raw R6 and remain local. CI runs 22 tests using only
the public derived capture (no native desktop or paid model claims):

```sh
SEP_MAC_MANAGED_CAPTURE="$RUNNER_TEMP/managed-inputs" node --test \
  tools/alpha2-macos/desktop/managed-overlay/entry.test.mjs \
  tools/alpha2-macos/desktop/managed-overlay/paths.test.mjs \
  tools/alpha2-macos/desktop/managed-overlay/captured.test.mjs \
  tools/alpha2-macos/desktop/managed-overlay/asar-plist.test.mjs
```

For actual assembly, use an independently hash-verified carrier artifact and a
reviewed capture. All four paths must be real paths under `RUNNER_TEMP`; output
must not already exist. Supply `@electron/asar` **3.4.1**, the version in the
official Alpha.2 lockfile, from an integrity-verified dependency install. Its
tarball integrity is
`sha512-i4/rNPRS84t0vSRa2HorerGRXWyF4vThfHesw0dmcWHp+cspK743UanA0suA5Q5y8kzY2y6YKrvbIUn69BCAiA==`.
Dependency installation and its lock receipt must be kept with CI evidence.

```sh
export SEP_MAC_OVERLAY_CAPTURE_SHA256=c7a1d78b577648ceaa6e94006e8d910cfaff579c1a23bdec240921c2d4f2c597
node tools/alpha2-macos/desktop/managed-overlay/apply-to-carrier.mjs \
  "$RUNNER_TEMP/carrier/DSH SEP.app" "$RUNNER_TEMP/managed-inputs" \
  "$RUNNER_TEMP/managed-overlay-result" \
  "$RUNNER_TEMP/asar-tools/node_modules/@electron/asar/lib/asar.js"
```

Assembly copies the whole app to a fresh directory, retains native dependencies
and runtime, and repacks ASAR using each original entry's unpacked flag. It
checks every unchanged original file's bytes, executable flag and link metadata.
The original ASAR/unpacked directories remain in the output for comparison.
`ElectronAsarIntegrity` is rebound to the new ASAR header before signing; an
existing header binding must match the original archive. The overlay does not
change Electron fuse settings. See [Electron's ASAR integrity contract](https://www.electronjs.org/docs/latest/tutorial/asar-integrity).
`package.json` is merged with the two captured JS dependency declarations and explicit
overlay metadata; it is not replaced by the R6 source manifest. App re-signing is
ad hoc, with deep verification; this is neither Developer ID signing nor
notarization. Relative framework links are retained by `ditto`.

## Current validation boundary

Latest native evidence: run 38519791762 completed the separate original carrier's
three actual macOS desktop cycles. This proves official Host readiness,
close-to-background, native activate callback reopening and acknowledged normal
exit for that carrier; it does not certify this overlay or physical Dock clicks.

Managed runs through 38521351369 successfully assembled and ad-hoc verified the
app, but did not reach its main entry. The final exception trace identifies a
real packaging omission: R6 main and `update-profile.mjs` import
`@deepseek-ai/dsh-app-boot`, whereas the original official desktop bundles its
devDependencies into main. The existing managed capture did not ship this bare
package at app root. This supersedes the earlier hypothesis that every managed
failure was only Inspector timing.

The first assembler repair bridged five explicit R6 desktop imports to the same fixed
carrier's `dsh/node_modules` using ASAR-internal relative links, after exact name
and Alpha.2 version checks. Existing app dependencies and host bytes are not
replaced. Each added link and source-manifest hash is recorded. Native run
38522299567 confirmed assembly but demonstrated that Electron's ESM package
resolution still did not follow those ASAR directory links, although CJS found
the package. That attempt remains failed.

The current repair adds nine exact static-import transformations across three
fixed capture files, targeting the same archive's real `dsh/node_modules` lib
files. Each transformation records source/result hashes, occurrence count and
target-file hash. All captured JS bare imports are reconciled: explicit Electron
and Node builtins, the five fixed mapped modules, or eight explicitly allowed
remaining specifiers whose actual resolved bytes must stay inside the extracted
carrier tree. Unknown imports fail assembly. The real Mac negative probe for
this repair is pending; its three local regression tests do not certify native
loading. Diagnostic exception pauses are disabled before
resuming the expected product refusal, so a test pause cannot masquerade as a
product hang.

The paragraphs below retain the earlier evidence generations as history.

The original 21 portable tests passed on Windows against the exact R6 inputs;
the public capture and ASAR plist checks bring this to 25 local definitions.
Four additional test-only Inspector state/deadline checks passed locally. The
initial `--inspect-brk` pause is before Electron finishes Node bootstrap: the
old probe's early `require('electron')` failed with `testEnabled is not a function`.
The revised probes wait at the packaged main module's first executable statement
before installing passive observations. This diagnosis does not establish any
DSH product startup failure or successful lifecycle result.

Native run 38518239419 (commit `1d4bc059`) verified the previous assembler,
integrity-pinned ASAR dependency installation and deep ad-hoc signature; 14,182
unchanged entries were preserved. Its negative probe failed during Inspector
evaluation and required test-owned SIGKILL cleanup. That run predates the ASAR
plist helper and revised Inspector timing, which need their own native run.
A successful missing-connection startup check and a protocol-4 broker desktop
cycle are still pending. The separate carrier probe exercises official Host startup and native
window callbacks, not this managed overlay. The next gate must run against the
assembled app: controlled connection refusal, real broker identity/ready,
close/background/reopen, accurate task inspection, graceful close and confirmed
resource release. Preserve failed samples and distinguish test cleanup from
product cleanup. The overlay must not be reported as Full/Only accepted yet.
