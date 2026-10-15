# Local Mac preview delivery assembly

This is the local delivery operator. The historical version passed 13 synthetic file tests and assembled the four-file preview from the audited r78 installer and r79 native installation/startup records. The output was fully read back and its SHA256SUMS entries verified. These are separate facts: the operator itself never runs an installer, signs an application, uploads files, or modifies an existing destination. See [the current evidence index](MAC-PREVIEW-EVIDENCE.md) for the native scope and original record hashes; full Mac certification remains `blocked`.

The CLI accepts two existing absolute JSON paths: the final installer's `DOWNLOAD-VERIFIED.json` and the independently reviewed installation `AUDIT.json`. The latter must contain an explicit `deliveryBinding`, added by the reviewer after checking the actual native evidence. Missing fields are rejected; build success does not imply installation or UI success.

Use the existing Node runtime to execute `finalize-mac-preview.mjs <absolute-download-record> <absolute-audit-record>` only after those real records exist. The CLI destination is fixed at `D:\AIData\ProjectWork\DSH\alpha2-macos-package-20261014-r1\mac-preview-delivery-r1`, which must not already exist. Synthetic tests may use a fresh child directory beneath the same evidence root through the internal API.

That fixed delivery directory already exists after the successful r79 closeout. Do not rerun this CLI into it or delete it to make a rerun possible. The download record used was `installer-r78-distribution/verified-package/DOWNLOAD-VERIFIED.json` (SHA-256 `e5bfadfc0b0c876f9f3a8b54542559c56585d8d4b82f9a9f1014929c06578ab2`); the independent installation audit was `installer-integration-native-r79/AUDIT.json` (SHA-256 `e0581b598011edb008378982d3b67282b2242d4b7206e3d27cc6301a34264f78`). Both paths are relative to the evidence root above. Updating this explanation did not rebuild the ZIP or change any of those original records.

## Required binding

`DOWNLOAD-VERIFIED.json` must have schema 1, status pass, canonical absolute `archive`, integer `bytes`, `sha256`, the installer's build `sourceCommit`, and `assemblyResultSha256`. The original `SOURCE-ASSEMBLY.json` must remain beside the download record; it is now read directly, not reconstructed from audit values. The archive basename is `DSH-SEP-macOS-Alpha2-installer-preview.zip`.

`AUDIT.json` must have schema 1, status pass, the **test** `sourceCommit`, actual run/job identifiers, and the following explicit facts. The installer build, application payload build and test commits may differ; the operator preserves all three.

- `deliveryBinding.schema`: 1.
- `deliveryBinding.installer`: `buildCommit`, `archiveSha256`, `archiveBytes`, `manifestSha256`, `inventorySha256`, `treeSha256`, `assemblySha256`. The first three must match DOWNLOAD. The reviewer binds the manifest and inventory to that installer.
- `deliveryBinding.payload`: `buildCommit`, `archiveSha256`, `programSha256`, `bootstrapSha256`, `treeSha256`. The reviewer checks these against the payload actually carried by the installer and used in the native test.
- `deliveryBinding.build`: `status: "pass"`, `archiveRestored: true`, `signaturesVerified: true`, `sourceUnchanged: true`.
- `deliveryBinding.nativeResults`: `installationSha256` and `installedStartupSha256`, each the SHA-256 of the original native JSON bytes. The first is the main installation operator's `RESULT.json`, not its subordinate `INTEGRATION.json`; the second is `installed-startup/RESULT.json`. The reviewer also inspects the underlying installation assertions and closure logs before creating an installation row.
- One `evidenceRows` entry of kind `separate-test-entry-installation`, status pass, exact 6/6 definitions with zero failed/cancelled/skipped, a concrete plan hash, original scenario normal-close facts, real closed receipt/EOF/exit 0 and resource release. Later cleanup cannot substitute for the original scenario's closure. The payload must have full inventory/signature/source checks and must not have started the application or created its data before startup verification.
- One `installed-*` row, status pass, two exact cycles: real ready identities, same Profile hash bound to the installed path, new generation on restart, closed receipt bound to the same generation, resources confirmed released, and normal LaunchServices exit 0 without signal. The second cycle must explicitly state `sameAcrossRestart: true`.

Both selected rows must carry this `evidenceBinding` object:

```json
{
  "schema": 1,
  "testCommit": "<AUDIT.sourceCommit>",
  "runId": "<AUDIT.runId: integer>",
  "jobId": "<AUDIT.jobId: integer>",
  "installerArchiveSha256": "<deliveryBinding.installer.archiveSha256>",
  "installerManifestSha256": "<deliveryBinding.installer.manifestSha256>",
  "payloadProgramSha256": "<deliveryBinding.payload.programSha256>",
  "payloadBootstrapSha256": "<deliveryBinding.payload.bootstrapSha256>",
  "payloadTreeSha256": "<deliveryBinding.payload.treeSha256>",
  "resultSha256": "<the corresponding nativeResults digest>"
}
```

