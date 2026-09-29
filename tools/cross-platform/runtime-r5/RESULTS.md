# Native runtime validation r5

Tested commit: `0cbfda8755a3ab6a4ae42ce2a8ceba11e795e71b`. DSH remains rc.2; the immutable r4 application source manifest remains unchanged.

| Check | Linux WSL2 x64 | macOS arm64 |
|---|---|---|
| Native assembly regressions | 8 pass | 8 pass |
| Primary Node/Python/office runtime | pass | pass |
| Actual managed desktop-host, recovery and empty governed store | pass | pass |
| P1 budget/memory settings and controlled restart assertions | 17 pass | 17 pass |
| Program closure | 629 packages / 23,162 files | 629 packages / 23,843 files |

[macOS CI and artifacts](https://github.com/Lance-QwQ/DSH-SEP/actions/runs/36535556183). The historical 119 application regressions also passed in that run; they are not 119 new acceptance requirements. [Separate component regression](https://github.com/Lance-QwQ/DSH-SEP/actions/runs/36535556061).

The isolated assembler now binds native-custom-loader 0.1.6 to its exact platform binding 0.1.6. Previously the binary existed but its shared loader could not resolve it outside the development dependency layout, causing the managed host to exit before readiness. The corrected red/green regression reproduces that missing dependency edge; checks are not bypassed.

The health check uses synthetic empty data and no paid model calls. It distinguishes the 100 CNY default session cap, 5 CNY turn cap and 100 CNY shared budget; invalid values and stale revisions fail, settings survive restart, and each owned host exit is observed. Plugin-group/branding configuration is not per-feature coverage. Empty-ledger checks do not prove retention of nonzero historical consumption.

This is not a distributable installer or full desktop acceptance. Production Profile features, actual Only/Full installation, official-instance coexistence, real upgrade/rollback with nonempty data, Electron interactions and OS permissions still need validation. Windows daily, main and Releases are unchanged.