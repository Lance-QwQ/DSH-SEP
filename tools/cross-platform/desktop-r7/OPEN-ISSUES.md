# r7 新发现：空白默认工作区尚未适配

**状态：fail（Linux 空白实例自动创建默认工作区）；并非桌面进程崩溃。**

稳定绘制后的截图 `linux-attempt-04/round-1.png` 明确出现 `Unable to create default workspace`。随后在同一合成实例中调用实际 `workspace/initializeDefault` RPC，得到 HTTP 200 / 业务错误 `gateway/internal`，message 为 `system Documents directory is unavailable`。证据：`DEFAULT-WORKSPACE-DIAGNOSTIC.json`。

实际入口 `packages/api/workspace-controller/src/default-directory.ts` 在 Linux 使用 `xdg-user-dir DOCUMENTS`，并有意拒绝返回 HOME 的情况。测试实例的 HOME/XDG_CONFIG_HOME 由 SEP 启动器隔离；实际运行 xdg-user-dir 返回了这个隔离 HOME，而不是有效文档目录。Ubuntu 脚本对含空格 XDG_CONFIG_HOME 还报告了 `unexpected operator`，但“返回 HOME 后被拒绝”已经足以说明本次明确错误。

当前原生测试候选来自健康检查模板，未给 `workspace-controller.documentsDirectory` 配置实例内的文档目录。应在后续完整桌面安装模板中显式配置实例内目录、验证真实初始化/工作区持久化，不宜退回共享系统 Documents，也不宜取消源代码对禁用/无效目录的拒绝。

这一失败不被三轮窗口生命周期 pass 覆盖。当前尚未修复到候选，也没有据此修改 Windows 日常版。

另外，健康检查模板只插入 SEP memory UI、Recovery、continuation 和 suite 等必要入口，没有插入 `dsh-sep-brand`；包图包含某插件不等于对应 UI 已启用。因此截图没有 SEP 品牌块是当前测试配置覆盖不足，不能据此宣称完整 SEP 桌面配置已验收。完整分发阶段必须使用完整且受绑定的 SEP 桌面配置，并重新验收。

## 退出日志仍有待收紧项

Linux attempt-04 第 1 轮，以及 macOS attempt-03 中，关闭附近可见 `fetch failed` / `UND_ERR_SOCKET` 和 `dsh-desktop:onboarding-api-key: backend unavailable`（个别为连接拒绝）。这些样本仍然退出码 0、所跟踪宿主 PID 已退出；因此不是已证明的进程崩溃或泄漏，但也不能称为“日志无错误”。下一阶段应核对关闭期间前端请求取消与宿主收尾时序，并独立固定回归，不靠三轮通过宣称该日志问题已修复。
