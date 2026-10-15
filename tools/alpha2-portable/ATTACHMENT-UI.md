# Alpha.2 Linux 原生图片附件界面：适配与验证

2026-10-12 开始，2026-10-13 收尾。本轮仅限专用 WSL2/ext4、Linux x64、合成资料和专用受控 preset。**123/123 项相关回归、最终源码的两轮真实 Linux Electron 检查通过；完整 Linux SEP 仍为 blocked。** Windows 日常版未切换，未上传 GitHub，也未创建公共发行版。

## 输入与证据入口

- 官方 DSH Alpha.2：`d743267388641bc76f17c45ce8b4c231aed1d32c`。
- 本轮源码基线：`d97ef1bdf9127d9bd2c000b2efeb1038ca5c7eb3`。最终本地提交、可恢复 bundle 与恢复克隆结果见输出目录 `FINAL-AUDIT.json`。
- 冻结 SEP 输入仍为 `0.2.1-beta.3-alpha2-adapter.1`，候选 SHA-256 `5dd125b1493c100acce355a69511ebcf5686b8a4bf440ab2a5cec3c7daeb16ff`，444 个叶文件逐项核对，未修改其原字节。Linux 适配位于独立载具源码。
- 最终测试目录：`/opt/dsh-sep-cross-platform/alpha2-portable-attachment-ui-final-r16`。
- 输出目录：`D:\AIData\ProjectWork\DSH\alpha2-linux-attachment-ui-20261012-r1`。专用发行版 `DSH-SEP-Linux-RC` 的 ext4 VHD 位于既有 D 盘目录中。
- 机器可读索引：输出目录 `linux-evidence/RESULT.json`；仓库副本为 `docs/ALPHA2-LINUX-ATTACHMENT-UI-VERIFICATION.json`。索引 SHA-256：`3e293aad3b2a53f8eec2b37ccc372e708262cc833155e8a12a2623c2aa25a886`。
- 最终 TAP：`linux-evidence/final-r16.tap`，SHA-256 `19bf4068aba7f0af1de13369b2901b2e8bf86e170def0f0c0ea85f8eab4b838e`。82 个最终测试输入文件、11 个原生附件/客户端/编解码输入、118 个官方桌面输入分别绑定字节哈希。
- 环境：Ubuntu 24.04.5、Node 24.19.0、Electron 44.0.0、UID 1000。具体内核版本见索引；Bubblewrap 二进制仍按既有固定哈希核验。

## 实际改动

1. **原生提示准入也受生命周期门控。** `linux-attachments.mjs` 对真实 `LocalAttachmentStore.admitPromptContent` 加入运行时准入/在途计数；未激活及关闭后，纯文本也拒绝，不再绕过仅守护图片方法的旧路径。模型计费、图片归一化和存储仍走实际官方实现。
2. **不支持的文件返回原生可识别错误。** 非图像 `saveFile/saveFileStream` 使用实际 `AttachmentError`，分类码为 `SEP_LINUX_FILE_ATTACHMENT_UNSUPPORTED`；流在拒绝前不被消费。未开放非图像正文上传。
3. **原生会话缺省输出上限明确绑定。** `linux-sep-runtime.mjs` 在真实 `agent/request` 钩子中，只为本项目实际注册的 Agent、且请求未提供 `maxTokens` 时，填写该 Profile 的 `maxOutputTokens`（默认 2048）。写入发生于原生请求准备/记录之前；关闭及取消重检仍生效。显式超限值原样交给 P1 拒绝，不静默缩小，不改预算、不清空账本。
4. **增加专用原生 preset。** `linux-image-preset.mjs` 注册 `SEP Linux governed images`，使用已受控的根工具。既有 `standard` 等 preset 依赖本载具尚未提供的官方 Shell/jobs/workflow 服务，不能据此宣称已认证；没有用此专用入口替代对其他 preset 的待办。

生产适配没有修改官方客户端页面和 Electron 入口的原字节。测试桌面只在官方 main 前增加一个明确标记的观察器 import，原始桌面字节另行逐项核验。冷启动 fixture 明确配置该专用 preset 和合成模型选择；它是隔离工程载具，不是已安装的 Linux 分发包。

## 界面行为和固定限制

使用实际官方文件输入、预览卡、发送按钮、会话控制器、附件请求接口、会话持久化和桌面载具。CDP 向真实文件输入提供本地合成文件，实际 Linux Electron 渲染并处理 `File`；**没有验证手动操作系统文件选择对话框**。无本地路径的文件用合成 `DataTransfer/File` 触发原生拖放处理。

