# 第三方许可与署名说明

<!-- SEP_RELEASE_STATUS_START -->
分发修订 `20260921-r1` · 文档 `20260921-docs-r4` · **候选验收未全部通过，暂不可公开发布**。GitHub 仓库尚未创建；具体下载与反馈地址未绑定。最终程序图及验证见[发布说明](RELEASE_NOTES.md)。
<!-- SEP_RELEASE_STATUS_END -->

[返回文档导航](DOCS_INDEX.md) · [适配与集成列表](OPEN_SOURCE_INTEGRATIONS.md) · [依赖清单](DEPENDENCIES.json) · [许可文件索引](licenses/index.json)

日期：2026-09-21。本说明适用于 sep-alpha2-stability-20260921 的文档基线；程序图 SHA-256 为 ffb961a17b4202ec753e70bc5fd0e4de0ccf697df4155ee4c369d9e48be56f6c。本次 `20260921-r1` 新候选基于该能力来源另行生成，按文件权属同步许可；新分发图以清单为准。第三方原许可、已部署来源图和历史安装包不改写。

## SEP 自有代码的许可状态

[LICENSE](LICENSE) 已采用项目所有者确认的“DSH SEP 限制商业分发许可 1.0”，SHA-256 为 cd9cc9395194fafd280dbdfcc510c193dc3d2784a85260540eb8b56d4e27b90a。允许个人及企业内部使用、修改、免费转发和制作衍生版；出售或商业分发须另行授权，衍生版沿用相同商业限制。说明见 [LICENSING.md](LICENSING.md)。这不是 MIT、Apache-2.0 或 OSI 认可的开源许可。

工作区核心源码 LICENSE 与包许可指向已同步。r3 文档记录的是来源程序图 ffb 的历史 p0501 许可，历史 SHA-256 为 `14c05fccab671a43614626f8c370444db17e8de5ea243bb68101134d0b9d02c9`；这一历史哈希不指向本次重建后的同名文件。当前 [p0501 LICENSE](licenses/graph/p0501/LICENSE) SHA-256 为 `cd9cc9395194fafd280dbdfcc510c193dc3d2784a85260540eb8b56d4e27b90a`，适用范围以相邻 [LICENSE-SCOPE.md](licenses/graph/p0501/LICENSE-SCOPE.md) 为准。历史 r3 材料和旧安装包保留原字节；本次清单绑定 ef21 分发图。

第三方代码继续适用各自原许可，不追溯撤销接收者已经依有效许可取得的权利。r3 当时存在许可字段未声明或需厘清适用范围的模块；本次按文件权属完成映射，不收紧已有效授予的 MIT 权利，不替换第三方许可。当前状态以新版 LICENSE-SCOPE 及[许可同步记录](licenses/release/LICENSE-SYNCHRONIZATION.md)为准。

## 本次材料索引

本次 ef21 图共 527 包；重建索引为 613 条许可／来源材料，缺失 package.json license 声明为 0。具体材料见 [licenses/index.json](licenses/index.json)，适用范围见[许可同步记录](licenses/release/LICENSE-SYNCHRONIZATION.md)、[覆盖清单](licenses/release/overlay-manifest.json)及[图覆盖核验](licenses/release/overlay-verification.json)。这些计数不是全部运行时来源或法律合规认证；包级安装与功能验收另列。

sharp 固定来源链及主 libvips DLL 对应关系已核实；完整静态组件源码交付、第二个 C++ DLL 审计和重链接验证仍未完成。明确的公开上传阻断项是 LibreOffice Kit Node API 首选源码未取得，记录的来源访问返回 404；LibreOffice core 来源不能替代该 Node API 来源。

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
| Node.js／pnpm | [Node 原文](licenses/runtime/Node-LICENSE.txt)与 [pnpm 原文](licenses/runtime/pnpm-LICENSE)保留；根许可汇总不等于已经完成两者全部独立子组件盘点。 |
| SWE-ReX／SWE-bench | 固定外部源码的 [SWE-ReX MIT](licenses/external/SWE-ReX-LICENSE.txt)和 [SWE-bench MIT](licenses/external/SWE-bench-LICENSE)保留。软件许可不替代评测仓库、数据、镜像和系统包各自的许可。 |

上游在线许可核对入口：[DSH 固定 LICENSE](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/LICENSE)、[Mem0 固定 LICENSE](https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/LICENSE)、[PinchBench 固定 LICENSE](https://github.com/pinchbench/skill/blob/819384ae830492365b8363fc26bc2602e73f216d/LICENSE)、[SWE-ReX 固定 LICENSE.txt](https://github.com/SWE-agent/SWE-ReX/blob/5c995c365dfb1fd5bc56fda688be5d8538f9931f/LICENSE.txt)、[SWE-bench 固定 LICENSE](https://github.com/SWE-bench/SWE-bench/blob/02e7a74ffd0b707aab73d203fe87bdc7c76afc8e/LICENSE)。本地固定原文是随文档交付的核查入口，在线更新不自动替换它。

## r3 识别的材料缺口（按本次覆盖记录复核）

r3 当时的以下 **7 个本地模块没有 package.json license 声明**；未声明不是无版权，也不能擅自推定为 MIT。本次对应处理见[许可同步记录](licenses/release/LICENSE-SYNCHRONIZATION.md)，以下列表保留历史状态：

- @deepseek-ai/dsh-recovery（p0500）
- dsh-system-enhancement-package（p0501）
- @deepseek-ai/dsh-sep-session-migration（p0513）
- dsh-sep-context-preparation（p0516）
- dsh-sep-plugin-group（p0517）
- dsh-sep-trusted-evaluation-entry（p0518）
- dsh-tool-worker（p0519）

r3 当时以下 **26 个包没有被扫描规则识别到本包目录内的独立许可文件**。当时的规则只匹配 LICENSE／LICENCE／LICENSES／COPYING／NOTICE 文件名及原 SEP licenses 目录；可能存在其他文件名、父包声明或嵌入式文本。因此当时此表表示“需要核对”，不直接判定为“无许可”或“不能分发”。本次逐项提供的声明或材料及其证明边界见[许可同步记录](licenses/release/LICENSE-SYNCHRONIZATION.md)；下表保留 r3 的历史扫描结果。

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

本次针对 `20260921-r1` Only／Full 候选完成的许可同步与材料核对，范围以许可覆盖记录为准，保留适用的源文件变更说明、署名、NOTICE 及二进制附带声明。本次不虚构已通过的合规结论，也不修改历史安装包来掩盖缺口。

<!-- SEP_RELEASE_LICENSE_START -->
## 本次许可同步状态

状态：已按列明范围核对。95 个程序许可/来源文件及 2 个 Office 支持文件已合并，527 包均有明确声明，613 份许可/来源索引项。原 MIT 与其他第三方权利保留；通用补充条款与上游原许可分别标识。详见 licenses/release/LICENSE-SYNCHRONIZATION.md。

保留事项：

- 公开上传阻塞：LibreOffice Kit Node API 首选源码固定仓库/提交返回 404；打包 JS、原生 helper 或 LibreOffice core 来源不能替代该源码。
- sharp/libvips 主 DLL 对应固定来源已验证；完整内嵌库源码交付、重链接与所有二进制可重复构建没有全部验证。
- GitHub 仓库尚未创建；本地完成不表示已经公开发布。
<!-- SEP_RELEASE_LICENSE_END -->
