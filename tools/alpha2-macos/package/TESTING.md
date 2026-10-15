# Local package test environment

Run commands from the repository root with the existing Node and Python runtimes on PATH. These examples create only new synthetic fixtures on D:. They do not launch, install, sign, upload or exercise macOS native code. Never rerun the production distribution/finalizer CLI against a completed delivery directory. Tests retain their generated cases; an old failed case is not a verified installation.

## Distribution reconstruction (18 definitions)

The two Python suites each have 9 definitions and use small real ZIPs. `SEP_DISTRIBUTION_TEST_ROOT` is required, absolute and must exist before execution. Each test creates its own unique child. No API key, GitHub token or downloaded release is needed.

```powershell
$caseRoot = 'D:\AIData\ProjectWork\DSH\macos-low-review-20261015-r1\packaging\distribution-cases'
New-Item -ItemType Directory -Path $caseRoot -Force | Out-Null
$env:SEP_DISTRIBUTION_TEST_ROOT = $caseRoot
python -B .\tools\alpha2-macos\package\verify-application-distribution.test.py
if ($LASTEXITCODE -ne 0) { throw 'Application distribution tests failed' }
python -B .\tools\alpha2-macos\package\verify-installer-distribution.test.py
if ($LASTEXITCODE -ne 0) { throw 'Installer distribution tests failed' }
```

`python -B` suppresses only newly written bytecode; it does not remove an existing `__pycache__`. The production verifiers' fixed output directories and metadata requirements are described separately in their operator documents. Do not use the synthetic tests to populate or authenticate those production records.

## Delivery finalizer (17 definitions)

The unchanged production path policy only permits fresh output children beneath `D:\AIData\ProjectWork\DSH\alpha2-macos-package-20261014-r1`. Therefore this test uses a new child there, rather than changing the operator's root. `SEP_DELIVERY_TEST_ROOT` must be an existing real directory beneath that root. Each test creates a unique child and does not touch `mac-preview-delivery-r1`.

```powershell
$finalizerRoot = 'D:\AIData\ProjectWork\DSH\alpha2-macos-package-20261014-r1\low-review-r82-finalizer-tests'
New-Item -ItemType Directory -Path $finalizerRoot -Force | Out-Null
$env:SEP_DELIVERY_TEST_ROOT = $finalizerRoot
node --test .\tools\alpha2-macos\package\finalize-mac-preview.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Delivery finalizer tests failed' }
```

One historical negative test reads the original r72 audit at the exact path and SHA documented in [FINALIZE-MAC-PREVIEW.md](FINALIZE-MAC-PREVIEW.md). A clone without that external record cannot run the complete suite: preserve this as missing evidence rather than substituting current rows or claiming a pass. All other records/archives are synthesized into the designated test root. The tests call the real production module; no source-root rewriting, VM substitution or native process mocks are used.

## Other package tests

These are existing test inputs, not newly certified native functionality:

| Test | Required generated-output variable |
| --- | --- |
| `package-inventory.test.mjs` | `SEP_MAC_PACKAGE_TEST_ROOT` |
| `bootstrap-manifest-builder.test.mjs` | `SEP_DESKTOP_TEST_ROOT` |
| `prepare-installer-signing.test.mjs` | `SEP_INSTALLER_LAYOUT_TEST_ROOT` |
| `split-application-artifact.test.mjs` | `SEP_ARTIFACT_SPLIT_TEST_ROOT` |

Use fresh, existing, absolute real directories on D: for these variables; the signing-layout suite uses fixed case names within one run, so do not reuse its root. `app-layout.test.mjs` and `installed-profile-binding.test.mjs` need no generated-output variable. `successor-r74/candidate.test.mjs` normally imports its adjacent implementation; `SEP_SUCCESSOR_BASELINE` is an optional historical RED override and must remain unset for a current-source verification.
