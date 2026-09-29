# SEP 离线维护接续

适用：当前更新已有唯一的 P2 `committed` 记录，但启动失败后又进入维护停写。此入口不删除维护标记、不清零账本、不恢复旧业务数据，也不把原提交再提交一次。

## 使用顺序

入口随桌面包交付，路径为 `node_modules/@deepseek-ai/dsh-desktop/lib/sep-update/maintenance-repair.mjs`。使用该实例的 Node 运行时。下面的 `<入口>`、`<请求.json>` 和 `<新计划目录>` 是用户本机路径；不是需要下载的第三方命令。

```powershell
& $node '<入口>' prepare '<请求.json>'
& $node '<入口>' review '<新计划目录>'
& $node '<入口>' confirm '<新计划目录>' '<审阅过的完整计划哈希>'
& $node '<入口>' apply '<新计划目录>'
# 仅在同一维修事务中断后接续：
& $node '<入口>' recover '<新计划目录>'
```

`prepare` 只生成新计划和兼容报告；`review` 只校验并展示；`confirm` 才记录绑定计划、报告和目标图的同意；`apply/recover` 仍重新核对输入并取得原生、P2 和 Recovery 所有权。实际切换前必须从托盘完整退出该 SEP 实例，官方 DSH 无需退出。指纹改变后不能沿用旧同意。

准备请求的格式：

```json
{
  "schema": 1,
  "kind": "sep-maintenance-preparation",
  "parentPlanPath": "<原已提交计划的绝对路径>",
  "options": {
    "directory": "<新的实际维护目录>",
    "installation": "<该实例 deployment-rc2.json 的对象，不是路径字符串>",
    "prepared": "<现有候选准备器返回的完整对象，不是路径字符串>",
    "healthPath": "<该候选空白环境健康检查回执的绝对路径>",
    "updatesDirectory": "<该实例现有更新控制目录>",
    "release": "<现有 SEP 发布元数据的对象>"
  }
}
```

此示例说明字段形状，字符串占位符不能直接执行。有效请求由已有候选准备流程提供；该入口不跳过下载包核验、兼容报告或空白环境健康检查，也不凭一个任意 ZIP 自动生成可信维修包。当前接口仍需完成最终成品包的端到端验收后再作为日常自助功能发布。

## 中断与状态

- 新计划绑定原提交、当前程序/配置、数据代次、删除治理及预算。即使原更新后已有业务数据，也只使用新计划准备时核验的当前基线。
- 新维护事务有独立 ID/哈希和唯一提交；原提交永久保留。
- 同一维修计划累计最多两次候选发布尝试（含首次）。尝试定位记录先落盘，崩溃不会清除次数。失败继续停写，不回到已知无法启动的旧程序后宣称可用。
- 两次耗尽返回 `PGR_SUCCESSOR_ATTEMPTS_EXHAUSTED`。已提交后再次停写返回 `PGR_COMMITTED_HOLD_REQUIRES_SUCCESSOR`；这两种情况均需新的审阅计划。
- 未知所有者、缺失删除依据、指纹变化及无法证明进程已结束均保持阻断。
- `committed` 证明程序发布完成；P2/Recovery 开放与真实桌面运行就绪是不同事实。CLI 返回 `runtimeReadiness: not_run`，不能把它解释为桌面已恢复运行。

本机进程突然终止的证据不等于整机断电下目录项持久性的保证。普通更新保留原有未提交回退路径；维修接续不改变日常 Agent 对工具错误的行为。
