# Alpha.2 Linux 原生 Wayland 交互补验 — 2026-10-14

本轮在专用 WSL2 Ubuntu 24.04 x64/ext4 中补充 **私有 headless Sway 1.9 / pixman / 禁用 XWayland** 的原生交互证据。固定 closeout.12 程序没有修改或重新打包；Windows 日常未切换，未上传 GitHub。完整 Linux 公开认证仍为 `blocked`。

## 结果与计数

原计划两轮 ASCII 图片场景 `actual-r24` 全通过。另列中文文件名补充两轮 `actual-r27` 全通过。每轮十个固定场景，共 **10 个场景定义、40 次成功场景执行**；另有 **3 个输入范围检查定义，3/3 通过**。这不是 43 个独立功能定义；历史 226 项未在本轮重跑，也不把失败尝试加入通过数。

每轮依次核验：

1. 原生 `xdg_shell` 表面、Electron PID、`window:null`，未设置 DISPLAY；
2. 原生指针进入实际欢迎页与主工作区；
3. 拖动 Sway 标准装饰标题栏，窗口实际移动 80×40 像素；
4. 原生输入并核对中文合成草稿；
5. compositor close 后官方 Electron 隐藏及 second-instance 重开，原 PID、宿主连接和草稿保留；
6. 真正 GTK 文件选择器取消，无图片或草稿；
7. 真正 GTK 选择合成 8×8 图片，浏览器实际预览；
8. 实际移除预览；
9. 活动 Agent 触发原生退出确认，取消后真实 RPC 仍报告 activeTasks；
10. 原生确认退出，Electron/启动器退出码 0、真实宿主收尾 receipt 为 pass。

成功四轮的 `testCleanup` 均为空。随后另行清理测试自有 compositor、输入客户端和 D-Bus，不能把这部分清理算成程序自身释放。图片仅选择、预览及移除，没有发送，不据此认证在线视觉或模型付费。隐藏重开使用官方 Electron second-instance 路径，未证明重复运行安装后的 start.sh 会自动激活窗口。

## 基线与证据

- 源码基线：`84d3e447a4713a234005685358456cc22c641289`。
- 固定包：`DSH-SEP-Linux-x64-Alpha2-closeout.12.tar.gz`。
- 包 SHA-256：`1708b8050c35471c930c6fc61d48289296609b64c7d2a431013eb299b7482f00`。
- manifest SHA-256：`1f087d0680ca3d0c1b13a38983d564b73c2a0e068b6ec1d9eb87fbc55ca5b196`。
- 实装程序：`/opt/dsh-sep-cross-platform/alpha2-portable-wayland-installed-r1/program`，使用冻结包自带安装器新建；数据全合成。
- 最终程序审计：47,246 个普通文件、52,183 项目录/链接/文件，逐项核验原 manifest；无新增程序文件。测试 Profile 注入已恢复。
- 本机证据：`D:\AIData\ProjectWork\DSH\alpha2-linux-wayland-20261014-r1`。
- `VERIFICATION.json` 绑定最终收集结果、原包、证据 tar、截图复核和日常入口哈希；`FINAL-AUDIT.json` 绑定提交与实际恢复克隆。

`RESULT.json` 的 `status:pass` 只指以上明确的主交互及范围检查；`notVerified.nativeAtspiActualGtkDialog:fail` 与 `fullLinuxPublicCertification:blocked` 同时保留。

## AT-SPI 未通过，不能由原生键鼠替代

`atspi-r16/r17/r25` 使用安装候选的原始 AT-SPI provider 对实际 Electron 原生 GTK 退出窗口尝试语义 Cancel/Quit，没有坐标降级、没有派发后重试，也没有放宽应用族属主验证。分别出现应用不可用、D-Bus UnknownMethod 和语义唯一目标断言失败；r25 的只读原生观察仅取得两个“DeepSeek Harness”窗口，未完成退出按钮语义点击。原始结果保持 fail，原因仍需针对实际应用的可访问性导出进一步定位，不能断言已证明是 SEP 或 GTK 单方缺陷。

此前 X11 合成原生 fixture 的 AT-SPI 通过证据独立保留，不能扩大为本次实际 Wayland 确认窗口已通过。对应功能继续 opt-in，不自动打开或改成坐标点击。

## 历史失败与夹具调整

- 初期依赖获取失败、缺动态库保留；最终 24 个 Ubuntu 包均核对 APT 元数据 SHA，再私有解包，没有 apt install 或包维护脚本。
- r7 调试端点 ID 大小写、r8 装饰坐标、r9 首字符、r13 composer 容器选择器等为测试夹具问题，原样保留。
- wtype 临时键位表与标准快捷键分别处理：持久 US 虚拟键盘负责快捷键，wtype 负责 Unicode 文本。曾尝试的 F24、键位表复位、焦点操作没有单独因果证明，不宣称它们各自修复 GTK。
- r14/r15/r20/r21/r23/r26 未得到图片预览。截图及协议证明“输入过程中窗口已经关闭”的早期判断不成立，撤回。最终采用真正可见的 GTK Open 按钮；ASCII r24 与直接 Unicode 路径 r27 各两轮完成预览。URI 输入 r26 仍保留失败。
- r17 测试私有无障碍服务派生进程持有日志管道，测试收尾等待曾无界；明确核验该测试进程命令行/私有环境后执行测试恢复。夹具后改用进程 exit 回执、管道销毁和有界等待。
- r18/r19 的私有无障碍总线启动/对象路径错误、r22 诊断模块环境遗漏、首个收集器把自身控制进程算作残留，均是夹具/审计错误，不记为产品修复。最终审计明确列出被排除的直接审计控制器身份。

最终零残留只覆盖专用发行版当前 UID 可识别的测试、AT-SPI 与 D-Bus 进程。历史 blocked 收尾可能依靠后续生产监督或测试恢复取得零残留；不倒推为当场正常退出通过。

## 仍未认证

真实物理桌面及 WSLg 外层鼠标、GNOME/KDE/门户后端、原生 AT-SPI 实际退出窗口、在线付费模型、私人首次纳管、公网自动安装正例、三监督全部被杀、macOS 均不因本轮通过。完整 Profile 与公开 Linux 准入不提升。没有以此替换 closeout.12 的历史报告、固定标准或安装包 README。

测试来源与复跑见 [REPRODUCTION.md](../tools/alpha2-portable/wayland-certification/REPRODUCTION.md)；输入客户端仅为本轮私有测试工具，不安装进 SEP。
