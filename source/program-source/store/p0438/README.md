# DSH SEP Office converter

`@dsh-sep/office-converter` is original DSH SEP source for the Windows Office-to-PDF conversion boundary. It replaces the former Node API package; it does not incorporate that package's implementation. The default engine is the separately licensed, official LibreOffice runtime supplied by `@dsh-sep/libreoffice-runtime@26.8.0-3.sep.1`.

```js
import { createConverter } from '@dsh-sep/office-converter';
const converter = await createConverter({ timeoutMs: 60000 });
try {
  const result = await converter.render({ inputPath: absoluteOfficeFile, outputPath: freshPdfPath }, abortSignal);
  // result.fontDiagnostics === 'unavailable': [] is NOT a claim that no fonts are missing.
} finally {
  await converter.dispose();
}
```

## Contract

- Windows 10/11 x64 with Windows PowerShell 5.1 / .NET Framework `Add-Type` available. Node.js 22 or later. Locked-down execution policy or disabled C# compilation can make this adapter unavailable; it does not bypass application-control rules.
- Six input suffixes: `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`. Input must be a unique regular file. Directory junctions, symbolic links, and hard-linked input are rejected. Both paths must be absolute; output must be a fresh `.pdf`. Caller owns the parent directories and must prevent concurrent path changes.
- Calls on one converter are serialized. A private profile and private staging directory are created for each conversion. Separate converters can run concurrently. The upper DSH provider continues to own authorization, queue/admission limits, cache and provider generation.
- The engine-facing profile and scratch-directory path have a **128-character conservative adapter support bound**. This is not a claimed universal LibreOffice limit. Longer caller-owned paths use a Windows 8.3 short alias only after matching volume/file identity to the original directory. No data is moved elsewhere and no drive letter is mapped. If 8.3 aliases are disabled, unavailable, identity cannot be verified, or the alias is still too long, conversion fails as `unavailable` before launching LibreOffice and diagnostics identify `PROFILE_PATH_UNSUPPORTED` / `PROFILE_PATH_TOO_LONG` (or `TEMP_PATH_*`); use a shorter writable `workRoot`. Source and output paths are not assigned this profile-specific bound.
- Deadline starts when the queued call begins, including staging, archive checks, process startup and PDF publication. Abort while queued rejects promptly; active abort/dispose waits for child shutdown. A cancelled request is not reported as a completed PDF conversion.
- Windows Job Object assignment is atomic at `CreateProcess` through `PROC_THREAD_ATTRIBUTE_JOB_LIST`. The Job closes on bridge termination; descendants cannot survive by merely outliving the initial `soffice.com`. An stdin ownership lease connects Node and the bridge so loss of the Node host revokes its Job. No global process-name or process-group kill is used.
- Output is exclusively created only after the private generated PDF passes size/header/trailer checks; it is complete after successful return. Output copying is **not an atomic rename transaction**. On failure the created output is removed after verifying its identity; an observed replacement is retained and reported as incomplete cleanup. Caller directory exclusion remains required to prevent check/delete races.
- Temporary profile/input/output are deleted after normal completion, cancellation, timeout and normal disposal. A hard crash of the Node owner ends its Job but can leave the private job directory on disk; no unsupported promise of crash-time file deletion is made. These directories contain document copies and require the upper deployment's abandoned-temp retention/deletion policy. `cleanupIncomplete` means resource/file cleanup could not be confirmed; diagnostics and the directory are retained for controlled recovery.
- Child stdout and stderr are consumed continuously, with at most 32 KiB retained for each. `PYTHONDONTWRITEBYTECODE=1` prevents LibreOffice Python extensions from writing `.pyc` caches into the bundled runtime.
- Both bridge compilation and engine scratch `TEMP`/`TMP` belong to the current job's private `tmp` directory. LibreOffice's own crash dump writer is disabled with its documented bootstrap variable `-env:CrashDumpEnable=false`, and inherited `CRASH_DUMP_ENABLE` is cleared so it cannot force dumps back on. Failure still rejects the conversion; disabling dumps is not a crash fix. OS-level crash collection independently configured by the user is outside this setting.

## Limits and compatibility differences

Defaults: deadline 120000 ms; input 64 MiB; PDF 128 MiB; image export 144 DPI; ZIP 20000 entries; uncompressed ZIP content 512 MiB. DSH's provider can impose smaller configured values.

OOXML preflight validates the ZIP central/local records, boundaries, entry count, actual expanded lengths and CRCs without extracting paths. Unsafe/duplicate names, linked/encrypted entries, split/ZIP64 archives and embedded VBA projects are rejected. Relationship XML is parsed with `saxes`, with DTDs/custom entity definitions, duplicate attributes, invalid XML and unsupported encodings rejected. Standard XML character references remain supported. It accepts UTF-8 or BOM-marked UTF-16, at most 4 MiB per relationship part. Standard external hyperlink relationships with `http`, `https` or `mailto` URIs are preserved; credentials, unsafe protocols and other external resource relationships (images, templates, OLE links, etc.) are rejected. The six suffixes do not imply every historical Office format variation is supported.

Macros are disabled in each private LibreOffice profile. Link update settings use **Writer `2` (never)** and **Calc `1` (never)**, verified against LibreOffice 26.8.0.3's configuration schemas. These settings and archive checks are application controls, **not an OS network/filesystem sandbox or a proof of immunity to native decoder vulnerabilities**. Binary Office documents receive signature/size checks and the same engine settings, but do not receive OOXML relationship inspection.

Font loading is managed by Windows and LibreOffice. The API returns `missingFonts: []` with `fontDiagnostics: 'unavailable'`; the empty list is a compatibility container, not a verified no-missing-font result. Custom `fontDirectories`, `fontFallbacks` and `initialFontFamilies` are rejected. Legacy `maxFontFiles=20000`, `maxFontFileBytes=268435456`, `maxLoadedFontBytes=536870912` default values are accepted for existing DSH call compatibility, but those per-font loading caps are **not enforced by the CLI engine**. Nondefault values are rejected instead of silently ignored. There is no WASM fallback.

The optional `executablePath` selects an explicit trusted local LibreOffice executable; default resolution is package-local and never searches PATH. `workRoot` must be an existing, caller-owned directory. These are local configuration, not document-provided values. Other undocumented option names are rejected.

## Source and tests

All adapter implementation is provided in readable source: `index.js`, `archive.js`, `native-process.js`, `owned-files.js`, `errors.js`, `bridge.ps1`, `JobBridge.cs`. C# is compiled in the bridge process from the shipped source. No compiled replacement Node API with unavailable source is required.

Run `node --test test/*.test.mjs`. Real converter tests use `SEP_OFFICE_EXE` when set; the development fallback path is `../../engine/runtime/program/soffice.com` relative to the test folder. Process-boundary tests run a harmless Node fixture under the actual Windows bridge and Job Object; actual LibreOffice document rendering has separate coverage. No model/API calls are involved.

This original adapter uses the accompanying DSH SEP restricted commercial distribution license. LibreOffice, MSVC runtime and other separately supplied components retain their own licenses and source/distribution notices; this license does not replace them.

Windows Job API reference: https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute
