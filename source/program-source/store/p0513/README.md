# DSH SEP 本地会话迁移组件

这是 rc.2 隔离开发候选的显式转换库，处理本地 P1.3 格式 0 会话中的任务检查点、恢复关联和 SEP 消息。没有部署到日常环境；没有正式私人迁移 CLI、旧目录原位发布、P2 事务准入或自动恢复后继续执行功能。

`migrateLegacyArtifact(physicalHeader, physicalRows)` 接受明确提供的格式 0 数据，返回格式 3 `artifact`、逐源事件 `mapping`、生成记录 `generated` 及内容哈希。函数不读写文件，不调用模型或工具。所有正文、原事件时间、会话身份、取消标记及 prepared/uncertain/completed 状态保留；只按已审计规则转换结构及同会话序号。assistant/chunk 按官方规则合并入持久化 stream，映射明确标为 `embedded-stream`。诊断映射文件可能含正文，正式发布流程必须将它纳入同等数据治理。

格式迁移没有把待执行输入伪装成已经运行的步骤。首个真实 step 之前已有 surface 消息的会话被拒绝，原件保持不变；此类会话的显式转接协议属于后续工作。未知历史事件即使标记 ignorable 仍被拒绝；只明确支持 required 的 `task/checkpoint-change` 和原本 ignorable 的 `recovery/continuation`。损坏字段、修订缺口和错误操作序号拒绝。

本地候选 Session 静态识别 required 任务类型；本地候选原生 catalog 在 `createRestore().finish()` 返回前校验完整任务状态，包括 JSONL 的 transformed 读取，避免损坏任务直到 live restore 才被拒绝并先追加 end-seed。原生 catalog 的官方历史迁移链保持严格拒绝本地扩展；扩展历史只能通过本库的独立本地三条迁移 edge。封存预检中的官方包没有修改。

`build-vendor.mjs` 从固定 rc.2 包生成本地分叉的三个历史 edge，来源和输出绑定在 `vendor-provenance.json`；`build-session.mjs` 从候选源码生成 Session；`build-catalog.mjs` 从候选源码生成带前置校验的原生 catalog。它们只面向独立测试运行时，不能用于覆盖日常安装。Session 的生成词汇增量由此本地构建脚本依据 task 包声明生成，尚未整合成官方全仓发布生成流程。

测试默认使用本地候选。`tests/migration.test.mjs` 覆盖格式与状态保持，`tests/session-required.test.mjs` 覆盖原生词汇及提前拒绝，`tests/native-persistence.test.mjs` 使用旧生产 Session 生成合成原件，再通过新版 SessionHandle 向独立新 root 写入、flush、关闭，并在新 Context 中冷读。这是组件持久化验证，未证明正式私人环境整体切换可用。原失败、调整和补充结果分别保存在 `evidence/dsh-rc2-session-20260913/migration`，不互相替代。

本组件本轮仅验证有限合成资料，不提供大库流式导入、容量或长期负载结论。源、目标、映射在内存中持有多份；正式维护入口需要先执行来源捕获、锁、大小准入、删除依据、发布事务及失败清理，不能直接将本函数作为无界文件导入器。

决策及被放弃的替代方案见 [AGENT-NOTE.md](AGENT-NOTE.md)。
