> bundle.21 / 第2步：专用应用退出桥及8项实际子进程退出/重启回归通过；338项本阶段新鲜检查，340项累计定义。强制退出仍blocked，后续所有权检查与最终零残留另行归因。原生桌面菜单/IPC接线待第4/5步，日常版/GitHub不变。见 [阶段报告](BUNDLE-APPLICATION-SHUTDOWN.md)。以下历史原字节保留。

> bundle.20 / 第1步：初始化失败有界回执、根实例关闭围栏、明确重新挂载及注册失败回滚已在所述合成范围复核，332项通过。整应用退出和其余八步未完成；深路径Python消费者问题登记待第3步修复。见 [本阶段](BUNDLE-INITIALIZATION.md)。以下历史原字节保留。

> bundle.19 补验：官方浏览器自动激活、原生 SettingsRoot 三个 SEP 页、实际设置保存/刷新/重连/卸载及加载失败负例已通过。17项本轮检查，累计324个固定定义；运行包仍bundle.18，默认pending。完整应用/GUI安装未认证；日常版/GitHub不变。见 [补验报告](BUNDLE-NATIVE-BROWSER.md)。以下旧文原字节保留。

> bundle.18 当前补充：显式原生设置 Loader 入口已接入，验证官方模块发现/资源服务与真实 HTTP BrowserAuth；完整浏览器自动激活和 GUI 仓库链接安装仍待下一阶段。默认 pending，日常版和 GitHub不变。见 [本阶段报告](BUNDLE-NATIVE-SETTINGS.md)。以下旧阶段原文保留。

> bundle.17 当前补充：固定 alpha.1 宿主33项peer精确声明与实际pnpm peers check已通过；305个固定定义（原296+新增9）通过。此结论限dependency-resolution和已有片段回归，不代表完整运行兼容。默认准入仍pending；原生客户端发现、BrowserAuth及剩余消费者继续推进。日常版/GitHub未变更。见 [本阶段报告](BUNDLE-HOST-DEPENDENCIES.md)。以下旧阶段原文保留。

> 当前补充：bundle.16 对 bundle.15 审查发现进行隔离修复，见 [审查修正](BUNDLE-SETTINGS-REVIEW.md) 与 [逐项响应](BUNDLE15-REVIEW-RESPONSE.md)。此前封存结论不回写；完整阶段四和默认准入仍 blocked。本候选未部署、未发布。

> 当前补充：bundle.15 已验证显式受控冷启动根入口、记忆/预算设置桥接和原设置工厂的隔离浏览器读写。默认仓库准入仍 pending，完整阶段四仍 blocked。实际 Loader 启停与有界 blocked 回执已验证；不包含热替换、完整桌面安装、BrowserAuth、付费提取、媒体和私人资料。详见 [设置与受控根入口报告](BUNDLE-SETTINGS-INSTALLATION.md)。


当前补充为 bundle.14 的显式 `dsh-sep-bundle/business-runtime` 共享消费者冷启动片段：RAG、四层记忆操作、自动召回和记忆上下文退休复用同一 P2、三域存储与 P1 账本。付费自动提取、媒体、完整设置页/根入口、Git URL GUI 生命周期与跨平台认证尚未接入；阶段四整体仍 blocked。详见 [共享业务消费者](BUNDLE-BUSINESS-RUNTIME.md)。旧阶段记录按当时范围保留。

当前补充为 bundle.13 的显式 `dsh-sep-bundle/p1-runtime` 冷启动片段：复用既有 V3 账本，结合受保护 Profile、P1 与实际原生压缩行，返回有界关闭回执。两任务并发、超时、只读和统一收尾仅针对 `suite_delegate` 创建的任务；Profile 模型及预算拦截单独适用于模型调用。完整 SEP 业务、设置页与 Git URL GUI 安装仍 blocked。详见 [P1 运行片段](BUNDLE-P1-RUNTIME.md)；旧阶段记录按当时范围保留。
# 仓库组合包安装：阶段与固定验收

