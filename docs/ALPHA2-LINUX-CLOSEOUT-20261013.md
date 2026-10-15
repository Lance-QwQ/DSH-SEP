# Alpha.2 Linux 隔离版本收尾 — 2026-10-13

本轮交付是 **Ubuntu 24.04 x64 / WSL2 / ext4 的本地隔离预览**，内部构建标识 `alpha2-linux-closeout.3`。它完成了本范围的工程收尾，不代表完整 Linux 公开发布认证，也不代表所有官方 DSH 插件、其他发行版或物理桌面均已认证。Windows 日常版不变；未上传 GitHub。

## 固定版本与证据入口

- 官方 DSH：`0.2.1-alpha.2`，提交 `d743267388641bc76f17c45ce8b4c231aed1d32c`。
- SEP 冻结基线：`0.2.1-beta.3-alpha2-adapter.1`，444 个程序叶文件；官方桌面输入118个叶文件。没有给本轮制造新的公开 Beta/RC 版本。
- 源码基线：`1b310ef7aaffd526c8fe85a54942a98e4bfda1d4`。最终本地提交、源码检查点和恢复核验见输出目录 `FINAL-AUDIT.json`。
- 输出根：`D:\AIData\ProjectWork\DSH\alpha2-linux-closeout-20261013-r1`。
- 最新安装包：`DSH-SEP-Linux-x64-Alpha2-closeout.3.tar.gz`；`.1`、`.2` 是本轮历史候选，保留但不作为最新交付。
- 最新安装包 SHA-256：`13ef4f4ede2d910bdc9fd7ae24c1de1d201627a4bb0bada288d676f8bc780ea9`；程序 manifest SHA-256：`3f6aec892d5bfe6627722f63ad431a1717586e4c82e83a9f0891c0af649946f0`。这两者绑定本轮实际导出的 `.3`，不能用于历史 `.1`／`.2`。
- `VERIFICATION.json` 绑定最终 TAP、运行时源码、实际包清单、安装/桌面/点击/评测回执及导出文件 SHA-256。`source-checkpoint.bundle` 是源码恢复点；安装包是独立程序恢复点。生成物没有提交至源码 Git。

## 本轮完成的工作

1. **原生 Linux 评测启动。** 复用实际受信任 Entry 的握手、租约、关闭及重连协议，替换 Windows 路径验证并注入原生 Python 启动。绑定 Python、包内脚本清单、配置哈希、私有状态目录身份，派发前再次检查。没有在 Linux 内调用 `wsl.exe`。
2. **原生 AT-SPI 点击。** 复用实际点击消费者的幂等、串行化、取消和隔离协议；观察及动作限制在受信任控制方授权的进程出生身份及其子进程。只允许语义 `DoAction`，不猜坐标。原始派发接口不加入模型工具表。只读取有限标签，未获取密码值、描述或文本接口；未知结果禁止自动重试。
3. **独立首次安装。** 新程序、新数据目录分离；真实路径和父目录身份绑定，拒绝覆盖既有目录。校验候选、复制、逐文件及目录同步、发布、可靠提交记录、再开放启动；发布后中断可按同一计划恢复，不重置账本。它是本地首次安装器，不是在线更新器。
4. **默认桌面入口。** 包含 Node、Electron、必要字体及运行时。使用未改动的官方桌面 main，由独立启动器自动拉起宿主，连接经过认证的 loopback RPC。生命周期锁覆盖全程，重复启动拒绝；新启动旋转端点和令牌，旧连接失效。
5. **首次初始化恢复。** 中断留下的 `.preparing` 文件只在身份、权限和内容均匹配时继续发布；不同内容拒绝覆盖。保留已填凭据、消费记录和预留，不把设置/重启当作清零。
6. **启动组合明确化。** 关闭依赖不提供的原生 subprocess 服务的可选组件及产品遥测，避免悬挂条目或缺 `serviceVersion` 的配置警告。强隔离文件、Shell、MCP、委派由 Linux SEP 载具提供，不借用无保护服务。

