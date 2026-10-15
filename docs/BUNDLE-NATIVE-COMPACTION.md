# bundle.12 原生压缩配置绑定与恢复

本子阶段在固定官方 DSH 0.2.1-alpha.1、Windows x64 本地 NTFS 合成范围通过：227 项固定定义（206 既有＋21 新增）、25 条实包审核。完整阶段四和完整 SEP 业务 Profile 仍 blocked；根准入 entry-only/pending，不部署日常版、不上传 GitHub。固定验收标准未变。

## 前置复核

重新核对 bundle.11 checkpoint 3bc7047fa5b2fca693de0131e244a16ded6a4692 的455个提交文件、425文件封存包、源码/日志和22条审核绑定；bundle.10 初版及后来修订、bundle.11 开发失败样本与恢复记录也保持原字节。新 D 盘空白实例安装 bundle.11，206项再次通过。BEFORE-CHECKPOINT.json、BEFORE.json 是本轮复核入口，不累计为新场景。

## 当前实现

新增具名 Cordis 导出 dsh-sep-bundle/native-compaction，提供 sepNativeCompaction.review/activate/restore/status。须显式传入真实完整 nativeEntryId、已有项目根及可选输入上限。支持普通官方 BasicCompactionEngine 行；表达式、自定义注入/隔离/分组及其它高级行拒绝，不猜测其语义。无模型工具入口，不修改官方源码或原生默认契约。

review 从实际运行中的原生提供方读取完整有效配置，同时保留原始 Loader 行。计划绑定完整行ID/对象、配置、真实原生owner UID、项目规范路径及dev/ino、输入上限。activate 在异步准备后重新核对，并同步检查当前配置/owner及无live Session，再将该行在内存标为disabled并等待旧Fiber真实收尾；随后挂载已复验的压缩组合。等待期间项目、配置或Session变化将拒绝或回滚。

原生 auto、阈值、保留参数、模型策略及其它有效配置完整复制；原生范围、工具配对、重试、维护预约与提交语义不变。失败或受控控制器卸载会先取消并排空自有压缩，再恢复原始原生行和参数。原始 disabled 缺省/false、未填写默认项和用户其它插件保留。实际摘要/SQLite Worker只复用上一子阶段的同项目完整性校验，无额外模型请求、持久历史图或自动原文展开。

这不是完整应用热替换。调用方必须掌握冷启动业务准入；无live Session是附加检查，不是对所有进程内调用者和被保留原生引用的全局锁。本控制器每次挂载仅允许一次激活；root默认入口不自动挂载它。只更改指定行的进程内disabled状态，不写YAML、账本或凭据；持续配置和崩溃后恢复尚未实现。原compaction-group/protected-runtime的手动配置/不恢复旧行契约保持，新能力仅属于新增控制器。

## 恢复阻塞与收尾

原行已被用户改名/更改配置、出现另一提供方或原生模块导入失败时，restore 抛 SEP_NATIVE_RESTORE_BLOCKED，status.phase 为 restore-blocked；保留用户修改，不重建/删除其行、不覆盖外来提供方。Loader Entry.init 会吞掉并记录导入错误，因此不能以init返回当作恢复成功：本实现等待Fiber并复核实际原生owner、原行和配置。仅在仍是自己未变更的行、且无其它提供方时重设暂停标记。

在控制器仍挂载时，受信任操作者可先解决冲突，再显式重试restore。本轮的阻塞测试通过这种受控修复/重试取得最终恢复；不能把它们当场的blocked改称成功恢复。Cordis dispose可能记录而吞掉清理错误，须保留status回执或先显式restore；Fiber dispose返回本身不证明原生已恢复。

接受中的压缩先取消、等待实际结算，再恢复原生；不合作adapter会延迟关闭，不声称全应用有界期限。受控控制器卸载已测，整个应用根树关闭时恢复原生、真实私人运行中热替换和持久重启尚未验证。

## 测试与失败归因

baseline-red.log 为旧bundle.11缺少新入口，最初16项均按缺失失败。iteration1为2/16：错误地用Traceable服务的ctx检查owner，该ctx指向调用方而非提供方；owner-diagnostic.log证实原生真实行UID为9，而代理ctx为root UID0。改为官方导出的symbols.original取得原始服务，再检查owner，未放宽对官方目标的要求。