当前公开版本：SEP 0.2.1-beta.2，DSH 0.2.0-rc.2，Windows x64。
当前本地组合包候选：`dsh-sep-bundle@0.2.1-beta.3-bundle.12`。
候选版本与当前公开版本不同；本文件不声明已发布或部署。

## 工作顺序

1. 根入口：官方安装器识别 bundle，真实 Loader 能加载入口，原宿主行保留。
2. 独立依赖：脱离源码工作区和既有缓存可安装，运行产物完整，许可齐全。
3. 通用配置：无私人路径/项目 ID，既有账本和资料不被初始化覆盖，不照搬日常压缩参数。
4. 宿主适配：逐项核验服务、事件和生命周期；不足时明确阻断业务，不静默削弱保护。
5. 实包回归：官方 GUI 仓库链接安装、启用、重启、升级、禁用、卸载，以及失败/取消路径。
6. 分发：复核最终源码和产物，更新文档，形成新的 Beta 发布候选。

每阶段实施后独立复核，再进入下一阶段。后续阶段未完成不能以入口验收替代。
验收状态使用 `pass/fail/blocked/not_run`；范围限制单独记录。

## 不变约束

- 不自动修改或替换官方宿主文件；必要适配生成文件清单、备份和指纹计划。
- 不自动采用未知版本，不通过用户风险确认豁免完整性与数据保护。
- 不纳管未知私人旧库，不清零预算，不删除用户插件、凭据或会话。
- 不先禁用原生压缩再等待增强入口；切换必须成组验证，卸载须恢复原入口。
- 新测试安装、缓存和产物在 `D:\AIData\ProjectWork\DSH`；当前日常程序保持原位。

阶段一入口公开业务状态为 `pending`，其业务开关固定为关闭。
阶段二至六的固定标准不因阶段一通过而降低。

## 当前阶段记录（历史证据保持原样）

| 阶段 | 状态 | 证据与解释 |
|---|---|---|
| 1 根入口 | pass | BUNDLE-ENTRY-VERIFICATION.json 为历史 bundle.1 固定记录；阶段二重新运行其三项行为 |
| 2 独立依赖 | pass | BUNDLE-MODULES-VERIFICATION.json；最终实包、独立审核与准入复验通过，业务仍 pending |
| 3 通用配置 | pass | BUNDLE-CONFIGURATION-VERIFICATION.json；严格配置意图、只读账本审阅与三处注释脱敏通过；真实宿主绑定仍在阶段四 |
| 4 宿主适配 | blocked | 部分官方 alpha.1 接口与只读 V4 审阅已验证；文件恢复保护、实时持久化/生命周期及前端尚未完成，业务准入继续阻断。见 BUNDLE-HOST-ADAPTATION.md |
| 5 实包 GUI 回归 | not_run | 尚未通过官方 GUI 从远端仓库安装与全生命周期验证 |
| 6 分发 | not_run | 不上传、不部署；既有 Beta.2 保留 |

阶段二取材于已发布 Beta.2 程序图的十个 SEP 组件，而不是复制完整 DSH。两处组件之间的导入改为相对路径；其它可执行代码保持原字节。第三方直接依赖固定为六个公开版本，记录实际安装锁以绑定本轮传递依赖；库安装不能保证未来所有传递依赖解析永远不变。

本轮固定检查由构建行为 8 项、预构建内容/解析/准入状态 5 项、实包组件运行 8 项组成。独立消费安装重复了前述 5 项，不能把两次执行合计当作新增场景。另有阶段一的三项官方准入回归。完整后端、实际前端注册、真实模型与 Windows MCP 不在本阶段已验证范围。

## 阶段三收尾范围

