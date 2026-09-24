# DSH SEP Windows Alpha 启动修订源码

修订 `windows-alpha-20260924-startup-r2`；程序图 `0b54ac82524c0a42db44d5b8a6ebbbca1773a28c8c361839d47f9c12760f35a3`。逐文件来源和哈希见 SOURCE_FILES.json。

program-source 对应实际发布程序文件；startup-source 收录新所有权实现、首选桌面宿主 TypeScript 源、统一 bootstrap、生成器及测试。首选宿主源为 startup-source/preferred-host/apps/desktop-host/src/index.ts。恢复服务的 .mjs 首选源为 program-source/store/p0500/src/server.mjs；manual 参数最终转发由 startup-source/diagnostics/build-overlay.mjs 生成，并由 startup-source/managed/rpc-manual.test.mjs 覆盖。实装、Electron 和双实例并存测试及其 worker 已收录，测试与生成的本机故障现场分开，未打包私人会话、Key、.env 或 Git 历史。

机器验收报告及具体限制在 Full／Only 的 docs/STARTUP_FIX.md。9 月 21 日旧许可和功能指标保留在 history 中，不能代替本轮测试。构建条件与边界见 BUILD.md；本快照不声称可以独立重建全部上游二进制。
