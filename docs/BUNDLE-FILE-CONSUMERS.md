# bundle.8：标准文本文件工具与受控 Profile 片段

本轮明确范围为官方 DSH 0.2.1-alpha.1 固定版本的 Windows x64、本地 NTFS 合成环境。read/write/edit 消费者和显式配置片段状态 pass；完整阶段四 blocked，根业务 pending。无日常部署或 GitHub 发布，不涉及付费模型、用户密钥或私人正文。完整用户 Profile、read_image/附件和其他文件工具不在此 pass 范围。

## 先复检，再开始

bundle.7 的本地检查点 8332c80f534c7d105ff73634f7303ed2396dea9d、438 个提交文件、746708dd349ddc40a380e819f381613fda0b536c315bb2666de961fd1eae9ce8 实包、源码/日志绑定与 126 项既有定义重新通过。旧验证记录、报告、包和日志保留原字节。官方目标保持 tag dsh-v0.2.1-alpha.1、commit 5badb15009ae1756c3afe0ae0cef1faafc290ccc，不在这一子阶段更换认证目标。

## 复现与改动

baseline-red.log 的两个固定实例均失败：自有 fs 未声明 sandboxMode，原生工具把它当作无 Sandbox 的后端，read-only 写入成功；create 后原生观察策略更新版本，但自有摘要凭据没有更新，后续 edit 被误拒绝为 FS_NOT_OBSERVED。两者均经实际官方 Tools、Agent handle、Session 和 SandboxPolicy 运行，不是模拟 actor 或真实模型解题。

1. 自有提供方声明原生 Sandbox 能力，并在直接受管操作缺显式 policy 时采用宿主默认策略；模型调用使用原生工具传下来的会话策略。普通 Shell 不扩大承诺。
2. 私有受保护引擎增加两个窄回调，发生在 write/edit 发布与 journal 保存完成后、句柄释放前，记录已提交正文摘要；不在外层重新打开文件读取，也不在持久化之前授权。原生五段版本函数保持原字节。与历史五个绑定变换合计七个，逐字重建另行审核。
3. 新增显式 protected-file-tools 组合，重用官方观察策略和工具，消费者提供方拒绝缺失守卫，避免卸载观察策略后退化为无条件写入；独立 file-protection API 的受信任无条件语义保留。无 Sandbox、已有提供方、用户同名工具则明确拒绝，不自动覆盖。
4. 动态卸载 Sandbox 的原生工具因失效服务已报错，但组件提供方的直接调用仍可能准入，sandbox-unload-red3.log 证明了此边界；增加每次受管变更的 Sandbox 存在性检查。同步抛错后来修正为原生 Promise 拒绝契约，保留 iteration4.log。不能把原生工具当时的报错描述成工具绕过。

## 固定检查与统计规则

既有 126 项定义加本轮 22 项消费者定义，合计 148。最终运行组为 135 项实包运行＋13 项构建/官方入口；重复运行不增加定义数，不计算 Worker 性能或真实模型成功率。22 项覆盖只读、未读拒绝、真实会话 A/B 隔离、版本变化/同元数据正文变化、原生流路由、连续写后编辑、会话模式、不同 cwd/越界、无审批的升级、派发前取消、策略卸载、凭据容量、缺 Sandbox、组件卸载、现有服务/工具保留、失败激活回滚及官方 boot/Loader 单项配置。

Loader 固定实例保留 0.63/0.21 非默认原生压缩参数、用户标记服务与合成账本字节；只加载一个明确配置项。它不是完整私人 Profile 的自动替换、完整应用模型回合或 GUI Git URL 安装证据。官方 alpha.1 的 tool-fs 没有模型 move/delete 工具；移动与 removeFile 的既有 API 核心检查仍保留，不能称为本轮模型 move/delete 验收。

早期失败日志全部保留：iteration1 的三处测试错误分别是 sandbox_permissions 被误写成 sandbox_mode、错误码字段误读；iteration2 为 Cordis 服务代理身份比较与 waterfall 调用签名的夹具问题。sandbox-unload-red.log 是默认类插件定位错误，red2 是原生失效服务导致的结果分类，red3 才是直接提供方准入复现。上述原因分别记录，不通过改日志或只报最终绿灯掩盖。

## 使用与边界

入口、配置及安全默认值见包内 README 的 bundle.8 节及 bundle/contracts/file-consumers.json。宿主必须先提供 native tools/systemPrompt/recoveryHost/sandboxPolicy，受信任地登记项目，再加载本组件。files 明确配置项目和恢复范围；tools 可以省略以继承官方默认窗口。不会检测并自动停用已有提供方；配置冲突必须通过后续受控替换解决。初始化失败回滚自有子组件；卸载去除自有工具/提供方，保留原生 Sandbox。对已有全应用 Profile 的有界热替换仍待验证。

完整正文及流继续受显式 recovery.maxFileBytes 上限；摘要默认 1024 个路径/版本，未自动淘汰。容量不足时不能把已持久提交的写入伪报失败，省略新凭据并在后续拒绝；恢复记录与消费/用户配置不清零。已接收本地操作的排空沿用提供方；全应用关闭期限、长任务和子进程仍不在本轮认证。

本轮先尝试离线安装新增官方 fs-observation-policy，记录 ERR_PNPM_NO_OFFLINE_META；随后仅补下载这个已固定版本的官方组件，其余使用已记录缓存。不能称全程离线或干净冷安装。旧 rc.2 peer 范围冲突继续记录，不以宽松版本号宣称全 SEP 兼容。

下一项工作：登记项目/Session/存储/账本与凭据引用的受控绑定，随后成组压缩及生命周期、前端，最后阶段五远端 Git URL GUI 生命周期。固定标准不降低，现有日常/公开 Beta.2 不变。

## 最终实包封存

sealed-runtime.log 为 135/135；sealed-builder-entry.log 为 13/13。16 条独立复核通过，包括 418 个包内普通文件、264 个静态代码文件、1045 条 ESM 导入、实际安装字节、七个限定源码变换、原生版本函数原字节、原图/许可与隐私排除。构建副本、缓存与新产物都在 D 盘真实目录。

证据根：D:/AIData/ProjectWork/DSH/bundle-install-20261008/phase4-consumers-r1。
最终包：artifacts/final/dsh-sep-bundle-0.2.1-beta.3-bundle.8.tgz。
SHA-256：80928e60473c9d996a8f5bd4f3173482c163ca40ba1afaaa7c2e8238f8542bf2。

BUNDLE-CONSUMERS-VERIFICATION.json 与外部 RESULT.json 同字节绑定本轮源码、实包和全部日志；REVIEW.json 为独立产物审核。CHECKPOINT.json 绑定本地提交后可恢复源码。旧 bundle.7 记录及全部旧包/日志重新核对且未覆盖。peers-check-sealed.log 仍以退出码 1 表示旧 rc.2 peer 范围冲突，没有宣称全业务兼容；完整阶段四仍 blocked。
