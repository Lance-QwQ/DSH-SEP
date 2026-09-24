本文件为公开验收说明。文内开发机相对证据路径用于定位封存记录；原始日志、截图、进程现场和安装目录不随源码包交付。对应机器摘要在 Full/Only 的 docs/evidence/startup-validation.json；本轮小修补包追加结果见外层 DELIVERY-REPORT。

# Windows 实际安装启动验收（r2）

候选图 SHA256：`0b54ac82524c0a42db44d5b8a6ebbbca1773a28c8c361839d47f9c12760f35a3`。

本次使用空凭据、独立数据目录和实际安装的 bootstrap、恢复中心、宿主及 Electron。未触碰日常实例或官方实例，未调用模型。以下三份结果均为 `pass`。

| 项目 | 实际覆盖 | 结果 |
| --- | --- | --- |
| 修补旧公开安装 | 3 轮正常启动/停止；3 轮精确终止测试拥有的 center+host 后重开；3 个并发启动复用一个中心和宿主；`.env`、未激活的合成用户插件文件、中文工作区文件哈希保持 | 开发留存证据 `real-installed-evidence/2026-09-24T07-32-35.626Z-12b85c6c-b762-47a4-b037-1bbe236cd693/result.json` |
| 实际 Electron 入口 | 独立 profile、实际 `dsh-app://` 页面、DOM/截图与动画帧响应；第二 Electron 进程退出 0，原中心/宿主/代次不变 | 开发留存证据 `real-electron-evidence/2026-09-24T07-35-22.790Z-b46cf39c-cc37-4c37-9462-00f8855154d9/result.json` |
| 两份新安装并存 | Full 中文路径与 SEP-only 同时运行，不同进程和动态端口；停止一个不影响另一个；重开 Full 后停止 Only 仍保持 Full 运行；凭据哈希不变 | 开发留存证据 `real-coexist-evidence/2026-09-24T07-35-59.885Z-ac2448ac-d786-4fd6-8848-b808914bebe5/result.json` |

## 证据范围与清理归因

- 后台回归与两实例并存最终测试拥有的残留进程均为 0；均通过正常关闭收尾，无测试兜底强杀。后台回归的 3 次强制终止是预定故障注入，不是失败后清理。
- Electron 截图显示首次启动“内测声明”和 HARNESS/SEP 主界面外壳。该检查证明实际入口可渲染和响应；没有声称完成鼠标操作、全部功能、正常窗口关闭转托盘或模型调用验证。
- Electron 使用 CDP `Browser.close` 收尾，协议连接随应用结束返回 `CDP_CLOSED`，主/次 Electron 均退出 0，再正常关闭中心；无兜底强杀。
- 用户插件保留证据是一个未激活合成文件的哈希保留，不等同于第三方插件运行兼容性测试。
- 并存覆盖本次两份安装；不外推为任意官方 DSH 版本已验证。

## 历史失败保留

1. r1 真实回归通过 3 轮正常关闭和第一轮崩溃恢复，第二轮重开遇到 `DAILY_RESTART_BUDGET_EXHAUSTED`。原因是诊断层覆盖了 server 的 `startHost` 参数转发，丢失明确的 `manual:true`。已用真实 HTTP RPC 两轮 RED→GREEN 验证修复并纳入 r2。r1 结果保持原字节：`real-installed-evidence/2026-09-24T07-16-40.307Z-273d8b47-06cd-4f18-8d05-69afc991db1b/result.json`。
2. r2 前两次测试在新增端口审计处失败：测试误读未导出的 `runtime.connection`，产品宿主实际已启动。第二次补充异常栈明确为 `installed-worker.mjs` 的 `TypeError`。仅修正测试读取 `runtime.connectionFile`；产品、重启预算和数据未修改。这两份失败不算产品通过样本，也不算 r2 程序启动失败：`2026-09-24T07-29-42.826Z-57bd013d-e8a9-4ef5-9746-48a0b417d834`、`2026-09-24T07-31-32.543Z-6e4d937e-d65e-40c7-8c84-e6df32f80cec`。
3. 历史失败结果中的 `cleanRounds/crashRecoveryRounds/concurrentLaunches` 是计划数量，实际执行进度以同目录 `events.json` 为准。最终 r2 通过结果才完成表内全部数量。

旧安装从保留的真实预算耗尽状态进入 r2。没有等待预算窗口结束或人工改写恢复日志来获取通过结果。

测试源码：`real-installed.test.mjs`、`real-electron.test.mjs`、`real-coexist.test.mjs`、`installed-worker.mjs`。绑定哈希见 `real-installed-acceptance-bindings.json`。
