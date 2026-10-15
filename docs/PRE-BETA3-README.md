# 最新本地阶段：Alpha.2 Linux Wayland 补验

最新 Linux 补验：冻结 closeout.12 实包在私有 Sway/pixman、禁 XWayland 环境完成 ASCII 两轮＋中文文件名补充两轮，10 个场景定义共40次成功执行，另3/3输入范围检查通过。真实拖动、草稿、隐藏重开、原生选择器预览/移除与活动任务退出闭环通过；AT-SPI 实际 GTK 退出窗口语义点击仍 fail，完整 Linux 公开认证仍 blocked。未重打程序包、未切换 Windows 日常、未上传 GitHub。见[报告](docs/ALPHA2-LINUX-WAYLAND-20261014.md)与[绑定证据](docs/ALPHA2-LINUX-WAYLAND-VERIFICATION.json)。以下保留历史。

---

# 最新本地阶段：Alpha.2 Linux 收尾

最新 Linux 本地收尾：226/226项固定回归、实际 `.12`压缩包独立安装、12组各两轮（24次冷启动）；另有固定Flask两轮正负对照4次官方判题。补齐独立监督／真实40秒截止、活动COW中断恢复、实包复制助手，以及Electron44/GTK3原生批准后立即销毁窗口的SIGSEGV适配。完整Linux公开认证仍blocked；真实物理桌面、Wayland交互、在线模型、私人首次纳管及公网自动更新不据此通过。Windows日常不变、未上传GitHub。见[本轮报告](docs/ALPHA2-LINUX-FINALIZATION-20261013.md)与[绑定证据](docs/ALPHA2-LINUX-FINALIZATION-VERIFICATION.json)。下文保留历史。

---

# 最新本地阶段：Alpha.2 Linux 认证推进

211/211项回归通过；实际 .7 压缩包独立安装后，六组各两轮：Node启动器崩溃、外层启动器崩溃、活动Agent原生退出确认、默认窗口关闭、宿主崩溃、WSLg原生Wayland启动关闭。修复启动器死亡后的后代遗留与租约提前释放，保留死亡Node身份至清理完成并做启动前内核能力检查。候选 `alpha2-linux-closeout.7`；.6仅历史初稿。见 [报告](docs/ALPHA2-LINUX-CERTIFICATION-20261013.md) 与 [证据](docs/ALPHA2-LINUX-CERTIFICATION-VERIFICATION.json)。完整Linux公开认证仍blocked，故障关闭与资源归因分别记录；Windows日常不变，未上传GitHub。下文保留历史。

---

# 当前本地审查修复候选：bundle.24

固定 DSH **0.2.1-alpha.1**，SEP **0.2.1-beta.3-bundle.24**。本轮处理 bundle.23 的 KIMI/GROK 审查反馈：收紧模型文件入口观察回执与评测路径，修正失败清理重试及脱敏原因码，同步活契约、fixture 来源链、可移植 CI 草案和关闭复现入口。原 bundle.23 检查点与历史失败日志保留。

完整三平台认证仍 **blocked**；默认插件入口 **pending**，完整 Profile **blocked**。本轮不切换日常版、不推送 GitHub、不发布 Release。当前结果及明确保留的低优先项见[审查核验与修复](docs/BUNDLE-REVIEW-REPAIR.md)，机器可读证据见[本轮索引](docs/BUNDLE-REVIEW-REPAIR.json)。历史公开下载不等于本地 bundle.24。

## 以下为 bundle.23 及更早历史状态

# 当前本地适配候选：bundle.23

固定 DSH **0.2.1-alpha.1**，SEP **0.2.1-beta.3-bundle.23**。本轮推进至第8步并封存检查点；**完整三平台认证仍 blocked，不能视为发布就绪**。默认组合入口仍 pending，普通插件页“启用”只加载待准入入口；业务能力须经明确选择的受控 Windows 根、项目绑定及精确计划确认。

- Windows：初始化回滚、有界应用关闭、剩余消费者、原生 UI 与插件页生命周期已有所列合成验证；最新283项运行时、23项生命周期、13项构建/入口、11项依赖、3项官方门禁及2项GUI检查分别留证。
- Linux：10项离线配置/账本检查通过；完整固定宿主安装因 npm 元数据请求失败而 blocked。保护提供方仍明确限制Windows x64。
- macOS和本轮GitHub CI：not_run。CI草案仅本地准备，没有推送/触发；未认证完整桌面发行、任意插件、完整MCP部署、多日负载或全部在线模型链路。
- 安装及升级：官方插件页已验证固定本地Git提交，不等于公共HTTPS分发认证；升级需完整重启宿主，同进程热升级不在承诺内。历史关闭慢样本仍未归因。

[当前状态与第8步收尾](docs/BUNDLE-FINAL-CANDIDATE.md) · [证据导航](docs/BUNDLE-CURRENT-INDEX.md) · [第5步GUI安装](docs/BUNDLE-GUI-INSTALLATION.md) · [三平台与CI边界](docs/BUNDLE-PLATFORM-CI.md)。日常版未切换，GitHub未推送/发布；**公开下载仍为下方历史Beta.2**。

## 以下为历史阶段与公开 Beta.2 说明

下文的“当前”指各历史报告当时状态；本轮结论以以上入口及证据导航为准，历史包、日志和验收标准保持。

> bundle.22 / 第3步当前范围：共享记忆捕获、同项目/会话历史、上下文、评测后端与点击消费者已接入显式受控根；图片采用独立原生附件域、明确上传授权与离线计划清理。默认 pending，完整 Profile blocked；当前浏览器收尾失败保留，后续完整 UI/GUI安装/三平台/最终包未认证。见 [剩余消费者与附件治理](docs/BUNDLE-REMAINING-CONSUMERS.md)。以下为历史阶段原文。

> bundle.18 当前补充：显式原生设置 Loader 入口已接入，验证官方模块发现/资源服务与真实 HTTP BrowserAuth；完整浏览器自动激活和 GUI 仓库链接安装仍待下一阶段。默认 pending，日常版和 GitHub不变。见 [本阶段报告](docs/BUNDLE-NATIVE-SETTINGS.md)。以下旧阶段原文保留。

> bundle.17 当前补充：固定 alpha.1 宿主33项peer精确声明与实际pnpm peers check已通过；305个固定定义（原296+新增9）通过。此结论限dependency-resolution和已有片段回归，不代表完整运行兼容。默认准入仍pending；原生客户端发现、BrowserAuth及剩余消费者继续推进。日常版/GitHub未变更。见 [本阶段报告](docs/BUNDLE-HOST-DEPENDENCIES.md)。以下旧阶段原文保留。

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
