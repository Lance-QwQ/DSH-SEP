# macOS Alpha.2 desktop evidence through r22

Current scope is an isolated macOS 15 ARM64 preview. The managed desktop gate
and native package assembly passed; the installed package's three-cycle desktop
acceptance has **not** passed. No daily instance, main branch or Release was
changed by these probes.

## Fixed native inputs

- Official DSH: `0.2.1-alpha.2`, source commit
  `d743267388641bc76f17c45ce8b4c231aed1d32c`.
- Carrier build: run `38513869259`, successful desktop job `115688181041`.
  Artifact `11871124360`, outer ZIP SHA-256
  `63cc8bd74c5750911b668ce5a41aa15239db1a59911204355ec334d4fa4bc0b8`.
- Managed source: public capture manifest SHA-256
  `c7a1d78b577648ceaa6e94006e8d910cfaff579c1a23bdec240921c2d4f2c597`.
  Explicit import changes, native entry inventory and signature receipts are in
  `managed-overlay-result/RESULT.json`; 14,182 unrelated entries are preserved.
- r22 test-branch commit: `75cd1e650d021015a7d871c44caaf7597e995fb2`;
  run `38527092957`, managed desktop job `115729907982`.

## Results and limits

| Check | Status | Actual evidence |
|---|---|---|
| Original official carrier | pass | Earlier run `38519791762`: three native window/background/reopen/Host-acknowledged shutdown cycles; not the integrated SEP Profile. |
| Managed overlay assembly | pass | Fixed native carrier, exact captured changes, ASAR integrity update, deep ad-hoc signature verification. |
| Missing controlled connection | pass | Actual packaged Electron emitted `SEP_MAC_CONTROLLED_ENTRY_REQUIRED`; nonce, PID and ASAR hash match; observed Node child dispatch count is zero. |
| Broker/helper regressions | pass | r22 `broker-integration.tap`: 27/27, including real child IPC, HTTP admission, Inspector and receipt/exit-order checks. |
| Mac core package assembly | pass | Real native app, Node, controlled file helper, core business Profile and broker assembled; package inventory recorded. |
| Installed three-cycle desktop smoke | fail | Round 1 `FULL_WORKSPACE_NOT_READY`; rounds 2 and 3 `not_run / PRIOR_ROUND_UNCONFIRMED`. |
| Installed program unchanged after use | not_run | Dependent on passing installed smoke. |
| Public Full/Only acceptance | blocked | Complete native lifecycle and remaining scope listed below are still unverified. |

The overlay's original 33 test definitions and broker/helper 27 definitions are
60 distinct definitions in r22. The README's expanded 36-definition command
includes three refusal-observer cases also in the broker/helper group; do not
add 36 and 27 as if there were 63 unique cases.

## Failure diagnosis and cleanup attribution

The r19/r20 negative probe reached the managed entry but tried to query Inspector
after Electron entered its startup-error handling. The r21 monitor-only probe
timed out waiting for a receipt. Electron 44.7.0's
[official ESM loader](https://github.com/electron/electron/blob/v44.7.0/lib/browser/init.ts#L176)
explicitly emits `uncaughtException`; Node's `uncaughtExceptionMonitor` is not
automatically emitted by that manual dispatch. The r22 test observer retains
the existing listener count and emit receiver/arguments/result, recording a
nonce/PID/ASAR-bound receipt before the native error dialog. Three targeted
regressions and the actual r22 negative probe passed. This does not replace or
suppress the production error handler.

The successful refusal sample was finally terminated by a **test-owned process
group SIGKILL**. That cleanup is not a graceful desktop shutdown result.

The r22 installed smoke had a running business Host (PID 4087) at the workspace
deadline. Its diagnostic contains no application startup exception. The old
probe did not archive window metadata, so it cannot independently prove which
window was visible. Source inspection establishes that a fresh credential-free
Profile takes the official Welcome path, while the old probe waited directly
for the workspace. The prepared revision uses the real `window.dshWelcome.skip()`
API without adding credentials, then awaits the actual workspace. Its native
execution is still **not_run**, so the Welcome diagnosis is not yet closed by a
successful reproduction. Round 1 was cleaned up by test-owned SIGKILL; no
product resource-release success is inferred from that cleanup.

The prepared smoke revision is
`449c0fa85db1f0a4bfdb14820dcfa722e4b6156fcc9acc7009296241ef8ef5a9`.
It remains separate from r22's tested bytes. No later native run is claimed.

## Bound artifacts

| Artifact | SHA-256 |
|---|---|
| `11876691626` / managed-overlay evidence | `db719bdeb23d8386210124c74aa6be12ab83dbf1f93a8a45d9f706d824a6dea4` |
| `11876651898` / installed-package evidence | `0f18c1b00f55c11afb1ba2a4f406e5f9874ba6716ec2f08859cde08b2ad1d084` |

The native assembly receipt records PROGRAM SHA-256
`49a3aaa7a1beb74ae64bc687a04566008a641ea02013f1d36e7945d5b8d448e8`,
tree SHA-256 `c260dee9312b31e7986d099341cace49012e68ae90773036444c4ba9c9c00db8`,
and a generated 509,764,143-byte archive SHA-256
`9d3ee2a441de0dd4892f5f31a898dc9a9bae0e17700d086f094385a9c9e15793`.
These are producer receipts, not a downloaded/revalidated distributable: the
complete candidate upload gate did not run after smoke failed.

## Remaining native scope

The next operation is the fixed core package's real Welcome/workspace,
background/reopen and acknowledged close sequence, three times against one
synthetic data root, followed by unchanged-program verification. The current
Mac first-close path does not use the Windows-only background notice; no user
confirmation for that notice is fabricated.

Physical mouse/Dock interaction, TCC/AX, paid providers, arbitrary descendant
cleanup, Developer ID/notarization, Finder direct-app bootstrap and automatic
update installation remain unverified or unavailable. Native automatic updating
is disabled; SEP installation paths reject with
`SEP_MAC_UPDATE_INSTALL_NOT_INTEGRATED`. Same-user hostile code remains outside
the owner lease's protection boundary. Successful core tests do not authorize
claiming all optional media/Shell/evaluation integrations or full Mac release
certification.
