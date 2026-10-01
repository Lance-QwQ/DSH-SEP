# dsh-tool-worker

当前候选版本为 `0.1.0-local.stability2`。新增 `createModuleExecutor(ctx, options)`，供宿主插件调用内部计算，不注册额外模型工具，也不自行运行工具审批。原工具继续负责宿主服务、授权与结果发布。

内部执行器接受与模块注册相同的 module、parameters 和限额字段，但 output 仅接受 `{ schema }`；返回 `{ execute(args, { signal, callId, rootCallId } = {}), dispose(), inspect() }`。输入及结果均按声明 schema 校验，复用原 Worker 生命周期。并发限额分别属于每个执行器；插件卸载会取消并等待其所属 Worker 退出，主动释放后拒绝新调用。类型参数应与运行时 schema 一致，不提供自动 schema 推导。

DSH 的显式模块工具插件，独立候选包版本 `0.1.0-local.stability2`，`private: true`。受审阅模块在每次调用新建的 Node Worker 线程中加载并执行；本包不自行修改宿主或安装到日常环境。完整代码示例与限制表见配套 [English README](README.md)。

## 入口

`registerModuleTool(ctx, options)` 注册普通 DSH 工具，返回异步 disposer。配置包含 `name`、`description`、`parameters`、`output.schema`、`module: { url, exportName, config }` 及下表限额。`module.url` 是配置指定的绝对本地 `file:` URL，不能由模型参数选择；拒绝包含远程主机、查询或片段的 URL。`exportName` 默认 `execute`，`config` 默认 `{}`。

模块导出 `execute(args, { signal, callId, rootCallId, config })`，返回普通 JSON。宿主不会导入该目标模块、用 `toString()` 重建闭包，或传入真实 Context、Agent、服务和函数。直接注册时可提供宿主 `output.render(args, value, ...)`；默认显示真正返回值的 JSON 文本。

Loader 使用函数型插件导出 `name = 'tool-worker'`、`inject = ['tools']`、`Config` 和 `apply`。在 `tools` 服务可用后加载，配置为 `{ modules: [注册配置, ...] }`，其中 URL 写为字符串，`output` 只含 schema。最多接受 32 个条目；先验证全部配置再注册。注册及清理由 `ctx.effect` 管理，卸载会移除工具并等待所属 worker 结束。

插件与宿主必须从同一安装解析 DSH peer 依赖。开发 junction 指向旧宿主而运行时使用新宿主的混搭，已观察到两份 `HarnessError` 类身份不同而丢失结构化错误码。实际候选安装应验证同一依赖树；这不代表兼容任意宿主版本。

## 配置限额

各数字必须是范围内的安全整数，省略使用默认值。**并发数仅限制单次 `registerModuleTool` 注册**；多个注册分别计数，不是整个宿主、Profile 或套件的总限制。满额立即返回错误，不排队、不重试。

| 配置 | 默认值 | 含端点范围与含义 |
|---|---:|---|
| `timeoutMs` | 5000 | 10–300000；模块加载和执行期限 |
| `cancelGraceMs` | 100 | 0–2000；合作取消至终止线程的宽限毫秒数 |
| `maxConcurrency` | 2 | 1–8；该注册所属 worker 数 |
| `maxInputBytes` | 65536 | 256–1048576；参数、配置及调用 ID 的 UTF-8 JSON 信封总字节数 |
| `maxConfigBytes` | 16384 | 2–65536；模块配置 JSON 字节数 |
| `maxOutputBytes` | 65536 | 256–1048576；返回 JSON 字节数，worker 内先检查再传输，宿主复核 |
| `maxLogBytes` | 1048576 | 0–16777216；每次调用 stdout 与 stderr 累计总字节数 |
| `maxJsonDepth` | 32 | 1–64；JSON 根深度为零 |
| `maxJsonNodes` | 10000 | 1–100000；访问的 JSON 值数量 |
| `maxOldGenerationSizeMb` | 64 | 16–512；V8 老生代限额 |
| `maxYoungGenerationSizeMb` | 16 | 1–64；V8 新生代限额 |
| `stackSizeMb` | 4 | 1–16；Worker 栈限额 |

