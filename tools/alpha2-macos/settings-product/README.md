# Unchanged r44 settings persistence diagnostic

This directory contains test code only. It restores the exact signed r44 app,
checks its full inventory before and after the test, and performs three predefined
cold starts sharing one fresh synthetic data directory. The actual application,
ASAR, frontend modules and signatures are not changed. No daily installation,
private data, API key or paid model request is used.

Round 1 observes the real memory and session-budget settings, changes automatic
memory recall from true to false, and saves the default limit from CNY 100 to 80.
Rounds 2 and 3 use the same data after normal shutdown, and must observe false/80
before any settings edit. Every successful round closes the settings dialog,
performs normal app quit and requires confirmed owner release and worker exit.
Failure or unknown ownership stops later rounds, recorded as not_run. There are
no replacement runs, retrying failed clicks, forced process kills or artificial
releases. An unknown owner is retained. A later cleanup cannot upgrade the
original failed/blocked round.

The Inspector connection first records a read-only PID identity sample. After
the actual controlled desktop reports welcome or workspace ready, a second
sample must match the exact child PID, physical ASAR app path and Electron ready
state. Only then is the existing test helper alias bound to that same observed
Electron object. If welcome appears, the original visible, enabled, non-inert
API-key then Skip controls are each dispatched once. Workspace readiness and
the separate 32 x 14 CSS pixel SEP badge are still checked before settings.

`worker.mjs` and `operator.mjs` are exact, reversible derivations of the fixed
workspace diagnostic sources. `ORIGIN.json` records every literal transformation
and both hashes. `derive.test.mjs` verifies inverse replay, wrong-source refusal
and module syntax. `SOURCE_INPUTS.json` binds all existing test dependencies,
including the unchanged DOM probe SHA-256
`d55c0c5fa47651ede888bc66c171576474ce02decd42f2582ae9b55447afd203`.
The original seven classifier definitions remain unchanged; four additional
definitions cover source derivation and series ordering. These 11 contracts are
not actual Mac settings acceptance.

The outer operator starts each derived operator using the package's verified Node.
The original operator's 330-second work limit and 20-second cleanup request remain.
The outer observer stops waiting after 400 seconds per round without killing it;
unknown exit/resources remain blocked. The workflow has a separate 35-minute CI
ceiling. CI teardown never counts as a successful product cleanup.

The artifact allowlist includes receipts, exact inputs, synthetic window
diagnostics/screenshots and logs. It excludes the generated data directory,
credentials, cookies, environment dumps and the large restored app. Each round's
raw worker/operator receipt is retained along with the aggregate RESULT.

## Run

Use `ci-job.yml` with macOS 15 arm64 and Node 24.21.0. Credentials are available
only to the fixed artifact restore step. The source verifier and 11 contracts
run first; `run-product.mjs <restored-r44-directory> <fresh-output-directory>`
then executes the three rounds. Both paths must be actual RUNNER_TEMP children.
The source subset is this directory plus the 14 files in SOURCE_INPUTS.json.
No dependency installation or new product build is required.

## Historical boundary

`settings-ui/EVIDENCE-R33.md` remains authoritative for the prior close-caller
diagnostic. Its two passes did not reproduce or explain the r29-r32 settings
closure. Passing this new fixed-r44 series would establish only the stated
current-product persistence cases; it would not identify a historical cause or
prove that historical issue fixed. Actual physical input, AX/TCC, no-Inspector
Finder lifecycle and broad release certification are outside this diagnostic.
