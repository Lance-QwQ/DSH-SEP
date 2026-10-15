# Alpha.2 Linux 认证推进 — 2026-10-13

范围：专用 Ubuntu24.04 x64 / WSL2 / ext4，空白合成库，私有 Xorg 与 WSLg 原生 Wayland。基线 `81e0f6d3243a0f508e20ee4396f139f19a7f8b35`。本轮推进启动器异常终止和运行中 Agent 的原生退出确认；**完整 Linux 公开认证仍 blocked**。Windows 日常版不切换，GitHub 不上传。

## 当前交付与历史区分

本轮最终候选为 `DSH-SEP-Linux-x64-Alpha2-closeout.7.tar.gz`，内部 buildId `alpha2-linux-closeout.7`；DSH 仍为 `0.2.1-alpha.2`，冻结 SEP 基线仍为 `0.2.1-beta.3-alpha2-adapter.1`。这是 Linux 派生候选的构建号，不是新的公开 Beta/RC。程序清单 SHA-256：`450eb8a6fe6c10e53b5233815136247f6b68fc9672fae40fbbf849c619fbbf97`；tar SHA-256：`838c4c797c01534721ba79c0dbfbd7a63898bfef1867cd3001902859da828e05`。

输出根 `D:\AIData\ProjectWork\DSH\alpha2-linux-certification-20261013-r1`。`candidate-final-export.json` 绑定最新 `.7`；`CANDIDATE-ARCHIVE-INPUT.json` 绑定它的实际重新解包；`VERIFICATION.json` 绑定源码/测试/实测；`FINAL-AUDIT.json` 和 `source-checkpoint.bundle` 绑定提交及恢复克隆。以这些机器回执为准，缺失回执不算通过。

`.5` 是上一轮交付，保留其证据与检查点。`.6` 是本轮历史初稿，仅完成209项回归与导出，之后发现清理期间应保留死亡 Node 的内核身份，**未作为本轮交付、未安装到日常版、未发布**。本目录旧 `candidate-export.json` 专门绑定 `.6`，不能当作最新候选入口。`.6` 及其导出记录保留，不改写为 `.7`。

## 复现、修复及七个新增定义

旧 `.5` 的外层 Python 只等待 Node 直接子进程。Node 遭 SIGKILL 后，实际桌面 Electron 及后代仍存活，而租约已经释放。实际故障样本 fail，记录了九个后代及随后准确 PID/出生身份的测试清理；没有把清理后的零残留当成故障当场已收尾。

修复将 Node 放入独立 session，外层 Python 保留租约并作为 subreaper 收养孤儿后代；按 session／收养血缘核对 UID 和出生身份，使用 pidfd 定向发信号。直接子进程退出后先 TERM，2秒后必要时 KILL；5秒仍不能确认则报告 blocked/`resourcesRetained:true` 并保留租约。它不按进程名称或全机进程组清理。

初稿还需补强两条边界：不能先回收死亡 Node 再扫描数字 session ID，因此用 `waitid(...WNOWAIT)` 留住身份，直到后代收尾确认再 wait/reap；内核不支持 pidfd 时必须先做能力检查，在启动任何有效载荷前拒绝。

新增七个定义分别覆盖 Node SIGKILL 后代收尾、顽固后代存在时租约保持、无关同用户进程不被终止、另建 session 的后代被收养收尾、正常退出的遗留后代、死亡 Node 的身份保留、pidfd 不可用时启动前拒绝。内核不可用用边界故障注入（ENOSYS）验证，不冒称实际旧内核测试；身份保留用真实 zombie/birth 状态验证，不冒称已经完成高速 PID 复用压力试验。

先红证据分别保留：旧实现初始0/3；五项完整用例对封存旧字节0/5；身份保留初稿5/6；能力检查初稿6/7。修复后最终**211/211定义通过，0失败、0跳过**（历史204 + 新增7）。中间209项和各次定向复验不重复加进211。

## 最终实包验证

最终 `.7` 导出后重新核对 tar 哈希、重新解包到新目录，使用**压缩包内**的安装器安装到另一空白程序/数据目录。没有直接把旧构建目录当作实际包验证，也没有在历史验收安装里替换文件。35个运行时文件、52,182项清单、官方桌面118叶输入及 SEP 冻结输入绑定核对。

