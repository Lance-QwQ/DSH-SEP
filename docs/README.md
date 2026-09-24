本轮启动修订 `windows-alpha-20260924-startup-r2`，程序图 `0b54ac82524c0a42db44d5b8a6ebbbca1773a28c8c361839d47f9c12760f35a3`。此页原有 2026-09-21 版本号、验收数量与发布状态保留为历史；本轮结果请读 [启动修订](STARTUP_FIX.md)。更新状态没有降低固定验收标准。

# DSH SEP · Windows x64 Alpha

<!-- SEP_RELEASE_STATUS_START -->
分发修订 `20260921-mit-alpha` · 文档 `20260921-docs-r6` · **Windows x64 Alpha 测试发布**。SEP 已确认原创部分采用 MIT，第三方保留原许可。历史启动异常作为已接受的已知问题披露；功能证据与本轮封包验证分别见[发布说明](RELEASE_NOTES.md)和[测试摘要](TEST_ACCEPTANCE.md)。项目入口：[GitHub 仓库](https://github.com/Lance-QwQ/DSH-SEP)。
<!-- SEP_RELEASE_STATUS_END -->

**DEEPSEEK HARNESS SYSTEM ENHANCEMENT PACKAGE（DSH系统增强套件）** 通过插件组合与必要的宿主适配，为 DeepSeek Harness 增加四层记忆与 RAG、任务执行辅助、受控更新和故障恢复。先看[极简定义](WHAT_IS_DSH_SEP.md)与[产品亮点](PRODUCT_OVERVIEW.md)，完整入口见[文档导航](DOCS_INDEX.md)。

## 本版身份与验证

DSH `0.1.6-alpha.2`，SEP `0.1.0-alpha.15.dsh-alpha2.1`。分发 `20260921-mit-alpha`；程序图 `8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52`。本次没有升级 DSH 本体或部署到日常实例。

本轮只更新许可、文档和相关元数据；运行实现基线为 `20260921-office-r2`，程序图 `a2d3c02193007261560a35a564a786145c4424f0c4a1b28f46e0f6c5a43803a8`。代码与二进制等同性、重新安装、ZIP 和脱敏核验结果：**pass：本轮已核对仅已映射原创许可、包声明与文档/绑定变更，运行实现及第三方文件与 Office-r2 字节相同；沿用其固定 Windows 11 功能证据，未重跑全部功能或付费模型。最终 MIT ZIP 安装、逐文件验证与脱敏结果由包外 DELIVERY-REPORT.json 单独绑定。**。功能证据沿用该固定基线，不宣称本轮重跑了完整功能矩阵、真实模型、长时间运行或全部环境测试。

历史 `GUARDIAN_NOT_READY`／`HOST_STARTUP_UNATTRIBUTED` 宿主启动异常仍未归因、未证明修复；原 Only 合成安装追加的 10 次启动、记忆只读检查和正常退出均未复现。项目所有者已允许带此已知问题进行 Windows Alpha 测试发布。这项决定不把历史 fail 改为 pass，不降低原验收标准，也不表示通过稳定版准入。

## 两种安装形式

| 形式 | 适用情况 | 安装边界 |
|---|---|---|
| Only | 已有可核验的受支持 DSH 程序目录 | 含 SEP、必要宿主适配及依赖；校验并复制所需本体文件，在新目录创建实例，不是任意版本热插拔包。 |
| Full | 需要独立完整实例 | 包含 DSH、SEP、Electron 与配套运行环境；安装到新目录及空白业务库。 |

两者都不原地覆盖另一 DSH 的程序、用户数据或自装插件。每个实例独立管理配置、数据、端口与所属进程；主动共用工作目录仍会修改同一真实文件。这是应用实例隔离，不是虚拟机或 OS 安全沙箱。步骤见[安装与卸载](INSTALL_UNINSTALL.md)。

## 开始使用

1. 核对发布附件的 SHA-256 以及 [版本清单](RELEASE_MANIFEST.json)，解压后安装到新的本地短目录。
2. 在新实例自己的 `.env` 中配置 API Key；不要将密钥或私人库上传到仓库。
3. 从 `start.vbs` 或 `start.ps1` 启动，选择工作区，在“设置 → 记忆增强”控制自动学习和引用。
4. 窗口 × 会保留后台；完整退出用“应用 → 退出”或托盘“退出 DSH SEP”。

## 能力与边界

| 能力 | 文档 |
|---|---|
| 四层记忆、本地 RAG、受控编辑与删除 | [使用手册](USER_GUIDE.md)、[数据与隐私](PRIVACY_DATA.md) |
| 同项目候选记忆、上下文原文展开与子任务工作前筛查 | [开源适配清单](OPEN_SOURCE_INTEGRATIONS.md) |
| 文件入口保护、Safe Change、Worker、检查点 | [兼容性与已知限制](COMPATIBILITY_KNOWN_ISSUES.md) |
| 更新检查、插件兼容报告与有界恢复 | [恢复与排错](RECOVERY_TROUBLESHOOTING.md) |
| Office 转 PDF 与预览 | [Office 转换说明](OFFICE_CONVERTER.md) |

Only／Full 均自带约 1.58 GB 解压后大小的官方 LibreOffice 转换运行库，无需全局安装。字体缺失诊断为 unavailable，不能把空列表解读为字体齐全。目标 Windows 10/11 x64，功能证据来自 Windows 11；其余系统与未知插件不据此认定兼容。

SEP 已确认原创部分采用 MIT，版权声明为 `Copyright (c) 2026 DSH SEP contributors`。允许使用、修改、复制、分发、再许可及销售，须保留版权和许可声明；MIT 不要求衍生版沿用原来的商业限制。第三方代码、素材及运行库继续适用各自许可，不能将整包重新许可为 MIT。详见 [许可说明](LICENSING.md)。

[测试摘要](TEST_ACCEPTANCE.md) · [发布检查表](PUBLICATION_CHECKLIST.md) · [反馈](SUPPORT.md) · [安全边界](SECURITY.md)
