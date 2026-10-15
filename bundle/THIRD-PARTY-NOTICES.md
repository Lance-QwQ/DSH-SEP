# Prebuilt runtime dependencies and source attribution

This local preparation candidate retains the SEP, DeepSeek, and vendored upstream notices alongside each component. The DeepSeek MIT text is also at `licenses/DSH-MIT.txt`; the bundle root LICENSE covers SEP-authored changes. The task-checkpoint component's missing published notices have been supplemented without changing its executable code.

Pinned runtime dependencies: @napi-rs/canvas 1.0.8 (MIT), @sinclair/typebox 0.34.41 (MIT), fast-xml-parser 5.11.1 (MIT), fflate 0.8.3 (MIT), pdfjs-dist 6.2.108 (Apache-2.0), and zod 4.4.3 (MIT). Their original dependency packages and notices are installed by the package manager; parser-related notices already preserved in system-enhancement-package/licenses are retained. Transitive packages retain their own licenses.

lossless-claw, Mem0 prompts/schema, PinchBench reference tasks and SWE-related adapters retain their existing component-level attribution and stated scope. Four upstream OpenClaw engine/plugin/CLI entry files and their CLI helper sources are references only: they require missing upstream metadata and/or OpenClaw SDK, are not exported by the bundle, and are not imported by active DSH modules. They are not certified runtime entry points. No OpenClaw registration is performed.

The build tools' es-module-lexer 1.7.0 is MIT and is a development-only parser; it is not required on a user's installed bundle. Host-shared DSH services, React and Cordis are peer requirements rather than separately packaged host copies. Host compatibility remains unverified at this stage.

The owned Session provider adds a derivative of the official @deepseek-ai/dsh-session-persistence-jsonl 0.2.1-alpha.1 published index and Worker. DeepSeek's MIT license is retained in host/session-jsonl/LICENSE. host/session-jsonl/origin.json binds the exact upstream bytes, three ESM import substitutions and one Worker attribution-version reference. The Worker bundles first-party DeepSeek code from the same MIT project. Other host services remain shared peers; this does not package or overwrite the complete DSH host. Its native addon and Koffi remain explicit host peers rather than vendored binaries.

`host/protected-files/` reuses the graph-bound SEP Beta.2 protected derivative of @deepseek-ai/dsh-fs-local 0.2.0-rc.2 without changing its bytes. It is not the official alpha.1 default provider. Its original MIT license and source graph/hash are preserved in LICENSE and origin.json; the owned wrapper is separate.
