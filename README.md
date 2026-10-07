# DSH SEP

**DEEPSEEK HARNESS SYSTEM ENHANCEMENT PACKAGE（DSH 系统增强套件）**

DSH SEP 为 DeepSeek Harness 增加四层记忆、本地 RAG、受管任务、受控文件修改、更新与恢复，以及可选点击增强。当前公开 SEP 仍处于 **Beta 测试阶段**；DSH 宿主名称中的 rc.2 不代表 SEP 已进入 RC。

## 最新源码与日常版

2026-10-07 已增加“设置 → 通用设置 → 更新过滤强度”：弱包含 Alpha/Beta/RC/正式版，中排除 Alpha，强仅查看 RC/正式版，**默认强**。一个设置同时控制 DSH 与 SEP；保存后重新检查并在重启后保留，安装前的兼容性、指纹和确认要求继续生效。行为与 Token 影响见 [更新过滤说明](docs/UPDATE_FILTER.md)。

对应 Windows 日常版已按确认计划切换，三轮真实启动、设置及正常退出 51 项通过；已部署更新器 29 项、源码核心 44 项通过，完整范围和失败历史见 [验证摘要](docs/UPDATE-FILTER-VERIFICATION.json)。本次同步源码与文档，**下方现有 Beta.1 下载包保持原封存内容，不包含这次新增设置**；SEP 没有改称 RC，也未发布新的安装版本。

Beta.2 的固定版本离线升级桥已完成制作及安装后源码核验，工具源码在 [`tools/offline-upgrade-bridge-beta2`](tools/offline-upgrade-bridge-beta2/README.md)，范围见 [源码审查](docs/offline-upgrade-bridge-beta2-review.md)。它解决公开 Beta.1 无法通过旧内置更新器接纳新增通用设置组件的升级路径；仅接受列明的两份精确基图。**此源码记录不表示 Beta.2 已公开发布或日常程序已切换**；下方 Beta.1 资产仍保持封存。

## 选择包

**当前下载发行：SEP 0.2.1-beta.1 · Windows x64 Beta，宿主 DSH 0.2.0-rc.2。** 已完成所述 Windows 范围的内容目录安装、更新与真实桌面验证。 Full／Only安装及Host冒烟55项、同宿主受控更新31项、真实Electron启动12项通过；这些证据绑定程序内容，不直接等于最终ZIP验收。内容验收见 [VERIFICATION-RESULT.json](docs/VERIFICATION-RESULT.json)，版本和程序图见 [RELEASE-STATUS.json](RELEASE-STATUS.json)。2026-10-01 的日常切换完成35项限定检查；本轮更新见下方，不发布Linux／macOS包。

| 包 | 用途 |
|---|---|
| `DSH-SEP-Full-0.2.1-beta.1-Windows.zip` | 包含 DSH、SEP 和随附运行环境，在新目录建立独立空白实例。 |
| `DSH-SEP-Only-0.2.1-beta.1-Windows.zip` | 包含 SEP、必要宿主适配和依赖；从精确核验的官方 npm DSH 来源只读复制所需本体，再创建独立新实例。 |
| `DSH-SEP-Update-0.2.1-beta.1-Windows.zip` | 受控差分包，仅适用本轮列明的同宿主精确基图，不能作为完整安装包。 |
| `DSH-SEP-Source-0.2.1-beta.1-Windows.zip` | 本轮完整源码、安装器、测试及来源对应记录，不包含私人会话、真实 Key 或私人 Git 历史。 |

Full 与 Only 都不会原地覆盖已有官方 DSH 或 SEP。安装器要求目标尚不存在、父目录是真实路径；不要通过解压覆盖、修改指纹或移动安装后的目录绕过检查。独立实例隔离程序、数据、锁、身份和端口，**不等于操作系统安全沙箱**。

## 安装

从解压后的 Full 包根运行：

```powershell
.\runtime\node\node.exe .\installer.mjs 'D:\Applications\DSH-SEP'
```

从 Only 包根运行：

