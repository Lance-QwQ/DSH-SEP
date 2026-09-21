# DSH SEP Office-to-PDF provider adaptation

Distribution: 20260921-office-r2; Windows x64.

This MIT-licensed DSH provider retains its existing authorization, deferred bounded reads, source-version checks, queue, cancellation sharing and PDF cache. The converter import now uses the separately sourced @dsh-sep/office-converter package and official LibreOffice runtime. It no longer uses @deepseek-ai/libreoffice-kit or its native package.

The createConverter/render/dispose contract remains. Results and remote schemas carry optional fontDiagnostics: 'unavailable'. This backend does not inspect the actual fonts used by LibreOffice; missingFonts: [] must not be read as proof that all fonts exist. The preview UI shows the corresponding notice.

System-installed fonts are used. Custom fontDirectories/fontFallbacks and nondefault maxFontFiles/maxFontFileBytes/maxLoadedFontBytes are not supported by the CLI backend and are rejected. Legacy default font-limit settings remain accepted for old profile compatibility, but do not enforce font-load limits in the external process. Input/output/archive size, queue and conversion timeout limits remain separately enforced.

This package's original MIT terms are preserved. The adapter and the official runtime have separate licenses and source-access records. See docs/OFFICE_CONVERTER.md in the distribution for limitations and tests. Upstream documentation below is available in the previous immutable release; it must not be used to infer native/WASM auto-fallback or custom-font capabilities in this Windows candidate.
