# bundle.7 严格正文观察与句柄内预检

目标固定为官方 DSH 0.2.1-alpha.1；本地组合包 0.2.1-beta.3-bundle.7。完整阶段四 blocked，正文观察核心 pass，根业务 pending；没有日常部署或 GitHub 发布。

## 缺口、复现和修复

bundle.6 的 40 次原生快速同长度改写中，30 次正文改变但五段版本不变。该历史原始记录保留，不算新增验收定义，也不宣称官方原生提供方已修复。

本轮使用真实 NTFS 合成文件，外部写入同长度正文，再通过 Windows FILE_BASIC_INFO 恢复实际时间字段；写前独立断言五段版本完全相等。没有伪造 FsVersion、mock stat 或添加生产测试接口。初始 3 条均因“应拒绝但实际写入/编辑成功”失败；扩大到 17 条后 14 条失败。字节窗口夹具最初错误地用了 start/end，改成原生 offset/length 后再次确认缺口，原始失败日志保留。

显式 owned 文件提供方成功完整读取时，保存路径/原生版本对应的原始 SHA-256。正文不留在凭据或新增磁盘副本里。读取在普通单硬链接 NTFS 文件和真实祖先句柄占用下完成；释放后才交付有界快照。守卫写入、编辑、移动、删除继续先检查原生版本，再在持有原文件/祖先的预检中校验摘要，之后才允许创建恢复记录与正文前镜像。因此无观察、陈旧正文或歧义拒绝不会消耗备份容量，也不会积累正文副本。

同版本不同正文的多次完整读取标记为歧义；不会让新读者的凭据覆盖旧读者。原生五段 FsVersion、RAG 五段来源身份与各业务组件原代码保持不变。恢复继续使用既有提交后哈希/版本及完整前镜像检查。

首版新实现用 JavaScript # 私有字段，与 Cordis 服务上下文代理的接收者品牌不兼容，真实实包出现 TypeError；改用模块内未导出的 Symbol 后通过同一组用例。转换曾引入 this.[symbol] 语法错误，已由 Node 语法检查定位并修正，两个失败日志保留。所有修改局限于显式组合包提供方和私有引擎；官方默认提供方和 source 树没有修改。

## 凭据与读取边界

- stat、readByteRange、失败/取消读取和提前停止 streamText 不产生完整凭据。
- 完整 readText/readBytes 和完整消费 streamText 才建立凭据。原始摘要包含所有字节；文本保持 CRLF，拒绝非法 UTF-8/二进制样本。
- recovery.maxFileBytes 同时限定完整读取和可恢复单文件大小；readBytes 再取请求 maxBytes 的较小值。超限拒绝，不降级为无保护读取。streamText 在该上限内缓冲完整快照，不宣称任意大文件恒定内存。
- observationMaxEntries 默认 1024，正安全整数。每个路径/版本占一项，不自动淘汰已知歧义。满后 FS_OBSERVATION_LIMIT，早先凭据保留。卸载关闭新读取和变更准入，排空已接收本地操作后清空摘要；重新加载必须重读。
- 缺少有效完整观察为 FS_NOT_OBSERVED；同元数据正文变更为 FS_STALE_CONTENT；同版本正文歧义为 FS_OBSERVATION_AMBIGUOUS。拒绝均不新增恢复记录。

带 expected.version 的 API 享有上述正文观察规则。没有版本守卫的受信任显式调用仍保留原无条件语义及前镜像，不宣称具备正文陈旧拒绝。完整模型工具、fs/observed 事件、Sandbox/Profile 和会话观察隔离仍需下一子阶段实测，不把提供方核心直接当成消费者闭环。普通 Shell 保障范围不扩大。

## 固定验证口径

既有 104 项重新认证；本轮新增 22 个固定定义，最终总数 126 = 113 个实包运行/API/文件/观察检查 + 13 个构建/官方准入检查。重复执行不增加定义数，NTFS 时间恢复不是额外场景计数。

22 项覆盖无正文观察、同元数据写入/编辑/移动/删除、CRLF 与恢复、完整字节与流、提前停止流、部分字节、歧义保留、排队等待后预检、读/预检时真实文件及祖先句柄排他、非法 UTF-8、限额/预取消、凭据容量、卸载重读、显式无条件语义、完整读取大小上限、二进制前镜像、读取排空以及失败释放句柄。原有 25 条文件核心定义仍保留，成功的 guarded 写夹具增加实际 readText 来满足新严格契约，未降低原断言。

所有测试仅操作 D 盘合成目录，不调用付费模型。安装复用已有官方 npm 缓存、采用新候选路径和离线依赖，不宣称新的冷安装。root admission/cordis.patch 和私有库初始化策略保持原状；旧 rc.2 peer 与 alpha.1 的范围冲突仍明示，未用放宽 peer 冒充全面兼容。

## 后续范围

下一子阶段验证真实工具消费者、fs/observed、Sandbox 与受控 Profile 成组替换；再推进前端设置和官方 GUI 仓库 URL 生命周期。私人纳管、全应用停机截止、真实磁盘断开/断电、其它 Windows 用户权限及 Linux/macOS 保护未在此认证。完整阶段四继续 blocked，阶段五/六未通过。

封存入口：BUNDLE-CONTENT-VERIFICATION.json（源码、实际包、日志）、D 盘 phase4-content-r1/RESULT.json、REVIEW.json、CHECKPOINT.json。bundle.6 的文件报告/验证 JSON、旧包和原始日志保持，当前公开/日常 Beta.2 保持。

## 最终封存复核

sealed-runtime.log 为 113/113；sealed-builder-entry.log 为 13/13。14 条独立审核通过，包括 416 个常规包内文件、263 个静态代码文件、1038 条 ESM 导入、实际消费安装字节、五个源码绑定变换、原生版本函数原字节、十个组件原图/许可与隐私排除。旧六份验证记录、bundle.6 日志/RESULT/审核/包与公开 README、source、.github/dist 和日常选择均保持。

最终包：artifacts/final/dsh-sep-bundle-0.2.1-beta.3-bundle.7.tgz。
SHA-256：746708dd349ddc40a380e819f381613fda0b536c315bb2666de961fd1eae9ce8。

离线缓存复用不是新冷安装。peers-check-sealed.log 仍以退出码 1 明示旧 rc.2 peer 范围冲突；没有放宽它来宣称 alpha.1 全面兼容。所有早期失败日志保留，最终通过范围仅限此正文观察核心与既有回归，不改变完整阶段四 blocked。
