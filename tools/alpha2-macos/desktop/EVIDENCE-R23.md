# r23 native Mac core desktop acceptance

The isolated **core** macOS 15 ARM64 package passed three installed desktop
cycles against one synthetic data root. This covers the actual packaged
Electron app, real core SEP business Profile and managed broker. It does not
certify all optional integrations or a public macOS release.

## Inputs and retained evidence

- Test commit: `9d754da37ca399594dc9e19027ff8ff3547095d5`.
- Run `38547010709`, desktop job `115795449819`.
- Official DSH `0.2.1-alpha.2`; managed ASAR SHA-256
  `e7b5f7899e409a587b0cb931d6d34658626ee6906a9cd77fde35e9484a5c6259`.
- Actual installed PROGRAM SHA-256
  `49a3aaa7a1beb74ae64bc687a04566008a641ea02013f1d36e7945d5b8d448e8`.
- Program inventory tree SHA-256
  `c260dee9312b31e7986d099341cace49012e68ae90773036444c4ba9c9c00db8`.
- Tested desktop smoke SHA-256
  `449c0fa85db1f0a4bfdb14820dcfa722e4b6156fcc9acc7009296241ef8ef5a9`.

| Artifact | SHA-256 |
|---|---|
| `11884434212` installed-package evidence ZIP | `b4950ca79a5b8fa6c5c1301e5beddf90f00d7ee5c29346a42f980d32bcb99ba2` |
| `11884867829` managed-overlay evidence ZIP | `0c46bc9c09dba5c9a2372717d91511aeb7e6c66b24bb1a4efc14157812ab651a` |
| `11884503938` complete core-package artifact ZIP | `db3ecea27d84129301b2e931ed6d7f0f28dd28276c3c08109efbd0ad3a6fd613` |

The native producer records an inner `DSH-SEP-macOS-Alpha2-preview.zip` of
509,764,143 bytes, SHA-256
`2bcf3328ba64208c3153dcaa03706b860ea85af9aba7d535b0b11405df9c3e16`.
The two small evidence ZIPs were downloaded and independently hash checked.
The complete candidate is handled separately by the package operator; this
desktop evidence record does not claim to have downloaded that large artifact.

## Actual installed results

| Round | Host PID | Desktop PID | Welcome → workspace | Background/reopen | Acknowledged close |
|---|---:|---:|---|---|---|
| 1 | 8853 | 8933 | pass | same Host and window | pass, exit 0 |
| 2 | 9167 | 9228 | pass | same Host and window | pass, exit 0 |
| 3 | 9253 | 9276 | pass | same Host and window | pass, exit 0 |

All rounds used the same data root. The real task-inspection RPC returned no
active or scheduled work before close; the test did not substitute that result.
The probe asserted the child's release receipt and the durable launch
generation's closed state. The main smoke receipt has an empty cleanup list:
these three cycles did **not** require test-owned termination.

Window actions use real Electron callbacks and the official Welcome
`window.dshWelcome.skip()` API. No fake credential was installed and no model
request was made. These are programmatic native/UI API tests, not physical
mouse or Dock tests. The separate post-smoke program-inventory CI step passed;
its `POST-SMOKE.json` is in the complete package artifact, rather than either
small evidence ZIP.

The actual missing-connection negative also passed again, with the expected
`SEP_MAC_CONTROLLED_ENTRY_REQUIRED`, zero observed Node child dispatches and a
nonce/PID/ASAR-bound receipt. **That negative sample's final cleanup was a
test-owned SIGKILL.** Its successful refusal must not be combined with the
positive cycles to claim graceful shutdown of the negative sample.

## Relation to the r22 failure

[r22's original failure record](EVIDENCE-R22.md) is retained. It timed out waiting
for a visible workspace without operating the blank Profile's Welcome page.
r23's installed PROGRAM and entire program-tree hashes are identical to r22.
The repaired probe performs the official Welcome skip step, and all three
cycles pass. This is a controlled comparison supporting a missing onboarding
operation in the old probe, not evidence that a desktop runtime fix was needed.
The r22 first-round test-owned cleanup and two not-run rounds remain unchanged.

## Remaining scope

This result does not include a later media/Shell Profile or changed PROGRAM
schema; those need distinct inputs and native evidence. Physical interaction,
TCC/AX, paid providers, arbitrary descendant cleanup, Developer ID/notarization,
Finder direct-app bootstrap and automatic update installation are not covered.
The core package starts through its controlled `.command` launcher; directly
opening the app without a valid managed connection refuses. Native automatic
updates remain disabled and SEP install paths remain unavailable on this Mac
preview. No main-branch, GitHub Release or daily installation change is part of
this evidence.
