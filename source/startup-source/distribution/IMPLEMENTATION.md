# 分发骨架与受控修补接口

状态：合成单元／文件事务及 Windows 进程门禁测试 17/17 通过，日志 verification-01.log。尚未生成真实大候选、ZIP、公开发布，也没有修补日常实例。后续核心 overlay / bootstrap 仍由主任务统一封定；真实已安装 Only / Full 升级与 native HOME + P2 门禁整链必须另验。

## 规范源

- `build.mjs`：只新建输出；验证固定基线 graph、support、payload；套用逐项 before/after 哈希 overlay；装配统一 bootstrap；将 bootstrap、修补器和测试源码一并纳入 Source。不压缩 ZIP、不发布。
- `installer.mjs`：本轮规范安装器源码。来自已封存 MIT 安装器的固定哈希衍生；增加完整 bootstrap 闭包安装与 receipt。`derive-installer.mjs` 是一次性衍生记录，规范源已继续修改，**不得重跑来覆盖 installer.mjs**。
- `repair.mjs`：限定此次已列明核心文件与 bootstrap 的事务引擎。prepare 校验图及所有旧受管入口哈希，绑定当前 checkpoint 和候选文件；apply 取得启动与 native 安装租约、写维护门禁、再次检查进程／计划，保存 fsync 备份后逐项原子替换；半途失败保留门禁；recover 只接受逐项 before/after 已知字节并向前完成。不删除四 owner 锁、不覆盖任何数据域、Key、用户插件、会话或 suite-config。
- `windows-adapters.mjs`：实际 Windows 进程 census（包含死亡 owner PID、当前根及核验的旧路径别名）；校验 alpha.2 p0073/p0074/p0485 原有协议，取得 upstream atomic-write 的 HOME/profiles/node_modules 租约和 desktop 的 HOME/profiles/desktop/lock 独占锁；不删任何预先存在的锁。启动 SQLite 和只读 P2 门禁由统一 bootstrap 提供。
- `repair-cli.mjs`：只接收公开图 8660c8... 或日常 hotfix 图 7a1719...；校验包 support 内的 repair-policy 和 bootstrap 后动态载入可信模块；prepare / apply / recover，按错误码报告 blocked，不输出私人正文。

## build CLI 与配置

```powershell
& $Node '.\build.mjs' --config 'C:\absolute\candidate-build.json'
```

```json
{
  "schema": 1,
  "baseRoot": "C:\\absolute\\DSH-SEP-Windows-Alpha-20260921-MIT",
  "outputRoot": "C:\\absolute\\new-uncreated-candidate",
  "revision": "startup-fix-20260924",
  "expectedBaseGraph": "8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52",
  "bootstrapRoot": "C:\\absolute\\bootstrap",
  "bootstrapFiles": [{"path":"launcher.mjs","sha256":"..."}],
  "overlayRoot": "C:\\absolute\\merged-overlay",
  "overlay": [{"path":"store/p0500/src/managed.mjs","beforeSha256":"...","sha256":"..."}],
  "repairPolicy": {"path":"C:\\absolute\\repair-policy.json","sha256":"..."}
}
```

bootstrapFiles 必须实际列全 launcher.mjs、launch.mjs、start.vbs、start.ps1 及所有模块依赖。新增 overlay 文件 beforeSha256 为 null。repairPolicy 可省略，此时不带升级 CLI。policy.targetGraph 可写 `@GRAPH_HASH@`，封图后由 builder 替换。

输出 `DSH-SEP-Full` / `DSH-SEP-Only` / `DSH-SEP-Source` 三个新目录。manifest.support 绑定 bootstrap 和修补代码；manifest.bootstrap 指明实际安装闭包。Source/bootstrap 和 Source/distribution 为可维护源码。旧文档仅随基线复制，**最终发布前必须同步新状态、源码来源及文档哈希，不能把 BUILD-RESULT 的 pass 当作发行准入**。

新安装配置名为 deployment.json；模板 launch.mjs 的 `@MANAGED_DIR@` 替换为 managed，`@CONFIG_FILE@` 替换为 deployment.json。launcher.mjs 的 `@GRAPH_HASH@` 替换为目标图。

## repair policy

