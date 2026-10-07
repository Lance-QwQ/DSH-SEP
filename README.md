# DSH SEP

**DEEPSEEK HARNESS SYSTEM ENHANCEMENT PACKAGE（DSH 系统增强套件）**

为 DeepSeek Harness 增加四层记忆、本地 RAG、受管任务、受控文件修改、更新与恢复，以及可选点击增强。

**最新下载：SEP 0.2.1-beta.2 · Windows x64 Beta，DSH 宿主 0.2.0-rc.2。** SEP 仍为 Beta，宿主 rc.2 不代表 SEP 已进入 RC。[下载及校验文件](https://github.com/Lance-QwQ/DSH-SEP/releases/tag/v0.2.1-beta.2)。本版已公开，十项附件的服务器SHA-256、大小、上传状态及未登录读取均已核验；[发布回执](release/v0.2.1-beta.2/PUBLICATION.json)。包内准备状态保留封包时点，公开回执记录最终状态。

## 本版新增

“设置 → 通用设置 → 更新过滤强度”：弱包含 Alpha/Beta/RC/正式版，中排除 Alpha，强仅查看 RC/正式版，**默认强**。一个选择控制 DSH 与 SEP；保存后重新检查并在重启后保留。需要发现 SEP Beta 更新时请选择中或弱。设置不调用模型、不清零消费；若另外开启了更新适配评估，更宽的通道可能增加已有评估请求。[过滤规则](docs/UPDATE_FILTER.md)。

新增固定版本离线升级桥，解决旧公开 Beta.1 内置更新器不能接纳新增通用设置组件的问题。只支持两份列明的精确基图；不扩张原更新器的通用允许范围。**已有 0.2.1-beta.1 用户请使用离线升级桥，不能仅点击旧版“立即更新”或解压覆盖。** [升级步骤和边界](docs/OFFLINE-UPGRADE-BETA2.md)。

## 选择安装包

| 包 | 用途 |
|---|---|
| `DSH-SEP-Full-0.2.1-beta.2-Windows.zip` | 包含 DSH、SEP 和运行环境，在新目录建立独立空白实例。 |
| `DSH-SEP-Only-0.2.1-beta.2-Windows.zip` | SEP、必要宿主适配和依赖；从精确核验的官方 npm DSH 来源只读复制本体，再创建独立新实例。 |
| `DSH-SEP-Offline-Bridge-v0.2.1-beta.2-Windows-x64.zip` | 已初始化的受支持 Beta.1 实例原位受控升级，保留数据、插件、凭据路径及全部预算账本。 |
| `DSH-SEP-Update-0.2.1-beta.2-Windows.zip` | 机器可读差分候选，旧 Beta.1 内置更新器会因组件所有者保护拒绝，需搭配离线桥；不能直接运行或覆盖安装。 |
| `DSH-SEP-Source-0.2.1-beta.2-Windows.zip` | 完整宿主和 SEP 源码、安装器、离线桥、测试及来源记录，不包含私人 Git 历史或运行资料。 |

Full 与 Only 都要求新目标目录及真实父路径，不覆盖已有官方 DSH/SEP。程序、数据、锁、身份和端口独立，**不等于操作系统安全沙箱**。

## 新实例安装

Full 包解压后在包根运行：

```powershell
.\runtime\node\node.exe .\installer.mjs 'D:\Applications\DSH-SEP'
```

Only 包：

```powershell
.\runtime\node\node.exe .\installer.mjs 'D:\Applications\DSH-SEP' 'D:\Sources\DSH-020rc2'
```

Only 的来源必须是包内说明指定的 npm 程序布局并匹配全部文件；任意同版本官方桌面目录不一定合格。不要将私人实例当作官方来源。实际模型对话需要在新实例 `.env` 填写自己的 `DEEPSEEK_API_KEY`；空 Key 可暂时跳过欢迎页。用 `start.vbs` 启动，关闭窗口保留后台，完整退出使用应用或托盘的“退出 DSH SEP”。

旧 `0.2.0-beta.2`（DSH 0.1.7）不是本次 `0.2.1-beta.2`，不在离线桥范围。可建立新空白实例，私人资料迁移另行核对。

## 验证与限制

内容目录安装及 Host 检查55项，固定公开 Beta.1 升级17项，P2中断回归27项；日常切换11项和两轮真实 Electron/Host 检查39项通过。各组有重叠，不累加成独立场景。最终 ZIP 安装及服务器分发字节以外部 `ARTIFACT-VERIFICATION.json`、`SHA256SUMS.txt` 和公开发布记录为准。[验证范围](docs/VERIFICATION.md)。

兼容性 unknown 是未逐项运行证明，不是故障数。本轮没有验证全部私人插件、Linux/macOS桌面发行、多日负载或在线模型质量；日常验证用了网络守卫，不证明无守卫时外部服务连通。历史较大GUI回归的5项失败和其他未证明范围保留，不因新包发布自动改为通过。

## 阅读顺序

[极简介绍与亮点](docs/PRODUCT_OVERVIEW.md) · [使用手册](docs/USER_GUIDE.md) · [发布说明](docs/RELEASE-NOTES.md) · [已知限制](docs/COMPATIBILITY_KNOWN_ISSUES.md) · [隐私](docs/PRIVACY_DATA.md) · [导航](docs/DOCS_INDEX.md) · [BM25及四层记忆技术路线](docs/TECHNICAL_OVERVIEW.md) · [源码](source/) · [离线桥源码审查](docs/offline-upgrade-bridge-beta2-review.md)

SEP 原创部分采用 [MIT](LICENSE)，第三方组件保留原许可，详见[集成列表](docs/OPEN_SOURCE_INTEGRATIONS.md)。本项目独立维护，不是 DeepSeek 或所列上游的官方发行版。当前公开安装包仅限 Windows x64；Linux/macOS源码适配证据不等于本次跨平台桌面发行。
