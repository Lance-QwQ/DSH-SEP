# DSH SEP · Windows x64 发布资料

<!-- SEP_RELEASE_STATUS_START -->
分发修订 `20260921-r1` · 文档 `20260921-docs-r4` · **候选验收未全部通过，暂不可公开发布**。GitHub 仓库尚未创建；具体下载与反馈地址未绑定。最终程序图及验证见[发布说明](RELEASE_NOTES.md)。
<!-- SEP_RELEASE_STATUS_END -->

**本次候选尚不具备公开发布条件。** 桌面聚焦补跑第3轮发生 Only 宿主在就绪前 code 1 退出（GUARDIAN_NOT_READY）；原 stderr 只记录5673字节而未留正文，原因未确定。另1次及连续5次启动诊断均未复现，不能据此认定修复。公开上传还受 LibreOffice Kit Node API 首选源码访问缺口阻塞。完整结果见[测试记录](TEST_ACCEPTANCE.md)。

**DEEPSEEK HARNESS SYSTEM ENHANCEMENT PACKAGE（DSH系统增强套件）** 为 DeepSeek Harness 增加分层记忆、检索、任务执行辅助、受控更新和恢复能力。先看 [极简定义](WHAT_IS_DSH_SEP.md)，产品亮点见 [宣传介绍](PRODUCT_OVERVIEW.md)，所有文档入口见 [文档导航](DOCS_INDEX.md)。

文档修订：`20260921-docs-r4`。内容以 `sep-alpha2-stability-20260921`、DSH `0.1.6-alpha.2` 为当前能力基线。

## 当前交付状态

本次 Only／Full 分发修订为 `20260921-r1`，从已验收日常修复构建生成至新目录；当前状态以本页首段和发布说明为准，不以来源回归替代新包安装和归档核验。`20260920-r2-sanitized` 的两份旧包为历史档案，未包含四项修复。新包实际身份及结果见[发布说明](RELEASE_NOTES.md)。

[正式许可](LICENSE) 已确定：允许个人及企业内部使用、修改、免费转发和制作衍生版；出售或商业分发须另行授权，衍生版保留相同商业限制。详见 [许可说明](LICENSING.md)。第三方组件保留各自条款；日常来源图和旧安装包保留历史字节；本次新候选按文件权属同步许可，覆盖结果见许可说明。旧资料中的“公开测试候选”是构建用途标签，不替代发布授权。准确版本、哈希和待完成事项见 [发布说明](RELEASE_NOTES.md) 与 [发布清单](PUBLICATION_CHECKLIST.md)。

## 两种安装形式

| 形式 | 适用情况 | 输入与边界 |
|---|---|---|
| Only | 已有可核验的受支持 DSH 程序目录 | 需要固定版本与文件布局通过校验；不是对任意已安装 DSH 原地覆盖。 |
| Full | 希望安装独立的 DSH SEP 实例 | 随包提供本体和运行环境；安装到新目录，不自动导入其他实例数据。 |

操作步骤及真实命令见 [安装与卸载](INSTALL_UNINSTALL.md)。不要用某个包的文件拼接另一个修订，也不要因 DSH 版本号相同就跳过文件校验。

## 能力入口

| 能力 | 用途 | 从哪里了解 |
|---|---|---|
| 四层记忆与 RAG | 项目知识、用户长期偏好、按需历史检索；支持受控修改和删除 | [使用手册](USER_GUIDE.md)、[数据与隐私](PRIVACY_DATA.md) |
| 上下文与子任务辅助 | 历史压缩和原文展开、同项目候选记忆、受管子任务工作前检查 | [开源适配清单](OPEN_SOURCE_INTEGRATIONS.md) |
| 文件与任务保护 | 标准文件入口保护、显式 Worker、任务检查点、安全变更工具 | [兼容性与限制](COMPATIBILITY_KNOWN_ISSUES.md) |
| 更新中心 | 官方版本查询、全插件兼容性报告、批准候选的受控更新 | [使用手册](USER_GUIDE.md)、[恢复指南](RECOVERY_TROUBLESHOOTING.md) |
| 故障恢复 | 守护重启、桌面重连、维护状态与受控恢复 | [恢复与排错](RECOVERY_TROUBLESHOOTING.md) |

## 开始使用

1. 先核对 [版本清单](RELEASE_MANIFEST.json)，确认手中的包对应哪组能力与限制。
2. 按 [安装指南](INSTALL_UNINSTALL.md) 校验文件，安装到新的本地目录。
3. 在实例自己的 `.env` 中配置密钥，启动后选择工作区；模型调用会产生供应商费用。
4. 在“设置 → 记忆增强”选择自动学习和引用策略；资料索引、编辑与删除按使用手册执行。
5. 点窗口 × 会保留后台；完整退出用“应用 → 退出”或托盘“退出 DSH SEP”。

支持范围为已验证的受控 Windows 环境，不代表所有 Windows 构建、任意第三方插件或任意未来 DSH 版本均兼容。保护范围以文档为准，普通 Shell 不属于套件完整拦截范围。

反馈问题前请按 [反馈指南](SUPPORT.md) 脱敏；漏洞细节按 [安全说明](SECURITY.md) 私下报告。[测试摘要](TEST_ACCEPTANCE.md) 说明已验证、未验证和历史异常。
