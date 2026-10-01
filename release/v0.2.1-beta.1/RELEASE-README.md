# DSH SEP 0.2.1-beta.1 — Windows x64 Beta

这是新的 **Windows x64 Beta测试版**，宿主为 **DSH 0.2.0-rc.2**；宿主rc编号不代表SEP进入RC。SEP原创部分采用MIT，第三方保留各自许可。

## 本版内容

- 四层记忆、本地BM25 RAG及项目范围内的Mem0辅助提炼；新增[技术概览](https://github.com/Lance-QwQ/DSH-SEP/blob/v0.2.1-beta.1/docs/TECHNICAL_OVERVIEW.md)，说明BM25公式、参数、中文分词、JSON存储、SQLite辅助组件、容量和生命周期。
- 会话预算设置默认100元，单轮和共享预算独立检查，不清零既有消费和未知预留。
- Safe Change可信确认、受管子任务、Worker/持久化/文件保护修复和正常收尾。
- SEP与DSH分别检查更新；可选后台适配评估默认关闭，开启可能产生token费用，模型分析没有安装权限。
- 保留一体式顶部、SEP品牌、后台运行和独立实例；同步[完整文档导航](https://github.com/Lance-QwQ/DSH-SEP/blob/v0.2.1-beta.1/docs/DOCS_INDEX.md)及完整脱敏源码。

## 下载选择

- **Full**：含DSH、SEP及运行时，在新目录创建独立空白实例。
- **Only**：SEP及必要适配，从精确核验的官方npm DSH来源只读复制，创建独立实例，不覆盖原官方DSH。
- **Source**：完整源码、来源/模式清单、构建配置和发布工具，不含私人Git历史、私人会话或真实API Key。
- **Update**：只接受清单中的同宿主精确基图。旧公开Beta.2基于DSH0.1.7，不能直接使用该差分；可新建本版实例，私人迁移另行核对。

安装命令、Key配置、完整退出及升级限制见[使用手册](https://github.com/Lance-QwQ/DSH-SEP/blob/v0.2.1-beta.1/docs/USER_GUIDE.md)和[安装说明](https://github.com/Lance-QwQ/DSH-SEP/blob/v0.2.1-beta.1/docs/README.md)。Full/Only不自动导入已有私人资料；独立实例不等于操作系统安全沙箱。

## 验证与限制

最终四份ZIP的CRC、来源/清单闭合、既定敏感模式检查通过；Full/Only新归档18项实装检查、11次服务请求、双实例隔离与正常退出通过，官方来源25,725文件保持。相同程序图此前的受控更新31项等内容证据保留；日常35项真实启动/设置/正常退出通过。不同组有重叠，不累计为独立功能数。

本次公开为Windows x64 Beta，不包含Linux/macOS完整桌面发布。全部用户插件功能未逐项验证；日常盘点875条unknown不是875个故障。非致命mandatory-status IPC警告仍存在，官方通道未证明可用；SEP受控更新路径另有证据。SWE后端、Windows MCP等可选能力需要单独配置。

模式扫描不证明任意秘密绝对不存在，源码交付不证明全部原生二进制可逐字节重建；多日高负载、全部硬件/安全策略和在线模型质量不在本次结论内。[已知限制](https://github.com/Lance-QwQ/DSH-SEP/blob/v0.2.1-beta.1/docs/COMPATIBILITY_KNOWN_ISSUES.md)保留具体边界及历史失败。

随附件的`ARTIFACT-VERIFICATION.json`绑定本次最终成品；`SHA256SUMS.txt`校验四份ZIP及机器更新清单，`RELEASE-ASSETS-SHA256SUMS.txt`另绑定发布凭证和说明。包内“未发布/待归档”等状态属于封包时历史；以本Release实际状态和包外凭证为准。
