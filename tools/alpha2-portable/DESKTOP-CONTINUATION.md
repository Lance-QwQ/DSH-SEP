# Alpha.2 Linux 中文显示、系统选择器与完整重启验证

2026-10-13。本轮完成上一阶段提出的三项推进，范围为专用 WSL2/Ubuntu 24.04 x64、ext4、空白合成受控 Profile、私有 Xorg 虚拟显示。**152/152 项相关回归、两组最终有效桌面案例通过，每组包含两次独立宿主及 Electron 启动，共四次启动。** 不等于完整 Linux SEP 认证。Windows 日常版未改动，未上传 GitHub；macOS 未在本轮验证。

## 本轮实现与实际行为

1. `linux-desktop-fonts.mjs` 为每个测试实例创建独立 Fontconfig 配置、字体目录及缓存；启动 Electron 时显式设置 `FONTCONFIG_FILE`。没有安装全局字体。字体由 Ubuntu `fonts-noto-cjk` 1:20230817+repack1-3 包提取，字体与包均核验 SHA-256，版权文件随实例和证据保留。单测核验实际 `fc-match` 的选择及系统缺省选择未变；真实截图中“中文说明.txt”字形清晰，已人工查看截图。
2. 原生隐藏文件 input 打开真正 GTK “Open Files”选择器，外部驱动核对可见窗口标题和精确 Electron PID 后，以真实 X11 键鼠事件操作；没有替换 `File`、拦截 chooser、调用 `DOM.setFileInputFiles`、重写 `pathFor` 或 stub 系统 dialog。取消不产生选择；文本 `unsupported.txt` 按官方桌面分支插入路径引用，**不记作正文上传**。图片 `picker-image.png` 实际返回浏览器 File、预览、发送、进入原生附件/视觉链路并获得合成模型回复。
3. 另沿用 pathless 合成 File 拖放测试非图像**正文上传**：中文文件 → 官方上传 worker/原生回执 → 真实 Agent → `suite_attachment_read` → 正文工具结果 → 合成回答 → 历史刷新。操作系统选择的文本文件与 pathless 拖放上传是两个不同证据，不混算。
4. 第一代先保存会话、准确附件引用、完整账本及一个未绑定上传回执，然后正常退出宿主与 Electron。第二代使用同一持久目录启动全新宿主/Electron，核对 PID 与 `/proc` 启动时间不同、旧 HTTP 地址拒绝连接；原生恢复会话后，原会话读取正文成功，外会话返回 `SEP_FILE_NOT_REFERENCED`，未绑定回执不可解析。真实 UI 显示同一会话的中文附件和回答；没有重跑模型，账本消费、预留、限额等完整解析内容相同。

每组最终案例均验证超大文件拒绝、发送后外会话/已退休回执重放拒绝、页面刷新、关闭隐藏/再次打开、正常退出。四次宿主退出码及四次 Electron 退出码均为 0，SEP close 为 pass、压缩钩子恢复，无强杀。私有 Xorg 由外层载具显式终止并等待退出，不把它描述成 Electron 自行清理。

本轮仅改变隔离载具与私有字体支持；官方桌面 118 项冻结输入与 SEP 444 项冻结输入逐叶复核。桌面 main 只增加一个测试观察器 import，余下字节与官方固定输入相同。真实 Loader、会话、工具、上传和存储链路没有 mock；远端模型响应是合成，宿主拒绝非 loopback 模型网络，无付费调用。

**后续审查补充（不改写历史回执）：** 本阶段的 `run-linux-desktop-continuation.mjs` 将 `desktopQuitInspection` 固定返回 `activeTasks:false, scheduledTasks:false`。上述“没有 mock”仅指已逐项列明的业务链路，不包含退出前任务检查。本阶段没有验证活动任务／计划任务的退出提示或取消决策；历史通过计数不能用于该项认证。实际独立启动器另走宿主 inspect IPC，但也不能据此倒推本阶段已覆盖。

## 结果与故障样本

单测计数：上一阶段全部 149 个定义 + 3 个字体定义 = 152，0 fail/cancelled/skipped。最终测试代次 `final-r15`，两组有效桌面目录为 `desktop-r2`、`desktop-r3`；重复桌面运行不计入单测定义数。