## 验证结果及统计口径

| 证据 | 结果与范围 |
| --- | --- |
| 最终全量回归 | 189/189，通过，0失败、0取消、0跳过；23个测试文件 |
| 定义数对账 | 历史166 + 评测6 + 点击4 + 安装5 + 初始化6 + 桌面握手2 = 189；补跑不加入定义数 |
| 原生点击 | 9项实际私有 Xorg / AT-SPI 检查，覆盖真实单次派发、幂等、禁用/歧义/陈旧目标、外会话、异常隔离、退出 |
| 原生评测 | 3项：固定公开 Flask 负例的真实官方判题、关闭、同状态重连；负例应返回 fail/resolved=false，它不是模型解题成功证据 |
| 实际安装 | 最终整包首次安装、两轮无界面冷启动、重复启动拒绝、账本保留、旧连接失效、正常退出 |
| 默认 Electron | 最终安装包两轮默认入口，实际首次登录页截图、原生 WM_DELETE_WINDOW、Electron/宿主退出0、SEP关闭pass；无 renderer/preload 观察器注入 |
| 历史业务 UI | 上一阶段166项及两组私有 Xorg 案例共四次启动，已验证记忆/预算、图片/文本附件、系统选择器、历史及账本接续；保留原证据，不伪称本轮安装包再次覆盖全部界面 |
| 程序完整性 | 冻结 SEP444叶及桌面118叶不变，官方桌面 main 未改动；最终包52180项，33个明确列出的运行时文件 |

新安装没有凭据，默认展示官方首次登录／添加 API Key 页面是预期行为；这项不能替代登录后真实付费任务测试。安装后的冷启动包含完整程序哈希核验；实测耗时见回执，不能与不同场景、含清理的测试时间比较性能。

## 失败样本与修复归因

- `green-eval-r2` 的包输入核验误拒 pnpm 只读硬链接，已区分公开程序与私有配置；私有配置仍要求单链接。`native-evaluation-r1` 是缺少显式 catalog 字段的夹具错误，补齐后通过。
- 点击 r6/r7 无辅助功能窗口，归因为共享运行目录／辅助功能开关；最终使用专用 D-Bus 及显式开关。r8/r9 的动作名使用本地化文本，改用 AT-SPI `GetName` 的稳定名称；真实派发通过。双击不支持，未知回执按保守协议隔离。
- `green-install-r12` 是修改只读测试文件时触发 EACCES 的夹具错误。`profile-red-r17` 真实暴露初始化临时文件无法恢复，已修，保留4通过/2失败原日志。
- `desktop-debug-r22` 真实暴露启动器漏报 generation，已补齐并由实际官方 ManagedDesktopHost 正负对照钉住。同时修复重复 stop 清除已成功回执的问题。
- 后续 r27/r29/r30 未观察到窗口，是测试观察器只读取旧式 WM_NAME 的假阴性；诊断确认同 PID 的 mapped 窗口存在。读取 UTF-8 `_NET_WM_NAME` 并保持 PID/出生身份/唯一可见窗口条件后，两轮通过；未削弱实际点击插件授权。
- 补充 `controls-r4` 评测正例尝试返回 EVAL_ARTIFACT。固定公开快照只有 negative 工件，没有 positive；保留失败日志，默认载具恢复为明确的负例验证。没有据此宣称已完成原生正例或同次真实在线模型闭环。
- 最新候选的 r33 已完成两次启动及正常退出，但测试末尾强制读取不存在的 stderr 文件而失败：启动器仅在有 stderr 字节时创建该文件。验证脚本现将仅 ENOENT 解释为零字节，其他读取错误仍拒绝，并保存明确的 `HOST-STDERR.log`；r36 重新实际安装验证，不将 r33 改为通过。
- `.2` 的 r37 真实暴露浏览器组合缺陷：宿主已关闭终端／Job 服务，`ui-sidebar-terminal`、`ui-jobs` 仍参与 Web 启动，导致缺 `webTerminals`／`jobs`，出现 unavailable 弹窗。r39 固化为5通过/1失败；`.3` 同步关闭这些前端及 Open In 页面。最终默认桌面探针等待客户端初始化，并检查 Electron 日志无 Web boot/backend failure，再验证原生关闭，不能只凭短暂出现主窗口判定成功。

