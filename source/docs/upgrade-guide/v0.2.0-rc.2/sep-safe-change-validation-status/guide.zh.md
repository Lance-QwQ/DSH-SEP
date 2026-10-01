---
kind: upgrade-guide
description: "SEP suite_change 的验证结果将不完整的测试覆盖范围与单文件发布资格分开表示。"
---

# SEP 安全修改验证不再把未执行测试报告为通过

[English](guide.md) | 中文

## 变更

对启用了本地 SEP `suite_change` 工具的安装，`action: verify` 以前在声明的内容和语法检查通过时返回顶层 `status: pass` 与 `validation.status: pass`，即使运行时测试并未执行。这些字段现在会在缺少运行时覆盖时报告 `not_run`。文本文件的语法检查也报告为 `not_run`。根据旧值选择分支的工具结果消费者必须区分发布资格和验证覆盖范围。工具参数以及 `action: status` 返回的生命周期状态没有改名。

`validation.publishEligible` 仅表示受控单文件内容发布条件。该字段、已提交的文件发布或正常完成的回合都不代表任务验收通过。此变更不要求迁移已存储的 Session，也不会部署本地候选。

## 迁移

1. 更新读取 `suite_change` 验证结果的客户端适配器、工具结果渲染器和脚本。按类别和状态展示 `validation.results`；保留 `blocked` 和 `not_run`，不要将它们转换为通过。
2. 如果消费者以前仅用 `status === 'pass'` 或 `validation.status === 'pass'` 判断能否请求受控文件发布，改为使用 `validation.publishEligible === true`。继续保留当前计划哈希、修订号、有效期和用户确认要求。不要将此替换用于整体验收，也不要放宽用户要求的构建或运行时测试；没有运行时执行器时，`runtimeTest: true` 仍会阻断操作。
3. 用一个声明的内容检查和适用语法检查均通过的候选验证这种区分：验证报告为 `not_run`，运行时覆盖仍为 `not_run`，但发布资格可以为真。内容或语法检查失败时，发布资格必须为假。[验证测试](../../../../packages/sep/system-enhancement-package/tests/safe-change-validation.test.mjs)与[引擎测试](../../../../packages/sep/system-enhancement-package/tests/safe-change-engine.test.mjs)覆盖这些情况。
