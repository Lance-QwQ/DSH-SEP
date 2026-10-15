# DSH 0.2.1-alpha.2 接口差异与隔离适配评估

当前补充：Windows 隔离桌面及受控私人副本接续已完成，见 [本轮桌面/私人接续报告](ALPHA2-DESKTOP-PRIVATE-CONTINUATION-20261012.md)。下文表格、43 项及“尚未认证”描述保留为先前核心阶段的历史范围；本轮未切换日常版、未上传 GitHub，Linux/macOS、公网三段同次正例仍未认证。

本阶段完成 Windows x64 隔离范围的核心接口适配与实包验证。它不是日常切换、公开发布或 Linux/macOS 完整认证结论。

- 官方基线：`dsh-v0.2.1-alpha.1`，`5badb15009ae1756c3afe0ae0cef1faafc290ccc`。
- 官方目标：`dsh-v0.2.1-alpha.2`，`d743267388641bc76f17c45ce8b4c231aed1d32c`。
- SEP 输入：本仓库 `dfa74e727dd5bfba677d8468c1490714c73e4f87`，bundle.24 及其已提交部署工具。
- 派生候选：`0.2.1-beta.3-alpha2-adapter.1`。这是内部接口候选编号，不是已发布版本。
- 隔离目录：`D:\AIData\ProjectWork\DSH\alpha2-adaptation-20261012`。

官方比较 API 返回 669 个提交，但文件列表截断在 300 项。本轮对两份完整官方源码逐文件计算 SHA-256：Alpha.1 为 14,207 文件，Alpha.2 为 14,988 文件，3,371 项字节变化，目标源码含 367 个 package manifest。该数字包含文档、测试、版本清单等，不代表 3,371 处接口破坏。本轮重点检查 SEP 实际使用的服务与装配边界；不宣称逐行审查全部提交。

官方入口：[Alpha.2 发布](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-alpha.2)、[两版比较](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.1-alpha.1...dsh-v0.2.1-alpha.2)。

## 接口差异及处置

| 边界 | Alpha.2 差异 | SEP 适配与验证范围 |
| --- | --- | --- |
| 子代理 | 旧 `subagents.start` 改为 `startActivation`；返回 `childId/result/dispose`；发布后的取消由 activation 所有者负责 | 新增显式版本适配器，使用 `delivery: caller`，避免重复父模型通知；保留 suite_delegate 的两任务、只读、预算继承及取消/超时语义。真实父 Agent 回合和失败收尾通过 |
| 装配顺序 | subagents 新依赖 workingDirectory；workingDirectory 又依赖 fs | 根入口不再提前依赖尚待自己创建的子代理服务；受保护 fs 建立后再挂载 P1 policy。官方 Loader 冷启动通过 |
| 有效目录 | `session.header.cwd` 保留初始目录；`workingDirectory.get/ensure/set` 管理当前目录，新增持久事件 | Scope、项目绑定、P1 工具计数、插件组及上下文准备使用有效目录。Mem0/历史相关插件组同时限制会话原项目，避免把原对话重新归到另一项目。越界拒绝与返回原目录验证通过；多项目日常注册接续尚未认证 |
| 文件工具结果 | 原生 write/edit 使用封闭的 JSON 结果 schema；SEP 后端额外返回内部 `mutationId` | 已复现“文件已改但工具结果失败”。在模型工具专用 GuardRequiredFiles 边界移除额外字段，内部恢复记录保留；实际中文子目录读写、编辑及原字节备份通过。未放宽原生结果 schema |
| 会话持久化 | 仍为 V4，但新增 `formatStatus`、工作目录事件和可忽略的 `plugin:` 记录 | 重新捕获 Alpha.2 官方 JSONL 实现，重放 SEP 的受控导入替换；保留原目录与新目录事件、可忽略记录，真实保存/关闭/重开通过。没有仅凭 V4 版本号宣布兼容 |
| Agent 卸载 | 官方调整 scope、会话 drain、registry 退出顺序，收集多个清理失败 | 验证子代理完成、失败、取消、超时及根关闭。完整 Electron 的有界退出尚未认证 |
| Tools/PTC | `both` 模式移除，只保留 native/ptc；PTC 新需 workingDirectory，子调用也可带 presentation meta | 四个既有 preset 的挂载及 SEP 压缩引擎所有权通过；不据此宣称全部 PTC 程序执行、新 AgentTeam/inbox 流程已覆盖 |
| LLM | 新增纯同步 ConfigureCall 控制接口，官方 DeepSeek 适配器也有变化 | 现有 llm/stream 预算拦截仍工作，单轮限额、父子预算、压缩、视觉/自动捕获合成请求通过；没有调用真实付费模型 |
| Web/桌面宿主 | WebServer 支持 TLS 与 protocol；Desktop Host 显式绑定 loopback，使用实际协议构造 URL | 默认 loopback HTTP 的认证与设置路由回归通过。TLS 载具、Alpha.2 Electron main/preload/Desktop Host 的重新打包与真实桌面生命周期仍待验，旧 Alpha.1 桌面资源未混入本候选的认证范围 |
| 依赖准入 | Alpha.2 不再包含独立 invariants 源包；官方门禁仍将 dsh-* peer 与宿主版本比较 | 保留已审核的单项精确 union：已安装 invariants rc.2 ＋宿主 Alpha.2，仅用于官方门禁桥接。不声称存在 invariants Alpha.2 包，不设置风险豁免或开放版本范围。官方 Profile 准入与 pnpm peers check 均通过 |
| 更新链 | 现有日常安装/迁移仍绑定 Alpha.1 程序图 | 本轮没有放宽更新器，也不能把 Alpha.2 变化当作同宿主 SEP 小更新。需后续制作新的完整宿主候选与具体迁移计划；此前搁置的公网三段同次正例保持搁置 |