| 样本 | 观察与处理 | 结论用途 |
| --- | --- | --- |
| font-red-r1 | 字体支持未实现，0/3 | 先红证据 |
| font-green-r2 | 实现后3/3 | 初始字体证据 |
| desktop-r3 | 准备载具漏设 umask077，私有目录权限被准入拒绝 | 修正测试准备，不记软件运行不稳定 |
| desktop-r4–r7 | WSLg 的窗口无法被用户看到；自动输入/窗口定位未能可靠完成 | 保留失败与工具限制，WSLg 人工验证未通过 |
| desktop-r8 | 私有 Xvfb 依赖及编译期 xkbcomp 路径尚不完整 | 完成私有依赖及 bin 映射，无系统安装 |
| desktop-r9–r12 | GTK 取消可行；location 输入后的 Enter 不能证明选中文件，未收到浏览器 change | 失败保留；改为点击实际 Open 按钮，后续同时断言 File 内容和原生 UI 结果 |
| desktop-r13 | 选择器、图片、上传、首代正常退出通过；二代观察器误读 `error.code`，真实错误位于原生 info/message 包装 | 修正观察器错误码断言；当次二代仍 fail，测试清理使用强制路径 |
| desktop-r14 | 两代流程通过，但末尾错误地要求 JSON 原字节哈希相同，未生成整体通过回执 | 原生加载会规范化对象字段顺序；改为完整解析内容深比较，保留各代原字节哈希，未放松消费/预留/设置检查 |
| final-r15 / desktop-r1 | 桌面观察回执 pass，但操作方误填 Bubblewrap 哈希 | **排除**有效通过计数；不以未执行 Shell 的桌面路径代替隔离二进制绑定 |
| final-r15 / desktop-r2、desktop-r3 | 固定正确哈希，两组各两次独立启动，所有最终断言通过 | 本轮最终有效桌面证据 |

选择器观察器最终使用30秒选择截止；系统驱动30秒、整体桌面360秒、宿主正常关闭10秒均有界。失败时只清理本次创建的确切进程，不按名称批量终止。首代快照失败仍请求宿主停止，避免测试错误导致无界遗留。最终零可识别残留是在所有正常退出、外层 Xorg 收尾，以及历史故障样本的受控/强制测试清理之后取得；不能据此倒推那些失败当场已完成资源释放。

## 可复现输入与操作

- 源码基线：`6e5f8a70ecdb8b59bdd5f92460d09cf8a620a4f7`；本轮最终本地提交见输出根 `FINAL-AUDIT.json`。
- 官方 DSH 0.2.1-alpha.2：`d743267388641bc76f17c45ce8b4c231aed1d32c`。
- 冻结 SEP：`0.2.1-beta.3-alpha2-adapter.1`，444 leaves；artifact SHA-256 `5dd125b1493c100acce355a69511ebcf5686b8a4bf440ab2a5cec3c7daeb16ff`。
- Node24.19.0、Electron44；冻结 Linux 根 `/opt/dsh-sep-cross-platform/alpha2-portable-20261012-r1`，原生桌面输入根 `/opt/dsh-sep-cross-platform/alpha2-portable-desktop-inputs-r2`。
- 真实 D: 输出 `D:\AIData\ProjectWork\DSH\alpha2-linux-desktop-continuation-20261013-r1`；WSL 根在既有 D: ext4 VHD。
- `linux-evidence/RESULT.json` 绑定源码、每代日志/截图、最终案例、资产包、输入完整性和资源审计。`SYNC-AUDIT.json`、`FINAL-AUDIT.json`、`source-checkpoint.bundle` 及恢复克隆绑定 Git 源码；旧阶段证据保留。

先从检查点恢复源码，核验封存输入和资产，不用网络“最新版”替换。字体 deb SHA-256 `7d64b985f6fe128c99eae5610d5c047338e572bdcfb2bb09736be01b824a7f6c`，选定 TTC SHA-256 `b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a`。私有 Xorg 六个包及复制的 dash SHA 见资产回执。`prepare-desktop-assets.py` 记录当时 apt 元数据版本与哈希，只下载、解包，不执行安装脚本；不能将后来的 apt 解析结果自动视作同一冻结工具链。

Windows 操作方执行 `run-desktop-continuation.ps1 -Tag <新tag> -Tests <全部16个test文件>`，拒绝覆盖旧归档。Linux桌面执行：

```sh
export SEP_PORTABLE_ROOT=/opt/dsh-sep-cross-platform/alpha2-portable-20261012-r1
export SEP_BUNDLE_TEST_ROOT=/opt/dsh-sep-cross-platform/alpha2-portable-desktop-continuation-<新tag>/<新case>
export SEP_BWRAP_SHA256=e318903862396f96de3df57264e0158682b952fd3fb53ac23d876413e7b30f71
export SEP_LINUX_BUSINESS=1 SEP_LINUX_VISION=1 SEP_LINUX_FILE_UI=1
/opt/dsh-sep-cross-platform/runtime/bin/node exercise-desktop-continuation.mjs
```

`exercise` 在 umask077 下准备新空白实例；私有 Xorg 使用随机认证 cookie、动态显示号、禁用 TCP，使用同实例 FONTCONFIG_FILE；不是日常启动器。不能在私人原库执行本验证载具。

## 仍未认证

用户明确回复看不到 WSLg 选择器，因此本轮只认证**私有 Xorg 中真实 GTK 选择器**，不宣称真实用户 WSLg/物理桌面通过。实际鼠标拖动和托盘菜单、在线付费模型、私人库、二进制 PDF/Office/音视频解析、Linux 原生点击/判题后端、通用安装/自动更新、其他发行版/macOS，以及完整 Linux SEP/全应用强制截止仍未认证；固定标准未修改。尚未制作可替换 Windows 日常版的 Linux 包。
