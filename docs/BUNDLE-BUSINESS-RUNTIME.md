# bundle.14：共享 P2 业务消费者冷启动片段

当前范围为 Windows x64、本地 NTFS、合成资料和固定官方 DSH 0.2.1-alpha.1。本消费者子阶段 pass；阶段四整体与默认业务激活仍 blocked。日常程序、私人资料、公共 README、GitHub 和既有封存证据未变更。

## 接入结果

显式 Cordis 入口为 `dsh-sep-bundle/business-runtime`，服务为 `sepBusinessRuntime`。它在 bundle.13 的受保护 Profile/P1/原生压缩组合之上复用同一个 P2 所有者、同一个三域存储和同一个既有 V3 账本。没有再次挂载完整 Suite，没有新增独立预算初始化，不清零消费、预留或额度设置。

- RAG 的 `suite_index` / `suite_search` 读取受信任配置中的本项目来源，数字 PDF、DOCX 与文本解析沿用原模块。此轮业务正例是中文路径 Markdown；其他解析器的既有实包测试重复通过，不等于新增全格式业务验收。检索用 BM25，无 embedding；正文是不可信证据，附带哈希和位置。源文件变化须重建索引，多硬链接和无法核验本地身份的来源拒绝。
- 四层记忆沿用既有实现：L1 是原生上下文，L2 是项目/任务/临时资料，L3 是习惯/个人事实/总目标，L4 是按需归档。已接入保存、修订、撤回、召回、单条读取/导出、归档、归档查询/读取、恢复、永久删除。写入需当前直接用户证据，修订号/eventId 防止旧更正覆盖和重复写入；生日不补造年份。明确配置 userProfile 才绑定用户事实/习惯共享，所选项目外即使已注册也不会自动获得来源或用户资料。
- 自动召回在实际原生 Agent pre-step 使用活动 L2/L3，运行既有维护策略；idle 边界退休临时记忆上下文，保留追加式审计。没有新常驻 TTL 工作器接入声明。普通查询不扫描 L4；归档访问和恢复需当前明确历史/恢复/审计需求，不自动复活旧记录。恢复保留 createdAt、递增 revision，并按既有规则刷新恢复时的 updatedAt/lastUsedAt。
- `business.capture` 只接受 false。付费自动提取、媒体模型与完整记忆设置页尚未接入这个 alpha.1 片段；不会把未连接的能力显示成已启用。本地召回不新增模型请求，实际 Agent 的正常响应仍由已有 P1 账本结算。
- `suite_document_delete` 的预览不含正文，确认绑定最新直接用户的完整计划哈希。默认保留原文件；独立于三域的 P2 删除依据使重建索引和重启后的新 Profile 所有者继续排除该文档。撤回/永久删除记忆也先持久化 P2 依据。本轮未声明已验证旧快照实际回滚或中断删除的恢复入口；依据缺失、治理失配或待恢复事务仍保守拒绝启动。

## 共享所有权与关闭

先由受信任宿主建立前置服务并退役冲突的原生文件/Session 提供方，挂载片段，调用 review，再用本次返回的 planHash activate。确认绑定 Profile、原生压缩、P1 和业务配置；不存在有效账本/治理时不首次纳管。冷启动激活拒绝任何活 Session，包括 idle Session；受控重挂测试先通过所属 Agent Fiber 正常释放会话。

模型/预算拦截仍属于 Profile 级保护；两任务并发、深度、只读、超时和统一任务记录仅约束经 suite_delegate 创建的任务。原生压缩配置、入口审阅和恢复规则保留。普通 Shell 未被此片段隔离为强沙箱。

close 禁止新增请求，取消并等待所选项目 Agent、在途工具最终结果和模型账本 finally，恢复原生压缩，再卸载记忆 hook、关闭分层记忆两个域、旧 store 和 Profile/P2。默认关闭回执等待 5 秒，可配 100–60000ms。实际工作尚未结束时返回 blocked 并保留资源；Fiber 卸载等待真实收尾，不是整个应用的有界停机保证。关闭失败保持合并的失败回执，不将重复 close 假报为成功。

