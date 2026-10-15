# bundle.9 项目与 Session 接续绑定

本轮新增的是显式、受信任同进程的配置审阅和 Session 接续服务；完整阶段四仍 blocked，业务仍 pending。候选 dsh-sep-bundle@0.2.1-beta.3-bundle.9，仅面向固定 DSH 0.2.1-alpha.1 的 Windows x64 本地 NTFS 合成范围。日常版本不变，不上传 GitHub。

## 上一阶段复核

bundle.8 检查点 af0c66c8e1bae129498bbe8d3924f7df1a2a4e38 的442个已提交文件、148项固定定义、最终实包和全部旧日志重新核对。旧文档、封存索引、产物与日常选择保持原状。本轮 BEFORE.json、BEFORE-CHECKPOINT.json 和 before-* 日志记录复核，不把重复运行累计成新定义。

## 绑定及确认的具体范围

先由受信任宿主组合现有 recoveryHost、SepProtectedFileSystem、SepSessionPersistence、storageDomain 的三域原生 JSON 后端及 sepStorageControl；本服务不替换提供方、不调用 storageDomain.open 初始化库、不迁移旧数据。显式输入 projectId、sessions/memory/locks/backups 根、既有 budgetPath 和 DEEPSEEK_API_KEY 引用。各内部目录与账本父目录相互独立，处于全部已登记源项目之外，逐级拒绝别名并核对可验证的本地目录身份；locks 是审阅记录中的明确目录，本服务不改变各提供方内部锁的实际位置。

review 返回只读计划，confirm 必须绑定该 planHash，并重新采集项目身份/代次、目录身份、提供方实例、账本哈希、P2 头和配置意图。变化或读取失败使旧计划失效。confirm 的状态是插件进程内的短期接续确认；没有持久化发布或 committed 状态，不能作为业务写入门、部署授权或用户 GUI 接受回执。卸载时关闭准入并等待已接收审阅结束，随后清除确认；持有旧服务的调用拒绝。

reviewSession 要求实际官方 Session 实例且 cwd 与登记项目根完全一致。接续时重查上述绑定上下文，原提供方或路径被更换则拒绝。相同绑定下的合法账本/P2 数据更新继续使用当前存储，不把日常消费误判为换库。读取后的快照不是执行能力；每次真实写入仍依赖既有 Budget/P2/文件守卫。没有认证对任意合法账本替换的生命周期连续性，也没有增加预算豁免。

## 消费、隐私与生命周期

审阅要求已有合法 V3 账本。缺失、损坏及旧版需迁移都拒绝且不写回。默认100/5/100元的意图不覆盖既有共享80元、会话默认42元或单会话12元的合成策略；5.75元账面消费（含预留、未知及核准更正）保持。实际 Budget 新增1元预留后，接续看到6.75元，不清零、不释放未知、不删除更正。

返回预算汇总不包含收据正文、会话ID或密钥值；DEEPSEEK_API_KEY 仅为固定引用、resolved:false。不检查凭据是否存在，不运行模型。服务本身不新增记忆正文副本、Session事件、P2业务事件或生命周期时间；固定测试核对原账本、createdAt/completedAt标记原字节。真实 Session/Scope/受管存储接续测试才执行合成 Session 保存和记忆写入，发生在独立测试目录。

## 固定验证与失败样本

新增21项定义覆盖路径别名、重叠源范围、目录替换、项目重绑、确认前账本变化、缺失/损坏/旧账本、凭据/重置字段拒绝、原额度/消费保留、真实 Session 保存读取、恢复权威的 Scope 身份和受管三域写入、跨工作区或伪造 Session、提供方变化、P2未知治理与真实维护屏障、入参后续修改、插件卸载及未确认计划。

binding-red.log 首次基线为 SessionPersistence 默认导出夹具错误；binding-red2.log 修正后确认 bundle.8 缺少新服务。iteration1.log 的2处失败为 zod 依赖解析入口和 writer 模式误调用维护API；iteration2.log 仅剩新增断言与真实 P2_RECOVERY_REQUIRED 不符；iteration3.log 21/21。保持原日志，不把夹具失败描述成生产修复或抹去历史。维护屏障使旧确认返回 SEP_BINDING_PLAN_CHANGED；重新 review 时可以先收到 P2_RECOVERY_REQUIRED，保留原 P2 错误语义。

完整 Profile 挂载/替换向导、已用私人库纳管、持久化绑定发布、credential可用性、原生压缩/全应用收尾、前端/GUI、Linux/macOS运行与远端仓库链接安装仍未认证。当前片段只认证明确接口，不降低固定总标准。

## 最终实包封存

sealed-runtime.log 156/156，sealed-builder-entry.log 13/13，共169项固定定义（148既有＋21新增），不把多次运行累计成更多场景。18条独立复核通过：420个包内普通文件、265个静态代码文件、1055条ESM导入、实装字节、原图/许可、旧运行组件原字节及隐私排除。所有新增安装、缓存引用及产物使用D盘真实路径，本轮最终安装复用已有离线缓存；不是冷安装或完全无网络依赖的产品包。

独立审核首轮沿用bundle.7比较基线，却加入bundle.8新记录，使保留检查错误；错误输出又触发默认GBK解码失败。independent-review-r2.py改用正确af0c66c8基线并显式UTF-8后通过，首轮脚本、输出与imports.log保留。此处没有修改产品以使审核通过。

证据根：D:/AIData/ProjectWork/DSH/bundle-install-20261008/phase4-bindings-r1。
最终包：artifacts/final/dsh-sep-bundle-0.2.1-beta.3-bundle.9.tgz。
SHA-256：0aefde7f0b039360772156e35455780aad46b80044cf42b6502068f400afb6a8。

BUNDLE-BINDINGS-VERIFICATION.json与外部RESULT.json同字节绑定源码、实际包和日志；REVIEW.json为独立审核；CHECKPOINT.json记录本地提交与源字节核验。旧bundle.8及更早记录保持原字节。旧rc.2 peer范围冲突继续记录为fail，未放宽为全业务兼容。完整阶段四blocked，未部署日常、未上传GitHub。
