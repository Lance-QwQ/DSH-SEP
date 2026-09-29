---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-09-25-sep-task-events

[English](2026-09-25-sep-task-events.md) | 中文

## 概述

在本地 rc.1 构建中登记已有 SEP task/checkpoint-change 事件及状态折叠类型。任务事件继续要求读取方识别；recovery/continuation 保持显式校验的 ignorable 扩展。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-09-25-sep-task-events
baseline: false
changes:
  - root: "event:task/checkpoint-change"
    previous: null
    after: "c31b339df4a8078e03f9b4f97468d07c4d974deca364022abec160d103c65592"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

未适配的官方读取器必须拒绝未知 required 任务事件。本地 V0–V4 catalog 在可恢复尾部处理前校验两类 SEP 扩展，重映射同会话 intent 引用并校验任务状态。迁移发布 V4 后继，不改动已提交旧代；历史子会话头覆盖不完整时拒绝实体化。这是 SEP 本地扩展，不表示所有官方版本均兼容，也不保证新写入后的降级安全。

<a id="verification"></a>
## 验证

后续 V4 适配将 SEP 消息来源写为 `plugin:dsh-system-enhancement-package/*`，工具结果采用原生 tool role，原文展开识别 `compact-checkpoint`。生命周期恢复只允许替换当前界面中一个既有工具结果的正文，并可在原回合关闭后执行；消息与调用身份、回合、步骤、错误标记及其他元数据必须保持一致，来源引用仍受严格校验。未开启回合的新工具执行仍拒绝。`retirement-relations-green.log` 记录 394 项格式与迁移回归，组件组合另有落盘后重新打开测试。这些源码证据不能单独作为实包更新准入。

真实 JSONL 服务测试 sep-v4-migration.spec.ts 的 11 项通过，日志 persistence-chain-green-2.log：涵盖 V0–V3 全链、V4 冷读、源文件身份保持、中断 turn 引用重映射、requiredness 与字段拒绝、子会话发现和取消。完整安装候选准入尚未执行。

<a id="dev-note"></a>
## 开发备注

无。