| 操作 | 本轮行为/证据 |
| --- | --- |
| 中文文件名图片选择 | 显示预览，移除后草稿附件清空；发送后草稿清空，历史图片为真实 8×8 |
| 图片数量与大小 | 每消息 1 张；每张及每消息合计上限 4 MiB（4,194,304 字节）；多张和上限加 1 字节均拒绝 |
| 畸形图片 | 原生后端以 `session/attachment-invalid` / `INVALID_IMAGE` 拒绝，原生 UI 展示其本地化提示 |
| 普通桌面文件 | 有本地路径时插入路径引用，不上传正文；引用本身不授予受控工具额外路径访问权限 |
| 无路径普通文件 | 实际原生上传入口拒绝，UI 显示上传失败卡；原生错误分类另由集成回归确认 |
| 图片历史读取 | 上传并发送后从真实会话引用读取；刷新 renderer 后仍显示历史图片和回复 |
| 借用其他会话的引用 | 使用真实附件请求更换为已有空会话，得到 `ATTACHMENT_NOT_REFERENCED` |
| 匿名读取 | 独立 HTTP 请求不带 cookie，实际宿主返回 401 |
| 桌面收尾 | 关闭隐藏、重新打开、实际正常退出；内层关闭完成、原生压缩恢复、附件独立租约可重新取得 |

官方 `dsh-app://app` 代理会为受信任页面补入自己的私有 cookie。页面内 `credentials: omit` 仍经过该代理，不能用来证明匿名 HTTP 行为；本轮改用宿主进程外的独立 HTTP 请求做负例。

图片选择/预览不调用模型。每个最终桌面实例各有一次既有 `suite_vision` 调用和一次原生上传后 Agent 调用，共两笔 settled 记录；均使用合成模型响应，计费路径是实际同一账本。**这不证明付费在线视觉效果或真实服务费用。** 附件保留至显式离线清除，既有删除和恢复规则保持；新增回归验证组合重启后引用可读、精确确认清除后不可读。组合重启与 renderer 刷新，不等同于完整宿主进程重启后的界面认证。

## 验证结果与统计口径

- 最终 123 个定义 = 前轮 116 + 本轮 7；`final-r16` 一次完整相关回归 123 pass / 0 fail / 0 cancelled / 0 skipped。没有把桌面重复轮次加到定义数量中。
- 新增 7 项：真实 Agent 的缺省上限与显式超限（2）、激活/关闭门控（1）、非图像原生错误及不消费流（1）、中文图片与文本顺序/持久引用/无模型收费（1）、畸形/MIME/数量/大小负例（1）、组合重启和离线清除（1）。
- 最终同一源码的 `desktop-r1`、`desktop-r2` 均 pass。Electron/宿主退出码均为 0；`forcedCleanup=false`；内层 phase=closed、compaction=restored，退出后附件租约复查通过。
- 历史 `ui-r14`、`ui-r15` 桌面也通过，各自仍绑定当时源码；不替代最终两轮证据。所有红样本、修正后的补跑、原始输入 tar 和历史桌面日志均保留。
- 截图已实际查看：预览卡和刷新后的历史图片/回复可见；黑色 8×8 图片是合成测试图，不是解码故障。截图与结构化事件都进入哈希清单。

历史归因如下，不把测试自身的错误计为已修复的产品漏洞：

| 历史样本 | 归因与处理 |
| --- | --- |
| red-r1 | 2 pass / 3 fail：两项真实准入/分类缺口；一项测试误用了不存在的清除 helper，单独修正测试 |
| ui-r3 | 超大合成样本误放受控源目录，触发项目大小保护、Profile 未挂载；把样本移至项目之外。测试 finally 对自己的宿主使用 SIGKILL，`forcedCleanup=true` |
| ui-r4 | 观察器停留初始页未建立会话；修正真实界面操作顺序 |
| ui-r5/r6 | 官方默认 preset 缺服务而不能创建会话；新增范围明确的专用 preset，其他 preset 仍 blocked |
| ui-r7/r8 | 测试正则未匹配官方无空格的 `4MB`；前端拒绝已发生，修正断言 |
| ui-r9 | 测试把桌面普通文件路径引用误认为正文上传；分别验证两种实际行为 |
| ui-r10 | 后端已拒绝 INVALID_IMAGE，但断言没匹配原生本地化文案；补齐断言 |
| ui-r11 / output-red-r12 | 缺省输出上限真实触发 P1_OUTPUT_LIMIT；红样本 6/7，补入受控缺省值后 7/7，显式超限负例保持拒绝 |
| output-green-r13 桌面 | 图片正例已通过，但匿名测试错误地通过带凭据的桌面代理；改为独立 HTTP 后验证 401 |

