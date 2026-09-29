# Application build validation r4

This is an isolated test-branch source snapshot, not an installable release. DSH remains based on 0.1.7-rc.2; this work does not change the Windows daily installation or declare Linux/macOS generally available.

## Scope

- Frozen pnpm 11.7.0 workspace install, native system module, complete host/client/Web build, and desktop JavaScript bundling.
- Budget settings API/UI: 28 tests; plugin-manager and separate SEP/sidebar state: 83 tests.
- Actual built CLI/Web startup: 8 tests covering successful HTTP startup with unrelated plugin failures, required dependencies, required expressions, occupied ports, and detached rejection cleanup. All use synthetic data and isolated homes, with no model calls.
- Linux WSL2 x64 passed these checks. The macOS job rebuilds and repeats them independently; only its completed logs establish its result.

The source fixes restore workspace dependency references at the already locked versions, restore six upstream build configurations from the pinned rc.2 commit, remove a machine-specific bundler override, mark the two SEP client projects as composite, and correct test mock types. Three test dependencies are explicitly pinned at versions already present in the lockfile. The budget tests now use declared dependencies and relative source imports instead of a developer's directories.

## Reproduction

Verify `SOURCE-MANIFEST.json` with `node verify-source.mjs` before installing dependencies. Install pnpm 11.7.0 into a separate tool directory. On Linux or macOS, set `SEP_APPLICATION_OUTPUT` to a fresh real scratch directory and `SEP_APPLICATION_PNPM` to that tool's `bin/pnpm.cjs`, then run `node run-application.mjs`. Build output is generated within this disposable source snapshot; caches and test temporary files use the explicit output directory. The runner writes per-step logs and `RESULT.json`.

The manifest binds every included file and lists omitted local review/history/generated-test artifacts. It includes no credentials, user conversations, installed dependency tree, or Windows daily program. Historical r1-r3 snapshots remain separate and immutable.

## Still outside this evidence

This does not validate a complete SEP profile installation, actual host code/config/data update, a standalone distributable installer, interactive Electron GUI, tray behavior, computer-use permissions, signed/notarized macOS delivery, or coexistence with an official desktop installation. Successful compilation and Web startup must not be reported as those outcomes. The existing release acceptance standards remain unchanged.