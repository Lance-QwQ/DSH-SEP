# SEP 安全修改工作流组合

[English](README.md) | 中文

本 Node 24 测试通过真实 Loader YAML 组合启动随源码提供的 `sep-safe-change` 插件。显式指定的已安装 Host 由适用于 Windows x64 的 `host-lock.json` 固定；其他已审阅的平台或候选使用显式绝对路径 `SEP_WORKFLOW_HOST_LOCK` 指向自己的锁文件，不改写已提交的 Windows 依赖图。每个锁文件提供 `platform`、`arch`、`nodeMajor`、`graphSha256` 和依赖入口；使用前会验证选定 Host 的每个依赖文件与依赖链接。测试将当前 SEP 源码暂存到显式证据根目录下的新目录。Windows 使用指定的 D: 输出根目录；WSL 使用存储在 D: 上的已批准 ext4 输出根目录。测试不加载日常 profile 配置，也不调用付费模型。

组合使用真实 AgentLoop、工具执行流程、原生本地文件系统恢复、恢复 HTTP Host 插件、用户提问服务和 JSONL 会话持久化。只有 LLM（大语言模型）适配器与用户回答事件使用确定性替身。回答替身使用与 UI 相同的提问服务回执字段；这不是浏览器视觉或实际点击测试。

将 `SEP_WORKFLOW_HOST` 设为确切的已审阅安装 `program` 目录，将 `SEP_WORKFLOW_EVIDENCE_ROOT` 设为已批准的任务输出目录。Windows 使用 `D:\AIData\ProjectWork\DSH\sep-workflow-closeout`；WSL 使用位于 D: 所承载发行版内的 `/opt/dsh-sep-cross-platform/sep-workflow-closeout`。将 `TEMP`/`TMP`（POSIX 上为 `TMPDIR`）设为该输出根目录的 `tmp` 子目录。Host、锁文件和输出路径必须是绝对路径，且不能是别名。以 `composition.test.mjs` 的绝对路径运行 `node --test`。`SEP_WORKFLOW_SOURCE` 可指定显式 SEP 源码目录；否则测试暂存其包内当前的 `src` 目录。

三个场景覆盖无需第二次输入确认短语的可信批准、拒绝且不发布、工具结果中的当前内容/语法/运行时证据与不唤醒模型的收尾通知、检查失败但回合正常结束，以及后续普通回合。每个场景都会重新打开持久化会话，将每个事件与实时记录逐一比较。Windows 成功发布场景还会独立读取修改和未修改的文件，并定位原生恢复变更回执。在 Linux 和 macOS 上，批准后必须以 `SC_RECOVERY_REQUIRED` 失败并保持两个文件不变，因为此 Host 只在 Windows x64 NTFS 上实现可恢复发布。拒绝和检查失败场景在各平台运行。模型刻意自称所有测试通过，也不能改变收尾证据。

每轮运行在独立命名的证据目录中保留 `source-binding.json`、仅供测试的 Loader 配置、原生恢复数据、`observed.json` 和 `durable-session.json`。失败运行保留用于诊断。测试持有并关闭自身的恢复服务器与 Cordis 上下文。不批量删除生成输出，也不修改日常程序。

补充的[顶层 SDK 快照](../../../../../snapshots/sdk/sep-safe-change-closeout/snapshot.yml)通过公共 SDK 启动随产品提供的 `dsh --profile sdk`。其人工编写、无需密钥的会话请求 `runtimeTest: true`，记录真实的 `SC_RUNTIME_NOT_CONFIGURED` 工具拒绝结果与确定性收尾通知，然后完成另一个独立的普通回合。会话、组装后的 SEP 系统提示和工具 schema 均作为回放输入和预期输出提交。驱动断言两个回合合计只有三次模型响应，因此收尾不能增加模型请求。只有该场景禁用平台 Shell/skill 目录和动态运行时上下文，以保持请求头可移植；真实 SEP、恢复、文件策略、Loader 和会话服务仍然启用。成功批准与原生可恢复发布继续由上面的组合覆盖。

在具备 Node 24 和已安装工作区依赖的仓库根目录，将 `TEMP`/`TMP`（POSIX 上为 `TMPDIR`）设为已批准的 D: 路径，设置 `DSH_SNAPSHOT=replay`，再运行 `node node_modules/vitest/vitest.mjs run --config vitest.snapshot.config.ts snapshots/sdk/sdk.snapshot.ts -t sep-safe-change-closeout`。`DSH_SNAPSHOT=refresh` 只使用该场景人工编写的回放响应重写其预期输出，不需要 API 密钥。使用相同的 Vitest 配置运行 `scripts/session-snapshot-corpus.corpus.ts`，检查语料所有权和 fixture（测试前置数据）不变量。SDK 驱动在填入 Windows 路径时将 `{{cwd}}` 转义为 JSON 字符串内容；产品运行时和共享规范化规则均不变。
