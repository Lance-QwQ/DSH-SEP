# Alpha.2 Linux 受控 Profile：本轮三步收尾

本轮完成 `cleanup_blocked` 受控恢复、原生宿主工具隔离接线、真实 Linux 桌面生命周期验证。仅面向 Linux x64 / WSL2 / ext4 / 当前用户独占的合成工作副本；不是 Linux 完整 SEP 发布认证，也不改变 Windows 日常版。

## 1. 已停止沙箱的受控恢复

沙箱在运行用户命令前由 bubblewrap 阻塞。控制器记录当前启动代次 boot ID、宿主 PID 命名空间、UID、进程组领队及命名空间 init 的 PID / 出生时间 / 命名空间 / `NSpid=1`，可靠写入 SQLite 后才释放派发屏障。无法记录身份时，用户命令不派发。

退出无法确认时保留正文副本，置为 `cleanup_blocked`，关闭业务准入。重启及普通 `recover()` 不能跳过活进程核验。受信任的本地控制器先 `reviewCleanup()`，确认原领队及 init 均已停止后产生绑定根身份、数据库代次和所有记录的计划哈希；`resolveCleanup({planHash})` 在删除前重新核对。存在活进程、PID 重用、读不到所有者、记录缺失、旧 schema、代次改变时拒绝；该恢复入口不会发送进程信号。

