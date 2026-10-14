# Mac 项目工作流：现状、最小接线与验证缺口

日期：2026-10-14。只读评估；本文件没有修改产品、r44 签名包或 r46 诊断输入。
基准是当前 Alpha.2 Mac 集成候选；官方接口来自固定源码提交 `d743267388641bc76f17c45ce8b4c231aed1d32c`。
本文是后继实施建议，不是已完成声明。

## 1. 当前用户实际上能做什么

当前 `desktop/managed-broker/launch-full.mjs` 在每个 dataRoot 内固定创建 `project`，把它作为唯一逻辑 source；
`business/standalone.mjs` 经派生版本启动后只注册该 source。
`business/profile-plugin.mjs` 强制真实 agent 的会话 cwd 与 source 相同，独立受控副本位于业务域的 managed 目录。
模型的 read/write/edit 作用于受控副本；原始 source 不被 commit 改写。

| 用户动作 | 当前实现 | 当前判断 |
| --- | --- | --- |
| 从官方侧栏添加任意目录 | 官方 WorkspacePicker 与 registry API 存在 | 注册目录不等于受控导入；新目录的 agent 与唯一 source 不一致会被拒绝。不能宣称已支持任意项目 |
| 打开已有受控项目文件 | MacReadOnlyFiles 映射到当前受控视图 | 文件浏览、读取已有服务；其 UI writeText/editText 一律拒绝 |
| 模型修改文件 | Profile execute read/write/edit，观察回执、会话隔离、暂存 | 底层已实现；原生完整付费模型工作流未验证 |
| 审阅后提交 | 私有 controller.review/commit | 没有已挂载的用户项目审阅/确认入口 |
| 重启继续暂存工作 | plans/resume/discard，needsSelection | 有底层规则，没有用户选择界面；不能静默选最新计划 |
| 选择旧代恢复 | controller.restore → 新候选 → review → commit | 有底层能力；缺历史代列表与审阅入口 |
| 自动处理崩溃残留 | core recover + 原生操作锁 + 删除权威 | 仅能处理可证实状态；未知 native cleanup 仍 blocked，不自动清锁 |
| 把结果交回原目录 | 无对应业务入口 | commit 只发布受控 generation；原目录不变。导出/原位合并需要单独实现与授权 |

桌面 broker HTTP RPC 当前只接受 desktopStatus/startHost/desktopReady/desktopQuitInspection/stopHost。
不要把私有 controller 整体塞入该生命周期 RPC，也不能把 commit/restore 注册成模型工具。

## 2. 已有可复用接口及精确接缝

下面路径相对本源码根；名称是现有接口，并非建议中的新 API。

- `profile/controlled-files.mjs`：
  `createControlledFileProfile({project,source,authorize})` 返回 execute 与私有 controller。
  controller 有 status/current/plans/resume/review/commit/discard/restore/recover。
  review 只审阅当前 selected pendingPlan；commit 只接受精确单键 {planHash}，必须先 review，且等于选中计划。
  restore(generation) 产生待审候选，不立即替换当前代。
  withView 回调期间持有串行准入；回调内不能再调用排队的 controller 方法，否则可能自等。
- `transactions/transaction-store.mjs`：
  第一次打开按 source 身份及内容创建受控基线；导入 intent 持久化。
  plans 只列 ready 事务，带 kind/createdAt/expired/changes；计划 24 小时失效。
  review 返回变更元数据/计划哈希，不是完整文本 diff。
  commit 重新核验 generation/sequence、候选实际字节和删除依据后发布；仅最终 FULL 同步 SQLite 提交使 committed 生效。
  当前没有受信任的历史代枚举 API；UI 不能直接读 SQLite 代替它。
- `business/profile-layout.mjs` 及 media/document 派生：
  PROFILE/BOOTSTRAP/READY 精确绑定 source、业务域、程序路径与 helper。已有非空 Profile 不支持直接换 source。
  因此“更换工作区”不能仅改默认 cwd 或修改既有 PROFILE 文本。
- `business/readonly-files.mjs`：
  UI 路径解析受唯一 source 约束；只读视图可复用，不能为新增项目界面开放普通 fs 写入后门。
- `lifecycle/managed-project-lifecycle.mjs`：
  统一跟踪读写准入及有界 close；未知资源释放不能通过关闭/重开洗成 pass。
- `settings-ui/required.mjs`、`settings-ui/transport.mjs`：
  可复用“真实 Loader 激活 + 实际客户端注入 + 认证路由请求”的验证方法，不把首页 HTTP 200 当新项目面板已挂载。