其中 fs/fs-local 的被检查核心源码文件在两份官方标签之间字节未变；其版本门禁仍需在派生候选中明确改为 Alpha.2。没有修改 Alpha.1 日常包或解除未知宿主拒绝。

## 证据与统计

最终实际安装包执行 **43/43，0 失败、0 跳过**，日志 `packaged-final-r3.tap`。16 项 Alpha.2 定向测试、1 项官方完整服务 Profile 测试，以及 26 项既有原生设置/共享消费者回归；重复执行不叠加为独立用例数。Profile 用例验证服务组合、四模式挂载和退出，不是 Electron 图形桌面认证。

已保留适配前及过程中失败证据：`baseline-red.log`、`directory-record-red.log`、`native-edit-red.log`、`candidate-r*.log`、`packaged-final.tap`。第一次打包后 Profile 曾被 invariants 单项 gate 拦截，修复后另存新包/日志；未覆盖失败记录。早期 100ms 超时用例可能在模型派发前截止，不能断言已有 reservation；最终用例要求实际进入合成适配器后再检验 unknown 账项。

最终包：`artifacts\r2\dsh-sep-bundle-0.2.1-beta.3-alpha2-adapter.1.tgz`，SHA-256：

```text
774e6f1d675133898ac323d92fb48373e57a407fa35f2ef8d36374a089bb1f94
```

`RESULT.json` 绑定官方源码包、初始 Git checkpoint、候选包、安装 lock、测试输入与日志。`ADAPTATION-ORIGIN.json` 有 38 条来源/转换记录，对应 36 个最终文件；15 条文本转换已机械重放，其余新增/生成元数据检查输入输出哈希。pnpm pack 对 package.json 仅移除最后一个 LF，该确定转换及源码/实发两个哈希分别记录。旧受影响 origin 明示被本候选取代，历史数据保留；包内原 Alpha.1 契约标为本候选未认证，不沿用 pass 作 Alpha.2 声明。

`RESOURCE-AUDIT.json` 只审计命令行指向本隔离目录的 Node/Electron 进程，不是全系统句柄审计。一个依赖安装器在输出完成后伴随可选包 socket 警告仍未退出，已在校验 PID、创建时间、父进程与命令行后受控终止。最终无此范围残留是该清理之后的结果，不倒推该安装器当场已自动退出，也不据此归因 DSH 泄漏。

初始源码 checkpoint：`source-before.bundle`，已通过 `git bundle verify`。日常 `deployment-rc2.json` 与 `launch.mjs` 的哈希和本轮起点一致；未复制私人库、会话或真实密钥文件，没有真实模型调用、日常切换或 GitHub 上传。

## 后续边界

下一阶段先构建 Alpha.2 独立桌面程序图，复验启动、托盘、关闭/恢复及多项目库接续，再准备用户审阅的部署计划。Linux/WSL 与 macOS 的受保护文件系统和完整桌面认证单独推进，不能将本轮 Windows 核心接口结果直接搬用。付费模型、TLS、新 AgentTeam 流程及公网安装闭环仍按 `RESULT.json.notVerified` 保留未验状态。
