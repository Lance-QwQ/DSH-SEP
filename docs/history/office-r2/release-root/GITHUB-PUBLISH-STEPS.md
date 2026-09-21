# GitHub 发布准备

1. 阅读 DELIVERY-REPORT.json 与包内 PUBLICATION_CHECKLIST.md，处理或明确决定历史 HOST_STARTUP_UNATTRIBUTED 条件；当前 publicReleaseReady 仍为 false。
2. 创建项目所有者确定的 GitHub 仓库，填写支持与安全联系入口。当前尚无仓库或下载地址。
3. 使用本目录四份已核验 ZIP 和 SHA256SUMS.txt；不要上传私人工作区、完整原 Git 历史、测试实例、真实 Key 或诊断转储。
4. GitHub-Ready 提供公开文档、许可和发布草稿。源码以独立源码 ZIP 交付，不宣称四份大型上游源档已嵌入仓库；官方固定下载入口与哈希随包提供。
5. 上传前核对附件哈希，上传后另做下载回验。此文档不代表已经创建仓库或执行发布。
