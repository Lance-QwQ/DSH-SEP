# Windows x64 · DSH SEP 0.2.1-beta.3

本页对应两份 Windows 安装资产：[Full](https://github.com/Lance-QwQ/DSH-SEP/releases/download/v0.2.1-beta.3/DSH-SEP-Full-0.2.1-beta.3-Windows-x64.zip) 和 [Only](https://github.com/Lance-QwQ/DSH-SEP/releases/download/v0.2.1-beta.3/DSH-SEP-Only-0.2.1-beta.3-Windows-x64.zip)。统一分发版本为 **0.2.1-beta.3**；安装包沿用已验证的原始字节，包内仍显示 DSH `0.2.1-alpha.2`、SEP `0.2.1-beta.3-alpha2-adapter.1`、分发修订 `windows-package.2`。这不是 RC，也不支持任意未来 DSH 版本。

## 选择安装包

- **Full** 包含固定 DSH、SEP、必要宿主适配及 Node、Electron、Python 等运行支持。
- **Only** 包含 SEP、必要适配与运行支持，安装时还需精确匹配的官方 DSH npm 组件来源。它不是向任意官方桌面目录添加插件，也不是在插件市场粘贴仓库链接的通用安装包。

两者只接受新目录，建立独立空白库、工作区、账本、凭据模板与运行锁；不覆盖已有官方 DSH 或 SEP，不迁移旧库，不执行原位升级。

## 安装

1. 下载所需 ZIP，核对下列 SHA-256。完整解压到真实本地目录，建议使用短路径。安装目标的父目录须已存在，目标目录须不存在；不使用符号链接、目录联接或路径别名。
2. Only 用户先按包内 `docs/ONLY-SOURCE.md` 准备来源。仅支持匹配清单的 `node_modules/@deepseek-ai/...` 展开布局；官方桌面 ASAR、全局 pnpm 虚拟存储等不会自动转换。来源的每个必需文件都须通过大小和 SHA-256 核验，硬链接或已修改文件会被拒绝。
3. 在解压目录打开 PowerShell，按包型执行下面一条命令。路径只是示例，应替换为自己的真实新目录：

```powershell
# Full
.\runtime\node\node.exe .\installer.mjs --destination 'D:\DSH-SEP-Full'

# Only：--host-root 指向已准备的精确官方来源
.\runtime\node\node.exe .\installer.mjs --destination 'D:\DSH-SEP-Only' --host-root 'D:\Official-DSH-Alpha2'
```

4. 安装成功后，到目标目录双击 `start.vbs`。首次 `.env` 中 `DEEPSEEK_API_KEY` 为空，可先打开配置界面并填写自己的凭据。不要重新分发填写后的 `.env`。
5. 关闭主窗口可能保留后台；结束实例请使用托盘退出。不要按进程名称批量终止 Electron 或 Node。

Only 的来源准备文档指定 Node 24.21.0、pnpm 11.7.0、`node-linker=hoisted`、`package-import-method=copy` 和 `--ignore-scripts`。部分固定可选模块可能需要该文档说明的 `--force`。最终仍以精确文件核验为准；不把在线解析依赖称为已经验证的完整公网安装闭环。

## 已验证范围与已知限制

两份固定 ZIP 的全新安装与安装后运行检查通过；另有 16 项服务检查、共四轮核心桌面冷启动和两次 VBS 重开证据。核心桌面启动使用既有观察参数；不据此认证首次无观察启动、物理托盘操作或所有控件。

直接运行 `start.ps1` 在本轮机器上被 PowerShell 执行策略阻止，两次重开仍记为 **blocked**。Node／VBS 通过不能解释为 PS1 策略问题已修复。生产 VBS 使用子进程级 `-ExecutionPolicy Bypass`，未更改系统持久策略。企业安全策略也可能限制该入口；请按本机管理要求处理。

短路径解压仅核验了记录中的 Windows PowerShell 版本，不保证 Explorer、任意解压工具或任意长路径。安装中断并留下 `INSTALLING.json` 时，保留现场并另选新目标重新安装，不删标记强行启动。

本轮未重新认证付费模型、所有插件、外部 Computer Use／MCP／WSL／Docker、私人库迁移或公网自动安装更新闭环。普通本机 Shell 也不因此获得全面操作系统沙箱保证。

限定脱敏检查覆盖所选字节模式及 ZIP、ASAR、gzip/TAR、JSON、内联源映射等受限解码；未解释发现为零。公开依赖的样例、上游构建路径和定界字符串按精确字节记录例外。这不是全面隐私审计或任意编码内容的无敏感信息保证。包内不预置用户凭据和私人运行库。

## 固定资产校验

| 资产 | 字节数 | SHA-256 |
| --- | ---: | --- |
| Full | 510886228 | `bdc09894307cbd53c8f120c454e3a80d5ee687341ff8de15d9079a15fbc64b04` |
| Only | 420827999 | `a1db5cb400a04d8b76536604de63cb018d14272b6d39e858da9d61755556ff79` |

本轮 Windows 源码检查点为 `f0a5f393648b1526f05abe78cfe02349bfbb3631`；包内构建基线 `fab50b9280a2f083ad478050d325a671918084ca` 与检查点含义不同。自有代码采用 MIT；第三方组件保留各自许可。校验和用于完整性核对，不等于发布者数字签名。

本次发布补充的第三方许可与对应源码说明见 [THIRD-PARTY.md](THIRD-PARTY.md)。SEP 自有代码 MIT 不替代第三方组件许可。