仅在事前证明它是命名空间 PID 1 后，才利用 Linux 的命名空间退出规则判断其成员已终止。依据：[Linux man-pages](https://man7.org/linux/man-pages/man7/pid_namespaces.7.html)、[Linux 6.18 内核实现](https://github.com/torvalds/linux/blob/v6.18/kernel/pid_namespace.c)。无关的不可读进程不会据此阻塞已经证实停止的命名空间。

可信本地 CLI（不要提供给模型）：

```sh
node cleanup-cli.mjs review /absolute/controller.json
node cleanup-cli.mjs resolve /absolute/controller.json <完整 planHash>
```

配置仅接受 `root` 和 `isolation`。后者包含经 SHA-256 固定的 bubblewrap 路径及哈希。先正常结束原所有者；此 CLI 不负责杀进程。没有足够身份依据时保持 blocked，不建议删除数据库或手动清掉锁。

## 2. 专用宿主工具接线

`linux-profile-plugin.mjs` 挂入真实 Alpha.2 Cordis / Loader / Tools / Agent；必须冷启动，拒绝现成的无限制 fs、subprocess、jobs、mcp 和同名工具。专用组合只开放 `read/write/edit/bash/mcp_call`，未拥有的工具在派发前拒绝。

- 文件读取、编辑、Shell 都经相同命名空间载具。只有私有工作副本可写；原始源目录、Windows 挂载、用户 Home、控制数据库及外网不可达。写入/编辑要求先前观察回执；Shell 可在副本创建新文件。
- 工具串行共享最新候选；普通工具成功不会发布。提交、恢复、清理能力仅属于可信控制器，不注册成模型工具。提交前重新校验基线、候选哈希/身份及事务代次。
- MCP 是每次启动的真实 stdio 子进程：initialize → initialized → tools/call，两个关联回复有长度上限。仅固定的本地 `/usr/bin/` 命令，网络关闭、工作副本只读。未认证任意 HTTP/SSE MCP 或桌面点击服务。
- 原生 SubagentRuntime + in-process provider 创建的一级子代理强制只读；不能通过子代理 Shell 写入。二级深度拒绝。测试使用合成模型，不产生费用。
- 取消保留此前候选并等待已启动沙箱收尾；卸载关闭准入、取消在途工具、等待队列。旧服务引用拒绝调用。重启检测到未提交候选时拒绝模型工具，可信方经 `plans()` 查看元数据，再 `resume({planHash})` 或逐项 `discard(planHash)`；恢复前验证所选候选，不能默默从旧基线继续。
- 原生 UI 文件浏览使用只读 facade，验证候选身份和文件 SHA；拒绝外来 target、路径越界、旧视图及全部写接口。文件 watch 暂未支持。它是可信 UI 只读访问，不是给模型开放宿主 fs。

普通宿主 Shell、自装插件任意代码、恶意同 UID 宿主进程、内核漏洞及磁盘/内存/PID 资源配额不在保护承诺内。不得与无限制宿主入口混用。现有 32 MiB / 1024 条 / 单文件 4 MiB / 深度 16 的合成载具限制仍有效。候选 24 小时失效后由显式 recover 清理；无常驻 TTL。历史代次尚无自动 GC。

## 3. Linux 真实桌面生命周期

使用官方 Alpha.2 编译后的 main、renderer 和资源（由已固定的 Windows Alpha.2 程序输入取得，JS 与资源为架构无关内容），配合真实 Linux Electron 44.0.0、Node 24.19.0、WSLg/X11。不是独立 Linux 从源码构建的分发包，也不等同于 Windows 当前 Electron 版本。

默认 main 只前置一个测试观察器 import；官方 renderer、认证 Connection、Profile boot 和真实宿主关闭实现未替换。外层连接控制器是本轮可信测试载具，实际启动并等待真实 Node 宿主退出。合成 `.env` 不能调用真实模型，宿主 fetch 限于 loopback。

可信测试宿主在 UI 首次连接前通过原生 WorkspaceRegistry 注册已经存在的受控合成源目录；不让首启流程另建普通宿主目录。检验界面可见、加载态消失、合成工作区已出现，并等待绘制、审阅截图 → 原生窗口 close 后隐藏、宿主保留 → 官方 activate 事件重新打开同一窗口 → app.quit → Electron 和宿主实际退出，二者退出码均须 0。重新打开由应用事件触发，未用鼠标点击系统托盘。Linux 没有 Windows 专有的首次关闭提示，不能把本轮当作该提示的确认认证。

桌面组合有明确禁用/等待服务：普通 jobs/subprocess、PTC、原生 bash/fs 工具、workspaceChanges、open-in-app、插件安装等未接线；生产遥测配置也未提供。完整业务功能和这些服务不是本轮 pass 的范围。截图、原始宿主诊断和清单保留在证据目录，不隐去其未激活状态。

## 验证与复现

最终回归为 **60 个测试定义：60 pass / 0 fail / 0 skipped**，由 41 个历史事务/隔离定义、8 个恢复定义、11 个真实宿主组合定义组成。最新结果及输入哈希见 `ALPHA2-LINUX-PROFILE-VERIFICATION.json`。真实桌面另列两轮，不计入 60 项；最终均使用 profile-final-r17 的同版源码，包含旧格式 running 记录缺失所有权时的拒绝修复。封存时逐文件核对全部测试输入和共用运行时代码，并验证实际桌面 118 个程序输入。红测与历史试验不从统计中抹去，也不混入最终通过计数。

在专用 WSL distro 的 ext4 路径中，设置：

```sh
export SEP_PORTABLE_ROOT=/absolute/frozen-alpha2-install
export SEP_BUNDLE_TEST_ROOT=/absolute/fresh-private-test-output
export SEP_BWRAP_SHA256=<固定 bubblewrap SHA-256>
umask 077
mkdir "$SEP_BUNDLE_TEST_ROOT"
node --test --test-concurrency=1 --test-reporter=tap \
  isolation.test.mjs transactions.test.mjs isolation-transactions.test.mjs \
  cleanup-recovery.test.mjs linux-profile.test.mjs
```

`SEP_OFFICIAL_HARNESS` 可显式指向固定 Alpha.2 安装；否则使用 `$SEP_PORTABLE_ROOT/host`。所有运行需要真实 Linux x64 / ext4 / 非 root 当前 UID，不能直接在 Windows/NTFS 回放。

桌面还需 `SEP_DESKTOP_INPUTS`（由 `export-linux-desktop.mjs` 输出的程序输入）及可用 WSLg。在新目录运行 `prepare-linux-desktop.mjs` 后运行 `run-linux-desktop.mjs`。历史 Electron / primary-runtime 路径目前在测试夹具中固定，复用其他机器需先显式核对并替换夹具路径，不能据此宣称通用安装器已完成。

证据说明：早期 desktop-validation-r6 的结果虽然记为 pass，但观察器当时允许不可见的加载页，不采作最终界面证据；r7 因测试器传错 activate 的 hasVisibleWindows 参数失败。profile-final-r9 两轮正常退出，但截图仍为 Loading settings，也不采作最终界面证据，首次导出的 linux-evidence 保留为历史。desktop-painted-r11 在观察器产生回执前退出，旧测试器未先保存退出状态，原因未定；后续通过不等于证明该异常已修复。r12 绘制后暴露默认工作区创建提示，现已通过预绑定既有受控目录解决。r13 两轮通过后，提交前旧格式 running 恢复红测发现缺口，已修复；最终采用 profile-final-r17 的完整回归、两轮绘制后截图及完整退出回执。linux-evidence-final 是提交前中间证据，最新为 linux-evidence-reviewed；所有旧文件保留原字节。

最终进程审计仅检查本 distro、当前 UID、本轮载具/工具/测试宿主/Electron 的可识别进程。故障注入的 blocked 样本在测试 finally 中终止精确沙箱进程组后才取得最终无残留；这不能倒推当时 blocked 的关闭已经释放资源。

恢复检查点的克隆必须显式使用 `git clone --no-checkout --config core.autocrlf=false <bundle> <新目录>` 后再 checkout，避免 Windows 全局 CRLF 转换破坏输入字节绑定。首次克隆曾因此哈希不符，原件保留；最终检查点为 `source-checkpoint-verified.bundle`，并实际验证所有同步文件的字节。该修订仅改变封存/复现脚本及说明，不改变已测运行时代码。

**仍未认证**：完整 Linux SEP 业务/受保护 Profile、真实私人库、付费模型、系统托盘鼠标/手动拖动、macOS、通用 Linux 安装器、公网更新安装完整正例、资源耗尽和断电。Windows 日常版保留原位，未推送 GitHub。