最终资源审计只覆盖本轮专用发行版中可识别的当前用户 Node、Electron、Python、沙箱、Xorg 和辅助功能服务，不是全系统零句柄证明。最终正常桌面退出与随后显式停止私有 Xorg 分别记录；点击用例显式停止自有辅助功能进程组。r6/r7 的两个历史总线残留由后续逐 PID/UID/命令/出生身份核验后 SIGTERM 清理（122/511、267/4798）。这不能倒推历史失败样本当场已经正常清理。r22等失败桌面也保留测试清理归因。

## 使用限制与未认证项

受控项目上限1024项、合计32MiB、单文件4MiB；普通工具截止最长10秒，输入16KiB、输出合计64KiB。文件修改停留在工作副本，提交/恢复只对受信任控制方开放。原始导入目录保留；外部同用户任意代码、内核漏洞、磁盘/内存配额未纳入已验证保证。

默认关闭评测、点击、静态上下文与自动捕获，需控制方准备相应固定输入及授权；记忆回忆、预算和显式附件仍可用。产品遥测关闭；原生终端、Job控制页、PTC、Open In、workspace-changes/deliverables 不在此预览的支持组合。Linux关闭最后一个窗口会退出，不移植 Windows 托盘后台契约。

完整公开认证仍 blocked：公网候选下载→原生确认→自动安装同次正例；同一完整 Profile 内评测组合；原生评测正例；物理桌面/Wayland/其他发行版；实际拖动/托盘；付费模型；私人库首次纳管；全部第三方插件；全应用异常退出截止；OCR/音视频；macOS。现有固定验收标准没有被修改或降低。

## 复现与恢复

源码入口 `tools/alpha2-portable`。Windows 操作方使用 `run-closeout.ps1 -Tag <全新小写标签> -Tests (Get-ChildItem *.test.mjs | Select-Object -ExpandProperty Name)`；脚本固定生成至真实 D 盘，再传入独立 RC 发行版，拒绝覆盖已有归档。工作目录应是该源码目录。

Linux 单测环境：`SEP_PORTABLE_ROOT=/opt/dsh-sep-cross-platform/alpha2-portable-20261012-r1`，`SEP_BUNDLE_TEST_ROOT=<新的私有目录>`，`SEP_BWRAP_SHA256=e318903862396f96de3df57264e0158682b952fd3fb53ac23d876413e7b30f71`。执行 Node `--test --test-concurrency=1 --test-timeout=45000 --test-reporter=tap *.test.mjs`。冻结输入需按清单预先准备；私有 Xorg/字体载具和评测 Docker 环境不等于在任意新机器免依赖复现。

`build-linux-payload.mjs` 只向新的 `/opt/dsh-sep-cross-platform/alpha2-portable-closeout-package-*` 构建，固定输入见程序清单；`exercise-installed-linux.mjs` 执行实际首次安装及两轮冷启动；`exercise-installed-desktop.mjs` 使用私有 Xorg 验证默认入口。`run-native-evaluation.mjs` 使用独立新评测状态，旧公开输入只读；固定输出日志在D盘。评测默认不安装 Docker、不拉新镜像、不调用付费模型。

安装请求格式、`.env` 模板、进程锁及安装中断恢复见包内 `README.md`（源码 `LINUX-PREVIEW-README.md`）。源码检查点经 `git bundle verify` 和真实恢复克隆逐字节核验；精确本地提交见输出 `FINAL-AUDIT.json`。不要用本轮 Linux 包替换 Windows 日常程序。
