# r6 后续：桌面载荷与交互验收

本轮优先打通可独立核验的受控宿主安装、隔离与更新事务。它只完成 r5 后续清单中的部分安装及更新范围；Electron 载荷和交互没有因本轮通过而自动完成。Windows 日常版保持原位，不使用 Linux / macOS 产物替换。

1. 在新 D 盘输出目录制作 Linux x64 Electron 载荷：为 package-target.ts 和 prepare-dsh.ts 增加明确 Linux 目标及入口；固定 Electron 版本、下载来源与摘要；不借用 Windows 二进制。
2. 为 macOS 的 .app 框架链接和可执行权限建立受控归档规则。现有严格普通文件策略不能靠忽略身份检查解决；先用合成 .app 验证内部链接约束，再验证真实未签名内部候选。签名与公证另列状态，不虚报。
3. 将桌面载荷加入 Full / SEP-only 候选支持清单后重新安装到新目录。Only 仍绑定明确受支持的宿主文件集合；若要支持未改官方安装，需针对该具体分发形态另做适配与验证。
4. Linux WSLg 验证真实窗口打开、拖动、关闭留后台、重新打开、托盘与有界退出；macOS CI 自动启动不能替代真实桌面权限、输入点击、托盘及用户交互验收。对不可验证项明确保留 not_run/blocked。
5. 再做官方 DSH 与 SEP 实例并存，以及真实自装插件、非空记忆与配置保留。当前两个 SEP 实例和合成文件标记的证据不覆盖这两项。

不追加付费模型测试；不更改固定验收标准；测试分支可以继续，main 和 Release 不变。出现需付费签名或另获真实设备权限等重大决策时再询问。

## 已定位的源码入口（只读调查，尚未实现）

- apps/desktop/scripts/package-target.ts:49–55 的目标类型和平台类型尚无 Linux。
- scripts/prepare-runtime.ts:32、40 将非 mac 目标按 Windows 下载，同时可执行路径只区分 Windows 与 .app；不能只给 package-target 加一个字符串。
- scripts/prepare-dsh.ts:44 的非 Windows Electron 路径固定为 .app。
- scripts/desktop-build-version-discovery.ts:90、desktop-upload-plan.ts、upload-target.ts 也采用双平台映射。内部目录构建阶段必须明确禁用上传，不让 Linux 默认为 macOS 发布目标。
- prepare-dsh.ts 的 macOS 原生模块签名步骤以及真实 .app 链接需要单独处理。任何未签名内部包必须如实标注，不能通过忽略错误声称签名完成。

这些定位是下一阶段的实现依据，不属于本轮已适配功能。本轮没有执行上述会下载 Electron 或构建桌面发行物的旧脚本。
