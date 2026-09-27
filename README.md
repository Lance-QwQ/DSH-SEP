# DSH SEP · Windows Beta 测试版

**DEEPSEEK HARNESS SYSTEM ENHANCEMENT PACKAGE（DSH 系统增强套件）**

DSH SEP 在 DeepSeek Harness 上增加四层记忆与本地 RAG、受管子任务、文件修改辅助、受控更新、故障恢复和点击增强。本项目独立维护，SEP 原创部分采用 [MIT](LICENSE)，第三方组件保留各自许可。

当前发布线：**SEP 0.2.0-beta.2 / DSH 0.1.7-rc.2 / Windows x64 Beta**。

[下载 Beta.2](https://github.com/Lance-QwQ/DSH-SEP/releases/tag/v0.2.0-beta.2) · [修复及范围](release/beta.2/RELEASE-NOTES.md) · [完整源码](source/beta.2/README.md) · [文档导航](docs/DOCS_INDEX.md) · [反馈问题](https://github.com/Lance-QwQ/DSH-SEP/issues)

## 本版修复

修复原生 `read_image` 成功后被 SEP 的旧 P1 图片限制拦截，导致下一次模型请求和携带该历史图片的文本继续请求失败的问题。现按宿主明确的图像能力处理原生附件，并按每次图片出现保守预留预算；原有模型、输入输出及金额限制保留。取消或插件退出发生在图像能力查询期间时，不再继续预留和派发。

这是图片链路修复。DSH 宿主版本及其他增强能力保持，测试结论与限制见[本版验证说明](release/beta.2/VERIFICATION.md)。

## 安装与更新

Full 包含 DSH 与 SEP，用于在新目录建立独立空白实例；Only 提供 SEP 与必要适配，需要精确匹配的官方 npm DSH rc.2 来源。按包内 README 安装，在新实例的 `.env` 中填写自己的 Key。不要解压覆盖已有 DSH、SEP 或用户数据。

Beta.2 Update 只接受公开 Beta.1 的固定 `7a4acf5f…` 程序图。旧 Alpha、local.8、私人日常图及同版本其他字节均不适用。更新前会检查实际程序、插件与数据状态，展示报告，并要求确认具体计划；不会用新的空白库覆盖原库。见[更新范围](release/beta.2/UPDATE-SCOPE.md)。

关闭主窗口保留后台，使用应用或托盘“退出 DSH SEP”完整结束。独立实例不等于操作系统安全沙箱。

## 增强能力

- 四层记忆：L1 模型上下文，L2 项目和事项，L3 偏好、重要资料和项目总目标，L4 按需归档；记忆学习与引用可分别控制。Mem0 只使用同项目允许的消息。
- 历史来源追溯和按需原文展开，不将压缩摘要自动当作完整原文。
- 经 `suite_delegate` 创建的只读子任务具备受管并发、返工、超时、取消和记录；Profile 级模型和预算控制另行生效。
- Safe Change 为受支持的文件变更提供候选与审阅；普通 Shell 没有全局强制隔离试改保证。
- DSH 与 SEP 分别检查更新，展示兼容性报告，并依据具体计划与持久化记录进行切换和恢复。
- 点击插件减少不必要观测返回，对异常提供方设置有界等待；不确定是否已执行的点击不自动重复。

## 验证与历史

本版按实际公开包记录图片修复、安装和受控更新验证。Beta.1 的原生 GUI、独立 Windows 和其他历史验证保留原范围，不冒称本轮重跑；本机合成 HTTP 不等于官方在线视觉理解。兼容性 `unknown` 不等于故障，也不等于已证明兼容。所有私人插件、外部服务和多日高负载未获全面保证。

已安装最新版时，历史 Alpha 缺少更新元数据可能造成 `metadata-unavailable` 提示；该状态归并限制未在本次修复。

[Beta.1 历史说明](release/beta.1/RELEASE-NOTES.md) · [Beta.1 固定源码](source/beta.1/README.md) · [Alpha 历史](docs/history/README-alpha-20260924.md)。当前完整源码入口为 `source/beta.2`，来源、版本绑定和交付元数据变化分别记录，不宣称所有上游原生二进制均可重现构建。
