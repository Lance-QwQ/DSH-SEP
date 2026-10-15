# 阶段四文件保护与恢复权威核心

候选：dsh-sep-bundle 0.2.1-beta.3-bundle.6，目标官方 DSH 0.2.1-alpha.1。核心子集 pass；**完整文件适配与完整阶段四仍 blocked**。根业务 pending，未部署、未发布；当前日常和公开 Beta.2 保留。

前置复核：427 个提交文件、原候选及全部已封存日志指纹一致，78 个固定定义重新通过，旧记录/日志未改。新证据与试装位于 D:/AIData/ProjectWork/DSH/bundle-install-20261008/phase4-files-r1。

## 已实现和固定范围

自有 file-protection 提供方使用原发布 Beta.2 图中的保护引擎，原代码字节保留，继承实际官方 alpha.1 的 FileSystem 定义；官方 fs-local 不改。新的 recovery-authority 复用原持久控制器与所有者租约，在受信任本地配置下显式登记项目，不自动发现旧库或启动私有应用/HTTP 后台。

受管 writeText/editText/moveFile/removeFile/restoreMutation、维护与重绑定共用权威队列；写前确认当前项目的物理身份和代次。单独卸载文件提供方即关闭新变更并等候已接收的本地操作；整体权威关闭拒绝未开始的排队调用并等待正在执行的本地操作。应用级截止/取消/unknown 收尾尚未认证。

25 个固定文件定义覆盖实际持久原副本/恢复、已改变版本的陈旧拒绝、create-if-absent/编辑不匹配不落备份、硬链接、只读/跨项目范围、维护先后和所有变更入口、工作区丢失、显式重绑定、条目/原文件/候选大小限制、恢复冲突/副本损坏、中文移动删除、提供方/新 Node 进程重开、原生所有者互斥与释放、实际 Windows 文件和祖先句柄、发布前中断、现有记忆绑定、卸载旧引用拒绝和在途发布收尾。另增加缺少保护引擎的产物闭包负例。

prepared 失败记录及正文副本保留供核对，不能因测试的其它最终清理或一次后续恢复宣称该中断当时已自动修复。复原本身也产生受保护变更记录；原操作按自身 ID 校验 restored。未知/最新备份保留，配额耗尽拒绝继续，不通过自动清空放行。

## 实测限制与下一接续点

原生 FsVersion 是 dev/ino/size/mtimeNs/ctimeNs 的五段信息。本机独立使用官方 alpha.1 默认服务观察 40 次同长度快速覆写，30 次版本未变化；这些样本的五项元数据均相同。原始证据 NATIVE-VERSION-OBSERVATION.json 保留。这证明元数据版本不能保证捕获所有正文变化；不是 SEP 增强版已修复的证据。

早期同长度陈旧夹具没有记录当时的版本对比，不能逐样本直接归因。最终陈旧固定用例先证明版本确实改变，再断言拒绝；原失败日志保留，不能用新通过覆盖。下一接续点是设计保留原生/RAG 五段接口的内容观察与句柄内写前校验，未有有效原观察时拒绝，之后再完成工具消费者、受控 Profile 与前端接线。

本子阶段只认证 Windows x64 本地 NTFS 普通单硬链接文件与同盘独立恢复目录。普通 Shell 不新增限制；其它平台不会退回无保护写入。跨用户 DACL 矩阵、实际磁盘断开/满盘、断电、全部原生工具消费者/沙箱、全应用关闭截止和首次私人资料纳管未验证。

## 修正与证据归属

首个恢复夹具误以为列表首项就是被恢复的操作，实际恢复会新增自身记录，现按操作 ID 验证。删除接线误用 deleteFile，已修正为原引擎的 removeFile，并额外验证其维护拒绝。租约断言先误把 Cordis Fiber 当原生 Promise，改为异步消费真实 Fiber。这些夹具修正与生产接线修复分开记录。

确实复现并修复了仅卸载文件提供方后旧引用仍可写入、处于暂存/发布间的操作未结束却返回卸载完成两条路径；红日志分别为 files-dispose-red.log 和 files-drain-red.log，25 项绿证据为 files-lifecycle-green.log。最终包/全量日志和独立审核另在 BUNDLE-FILES-VERIFICATION.json 及外部 RESULT/REVIEW/CHECKPOINT 中绑定。

## 最终实包复核

104 项固定定义通过：此前 78 项，加本轮文件核心 25 项和缺少保护引擎的闭包拒绝 1 项。packed-runtime-sealed.log 为 91/91；builder-entry-final.log 为 13/13。40 次原生版本观察是单独证据，不计作新增验收定义。

独立审核 13 条通过，检查 416 个包内常规文件、263 个静态代码文件和 1037 条 ESM 导入；确认官方 JSONL 派生变换、原保护引擎字节、两者许可、私有数据排除、安装实际字节及完整性清单。旧五份验证记录、source、公开 README、.github/dist 与日常 Beta.2 程序图保持。

最终包相对证据根：artifacts/final/dsh-sep-bundle-0.2.1-beta.3-bundle.6.tgz。
SHA-256：d1cb383beade66819662256f5e501116252e108ece4ce356e3ccdddad9d33b4c。

本轮安装是既有官方 npm 缓存的离线复用，不称新冷安装。旧 rc.2 peer 与 alpha.1 的冲突仍在 peers-check-sealed.log 以退出码 1 明确保留。根入口不自动挂载新提供方，保护核心子集 pass，完整文件适配与阶段四 blocked。
