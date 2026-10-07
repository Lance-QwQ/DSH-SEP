# 0.2.1-beta.2 当前状态

本次 Windows x64 Beta 新增[更新过滤设置](UPDATE_FILTER.md)及[固定版本离线升级桥](OFFLINE-UPGRADE-BETA2.md)。DSH保持0.2.0-rc.2；日常已切换，公开状态以Release页面为准。[当前验证](VERIFICATION.md)。以下原Beta.1版本数值、封包及发布状态是历史记录；通用功能与限制仍适用。

# 文档导航 · 0.2.1-beta.1

本套资料对应 **SEP 0.2.1-beta.1 / DSH 0.2.0-rc.2 / Windows x64 Beta**。内容目录安装55项、受控更新31项、真实Electron首启12项已通过；四份最终归档的CRC、SHA-256、脱敏审计和ZIP安装结论由随资产提供的包外 `ARTIFACT-VERIFICATION.json` 和 `SHA256SUMS.txt` 权威记录。封包阶段未发布GitHub或切换日常；之后日常已切换并完成35项限定检查。机器记录见 [版本与来源](../RELEASE-STATUS.json)、[内容目录验收](VERIFICATION-RESULT.json)及[文件内容校验清单](CONTENTS-SHA256SUMS.txt)。它不是三平台桌面发行或 SEP RC 声明。

| 你想了解 | 入口 |
|---|---|
| 一句话理解及核心亮点 | [极简介绍](PRODUCT_OVERVIEW.md) |
| 包怎么选、如何安装 | [README](README.md) |
| 本版相较历史发布改了什么 | [发布说明](RELEASE-NOTES.md) |
| 记忆、建库、预算、点击和更新怎么用 | [使用手册](USER_GUIDE.md) |
| 更新过滤档位、默认值及 Token 影响 | [更新过滤设置](UPDATE_FILTER.md)、[本次验证摘要](UPDATE-FILTER-VERIFICATION.json) |
| 差分支持什么基线、为什么拒绝跨宿主更新 | [更新范围](UPDATE-SCOPE.md) |
| 新包验证与维护／历史证据的区别 | [验证范围](VERIFICATION.md) |
| 支持平台、未完能力和已知问题 | [兼容性与已知限制](COMPATIBILITY_KNOWN_ISSUES.md) |
| BM25、四层记忆、存储和运行机制 | [技术概览](TECHNICAL_OVERVIEW.md) |
| 数据在哪里、何时发送及如何删除 | [数据与隐私](PRIVACY_DATA.md) |
| 哪些上游项目真实参与了功能 | [开源集成列表](OPEN_SOURCE_INTEGRATIONS.md) |
| SEP原创与第三方分别如何授权 | [许可说明](LICENSING.md)、[第三方声明](THIRD_PARTY_NOTICES.md)、[许可证索引](licenses/index.json)、[组件清单](COMPONENTS.json)、[MIT原文](../LICENSE) |

[完整源码来源说明](sep-release-source.md)说明当前交付方式。完整源码包提供自身 README、`SOURCE-PROVENANCE.json` 与 `SOURCE-DELIVERY.json`。前者绑定实际来源／变更／程序对应，后者记录测试锁、交付元数据和构建范围。单独一个 upstream HEAD 不能代表含本地改动的完整 SEP 源码。

旧 Alpha、Beta.1、Beta.2 的固定文档和失败证据作为历史保留。历史页面中的“当前”、local.*、图哈希及测试数只按其当时范围理解，不因新文档而改成最新或通过。

## 2026-10-01 公开 Beta.1 记录

2026-10-01 发布对应的日常切换完成35项限定检查；它是历史基线。本次更新过滤的源码与日常部署结果见[更新过滤设置](UPDATE_FILTER.md)。现有Release下载包未因此改写。封包阶段的未部署记载属于历史；[公开日常验证摘要](DAILY-VALIDATION-SUMMARY.json)不含私人路径、正文或凭据。GitHub公开状态以Release实际页面为准。

当前公开发行：[Windows x64 Beta](https://github.com/Lance-QwQ/DSH-SEP/releases/tag/v0.2.1-beta.1)；最终成品凭证和公开回读记录见仓库的`release/v0.2.1-beta.1/`。封包时与历史准备状态保留，不改写旧失败记录。
