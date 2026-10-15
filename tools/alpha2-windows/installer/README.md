# Windows Alpha.2 fresh installer

`install.mjs` exports `install({bundle, destination, hostRoot})`. All output belongs to a new, absent, absolute Windows x64 destination whose existing parent resolves to itself. The installer never modifies a donor or an existing instance. It does not start Electron or make model requests.

The manifest is schema 3 with `kind: full | sep`, DSH `0.2.1-alpha.2`, SEP `0.2.1-beta.3-alpha2-adapter.1`, revision `windows-package.2`. `graph` and `descriptor` contain `{path,size,sha256,mode}` and must name `graph.json` and `desktop-runtime.json`. They are copied to the immutable program directory independently of `graph.files`. `payload` and `required` must cover that materialized program graph exactly once. `required` additionally gives `sourcePath` relative to an explicit official donor. Every selected byte is verified before target creation and again during transfer; a package version alone never authorizes donor reuse.

`support` uses target-relative paths under runtime, managed/bootstrap, installer or docs, plus the named public root documents. Its desktop subset must exactly agree with the Electron 44.7.0 payload receipt. The four production files in this directory are `install.mjs`, `fresh-profile.mjs`, `daily-profile.mjs` and `DAILY-PROFILE-ORIGIN.json`; tests and this implementation note are not runtime dependencies.

The installer creates its own project UUID, empty workspace/knowledge directory, sessions, governance storage, managed Profile and runtime paths. The public `daily-profile.mjs` transformation is captured unchanged from the source repository and bound by `DAILY-PROFILE-ORIGIN.json`. No private daily configuration or data is an input. It initializes the new P2 coordinator and a real version-3 zero-consumption ledger; the session default is 100 CNY and task guard is 5 CNY. `.env` contains an explicitly empty `DEEPSEEK_API_KEY` field. The generated start.ps1/launch.mjs use the normal credential-reading launcher path; GUI acceptance is a separate actual-package test.

Failure after destination creation retains the tree and `INSTALLING.json`. It does not delete partial or unknown data. The default launch refuses the marker or a missing/malformed installation receipt. Retrying requires a different new destination or explicit operator investigation; this installer is not an in-place updater or an automatic recovery tool.

Revision 2 places the ledger at `state/budget/budget.json` and creates that parent separately from `state/locks`. The Profile, P1 configuration and Budget initializer share the one path returned by `createFreshProfile`; the installer no longer duplicates its own ledger location. Revision 1 placed the ledger directly under `state`, which overlapped the lock root and violated the existing project-binding directory contract. No protection check was relaxed, and existing installations are not migrated by this fresh installer.

20 local behavior definitions passed after recorded RED stages. They use actual filesystem copies and the real captured Budget implementation, with synthetic small program/P2 fixtures. Two definitions additionally import the hash-pinned, unmodified `project-binding.js` and execute its physical-directory admission: the legacy layout is rejected with `SEP_BINDING_SCOPE_CONFLICT`, and the corrected layout reaches the subsequent deliberately absent-provider guard. The recovery authority in this narrow fixture is synthetic; reaching that guard does not claim full binding or host acceptance. The actual diagnostic host exposed only the outer `SEP_DAILY_INITIALIZATION_BLOCKED` code, not the inner scope code. Full/Only startup and GUI acceptance must therefore be recorded separately. Historical revision-1 failures remain preserved. Test fixture runtime references are deliberately local and the test file is excluded from public runtime support.

Run with Node 24.21.0 and an explicit fresh D: output root:

```powershell
$env:SEP_WINDOWS_INSTALL_TEST_ROOT = 'D:\AIData\ProjectWork\DSH\alpha2-windows-packages-20261015-r1\installer-tests-next\cases'
& '<Node 24.21.0 executable>' --test --test-reporter=tap '<source>\installer\install.test.mjs'
```
