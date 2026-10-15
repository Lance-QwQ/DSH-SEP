# 第4步：完整原生 UI 组合复核

固定 DSH 0.2.1-alpha.1 + bundle.22 实包，Windows 合成范围内2/2通过、0跳过。此阶段只增加测试和证据，不改动生产代码；同一467文件包与阶段3逐字节一致（package.json仅pnpm换行处理）。默认入口仍 pending，完整 Profile仍 blocked。

原生 AppFrame、workspace/session/sidebar/conversation/chat、实际 Connection/BrowserAuth、Session API、Agent loop、Session 持久化和官方 HMR SSE参与。通过实际输入框和发送按钮启动一轮合成模型请求，刷新后恢复历史且未重复请求；原生命令服务实际执行 /sep-prework-reset，未发模型请求。设置保存/刷新保留账本；受控根退出后官方HMR自动撤回SEP设置，通用设置仍可用。成功样本正常dispose和Browser.close，无强制结束；P2锁已释放。

测试发现并纠正三处载具假设：工作区先显示不代表会话目录已到达；原生空白会话隐藏自定义标题直到首次请求；合成模型须像原生提供方一样声明defaultMaxTokens。未修改P1限额或生产截止。原始失败日志、异常清理记录与后续成功分开保存，不宣称历史浏览器退出异常已修复。

证据入口：phase4-full-native-ui-r1/RESULT.json，成功日志full-native-live-r6.log；原生内核467个构建输入另有哈希。截图已审阅；预算截图仍显示保存后核对文字，最终持久值另经页面刷新核实。这里只认证所列Windows合成交互，不代表所有可选UI域、Electron托盘或所有模型均认证。

下一步：官方插件页仓库安装生命周期。随后三平台/CI、历史异常结论与最终checkpoint；第8步后停下。日常版及GitHub保持原状。
