# Fixed production bootstrap admission

Status: native implementation awaiting GREEN verification. Eight portable
manifest shape tests have a recorded RED/GREEN cycle. Native r37 ran all thirteen
bundle-admission definitions against the previous entry: every binary compiled,
and all thirteen failed for the expected missing validation (not an environment
error). The new native reader is now implemented; the real controller remains
unconnected. These are identity fixtures and never execute their placeholder
Node file.

## Fixed layout

The outer application is an LSUIElement AppKit application. Its running
NSBundle supplies the application location; cwd, environment and command-line
arguments cannot choose another manifest, executable, data root or controller.

```
DSH SEP.app/Contents/
  MacOS/DSH SEP
  Resources/BOOTSTRAP.json
  Resources/PROGRAM.json
  Resources/product/runtime/bootstrap/controller.mjs
  Resources/product/runtime/desktop/...
  Resources/product/payload/...
  Helpers/DSH SEP Desktop.app/Contents/Resources/runtime/
    primary-runtime/dependencies/node/bin/node
```

`BOOTSTRAP.json` is schema 1, layout `macos-app-v1`. Its exact keys are
`schema`, `layout`, `program`, `node`, `controller`, and `closure`. Each role and
closure item has exactly `path` and lowercase `sha256`. All paths are relative
to Contents. The three role paths above are constants. `closure` contains the
controller and every production runtime file in sorted unique path order; the
controller's two hashes must agree. No test/fixture files are allowed there.
The actual runtime file set must exactly equal this closure. Node reads are
streaming and bounded to 256 MiB; the manifest is bounded to 256 KiB, individual
scripts to 4 MiB and the closure to 64 MiB. Native directory traversal uses held
directory descriptors, `openat`/`fstatat` without following links, and at most
1024 files, 2048 entries and 32 levels. Files must be regular with one hard link;
all visited directories and files must belong to this user or root and must not
permit group/world writes. Hash reads recheck file identities and the root path.
`production-manifest.mjs` is the packaging-time validation contract. Native
admission independently enforces the contract before any execution.

Compile `appkit-bootstrap.m` with
`-DSEP_BOOTSTRAP_MANIFEST_SHA256="<64 lowercase hex>"` after generating the
manifest. The expected digest is a compile-time constant, never an environment
variable. PROGRAM schema 4 uses Contents as its controlled root. PROGRAM does
not include the outer binary, avoiding a circular hash dependency. Final
distribution inventory and archive hashes cover the compiled outer application.

## Execution boundary

The future connected entry may execute only the verified role's Node with the
verified controller as its sole script argument. No extra controller CLI is
provided. FD 3 is the private inherited control channel. The first frame binds
the fresh nonce and actual PROGRAM digest. Data lives in the fixed user's
`Library/Application Support/DSH SEP/alpha2-mac-finder-preview`; the controller
derives and checks this value, and does not accept an argv/env replacement.

For this admission stage the valid manifest still returns
`SEP_BOOTSTRAP_PRODUCTION_NOT_CONNECTED` with `manifestVerified: true`. No
resource owner, host, Electron or model is started. Missing compile binding
keeps the original unconditional refusal. The synthetic macro remains a
separate build; no `--synthetic-contract` route exists in production.

The synthetic prototype's five-second overall deadline is not a product
lifetime limit. Product startup and requested shutdown will have separate
deadlines; ordinary running tasks will not inherit an overall timeout. Closing
a window does not authorize stopping its host. Unknown cleanup retains its
owner's isolation and lease; child exit or closed pipes alone prove neither.

## Remaining limits

This stage verifies bundle identities and bytes, not Developer ID, notarization,
Finder readiness or application lifecycle. Existing same-user code capable of
modifying the installed program remains outside the trusted program boundary;
hashing a file before a path-based spawn is not an atomic executable lease.
Production integration must preserve the controlled loader's own hash checks.