The placeholder strings describe the comparison; actual run/job IDs must be integers. The installation row's `resultSha256` must equal `nativeResults.installationSha256`; the installed-startup row must equal `nativeResults.installedStartupSha256`. Each row is checked against the audit identity and the exact installer and payload hashes. Missing or stale row bindings are rejected even when a new top-level `deliveryBinding` is present. No particular release number or commit is allowlisted.

The exact field names are enforced in the small `approved()` function. This is a consistency check over reviewer-produced local evidence. The operator does not independently query or authenticate GitHub, reinterpret raw native logs, or prevent a reviewer from fabricating all matching fields. The reviewer must derive both the row binding and original-result digests from the actual evidence. An old audit or old rows with only a replacement top-level binding are intentionally insufficient.

An optional `deliveryBinding.privacyReview` requires status pass, the **same installer** archive and inventory hashes, an existing review record hash and its bounded scope. Omitting it leaves privacy review `not_run`. Even with it, the output states this was a scoped review, not a comprehensive guarantee. An r74 application-only ZIP scan cannot qualify a later installer by itself.

## Four output files

The archive is copied byte-for-byte, with source identity checks and destination hash verification. All three input records (download, audit and original assembly) are checked again before writing a pass manifest. README, MANIFEST and SHA256SUMS remain outside the ZIP. No `.app` byte or signature changes.

`MANIFEST.json` retains both original-result digests and both complete row bindings under `verification`, along with the hashes of the reviewed input records.

1. `DSH-SEP-macOS-Alpha2-installer-preview.zip`
2. `README.md`
3. `MANIFEST.json`
4. `SHA256SUMS`, covering the other three files

A failed operation may preserve an incomplete fresh directory for diagnosis; it is not a completed delivery and must not be reused or overwritten by this operator. Full Mac certification remains `blocked`, matching the application build contract. Individual unexecuted checks remain `not_run`. Physical input, Intel/other macOS, private-data adoption, paid providers, notarization and automatic updating are not inferred from these fixed tests.

## Historical local verification

Set `SEP_DELIVERY_TEST_ROOT` to a fresh real D: child of the evidence root, create it, then run `node --test finalize-mac-preview.test.mjs`. Before the low-priority repair below, thirteen definitions used small non-executable synthetic archive bytes. The initial eight definitions have retained RED 0/8 and GREEN 8/8. One provenance definition exposed a missing run-ID check (8 pass, 1 fail), then those nine definitions passed.

The four row-binding regressions first produced 9 pass / 4 fail against the preserved r2 implementation, then 13 pass / 0 fail after that earlier row-binding repair. They reject actual unchanged r72 evidence rows under a new top-level binding, mismatches in every row-binding field, and missing or substituted result digests; they also verify that a valid output retains both bindings. The historical sample is read from `D:\AIData\ProjectWork\DSH\alpha2-macos-package-20261014-r1\installer-integration-native-r72\AUDIT.json` with pinned SHA-256 `6e331b71a7e77e61adfa04712956ca7f8edb04c3517dccdff626bc5b5dbc0899`. Original r2 source bytes and RED/GREEN logs are retained under `delivery-binding-r3` in the same evidence root. These tests verify the delivery gate and file handling, not native installation or GitHub authenticity.

## Low-priority review repair (2026-10-15)

The current operator additionally hashes the original `SOURCE-ASSEMBLY.json`. Its digest must match both `DOWNLOAD.assemblyResultSha256` and `AUDIT.deliveryBinding.installer.assemblySha256`. The original assembly must be a passing schema-1 record with matching source commit, archive name/hash/size, installer manifest hash and installer tree hash; its payload archive/program/bootstrap/tree values must match the audit's payload. A missing file, invalid pin or mismatch fails with `SEP_DELIVERY_ASSEMBLY` before creating an output directory. This verifies consistency of the retained original records, not GitHub provenance or the native application's behaviour.

The regression suite now has 17 definitions: the first run with the new rejection cases against the unchanged operator was 14 pass / 3 fail (missing expected rejection); the repaired operator passed 17/17. The four new definitions include 21 rejection mutations plus retained-manifest checks. Test archives are small non-executable fixtures. The already delivered r79 ZIP and its three sidecars remain unchanged; this operator repair does not retroactively rewrite their provenance. The actual retained r78/r79 assembly bindings are also checked read-only. See [test setup](TESTING.md) for output-root and environment requirements.
