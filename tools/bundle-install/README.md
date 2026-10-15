# Controlled prebuilt module preparation

Development-only tool; none of these commands run automatically during a user installation.

Use the recorded Node 24 runtime and pnpm 11.7.0. Install this tool manifest with a D: cache/store and `--ignore-scripts --frozen-lockfile`; es-module-lexer 1.7.0 is the only tooling dependency. Test/build installations and every generated output must use a real directory under D:/AIData/ProjectWork/DSH.

Run `node build-modules.mjs <absolute-program-root> <new-absolute-output-root> <root-package-json>`. The program graph is pinned to the published Beta.2 SHA-256 in the script. The output parent must exist and be canonical; an existing output is rejected. The repository containing root-package-json supplies the two pinned MIT license texts. No live deployment, user state, installed host or project data is read or written by the builder.

It verifies selected source bytes before creating output, preserves module layout, rewrites only private SEP ESM imports through actual package export targets, and records every input/output hash. Nonliteral dynamic imports and frontend factory requirements remain explicit admission/host adaptation obligations. A partial output caused by an I/O failure is a failed staging artifact; do not install it. The script never resumes or merges an existing output.

Tests consume explicit environment variables: SEP_BUNDLE_REPO, SEP_BUNDLE_TEST_ROOT, SEP_BUNDLE_SOURCE_PROGRAM, SEP_TEST_PYTHON, SEP_OFFICIAL_HARNESS and SEP_TEST_PNPM as applicable. The module/runtime tests can point SEP_BUNDLE_REPO at an unpacked or installed tarball. Builder fixtures copy only graph-listed regular files, never package node_modules links. The runtime fixture resolves pnpm's package link to its canonical location before createRequire, matching normal loaded modules.

Runtime checks do not activate a production Agent, use paid models, invoke Windows MCP, or launch the trusted evaluation backend. Their results cannot certify host compatibility. Source changes and packed evidence are bound separately in the stage verification record.


Stage three additionally strips the three known CSS-region build-path comments in the pinned ui-settings-memory client asset. Every non-comment byte and line position is retained. The inventory records this separately from import rewrites; never describe all transformed files as byte-identical to the source graph.

Run configuration.test.mjs together with modules.test.mjs and runtime.test.mjs against the independently installed tarball, using its canonical package root for SEP_BUNDLE_REPO. Its public exports must resolve without a source checkout. Run builder.test.mjs and entry.test.mjs against the source candidate with the pinned license inputs and separately installed official harness. The configured real Loader test uses file URLs on Windows, not raw drive paths as ESM specifiers.

Portable configuration is intent only: it does not initialize a ledger, migrate data, apply human settings, or enable business. Ledger review accepts supplied bytes, reuses the shipped budget parser/accounting and omits record identifiers/content from receipts. Native settings UI and real data/provider bindings remain host-stage requirements.


Stage four uses a separate official alpha.1 npm harness with the full official peer closure and Cordis 4.0.5-alpha.1. host-contract.test.mjs exercises published services and the packed SEP modules; it does not launch a production Agent, external model or GUI. Its task restore refusal and recovery absence cases pass by confirming real blockers, not by claiming those features work. The synthetic LLM provider uses no API key. The direct Connection route fixture does not exercise BrowserAuth or network authentication.

session-v4.test.mjs exercises the independently installed bundle's explicit pure V4 review export. A successful review is not persistence, live restoration, historical migration or authority rebinding. Preserve the original red log, fixture corrections and all prior stage evidence. Full stage four remains blocked until the protected filesystem/recovery composition, live Session catalog/persistence binding, lifecycle/compaction swap and frontend activation are verified.

Session live tests exercise a separately installed bundle.5 and actual official writer handles. Their fresh-process helper is test-only, not an application launcher. Supply SEP_SOURCE_REPO for the transitive import-review negative cases. The import reviewer walks packaged relative dependencies and CJS Worker references; the source-only Worker.ts branch is allowed only under the pinned compiled-JS guard. This is static closure evidence, not complete host activation certification. New artifacts use unique file locators to avoid same-path package-cache reuse.

File protection tests use actual owned controller leases, native Windows file/directory handles, real preimage files and a fresh Node child. Files and failure fixtures are synthetic and retained on D:. The five-field version observation is a separate native characterization, not an acceptance count or a claimed fix. Complete filesystem and Profile integration remain blocked.
