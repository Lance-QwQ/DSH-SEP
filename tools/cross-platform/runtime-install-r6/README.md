# Native installation validation harness (r6)

Internal Linux/macOS managed-host candidates only. No Electron GUI payload, daily Windows switch, or public desktop release is included.

The files in `packaging/` are an exact reviewed snapshot of the top-level installer/bootstrap inputs so a CI run has a fixed copy. Update that snapshot intentionally when changing the installer. Product installer fixes belong in the top-level `packaging/installer.mjs` as well.

Set all three explicit absolute paths before running `node run-install.mjs`:

- `SEP_NATIVE_SOURCE`: built, fixed r4 source snapshot.
- `SEP_NATIVE_OUTPUT`: successful r5 native runtime plus `program/` graph.
- `SEP_INSTALL_OUTPUT`: a new empty, real native output path on the D-backed WSL filesystem or the isolated macOS runner.

The harness builds both candidate kinds, installs them into new directories, tests two SEP instances, executes a same-schema synthetic delta through the real updater, injects one bounded test-only health failure, checks rollback, commits a separately confirmed plan, and audits durable decisions and owned processes. SEP-only borrows exact matching already-adapted host files; arbitrary official host compatibility is not established.

No real model calls or private data. The 1.25 CNY ledger receipt is synthetic. Test consent is signed only for these synthetic plans and does not authorize daily deployment. Final resource audit is separate from any earlier failed/timed-out result.
