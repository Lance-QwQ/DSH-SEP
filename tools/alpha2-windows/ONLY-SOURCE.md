# Only 的官方来源契约

Only 使用 `manifest.json.required` 列出的固定官方组件原字节来补齐完整程序图，其余 SEP、适配文件及依赖来自 Only 自身。不是把整个现有安装目录复制过来；不会读取来源的 .env、会话、记忆、插件设置或工作区。

支持来源形态为 `node_modules/@deepseek-ai/...` 的展开目录。包名、版本与 manifest 哈希见 `docs/ONLY-REQUIRED.json`；每个必需文件还具有独立大小和 SHA-256。未知布局、文件被修改、硬链接/路径别名均拒绝。官方桌面 ASAR、全局 pnpm 虚拟存储等其他布局不自动转换。

本轮来源逐项对比 311 个精确版本的官方 npm tarball，先核 SHA-512 SRI，再核包内成员。4239 个文件匹配后进入 `required`；5 个经过构建适配的客户端文件留在 Only 自身的 payload，不冒充官方原字节。完整版本、tarball 地址、摘要及成员列表见 `docs/ONLY-REQUIRED.json`。这不把开发宿主的其他文件、SEP/file 依赖或测试数据视作官方内容。

要自行准备来源，可将 `docs/ONLY-HOST-package.json` 复制为新目录的 `package.json`，使用 Node 24.21.0 与 pnpm 11.7.0，以 `node-linker=hoisted`、`package-import-method=copy`、`--ignore-scripts` 安装固定公开依赖（需访问 npm）。必须使用普通单链接文件；pnpm 默认硬链接会被安装器拒绝。清单还含程序图保留的其他平台可选模块；npm 安装若限制其平台，需在该独立来源目录使用 pnpm 的 `--force` 获取这些固定包，仍不运行安装脚本。这不把目标 Windows 变成跨平台认证版本。不要使用指向私人镜像或未知来源的凭据配置。安装产生的字节仍必须通过 Only 的精确哈希门禁；在线解析依赖不是本轮已经证明的完整公网安装闭环。

Only 安装将已核验文件复制到新的 SEP 实例，而不是覆盖官方 DSH 的运行目录。原官方实例可继续独立使用。安装后的 `program` 为完整组合程序，不能用“删除任意 SEP 文件”代替卸载；停止并移除该独立安装目录即可保留原官方实例。删除用户后来添加的资料前应自行备份。
