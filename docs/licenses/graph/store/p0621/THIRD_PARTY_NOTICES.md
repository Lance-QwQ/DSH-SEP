# Third-party notices

Supplemental notices: @nodable/entities 3.0.0 omitted its LICENSE file in the published package; licenses/nodable-entities-3.0.0-UPSTREAM-LICENSE is from its declared repository with its retained supplemental license text in licenses/; the old research/supplemental-notices.json locator is not part of this standalone snapshot. The platform canvas package also omitted a license file; licenses/napi-rs-canvas-win32-x64-msvc-1.0.8-UPSTREAM-LICENSE comes from the same-release parent package. These supplements do not establish an exact source-to-binary correspondence or audit Skia's bundled components. This package is included in the DSH SEP Windows Beta distribution. SEP-original code is MIT within LICENSE-SCOPE; third-party components retain their own licenses. Preserved and supplemental notices are not a complete source-to-binary audit or legal-compliance certification.

BM25 is adapted from imkelt/DSH-RAG commit fa211a4913b6ab465e30d09aad0a29cea134a817, Copyright (c) 2026 kai232, MIT. Type-only declarations and the host-specific wrapper were removed. See licenses/DSH-RAG-MIT.txt.

The historical package used external rc.5 host peers. This release targets DSH 0.2.0-rc.2 and supplies the modified host source together with SEP; the Full distribution includes its matched host and the SEP-only distribution supplies necessary supported-host adapters. Existing DeepSeek MIT and third-party notices retain their terms. See the standalone release source notes at ../../../docs/sep-release-source.md.

The following runtime dependency versions are fixed by pnpm-lock.yaml. No third-party lifecycle scripts were executed. The Windows x64 canvas binary is a published prebuilt native dependency; it is not locally rebuilt. Package-level license declarations do not constitute a binary source audit. Preserve each dependency's own notices when redistributing its files.

| Package | Version | Declared license | Copied notices |
|---|---|---|---|
| @napi-rs/canvas | 1.0.8 | MIT | licenses/napi-rs-canvas-1.0.8-LICENSE |
| @napi-rs/canvas-win32-x64-msvc | 1.0.8 | MIT |  |
| @nodable/entities | 3.0.0 | MIT |  |
| anynum | 1.0.1 | MIT | licenses/anynum-1.0.1-LICENSE |
| fast-xml-builder | 1.3.1 | MIT | licenses/fast-xml-builder-1.3.1-LICENSE |
| fast-xml-parser | 5.11.1 | MIT | licenses/fast-xml-parser-5.11.1-LICENSE |
| fflate | 0.8.3 | MIT | licenses/fflate-0.8.3-LICENSE |
| is-unsafe | 2.0.2 | MIT | licenses/is-unsafe-2.0.2-LICENSE |
| path-expression-matcher | 1.6.2 | MIT | licenses/path-expression-matcher-1.6.2-LICENSE |
| pdfjs-dist | 6.2.108 | Apache-2.0 | licenses/pdfjs-dist-6.2.108-LICENSE |
| strnum | 2.4.2 | MIT | licenses/strnum-2.4.2-LICENSE |
| xml-naming | 0.3.0 | MIT | licenses/xml-naming-0.3.0-LICENSE |
| zod | 4.4.3 | MIT | licenses/zod-4.4.3-LICENSE |
