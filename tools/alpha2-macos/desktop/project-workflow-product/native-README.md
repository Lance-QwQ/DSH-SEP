# Derived application native probe candidate

These test/operator files are outside BUILD-FREEZE.json and outside all 76 installed runtime inputs. They run only on a new, independently assembled application and a fresh RUNNER_TEMP test root. They do not edit r44, the installed application, real Finder data, credentials, or model settings.

The worker and supervisor are exact derivatives of the r52 settings-product worker/operator. NATIVE-ORIGIN.json records both source hashes and each exact transformation. The existing actual-child PID/ASAR checks, authenticated readiness proof, one-shot welcome actions, real desktop/host close, generation marker, exit status and normal cleanup deadline are retained. An unknown worker remains owned and is not signalled or counted as clean merely because the CI job ends.

Run using the caller's verified operator Node:

```
node native-operator.mjs /absolute/new-assembly/RESULT.json RESULT_SHA256 /real/RUNNER_TEMP/probe/round1 /real/RUNNER_TEMP/probe/data 1
node native-operator.mjs /absolute/new-assembly/RESULT.json RESULT_SHA256 /real/RUNNER_TEMP/probe/round2 /real/RUNNER_TEMP/probe/data 2
```

Create only the parent `probe` first; each round and the first data directory must be fresh. The first round boots the real derived app, opens the actual Settings plugin, checks the four preload intents and public management denial, and confirms an empty synthetic baseline before normal close.

Only after that real closed marker, the second round opens the same installed Profile/controller/project privately for synthetic test setup. It commits one known fixture version through the trusted test controller and stages a second candidate. This setup is explicitly **not a UI-approved commit**. It closes and confirms release before any application restart. It then CAS-reconstructs only the exact original overlay at those same installed paths, keeping PROFILE/READY/budget/source bytes intact. The real new startup must migrate that exact overlay back, mount the same Profile, display the candidate diff after selection, cancel without applying, discard, create and preview a generation-1 restore candidate, and discard that candidate. The final closed inspection must still read generation 2, the known committed fixture bytes, unchanged original source, and no pending candidate.

The UI uses real DOM events through the exact owned Electron webContents. This is not physical input. No test replaces showMessageBox, generates a renderer approval token, or calls a management HTTP endpoint. Native confirmation acceptance and dialog cancellation remain `not_run` in this first probe scope. The separate `ax-capability.m` only calls [Apple's AXIsProcessTrusted](https://developer.apple.com/documentation/applicationservices/1460720-axisprocesstrusted), prints a Boolean for that helper process, and does not request permission or modify TCC. Even `trusted:true` would not establish a dialog interaction without a later separately bounded, identity-bound action test.

Each round produces INPUTS.json, WORKER-RESULT.json, RESULT.json, identity observations and cleanup records. Successful round 2 additionally includes PREPARATION.json, synthetic staging cleanup, PROJECT-DOM.json, the overlay migration hashes and final same-store inspection. Source hashes of this operator's actual imports are captured in INPUTS.json. Missing output or an unconfirmed normal child exit is never a pass. Native-helper cleanup uncertainty before a project handle is returned also retains the worker and is `blocked`, not a clean preparation failure. The five pure native-classification/derivation contracts have separate RED and GREEN logs; actual new-package execution is still `not_run` until CI provides its results.