先对阶段二 checkpoint `a9618aec6778a047a492cc15424ec5c87cd5a541` 重新认证：13 项实包、8 项构建、3 项官方准入回归与 403 个提交文件哈希通过，随后才开始本阶段。认证采用已记录缓存的离线复用，没有宣称第二次冷安装；旧证据文件保留原字节。

阶段三新增通用配置模板/JSON Schema、纯配置意图入口与只读既有账本审阅入口。默认共享 100 元、会话默认 100 元、单轮 5 元，作用范围分开。原账本的消费、预留、未知结果、更正、各项额度和修订号不被配置覆盖。旧版账本保持原代次，缺失或损坏拒绝审阅；本阶段不创建新账本或隐式迁移。

项目 ID、资料作用域与生命周期时间、存储根、凭据引用和外部运行器须经宿主明确绑定；该绑定及原生设置控件尚未验证。配置 enabled=true 仍只记录意图，业务为 pending；不凭配置绕过阶段四。压缩参数沿用原生用户配置，本阶段不替换压缩引擎。前端仅清理三条 CSS 区域注释的构建路径，非注释字节与行数保留；两处导入改写仍独立记录。

最终固定检查为 23 项实包配置/组件、9 项构建、4 项官方准入，共 36 项，其中 24 项沿用前阶段行为，12 项为本阶段增加。独立产物复核另有 9 个检查条目，不能当作新增模型或 GUI 场景。398 个包内普通文件核对通过；包括 381 个原组件文件的明确转换与许可补充。pnpm 仅省略根 package.json 末尾一个 LF，清单语义另行核对。

下一阶段集中核验官方宿主服务、事件、存储/账本/项目绑定、生命周期及前端入口。尚不能宣称完整 SEP 已可从 GitHub 链接安装；远端克隆与官方 GUI 生命周期仍在阶段五。本轮不改日常版，不发布 GitHub，现有 Beta.2 保留。


## 阶段四当前进度（部分验证，非完整通过）

阶段三 checkpoint b59df80cbca1fe52deedf37e4311718db5582f33 再认证通过：36 项检查、409 个提交文件和 bundle.3 原包指纹保持；日常版未变。随后使用官方发布 tag `dsh-v0.2.1-alpha.1`、提交 5badb15009ae1756c3afe0ae0cef1faafc290ccc 与实际 npm 发布组件开始阶段四。

确认了原生记忆表面替换、RAG 五段身份与硬链接拒绝、P2 三域写入/重开、未知旧库拒绝、工具令牌/取消、压缩子类、合成 LLM 预算拦截和设置路由的接口行为。另新增只读 V4 审阅候选；它不代表已接入实时保存与恢复。确认的失败前提和未验证项分别列在阶段四报告，不能以阻断用例通过宣称完整业务通过。准备阶段不自动发布或切换日常版。

## 阶段四实时 Session 子阶段

本轮新增 bundle.5 的显式自有实时提供方，当前 V4 的持久化、冷读与父前缀证明见 [Session 子阶段报告](BUNDLE-SESSION-PERSISTENCE.md)。bundle.4 的官方默认恢复阻断证据保留，并不修改其历史结论。根准入仍 pending；文件保护、恢复权威、Profile/前端与完整业务未完成，完整阶段四仍 blocked。

## 阶段四文件保护核心子阶段

先重新认证 bundle.5 检查点 5eb86133c00a7752b9480079e35545d1a72bd949，427 个提交文件和 78 项前置回归通过，旧日志不覆盖。bundle.6 增加显式自有文件提供方和本地项目权威，见 [核心子阶段报告](BUNDLE-FILE-PROTECTION.md)。官方默认文件服务、Session 子阶段原证据、日常/公开 Beta.2 保持。

真实文件保护与权威核心范围通过；同元数据正文变化的严格观察、工具消费者/Profile/前端及完整文件适配仍 blocked/not_run。固定验收标准不变，不以局部通过宣称完整阶段四完成。

