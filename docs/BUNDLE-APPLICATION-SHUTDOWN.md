# 第2步 / bundle.21：专用应用有界退出

**所述Windows合成专用应用范围pass；整套八步尚未完成。** DSH固定0.2.1-alpha.1，候选0.2.1-beta.3-bundle.21。第1步检查点75106d10保留；日常版及GitHub不变。

新增`dsh-sep-bundle/application-shutdown`可信启动器桥。明确要求专用宿主，调用者传入自身dispose/exit/complete及官方createProcessShutdown。先同步关闭SEP根准入，然后等待真实whenClosed和整个Cordis应用树dispose。官方进程截止默认5000ms；合成测试用700ms，不把应用启动、后续所有权查询时间当作退出耗时。此接口不是Agent工具，也不能用于共享宿主卸载或按名称清理进程。

8个固定实进程场景：空闲、重复正常退出合并、合作式模型、真实Agent工具合作取消、拒绝取消的模型、拒绝取消的工具、写入意图未完成、重复中断升级。4个正常收尾、4个截止/升级退出，各自都按期望通过；后4个产品回执仍为blocked，退出码0不等于完成资源清理。未合作模型保留reserved/dispatched，合作取消保留reserved/unknown，已完成模型usage保持settled。全部消费和额度保留、无付费调用或新增请求。

每个子进程退出后由另一进程通过现有native lease+PID/出生时间核验旧所有者，重开P2检查并关闭检查者自己的租约。真实未决business intent的普通重开拒绝P2_RECOVERY_REQUIRED；维护检查只读取并保留该意图，不伪完成、不重放业务。最终owner.lock和所述进程匹配零残留来自这些不同路径，不能倒推当场blocked已释放。

首轮7/8中的pending-intent失败是测试误期望普通openControl返回控制器；产品正确在打开时拒绝。已改成先断言拒绝，再维护只读核验，原失败日志保留。最终同包新鲜338项通过（283运行、13构建/入口、11依赖、23初始化/原生设置、8应用退出）；另2项原生浏览器因UI字节未改沿用第1步证据，累计340个固定定义，不重复累计。

450包内文件与源码和新的真实D盘h21安装逐字节一致，仅pnpm省略manifest最后LF。官方退出控制器直接从固定官方源码加载，哈希在包内契约与日志索引绑定；未用合成退出控制器冒充官方实现。

**边界：本步包含真实boot/Loader/Agent/工具/LLM门禁/HTTP服务/P2/存储的完整测试应用树，但尚未认证原生Electron菜单/IPC退出接线、完整GUI、所有外部原生后代。** 桥为可信启动器集成接口；这些接线须在第4/5步再验，完整Profile仍blocked，默认仓库入口仍pending。此前100ms历史close异常未归因，深路径Python限制在第3步修复。

接下来按序推进第3至8步，每阶段复核。第8步后停止等待，不执行日常切换或GitHub发布。

证据入口：BUNDLE-APPLICATION-SHUTDOWN-VERIFICATION.json；D:\AIData\ProjectWork\DSH\bundle-install-20261008\phase4-application-shutdown-r1。
