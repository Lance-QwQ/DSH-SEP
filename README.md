# DSH SEP · Windows Beta 测试版

**DEEPSEEK HARNESS SYSTEM ENHANCEMENT PACKAGE（DSH 系统增强套件）**

DSH SEP 在 DeepSeek Harness 上增加四层记忆与本地 RAG、受管子任务、文件修改辅助、受控更新、恢复和点击增强。本项目独立维护，SEP 原创部分采用 [MIT](LICENSE)，第三方组件保留各自许可。

当前发布线：**SEP 0.2.0-beta.1 / DSH 0.1.7-rc.2 / Windows x64**。

[Beta 安装包](https://github.com/Lance-QwQ/DSH-SEP/releases/tag/v0.2.0-beta.1) · [本版说明与范围](release/beta.1/RELEASE-NOTES.md) · [本版源码](source/beta.1/README.md) · [文档导航](docs/DOCS_INDEX.md) · [问题反馈](https://github.com/Lance-QwQ/DSH-SEP/issues)

## 安装与更新

Full 包含 DSH 与 SEP，适合在新目录建立独立实例；Only 提供 SEP 与必要适配，需要精确匹配的官方 npm DSH rc.2 来源。均按包内 README 使用，在该实例的 .env 中填写自己的 Key，不覆盖已有 DSH 或自装插件。

Update 仅适用指定 c0f local.8 程序图，**不支持旧公开 Alpha 或其他同版本图直接升级**。旧用户可先建立独立 Beta 空白实例；本版不自动迁移旧私人资料。不要解压覆盖旧目录。应用实例隔离不是操作系统安全沙箱。

主窗口关闭会保留后台；使用应用菜单或托盘“退出 DSH SEP”才能完整结束。

## 增强能力

- 四层记忆：L1 模型上下文，L2 项目与事项，L3 偏好、重要资料和项目总目标，L4 按需归档；记忆学习与引用可分别控制。Mem0 只使用同项目允许的消息。
- 历史来源追溯与按需原文展开，不将压缩摘要自动当作完整原文。
- 经 suite_delegate 创建的只读子任务具备受管并发、返工、超时、取消与记录；Profile 级模型和预算控制另行生效。
- Safe Change 为受支持的文件变更提供候选与审阅；普通 Shell 没有全局强制隔离试改保证。
- DSH 与 SEP 分别检查更新，展示兼容性报告，以具体计划确认和持久化治理控制切换与恢复。
- 点击插件减少不必要观测返回，对异常提供方设置有界等待；不确定是否已执行的点击不自动重复。

## 验证范围

Full/Only 各三轮 Host、独立 Windows Beta 差分后三轮、文件完整性、原版来源保护、源码绑定和受控更新已有固定证据。GUI 与在线下载验证见发行补充报告。兼容性 unknown 不等于故障，也不等于已经证明兼容；不承诺所有私人插件、所有外部服务或多日高负载全部通过。

[旧 Alpha 说明](docs/history/README-alpha-20260924.md)保留历史状态；旧版文档与源码不能替代本版范围说明。完整源码入口为 source/beta.1，其中基准源码与四项版本补丁分别标明，不伪称所有上游原生二进制已可重现构建。
