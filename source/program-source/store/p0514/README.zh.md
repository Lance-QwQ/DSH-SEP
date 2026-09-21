# @deepseek-ai/dsh-task-checkpoint

[English](README.md) | 中文

可选的 `task_checkpoint` 工具在当前持久 Session 中记录有序任务。执行必须明确触发。组件不改变 Agent 循环、Stop、目标接续或默认配置。

## 配置

在 `agents`、`sessions`、`sessionPersistence`、`tools` 和 `fs` 之后加载。JSONL 持久化必须使用预先创建的根目录并设置 `requireExistingRoot: true`；根目录丢失时应阻塞任务操作，不能建立空历史。

```yaml
- name: '@deepseek-ai/dsh-task-checkpoint'
  config:
    allowedTools: [write, edit, file_manage]
    maxTasks: 8
    maxSteps: 16
    maxOperations: 64
    maxArtifactBytes: 1048576
    maxStateBytes: 262144
    maxInputBytes: 16384
    maxOutputBytes: 262144
```

`allowedTools` 为必填项，包含 1–64 个不同的名称，不能包含 `task_checkpoint`。它只允许编排：每个内部调用仍经过当前工具注册表的权限、审批、参数、超时和取消路径。

示例给出了可选限额的默认值。任务、步骤和尝试次数的上限分别是 32、64、128。单个产物、保留状态和输出的字节上限为 16 MiB；输入最多 1 MiB。每个步骤包含 1–4 个文件。输入计入完整 JSON 参数，输出计入 JSON 编码后的结果字符串，状态计入所有保留任务事件的完整包络，包括重复投递。在接受执行意图前，组件为最坏编码大小的结果记录以及每个未取消任务的取消记录预留空间。历史容量不足时拒绝派发。输出限额错误可能发生在完成记录已持久化之后；这不授予重复尝试的权限。

## 显式操作

| 操作 | 契约 |
| --- | --- |
| `create` | 提供任务 UUID、目标和 `plan_json`：有序的 `{id, description, acceptance, artifacts:[{path, sha256}]}` 步骤。相同任务和相同计划具有幂等性。计划不可变。 |
| `read` | 返回记录中的任务、版本、尝试和下一步，不读取产物或执行工具。已完成记录返回 `complete_unverified`。 |
| `track` | 读取实际产物字节，比较预期哈希和记录中的提供者版本；不派发工作。 |
| `execute` | 提供当前 `expected_revision`、下一步 `step_id`、稳定的 `operation_id` UUID、获准的 `tool` 和 `arguments_json`。执行意图持久化后只执行一次尝试。 |
| `reconcile` | 报告既有尝试的实际产物事实。即使文件匹配，未知副作用仍保持 `needs_reconciliation`。 |
| `cancel` | 提供当前版本，先持久化永久取消，再中止仅属于此任务的当前尝试。取消不会撤销已经发生的副作用。 |

验收说明文本留供人核对。自动完成判断只检查声明的普通文件 SHA-256 预期。路径必须相对当前项目且解析后位于项目内。读取有字节上限，并在读取前后检查目标身份、大小和提供者版本。只有实际哈希和记录版本仍匹配时，才跳过已完成尝试。更换操作 UUID 不能绕过未决尝试；如果核对仍无法确定外部结果，应取消并明确创建新计划。

## 持久化与范围

必需事件 `task/checkpoint-change` 携带 schema 1、不可变的任务与项目归属、版本、稳定步骤和尝试 ID、外层与内层 CallId、意图序号、参数摘要、结果码和验证后的文件证据。先追加意图且 `SessionStore.flush` 必须成功，然后才把内部调用与注册表持有的父令牌交给 `ctx.tools.execute`。内部调用关系由该必需事件记录；嵌套派发本身不等于已有规范的 `tool/call` 事件。

当前真实存活的 Agent、Session 和规范化项目必须精确匹配。继承或分叉记录不授予归属。历史权限不会重放。执行任务操作前，存储中的任务事件必须与内存任务历史一致；坏 schema、矛盾版本、丢失根目录和持久化失败都会阻塞并保留记录。完全相同的版本重复投递按幂等方式折叠；冲突投递被拒绝。落盘失败会阻塞同一存活 Session，直至实际重新加载。

重启后，没有当前存活所有者的 prepared 尝试被视为未知。工具绝不自动派发它、不认领旧 job ID，也不按 PID 认领进程。明确取消在重启后仍永久生效。每 Session 的 FIFO 串行提交检查点，但在工具执行期间释放队列，使取消可以落盘。Agent 释放会中止其所属执行，后续提交重新核对精确的存活所有者。卸载会移除工具、中止所属执行并等待其结束。

新事件绝不标记为 `ignorable`。依据既有事件词汇增长机制，JSONL 格式保持为 0：不认识该事件的旧宿主会以 `SessionFormatUnsupportedError` 拒绝新日志。测试使用真正冻结的 P0 读取器读取新的创建与取消日志，记录字节保持不变。

## 验证

本包测试使用真实 Agent、Session 服务以及通过 Loader 加载的真实 `cordis.yml`。Windows 子进程测试在意图持久化、受控文件副作用、第一步完成和取消之后，终止自己创建的精确进程。重新加载同一 Session，验证未知状态拒绝、显式接续第二步，并在重启后应用当前注册表守卫。测试也覆盖产物冲突、跨项目归属、实际存储 schema 损坏、独立任务取消、字节预留、重复投递和卸载。这些夹具不请求外部模型。

## Model Experience

### 工具 schema 与结果

#### What the model sees

生成的 [`task_checkpoint` schema](../../../docs/tool-catalog.md#deepseek-aidsh-task-checkpoint)，以及包含 `task`、`status`、`nextStep`、`evidence` 和 `guidance` 的有界 JSON 字符串。状态区分 `ready`、`executing`、`complete`、`complete_unverified`、`needs_reconciliation` 和 `cancelled`。未知结果携带：`Do not retry this operation. Reconcile facts, then explicitly cancel and replan if its effects remain unknown.`

#### Token effect

可选 schema 增加固定输入开销。结果随受限的计划、尝试和证据增长。必需任务事件不添加独立模型上下文，组件不调用模型。

#### KV Cache effect

schema 的可见性和定义不变时，前缀保持稳定。调用和结果追加到对话历史。组件不改写之前的请求上下文；启用或移除 schema 可能改变可复用前缀。

## Known Limitations and Deferred Work

- 自动验收覆盖声明的文件字节，不覆盖任意说明文本、远程事务或获准工具的每一种副作用。核对只报告证据，绝不自动确定未知外部结果。
- 文件验证是带版本检查的有界观察，不是内核原子快照或全系统隔离。配置的提供者和当前工具策略继续承担各自的保证。
- 任务历史没有垃圾回收。已完成和已取消的身份一直保留到 Session 归档；降低限额可能阻塞既有历史。对版本令牌较大的提供者，结果空间预留是保守的。
- 取消依赖内部工具响应信号，且不会回滚已经完成的副作用。卸载等待所属工作，无法强行终止任意同进程 JavaScript。
- 既有 Session 存储负责物理日志解析和保留。任务字节限额覆盖任务事件流与结果，不覆盖无关对话历史或文件系统分配开销。