## 阶段四正文观察补充（bundle.7）

bundle.6 检查点与 104 项既有定义重新认证通过，旧记录和包保持原字节。bundle.7 增加受保护提供方的有界完整正文观察与句柄内写预检，22 个新增定义与 104 个既有定义通过；同元数据正文变化拒绝、无观察拒绝、同版本不同正文的保守歧义、完整/中断流、容量、取消和读取收尾均有固定输入证据。

原生版本/RAG 五段格式不改变，原生默认文件提供方不修改。无版本守卫的显式 API 仍是有前镜像的无条件变更，不宣称正文陈旧保护；后续工具/Profile 组合必须保留原未读策略。该核心范围 pass，不代表完整阶段四。完整 Agent/工具/Sandbox/Profile/浏览器设置与真实 GUI 仍 blocked/not_run；不部署日常、不上传 GitHub。新报告 BUNDLE-CONTENT-OBSERVATION.md 和 BUNDLE-CONTENT-VERIFICATION.json 区分本轮与 bundle.6 历史证据。

## 阶段四标准文本文件工具组合（bundle.8）

先重新认证 bundle.7 检查点 8332c80f534c7d105ff73634f7303ed2396dea9d、438 个提交文件和 126 项既有定义，再开始本次消费者组合。新增 22 项固定定义，既有 126 项重新通过，合计 148；重复执行不累计新场景。标准 read/write/edit、真实 Session 观察、Sandbox 拒绝、后提交凭据、组件回滚/卸载与官方 Loader 单项配置的所述 Windows 合成范围 pass。见 [本轮报告](BUNDLE-FILE-CONSUMERS.md) 和 BUNDLE-CONSUMERS-VERIFICATION.json。

这只是显式文件工具片段，未认证完整 Profile 替换、read_image/附件、其他工具消费者、私人根、浏览器与 GUI。整体阶段四仍 blocked、根业务 pending；阶段五/六仍 not_run。原标准、历史记录和日常/公开 Beta.2 保持；没有上传或部署。

## 阶段四项目与Session接续绑定（bundle.9）

先重新核对bundle.8检查点的442个提交文件、实际包和日志，148项既有定义再通过。当前候选为bundle.9；显式sepProjectBinding的review/confirm/reviewSession，固定Windows x64本地NTFS范围pass，完整阶段四仍blocked，根业务pending。

21项新增检查覆盖明确路径与身份、Session归属、提供方更换、P2维护/未知治理、账本缺失/损坏/迁移拒绝，以及消费/额度/生命周期原字节保留。真实Session保存读取、Scope项目身份和受管库写入接续通过。最终169项定义、18条独立审核与420个实包文件核验通过。确认是临时同进程状态；不读取密钥，不清零预算，不自动初始化或纳管私人旧库，不替换Profile、不批准部署。

详见[BUNDLE-PROJECT-BINDING.md](BUNDLE-PROJECT-BINDING.md)、BUNDLE-BINDINGS-VERIFICATION.json。旧bundle.8及更早封存记录保持原字节；日常与GitHub不变，旧rc.2 peer冲突仍fail。下一阶段集中完成受控Profile提供方挂载/替换及配置接入，再推进原生压缩、有界收尾、前端与远端URL GUI生命周期；不以当前显式片段替代固定完整标准。

## 阶段四显式冷启动Profile保护组合（bundle.10）

先复核bundle.9检查点的446个提交文件、实际包和日志，169项既有定义重新通过。当前候选bundle.10把P2租约、SEP实时Session、受保护文本工具、项目接续绑定及受管三域组合为一项明确Profile插件。固定Windows合成核心范围pass，完整阶段四、完整SEP业务Profile仍blocked，根业务pending。

