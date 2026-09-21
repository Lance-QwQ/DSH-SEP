# 许可同步与来源材料完成记录

日期：2026-09-21。以本文件与 FINAL-VERIFICATION.json 为最新结论；REPORT.md 保留前一阶段只读审计。没有修改日常程序、旧 ZIP、候选或实现源码。

## 可执行交付

- apply-license.py：只生成本目录 overlay 与 support-overlay，不会应用到任何运行实例。
- overlay/：95 个程序相对路径文件，供发布程序根目录合并。
- support-overlay/：2 个包根目录相对文件，补齐 runtime/office-skills 的原 DSH MIT 与来源证明。
- overlay-manifest.json：所有新增/修改文件的旧、新 SHA-256、用途与来源。清单 SHA-256：`7871673343f884f95a6bc927b7a20e421bd30ccb2690a61cf755fb280afc996e`。本记录之后 overlay 字节冻结。
- notices/RESOLUTION.json：15 个外部包的固定身份和处理方法；FINAL-VERIFICATION.json 同时列出原 26 项的输出位置。

适用基线：`ffb961a17b4202ec753e70bc5fd0e4de0ccf697df4155ee4c369d9e48be56f6c`（527 包）。旧文件哈希不匹配时应拒绝直接覆盖，先重新核对。应用后必须重封 graph 并重新生成依赖/源码清单、包哈希，不能把原 ffb 图哈希写成修改后的图。

## 原 7 个缺失许可声明

p0500、p0501、p0516、p0517、p0518、p0519 对明列的本地原创文件采用已批准的 DSH SEP 限制商业分发许可 1.0；各包附完整 LICENSE、LICENSE-SCOPE.md/json 和 manifest 声明。p0500 同时覆盖其本地 bin/ui 入口，p0518 覆盖本地 evaluation 桥接材料；不止含 src。

p0501 排除 BM25 vendor、第三方声明和独立依赖；p0517 排除 vendor/、上游任务材料和第三方声明。各自原始文件逐项绑定旧哈希。该范围声明不构成法律产权认证，不覆盖第三方与先前有效授权。

p0513 已有 DeepSeek MIT 及上游迁移源，只补 manifest 的 MIT 声明，原许可不变。p0482、p0514、p0515 保留以前的 MIT 授权，没有重新收紧。p0514/p0515 未虚构版权年份或主体，另附明确通用 MIT 文本与证据边界。

## 原 26 项未匹配独立许可证文件

这些是原文件名扫描结果，不能直接称为“26 个无授权依赖”。现已逐项提供原许可、合法既存声明的条款补充，或本次明确选择的本地原创许可；这不等于完成全法律合规审定。

| 包 | 本次材料 |
|---|---|
| p0108 @koromix/koffi-win32-x64@3.3.0 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0118 @earendil-works/pi-ai@0.85.1 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0123 standardwebhooks@1.1.1 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0146 @aws-sdk/credential-provider-http@3.972.73 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0150 @aws-sdk/credential-provider-login@3.972.78 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0151 @aws-sdk/nested-clients@3.997.45 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0163 @earendil-works/pi-telemetry@0.85.1 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0176 data-uri-to-buffer@4.0.1 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0360 @xterm/headless@6.0.0 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0373 @xterm/addon-serialize@0.14.0 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0441 fontkit@2.0.4 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0443 brotli@1.3.3 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0445 dfa@1.2.0 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0452 saxes@6.0.0 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0485 @deepseek-ai/dsh-desktop@0.1.6-alpha.2 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0493 lazy-val@1.0.5 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0498 @deepseek-ai/dsh-desktop-host@0.1.6-alpha.2 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0500 @deepseek-ai/dsh-recovery@0.1.0-alpha.15.dsh-alpha2.1 | LICENSE + LICENSE-SCOPE |
| p0503 @napi-rs/canvas-win32-x64-msvc@1.0.8 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0505 @nodable/entities@3.0.0 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0514 @deepseek-ai/dsh-task-checkpoint@0.1.0-alpha.15.dsh-alpha2.1 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0515 dsh-sep-brand@0.1.0-alpha.15.dsh-alpha2.1 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |
| p0516 dsh-sep-context-preparation@0.1.0-alpha.15.dsh-alpha2.1 | LICENSE + LICENSE-SCOPE |
| p0518 dsh-sep-trusted-evaluation-entry@0.1.0-alpha.15.dsh-alpha2.1 | LICENSE + LICENSE-SCOPE |
| p0519 dsh-tool-worker@0.1.0-alpha.15.dsh-alpha2.1 | LICENSE + LICENSE-SCOPE |
| p0521 @electron-internal/extract-zip@1.0.5 | LICENSE-SEP-SUPPLEMENT + LICENSE-PROVENANCE |

