# Windows Alpha 发布检查表

<!-- SEP_RELEASE_STATUS_START -->
分发修订 `20260921-mit-alpha` · 文档 `20260921-docs-r6` · **Windows x64 Alpha 测试发布**。SEP 已确认原创部分采用 MIT，第三方保留原许可。历史启动异常作为已接受的已知问题披露；功能证据与本轮封包验证分别见[发布说明](RELEASE_NOTES.md)和[测试摘要](TEST_ACCEPTANCE.md)。项目入口：[GitHub 仓库](https://github.com/Lance-QwQ/DSH-SEP)。
<!-- SEP_RELEASE_STATUS_END -->

本清单针对 `20260921-mit-alpha`。用户已明确授权 MIT 原创许可和带已知问题的 Windows Alpha 测试发布；这不改变固定测试状态、不表示稳定版准入，也不能跳过实际打包与分发核验。

| 项目 | 判定入口与边界 |
|---|---|
| SEP 原创许可 | MIT，版权 2026 DSH SEP contributors；逐文件确认范围，第三方原许可不变。见[许可说明](LICENSING.md)。 |
| 新程序图与许可清单 | `8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52`；依赖、来源、许可索引与 Only／Full 元数据均须对应新图，旧图保留。 |
| 源码交付 | `DSH-SEP-Source-20260921-MIT.zip`；`SOURCE_FILES.json` SHA-256 `ed91e199c25db5a35844111d535a75f66e3c5537bf332f08cb4a09b9ca16053f`。 |
| 运行代码与二进制等同性 | 与 office-r2 逐文件核对；只允许已列明的许可、文档与元数据变化。 |
| 实际安装、ZIP 与隐私扫描 | 采用本轮最终候选，结果见[测试摘要](TEST_ACCEPTANCE.md)；不把旧安装结果写成本轮执行。 |
| 同修订文档 | r6；无未替换占位符、当前旧商业条款或身份冲突；链接和 UTF-8 核验通过后冻结。 |
| 已知启动异常 | 原因未确定、未证明修复；已获带此问题 Alpha 发布授权，继续公开披露。 |
| 功能验收历史 | 原字节保留；沿用 a2d3… 基线证据，未全量重跑项目仍如实标注。 |
| 公开附件 | Only、Full、Source、Docs 四份 ZIP 与 SHA256SUMS.txt；不得混入私人数据、密钥、诊断转储或完整工作区 Git 历史。 |
| GitHub 发布 | [项目仓库](https://github.com/Lance-QwQ/DSH-SEP)；以预发布（Prerelease）形式发布，上传后的附件应下载回验。 |
| 支持与安全入口 | 普通问题走仓库公布的 Issues；安全报告按仓库 Security 政策，未启用私密入口前不公开敏感细节。 |

本轮核验：**pass：本轮已核对仅已映射原创许可、包声明与文档/绑定变更，运行实现及第三方文件与 Office-r2 字节相同；沿用其固定 Windows 11 功能证据，未重跑全部功能或付费模型。最终 MIT ZIP 安装、逐文件验证与脱敏结果由包外 DELIVERY-REPORT.json 单独绑定。**。尚未完成的发布动作不能仅因文档写好就标为 pass；状态限用 `pass / fail / blocked / not_run`，范围另列。

历史 `GUARDIAN_NOT_READY`／`HOST_STARTUP_UNATTRIBUTED` 宿主启动异常仍未归因、未证明修复；原 Only 合成安装追加的 10 次启动、记忆只读检查和正常退出均未复现。项目所有者已允许带此已知问题进行 Windows Alpha 测试发布。这项决定不把历史 fail 改为 pass，不降低原验收标准，也不表示通过稳定版准入。

[发布说明](RELEASE_NOTES.md) · [第三方声明](THIRD_PARTY_NOTICES.md) · [返回导航](DOCS_INDEX.md)