资源审计只检查专用发行版内当前 UID、可识别的本轮 Node/Electron/沙箱命令，不宣称全系统零句柄。最终没有发现该范围残留；`ui-r3` 的历史零残留是在 runner 精确清理之后取得，不能倒推其失败时已释放资源。其他历史桌面失败记录为正常退出路径，无强制清理。刻意阻塞的回归样本由夹具释放其自有请求；这些路径均独立归因。

索引采集 `audit-r1` 曾把 `ui-r3` 称为 deadline failure，`audit-r2` 仅更正该说明为实际 startup failure；原始回执一直为 `SEP_LINUX_PROFILE_NOT_MOUNTED` / `forcedCleanup=true`。首次采集原字节保存在 `linux-evidence-audit-r1`，最终入口为 `linux-evidence`；未因此重写实验或增加通过计数。

## 复现

先恢复 `source-checkpoint.bundle` 及固定冻结宿主/桌面输入；本载具依赖已准备的真实 `/opt/dsh-sep-cross-platform` 输入，不是可在任意新 Linux 主机直接安装的包。所有新输出必须在真实 D 盘或其专用 ext4 VHD 内，不能指向日常安装。选取全新 tag，脚本拒绝覆盖已有输入。

Windows 操作方在 `tools/alpha2-portable` 执行：

```powershell
& .\run-attachment-ui.ps1 -Tag replay-r1 -Tests @(
  'isolation.test.mjs','isolation-transactions.test.mjs','transactions.test.mjs',
  'cleanup-recovery.test.mjs','linux-profile.test.mjs','linux-sep.test.mjs',
  'document-transactions.test.mjs','linux-documents.test.mjs','linux-vision.test.mjs',
  'linux-attachments.test.mjs','attachment-recovery.test.mjs','linux-attachment-intake.test.mjs'
)
```

随后在新生成的 Linux 目录内执行真实桌面，`SEP_BUNDLE_TEST_ROOT` 必须是全新路径：

```sh
umask 077
export SEP_PORTABLE_ROOT=/opt/dsh-sep-cross-platform/alpha2-portable-20261012-r1
export SEP_BWRAP_SHA256=e318903862396f96de3df57264e0158682b952fd3fb53ac23d876413e7b30f71
export SEP_BUNDLE_TEST_ROOT="$PWD/desktop-replay-r1"
export SEP_LINUX_BUSINESS=1 SEP_LINUX_VISION=1 SEP_LINUX_ATTACHMENT_UI=1
/opt/dsh-sep-cross-platform/runtime/bin/node prepare-linux-attachment-ui-desktop.mjs
/opt/dsh-sep-cross-platform/runtime/bin/node run-linux-desktop.mjs
```

`finalize-attachment-ui.mjs` 是本轮固定代次的只读证据封存器，拒绝非 final-r16 输入或不符计数，不应用删掉断言的方式重用。后续复跑按新代次记录。`export-attachment-ui.mjs` 二进制白名单导出；`seal-attachment-ui.mjs` 核对测试源码、日常入口和用户原有文档修改，制作本地 Git checkpoint 并真实 clone 后逐文件核对。

## 剩余范围

完整 Linux SEP、其他官方 preset、非图像正文上传仍 blocked。手动系统文件选择器、完整宿主进程重启后的原生 UI、Linux 鼠标拖动/托盘输入、点击增强/评测后端、通用安装更新、私人资料、在线付费模型、macOS/其他发行版、磁盘满/断电及外部同 UID 任意宿主代码均未在本轮认证。最终启动日志中其他未提供服务的 pending 组件、`permissionPresets/catalog` 的 service-unavailable，以及桌面 telemetry 配置缺项均保留，不计为已通过功能。这些不妨碍本轮专用图片入口的限定正例，也不能据此宣称完整 Linux 桌面已经可发布。

下一阶段可以优先接入普通文件正文上传的独立治理域与实际宿主进程重启接续，再推进其他 preset/服务及完整 Linux 发行认证。本轮到此收尾，不触碰 Windows 日常版或 GitHub。