官方 Alpha.2 接口：

- `apps/desktop/src/directory-picker.ts` 的 installDesktopDirectoryPicker 使用现窗口、mainFrame、app origin 绑定，再调用 showOpenDialog({openDirectory,createDirectory})；取消返回 null。
- `packages/client/ui-workspace/src/client/WorkspacePicker.tsx` 的 openDirectoryFlow/submit 调 createWorkspace({path})。
- `packages/api/workspace-controller/src/commands.ts` 的 WorkspaceCommands.create 只是 resolveByPath/create registry。
- `packages/api/workspace-controller/src/index.ts` 提供 Remote create/follow/rename/delete 等；delete 删除注册不删除目录或会话。
- `packages/api/workspace-controller/src/directory-picker.ts` 的 native/browse 是能力分支，不应在 native chooser 不可用时偷偷扩大为任意目录浏览。

这些官方接口说明可以复用选择器和列表外观；它们本身不提供 SEP 复制、计划确认或恢复授权。

## 3. 建议的最小实施顺序

### A. 先让当前固定项目可完成一次受控修改

新增小型项目管理 host controller 和客户端面板，保留现有数据布局。
建议新增独立 `project-workflow/` 模块；不要改冻结的 r44/r46 输入。

1. status/listPlans：只投影当前项目身份、当前代/序号、pending 状态和计划元数据，拒绝外来项目 ID。
2. select/resume 或 discard：重启后用户明确选择；选中前模型写入保持 SEP_MAC_RESTART_REVIEW_REQUIRED。
3. review：展示文件列表、创建/修改/恢复类型、旧新摘要、计划有效期限与“原文件夹不会被覆盖”。
4. 增加受信任的有界 diff 读取接缝：现 review 只给元数据，不能假装已有正文审阅。
   在同一串行准入内核验基线、候选与精确 planHash，再读取有大小限制的 UTF-8 片段；二进制/超限显示摘要与“不提供文本预览”。
   不向 renderer 返回受控目录物理路径；不要在 withView 回调内递归排队 controller API。
5. 点击“应用到受控工作区”：必须绑定本次显示的 project/generation/sequence/planHash 与短期用户操作票据。
   服务端记录已审阅计划；确认期间改变候选、项目、基础序号、过期或关闭均使票据失效。
   模型参数、普通工具或一个知道 planHash 的调用不能替用户完成确认。
6. 增加只读历史代列表，恢复按 restore → review → 用户确认 → commit，同样受删除权威约束。
7. 页面关闭/拒绝确认只撤销 UI 确认票据；不得悄悄丢弃已有候选。

这一步的缺口主要是用户授权桥、受限正文预览和历史列表，已有事务核心不必重做。

### B. 再接受控首次导入与项目选择

这不是单纯界面补按钮。最小可行版本建议“一次只有一个活动受控项目”，不同时在一个全局 FileSystem 服务中混装多个 source。

- 首次选择目录走官方当前窗口原生选择器；返回路径仅是待验证选择，不立即把它注册成可执行项目。
- 在受信任层 canonicalize、拒绝符号链接/别名及程序域/状态域交叠，再取得 source 身份与限额清单。
- 显示导入范围与副本位置；确认绑定导入清单。确认后重新读取并比较身份/内容，最后调用已有首次导入事务。
- 原目录保留。逻辑 source 与受控物理 generation 分离；不能让模型得到修改原目录的普通 fs/subprocess 能力。
- 只有受控基线及相应 P2/记忆/附件域成功启动，才向官方 workspaceRegistry 发布可用项目。
- 持久项目登记至少绑定 projectId、source 身份、受控域、导入来源和当前状态；启动时校验，不以任意 path 作为授权。
- 切换项目必须先关闭准入、等当前工作及直接子进程确认收尾，再启动另一独立项目上下文；unknown/blocked 不进行接管。
- 现有固定项目的数据与会话保留。不得把非空 PROFILE 的 source 改写成新选择路径。
- **预算边界须先设计清楚**：现在 budgetPath 与业务域同属一个 Profile。若简单为新项目换整个 dataRoot，会产生新账本，不能据此当旧消费清零。
  最小第一版可以只对“尚无业务数据的首次安装”开放目录选择；现有项目继续 A 的受控工作流。
  若需要多项目切换，则另引入明确共享的账本/设置服务与项目域映射，并验证原消费、预留和额度不因切换丢失。