其中 15 个在线来源调查对象的结果为：

1. 6 份固定提交原许可：pi-ai、pi-telemetry、standardwebhooks、xterm/headless、xterm/addon-serialize、saxes。standardwebhooks 使用其固定 libraries/LICENSE 的 MIT，根目录 Apache 文件只保留为内部调查证据，未错误附给 MIT 子包。
2. 1 份同版本父包许可：koffi Windows 原生包使用已随图存在的 koffi 3.3.0 原 MIT 文本。其范围注明未完成二进制到源码的完整核查。
3. 8 份固定许可声明＋通用条款：fontkit、brotli、dfa、lazy-val、extract-zip，以及三个固定版本 AWS 包。固定 npm manifest/README 的声明、实际作者字段、gitHead（如存在）、tarball URL/完整性均保留。通用条款明确不是从这些原仓库取得的原许可文件；未编造版权主体、年份或缺失的 Git 提交。

15 个 npm tarball 均按 dist.integrity 核验；原包均未匹配独立许可/NOTICE 文件。临时 tarball 在检查后删除。检索与下载代码未被执行。通用条款来自固定 SPDX license-list-data 提交，来源/哈希见 standard-license-index.json。

## Office 与运行时

四个 office-skills 资产与固定 DSH alpha.2 源码逐字节一致，故补其原 DSH MIT，而非从工具可访问性推定 Codex 私有技能可再分发。primary-runtime 的来源核对是 DSH 官方固定 builder 与 lock，Node/Python/pnpm 和 14 个 Python dist-info 声明已记录于 runtime-audit.json；这不是全部运行时二进制的完整 SBOM 或法律审计。

## sharp 与 LibreOffice 对应源码

sharp 固定来源链进一步核实：v0.35.4 明确依赖 libvips Windows npm 1.3.3；原 DLL 与 1.3.3 中 libvips-42.dll SHA-256 完全相同，版本清单也相同。该 npm gitHead 指向公开固定 sharp-libvips 6e5971d…，其 Windows 配方指向 v8.18.6 的 build-win64-mxe 固定提交 09cfccf…。相应 SOURCE-ACCESS.md 与 SOURCE-PROVENANCE.json 已写入 overlay，旧“找不到 v8.18.6 tag”不再被误用为无对应来源结论。

尚未重建所有内嵌库、单独追完第二个 C++ DLL、逐个下载并审计全部静态组件的源归档及重链接材料。因此当前结论是固定来源入口及主 libvips DLL 对应关系已验证，不能扩张为全部二进制可重现、所有 copyleft 源交付义务已认证。

**明确公开发布阻断项仍是 LibreOffice Kit Node API 首选修改源码未取得。** p0438 只有打包 JS、声明文件；原声明的 Kit 提交 7f7a6ab…公开查询 404。p0439 已随附的 helper、LibreOffice core 来源、配方和补丁必须保留，但不能替代 Node API 的首选源码。固定 LibreOffice core bce0998…公开可取，不能据此关闭 Node API 缺口。SOURCE-ACCESS.md 中如实区分，未用通用 MPL 文本冒充缺失源码。

## 验证

97 个 overlay 文件逐项哈希核对，95 个程序文件和 2 个 support 文件；原 318 个本地模块图内文件及 ffb 图仍与最初审计相同。原 7 项均有可执行声明处理，原 26 项都有对应补充材料。所有新 JSON 可解析，生成材料未发现开发机用户目录绝对路径。这里只验证材料生成与范围，不代替应用后程序图封存、安装冒烟或最终发布权利审定。