17项新增定义包含实际Agent文件观察/编辑、任务必需事件保存与提供方重挂后冷读、三域业务序号保留、原提供方/用户域/同名工具冲突保留、失败回滚、在途访问收尾、旧引用拒绝和官方boot/Loader冷启动替换。最终186项定义、20条独立审核、422个实包文件核对通过。发现并修复未知目录拒绝前新增P2元数据的问题；全部夹具失败和原样日志保留。

仅认证明确冷启动配置；不自动编辑宿主行，不替换运行中的私人Profile，不自动恢复已停用原行、不启用整套SEP业务或改原生压缩。详见[BUNDLE-PROTECTED-PROFILE.md](BUNDLE-PROTECTED-PROFILE.md)、BUNDLE-PROFILE-VERIFICATION.json。确认仍是临时只读Session接续确认，实际写入由各执行器守卫承担。旧证据、账本、用户组件、日常与GitHub保留。下一步继续成组原生压缩及生命周期，然后完整业务Profile/P1/配置前端和阶段五远端URL GUI验证；固定完整标准未降低。

最终复核补充：域重复close曾提前返回，已确定性复现并修正为同一原生结算Promise、关闭操作纳入在途追踪。首个租约时机样本未复现提前释放，不能扩大归因。初版185项的包、索引、源码快照与日志保留；最终186项、20条审核绑定final-r2包和REVIEW-r2.json，见本轮报告末尾。

## 阶段四冷启动压缩与保护组合（bundle.11）

先复核bundle.10当前450个提交文件及初版保留证据，186项再次通过。新增显式compaction-group/protected-runtime，保留原生参数、单次模型摘要及提交；同项目内存图校验不新增模型请求。20项新增固定定义含实际摘要/Worker/持久事务、取消/迟到结果、物理Session/P2收尾顺序、原生维护预约与两种官方boot/Loader组合。

最终206项固定定义、22条独立审核、425个实包文件通过。修复thenable disposer导致的并发过早释放、微任务推迟手动维护预约；错误分类/代理比较夹具误差另列。一次失败诊断的死租约已受控恢复，最终零owner文件不可回填为旧样本当場成功收尾。详见[BUNDLE-COMPACTION-GROUP.md](BUNDLE-COMPACTION-GROUP.md)、BUNDLE-COMPACTION-VERIFICATION.json。

当前仅冷启动明示组合，旧原行不自动恢复；原固定要求不降低。下一步先补受控配置绑定/原入口恢复，再完整P1、仅suite_delegate任务约束及关闭期限，之后前端/阶段五。完整阶段四与业务仍blocked/pending，日常与GitHub不变。

## 阶段四原生压缩绑定/恢复（bundle.12）

先复核bundle.11提交及历史失败/恢复证据，新隔离安装206项再次通过。新增可信同进程native-compaction控制器，读取实际原生行/有效配置，绑定owner、项目身份与计划；冷启动切换失败或受控控制器卸载先排空自有工作再恢复原生。冲突/导入失败明确阻塞，不覆盖用户行；无持久YAML编辑或私人热替换认证。

21项新增固定定义、227项总定义及25条实包审核通过；旧模块/契约字节保持，427文件新包封存。错误owner读取与异步忙状态实现已定位修正；原始失败样本保留，零P2 owner文件未依赖事后强制清理。见[BUNDLE-NATIVE-COMPACTION.md](BUNDLE-NATIVE-COMPACTION.md)及BUNDLE-NATIVE-COMPACTION-VERIFICATION.json。

下一步是完整Profile的P1与仅suite_delegate任务限制、全应用关闭期限，之后前端与远端GUI。整个阶段四仍blocked，根业务pending；当前只完成冷启动子阶段，不部署日常、不上传GitHub，固定标准不变。

收尾复核补充：缺失review计划但传undefined指纹的边界已按固定断言复现并规范化为SEP_NATIVE_PLAN_INVALID；final-r2实包227项和25条审核重跑通过。原final初版、458个源码及安装锁映射保留，见当前子阶段报告和supersededInitialEvidence，不混用指纹。
