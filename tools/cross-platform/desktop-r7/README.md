# DSH SEP r7：真实桌面隔离验证

**本轮验证已完成，但跨平台开箱可用性尚未全部通过。Windows 日常版未改动。**

| 项目 | 状态 | 本轮证据 |
|---|---|---|
| Linux x64 / WSLg 桌面生命周期 | pass | 最终三轮，每轮 9 项；真实页面、关闭保留、二次启动恢复同一窗口/宿主、正常退出 |
| macOS 15 arm64 / GitHub VM 桌面生命周期 | pass | 最终三轮，每轮 9 项；固定源码构建、原生宿主及真实 Electron |
| POSIX 短临时路径与载荷链接规则 | pass | Linux / macOS 各 10 项；macOS 真实 .app 共 259 个普通文件、14 个内部链接 |
| Windows 相关组件回归 | pass | 9 项打包 + 1 项环境保持；4 项 POSIX 专属测试在 Windows 跳过 |
| Linux 空白默认工作区 | fail | 实际 RPC 返回 system Documents directory is unavailable |
| 完整 Full/Only 桌面分发及完整 SEP 配置 | not_run | 本轮是独立载荷 + 受控宿主组合，不是完整发行安装包 |
| 人工拖动/托盘点击、macOS 系统权限与签名 | not_run | Inspector/API 自动事件不等同真人桌面验收 |

## 已修复

真实长中文安装路径触发 Electron 单实例 Socket path too long，窗口出现前终止。新 bootstrap 使用按 uid/安装身份隔离、0700 权限的短 POSIX 临时目录，并拒绝异常链接/权限。后续实测通过；源码已同步，未部署到 Windows 日常版。

## 仍需处理

- Linux 隔离 HOME 没有有效 Documents 映射，默认工作区自动创建失败；建议完整安装模板显式绑定实例内 documentsDirectory。
- 健康检查派生配置未挂载 SEP 品牌等完整桌面入口，不能把依赖文件齐全视为全部插件已启用。
- 部分正常退出样本伴随 fetch/onboarding 请求错误日志，未证明完全修复；不以退出码 0 掩盖。
- 完整 Electron 安装载荷、原生启动入口、Linux 托盘、macOS 权限和签名等见 [后续顺序](NEXT.md)。

## 证据入口

最终测试代码：`baa82c7b8e9c4cd15e783ce1bf05cc9c5fdbe938`；[macOS 最终运行](https://github.com/Lance-QwQ/DSH-SEP/actions/runs/36549016380)。Linux 为 linux-attempt-04，macOS 为 macos-attempt-04。最终截图等待字体就绪、两次动画帧和 1 秒绘制稳定；等待时间不用于性能比较。

[状态与输入绑定](RESULT.json) · [历史解释](INTERPRETATION.md) · [未完成事项及归因](OPEN-ISSUES.md)。所有首次失败和补跑分开保留，旧报告不改字节。

Linux attempt-01 的最终零残留来自失败后控制器 SIGTERM 与关闭 Recovery；最终成功三轮则正常退出，无该强制清理。macOS 最终三轮也为正常退出，所跟踪 Electron/宿主 PID 均结束；不扩展为系统所有资源泄漏已经排除。

仅更新专用测试分支；main、Release、Windows 日常版及私人数据均未改动。
