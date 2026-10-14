# Local r74 download verification

`verify-application-distribution.py` verifies downloaded GitHub artifact ZIPs and reconstructs the inner application archive. It does not download, extract, sign, install, or execute an application. Its success cannot supersede a failed or blocked native UI test.

The CLI output is fixed to the real directory:

`D:\AIData\ProjectWork\DSH\alpha2-macos-package-20261014-r1\application-r74-distribution\verified-package`

Keep the three original download ZIPs under the parent distribution directory. Supply one local JSON file in that parent, with these fields:

- `schema`: `1`
- `repository`: `Lance-QwQ/DSH-SEP`
- `runId`: the actual r74 Actions run ID
- `sourceCommit`: the actual 40-character commit SHA
- `artifactPrefix`: `project-application-r74`
- `artifacts`: exactly three rows in order, with `role` equal to `evidence`, `part-one`, then `part-two`; `file` is the relative path to that original downloaded `artifact.zip`; `metadata` is its actual GitHub artifact API record.

Required metadata fields are `id`, `name`, `size_in_bytes`, `digest` (`sha256:` plus 64 lowercase hex digits), `expired: false`, and `workflow_run.id/head_sha`. All three must belong to the specified run and commit. Unknown digest or run metadata must remain unknown: do not derive an expected digest from the untrusted download itself. The tool checks the supplied metadata; it does not independently query GitHub or authenticate the provenance of the local JSON file.

Example command after actual metadata has been saved:

```powershell
python .\tools\alpha2-macos\package\verify-application-distribution.py `
  'D:\AIData\ProjectWork\DSH\alpha2-macos-package-20261014-r1\application-r74-distribution\DOWNLOAD-PINS.json'
```

No extracted `contents` directory is trusted. The verifier reads `project-build/RESULT.json` from the verified evidence ZIP and `transport-manifest.json` from the verified first-part ZIP, then streams both part entries directly from their verified outer ZIPs. It checks the manifest's binding to the original assembly bytes, exact two-part naming and order, individual byte counts/hashes, and final archive byte count/hash. Reads use a 1 MiB buffer. A final disk readback verifies the written archive hash.

Output is fresh-only. The tool leaves any failed partial output unverified and never replaces an existing `verified-package`. It publishes `DOWNLOAD-VERIFIED.json` only after all checks pass; original assembly/manifest bytes are retained next to it. No success receipt is written on failure. Existing outputs require a separate operator decision, not automatic removal.

File identity checks compare device/inode/size/mtime/birth identity across path and handle and retain each API's complete before/after time fingerprint. This avoids the independently observed Windows Python `lstat`/`fstat` ctime representation difference without dropping either API's change check. These local checks do not establish a hostile-same-user isolation boundary.

## Verification evidence

Nine fixed synthetic ZIP definitions are in `verify-application-distribution.test.py`. They cover exact reconstruction, outer-hash mismatch, cross-run artifact rejection, missing digest rejection, assembly/manifest mismatch, part path escape, modified part bytes, whole-archive mismatch, and no overwrite.

Logs are retained under the D: distribution directory's `operator-tests`: initial implementation absent (`red-r2.log`, 8 assertion failures and 1 expected missing-implementation error), first implementation failure (`green.log`, Windows stat representation), final `green-r2.log` (9/9). The finalized nine definitions were unchanged during implementation. These are local transport tests, not macOS tests.