## 原生文档辅助进程修复

实包测试发现 canonical pnpm 安装路径中的脚本长达 265 字符，Windows PowerShell 的 -File 将存在的脚本误报为不存在。原模块和 PS1 原字节保留；新私有适配器读取固定包内脚本并通过 EncodedCommand 执行，限制编码长度，用户请求仍使用结构化 stdin。没有拼接用户路径为 shell 代码，也没有复制正文到临时脚本。来源/逐项变化在 bundle/host/document-source/origin.json；business-runtime 的可重构变化在 bundle/lib/business-runtime-origin.json。

独立静态审核发现此适配器增加一个配套引用。现通过 business-runtime 契约精确声明并校验每个新增引用只出现一次；缺失适配器、伪造声明都会拒绝。原模块与旧 Session 契约未被重写。

## 验证与失败样本

先重跑已验收 bundle.13 的 247 项。最终固定集合 273 项 = 历史247 + 新业务24 + 新配套审核拒绝2；最终日志为 260 个运行/实包/宿主/闭包检查和13个构建/官方准入检查，全部通过。独立实包复核31条，包437个普通文件；静态枚举为 274 个代码文件、1122 个 ESM 引用、12 个 CJS、14 个配套引用、1 个源码配套引用、10 个动态引用、2 个前端工厂。静态闭包不等于前端/动态宿主运行认证。

开发失败日志与对应草案包保留。旧包缺少入口的22项红测已保存输入。首轮14/22包含夹具误用（candidate不能恢复、错误日志路径/状态字段、尚有会话的热重挂）和真实 PowerShell 长路径问题；第二轮20/22余下是不存在的 Agent dispose API 夹具调用。改用真实所属 Fiber 后24/24。第一次全量257/258是普通关闭测试用100ms在并行负载下收到blocked；普通测试改用产品默认5秒，专用非合作测试仍100ms。修订后271项通过，独立审核再定位配套声明缺口，最终273项全部通过。没有删除失败样本或把开发补跑重复计数。

最终资源审计：本阶段共享消费者合成夹具 175 个，P2/store活跃标记0，无强制停进程或后续僵尸标记接管。非合作样本先在截止时真实返回blocked，之后由测试显式释放闸门并等待实际close才得到零残留；这不能倒推截止时已清理。本审计不涵盖全系统进程/句柄。

## 证据与范围

最终包：`D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase4-business-r1\artifacts\final-r2\dsh-sep-bundle-0.2.1-beta.3-bundle.14.tgz`

SHA-256：`f9fba0ba7664c5ed25a12936209a7c93c4c9a4eb54250b8bc6203c18a2e769ab`

阶段目录：`D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase4-business-r1`；sealed-r4-runtime.log / sealed-r4-builder-entry.log、REVIEW.json、RESOURCES.json、RESULT.json 及封存输入分别绑定本轮源码和实际安装包。仓库 docs/BUNDLE-BUSINESS-VERIFICATION.json 与 RESULT 字节相同。审核器反例见 review-alias-counterexample.json：同一伪造声明在旧计数变体中被接受，在完整引用集合检查下被拒绝。可恢复本地 Git 提交单独记录于 CHECKPOINT.json，未推送。

原 rc.2 peer 限制仍保留，peers check 预期 exit1；不能宣称完整包对 alpha.1 已兼容。根准入入口仍默认停在等待适配。下一阶段需要接入完整设置与根安装启停流程，并处理未连接的付费提取、媒体、plugin-group/历史展开、外部后端。私人旧库纳管/热替换、删除中断恢复经本片段入口、持久 YAML/崩溃恢复/应用根关闭、Linux/macOS 和真实模型均未由本阶段验收。不修改固定标准，也不把此前准备阶段的通过扩大为完整交付。
