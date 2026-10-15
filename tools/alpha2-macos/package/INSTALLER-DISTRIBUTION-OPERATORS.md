# r78 installer local transport and bounded inspection

Prepared operators only. No r78 artifact bytes, API values, hashes, native execution or pass receipt are supplied by this document. The existing r74 verifier/scanner remain unchanged.

`prepare-installer-distribution-operators.py` binds the three original source hashes, records every exact replacement in `INSTALLER-DISTRIBUTION-ORIGINS.json`, and produces these independent local operators:

- `verify-installer-distribution.py`: verify downloaded outer ZIPs and reconstruct their exact installer ZIP; no extraction, installation, signing or code execution.
- `verify-installer-distribution.test.py`: the original nine real small-ZIP definitions, with only installer names and ZIP layout adapted. The explicit missing implementation produced nine errors; the derived implementation passes all nine. This is local transport evidence, not a native Mac test.
- `scan-installer-distribution.py`: inspect all names and bounded UTF-8 text in the reconstructed installer. It accepts the archive identity only from the new verified download record, then checks the full ZIP hash before and after inspection. The old r74 scan is not copied as a result.

## Actual metadata input

Create a JSON record in `D:\AIData\ProjectWork\DSH\alpha2-macos-package-20261014-r1\installer-r78-distribution` only after actual GitHub artifact API metadata is available. Its schema is the original transport verifier schema:

- `schema`: 1; `repository`: `Lance-QwQ/DSH-SEP`.
- `runId` and `sourceCommit`: the actual successful r78 build run and its 40-hex commit.
- `artifactPrefix`: the fixed string `installer-application`.
- `artifacts`: exactly three ordered entries with roles `evidence`, `part-one`, `part-two`. Each entry has `file` (safe path relative to this distribution directory) and `metadata` (actual API record, including positive `id`, `size_in_bytes`, `digest`, `expired:false`, and `workflow_run.id/head_sha`).
- Their exact names are `installer-application-evidence-r78`, `installer-application-part1-r78`, `installer-application-part2-r78`.

The three original outer artifact ZIPs must already be downloaded into those relative locations. Do not replace API digests with hashes calculated from an untrusted download. Downloading and reconstructing are separate actions; this operator does not fetch credentials or contact GitHub.

Run with the existing Python runtime:

```
python verify-installer-distribution.py <absolute-actual-metadata-json>
```

The only CLI destination is the fresh `installer-r78-distribution/verified-package`. It reads `_temp/installer-application/RESULT.json` and `_temp/installer-transport/transport-manifest.json` directly from the verified evidence ZIP, preserving original bytes. These paths match the prepared r78 workflow; if the actual ZIP layout differs, verification fails instead of searching for a convenient alternate record. The manifest must bind the exact build receipt, two exact parts and resulting `DSH-SEP-macOS-Alpha2-installer-preview.zip`. The receipt is written only after all outer/part/whole hashes and disk readback agree. A Windows download check does not repeat native signature or installation tests.

## Independent bounded inspection

After verified reconstruction, run:

```
python scan-installer-distribution.py
```

This reads the fixed `verified-package/DOWNLOAD-VERIFIED.json`, requiring its pass status, exact installer path, known commit/ZIP hash/size and unchanged record bytes. It writes only a fresh `installer-r78-distribution/privacy-scan-r1/RESULT.json`. It never creates an inventory or native installer pass by inference.

Coverage limits remain 512 KiB per text entry and 128 MiB total; all ZIP names are considered. Binary/ASAR, oversized, non-UTF8, symlink and budget-excluded content is reported. Pattern candidates expose only entry path, file hash and counts, not matched credential text. Human contextual classification is a separate audit. `comprehensivePrivacyAudit:false` and `noPrivateDataClaim:false` remain explicit even if no pattern is found. This is not a new permanent release gate.

No actual metadata record or success output exists at preparation time. An interrupted or failed reconstruction may leave a fresh unverified directory; neither operator overwrites or deletes prior results.

## Reproducing synthetic transport tests

Both Python test files require an existing absolute `SEP_DISTRIBUTION_TEST_ROOT`; it is their fixture directory, not the fixed production download directory. Use `python -B` to avoid source-tree bytecode caches. Complete commands and the preserved-output policy are in [TESTING.md](TESTING.md). These tests need no token, network connection or macOS host and do not run the production CLI.