六组各两轮，合计12次实际启动；这些重复次数不计入211个定义：

| 项目 | 状态 | 证据含义 |
| --- | --- | --- |
| Node 启动器 SIGKILL | pass | 旧问题在新包收尾，所属后代消失，外层回执仍 blocked/非零；同一安装随后可再启动。两轮均由程序自身强制收尾（forced:true），约2.1秒；无需测试强杀，不能称无强制的正常退出。 |
| 外层 Python SIGKILL | pass | 内核父死亡信号触发仍存活的 Node 收尾；本次空闲故障样本的 Node/Host 有正常关闭回执，所属进程退出，随后重启。被杀的 Python 没有回执，不能伪造一个。 |
| 活动 Agent 原生退出确认 | pass | 默认官方 Electron main、真实 Host/Agent/inspect IPC，实际 GTK 原生对话框；Escape取消后 Agent 继续运行，确认退出后任务取消、SEP/Host关闭 pass。没有替换 dialog、inspect、main或preload。 |
| 正常默认窗口关闭 | pass | 两次系统窗口关闭后宿主与桌面退出0，账本解析内容保持。空白安装仍为首次登录/填写 Key 页面，不扩大为已登录主页面所有交互。 |
| 宿主 SIGKILL | pass | 沿用上一轮的实际故障注入规则，新包再次分类失败并收尾所属桌面，第二轮可重新启动；故障关闭不是正常 pass 回执。 |
| WSLg 原生 Wayland | pass | DISPLAY未设置，实际 xdg_toplevel／wl_buffer 协议表面，启动关闭；不扩大为拖动、选择器、点击或物理桌面。 |

活动 Agent 由明确列入测试 Profile 的专用插件创建；仅 LLM 瀑布提供方为合成，仍走真实 Agent/预算/生命周期。截图中的窗口是默认首次登录页及实际退出提示，并非已经完成在线登录的主工作区。合成提供方不调用付费模型；测试插件结束后还原 Profile。取消后保持运行与接受后正常收尾有真实状态/回执断言，不靠固定布尔值判断。

测试输入说明勘误：`linux-quit-dialog-driver.py` 沿用了旧观察器头部的“No … global input injection”措辞，不能据此称本测试没有合成按键。实际使用经过 PID/出生身份复核的窗口焦点及**私有 Xorg 显示中的 XTest 键盘事件**，没有操作用户日常桌面。此处澄清实际方法，封存过的测试输入保持原字节。

## 资源归因和剩余认证项

最终资源审计只针对专用发行版、当前 UID、含本轮所属路径的可识别进程，不等于全系统零句柄或远端操作全部完成。旧 `.5` 故障需测试清理；新 `.7` 故障组无需测试强杀。私有 Xorg 由外层测试明确停止。Node 被杀后即使确认可观察后代已停止，操作和消费者优雅收尾仍可能未知，故保留 blocked。不同时间点的结论分别记录。

Node 死亡和外层死亡当前验证的是**空闲时故障**；两者同时强杀、全应用活锁／Node不退出、未知所有权导致的长期保留租约、活动任务中整套启动器死亡、高速PID复用压力、整机断电都没有被这些样本覆盖。原有 COW 发布/恢复的进程崩溃单测是互补证据，不能代替同一次整应用故障闭环。

物理 Linux 桌面、Wayland交互／系统选择器／AT-SPI点击、已登录主页面的退出交互、计划任务正例、公网自动更新、在线付费模型、私人库首次纳管、原生评测正例与同宿主完整组合、全部插件及 macOS 继续未认证。公网自动更新仍按用户此前“搁置”处理，未为取得正例绕过“不上传GitHub”的约定。旧低优先 ENOENT/MCP退出等待/历史脚本事项仍见上一轮记录。

## 实现依据

进程身份和收尾设计核对 [waitid/WNOWAIT](https://man7.org/linux/man-pages/man2/waitpid.2.html)、[pidfd](https://man7.org/linux/man-pages/man2/pidfd_open.2.html)、[subreaper](https://man7.org/linux/man-pages/man2/PR_SET_CHILD_SUBREAPER.2const.html) 与 [Python pidfd 信号接口](https://docs.python.org/3/library/signal.html#signal.pidfd_send_signal)。这些说明支撑机制解释，实际运行结论仍以本轮绑定的测试和日志为准。
