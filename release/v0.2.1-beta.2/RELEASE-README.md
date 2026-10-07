# DSH SEP 0.2.1-beta.2 · Windows x64 Beta

宿主 DSH 保持 0.2.0-rc.2，SEP 是新的 **Beta**，不是 RC。MIT，第三方组件保留各自许可。

本版新增“设置 → 通用设置 → 更新过滤强度”：弱含Alpha/Beta/RC/正式，中排除Alpha，强仅RC/正式，默认强；控制DSH和SEP，保存后重查并在重启后保留。需要收到SEP Beta时请选择中或弱。该设置自身不调用模型、不清零消费；另开更新适配评估时可能因发现更多宿主版本增加已有评估请求。

新增固定版本离线升级桥。**旧公开 0.2.1-beta.1 内置“立即更新”不能直接安装本版，需使用 Offline-Bridge，不能解压覆盖。** 只支持公开Beta.1精确图 ec39d3b4…及本地过滤Beta.1精确图682529a8…，保留用户插件/配置、会话/记忆、凭据路径、完整预算消费/预留/额度。具体报告仍需用户同意，指纹变动使确认失效。桥[使用说明](https://github.com/Lance-QwQ/DSH-SEP/blob/v0.2.1-beta.2/docs/OFFLINE-UPGRADE-BETA2.md)。

新用户下载 **Full** 在新目录安装；**Only** 不含完整DSH，需精确官方npm来源，包含必要宿主适配与依赖。两者创建独立空白实例，不覆盖其他官方/SEP实例；独立部署不等于操作系统安全沙箱。首次空Key可跳过欢迎页，实际模型调用需自行填写本机.env。关闭窗口保留后台，正常退出用托盘“退出DSH SEP”。

附件包括Full、Only、Source、Update差分、Offline-Bridge，以及更新清单、校验和、包外验证凭证和本说明。Update只作受控差分候选，旧所有者门禁仍会拒绝，桥为受支持升级入口。旧0.2.0-beta.2（DSH0.1.7）不在同宿主桥范围。

五份最终ZIP通过CRC、成员安全布局、SHA-256和限定脱敏扫描；Full/Only从最终ZIP新安装并运行两个真实Host的18项断言、11次RPC通过，官方来源保持原字节，两Host正常收尾无残留。完整Source16924个交付文件及1625个桥运行输入逐文件核验。其他内容/桥/P2/日常检查按各自范围列于验证凭证，不简单累加。日常版已按具体计划切换并完成两轮Electron/Host验证。

本次不发布Linux/macOS桌面包。兼容unknown不是故障，也不是逐项运行通过；未证明全部私人插件、多日高负载、在线模型质量、真实断电或任意结构迁移。历史GUI失败保留。编译CSS中8处D盘项目构建路径注释不含用户名、正文或凭据，随固定字节保留；包内封包状态是历史时点，实际公开状态以本Release及PUBLICATION记录为准。

[主README](https://github.com/Lance-QwQ/DSH-SEP/tree/v0.2.1-beta.2) · [验证边界](https://github.com/Lance-QwQ/DSH-SEP/blob/v0.2.1-beta.2/docs/VERIFICATION.md) · [BM25及四层记忆技术细节](https://github.com/Lance-QwQ/DSH-SEP/blob/v0.2.1-beta.2/docs/TECHNICAL_OVERVIEW.md) · [源代码](https://github.com/Lance-QwQ/DSH-SEP/tree/v0.2.1-beta.2/source)
