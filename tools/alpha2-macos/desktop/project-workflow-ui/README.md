# Current-project UI bridge candidate

This new directory is independently derived work. It does not modify the frozen workflow or r44 app. It installs no model tool or HTTP route. Only trusted composition passes the existing project and Profile controller; no second store is opened.

The initial executable RED sources and logs are preserved outside this directory in `P2/desktop/project-workflow-ui-red`. The candidate now passes 26 local contracts (13 bridge, six transport, two native-dialog-options, three Electron event adapters, two actual Node child IPC). Native storage/Profile cases (three), actual Electron confirmation UI, and full application integration are not_run.

The host keeps document contexts and one-use approvals private. Electron main binds the current window/mainFrame/document, retains the exact review, and requests a parented native confirmation. Renderer values cannot manufacture authority. Review data is bounded to 512 KiB and paged in 2 KiB pieces with whole-reply and review hashes. The transport caps frames at 4 KiB, pending requests at eight, and retained replies at two; nonce, PROGRAM SHA, owner generation and monotonically increasing request IDs bind the exact owned duplex. Protocol failure or EOF closes admission, without claiming resource release.

Closing the bridge admission precedes runtime drain; workflow.close is invoked only after that drain by trusted composition. Pending confirmations and workflow operations contribute to inspectQuit. Unknown cleanup cannot produce a pass receipt.

Native confirmation adapter uses parented asynchronous Electron dialog.showMessageBox with AbortSignal. Electron documents that signal cancellation requires a parent on macOS: https://www.electronjs.org/docs/latest/api/dialog . Synthetic results in portable tests are not actual user/native-UI evidence. The event adapter installs exact main-frame navigation/destroyed revocation; it accepts both current navigation details and the documented legacy positional argument (https://www.electronjs.org/docs/latest/api/web-contents#event-did-start-navigation). The actual application has not installed this adapter yet.

The child harness uses documented overlapped handles on Windows (https://nodejs.org/api/child_process.html#optionsstdio), and the normal pipe on POSIX. The original Windows extra-fd pipe failures and one test-only forced cleanup are preserved, separately from subsequent clean exit-0 runs. They were not product processes. Final test cleanup requires the workflow release receipt, both pipe directions ending, and exact child exit 0; no test kill is a passing outcome.

Runtime closure: `bridge.mjs`, `host.mjs`, `main.mjs`, `rules.mjs`, `transport.mjs`, `native-confirmation.mjs`, `electron-adapter.mjs`, plus the existing frozen `project-workflow/workflow-adapter.mjs`. Test fixture/worker/harness/runner files are excluded from any product runtime. No generic socket discovery, HTTP endpoint, model tool, second store, public approval token, or direct source mutation is added.

CI: `node tools/alpha2-macos/desktop/project-workflow-ui/run-native.mjs "$RUNNER_TEMP/project-workflow-ui/results"`, with frozen helper absolute path/SHA in `SEP_MAC_TREE_HELPER` and `SEP_MAC_TREE_HELPER_SHA256`; see `ci-job.yml`. A fresh output directory is required. The runner records every candidate input and frozen core input, exact counts, TAP hashes and each child cleanup. `--portable` is an explicit operator mode, never an automatic native skip.

Outputs must use D: locally or RUNNER_TEMP in CI. Full Electron/app integration is a later explicit origin-pinned candidate. Physical Finder input and paid models remain not_run.
