# 本地代码审查入口

这是 DSH SEP 完整维护源码的本地审查快照，基于 sep-self-update-20260925/source，补入当前日常 local.4 的 SEP、恢复、插件组源文件和 r06 自更新源文件。宿主基线 DSH 0.1.7-rc.2。没有复制私人运行数据、node_modules、凭据文件或其他项目的 Git 历史。

本仓库用于源码审查；不声称已经由这份完整快照重新构建所有上游二进制。实际部署以绑定 graph 和逐文件哈希为准。

基线提交后，仅引入本轮点击增强及必要版本绑定，另附本轮测试和证据入口。使用 git diff HEAD~1 HEAD 审查差异。测试需要维护环境中对应 rc.2 runtime，不能把缺少依赖理解为应用的运行测试失败。

## 本次变更

SEP local.5，DSH rc.2 保持不变。5 个部署文件与本仓库对应路径逐字节核验，详见 sep-review/computer-click/DEPLOYMENT-SOURCE-MAP.json。
点击源码：packages/sep/system-enhancement-package/src/computer-click.js。独立证据仍在同级 ../evidence/ 与 ../deployment-r1/，未放入私人数据或模拟窗口浏览器缓存。复制的测试原始版本为审查材料，实际执行位置和日志以证据索引为准。
