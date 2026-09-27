# DSH SEP 0.2.0-beta.2 / Windows x64

DSH SEP 是为 DeepSeek Harness 增加项目记忆、本地 RAG、受管任务、受控更新、故障恢复和点击辅助的增强套件。本版基于 DSH 0.1.7-rc.2，发布级别为 Windows Beta 测试版。

本次修复 P1 对原生图片的一刀切拦截：有图像能力的已许可模型可以继续处理用户附件、原生 `read_image` 和工具图片；原模型许可、输入/输出限制与预算保护保留。历史卸载图片只作为文字占位，不会自动恢复上传。

| 下载 | 用途 |
|---|---|
| `DSH-SEP-Full-0.2.0-beta.2-Windows.zip` | 包含 DSH、SEP 和运行环境；在新目录创建独立空白实例。 |
| `DSH-SEP-Only-0.2.0-beta.2-Windows.zip` | SEP 插件、必要宿主适配及依赖；安装前需提供精确匹配的官方 npm DSH rc.2 来源。 |
| `DSH-SEP-Update-0.2.0-beta.2-Windows.zip` | 仅适用于指定公开 Beta.1 程序图的受控差分更新。 |
| `DSH-SEP-Source-0.2.0-beta.2-Windows.zip` | 完整基准源码、修复、测试、安装脚本、版本补丁和来源对应记录。 |

Full / Only 按包内 README 安装到尚不存在的新目录，再在新实例的 `.env` 填写自己的 Key。不要直接解压覆盖已有 DSH、SEP 或用户数据。实例隔离不等于虚拟机或操作系统安全沙箱。Only 不是对任意官方桌面目录都适用的覆盖补丁。

参见 [发布说明](RELEASE-NOTES.md)、[更新范围](UPDATE-SCOPE.md)、[验证范围](VERIFICATION.md) 和 `SHA256SUMS.txt`。SEP 原创部分采用 MIT；DSH 和第三方组件保留各自许可。旧 Alpha / Beta.1 版本及历史证据保留。
