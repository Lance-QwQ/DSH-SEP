---
kind: upgrade-guide
description: "SEP 工作流历史可超过原来的 200 条记录，需要使用匹配的读取程序。"
---

# SEP 工作流历史采用字节容量限制

[English](guide.md) | 中文

## 变更

SEP 保留全部 P1 子任务和复检记录，不再拒绝项目的第 201 条记录。原数组和三个数据域保持不变。可选的 `p1.historyMaxBytes` 默认 16 MiB，接受 1–64 MiB 的整数值。写入按 UTF-8 字节计量，并为运行中的受管子任务预留有界的最终报告空间。没有配置验收项时，普通回合结束不再追加永久的 `not_run` 复检；显式复检仍会记录。

仍限制数组最多 200 条的旧版 SEP 无法读取超过该数量的数据。本变更不保证可安全降级，也没有把 JSON 后端改成磁盘分页存储。

## 迁移

1. 将升级前的程序和数据 checkpoint 一同保留。写入新记录后使用匹配的新版 SEP；不要为了降级用旧快照覆盖新数据。
2. 现有 `p1` 配置无需增加字段。只有需要不同存储容量时才显式设置 `p1.historyMaxBytes`。`P1_HISTORY_BYTES_LIMIT` 会保留原记录；继续新工作前先处理容量限制。
3. `suite_tasks` 调用方应使用可选的 `offset`、`limit` 跟随 `nextOffset`，或按已知 `id` 查询。每页仅包含调用者父会话的记录，且不超过 64 KiB。重启后核对保留的记录 ID 仍可读取。

整项目加载的限制见[包容量说明](../../../../packages/sep/system-enhancement-package/)。