iteration2为15/16，并发忙状态以同步异常返回，与新异步API的Promise拒绝形式不一致；第二次调用抛出后测试未能等待首次调用，产生后续unhandledRejection。改为async串行入口，使所有调用统一为Promise拒绝，准入仍只允许一个。本轮不据此宣称官方Cordis或原生摘要漏洞。

iteration3新增5项实际Loader/外来owner/被移除行/切换中卸载/保护Profile组合，总21/21。最终实包sealed-runtime为214/214，sealed-builder-entry为13/13，共227定义；重复执行不累计场景。首16项测试输入为从保留源码前缀重建的baseline/iteration1/iteration2-test.mjs，后5项为后续补充；iteration3-test.mjs保留当时完整21项，不称全部21项都运行过最初失败基线。

原生配置完整读取、缺省/false恢复、无确认/陈旧指纹拒绝、替换项目身份拒绝、已有及切换中live Session拒绝、准备失败自动回滚、并发单owner、非合作调用排空与迟到结果拒绝、用户修改/原行消失/外来提供方保护、导入失败识别与重试、未使用控制器卸载、真实Boot/Loader控制器行及实际保护Profile组合均有固定证据。后者保存并重读实际Session，保留P2独占和原账本，关闭Profile后正常接管租约；不是整个SEP业务Agent/Profile的通过结论。

RESOURCES.json扫描本阶段全部合成测试目录，进程结束后P2 owner.lock为0；未做后续强制清理、目录删除或死owner接管来取得该零值。上述需要受控修复的恢复阻塞在各自测试内另外记录。此结果不是全桌面进程、连接或文件句柄零残留认证。所有模型响应来自合成adapter，无付费请求。

## 证据与后续

证据目录 D:/AIData/ProjectWork/DSH/bundle-install-20261008/phase4-native-r1；最终包 artifacts/final-r2/dsh-sep-bundle-0.2.1-beta.3-bundle.12.tgz，SHA-256 608ee84f50f76be12df91dc838d4d0007ea3604154420acf401f1be2456f978d，427个普通文件。静态审核269个代码文件、1077条ESM导入；旧bundle.11全部已打包运行文件/契约/许可除可变README保持字节。旧rc.2 peer对alpha.1的冲突仍fail，未通过放宽版本隐藏。

当前封存日志为sealed-r2-runtime.log和sealed-r2-builder-entry.log，审核为REVIEW-r2.json。BUNDLE-NATIVE-COMPACTION-VERIFICATION.json与RESULT.json绑定本轮源码、最终候选、实际安装锁/清单、测试输入、失败样本、日志及25条审核；CHECKPOINT.json在本地提交后认证。离线安装复用记录缓存，不是第二次冷缓存安装或完整离线产品。历史封存证据和公开README保持原字节。

下一步集中完整Profile的P1模型拦截及仅经suite_delegate创建任务的限制、全应用关闭期限与恢复状态；再做真实设置/前端和阶段五远端Git URL安装生命周期。原生其它子任务和普通Shell不被新增宽泛承诺覆盖。私人旧库、真实凭据/API、外部评测/MCP、Linux/macOS及完整业务开放尚不由此子阶段证明。

## 收尾复核补充：缺失计划的错误归类

第一轮final包及227项/25条结果保留为RESULT-r1.json、REPORT-r1.md、REVIEW.json，458个原源码保留于retained-source-r1，安装清单/锁保留于retained-harness-r1。其包仍在artifacts/final，不能与本轮final-r2指纹混用。

复读发现尚无review计划时，activate({planHash:undefined})能绕过原undefined比较，随后读取不存在的plan.target产生TypeError；发生在暂停/修改原生行之前。missing-plan-red.log为20/21，missing-plan-test.mjs绑定增加该断言后的完整输入。实现增加计划存在及字符串类型检查，稳定返回SEP_NATIVE_PLAN_INVALID。修复后sealed-r2两组为214/214和13/13，25条实包审核重新通过；固定定义仍为227，只在既有“无确认/陈旧计划拒绝”定义内增加子断言，不累加成新场景。

旧初版所有源码、日志、包、报告及安装位置映射重新校验后，机器索引才指向final-r2。RESOURCES-r2.json仍为合成P2 owner文件0，无事后强制清理或恢复。完整阶段四仍blocked，日常和GitHub不变。
