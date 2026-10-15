# bundle.19：官方浏览器自动激活与原生设置壳补验

本阶段范围内 pass。运行包仍为 **0.2.1-beta.3-bundle.18**，本次没有程序修复、版本递增或重新打包。固定目标 DSH 0.2.1-alpha.1；仅 D 盘合成 Windows/Edge 环境，日常版、GitHub 和默认 pending 准入保持原状。

## 验证结论

真实官方 AppWebEntry 读取 Host 注入图，经真实网络脚本传输、ModuleSystem 与客户端 Loader 自动激活 SEP；没有手工调用 SEP 前端 apply，也没有伪造 slots、locale 或 RPC。BrowserAuth 通过索引 token 换签名 cookie，未认证索引拒绝。原生 SettingsRoot 模态壳展示通用设置以及 SEP 的三个页面，导航和操作均由实际鼠标/键盘输入执行。

原生记忆页可保存 recall=false；会话默认金额由100改为25后，账本 initialSpent=1、entries=[] 保持。刷新浏览器重新自动发现插件并读回设置。官方 Connection 重连必须出现更大 generation.id 且状态恢复 connected，不能仅凭旧连接仍 connected 判过。评估页能导航且 token 费用说明可见；本轮不启用付费评估。

受控根正常关闭后，官方客户端 ClientEntries.sync 消费新 Host 图，撤回 SEP 导航和已卸载模块，通用设置保留；原路由为404。此处直接提交真实 Host 新图给官方同步入口，**没有认证 HMR 通知传输**。负例仅在测试自有 Edge 中阻断 /plugins 脚本，页面明确显示 bootstrap 缺失，未打开设置、不修改账本、不发模型请求，宿主仍可正常关闭。

## 明确的夹具与未认证范围

最外层 root/sidebar.settings 席位、空 sessions 快照及只允许无会话的 session scope adapter 为测试载具，已随复现材料保存。实际 SettingsRoot、General、三个 SEP 页面、renderer、locale、shortcuts、ConfigForms、Remote/Gateway、Loader、ModuleSystem 与 BrowserAuth 均为真实组件。没有接入完整 DSH sidebar/workspace/session 主界面，也不认证全部原生设置项或完整视觉主题。截图用于核对已覆盖页面，不代表桌面外观验收。

完整 GUI 仓库链接安装、全应用独立退出截止、内层 Runtime 初始化失败回滚、全部 peers 的运行功能及跨平台认证仍未完成。原 bundle.18 包内 notVerified 是封存时声明；本轮是外部补充证据，不回写该包或旧证据。下一次形成运行候选时再同步相应包内契约。

专用项目宿主和 tools/result 最终发布前提保持；两子任务、只读、超时、取消与记录仅限定 suite_delegate 创建的任务，Profile 级预算/模型门禁独立，普通 Shell 保障不扩大。

## 统计与异常

本轮最终源码新浏览器固定用例2/2；上一阶段原生/HTTP回归15/15。本轮**新鲜执行17项**，均无失败/取消/跳过/todo。历史322项中复验15项，继承307项证据；加新增2项后累计324个固定定义。这不是本轮重跑324项，也不是324种图形场景。

先前并行历史运行中100ms第二次 close 失败仍未归因，未被标为修复。本轮早期失败均保存：依赖下载中断、静态包由载具提供依赖、字体 loader/构建输入登记、官方浏览器 process 常量缺失、载具 client 导出/空会话作用域、CDP DOM 结果序列化及标签断言。这些是环境或夹具推进记录，不据此宣称运行包曾存在且已修复相同缺陷。

最终两个浏览器均通过 AppWebEntry.dispose、Browser.close、受控根 close、宿主 fiber.dispose 正常收尾，最终 P2 owner.lock 不存在；本阶段匹配的 Node/Edge/esbuild 进程为零。负例在明确的预期加载失败后走上述收尾，不依赖后续恢复。早期断言失败的自有浏览器有强制测试清理并保留 CLEANUP-EXCEPTION，最终零残留不倒推其当时成功。既有宿主故障回归仍包括先blocked、恢复测试所有权后重试close的路径；不把blocked改写为当场清理成功。未审计全系统句柄。

## 证据与复现

- [绑定索引](BUNDLE-NATIVE-BROWSER-VERIFICATION.json)
- [复现步骤](../tools/bundle-install/tests/NATIVE-BROWSER-REPRODUCTION.md)
- 本地阶段：D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase4-native-browser-r1
- 最终浏览器日志 sealed-r2-browser.log；原生回归日志 sealed-native-r1-native.log。
- 最终截图与逐项回执在 tests/sealed-r2；完整构建输入在 assets/BUILD-INPUTS.json，依赖在 official-harness/package.json 与 pnpm-lock.yaml。
