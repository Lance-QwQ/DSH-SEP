# 受控的新会话续接

恢复中心“未完成任务”提供 **预览创建续接会话**。先启动已配置的受管宿主，填写原任务 ID，检查具体操作和项目状态，再确认该计划。成功结果中的 `sessionId` 是新建的原生 DSH 会话；用户后续在 DSH 打开该会话并决定下一条指令。此步骤不会调用模型、自动执行工具或复制原会话正文。

准入条件是原任务存在操作记录、涉及恰好一个项目、所有操作已确认成功、项目目录身份可核验且状态为 ready。结果未知、工作区丢失或更改、旧确认哈希均拒绝。经过确认的重新绑定使新会话使用批准的新 cwd；原会话 cwd 和文件字节不改写。

原生会话头使用 `cwd`、`parentSession`（原任务 ID）、`isSeeded: false`、`agentPreset: standard`，独立的 `inheritedEventCount` 固定为 0。扩展关联保存在一个新生成的、不可变的 `recovery/continuation` 事件中：原任务 ID、计划哈希、requestId、项目 ID 和项目代次。该事件通过原生创建接口的 seed 提供并保留 `ignorable: true`；rc.2 随后生成一个普通 `session/end-seed` 元数据事件，其 data 为 `{}`，不带 `inherited: true`。两条记录均不继承原会话正文，也不构造历史 turn、step 或模型输入。

持久化顺序：父服务验证计划并可靠写入预留会话 ID；其拥有的宿主通过 `agents.create` 持有唯一写句柄，执行 `sessions.flush`，再通过只读 `SessionHandle` 的 `open`、`read`、`close` 校验头、继承数量和关联事件；宿主通过私有 IPC 返回 sessionId 和头/关联哈希；父服务核对仍为该受管子进程、当前运行代次和未变化的任务/项目，然后可靠写入 completed 回执。查询始终关闭只读句柄，不另抢写锁。Host HTTP 凭据没有创建授权或完成提交入口。

重复提交同一个 `{taskId, confirmationHash, requestId}` 不分配第二个 ID。提交前发生任何其他控制日志变化，或者宿主代次已失效，会拒绝提交并保留 admitted 回执和已有原生会话；不会删除现场或盲目重放。原生创建成功、提交响应丢失时，应查看恢复中心状态中的 `continuations`，使用原 requestId 核查。页面的失败确认保留同一 requestId；关闭页面或取消预览不等于撤销已经发生的创建。completed 的重复请求只返回已保存的元数据。

`node bin/recovery.mjs call <连接文件绝对路径> createContinuation <参数JSON文件绝对路径>` 接受上面三个参数。先通过 `planResume` 取得当前确认哈希。新会话、受控目录和回执仅支持本地受管入口的明确保障范围；不承诺普通 Shell 的外部效果可以自动判定或撤回。此功能没有通用操作重放队列，也没有改变备份正文副本或 SEP 私人记忆的删除治理。