V8 限额不是 RSS、外部 Buffer、原生分配或全进程内存限额。参数与输出 schema 声明固定限 65536 字节、64 层及 10000 个节点；调用 ID 最多 256 个字符。普通 JSON 边界拒绝循环引用、访问器、`toJSON` 函数、稀疏或附加属性数组、特殊对象、未支持值、非有限数字及负零，不调用访问器钩子。参数在创建 worker 前完成 schema 校验。该边界不使任意恶意 JS 对象或 Proxy 陷阱变得安全。

## 生命周期与诊断

期限覆盖模块导入、初始同步计算和一次 `await` 之后的同步计算。创建前已取消不会启动 worker；ready→execute 握手也防止加载期间取消已生效后再执行正文。调用者取消、到达期限及卸载关闭结果接纳，转发本地 AbortSignal，在宽限期后终止准确归属的线程。模块、协议、日志限额等其他失败直接请求终止。迟到成功结果不能覆盖取消或失败。正常结果在实际退出前仍是暂定，退出前到达的取消或已检测失败仍可使调用失败。

正常返回也会终止 worker，清除其中遗留的定时器。调用须等实际线程退出及 stdout/stderr 最后消费完成后才结束。两个输出流持续读取并丢弃正文，只保留字节计数，超过总限额即失败。重叠调用 disposer 共享清理过程，都等待所属 worker 结束。模块异常、缺失导出、提前退出、非法协议和 V8 worker 故障转为稳定工具错误；不自动重放业务。

`dispose.inspect()` 只返回元数据：`activeWorkers`、`activeTimers`、`started`、`exited`、`settled`、`closed`、`lastOutcome`。末次 worker 记录只有错误码、线程 ID、退出码、取消/超时/终止标志、输出字节计数和耗时，不含参数、结果、日志正文、环境或 Worker 对象。未启动 worker 的配置/参数失败不替换末次 worker 记录。调用结束后所属 worker 与宿主定时器归零，started 等于 exited。正常主动终止也可能产生退出码 1，这本身不等于模块失败。

稳定错误码统一以前缀 `TOOL_WORKER_` 加 `CONFIG`、`ARGUMENTS`、`BUSY`、`ABORTED`、`TIMEOUT`、`DISPOSED`、`MODULE`、`EXECUTION`、`OUTPUT`、`PROTOCOL`、`EXIT`、`CRASH` 或 `LOG_LIMIT` 表示。所测 DSH 运行时在派发前取消返回 `ABORTED_BEFORE_DISPATCH`；本插件启动后取消返回 `TOOL_WORKER_ABORTED`。模块异常详情不会复制进工具错误。

## 保障范围

仅显式注册模块进入 worker。输入编码/校验、输出校验/渲染、普通工具、插件加载钩子、宿主回调及界面渲染仍在宿主线程。旧闭包工具保持原状，原 H06 同线程失败不能因本插件改成通过。

线程环境仅显式传递系统白名单：`SystemRoot`、`WINDIR`、`ComSpec`、`PATHEXT`、`OS`、`PROCESSOR_ARCHITECTURE`、`NUMBER_OF_PROCESSORS`、`TZ`。不继承 API key、`NODE_OPTIONS`、调试或预加载参数；模块 config 是操作者显式提供的 JSON，本插件不会推断凭据。

Worker 不是操作系统权限沙箱。受审阅模块仍有 Node 能力与进程用户权限；私有协议通道及拒绝 `parentPort` 自发消息防止意外协议混用，不是任意恶意代码隔离。同进程原生扩展的致命错误仍可能使宿主崩溃。模块自行创建的 OS 子进程不由本插件自动接管或终止。本插件负责所属 Worker、宿主期限及输出流，不保证模块的所有外部资源都已释放，也不能撤销文件或外部请求副作用。初期用于计算模块；文件提交、外部请求及宿主服务访问需独立审阅协议，取消/超时后可能已生效的操作应核对，不能盲目重试。

## 验证与交付

本 rc.2 候选固定使用 Cordis 4.0.2 与 DSH tools/LLM 0.1.5-rc.2。外层项目的 `tests/dsh-rc2-runtime-20260913/workers/run.mjs` 执行真实 ToolRuntime 和文件配置 Loader 的针对性测试，不调用模型 API。测试与开发依赖 junction 不进入包载荷。证据也保留构建及夹具失败；固定验收轮次与开发检查分别记录。不据此计算性能开销，也不宣称私人日常部署验收已完成。
