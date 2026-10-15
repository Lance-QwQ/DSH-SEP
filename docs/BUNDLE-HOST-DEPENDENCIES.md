# bundle.17：固定 alpha.1 宿主依赖声明复核

本阶段 dependency-resolution 为 pass。完整业务运行兼容、默认组合准入和完整 GUI 仓库链接安装仍 blocked；没有更新日常版或 GitHub。目标仍为固定官方 DSH 0.2.1-alpha.1，未将此结论延伸到未来版本。

## 改动及依据

旧包 bundle.16 的根 peer 声明残留 rc.2，隔离宿主实际装的是 alpha.1，实际 pnpm peers check 返回1。重新构建空白 D 盘宿主，先复核495条源哈希加索引本身，共496个 ea72b036 Git blob；旧包296项原固定回归全部通过，依赖检查仍失败。功能片段通过与依赖声明不匹配是两个事实。

根包33项peer精确对应固定安装图，21项变化、12项保留。Cordis为4.0.5-alpha.1，Schemastery为3.18.5-alpha.1；dsh-invariants实际仍为0.2.0-rc.2，未按宿主版本强行改名。optional元数据、普通第三方依赖、exports、默认准入补丁均不变。所有已有bundle运行时、源程序图模块、UI工厂、origin和契约原字节保留。

新增 tools/bundle-install/adapt-host-dependencies.mjs 的纯函数接受已审阅的33项旧/目标peer声明，拒绝新增、缺失、未知范围及optional改变。返回根manifest和host-dependencies契约，输入不变且重复执行相同。它不安装、不启用、不写文件。包内contracts/host-dependencies.json明确runtimeCompatibility=not_run、defaultBundleAdmission=pending、businessActivationAllowed=false。

复现输入是完成前序片段适配后的bundle.16根manifest，包含完整33项；不是最初十模块捕获器的中间manifest。历史build-modules.mjs仍忠实生成原源图声明，不是完整当前包的一步重建脚本。若从头重建，须先恢复全部前序片段/根manifest，再应用本转换；不完整的peer清单会被拒绝，不能通过跳过验证消除报错。完整测试宿主图自动获取与CI仍是待办。

## 验证口径

最终305个固定定义=历史296+新增9。实包运行时283、构建/官方准入13、新增依赖9；全部pass，0fail/cancelled/skipped/todo。baseline、重复运行及独立复核不重复加到305。设置浏览器1已在283内；它仍是原工厂与真实后端路由、测试slot/locale/RPC接缝，不是完整原生客户端自动发现或BrowserAuth认证。

新增9项：实际peer版本匹配（含invariants例外）；真正pnpm peers check；契约范围与默认pending；旧声明转换可重现/幂等/输入不变；未审阅peer拒绝；缺失peer拒绝；未知范围拒绝；依赖/exports/optional不变；optional改变拒绝。

最终实包已重新离线安装，pnpm peers check返回0。独立复核13项，包括444个归档文件与仓库/实际安装副本逐字节一致（pnpm仅去除package.json末尾LF）、全部33个实际安装包manifest身份/哈希、历史检查点和记录保持、运行时不变、固定统计及资源收尾。

失败样本保留：第一次red运行因Koffi禁止导出package.json而未进入断言，是测试读取方式错误，不能当作产品反例。修正为读取隔离宿主已安装manifest；red-r2/red-r3在旧包上真实确认版本不匹配与pnpm exit1，其余新适配器/契约尚不存在，9项均失败。red-r3测试字节与最终测试一致。旧包原296项同时全部通过。green对最终实包9项通过，再独立核对完整296项封存日志。

最终sealed资源审计：50个business/controlled夹具，最终P2/store owner标记0；1个浏览器正常关闭，阶段专属Edge进程匹配0。本阶段没有强制终止进程。继承的故障测试中，当场blocked后仍需按测试声明解除门禁或由原coordinator关闭自己的租约，再重试close；最终零标记不能证明当场blocked操作已完成，也不声明全系统句柄为零。

## 证据入口及下一步

- 实包：`D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase4-host-dependencies-r1\artifacts\sealed\dsh-sep-bundle-0.2.1-beta.3-bundle.17.tgz`。
- SHA-256：`d005fcec6afe705b84a4c7cbb597f6cb95a2cd6e233914b9b438598eee072956`；1273691字节，444个普通文件。
- 阶段目录：`D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase4-host-dependencies-r1`。BEFORE-CHECKPOINT.json、before-peers.log、red-r3-host-dependencies.log、green-r2-host-dependencies.log、sealed-r2-runtime.log（283）、sealed-r2-builder-entry.log（13）、INSTALLED-HOST-PEERS.json、REVIEW.json、RESOURCES.json、RESULT.json及CHECKPOINT.json分工绑定。
- 仓库索引：BUNDLE-HOST-DEPENDENCIES-VERIFICATION.json；复现说明：tools/bundle-install/tests/HOST-DEPENDENCIES-REPRODUCTION.md。
- bundle.16、bundle.15及更早封存报告/索引原字节保留；本报告更新当前状态，不重写历史“peers blocked”结论。

下一步接入官方客户端加载器与原生设置页，并验证载具认证。源码已确认官方client registry忽略无Loader entry的手动child fiber；当前settings-runtime手动挂载UI，所以依赖声明修正不能自动让原生GUI发现它。完整运行兼容、其余业务消费者、初始化失败清理、全应用有界退出、CI与跨平台仍单列待办。Profile模型/预算门禁保持；仅suite_delegate创建的任务受两子任务、只读、统一超时/取消/记录限制。普通Shell保障范围不扩大。
