# Alpha.2 Linux SEP 业务核心组合（2026-10-12）

本轮在原有受控工作副本之上接入真实 SEP 业务服务。最终 **79 个定义全部通过，0 fail / 0 cancelled / 0 skipped**；相同运行时代码的真实 Linux Electron 桌面另做两轮，记忆/预算设置页及正常生命周期均通过。**完整 Linux SEP 认证仍为 blocked**，不能把本轮当作通用 Linux 安装包或 Windows 全功能等价认证。Windows 日常版及私人库未改动，没有上传 GitHub。

固定 DSH `0.2.1-alpha.2`（官方提交 `d743267388641bc76f17c45ce8b4c231aed1d32c`）；实际业务输入是已冻结的 `0.2.1-beta.3-alpha2-adapter.1` 包，逐叶验证 444 个文件，不是拿仓库 bundle.24 的旧源码冒充实际安装。新增 Linux 组合载具与这些输入分别绑定。源码基线为 `3d65de0d461749f87668ac86d9f3214fead68de5`；本轮没有制造新公共版本。

## 已接入及验证

| 能力 | 本轮有效范围 |
| --- | --- |
| RAG / BM25 | 索引、搜索只读取当前受控候选；Shell 改动后旧结果 stale，重建后读取新内容。原始源目录不被写回。 |
| 四层记忆 | L1 保持模型上下文；L2 项目/杂事；L3 习惯、个人事实及项目目标；L4 显式归档按需查询。真实三域 P2、存储和租约接续，重启后记忆及撤回记录保留。 |
| 自动召回 | 已确认习惯以“不可信记忆”快照进入真实 Agent 请求；关闭召回后下一次请求以空快照替换，不删除已有记录，也不会携带旧习惯。 |
| 自动捕获 / Mem0 | 默认关闭；显式启用的合成试验经过真实 Agent turn-stopping、事实提示、正文抽取及同一预算账本。只接收当前项目、当前会话本轮直接用户证据，拒绝另一会话的消息。生日保留月日精度。 |
| PinchBench / 子代理 | 经 `suite_delegate` 的子任务在启用 prework 时完成三个本地适配样本，再创建真实原生子 Agent；样本及子任务请求均进入同一账本。仍限制两个并发、一级深度、最多两次返工，子代理文件/Shell 只读。不能将这些约束推广至任意外部子任务入口。 |
| 会话预算 / P1 | 同一实际 Budget/P1 服务；默认会话上限 100 元、单任务上限 5 元及共享累计上限分别保留。设置 CAS 不清空已消费、预留或账本；本轮没有调用付费模型，费用数值是合成 usage 的本地上界估算。 |
| 本地文档抽取 | 中文路径 Markdown 已通过，模型调用数为 0；沿用现有有界解析器。PDF/DOCX 解析未在本轮重新逐类型验证；不宣称支持音视频理解。 |
| 历史展开 | 当前直接用户请求门禁、父会话准入及子代理拒绝已验证；本轮未完成真实压缩原文的逐段展开正例。 |
| 原生压缩控制 | 专用桌面夹具显式选择一个根级 compaction-basic 所有者，计划激活及退出恢复通过。官方 web-app 通常将压缩移入 agent presets；四种 preset 的接管及真实压缩解题未认证。 |
| 设置与桌面 | 实际 Alpha.2 main/renderer、Connection、Profile boot；记忆页显示合成项目，预算页显示 100 元；关闭后隐藏且宿主保留、activate 重开同一窗口、正常退出时 Electron/宿主均退出码 0。两轮均未强杀清理。 |

`linux-snapshot-scope.mjs` 提供专用 Scope 文件视图：逻辑项目键保持稳定，文件身份、SHA 和读前后校验使用当前候选的真实本地文件。所有受管业务访问与 Shell 共用串行队列，读取期间固定视图。没有把全局宿主 fs 放宽为可写，也没有移除 POSIX 保护拒绝后直接开放 Shell。

新增 `linux-sep-runtime.mjs` 复用实际包的 P2、Store、Budget、P1 和 settings-consumers。未激活、错误计划、账本/代次变化、关闭后的旧引用及外来工具在派发前拒绝。只有确属本组合的 `suite_*` 定义可取得载具授权；同名风格不能取得权限。提交、恢复、清理仍只属于可信控制器，模型工具不能自动发布候选。该控制器同进程能力不是对恶意宿主插件或同 UID 原生代码的隔离承诺。

## 本轮修复与历史样本

- 实际子代理曾超时：父 `suite_delegate` 在等待子任务时占住候选队列，子 Agent 的自动召回又等待同一队列，形成循环等待。现将异步委派等待移出外层候选访问，仅实际存储/文件操作取得访问权；真实子任务、启用 prework 的子任务及最终组合回归通过。旧超时日志保留。那次进程由原有 P1 截止收尾；后续定位时未向已停止进程发送信号。
- 设置插件最初被旧 peer 范围停用。仅在隔离候选复制插件并调整 manifest，所有实现 JS 保持原字节。invariants 因 Alpha.2 仍保留 rc.2 包版本，显式允许 `0.2.0-rc.2 || 0.2.1-alpha.2`；其他 DSH peer 与实际安装绑定，未用通配符绕过版本检查。早期后台通过不能充当设置 UI 证据。
- 原生压缩接线曾遇到服务未声明注入、Loader 的本地 ID/完整 ID 混用、根入口被官方 preset 配置停用。分别改为显式服务取得、完整 entry ID 和夹具的根级所有者选择。它不是所有 preset 的通用修复结论。
- 两次 UI 探针未找到控件：菜单尚未展开、Settings 文本附带 Ctrl 快捷键。修正的是合成探针定位；最终页面和截图另外验证，未把探针失败归因于产品不稳定。
- 自动召回新增试验的两次失败分别是把 candidate 当成 confirmed、把“关闭后用空快照替换”错断言为“无快照”。前提及断言纠正后原记录保留；没有修改生产记忆策略以迁就测试。

