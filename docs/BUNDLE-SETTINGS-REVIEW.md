# bundle.16：bundle.15 审查修正

本修正子阶段 pass；完整阶段四、完整 alpha.1 peers 兼容、默认 bundle 准入与完整 GUI 仓库链接安装仍 blocked。Windows x64、本地 NTFS、固定官方 DSH 0.2.1-alpha.1、D 盘合成资料。未修改日常版、私人数据或 GitHub。此前发布账本继续描述已发布的 beta.2，不能据此将本候选标为发布完成。

## 发现与修复

1. 已独立复现正文发现1。旧 bundle.15 在 UI 路由冲突与原生恢复失败同时发生时，进入 restore-blocked，根 apply 在700ms观察窗内仍 pending；合成故障解除后正常结束。原17项仍通过，故原集合确有覆盖缺口。
2. 根入口在 UI 装配前提供只受控的恢复接口。UI 挂载失败且清理未完成，在 runtime.shutdownMs 截止返回 mount-failed-blocked，固定码 SEP_INSTALLATION_MOUNT_FAILED；保留资源、不抛入会无限等待的自动回滚。受信任调用方必须检查 phase；返回不代表 ready/active。status、close、whenClosed 保留，review、activate、stream 拒绝；处理底层原因、重试close、等待whenClosed并卸载后，才可挂新根。清理成功时仍抛原挂载错误。状态只含固定诊断码，不输出原错误正文。
3. startup 屏障使关闭等待 UI 挂载真正停止发布路由，避免挂载中关闭后又回到 ready。内层立即停准入，外层只在实际 whenClosed 后卸载。
4. 额外物理清理失败注入发现关闭重试缺陷：原生配置已恢复并卸载控制器后，重试又请求该已关闭控制器 restore。settings-runtime 记录已确认的恢复进度，重试直接继续清理。未将未验证的恢复标为成功，第一次恢复失败仍可真实重试。精确 origin 清单增加2项转换，现13项；settings-consumers仍3项。

内层 Runtime 初始化失败的全部清理路径、整个应用根有界退出仍未认证；没有把本修复扩展成全应用恢复保证。Fiber 卸载仍等待实际收尾。非合作工作可以保持 blocked，不能因超时删除租约或宣称完成。

## 三项前提

- 专用受控项目宿主：close 取消 cwd 在项目根或后代的所有宿主 Agent，包括非本组合创建的会话；共享项目宿主不能无条件挂载。
- 工具最终结果：drain 依赖固定官方 Agent-loop/Tools 最终发布 tools/result，含失败和取消。源码可见结果物化与独立 observer 通知；这不等于所有第三方调度器都满足契约。缺失事件仍保留令牌、租约并 blocked，不新增擅自清理。
- 路由认证：路由只做载具/协议与 envelope 验证；Connection 外层必须先执行 Host/Origin 和 BrowserAuth 或已认证桌面管道准入。夹具的 createSharedFetchHandler 不是已认证网络部署，完整 BrowserAuth 未验证。

这些前提已同步包内 README 与 settings-installation.json，不修改既有 GUI 模块字节。Profile 级模型/预算拦截单独生效；两子任务、只读、超时、取消和统一任务记录仅适用于 suite_delegate 创建的任务。普通 Shell 的既有保障范围不扩大。

## 固定检查与失败样本

最终296项=历史291+新增故障5。实包运行时283、构建/官方准入13，全部 pass，无取消/跳过。设置子集23=受控根17+故障5+浏览器1；浏览器1已包含在283内，不重复加算。原17项、浏览器测试和夹具保持 bundle.15 原字节。独立复核21项，包含443个归档/安装文件逐字节比较、381个源程序图文件、origin重构与历史Git blob核对。固定标准未减少，重复运行不增加项数。

新故障5项：UI冲突+恢复失败、普通冲突完整回滚、非合作恢复+Fiber等待、挂载中关闭、UI冲突+物理租约关闭失败。最后一项先观察 cleanup-blocked，再由测试持有的原 coordinator 关闭自己的租约，随后重试根close才成功；不是自动接管陈旧锁。底层原因不解除时不承诺恢复。

开发样本均保留：red/ red-diagnostic 的首次注入修改了临时 fetch API 对象，未触发预期故障，不能当作复现；red-r2 才真正到达 restore-blocked/pending。green-r1通过18项；green-r2的额外清理路径未完成，外层测试器在120秒终止；随后专用诊断打印 cleanup-blocked 与原owner已释放，重复关闭仍blocked，最终仅按完整命令/唯一父子树停止测试进程。该诊断与 green-r2 均不算正常Fiber卸载成功。修复重试后 green-r3为22/22，再对最终实包执行完整296项通过。

最终 sealed 资源审计覆盖50个business/controlled夹具：P2/store owner标记0；1个浏览器正常 Browser.close并等待退出，无强制停止，阶段profile进程匹配0。早期异常样本的目录/日志完整保留，另行观察 owner 标记0，不能把最终零残留倒推为那些操作当场已成功，也不声明全系统句柄为零。

## 证据与交付

- 最终实包：`D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase4-settings-review-r1\artifacts\final\dsh-sep-bundle-0.2.1-beta.3-bundle.16.tgz`
- SHA-256：`e77a6b04c15fdb3a2e4febf06f6c621277a47fd5e3049b3b582ba22c03efc3d1`；1272028字节，443个普通文件。
- 实包日志：sealed-runtime.log（283），sealed-builder-entry.log（13）；同前缀4份测试输入与当前源码字节一致。
- REVIEW.json（21）、RESOURCES.json、BROWSER-PROCESS-AUDIT.json、SANITIZED-COMMENTS.json、BEFORE-CHECKPOINT.json、RESULT.json与仓库 BUNDLE-SETTINGS-REVIEW-VERIFICATION.json 绑定。
- 历史 bundle.15 的 cfe69eb4、9808eac2… 制品与原报告/索引保持原字节。原483条源码哈希加索引本身，已复核为484个实际Git blob。
- 复现前提和命令：`tools/bundle-install/tests/SETTINGS-REPRODUCTION.md`；完整宿主图/工具链不是随源码自动获得，尚无本集合CI。不得把本地检查等同独立CI或跨平台认证。

旧 rc.2 peers 保留，当前 peers check 仍预期exit1：阻断完整 alpha.1 包兼容。下一阶段仍应处理原生客户端设置工厂装配、剩余消费者和完整组合准入；本次不部署或发布。
