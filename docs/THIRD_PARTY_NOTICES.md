本轮启动修订 `windows-alpha-20260924-startup-r2`，程序图 `0b54ac82524c0a42db44d5b8a6ebbbca1773a28c8c361839d47f9c12760f35a3`。此页原有 2026-09-21 版本号、验收数量与发布状态保留为历史；本轮结果请读 [启动修订](STARTUP_FIX.md)。更新状态没有降低固定验收标准。

# 第三方许可与署名说明

<!-- SEP_RELEASE_STATUS_START -->
分发修订 `20260921-mit-alpha` · 文档 `20260921-docs-r6` · **Windows x64 Alpha 测试发布**。SEP 已确认原创部分采用 MIT，第三方保留原许可。历史启动异常作为已接受的已知问题披露；功能证据与本轮封包验证分别见[发布说明](RELEASE_NOTES.md)和[测试摘要](TEST_ACCEPTANCE.md)。项目入口：[GitHub 仓库](https://github.com/Lance-QwQ/DSH-SEP)。
<!-- SEP_RELEASE_STATUS_END -->

[返回文档导航](DOCS_INDEX.md) · [适配与集成列表](OPEN_SOURCE_INTEGRATIONS.md) · [依赖清单](DEPENDENCIES.json) · [许可文件索引](licenses/index.json)

日期：2026-09-21。当前分发 `20260921-mit-alpha`，图 `8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52`。原实现基线为 office-r2 的 a2d3… 图，本轮只同步许可、文档和元数据；第三方原许可与旧包保留原字节。

## SEP 自有代码的许可状态

SEP 已确认原创部分采用 MIT，版权声明为 `Copyright (c) 2026 DSH SEP contributors`。允许使用、修改、复制、分发、再许可及销售，须保留版权和许可声明；MIT 不要求衍生版沿用原来的商业限制。第三方代码、素材及运行库继续适用各自许可，不能将整包重新许可为 MIT。详见 [许可说明](LICENSING.md)。

[LICENSE](LICENSE) 与逐文件范围、包字段按本轮清单同步；当前 [p0501 LICENSE](licenses/graph/p0501/LICENSE) 及相邻 [LICENSE-SCOPE.md](licenses/graph/p0501/LICENSE-SCOPE.md) 以本版哈希为准，不沿用旧许可哈希。历史许可文字和调查记录见 [office-r2 原文](history/office-r2/THIRD_PARTY_NOTICES.md)。本页后方 r3 缺失字段表是历史扫描，不能据此认定当前包仍无声明。

## 本次材料索引

历史 r1 的 ef21 图曾有 527 包、613 条许可／来源材料；本版在 office-r2 基础上重新生成许可索引，数量与当前身份以清单为准。具体材料见 [licenses/index.json](licenses/index.json)，适用范围见[许可同步记录](licenses/release/LICENSE-SYNCHRONIZATION.md)、[历史 r1 覆盖清单](licenses/release/overlay-manifest.json)及[历史 r1 图覆盖核验](licenses/release/overlay-verification.json)。这些计数不是全部运行时来源或法律合规认证；包级安装与功能验收另列。

sharp 固定来源链及主 libvips DLL 对应关系已核实；完整静态组件源码交付、第二个 C++ DLL 审计和重链接验证仍未完成。历史 r1 的 LibreOffice Kit Node API 来源曾返回 404；本版采用新写适配器和有可访问对应源码的官方 LibreOffice，旧 Kit 不再作为本版运行依赖。

## r3 来源材料范围（历史基线）

- r3 当时程序图全部 **527 个包条目**的名称、版本、依赖映射、manifest SHA-256 及许可声明。
- r3 当时收录的 **541 份图内许可／NOTICE 文件**的原字节副本；其中包括 Electron 的 Chromium 综合声明和 SEP 原有补充许可目录。
- r3 当时收录的 **4 份补充原文**：Node.js 24.19.0、pnpm 11.7.0，以及固定 SWE-ReX、SWE-bench 外部源码许可。
- lossless-claw、Mem0、PinchBench、SWE-ReX、SWE-bench 的固定提交及归档 SHA-256。

历史与当前材料中的原版权主体、年份和许可内容按各自来源保留，不把上游作者署名当作本机个人痕迹删去。副本使用相对目录，不包含开发者电脑的绝对工作路径；当前文件目录与哈希见 licenses/index.json，不将其冒充为 r3 历史索引。

r3 清单的范围是当时程序图及上述补充根项，**不是完整 SPDX／CycloneDX SBOM，不是法律审定或源代码到二进制的完整合规证明**。它未遍历外部 WSL、Python、Docker、容器镜像以及用户另装插件的依赖闭包；pnpm 的外部传递包也尚未作为独立完整清单枚举。

## 重点组件说明

| 组件 | 记录及处理 |
|---|---|
| DSH | 固定上游的 [MIT 原文](licenses/graph/p0021/LICENSE)及 DeepSeek 署名保留。SEP 宿主补丁和桌面适配与原发行版有区别，不冒充官方版本。 |
| lossless-claw | 固定提交的 [MIT 原文](licenses/graph/p0517/vendor/lossless-claw/LICENSE)保留；只复用选定模块，转译与宿主封装变化见集成列表。 |
| Mem0 | 固定仓库根的 [Apache-2.0 原文](licenses/graph/p0517/vendor/mem0/LICENSE)保留；嵌套 OSS 包声明 MIT。二者的适用边界需要在发布时针对复用文件确认，不把差异隐藏成一个确定标签。提示词和 schema 由上游源码转译／提取，未引入完整云服务。 |
| PinchBench | [MIT 原文](licenses/graph/p0517/vendor/pinchbench/LICENSE)保留。参考任务材料与 SEP 新写合成评分器分开说明，不把本地筛查成绩标成官方成绩。 |
| DSH-RAG | [MIT 与 kai232 署名](licenses/graph/p0501/licenses/DSH-RAG-MIT.txt)保留。BM25 来自固定提交的适配，不是完整上游插件。 |
| PDF.js | [Apache-2.0 原文](licenses/graph/p0512/LICENSE)与包内 notice 保留；库内字体、CMap、WASM 等材料仍按其原声明处理，不以包级标签取代文件级声明。 |
| Electron | [MIT](licenses/graph/p0520/LICENSE)与 [LICENSES.chromium.html](licenses/graph/p0520/dist/LICENSES.chromium.html)同时保留。 |
| 官方 LibreOffice 26.8.0.3 | 保留原 LICENSE.html、license.txt、NOTICE、CREDITS 与各组件声明。四份对应源码的固定链接、SHA-256 和下载证明随运行库 SOURCE-ACCESS.md / source-provenance 提供；未把它改为 SEP 许可。 |
| 自有 Office 适配器 | office-r2 新写并沿用的代码，已确认原创部分按 MIT 和 SOURCE_FILES 清单交付；不继承或冒充旧 Kit 不可访问源码。 |
| Node.js／pnpm | [Node 原文](licenses/runtime/Node-LICENSE.txt)与 [pnpm 原文](licenses/runtime/pnpm-LICENSE)保留；根许可汇总不等于已经完成两者全部独立子组件盘点。 |
| SWE-ReX／SWE-bench | 固定外部源码的 [SWE-ReX MIT](licenses/external/SWE-ReX-LICENSE.txt)和 [SWE-bench MIT](licenses/external/SWE-bench-LICENSE)保留。软件许可不替代评测仓库、数据、镜像和系统包各自的许可。 |

上游在线许可核对入口：[DSH 固定 LICENSE](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/LICENSE)、[Mem0 固定 LICENSE](https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/LICENSE)、[PinchBench 固定 LICENSE](https://github.com/pinchbench/skill/blob/819384ae830492365b8363fc26bc2602e73f216d/LICENSE)、[SWE-ReX 固定 LICENSE.txt](https://github.com/SWE-agent/SWE-ReX/blob/5c995c365dfb1fd5bc56fda688be5d8538f9931f/LICENSE.txt)、[SWE-bench 固定 LICENSE](https://github.com/SWE-bench/SWE-bench/blob/02e7a74ffd0b707aab73d203fe87bdc7c76afc8e/LICENSE)。本地固定原文是随文档交付的核查入口，在线更新不自动替换它。

## r3 识别的材料缺口（按本次覆盖记录复核）

r3 当时的以下 **7 个本地模块没有 package.json license 声明**；未声明不是无版权，也不能擅自推定为 MIT。当前处理见[许可同步记录](licenses/release/LICENSE-SYNCHRONIZATION.md)，以下列表保留历史状态：

- @deepseek-ai/dsh-recovery（p0500）
- dsh-system-enhancement-package（p0501）
- @deepseek-ai/dsh-sep-session-migration（p0513）
- dsh-sep-context-preparation（p0516）
- dsh-sep-plugin-group（p0517）
- dsh-sep-trusted-evaluation-entry（p0518）
- dsh-tool-worker（p0519）

r3 当时以下 **26 个包没有被扫描规则识别到本包目录内的独立许可文件**。当时的规则只匹配 LICENSE／LICENCE／LICENSES／COPYING／NOTICE 文件名及原 SEP licenses 目录；可能存在其他文件名、父包声明或嵌入式文本。因此当时此表表示“需要核对”，不直接判定为“无许可”或“不能分发”。已保留并按本版许可同步的声明或材料及其证明边界见[许可同步记录](licenses/release/LICENSE-SYNCHRONIZATION.md)；下表保留 r3 的历史扫描结果。

| 图条目 | 包名 | r3 当时 manifest 声明 |
|---|---|---|
| p0108 | @koromix/koffi-win32-x64 | MIT |
| p0118 | @earendil-works/pi-ai | MIT |
| p0123 | standardwebhooks | MIT |
| p0146 | @aws-sdk/credential-provider-http | Apache-2.0 |
| p0150 | @aws-sdk/credential-provider-login | Apache-2.0 |
| p0151 | @aws-sdk/nested-clients | Apache-2.0 |
| p0163 | @earendil-works/pi-telemetry | MIT |
| p0176 | data-uri-to-buffer | MIT |
| p0360 | @xterm/headless | MIT |
| p0373 | @xterm/addon-serialize | MIT |
| p0441 | fontkit | MIT |
| p0443 | brotli | MIT |
| p0445 | dfa | MIT |
| p0452 | saxes | ISC |
| p0485 | @deepseek-ai/dsh-desktop | MIT |
| p0493 | lazy-val | MIT |
| p0498 | @deepseek-ai/dsh-desktop-host | MIT |
| p0500 | @deepseek-ai/dsh-recovery | 未声明 |
| p0503 | @napi-rs/canvas-win32-x64-msvc | MIT |
| p0505 | @nodable/entities | MIT |
| p0514 | @deepseek-ai/dsh-task-checkpoint | MIT |
| p0515 | dsh-sep-brand | MIT |
| p0516 | dsh-sep-context-preparation | 未声明 |
| p0518 | dsh-sep-trusted-evaluation-entry | 未声明 |
| p0519 | dsh-tool-worker | 未声明 |
| p0521 | @electron-internal/extract-zip | BSD-2-Clause |

两个既有补充材料仍保留，并明确其证明范围：

- @nodable/entities 3.0.0 的发布包缺少 LICENSE，补充自声明仓库 nodable/val-parsers 的 d2070d76a8ba07e6c7fa142caeb51ffd756e47eb 提交。补充原文 SHA-256 为 750cb3fb6362804957ef52caaf9b5c824015be44d494637330d7cd8834d31d40；这不证明发布二进制与该源码逐字对应。
- @napi-rs/canvas-win32-x64-msvc 1.0.8 的补充原文取自同版本父包。SHA-256 为 8802fecf9da4367bc23bcf20b21cc143785fc6c92b152f3fa7fbe6ce08d344d6；未完成 Skia 及所有原生内嵌组件审计。

本次针对 `20260921-mit-alpha` Only／Full 的许可同步与材料核对，范围以许可覆盖记录为准，保留适用的源文件变更说明、署名、NOTICE 及二进制附带声明。本次不虚构已通过的合规结论，也不修改历史安装包来掩盖缺口。

<!-- SEP_RELEASE_LICENSE_START -->
## 本版许可与对应来源

已确认 SEP 原创部分采用 MIT，第三方保留原权利。Office 适配器源码与测试随本版源码快照交付；官方 LibreOffice 运行库保持原 LICENSE.html、license.txt、NOTICE、组件署名和来源材料，不能由包级 MIT 标签推导其全部内嵌组件同许可。

四份匹配的官方 core／dictionaries／help／translations 源码归档已在 office-r2 准备中下载并核验，固定入口与身份记录随包保留。旧 Kit 已替换，原 404 不再是当前运行依赖的源码入口；历史记录仍在。

本版数量和许可映射以 DEPENDENCIES.json、licenses/index.json 与新图为准。sharp/libvips 及原生运行时的未全面核验边界继续保留；本次 MIT 变更不构成全依赖法律合规认证。
<!-- SEP_RELEASE_LICENSE_END -->