最终 79 = 历史事务/隔离 41 + 清理恢复 8 + 原生 Profile 11 + 本轮业务 19。早期 72 / 78 项与新增单文件试验只作为历史记录，不叠加为独立验收数量。真实桌面两轮单列。最终证据源为 `alpha2-portable-full-final-r30`，封存器在另一个新目录核对全部运行时代码字节后导出；它没有修改已测阶段。封存控制器自身哈希单独记录。旧失败样本、早期仅后台通过的结果和历史 Profile 报告均保留。

最终资源审计只检查本专用 distro、当前 UID、可识别的本轮沙箱/测试/宿主/Electron。故障注入的 blocked 恢复样本在 finally 精确清理后才取得零残留；模型非合作样本在显式释放后才收尾；早期启动失败由测试器清理自有进程。不能用最终审计倒推它们当时已释放资源。

## 尚缺的完整 Linux 适配

| 项目 | 当前状态 / 后续工作 |
| --- | --- |
| 文档删除及不复活治理 | `suite_document_delete` 明确拒绝；需要 Linux 受控候选删除、三域排除依据、旧代次恢复与正文副本清理的联合事务。不能直接启用 Windows source adapter。 |
| Computer use 点击 | Windows 后端不在 Linux 接线；需选择 Linux 实际桌面提供方并重新验证窗口新鲜性、语义定位和未知结果隔离。普通 stdio MCP 通过不代表点击通过。 |
| SWE-bench / 判题启动器 | 现有入口依赖 Windows→WSL；Linux 本机受信后端的启动、租约、重连和有界收尾尚未接线。 |
| 视觉及附件治理 | 本组合拒绝 vision 配置；本机附件域、图像原生依赖、授权上传和删除治理仍待适配。合成文本模型不构成视觉认证。 |
| 安全变更 / 完整原生工具 | 受控副本、观察回执、哈希确认、代次提交/恢复已继承；原生 jobs、PTC、插件安装及部分 UI 依赖仍禁用或 pending，不能声称官方工具无差别可用。 |
| 发布与更新 | 通用 Linux 安装器、长期启动服务、更新兼容扫描/自动安装和公网完整正例未认证；只交付工程载具与源码检查点。 |
| 其他环境 | 私人旧库、付费模型、其他发行版/架构、系统托盘鼠标输入/手动拖动、资源耗尽/断电、macOS 均未据本轮扩展为通过。 |

显式 userProfile 的合成个人事实已验证落入 user 范围；多项目共享、初始化失败清理及强制应用退出仍未认证。提交前红测复现了原先静默忽略 userProfile 的接线缺口，补齐 Scope 参数后回归通过，红测保留。初版 linux-evidence（78 项）作为历史，最新为 linux-evidence-reviewed（79 项）。

下一阶段先接入文档删除的 Linux 事务适配及删除后恢复负例，再推进附件与平台服务，最后做完整安装/更新及私人库认证。当前未完成部分继续关闭，不降低原验收标准。

## 复现与证据入口

源文件位于仓库 `tools/alpha2-portable`，复用同目录 `PROFILE.md` / `TRANSACTIONS.md` 的固定载具契约。需要专用 Linux x64/ext4、当前用户独占 0700 数据根、已核验的真实 Bubblewrap、冻结 Alpha.2 安装和 WSLg；不是直接在 NTFS 回放。

```sh
export SEP_PORTABLE_ROOT=/absolute/frozen-alpha2-install
export SEP_BUNDLE_TEST_ROOT=/absolute/fresh-synthetic-output
export SEP_BWRAP_SHA256=<核验后的二进制 SHA-256>
umask 077
mkdir "$SEP_BUNDLE_TEST_ROOT"
node --test --test-timeout=45000 --test-concurrency=1 --test-reporter=tap \
  isolation.test.mjs transactions.test.mjs isolation-transactions.test.mjs \
  cleanup-recovery.test.mjs linux-profile.test.mjs linux-sep.test.mjs
```

真实桌面在两个独立新目录分别设置 `SEP_LINUX_BUSINESS=1`，执行 `prepare-linux-sep-desktop.mjs` 和 `run-linux-desktop.mjs`。桌面输入、Electron 44.0.0 / Node 24.19.0 / primary-runtime 路径仍为固定工程夹具；换机器需显式适配并验证，不能删除校验后称作通用安装。

Windows 输出根：`D:\AIData\ProjectWork\DSH\alpha2-linux-full-sep-20261012-r1`。`linux-evidence-reviewed/RESULT.json` 绑定源码、TAP、两轮桌面截图/原始日志及候选输入；仓库内同字节索引为 `docs/ALPHA2-LINUX-SEP-CORE-VERIFICATION.json`。本轮源码恢复包为该输出根中的 `source-checkpoint.bundle`，克隆使用 `--config core.autocrlf=false` 并按 `FINAL-AUDIT.json` 逐文件核对。
