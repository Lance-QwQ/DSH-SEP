# bundle.15 外部审查逐项响应（2026-10-09）

被审基线：cfe69eb4fd96a08706d498243e1e2f9e89652960，bundle.15。消息正文为运行时审查，附件 DSH-SEP-bundle15-review-20261009.md 主要为证据/环境审查，两者不是同一份全文。原附件SHA-256：638a744479adbaaf6c4f2358563b2cd3c20a52a09a0e5b2c97da90384525c1c5；原文未改写。本响应保留外部审查者结论与后续核验之间的区别。

## 正文

| 项 | 核验与处理 |
|---|---|
| 1 挂载清理无界等待 | 真实复现并修复；有界blocked恢复owner，实际收尾仍诚实等待。另补已恢复原生控制器的关闭重试进度。见BUNDLE-SETTINGS-REVIEW.md与5项新增回归。 |
| 2 项目范围Agent取消 | 代码确实取消所选根/后代所有Agent；是专用受控项目宿主前提，已写入包内说明/契约。未伪称共享宿主隔离。 |
| 3 tools/result生命周期耦合 | 接受为残余依赖；固定官方调度器有最终物化与observer发布，未实证缺失事件。声明缺失时blocked保留，不加超时强行释放。 |
| 4 认证依赖载具 | 属实，已在契约明确；未将loopback/envelope当认证，不声称完整BrowserAuth通过。 |
| origin转换计数10/2 | 基线清单实为11/3，Git blob重算确认。修正版runtime增加2项，成为13/3。其他设计评价不因该计数差异自动失效。 |

## 附件证据与可复现性

| 意见 | 本轮结论 |
|---|---|
| S1 本机无工具链、无运行时CI | 对审查环境限制和CI缺口的说明成立。本机具备固定Node并重新运行296项。无CI是持续复验/分发前提缺口，不能直接等同运行时漏洞；本轮未添加或上传工作流。复现命令/所需宿主图前提已入库。 |
| S2 工作树干净不可证 | 外部无Git时不能独立确认。核验基线483条源哈希加索引本身，与484个cfe69eb4实际Git blob逐个相等；修复前git status为空。提交后的新检查点另记，不沿用旧clean声明。 |
| S2 复现脚本/日志在仓库外 | 部分成立。正式测试已在tools/bundle-install/tests，外部orchestrator、封存日志、tgz在D盘阶段目录。现补设置子集与完整集合命令/依赖前提；未声称所有历史草案脚本已随仓库公开，完整测试宿主图可获取性与CI仍待办。 |
| S2 最终安装日志无14→15文字 | 首次draft-r1确实14→15；后续15→15不应重称版本跃迁。pnpm进度文字不是安装包唯一身份依据：原独立复核比较了最终制品全部443条与实际安装副本，本轮又对bundle.16逐字节核验。 |
| S2/S4 公开账本仍beta.2 | 这是已发布状态，应保留。bundle.15/16未发布、未部署，不能更新RELEASE-STATUS等为本地候选。当前导航已明确候选与已发布记录的区别。 |
| S3 484与483 | 已补对账：483个sourceHashes键+验证索引自身=484个受检查点绑定的Git blob。索引不自含自己的哈希。 |
| S3 473口径 | 是bundle.14旧索引的473条源码哈希，不是当前bundle.15/16 Git快照全仓库文件总数。旧封存文字保留，通过本响应澄清口径。 |
| S3 三条净化注释位置 | 已重新对照381个源程序图文件，准确位置是bundle/modules/ui-settings-memory/lib/client.js第9, 382, 844行。SANITIZED-COMMENTS.json给出源行/结果行哈希与净化后的文本；不重新暴露源构建私人路径。 |
| S3 peers-check被通过印象掩盖 | 继续明确blocked，并在新报告开头列明。296项仅限固定官方alpha.1片段，不能宣称完整peers兼容。 |
| S3 旧包14项失败与draft-r1 13/14是同次运行 | 此解释不成立：red.log对应旧bundle.14缺入口的14项全失败；draft-r1.log对应新bundle.15草案13/14，是不同输入/实包的两次运行。旧日志保留。 |
| S4 四个浏览器只列出两个 | 本轮四份RESULT.json均可读取并重算哈希，名称/哈希写入REVIEW.json。附件自己声明列举受环境限制，不应升级为证据丢失。 |
| S4 强制浏览器终止、草案输入未全快照 | 保留原异常记录与边界，不改为正常关闭。当前新失败样本同样分开记录；最终测试输入重新快照。 |
| 278+13+1口径 | 附件未验证事项中的该加法重复计算浏览器1，正确为291=278+13；浏览器1已在278内。当前296=283+13。 |

三条净化注释的可定位记录：

- `bundle/modules/ui-settings-memory/lib/client.js:9`：`//#region \0dsh-css:./AssessmentSettingsSection.module.css.mjs`；原行SHA-256 `926ce315183b0d981463242388d9131ddc728fc62b405f7d079d823950bcc6dd`，结果行SHA-256 `da9269ecef1fb49cec20a266a96ef6ebac51c785ad2236c59faf124ef352b99e`。
- `bundle/modules/ui-settings-memory/lib/client.js:382`：`//#region \0dsh-css:./BudgetSettingsSection.module.css.mjs`；原行SHA-256 `c04779dce8ec49abac8b1d9a9f7643f7f732259ebbbeeac5aff620f661097d58`，结果行SHA-256 `97a40e609c8dcf12b7d73fa4a71ab24eb4b4723192597fa7734d2fa43dbf3e45`。
- `bundle/modules/ui-settings-memory/lib/client.js:844`：`//#region \0dsh-css:./MemorySettingsSection.module.css.mjs`；原行SHA-256 `25babc20f163007c57c763799954c91cc177984efd0459fcc229305d9345bff4`，结果行SHA-256 `b2580421890cd40909dd71c2251612e440620f4e7f598a86eb3c48a532a167fe`。

验证索引：BUNDLE-SETTINGS-REVIEW-VERIFICATION.json。修正不扩大默认准入、完整GUI/BrowserAuth、私库纳管、Linux/macOS或付费模型的验收范围。
