# bundle.22 剩余消费者与附件域（隔离候选）

固定宿主为 DSH 0.2.1-alpha.1，SEP 为 0.2.1-beta.3-bundle.22。默认组合入口仍 pending，完整 Profile 仍 blocked；本阶段接通显式受控根的可选消费者，不等于普通插件页启用即获得全部业务。以下后续阶段尚待完成：完整 UI/HMR、GUI 仓库安装生命周期、三平台与 CI、统一最终候选。日常程序与 GitHub 不变。

## 同一根、同一账本

自动记忆捕获、Mem0 辅助、suite_vision、受管子任务及原生压缩均通过既有原生 P1 模型/预算钩子；消费者不构造第二个预算或 P2 协调器，不清零消费、预留与用户额度。Mem0 仅使用当前项目及当前真实会话的直接消息证据。只有 suite_delegate 创建的任务获得套件的并发、只读、截止与历史管理保证；Profile 模型和预算拦截独立适用。

history_expand 需要当前直接用户明确请求、同项目/会话、当前来源图修订及删除依据；普通检索缺失不会自动展开历史或 L4。本地 suite_extract 维持 UTF-8、数字 PDF、DOCX 提取范围，不宣称音频/视频转录。上下文提取仅针对显式不可变公开快照，Python AST 不执行任务源码；可信宿主提供已有 Python 绝对路径。

business 可选字段为 capture、recall、media、pluginGroup、evaluation、click、context、vision；详细严格形状见 settings-consumers.js。capture 默认 false，recall 默认 true；其它外部消费者默认关闭。vision 只接受 {enabled:true,allowUpload:true}。模型必须由原生 resolveModelInfo 证明支持 image；不能只凭模型名称推定能力。共享预算与单轮/单会话额度照常生效，实际费用仍以提供方账单为准。

## 独立原生附件域

图片副本使用官方 AttachmentLocal，位于所选 memory 根下的 `.suite-attachments`，与三域 JSON/RAG 数据分离。可信宿主必须先挂载 dsh-sep-bundle/native-attachments，再挂载原生 LLM/Connection 和受控根；参数为 {storageRoot,projectId}。未知现存目录或提供方冲突拒绝首次接管。原生附件提供方必须保持到受控根真实 whenClosed 后才可释放；后台进程仅关闭窗口不算停写。

每张上传原图最多4MiB，每条消息最多1张。Connection 应满足官方 maxMessageImageBytes 对请求信封的最低容量约束；本轮载具使用8MiB，同时设置路由自身16KiB上限保留。图片会被原生规范化，必要时产生请求变体；取消、失败也可能留下这些副本。模型解释不另作正文缓存。此能力只给已授权上传的当前项目本地图片使用，不允许任意会话/项目附件。

保留策略为 until-explicit-purge：没有自动 TTL。RAG 删除不删除附件，附件清理也不删除 RAG 或原始项目文件。会话中旧附件引用在清理后可能无法读取；RAG 快照恢复不会还原已清理附件。应在用户已不需要这些图片引用时执行全域清理。业务与附件提供方均需停止，清理分别取得 P2 和独立附件租约，任何活跃者使其拒绝。

离线命令（用受支持 Node24；<bundle> 是实际安装包目录，<memory> 和 <projectId> 必须与配置一致）：

```powershell
node '<bundle>/bundle/lib/attachment-maintenance-cli.js' plan '<memory>' '<projectId>' > attachment-plan.json
# 审阅 planHash、files、effects。计划不含图片正文；不要跳过审阅。
node '<bundle>/bundle/lib/attachment-maintenance-cli.js' apply '<memory>' '<projectId>' 'attachment-plan.json' '<planHash>'
```

命令仅输出 JSON，失败退出码2。apply 必须显式携带完整计划哈希，取得锁后重新核对所有文件身份/哈希及待收尾意图；发生变化则旧计划失效。文件只逐个删除，拒绝符号链接、硬链接和身份不可验证来源。清理前可靠写入意图，完成后写入回执；中途崩溃保持启动闭锁，需要新的显式计划覆盖剩余副本和旧意图。损坏或无法验证的治理元数据仍拒绝，不自动跳过。元数据不随 RAG 旧快照回退。

单次完整清单限2000文件、256MiB、单文件20MiB；这是审阅限界，不是自动缓存配额。超出或治理记录损坏时需要受控运维，不能声称清理器可处理任意大小/任意损坏。文件 fsync 已执行，目录条目的跨平台断电耐久性未据 Windows 合成测试认证。治理只覆盖遵守租约的共享写者，不对恶意外部文件系统改写作无限保证。

## 证据边界

真实 Windows MCP 仅测试自有合成窗口，使用官方 MCP 工具工厂与固定 MCP1.3.24；不是全 Windows 应用、完整 MCP 安装管理器或任意桌面点击认证。受信任评测后端使用实际 WSL 启动/健康/目录/关闭与重连；本轮未追加付费模型解题，也未重新认证在途远端判题取消。旧后端协议证据保留，不能将其写成本轮新组合正例。

历史100ms关闭异常仍未归因、未证明修复。用户已批准：有界 close 回执可 blocked，真实 whenClosed 另设有限观察；挂载失败的700ms观察从 UI 故障注入点开始，冷启动另有5s界限。生产截止不变，原失败日志保留。另有 settings-browser 自有 Edge 在5s内未退出的新失败，测试随后强制清理；交互通过与异常收尾分别记录，留给下一完整 UI 阶段调查，不宣称正常退出通过。
