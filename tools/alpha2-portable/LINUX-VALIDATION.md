# Alpha.2 Linux 实包补充验证 — 2026-10-13

本轮基线 `9dffba45e2be13d303e8c0cbc322e3b2ae7eb2b7`。输出根 `D:\AIData\ProjectWork\DSH\alpha2-linux-validation-20261013-r1`。仅在 D 盘后端的专用 Ubuntu24.04 x64 / WSL2 / ext4 环境执行；Windows 日常程序不切换，GitHub 不上传。

## 实际发现与修复

`.4` 交付压缩包经过 SHA-256 核对、重新解压及随包安装器首次安装。原生 WSLg Wayland 启动/关闭两轮通过，真实 Agent 退出检查两轮通过。

向实际宿主发送 SIGKILL 后，`.4` 启动器只等待 Electron，超过12秒仍未结束。本样本为 **fail**，随后测试以准确 PID/出生身份清理 Electron 与 Node 启动器；不是“当场已正常收尾”。新增 `waitForDesktop` 同时观察宿主、Electron 和外部关闭信号：意外宿主退出立即进入所属 Electron 清理；正常 RPC 先停止宿主的路径保留等待 Electron 的语义，并设5秒截止。没有自动重跑不确定业务操作，也没有借机扩大为一般进程管理框架。

针对性回归4个定义：真实宿主先退出、计划停止先完成、桌面迟迟不退出、正常桌面与信号分支。修复前0/4；修复后和既有生命周期一起10/10。最终全部204/204通过（历史200 + 新增4，0失败、0跳过）。实包重复运行单独记录，不加入这个定义数。

## 新候选的实包验证

候选 `alpha2-linux-closeout.5` 使用同一 DSH `0.2.1-alpha.2` 与冻结 SEP 基线 `0.2.1-beta.3-alpha2-adapter.1`；这是 Linux 派生包的 buildId，不是日常 SEP 升级。只改变启动器、生命周期助手、包内说明与构建标识，35个运行时文件通过清单绑定。

新压缩包导出后重新核对哈希、重新解压到另一全新输入目录，使用**新压缩包内**的安装器安装到空白程序/数据目录。`PACKAGE.json` 中历史构建目录不作为安装输入，明确采用实际解包目录。清单 SHA-256 为 `592f54bf131218984329ab06d98dba5908c67435244c45572af15c4f0b3d7ba3`；完整 tar SHA-256 见 `candidate-export.json` 和同名 `.sha256`。

以下证据均绑定该新安装，原始记录见 `VERIFICATION.json` 与 `evidence`：

- 两轮 WSLg 原生 Wayland：删除 DISPLAY/XAUTHORITY，设置 Wayland 会话，观察实际 xdg_toplevel 标题及 wl_buffer 提交；SIGTERM 后所属 Electron 与启动器退出。仅覆盖启动、协议表面及关闭，不冒充真实拖动、系统文件选择器或 Wayland 点击认证。
- 两轮真实宿主 SIGKILL：意外退出被分类，启动器返回非零/blocked，所属 Electron 收尾；第二轮重新启动同一安装。测试没有再杀 Electron/启动器。具体故障后收尾时间保留在每轮 `settleAfterFaultMs` 中。
- 两轮私有 Xorg 默认 Electron 入口：不改 main、不注入 preload/renderer；实际系统窗口关闭后，SEP/宿主返回 pass，账本保持。截图已目视核对，空白安装显示官方首次登录／填写 Key 页面；本组认证针对该页面的默认启动及关闭，不扩大为登录后主页面的全部日常交互。原生窗口关闭和 SIGTERM 是不同路径。
- 两轮退出检查：通过安装后的真实宿主 IPC 和鉴权 RPC，运行真实 Agent，观察 `activeTasks` 为 false→true→false。唯一替代是测试专用合成 LLM 瀑布钩子，且明确追加到测试 Profile，完成后还原；不调用外部提供方、不支付模型费用。这是后端检查证据，不是运行中任务的 Electron 确认对话框认证。当前 Profile 不提供计划任务消费者；`scheduledTasks:false` 的固定分支不算计划任务正例。

## 资源与失败证据

新故障样本的测试断言通过，**不等于宿主优雅关闭通过**：SIGKILL 后缺少消费者收尾回执，因此保持 blocked/非零。观察到 Electron/启动器已退出和最终无可识别所属进程，是独立的资源观察，不能倒推所有文件句柄、外部操作或系统资源均已确认释放。私有 Xorg 由外层测试所有者显式停止。

测试搭建发生过两次独立错误：gzip stdin 首次漏 `-z`，以及首次私有 Xorg 调用遗漏 `SEP_PORTABLE_ROOT`。分别保留旧输入/场景目录，再使用新目录纠正。正常桌面首轮观察器另误读累计 stderr，将前两次故障注入产生的 `Desktop backend failed` 当作本轮错误，故当次测试 fail；核对后修正为仅读取当前启动新增字节，保留旧观察器和失败日志，再补跑两轮。这些不算软件故障，也不混入204项功能结果；既不删除旧错误，也不将旧失败改记 pass。旧 `.4` 软件故障及修复前/后日志、来源脚本均保留。

第一次最终资源审计开始时，上一个测试载具的 CLI 还未自然结束，因观察到其 shell/Node 两项进程而 fail。保留 `premature-audit-r22.log`，等待该载具自然返回后，在新目录重新审计；没有为取得零残留再杀这两个进程。最终审计结论仅适用于这个后续时间点。

## 未完成的范围

完整 Linux 公开认证仍为 **blocked**。真实物理 Linux 桌面、Wayland 交互/原生选择器/AT-SPI点击、活动任务的实际退出确认对话框、计划任务正例、公网自动更新、在线付费模型、私人库首次纳管、启动器自身 SIGKILL 恢复、全应用强制故障截止、原生评测正例与同宿主完整组合、所有插件运行功能及 macOS 都没有据此认证。原生点击9项和固定 Flask 负例3项仍是前一阶段的来源绑定证据，本轮未重跑这些完整外部场景。

此前审查报告中已明确保留的低优先项仍保留，不把本轮宿主崩溃修复等同于全部历史问题清零：文档 ENOENT 分类、MCP 500ms 退出等待异常、历史封存/默认用户脚本等见上一轮报告。

## 证据入口

`candidate-export.json` 绑定交付压缩包，`CANDIDATE-ARCHIVE-INPUT.json` 绑定实际重新解包，`VERIFICATION.json` 绑定候选运行时、204项测试源和实际运行回执，`FINAL-AUDIT.json` 绑定源码提交、Git checkpoint 与真实恢复克隆。源码及包均仅本地保存。本文件的成功结论以对应机器可核对回执为准，不把缺失结果视为通过。
