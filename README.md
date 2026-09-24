# DSH SEP · Windows Alpha 测试版

**DEEPSEEK HARNESS SYSTEM ENHANCEMENT PACKAGE（DSH 系统增强套件）**

DSH SEP 是面向 Windows x64 的 DeepSeek Harness 增强组件集合，在 DSH 的对话、模型和工具能力上增加项目记忆、知识检索、受管任务、更新检查与故障恢复。它是独立维护的增强项目，与官方 DeepSeek Harness 项目有明确区别。

**当前级别：Windows Alpha 测试版。** 基于 DSH `0.1.6-alpha.2`，实际验证环境为 Windows 11 x64。SEP 原创部分采用 [MIT](LICENSE)，DSH 和所有第三方组件保留各自许可。

[下载安装包](https://github.com/Lance-QwQ/DSH-SEP/releases/tag/windows-alpha-20260924-startup-r2) · [文档导航](docs/DOCS_INDEX.md) · [使用手册](docs/USER_GUIDE.md) · [适配的开源项目](docs/OPEN_SOURCE_INTEGRATIONS.md) · [问题反馈](https://github.com/Lance-QwQ/DSH-SEP/issues)

## 本次启动修复

修订 `windows-alpha-20260924-startup-r2` 修复异常退出后残留所有权阻塞、部分启动收尾和入口诊断问题。旧公开包用户请下载 **Startup-Repair**，按[已有安装修补说明](release/REPAIR_README.md)预检后应用；不要解压覆盖现有安装。原有资料、Key、工作区及用户插件保留，未知版本或修改过的受管程序会拒绝覆盖。

本轮有 116 项组件与合成集成测试通过，另有实际安装的三轮正常启停、三轮崩溃恢复、三个并发入口、Electron 页面和独立实例并存证据；小型修补包与最终归档另见[交付报告](release/DELIVERY-REPORT.json)。真实系统重启／断电与收费模型调用未测。

## 核心增强

- **四层记忆与本地 RAG**：当前上下文、项目事项、长期偏好与目标、按需归档；自动学习与自动引用可以分别控制，记忆支持更正、撤回和受控删除。
- **长对话来源追溯**：对历史压缩、候选记忆与原文展开增加来源检查和审阅；Mem0 辅助提炼限定在同项目允许的消息中。
- **受管子任务**：经 `suite_delegate` 创建的只读子任务具备工作前检查、数量与返工限制、超时、取消和记录。模型与预算控制另行管理。
- **文件修改辅助**：Safe Change 为已有单个 UTF-8 文件生成候选、静态检查与差异审阅；普通 Shell 不受全局隔离试改保证。
- **更新与恢复**：定时查询官方版本、展示插件兼容状态；通过维护锁、提交记录和数据治理控制切换与恢复。未知状态会停止自动处理。
- **Office 预览**：自有转换适配器连接随包官方 LibreOffice，保留文档预览接口，无需全局安装 LibreOffice。

## 本次公开下载

本次 r2 发行的 **Full（约 917 MB）、Only（约 750 MB）、Startup-Repair（约 37 MB）和 Source** 已全部公开上传，并已匿名下载核对完整 SHA-256。补传的是原封存 r2 归档，没有发布 rc.1 适配版。请核对发行页的 `SHA256SUMS-ALL-r2.txt` 与 `TRANSMISSION-COMPLETE.json`；原交付报告和旧校验清单保留历史部分上传状态。

已有用户使用[修补指南](release/REPAIR_README.md)。首次安装可直接下载本次 r2 Full，安装到新的独立目录。Only 的受支持来源要求见安装指南；旧 Full／Only 安装的修补路径已有实际测试。

## 安装包怎么选

| 安装包 | 用途 |
|---|---|
| **Full** | 包含 DSH、SEP 和配套运行环境，适合首次使用。 |
| **Only** | 包含 SEP、必要宿主适配及配套依赖；需要受支持且逐文件匹配的 DSH 来源。相同版本号不保证任意安装布局都可用。 |

两者均安装到新的独立目录，不原地覆盖已有 DSH 或自装插件。新实例使用空白业务库；程序、状态、凭据和工作区分别管理。这是应用实例隔离，不是虚拟机或操作系统安全沙箱。

下载并解压 Full 包后，在解压目录的 PowerShell 中执行：

```powershell
.\install.ps1 -Destination 'D:\DSH-SEP'
```

目标父目录须存在，目标目录须尚不存在。安装成功后，在安装目录自己的 `.env` 中填写 `DEEPSEEK_API_KEY`，再运行 `start.vbs`。完整步骤及 Only 参数见[安装指南](docs/INSTALL_UNINSTALL.md)和包内 README；不要直接启动内部 Electron 绕过受管入口。

点窗口关闭按钮会保留后台，完整结束使用“应用 → 退出”或托盘“退出 DSH SEP”。请在 Releases 中核对 `SHA256SUMS-ALL-r2.txt`，不要把 `.env`、私人记忆或会话日志提交到仓库。

## 测试范围与已知限制

以下为 9 月 21 日历史功能证据；本次启动修复见[当前报告](docs/STARTUP_FIX.md)。Office 功能候选已有 69 项适配器测试、三轮格式转换及边界共 34 项检查、真实桌面预览与两份最终包各三次启动记录。MIT 发布另核对许可改动、运行代码等同性和新包完整性；这些证据不代表所有真实环境、Office 排版和第三方插件均已验证。

历史一次独立的 `GUARDIAN_NOT_READY` 尚未归因，后续未复现不能证明修复。本版按项目所有者决定以 **Alpha 测试版**公开，并保留该已知问题。字体完整性不可诊断；深路径可能需要可核验的短路径；恢复并不保证处理所有崩溃。详见[兼容性和已知问题](docs/COMPATIBILITY_KNOWN_ISSUES.md)及[测试摘要](docs/TEST_ACCEPTANCE.md)。

SWE-bench／SWE-ReX 等可选评测默认关闭，需要另行准备受控环境。被选入模型请求的内容可能发送给模型供应商；本地记忆不等于全部数据永不离开本机。

## 源码与贡献

[`source/`](source/) 是本次发布的可审阅源码快照，包含 SEP 原创组件、宿主适配文件、Office 桥接源及对应清单；[`source/BUILD.md`](source/BUILD.md)说明局部开发入口与构建限制。

本仓库不承诺从一次克隆即可逐字节重建整个 DSH／Electron／LibreOffice 分发包，也不包含全部传递原生依赖源码；上游来源、固定版本及第三方许可另行列明。历史私有工作区和原 Git 历史不随仓库发布。

提交问题或改动前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [SECURITY.md](SECURITY.md)。

## 许可

SEP 有权许可的原创部分采用 **MIT**，允许使用、修改、再分发和商业使用，并须保留许可与版权声明。第三方部分仍遵循各自许可，根 MIT 不替代这些条款。详细映射见[许可说明](docs/LICENSING.md)和[第三方声明](docs/THIRD_PARTY_NOTICES.md)。
