# 第5步：官方插件页安装生命周期

固定官方 DSH 0.2.1-alpha.1、bundle.23，所列 Windows 合成 GUI 生命周期为 pass。默认组合仍 pending，不启用业务；日常版和 GitHub 未修改。证据索引为 BUNDLE-GUI-INSTALLATION.json。

真实官方插件页输入固定本地 Git file URL，实际 pnpm 获取提交、安装包、写入 profile 组合声明，官方 Include/HMR 执行启用和撤回。浏览器点击完成安装、立即启用、关闭、卸载、安装较新固定提交及取消。升级探针第二提交仅修改版本号，真正新 Node 宿主读取新版 pending 入口。项目中文文件和原消费账本保留，模型请求为0。2项GUI定义通过；3项官方兼容门禁、11项依赖、283项运行时、13项构建/入口、23项生命周期回归另列，不把重跑累计为新场景。

本轮修复实际根 peer 缺陷：官方 gate 将 dsh-* peer 与运行时0.2.1-alpha.1比较，invariants叶包实际为0.2.0-rc.2。唯一该项改为精确并集0.2.0-rc.2 || 0.2.1-alpha.1；实际叶包不变，其余精确版本、optional、exports、默认准入及所有业务模块原字节不变。实际gate无需豁免，真实pnpm peers check通过；alpha.2、stable0.2.1和0.3.0仍拒绝。相较bundle.22归档只有package.json与host-dependencies契约变化。

**安装后启用不代表SEP业务已开放。升级必须重启宿主。** 本轮同进程卸载/重装版本探针观察到旧JSON模块缓存；不将热启用回执当作新代码已生效。用户操作合同是停用、卸载/重装受支持固定候选、完整退出并重启，然后核对新版本。新进程验证通过，不宣称通用热升级已修复。

成功安装采用已存在D盘缓存和显式离线pnpm配置；取消用例使用自身HTTP端点挂起真实tarball下载，再点击取消并核对profile manifest原字节恢复。file Git不等于公共HTTPS、GitHub认证、代理或带宽验收；本阶段未公开源码。第三方用户插件的任意行为仍未逐一执行，既有入口组合保留测试保持。

成功GUI样本正常AppWebEntry dispose、Browser.close及宿主dispose；取消夹具另外销毁自己挂起的HTTP连接并关闭server。历史失败原日志保持：缺少AppReady、手动Loader/Include重复身份、窄屏侧栏收起、网络ECONNRESET及未使用正确元数据缓存、pnpm remove不接受安装专用参数、测试未进入详情或未识别已在详情、同进程版本缓存。载具修正不改变生产截止；失败finally清理不替代正常关闭证据。完整应用Electron/全部CLI组合退出、全部插件、三平台业务发行及公开HTTPS仍不能由本阶段推断。

下一步核对Windows/Linux/macOS及CI的可验证范围，再完成历史异常结论和最终checkpoint；第8步完成后停止。
