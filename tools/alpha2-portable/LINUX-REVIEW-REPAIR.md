# Alpha.2 Linux 审查核验与修复 — 2026-10-13

基线 `913336544a31521c20d178e4e1073ea838de860c`，范围 `tools/alpha2-portable`。本轮核对用户提供的 GROKBUILD 与 KIMICODE 报告，逐项复现后修复；不把静态审查的“未发现问题”扩大为完整平台认证。日常 Windows 程序未改动，未上传 GitHub。

## 四项中危的处理

| 发现 | 核验、修正与边界 |
| --- | --- |
| K1 context origin | 确认 tracked 输入为 `110c7409…`，冻结 Alpha.2 输入为 `32364ede…`。差异是三处 `session.header.cwd` 迁移到 `workingDirectory` 服务，不能仅称 Windows/Linux 变体。新增 `context-origin.mjs` 明确绑定两个完整 SHA、替换文本及准确次数，从仓库 tracked 字节精确重放到 Alpha.2 字节；未知输入仍拒绝。Windows companion 与冻结444叶原字节均保留。测试夹具也保存实际 tracked 输入，可独立重放，不依赖仓库外缺失字节。 |
| K2 Electron 收尾 | 旧实包 SIGTERM 后超过12秒仍未结束，确认宿主收尾后 Electron 未退出、启动器因此保持存活。实查 Electron 的 `launcher.lock` fd 列表为空，**没有复现 Electron 继承锁 fd**；不能沿用这一归因。wrapper 与 Node 保留全生命周期锁，Node spawn 不传入 Electron。补齐所属 Electron 的 TERM、2秒宽限、必要时 KILL及2秒确认；强制路径返回 blocked，不伪报正常退出。关闭 IPC 分类处理，参数拼写错误拒绝，锁错误仅返回有界 JSON。 |
| K3 continuation 退出检查 | 确认历史载具固定返回两个 false。按审查允许的文档方案补充明确声明；历史业务/UI通过不覆盖退出前活动／计划任务检查，旧回执不改写。实际启动器走 inspect IPC，但本轮仍没有把活跃任务退出提示认证为通过。 |
| K4 导出范围 | 确认原始 startsWith 条件不能排除点段。新增源/目标规范路径校验，拒绝点段、空段、反斜杠混用、控制字符、Windows ADS和设备名；实际写入前检查目标父目录真实路径，保持 wx 不覆盖。操作方工具仍只允许声明的两个根。 |

K1 的完整来源链：`bundle/host/context-preparation/index.mjs` SHA-256 `110c74099985b81caf70a285ecd9662a8f7ae0cf8902437ceb131fcbb4ceff29`；准确三次替换后 `32364edece8f70a972d784c051b6da256c2ab3cb074232be078fec551928a1de`；其后才应用 Linux parser 注入的原两项转换。file URL 派生哈希绑定实际安装路径，不能作为跨路径不变哈希使用。

## 额外修复及未扩大的范围

已修复受管工具的新文件路径：read 可以证明文件不存在并返回 `version:'absent'`，之后才能 write；edit 不存在文件返回 `FS_NOT_FOUND`。实际 COW、明确提交及源目录不变均有回归。锁诊断、未知参数和关闭 IPC 同时完成分类处理；共享传输脚本明确指定 `sep-rc`。

其他低优先项继续单独列明：文档副本的两个 ENOENT 分类、MCP 的500ms退出等待异常、历史事务封存脚本的较弱恢复契约、部分旧PS1依赖默认用户、旧重复启动测试探测缺少独立截止。它们没有在本轮被宣称全部修复。历史载具仅作为出处保留，当前包的明确35个运行时文件不含 `preview-desktop.mjs` 或操作方导出/封存脚本。

## 证据与口径

最终全量回归200个定义：历史189 + origin2 + 导出2 + 生命周期6 + 新建文件1。失败与补跑保留，不增加定义数。针对性先红包括 origin/export 0/4、lifecycle 0/6、profile 11/12；修复后分别4/4、6/6、12/12，最终全量另执行。

实包验证分开记录：一次全新安装、两轮无界面冷启动；两轮默认 Electron 原生窗口关闭；同一安装连续两轮“启动→SIGTERM→退出”，第二轮验证首轮退出后可重新启动。SIGTERM 的 Electron 终止方式独立记录，不能混称原生窗口关闭退出0。最终零可识别残留只针对本轮专用发行版及当前用户；旧失败样本需要的精确 PID/出生身份 SIGKILL 测试清理不倒推为当场正常退出。

原生点击9项和固定公开 Flask 负例评测3项沿用上一阶段按源码绑定的证据，本轮不伪称重新执行官方判题或新增正例。全量中相关单测正常复验。

输出根 `D:\AIData\ProjectWork\DSH\alpha2-linux-review-repair-20261013-r1`。候选 `DSH-SEP-Linux-x64-Alpha2-closeout.4.tar.gz`、`candidate-export.json`、`VERIFICATION.json`、`FINAL-AUDIT.json` 与 `source-checkpoint.bundle` 分别绑定实际包、回执、源码及恢复克隆。源码修复提交见最终审计，旧 `.3` 及其检查点保留。

认证范围仍限定 Ubuntu24.04 x64／WSL2／ext4／私有 Xorg。完整 Linux 公开认证仍 blocked；物理桌面、Wayland、公网自动更新、付费模型、私人库、原生评测正例、同宿主完整评测组合、全部插件、全应用强制失败截止及 macOS 等保持未认证。没有降低原固定标准。
