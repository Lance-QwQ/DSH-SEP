# 修复已有 DSH SEP 的启动组件

本修补仅支持受清单绑定的 Windows Alpha 旧安装和已明确支持的本地修订。它更新指定程序与启动文件，保留现有资料、会话、Key、工作区及用户插件；不删除所有权锁、不重新初始化库、不恢复旧数据快照，也不修改 Windows 权限。未知版本或用户改过的受管程序文件会拒绝覆盖。

1. 下载同一发行修订的完整修补包，核对 SHA-256 并解压到新目录。**不要直接解压覆盖已有安装目录。**
2. 完整退出需要修补的 SEP（应用菜单／托盘“退出”）。正常运行的另一个官方 DSH 实例可保留。若旧 SEP 已经无法启动，不要自行删锁。
3. 在新包根目录运行预检；把示例路径换成实际已有 SEP 安装根目录：

   ```powershell
   .\repair.ps1 -Target 'D:\DSH-SEP'
   ```

   程序会显示计划哈希、目标程序图、变更数量及计划路径。预检会在目标 state 目录保存计划，不更改业务数据或程序文件。

4. 使用刚输出的实际计划路径执行：

   ```powershell
   .\repair.ps1 -Target 'D:\DSH-SEP' -PlanPath 'D:\DSH-SEP\state\startup-repair\实际编号\plan.json' -Apply
   ```

   也可明确加 `-Apply` 在一次命令中完成预检与发布：

   ```powershell
   .\repair.ps1 -Target 'D:\DSH-SEP' -Apply
   ```

5. 出现 pass 表示离线程序与启动文件发布完成。再用原快捷方式打开，检查窗口、工作区和记忆状态。不要把离线修补回执当成已验证真实模型服务可用。

若发生 `REPAIR_OWNER_ALIVE` / `REPAIR_OWNER_PRESENT`，说明该实例仍有进程：先正常退出再重试。未知入口、插件或配置变化会使旧计划失效，需重新预检；不要修改哈希绕过。

如果发布中途断电或进程终止，维护门禁可能保留。保留原包及计划，使用同一计划继续：

```powershell
.\repair.ps1 -Target 'D:\DSH-SEP' -PlanPath 'D:\DSH-SEP\state\startup-repair\实际编号\plan.json' -Apply -Recover
```

恢复只接受逐项已知的新旧字节并向前完成；存储日志不完整、未决业务写入或文件身份变化仍会阻断。不要手动删除 state、锁、维护标记或恢复旧库。反馈时提供发行修订和错误码，不发送 `.env`、会话正文或完整 state 目录。

PowerShell 策略阻止脚本时，在解压包根目录直接运行随包 Node，无需更改系统全局执行策略。Full、Only 和 Startup-Repair 三份包的相对入口相同：

```powershell
$repairBundle = (Resolve-Path -LiteralPath '.').Path
& '.\runtime\node\node.exe' '.\repair\repair-cli.mjs' prepare --bundle $repairBundle --target 'D:\DSH-SEP'
```

预检成功后，将下方计划路径替换为刚输出的真实 `planPath`，再执行：

```powershell
& '.\runtime\node\node.exe' '.\repair\repair-cli.mjs' apply --bundle $repairBundle --target 'D:\DSH-SEP' --plan 'D:\DSH-SEP\state\startup-repair\实际编号\plan.json'
```

仅在同一发布中途被终止且维护门禁保留时，用同一包和同一计划继续：

```powershell
& '.\runtime\node\node.exe' '.\repair\repair-cli.mjs' recover --bundle $repairBundle --target 'D:\DSH-SEP' --plan 'D:\DSH-SEP\state\startup-repair\实际编号\plan.json'
```