```json
{
  "schema":1,
  "targetGraph":"@GRAPH_HASH@",
  "allowedProgramPaths":["store/p0500/src/managed.mjs"],
  "baselines":[{
    "graphHash":"8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52",
    "layout":"managed",
    "files":{
      "launch.mjs":"actual-installed-template-sha256",
      "start.vbs":"actual-installed-sha256",
      "start.ps1":"actual-installed-sha256",
      "managed/launcher.mjs":"actual-installed-graph-substituted-sha256"
    }
  }]
}
```

必须用实际已知旧字节填入，不能从任意用户目标自动信任采集。日常版本用 managed-rc2，且把本次将覆盖的既有 startup-helper 文件的旧哈希也逐一列出。新增 helper 只能在原目标不存在时创建；已存在而不在白名单则拒绝。

修补程序只允许以下 core 位置：p0500/src 的 controller、guardian、managed、server、client、sep-lock-recovery、sep-lock-native、owner-lease、startup-diagnostic.mjs/.d.mts；p0501/src 的 store.js、owner-lease.mjs、p2/control.js；p0498/package.json 与 lib/index.js、lib/sep-host-lifecycle.mjs、lib/startup-diagnostic.mjs/.d.mts；p0485/lib/sep-update/update-inventory.mjs。实际 policy 应取真实差异子集，且图的 package/dependency/root 拓扑不变。

```powershell
& '.\runtime\node\node.exe' '.\repair\repair-cli.mjs' prepare --bundle 'C:\NewBundle' --target 'D:\Existing-SEP'
# 使用 prepare 输出的实际 planPath；不要手造确认哈希或计划。
& '.\runtime\node\node.exe' '.\repair\repair-cli.mjs' apply --bundle 'C:\NewBundle' --plan 'D:\Existing-SEP\state\startup-repair\<id>\plan.json'
# 仅对中断的同一个计划继续；它保留原维护门禁。
& '.\runtime\node\node.exe' '.\repair\repair-cli.mjs' recover --bundle 'C:\NewBundle' --plan 'D:\Existing-SEP\state\startup-repair\<id>\plan.json'
```

prepare 识别唯一存在的 deployment.json 或 deployment-rc2.json。成功回执只代表离线代码／启动文件事务完成，后续实际启动健康检查和最终数据保留校验不可省略。storage 门禁当前复用统一 bootstrap.inspectColdCheckpoint，不支持的首次纳管／未知事件继续拒绝；不是偷偷清空或重建旧库。

## 已验证与待验证

已验证：两种包的闭包和 Source 对应、候选 create-only、错误旧哈希与路径逃逸拒绝、大小写重复拒绝、bootstrap 实际复制与替换、未绑定文件拒绝、原入口不覆盖、修补前后数据与用户插件保留、活进程／未知入口拒绝、审批等待后候选与业务 checkpoint 变化拒绝、发布中断维护门禁及向前完成、真实 Windows census 拒绝无锁活子进程、死亡锁不删除。

后续实装适配器检查已验证真实 native HOME 安装租约、startup SQLite 租约、Windows census 和只读 P2 检查闭环；旧现场四个 owner 元数据未删除。该结果是修补前预检，不是完整修补运行或日常部署验收。

尚待主任务整合验证：真实大图装配与最终 ZIP 回读；Only/Full 旧安装实际升级；日常特定旧哈希；所有新 core / bootstrap 生命周期测试；发布文档／隐私扫描／Git 源码绑定。最终状态以本候选随附机器报告为准，开头 17 项是历史骨架验证。

## 文档／源码与小修补包

`finalize-docs-source.mjs --candidate <新候选> --report <同图机器报告>` 只对未归档的新候选同步文档、Source 和 support 哈希，不发包、不安装。它保留旧证据为历史，补全 host-adaptations 新文件映射，并从真实报告引用数量，不推断缺失项目通过。

随后可执行 `derive-repair-bundle.mjs --full <已完成文档的 Full> --output <尚不存在的小包目录>`，只派生 Node、bootstrap、repair、18 个受控变更文件与清单。小包不是首次安装器，不包含完整 DSH 或用户数据。最终仍需清单核验、归档回读和公开隐私扫描。
