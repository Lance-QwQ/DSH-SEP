# 文档索引 / 导航

<!-- SEP_RELEASE_STATUS_START -->
分发修订 `20260921-mit-alpha` · 文档 `20260921-docs-r6` · **Windows x64 Alpha 测试发布**。SEP 已确认原创部分采用 MIT，第三方保留原许可。历史启动异常作为已接受的已知问题披露；功能证据与本轮封包验证分别见[发布说明](RELEASE_NOTES.md)和[测试摘要](TEST_ACCEPTANCE.md)。项目入口：[GitHub 仓库](https://github.com/Lance-QwQ/DSH-SEP)。
<!-- SEP_RELEASE_STATUS_END -->

文档集 `20260921-docs-r6`。首次阅读按“定义 → 版本 → 安装 → 使用”的顺序即可。

## 使用者

| 需求 | 文档 |
|---|---|
| 用一分钟了解 SEP | [极简定义](WHAT_IS_DSH_SEP.md) |
| 了解 SEP 相较于 DSH 的核心亮点，或向他人介绍 | [产品宣传介绍](PRODUCT_OVERVIEW.md) |
| 查看项目与两种包的概况 | [README](README.md) |
| 确认手里是哪一版、修复是否已包含 | [发布说明](RELEASE_NOTES.md)、[机器可读版本清单](RELEASE_MANIFEST.json) |
| 安装、启动、迁移或卸载 | [安装与卸载](INSTALL_UNINSTALL.md) |
| 建库、记忆管理、任务辅助和更新 | [使用手册](USER_GUIDE.md) |
| 查看系统要求、限制与已知问题 | [兼容性与已知问题](COMPATIBILITY_KNOWN_ISSUES.md) |
| Office 预览、字体提示、格式和运行库来源 | [Office 转换说明](OFFICE_CONVERTER.md) |
| 了解数据存放、模型请求与删除 | [数据与隐私](PRIVACY_DATA.md) |
| 处理报错、维护状态和恢复 | [恢复与故障排查](RECOVERY_TROUBLESHOOTING.md) |
| 提交普通问题 / 漏洞 | [反馈指南](SUPPORT.md) / [安全说明](SECURITY.md) |

## 开发者与审阅者

| 需求 | 文档 |
|---|---|
| 哪些开源项目被依赖、适配或参考 | [开源集成清单](OPEN_SOURCE_INTEGRATIONS.md) |
| 审阅授权与第三方条款 | [许可决定记录](LICENSING.md)、[SEP 当前许可文件](LICENSE)、[第三方声明](THIRD_PARTY_NOTICES.md)、[许可文件索引](licenses/index.json) |
| 查看准确依赖版本与来源记录 | [依赖清单](DEPENDENCIES.json) |
| 了解测试范围和证据版本 | [测试与验收摘要](TEST_ACCEPTANCE.md)、[Office 功能基线](evidence/office-validation.json)、[更早能力证据](evidence/verification-summary.json) |
| 准备正式发布 | [发布前清单](PUBLICATION_CHECKLIST.md) |
| 校验本套文档是否改变 | [文档 SHA256 清单](SHA256SUMS.txt) |

## 如何理解版本和证据

- **本次 Alpha 分发**：`20260921-mit-alpha`，图 `8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52`；本轮只改许可、文档和元数据，等同性与新包安装证据见[测试摘要](TEST_ACCEPTANCE.md)。
- **Office 功能基线**：`20260921-office-r2`，图 `a2d3c02193007261560a35a564a786145c4424f0c4a1b28f46e0f6c5a43803a8`；功能证据保留原身份，本轮未全量重跑。
- **更早能力来源**：`sep-alpha2-stability-20260921`，图 `ffb961…`；四层记忆、治理等回归为继承证据。
- **历史 office-r2 文档**：[原文入口](history/office-r2/README.md)，原许可与当时状态保留原字节；归档的相对链接按原目录理解。
- **历史 r1 文档**：[原文入口](history/r1/README.md)；十次追加启动是该旧图的补充证据，未证明原启动异常修复。
- **更早历史分发**：`20260920-r2-sanitized`，图 `e57816…`；不因本次发布改变字节。
- **本版许可**：已确认 SEP 原创部分为 MIT，允许使用、修改、分发、再许可和销售并保留声明；第三方继续适用原许可。
- **Alpha 已知问题**：历史启动异常仍未归因；用户已接受在本级别发布时披露，历史失败与固定标准不改写。

完整值见 [版本清单](RELEASE_MANIFEST.json)。各文档中的“当前”均指这套文档的固定基线，不会随上游发布自动变化。

本目录可独立阅读，公开摘要不链接个人电脑上的原始日志、密钥或会话。原始开发证据另行留存；发布者需要共享时应先脱敏，并说明对应版本。本次两种包应附同一修订文档；当前 ZIP 自身的最终哈希由包外 SHA256SUMS.txt 提供，不嵌入本 ZIP 形成自引用。