原生 chooser 的 TCC/用户目录读取权限仍由系统决定；没有授权时显示拒绝或取消，不模拟授权。

### C. 导出交付与重新打开

- 新增“导出当前已提交版本到新目录”，目标必须不存在或是本次创建的精确空目录；预览目录/文件数/摘要后确认。
- 导出应校验选定已提交代、目标身份与计划哈希，失败保留可判定记录，不覆盖用户原始项目。
- “写回原目录”涉及外部写者、更改冲突和另一套恢复前提，不能复用 managed commit 的成功语义；暂不作为最小版默认入口。
- 导出产生的正文副本需明确登记保留/删除责任，不能遗漏在治理清单之外。
- 重开同一项目恢复原账本、设置、会话和候选；待选计划显示“继续审阅/丢弃”，不自动提交或不经确认回滚。
- 区分事务可恢复、用户选择旧代恢复、native cleanup 未确认三种状态。最后一种没有既成自动解除功能，应保留 blocked 与诊断。

## 4. 已实测底层与尚缺验证

以下仅引用既有日志，不把重复轮次加成更多独立定义，也不把它们外推成用户界面已完成：

| 证据 | 已覆盖 | 不代表 |
| --- | --- | --- |
| P2/transactions-r6/round-1..3.log，各 28/28 | 首次复制、观察/旧哈希、候选篡改、失效计划、互斥、独立恢复、删除后不复活、真实 SIGKILL 发布/首次导入窗口 | 完整桌面导入选择/确认；物理断电 |
| P2/profile-lifecycle-r10/round-1..3.log，各 31/31；system.txt 为 macOS 15.7.9 arm64 | 生命周期 13 + Profile 18：会话观察隔离、子任务只读、暂存合成、显式 review、重启选计划、恢复候选、有界收尾 | 新项目UI路由、任意目录切换或实际模型端到端 |
| P2/document-native-r33/RESULT.json，51/51（解析18+组合33） | 真实 Mac 核心、受控文档/附件/设置/两次冷启动和已装解析器 | 项目提交面板、原生选择器、付费模型、默认 context snapshot |
| P2/desktop/fixed-application-r45/SEAL.json（历史诊断） | 同一 r44 产品字节恢复绑定；原始失败可归因层级 | 完整桌面成功：hide 返回 false；本轮工作区未进入 DOM 操作，原始身份值未记录 |
| P2/workspace-native-r46/AUDIT.json | 同一 r44 产品，10 项诊断契约及 1 轮实际欢迎页→工作区、32×14 徽标、正常退出；捕获早期 appPath 为空及就绪后正确路径 | Finder/隐藏重开、物理输入、多轮整体桌面、项目提交面板；不补写 r45 缺失观测 |

P2 指本轮 D 盘证据根：
`D:\AIData\ProjectWork\DSH\alpha2-macos-package-20261014-r1`。
本次只读核对日志与源码，没有重新运行以上原生套件。
transactions-r6 的平台身份与完整输入绑定应沿用原阶段封存入口；不能仅凭文件夹名重造平台认证。

## 5. 后继固定验证点

1. 真实 Loader 激活项目 controller/客户端并验证认证与当前窗口范围；未认证、跨项目、子 frame、过期操作票据均不进入 commit。
2. 在新空白合成项目里完成 read → edit → UI diff → 用户确认 → committed；原目录字节不变，受控视图更新。
3. 确认等待期间模型新增编辑/候选外部变更/基础代改变，旧批准全部失效；取消不提交，重复提交不会重复发布。
4. 关闭后重开：未提交候选仍在，必须选择；账本余额、预留和会话累计额不变；旧窗口引用拒绝。
5. 恢复老代必须形成新计划；已删除正文不能经恢复/导入重新出现，缺失删除依据拒绝。
6. 选择器取消、源移动/删除、无权限、硬链接/符号链接、超量文件、导入途中取消/崩溃保留明确结果。
7. 若实现多项目：A/B 记忆、附件、会话与观察回执不串用；共享预算不因切换重置，切换期间任务不逃逸。
8. 导出到新目录的正例及目标被替换/非空/已有同名文件负例；不触碰原目录。
9. 正常退出、用户取消退出、未知 native 收尾分开记账；后续测试清理不倒推当时资源已释放。

真实原生目录选择交互、物理 AX/TCC、私人目录及付费模型在未实际执行前继续 not_run。
本清单不建议为了等待权限而关闭路径门禁，亦不建议重写已有事务核心。

