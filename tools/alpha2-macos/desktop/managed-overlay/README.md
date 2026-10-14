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

The local origin tests use raw R6 and remain local. CI runs 20 tests using only
the public derived capture (no native desktop or paid model claims):

```sh
SEP_MAC_MANAGED_CAPTURE="$RUNNER_TEMP/managed-inputs" node --test \
  tools/alpha2-macos/desktop/managed-overlay/entry.test.mjs \
  tools/alpha2-macos/desktop/managed-overlay/paths.test.mjs \
  tools/alpha2-macos/desktop/managed-overlay/captured.test.mjs
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
`package.json` is merged with the two JS dependency declarations and explicit
overlay metadata; it is not replaced by the R6 source manifest. App re-signing is
ad hoc, with deep verification; this is neither Developer ID signing nor
notarization. Relative framework links are retained by `ditto`.

## Current validation boundary

The original 21 portable tests passed on Windows against the exact R6 inputs;
the public capture adds two checks for a combined 23 local definitions. JavaScript
syntax checks passed. Actual Mac ASAR assembly/signature verification, a native
missing-connection startup check and a protocol-4 broker desktop cycle are still
pending. The separate carrier probe exercises official Host startup and native
window callbacks, not this managed overlay. The next gate must run against the
assembled app: controlled connection refusal, real broker identity/ready,
close/background/reopen, accurate task inspection, graceful close and confirmed
resource release. Preserve failed samples and distinguish test cleanup from
product cleanup. The overlay must not be reported as Full/Only accepted yet.
