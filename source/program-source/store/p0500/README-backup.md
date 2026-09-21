# 可验证工作区备份与恢复

本模块属于 2026-09-12 隔离恢复候选。备份必须由用户显式创建；不会自动扫描私人项目，不会把工作区备份当作 SEP 记忆三域的迁移或 P2 回滚。

## API

从 `src/backup.mjs` 导入。参数和返回值均为普通 JSON 对象，不包含文件正文。

| 调用 | 作用与结果 |
| --- | --- |
| `createWorkspaceBackup({controlRoot,project:{id,root,identity?},limits?})` | 捕获明确项目；返回 `backupId, status:retained, createdAt, manifestHash, fileCount, totalBytes, exclusions, coverage, retention, limits` |
| `listWorkspaceBackups({controlRoot})` | 对保留备份逐一核验并返回元数据；发现损坏保持拒绝，不伪装为可恢复 |
| `previewWorkspaceRestore({controlRoot,backupId,targetRoot})` | 核验备份并生成持久计划；返回 `planId,confirmationHash,files,exclusions,targetRoot` 等可审阅元数据 |
| `restoreWorkspaceBackup({controlRoot,planId,confirmationHash})` | 确认后重新核对计划、备份、目标父目录身份与目标不存在，再发布新副本；返回 `status:restored,targetRoot,targetIdentity` |
| `planDeleteBackup({controlRoot,backupId})` | 生成某一完整备份的具体删除清单 |
| `commitDeleteBackup({controlRoot,planId,confirmationHash})` | 精确确认后删除该备份正文，保留删除依据；不得以路径代替计划 |
| `listBackupArtifacts({controlRoot})` | 列出具有所有权记录的失败捕获、失败恢复暂存副本及其位置、保留状态 |
| `planDeleteBackupArtifact({controlRoot,artifactId})` | 为 `capture:<uuid>` 或 `stage:<uuid>` 的具体失败副本生成删除计划，绑定当前逐文件身份与哈希 |
| `commitDeleteBackupArtifact({controlRoot,planId,confirmationHash})` | 重新核验后逐文件删除上述失败副本，保留元数据回执；源工作区、发布目标和其他备份不属于删除范围 |

`project.identity` 与控制器一致：`{realpath,dev,ino,birthtimeNs}`。所有身份来自实际 `lstat({bigint:true})` 和 `realpath`，不接受无法核验的本地身份。错误的 `code` 以 `RECOVERY_BACKUP_` 开头。

## 捕获与容量

默认且最大允许值为：10,000 个被复制文件、单文件 64 MiB、一次备份总正文 512 MiB。调用方可以调低三个 `limits` 字段：`maxFiles,maxFileBytes,maxTotalBytes`。目录和排除项也计入遍历上限（`4 × maxFiles + 128` 个条目），目录深度最多 64；正文逐 64 KiB 块读取和写入，不一次性加载整个文件。元数据文件最大 16 MiB。

来源和控制目录必须互不包含；拒绝网络/设备路径、符号链接、junction、被复制文件的多硬链接以及身份不可核验的来源。逐文件打开前、打开后、复制结束和捕获结束核对身份、大小和时间戳；发现变化拒绝发布。仍需要调用方暂停项目写者，才能保证跨文件业务一致性：这不是 VSS，也不是数据库事务快照，不能宣称任意并发写者下的同一时点快照。

保留空目录、文件相对路径与原字节；不复制 Windows ACL、ADS、文件时间或稀疏/压缩属性。恢复目录继承目标父目录权限。当前正式验证范围是受控 Windows 本地普通文件系统，不把该范围外的文件系统发布语义算作已验证。

## 明确排除的内容

在每一层按名称排除 `.git`、`node_modules`、`.suite-memory`、`.suite-control`、`.suite-recovery`、`.dsh-recovery`、`recovery-backups`、`credentials`、`secrets`、`.ssh`、`.gnupg` 等目录。排除 `.env`、`.env.*`、已知 credentials/secrets JSON/YAML、私钥常用文件名和 `.pem/.pfx/.p12/.key` 文件。

也排除 SEP 标准内部文件 `dsh_four_layer_memory_v1.json`、`dsh_four_layer_archive_v1.json`、`dsh_enhancement_suite_v1.json`、`dsh-system-enhancement-package-v1.lock`。清单列出每个被排除的路径及原因，`coverage` 固定为 `included-files-only`。排除规则按名称识别，不是任意文件正文中的秘密识别器；自定义私密存储应放在项目之外或由调用方另行约束，不能声称会识别所有凭证。

## 私人正文副本的治理

完整备份位于 `controlRoot/recovery-backups/backups/<backupId>/payload`。其不可覆盖的 manifest 和独立 catalog 回执记录 SHA-256、大小、时间、项目身份及排除项。创建前先可靠写入操作记录，正文复制前持久记录新目录实际身份。

恢复暂存位于目标同父目录的 `.dsh-recovery-stage-<planId>`，这是为了同父目录 rename 发布；创建和复制前依次将确切路径、计划、父目录身份、暂存目录身份写入控制目录。失败副本保留，不自动回滚为旧数据；可以用上述 artifact 清单和精确删除接口处理。突然断电后无法核验所有权的目录保持拒绝处理，不猜测删除。

所有这些副本默认 `expiresAt:null`、`automaticDeletion:false`，由用户明确确认后删除。每次备份有容量边界，但不设所有历史备份的总量或自动 TTL；磁盘容量仍需使用者管理。删除先落盘独立删除依据，再按身份、哈希及确切清单逐文件移除、逐空目录移除；中断后相同计划可继续，已不存在的确认条目跳过，身份或剩余正文变化则停止。不会用广泛递归清理命令处理恢复目录。

目录被完整发布而“完成”回执尚未可靠写入时，会返回失败并保留已发布目标；不能直接重试复制。失败记录明确提示核查目标和操作记录。恢复 API 不自动将这个不确定状态宣称为成功，也不自动删除目标。

恢复固定要求目标尚不存在，并与原工作区、控制目录互不包含；只恢复到用户审阅的明确新目录，不合并、覆盖或原地“修复”现有文件。确认说明明确指出备份可能包含源库后来有意删除的内容；确认本次文件清单才授权生成这些副本。SEP/P2 私密域仍走原有治理流程，不能用这个备份绕过删除依据。

## 验证与限制

测试位于 `tests/backup.test.mjs`，数据仅位于 `tests/fixtures/backup-*` 合成目录；开发红灯/绿灯、最终三轮分别保留在 `dsh-host-isolation/evidence/host-recovery-20260912/backup/`。测试包含文本/二进制/中文路径、排除项、硬链接/junction、容量及目录界限、备份/计划/暂存篡改、缺件、父目录替换、实际复制期间源变更、目标竞争、失败副本清单和精确删除、删除中断后的变更拒绝。

`operation.lock` 只协调本模块的操作。进程异常中断留下锁时保持停止，不能只凭 PID 不存在自动删除；该守护/人工核验机制由组合控制器另行处理。本模块不会隔离任意外部进程，也不能完全排除恶意本机管理员在最终路径检查后瞬时替换目录的竞争。
