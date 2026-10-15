# Alpha.2 macOS 原生基础复验

这是专用测试分支的第一阶段，不是新版 macOS 安装包或 Release。

固定来源为当前本地提交 `79e07bfd6993be8cfb0d354bb24019c6c4d64bcc` 的两份原始所有者模块，原字节与 SHA-256 见 INPUTS.json。目标应用版本是 DSH 0.2.1-alpha.2；本阶段尚未构建或运行该应用。

先运行九项可移植身份分类契约，再在真实 macOS 15 arm64 上执行三轮、每轮六项原生 APFS/进程/租约测试。所有计划轮次保留；失败不替换成通过。只有捕获的 SEP 原始代码与合成测试文件上传，不含私人配置、会话、账本、API Key、日常程序或旧安装目录。

原生探针在非 darwin/arm64 环境以 78 退出并记录 not_run，不创建测试目录，不能用更改 process.platform 的方式模拟通过。测试实际检查内核平台、APFS、出生身份、跨进程租约竞争、硬/符号链接拒绝、SIGKILL 后重新取得租约。只终止本测试新建的子进程，并分别记录测试恢复。

原始 Darwin 进程身份使用 boot UUID 和 ps lstart 秒级出生时间；本阶段不证明高速 PID 复用安全，也不因此直接开放完整受保护 Profile。原生 App Sandbox、受信任提交与恢复、完整 Alpha.2 构建、桌面、Full/Only 安装、TCC、签名公证、在线付费模型仍未验收。

后续独立 App Sandbox 可行性实验先以无沙箱控制证明同 UID 原本可以改写合成原文件，再将测试 App 与 Node 辅助工具按苹果原生 entitlement 规则本地签名，执行三轮。检查原文件对 App／Node／Shell 均不可写，传入的合成数据仍可写入 App 自有容器。该实验不是实际 SEP 生产工作器，不证明 Hardened Runtime、用户选择书签授权或全部第三方插件兼容；不能凭通过就开放完整 Profile。

本地执行示例：

新增独立账本任务：捕获当前源码的四份预算相关模块原字节，使用现有 Alpha.2 锁文件固定的 zod 4.6.5 与完整性值。八类合成场景各执行三轮：默认值与取消、未知响应保留、设置 CAS 与保留消费、三档金额限制、跨进程并发、SIGKILL 后预算锁恢复、账本丢失及损坏不清零。该结果仅覆盖真实 Budget 与 SQLite 锁在 macOS 上的行为；不代替 P2 三域、记忆、实际宿主或全部进程清理的认证。

```sh
node --test --test-reporter=tap tools/alpha2-macos/identity-contract.test.mjs
node tools/alpha2-macos/run-native.mjs /absolute/canonical/apfs/new-test-root
```

输出必须是全新目录；CI 使用 RUNNER_TEMP 的真实父路径，独立于任何用户资料。公开标准 macOS runner 只用于这次测试，不更新 main、不发布 Release、不切换 Windows 日常版。
