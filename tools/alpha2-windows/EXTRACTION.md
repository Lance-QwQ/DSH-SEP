# Windows 解压与安装路径说明

适用：`windows-package.2` 的 Full / Only ZIP。本文件为交付侧说明；包内 README、清单和程序字节不因后续补充该说明而改变。

请使用较短的真实本地解压目录，例如 `D:\SEP-Full` 或 `D:\SEP-Only`，不要让解压软件自动使用完整 ZIP 文件名作为深层目录名。传统 Windows 工具可能仍受 260 字符限制：本轮 Full 最长 ZIP 成员名为 182 字符，Only 为 170 字符。按完整路径不超过 259 字符保守计算，解压根路径分别不应超过 76 / 88 字符（含盘符与已有目录，不含最后的分隔符）。

全新安装目标也建议使用短路径，例如 `D:\DSH-SEP-Full`、`D:\DSH-SEP-Only`；目标必须不存在，父目录预先存在，不能使用目录联接或符号链接。解压目录与安装目标必须分开。

验证工具支持 Win32 扩展路径，可在深层隔离目录解压；其通过不能替代 Windows 资源管理器、所有版本的 `Expand-Archive` 或任意第三方解压软件的验证。本轮首次深层解压失败及后继修复均保留在验证记录中。

解压完成后，按包内 `README.md` 使用随包的 `runtime\node\node.exe` 执行 `installer.mjs`。Only 还须提供 `docs/ONLY-SOURCE.md` 所列的精确官方组件来源；它不接受任意官方安装目录。首次安装没有模型 Key，启动后配置，不要把已填写的 `.env` 放回分发包。

本机直接运行 `start.ps1` 时，Windows PowerShell 执行策略返回 `SecurityError / UnauthorizedAccess`，该路径单列为环境阻断，不能引用为本轮通过。测试没有修改系统执行策略。需要直接启动并显示诊断时，可在安装目标目录执行随包的 Node 入口：

```powershell
.\runtime\node\node.exe .\launch.mjs
```

`start.vbs` 为包内原有入口，其实现含子进程级 `-ExecutionPolicy Bypass`，没有永久修改系统策略；它与直接执行 PS1 的结果分别记录，详见 `VERIFICATION.json`。不把 VBS 的通过算作 PS1 阻断已解除。

完整性检查应针对交付的原 ZIP，例如：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'D:\Downloads\DSH-SEP-Full-Windows-x64-Alpha2-windows-package.2.zip'
```

将输出与同次交付的 `SHA256SUMS.txt` 核对。摘要提供字节完整性核对，不等于数字签名或独立的发布者身份认证。
