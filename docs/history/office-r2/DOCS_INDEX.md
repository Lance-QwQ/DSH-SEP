# 文档索引 / 导航

<!-- SEP_RELEASE_STATUS_START -->
分发修订 `20260921-office-r2` · 文档 `20260921-docs-r5` · **Office 转换器替换候选**。当前包使用自有适配器和官方 LibreOffice；验证与发布状态见[发布说明](RELEASE_NOTES.md)和[测试摘要](TEST_ACCEPTANCE.md)。GitHub 仓库尚未创建，未执行上传。
<!-- SEP_RELEASE_STATUS_END -->

文档集 `20260921-docs-r5`。首次阅读按“定义 → 版本 → 安装 → 使用”的顺序即可。

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
| 了解测试范围和证据版本 | [测试与验收摘要](TEST_ACCEPTANCE.md)、[脱敏证据摘要](evidence/verification-summary.json) |
| 准备正式发布 | [发布前清单](PUBLICATION_CHECKLIST.md) |
| 校验本套文档是否改变 | [文档 SHA256 清单](SHA256SUMS.txt) |

## 如何理解版本和证据

- **继承能力来源**：2026-09-21 已部署的修复构建，程序图以 `ffb961…` 开头；本轮 Office 实现另行替换。
- **本次分发候选**：`20260921-office-r2` Only／Full，图与验收状态见发布说明。
- **历史 r1 文档**：[原文入口](history/r1/README.md)，只按历史身份阅读；十次追加启动是该旧图的补充证据。
- **历史分发档案**：2026-09-20 脱敏 r2 Only／Full，程序图以 `e57816…` 开头；不因本次打包改变字节。
- **历史测试**：保留原失败及限制；后续通过只说明后续输入与版本的结果。
- **发布许可**：允许个人及企业内部使用、修改、免费转发、制作衍生版；出售或商业分发须另行授权，衍生版沿用相同商业限制。新软件包的许可同步与测试状态另行核对。

完整值见 [版本清单](RELEASE_MANIFEST.json)。各文档中的“当前”均指这套文档的固定基线，不会随上游发布自动变化。

本目录可独立阅读，公开摘要不链接个人电脑上的原始日志、密钥或会话。原始开发证据另行留存；发布者需要共享时应先脱敏，并说明对应版本。本次两种包应附同一修订文档；当前 ZIP 自身的最终哈希由包外 SHA256SUMS.txt 提供，不嵌入本 ZIP 形成自引用。