```powershell
.\runtime\node\node.exe .\installer.mjs 'D:\Applications\DSH-SEP' 'D:\Sources\DSH-020rc2'
```

Only 的第二个路径须是包内来源说明指定的 npm 程序布局，必须同时匹配版本、文件和依赖来源。任意同版本官方桌面目录不一定合格；不匹配会拒绝。不要把现有私人实例当作“精确官方来源”。

安装后，在新实例的 `.env` 填写自己的 `DEEPSEEK_API_KEY`，通过 `start.vbs` 启动。首次空白Key会显示欢迎页，可暂时跳过进入主界面；实际模型对话仍需填写有效Key。Key 只保存在本机，不上传、不随反馈发送。关闭主窗口保留后台；完整退出使用应用或托盘的“退出 DSH SEP”。

已有公开 Beta.2 基于 DSH 0.1.7-rc.2，**不能通过本版 SEP 同宿主差分直接升级到 DSH 0.2.0-rc.2**。可先建立本版独立空白实例；私人资料迁移须另行核对，不自动复制。详见 [UPDATE-SCOPE.md](docs/UPDATE-SCOPE.md)。

## 本版重点

- 修复经独立核验成立的宿主、持久化、文件保护、Worker 交付及记忆生命周期问题，保留审查更正和失败历史。
- “设置 → 会话预算”提供默认100元及单会话上限，保留既有消费和未知预留；共享预算和单轮额度仍分别生效。
- Safe Change 支持绑定确切候选的可信确认、分项验证和收尾摘要；普通 Shell 没有全局隔离试改保证。
- “设置 → 更新适配评估”默认关闭。开启可能产生两阶段模型请求和费用；模型结论没有安装权限。
- SEP 与 DSH 独立检查更新。部分历史清单缺失时单独显示范围提示，不误称已经全面检查或全局最新。

## 阅读顺序

[极简介绍与核心亮点](docs/PRODUCT_OVERVIEW.md) · [使用手册](docs/USER_GUIDE.md) · [发布说明](docs/RELEASE-NOTES.md) · [验证范围](docs/VERIFICATION.md) · [已知限制](docs/COMPATIBILITY_KNOWN_ISSUES.md) · [隐私](docs/PRIVACY_DATA.md) · [文档导航](docs/DOCS_INDEX.md)

SEP 原创部分采用 [MIT](LICENSE)，第三方组件保留各自许可。详见 [许可说明](docs/LICENSING.md) 和 [第三方集成](docs/OPEN_SOURCE_INTEGRATIONS.md)。本项目独立维护，不是 DeepSeek 或所列上游组件的官方发行版。

四份最终归档的CRC、SHA-256、脱敏审计与ZIP安装结论，由随资产提供的包外 `ARTIFACT-VERIFICATION.json` 和 `SHA256SUMS.txt` 权威记录；包内 `VERIFICATION-RESULT.json` 只绑定内容目录验收，不能嵌入自身ZIP哈希形成自引用。

## 2026-10-01 公开 Beta.1 记录

2026-10-01 发布对应的日常切换完成了35项限定检查；这是历史基线，本轮日常结果见上方最新源码说明。封包阶段的未部署记载属于历史；[公开日常验证摘要](docs/DAILY-VALIDATION-SUMMARY.json)不含私人路径、正文或凭据。GitHub公开状态以Release实际页面为准。

[下载Windows Beta安装包](https://github.com/Lance-QwQ/DSH-SEP/releases/tag/v0.2.1-beta.1) · [BM25及实现路线](docs/TECHNICAL_OVERVIEW.md) · [源码](source/)

## 公开发行

本版[GitHub Release](https://github.com/Lance-QwQ/DSH-SEP/releases/tag/v0.2.1-beta.1)已公开，包含九项附件；服务器SHA-256和公开更新下载链接已核验。完整源码与BM25技术文档已同步。包内待发布状态是封包时历史，当前凭证见[公开记录](release/v0.2.1-beta.1/PUBLICATION.json)。
