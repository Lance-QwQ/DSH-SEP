# 原生浏览器补验复现契约

仅用于隔离合成环境。固定目标 DSH 0.2.1-alpha.1、Node 24.21.0、pnpm 11.7.0；用已封存 bundle.18 tgz，SHA-256 e738e4878de3ebda088dfec8fc987853c1f16796492f9b7678e00113ede1d4cd。不得使用日常库、私人 credentials 或 .env。

1. 在真实 D: 目录创建新阶段目录，复制 native-browser-harness.json 为其 official-harness/package.json，仅把占位的 dsh-sep-bundle file 依赖替换为核验后的 tgz 完整路径。使用 ignore-scripts，显式指定 D: store-dir/cache-dir/XDG_STATE_HOME 安装；全部版本已固定。浏览器静态包的外部库由载具应用提供，取自固定官方锁文件，不是 SEP 新增依赖。
2. 设置 SEP_PHASE_ROOT 为阶段目录、SEP_OFFICIAL_HARNESS 为其 official-harness、SEP_OFFICIAL_SOURCE 为固定官方源码目录（5badb15009ae1756c3afe0ae0cef1faafc290ccc）、SEP_BUNDLE_TEST_ROOT 为新空白结果目录。可用 SEP_TEST_EDGE 指定 msedge.exe。源码内的 fixture 使用真实 Loader/WebServer/Connection/BrowserAuth，不读取 ambient key。
3. 用 Node 运行 tools/bundle-install/native-browser-assets.mjs。它输出 assets/kernel.js、kernel.css 和 BUILD-INPUTS.json；环境定义与 node:module alias 取自官方 apps/web/vite.config.ts 和 stub，字体作为 data URL，静态库解析回落到载具 node_modules。
4. 用 Node --test --test-reporter=spec 运行 tools/bundle-install/tests/native-browser.test.mjs；另运行 native-settings.test.mjs 复验15项宿主/HTTP场景。两个浏览器用例均有截止，不需要外部模型。

正例使用真实 AppWebEntry、ModuleSystem 默认脚本网络传输、真实客户端 Loader、UI renderer、SettingsRoot、locale、shortcuts、ConfigForms、Remote/Gateway。测试自有最外层 root/sidebar.settings 席位、空 sessions 快照与只允许“无会话”的 scope adapter 是显式夹具；并非完整 DSH sidebar/workspace/session UI，也未验证完整原生设置功能清单或视觉主题。

重连必须 Connected 且连接代次 id 增加。卸载通过官方 ClientEntries.sync 接收新 Host 图，未声称本轮认证了 HMR 通知传输。负例只阻断本次自有浏览器的 /plugins 脚本请求。

最终清理路径必须分别记录：AppWebEntry.dispose → Browser.close → 受控根 close → 宿主 fiber.dispose，P2 owner.lock 消失。失败运行若测试finally强制停止自有浏览器，保留 CLEANUP-EXCEPTION；不得把后续零残留倒推成当场关闭成功，也不声明全系统零句柄。

复现日志、完整依赖锁和截图见本轮证据索引。封存样本不覆盖；用新输出目录重跑。
