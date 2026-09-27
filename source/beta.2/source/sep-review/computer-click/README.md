# Windows MCP 点击增强 r1（2026-09-26）

状态：所述受控 Windows 范围开发验证 pass；日常版未部署，未上传 GitHub。基线为 DSH 0.1.7-rc.2 / SEP 0.1.7-rc.1-sep.local.4；Windows MCP 保持 sbroenne.windows-mcp 1.3.24。

## 完成内容

- `suite_computer_click` 在发送输入前重新执行精确 `ui_find`（唯一、启用、可见），核对调用者提供的名称、类型及可选 elementId，然后只派发一次精确 ID 点击。
- 仅提供 elementId 时，从本次窗口完整快照确认它仍存在且启用；缺失、歧义、禁用或显式跨窗口复合 ID 均拒绝。数字 ID 是实际 MCP 的服务器局部引用，不应在 MCP 重启后沿用。优先使用名称/automationId 及类型；仅 ID 的快照成员检查不能证明它与重启前的对象相同。
- 校验真实 MCP adapter 返回值及 JSON 正文：失败、空值、非法 JSON、缺少 success、冲突的 structuredContent 或超出 256 KiB 的正文均不能报告成功。该限制在接收到结果后、JSON 正文解析前生效，不是上游传输内存上限。
- 进程内增强插件实例共用互斥状态；相同会话、工作区、requestId 的相同请求复用回执，参数冲突拒绝；回执达到容量时拒绝新动作，不淘汰旧动作后重发。
- 预检失败明确说明尚未派发点击，保留受限的上游错误类别（如 multiple_matches），不把原始窗口正文放入错误提示。派发或后置验证失败保持 unknown，不自动重试。
- 取消前未派发则不点击；点击执行中的取消等待已启动的宿主调用收尾，不启动后置验证。保留原生入口，不自动改用坐标或另一驱动。

## 验证与真实限制

| 证据 | 结果 | 范围 |
| --- | --- | --- |
| green-final-01、02、03 | 30/30 每轮，共 90 项 | 实际 rc.2 Cordis、ToolRuntime 和 MCP result adapter；外部 MCP 回执为合成输入；取消、去重、互斥、错误分类等 |
| native-06、07、08 | 三轮 pass | 真实 Windows MCP exe + 实际 rc.2 工具管线 + 新插件 + 独立 Electron 测试窗口；三个位置/宽度；中文单次点击、后置条件、重复请求、同名拒绝、禁用拒绝 |
| resources-final.json | pass | 测试目录所属 Electron 零残留；每轮 MCP 子进程退出分别被等待 |

原生三轮每轮计数均为 1，且均在正常 app.quit / MCP stdin 关闭后收尾，没有触发子进程强制终止。最终资源审计不覆盖未纳入本轮的其他应用。

没有付费模型参与，未验证 Agent 自主选择增强入口的在线闭环；没有验证不同 DPI、多显示器、所有应用、UAC/高权限窗口。此处独立窗口采用专用进程、配置和数据，运行于当前桌面，不是 OS 安全沙箱。

互斥仅覆盖同一 Node 进程的 SEP 增强点击，不覆盖原始 MCP、原生 DSH 入口或其他 DSH 进程。查询到点击之间仍可能被其他程序改变。回执只存在于当前插件加载周期；重启/卸载后的未知动作应先观察，不可直接重发。MCP 请求超时和远端输入完成是不同事件；超时后的远端结果仍可能未知。

`not_verified` 只表示驱动报告点击成功；`expected_condition_observed` 只表示之后观察到了条件，不证明业务完成、条件由本次点击造成，或外部操作恰好执行一次。

## 失败样本与归因

- 初始回归 24 项：19 fail、5 pass；用于验证既有缺口，保存 red.log。
- 真实 MCP 返回数字 ID，与上游 UIElementInfo 的旧复合 ID 注释不同。新增 numeric-id-red.log 后修正候选，未更改驱动。
- 分类专项先失败后修正，见 classification-red.log。
- native-01～04 均在初始查询失败，没有点击。快照只有外壳；页面正文确已加载。native-05 的诊断确认 beforeVisible=false、显式 show 后 afterVisible=true，并首次完成点击。原因定位在本轮隐藏启动的测试窗口可见性；此前朋友反馈的点击缺陷没有可重放样本，仍不能认定同源或已彻底修复。
- native-05 为开发正例，不计入最后三轮；06～08 固定三轮全部保留，不补选成功样本、不计算性能中位数。

## 用法与兼容性

保持入口 `dsh-system-enhancement-package/computer-click` 和工具名 `suite_computer_click`。
配置仍为 `enabled: true`、`serverName: sep_windows`，verificationTimeoutMs 默认 5000、maxReceipts 默认 1024、maxObservationBytes 默认 8192。
MCP 工具白名单必须包含 `ui_find,ui_snapshot,ui_click,ui_wait`。隐藏窗口或不可用无障碍树将被拒绝；增强插件不会自行修改其他应用的启动参数、权限或焦点策略。上游 ui_click 可能激活目标窗口，不承诺后台无打扰。

先使用 MCP 观察窗口和目标，再提交：

```json
{"requestId":"unique-action-id","windowHandle":"从真实观察取得的十进制句柄","target":{"name":"从观察取得的精确名称","controlType":"Button"},"expected":{"mode":"appear","name":"预期出现的文字"}}
```

必须使用有效数值句柄，示例中的中文占位符不能直接执行。旧参数大部分保留；仅 ID 与 parentElementId/active_dialog 同时使用现在要求补充名称或 automationId，避免范围被 ID 快捷路径忽略。未知或不符合 1.3.24 正文格式的驱动不能当作成功。

## 集成与证据入口

- [源码](src/computer-click.js)、[定向测试](tests/click.test.mjs)、[真实测试](tests/native.mjs)。
- [候选绑定](CANDIDATE.json)、[完整证据索引](EVIDENCE-INDEX.json)。
- `DSH-SEP-Computer-Click-r1-source-overlay.zip` 仅为源码补丁候选，不是完整安装器；不包含私人数据、密钥、node_modules 或 MCP 可执行文件。
- 后续部署须从当前程序构建新候选，成对更新 SEP 与严格 peer 声明，重新生成兼容性报告和绑定计划；不能覆盖运行中的目录或沿用旧指纹确认。本轮没有发起日常切换。

参考：[官方 DSH Computer Use](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/docs/subsystems/computer-use.md)、[固定 Windows MCP 源码](https://github.com/sbroenne/mcp-windows/tree/v1.3.24)、[上游 Electron 测试启动配置](https://github.com/sbroenne/mcp-windows/blob/v1.3.24/tests/Sbroenne.WindowsMcp.Tests/Integration/ElectronHarness/src/main.ts)。
