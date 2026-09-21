# DSH SEP 恢复组合候选

本包把独立恢复中心、宿主守护和 SEP 工作区/操作恢复组合起来。当前隔离候选为 `@deepseek-ai/dsh-recovery@0.1.0-local.sep2.rc2.1`，绑定 DSH `0.1.5-rc.2` 组件和 SEP `0.1.0-alpha.14.rc2-session.1`，需要 Node 24 与 Windows 可核验本地目录身份。日常 r11 安装未被替换；完整正式 Profile 和桌面启动仍待单独验收。它通过插件挂接宿主，恢复中心运行在被监督宿主之外。

历史候选 `0.1.0-local.sep1` 使用 DSH 本地 P1.3 与 SEP alpha.13；该组合属于保留的历史版本，不是本候选当前准入要求。

## 已实现的行为

- 本地恢复页和 CLI 独立于项目目录。项目丢失或同路径目录被替换时暂停，避免创建一个空目录冒充原项目。控制日志损坏、未知守护写者会显示维护原因并拒绝变更。
- 宿主异常退出后，默认十分钟内最多自动重启两次；预算落盘。手动停止不会触发重启。此数字与 `suite_delegate` 的两次返工分别计算。
- 已观察到结束的自有宿主，可在核对原属锁、存储身份和官方 P2 健康状态后恢复其遗留锁。存在未知写者、未完成业务写入或数据漂移时停止，不回退数据。
- 重新绑定需要先预览再确认。确认后再次校验目录身份和计划代次，保留项目 ID、原记忆命名空间和设置。旧会话路径保留为历史，新任务使用批准的新路径。
- 经恢复插件的工具入口执行前记录操作意图，完成后记录回执。宿主中断、迟到结果和结果不确定的操作保留为未知，续接前需要核对；不会自动重放外部操作。
- 显式创建限额工作区备份，验证哈希后恢复到全新目录。备份、失败副本均有清单和按计划确认的删除入口。凭据、依赖和 SEP 私有数据域排除在此备份之外。

## 启动与操作

`node bin/recovery.mjs serve <绝对路径的配置.json>` 启动恢复服务。配置的 `controlRoot` 必须位于项目之外的专用目录；无 `host` 配置时仍可登记项目、审阅操作及管理备份。

启动输出给出连接文件路径。`node bin/recovery.mjs open-url <连接文件.json>` 输出当前本地恢复页地址，可在浏览器打开。该地址包含本地管理凭据，请勿转发或写进公共日志。

`node bin/recovery.mjs call <连接文件.json> <方法> [参数.json]` 输出 JSON。常用方法：`status`、`addProject`、`planRebind`、`commitRebind`、`startHost`、`stopHost`、`planResume`、`createContinuation`、`reconcileOperation`、`createBackup`、`listBackups`、`planRestore`、`restoreBackup`。重绑定、备份恢复等确认方法使用刚审阅计划的原 `planId` 和 `confirmationHash`；续接参数规则见下文。恢复页提供相同的预览与确认操作。

CLI 的备份、恢复、续接和启动/停止等待上限为五分钟。超时或连接丢失不代表操作没有执行，也不会自动取消服务器已接受的工作；此时先检查状态、续接回执、备份清单和失败副本，不能直接推断失败后重复操作。

受管宿主使用 `openManagedService` 或 `serve` 的 `host` 配置。必须给出 `command` 的绝对程序、参数、稳定工作目录，以及 `suiteRoot`、`suiteLockDirectory`、`storageRoot`、已登记的 `projectIds`。`bin/host.mjs <宿主配置.json>` 是可组合的 DSH 启动入口；`src/host-runtime.mjs` 加载标准 DSH Profile，并通过 `suite-plugin` 等待恢复服务再加载 SEP。新 Profile、存储与项目关系必须事先建立，启动器不会擅自首次纳管私人旧库。

任务续接先用 `planResume` 检查并审阅计划；结果未知的操作须先核对，阻塞计划不能创建新会话。随后由恢复页确认，或以管理员 CLI 调用 `createContinuation`，参数为原 `taskId`、计划的 `confirmationHash` 和本次确认唯一的 `requestId`。守护端先持久化分配的新会话 ID，再通知其当前拥有的 DSH 宿主创建标准模式会话；原生会话同步落盘、关联记录核验且宿主身份仍有效后才提交完成回执。

新会话使用当前批准的项目路径，原会话的路径和正文保留为历史。新会话头中的 `parentSession` 关联原任务，独立恢复事件记录确认计划及项目代次；不继承旧对话正文，不自动请求模型或重放工具。中断或响应丢失后先查询 `status` 中的续接回执；需要重试时保留原 `requestId` 和原参数，不另造请求来绕过未决状态。已完成的同一请求返回原会话 ID。

## 当前边界

rc.2 候选已接入原生只读 SessionHandle，并按新接口等待模块 fallback 完成或显式失败。受控合成验证覆盖组件及 file-backed Loader；完整正式 Profile、桌面启动和私人环境部署仍需单独验收。`requireExistingRoot` 拒绝会话根缺失及当前 backend 实例期间的目录身份替换；该身份快照不构成跨进程重启后的 sessionRoot 绑定。跨重启的项目身份与代次由独立 controller 控制日志核验。

标准宿主工具/模型入口和本组合拥有的进程受到保护。普通 Shell、第三方插件直连系统、未纳入本组合的写者和任意后代进程不构成全系统隔离保证。取消是协作式的，已发生的外部效果需要核对。

监督覆盖进程退出与启动就绪超时；尚无运行中假死心跳检测。恢复中心自身遭终止后，未知所属锁仍需人工核验，不能仅凭 PID 不存在接管。磁盘物理故障、从未备份且已删除的文件、操作系统崩溃和原生组件致命故障不保证无损恢复。

控制日志、记录数及备份有明确容量上限；达到上限停止写入，不悄悄截断历史。备份默认不自动过期，需在恢复中心显式清理。进程崩溃恢复采用文件同步；不承诺突然断电时 Windows 目录发布的绝对持久性。

恢复开启的配置目前支持运行时绑定及受信预检。原 P2 子进程发布、升级与首次纳管命令明确返回 `RECOVERY_MAINTENANCE_REQUIRED`；本候选不宣称已完成日常发布或旧库自动迁移。

具体 API、限额、持久化顺序与故障副本治理见 [控制器](README-controller.md)、[守护和锁恢复](README-guardian.md)、[备份](README-backup.md)、[会话续接](README-continuation.md)。固定测试与交付范围位于项目 `docs/46-host-recovery-plan.md`，测试结果另列于本轮证据目录，不覆盖历史报告。
