# 第1步 / bundle.20：初始化失败收尾与根实例所有权

**本阶段所述Windows合成生命周期范围 pass；八步整体尚未完成。** DSH固定0.2.1-alpha.1，SEP候选0.2.1-beta.3-bundle.20。默认仓库准入pending，完整Profile blocked，日常版和GitHub保持。

官方依赖刷新会重试同一根fiber，明确dispose/create复用Entry却生成新根fiber（特征记录39、39、40）。据此把关闭状态归属于根实例，内层Runtime通过私有宿主回调交付控制；禁止依赖刷新或迟到初始化重新发布ready，明确新实例仍可挂载。

受控根在首个异步初始化之前发布恢复控制。可信启动监督器必须用ctx.get('sepControlledInstallation',false)取得LOADING提供方；普通业务保持严格服务发现且仍需phase与精确根planHash准入。注册前同时拒绝仍在初始化的外来提供方；注册异常也纳入有界回滚。初始化失败且恢复未完成时返回blocked并保留租约，真实释放后whenClosed才完成，解除故障后可重试close与明确重挂。

## 复核与统计

最终同包新鲜执行332项：历史运行283、构建/入口13、依赖11、初始化7、Loader特征1、原生设置15、原生浏览器2。新增8个固定定义（7+1），其余324沿用；重复和失败尝试不累计。全部0失败/取消/跳过/todo。448包内文件与源码及真实D盘独立安装逐字节对齐，package.json仅包管理器省略最后LF；来源转换链逐项重放通过。

原生浏览器证据限真实AppWebEntry/ModuleSystem/Loader、SettingsRoot及General/SEP页面，最外层设置席位和空会话为测试载具；完整workspace/session/sidebar、HMR通知和Git URL GUI生命周期仍待后续。前阶段100ms历史close异常仍未归因、未标为修复。

第1步期间发现一个**未修复的既有消费者限制**：Windows深层pnpm实包路径中Python companion直接执行会ENOENT（owned-regression-r1-runtime.log 282/283）。较短真实D盘消费安装通过283项；这不消除长路径缺陷。已列入第3步实际suite_context_prepare工具复现和修复任务，最终收尾必须处理，详见阶段STEP3-DISCOVERED-ISSUE.md。

## 失败样本和收尾

此前candidate-r5不可部署记录保持，自动审批拒绝的脚本未执行。用户准许架构调整后先做官方Loader特征测试，再取得根控制缺失的原bundle.18负例。启动期strict查询夹具错误、深路径Python失败及publication-conflict红灯分别保留，不伪写成最终全绿。

最终两项浏览器通过正常退出；最终合成owner.lock和本阶段匹配Node/Edge/esbuild进程为零，不审计全系统句柄。blocked故障用例在释放测试自有故障或恢复所有权后完成，不能倒推当场blocked已释放。早期注册冲突红灯由独立测试worker的18秒watchdog终止，该路径不是产品正常关闭证据。

## 下一步与边界

第2步核验整应用在途任务取消、非合作调用、退出截止与重启恢复；根close有界回执不可替代进程级关闭。第3步继续剩余消费者并处理上述深路径问题，之后完整UI、GUI安装生命周期、跨平台/CI、历史慢样本有限调查，最后第8步统一打包文档和检查点。第8步结束停止，不执行日常切换或GitHub发布。

单一P2/三域/账本所有者保持；suite_delegate任务的并发/只读/截止约束与Profile模型/预算门禁分开。普通Shell保护范围不扩大，私人旧库不自动纳管。

证据：BUNDLE-INITIALIZATION-VERIFICATION.json；D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase4-runtime-initialization-r1。最终包SHA256：22c69b0297e1816514450186ee36805c282c2b82269acdf5ced70bcd796ab09e。
