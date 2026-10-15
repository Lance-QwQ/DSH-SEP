// Local delivery assembly only; never launches, signs, installs or uploads.
import{lstat,realpath,readFile,mkdir,writeFile,copyFile}from'node:fs/promises';
import{constants,createReadStream}from'node:fs';import{createHash}from'node:crypto';
import{join,resolve,dirname,basename,sep,isAbsolute}from'node:path';import{pathToFileURL}from'node:url';
const ROOT=resolve('D:/AIData/ProjectWork/DSH/alpha2-macos-package-20261014-r1');
const OUTPUT=join(ROOT,'mac-preview-delivery-r1'),NAME='DSH-SEP-macOS-Alpha2-installer-preview.zip';
const fail=code=>{throw Object.assign(Error(code),{code});},need=(v,c)=>{if(!v)fail(c);};
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),commit=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const sha=b=>createHash('sha256').update(b).digest('hex'),identity=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.nlink,s.mode].join(':');
async function regular(path){const s=await lstat(path,{bigint:true});need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1n&&await realpath(path)===path,'SEP_DELIVERY_FILE');return s;}
async function json(path){need(isAbsolute(path)&&resolve(path)===path,'SEP_DELIVERY_ARGUMENT');const before=await regular(path);need(before.size>0n&&before.size<=8388608n,'SEP_DELIVERY_RECORD');const bytes=await readFile(path);need(identity(before)===identity(await regular(path)),'SEP_DELIVERY_FILE');return{value:JSON.parse(bytes),sha256:sha(bytes)};}
async function digest(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}

function approved(download,audit){
 need(download?.schema===1&&download.status==='pass'&&audit?.schema===1&&audit.status==='pass','SEP_DELIVERY_RECORD');
 need(Number.isSafeInteger(audit.runId)&&audit.runId>0&&Number.isSafeInteger(audit.jobId)&&audit.jobId>0,'SEP_DELIVERY_RECORD');
 const b=audit.deliveryBinding;need(b?.schema===1&&b.installer&&b.payload&&b.build,'SEP_DELIVERY_BINDING');
 const i=b.installer,p=b.payload;
 need(commit(i.buildCommit)&&commit(p.buildCommit)&&commit(audit.sourceCommit)&&download.sourceCommit===i.buildCommit&&hex(download.sha256)&&Number.isSafeInteger(download.bytes)&&download.bytes>0&&download.bytes<=4*1024**3&&i.archiveSha256===download.sha256&&i.archiveBytes===download.bytes&&[i.manifestSha256,i.inventorySha256,p.archiveSha256,p.programSha256,p.bootstrapSha256,p.treeSha256].every(hex),'SEP_DELIVERY_BINDING');
 need(b.build.status==='pass'&&b.build.archiveRestored===true&&b.build.signaturesVerified===true&&b.build.sourceUnchanged===true,'SEP_DELIVERY_BUILD');
 // These are reviewer-produced bindings to actual native RESULT bytes. This
 // local operator cross-checks consistency; it does not authenticate GitHub.
 const nativeResults=b.nativeResults;need(nativeResults&&hex(nativeResults.installationSha256)&&hex(nativeResults.installedStartupSha256),'SEP_DELIVERY_EVIDENCE_BINDING');
 const bindEvidence=(row,resultSha256)=>{const e=row?.evidenceBinding;need(e?.schema===1&&e.testCommit===audit.sourceCommit&&e.runId===audit.runId&&e.jobId===audit.jobId&&e.installerArchiveSha256===i.archiveSha256&&e.installerManifestSha256===i.manifestSha256&&e.payloadProgramSha256===p.programSha256&&e.payloadBootstrapSha256===p.bootstrapSha256&&e.payloadTreeSha256===p.treeSha256&&e.resultSha256===resultSha256,'SEP_DELIVERY_EVIDENCE_BINDING');};
 need(Array.isArray(audit.evidenceRows),'SEP_DELIVERY_RECORD');const selected=audit.evidenceRows.filter(r=>r.kind==='separate-test-entry-installation');need(selected.length===1,'SEP_DELIVERY_UI_INSTALL');const install=selected[0],t=install.fixedDefinitions,c=install.close,v=install.payload;
 bindEvidence(install,nativeResults.installationSha256);
 need(install.status==='pass'&&t?.tests===6&&t.pass===6&&t.fail===0&&t.cancelled===0&&t.skipped===0&&hex(install.planHash)&&c?.controllerClosedReceipt===true&&c.controllerSignalled===false&&c.controllerExitCode===0&&c.uiResourcesReleased===true&&c.controllerOutputEOF===true&&c.controllerExited===true&&c.forcedTermination===false&&c.cleanupUnconfirmed===false&&c.path==='normal scenario close'&&c.testEntryExitCode===0&&v?.fullInventoryVerified===true&&v.signatureVerified===true&&v.sourceUnchanged===true&&v.applicationStarted===false&&v.dataRootAbsent===true,'SEP_DELIVERY_UI_INSTALL');
 const installed=audit.evidenceRows.filter(r=>typeof r.kind==='string'&&r.kind.startsWith('installed-'));need(installed.length===1&&installed[0].status==='pass'&&Array.isArray(installed[0].cycles)&&installed[0].cycles.length===2,'SEP_DELIVERY_STARTUP');const cycles=installed[0].cycles;
 bindEvidence(installed[0],nativeResults.installedStartupSha256);
 for(let n=0;n<2;n++){const r=cycles[n];need(r.index===n+1&&r.status==='pass'&&typeof r.ready?.generation==='string'&&/^[a-f0-9]{30,64}$/.test(r.ready.generation)&&Number.isSafeInteger(r.ready.desktopPid)&&r.ready.desktopPid>0&&Number.isSafeInteger(r.ready.bootstrapPid)&&r.ready.bootstrapPid>0&&hex(r.profile?.sha256)&&r.profile.installedPathBound===true&&r.closed?.generation===r.ready.generation&&r.closed.resourcesConfirmedReleased===true&&r.closed.normalLaunchServicesWaitExit?.code===0&&r.closed.normalLaunchServicesWaitExit.signal===null,'SEP_DELIVERY_STARTUP');}
 need(cycles[0].profile.sha256===cycles[1].profile.sha256&&cycles[1].profile.sameAcrossRestart===true&&cycles[0].ready.generation!==cycles[1].ready.generation,'SEP_DELIVERY_STARTUP');
 // Missing privacy material is kept unknown. An audit of a different payload
 // cannot become a no-private-data statement for the delivered installer.
 let privacy={status:'not_run',scope:'未完成全面隐私审计；本交付不声明绝对不含私人数据。'};
 const q=b.privacyReview;
 if(q){need(q.status==='pass'&&q.archiveSha256===i.archiveSha256&&q.inventorySha256===i.inventorySha256&&hex(q.recordSha256)&&typeof q.scope==='string'&&q.scope.length>0&&q.scope.length<=1000,'SEP_DELIVERY_PRIVACY');privacy={status:'pass',recordSha256:q.recordSha256,scope:q.scope,comprehensiveAudit:false};}
 return{installer:i,payload:p,build:b.build,nativeResults,cycles,install,installed:installed[0],privacy};
}

// Bind the original build bytes already preserved by the distribution verifier.
// An internally consistent audit alone cannot supply a different tree or build
// receipt. This is local cross-record validation, not remote authentication.
export async function verifyMacPreviewAssembly(downloadPath,download,{installer:i,payload:p}){
 const path=join(dirname(downloadPath),'SOURCE-ASSEMBLY.json');let source;
 try{source=await json(path);}catch{fail('SEP_DELIVERY_ASSEMBLY');}
 const a=source.value;
 need(hex(i.treeSha256)&&hex(i.assemblySha256)&&hex(download.assemblyResultSha256)&&source.sha256===i.assemblySha256&&source.sha256===download.assemblyResultSha256,'SEP_DELIVERY_ASSEMBLY');
 need(a?.schema===1&&a.status==='pass'&&a.sourceCommit===i.buildCommit&&a.artifact===NAME&&a.artifactSha256===i.archiveSha256&&a.artifactBytes===i.archiveBytes&&a.manifestSha256===i.manifestSha256&&a.treeSha256===i.treeSha256,'SEP_DELIVERY_ASSEMBLY');
 need(a.payload&&['archiveSha256','programSha256','bootstrapSha256','treeSha256'].every(key=>a.payload[key]===p[key]),'SEP_DELIVERY_ASSEMBLY');
 return{path,sha256:source.sha256};
}

function readme(manifest){return `# DSH SEP macOS ARM64 隔离预览\n\n本包包含 DSH 0.2.1-alpha.2 与 SEP 的 Mac 派生运行时及固定依赖。交付状态为隔离预览，不是所有 Mac、所有功能或公开安全认证通过。\n\n安装包：\`${NAME}\`\n\n字节数：${manifest.archive.bytes}\n\nSHA-256：\`${manifest.archive.sha256}\`\n\n安装器构建提交：\`${manifest.installer.buildCommit}\`；验收提交：\`${manifest.verification.testCommit}\`。二者分别绑定构建与测试，不互相替代。\n\n## 使用\n\n完整解压后打开外层 \`DSH SEP Installer.app\`。阅读目标与具体计划后确认安装；安装完成的 Open 是单独动作。应用固定安装到系统账户记录中的 \`~/Applications/DSH SEP.app\`，不要启动内层 Electron。API 凭据由用户在应用中自行配置，测试没有调用付费模型。\n\n数据使用独立的 \`~/Library/Application Support/DSH SEP/alpha2-mac-finder-preview\`，事务记录在 \`~/Library/Application Support/DSH SEP Installer\`。已有目标或未知事务会拒绝；不支持任意覆盖安装、原位自动升级或自动卸载。程序移动、替换或重签需另行验证的数据迁移。\n\n当前仅支持绑定的唯一受控项目。模型文件修改进入工作副本；设置中的“当前项目 · 工作副本”用于审阅。提交创建新的受管代次，原始来源保持不变。任意目录首次纳管、多项目切换、导出或写回原目录尚未提供已认证用户流程。普通文件编辑界面只读，普通 Shell、任务子进程、任意 MCP/Computer Use 入口未开放。Mac 自动更新安装仍由平台门禁拒绝。预算设置不清零既有消费。\n\n关闭窗口可能保留后台；结束程序请用正常退出。\`blocked\` 或超时不等于资源释放、也不表示外部操作未发生。保留同代错误码与记录，不删除锁、不修改账本或 PROFILE、不按名称批量杀进程。\n\n## 本包证据与限制\n\n安装器构建、签名核验及归档恢复已绑定；独立测试入口使用未改生产模块、真实控制器与实际 Cocoa 控件，完成 6 项安装断言；已安装应用两轮启动和同 Profile 重启及正常收尾通过。这不等于原字节安装器的物理按钮输入认证。具体范围和证据哈希见 MANIFEST.json。\n\n环境：macOS 15.7.9 ARM64。签名为 ad-hoc，未完成 Developer ID／Apple 公证，不提供关闭 Gatekeeper 或 TCC 的绕过步骤。Intel、其他 macOS、私人资料接续、付费模型、物理 Finder/键鼠/AX、完整原生项目确认批准与全部功能同实例认证仍未完成。本地交付脚本没有运行安装器或重新签名。\n\n隐私检查：${manifest.privacy.status==='pass'?'有与本安装器绑定的范围检查记录；详见 MANIFEST.json。该记录不构成全面隐私审计。':'未完成全面隐私审计；本交付不声明绝对不含私人数据。'}\n\nSHA256SUMS 校验 ZIP、README 和清单。清单与 README 位于签名 ZIP 外，不改变应用字节。\n`;}

/** Internal operator API; CLI below fixes its only real delivery destination. */
export async function finalizeMacPreview({downloadPath,auditPath,outputRoot=OUTPUT}){
 outputRoot=resolve(outputRoot);need(outputRoot.startsWith(ROOT+sep)&&await realpath(dirname(outputRoot))===dirname(outputRoot),'SEP_DELIVERY_OUTPUT');
 try{await lstat(outputRoot);fail('SEP_DELIVERY_OUTPUT');}catch(e){if(e.code!=='ENOENT')throw e;}
 const d=await json(downloadPath),a=await json(auditPath),facts=approved(d.value,a.value),archive=d.value.archive;
 const assembly=await verifyMacPreviewAssembly(downloadPath,d.value,facts);
 need(typeof archive==='string'&&isAbsolute(archive)&&resolve(archive)===archive&&archive.startsWith(ROOT+sep)&&basename(archive)===NAME,'SEP_DELIVERY_ARCHIVE');
 const before=await regular(archive);need(before.size===BigInt(d.value.bytes)&&await digest(archive)===d.value.sha256&&identity(before)===identity(await regular(archive)),'SEP_DELIVERY_ARCHIVE');
 const manifest={schema:1,status:'pass',scope:'Local four-file delivery assembly of already-audited installer bytes; no new installation or certification',archive:{name:NAME,bytes:d.value.bytes,sha256:d.value.sha256},installer:facts.installer,payload:facts.payload,verification:{testCommit:a.value.sourceCommit,runId:a.value.runId,jobId:a.value.jobId,build:facts.build,uiInstallDefinitions:6,installedStartupCycles:2,normalScenarioClosure:true,nativeResults:facts.nativeResults,evidenceBindings:{installation:facts.install.evidenceBinding,installedStartup:facts.installed.evidenceBinding},downloadRecordSha256:d.sha256,auditRecordSha256:a.sha256},privacy:facts.privacy,fullMacCertification:'blocked',notVerified:['physical input','original-entry external confirmation input','full native project confirmation','private data adoption','paid providers','Intel and other macOS versions','Developer ID and notarization','automatic update installation']};
 await mkdir(outputRoot,{mode:0o700});need(await realpath(outputRoot)===outputRoot,'SEP_DELIVERY_OUTPUT');const target=join(outputRoot,NAME);
 await copyFile(archive,target,constants.COPYFILE_EXCL);need(identity(before)===identity(await regular(archive))&&(await regular(target)).size===before.size&&await digest(target)===d.value.sha256,'SEP_DELIVERY_ARCHIVE');
 // Revalidate all three evidence records before publishing the pass manifest.
 // A failed copy/evidence check may leave the fresh ZIP for diagnosis; it must
 // not leave a completed four-file delivery with a rejected evidence binding.
 need((await json(downloadPath)).sha256===d.sha256&&(await json(auditPath)).sha256===a.sha256&&(await json(assembly.path)).sha256===assembly.sha256,'SEP_DELIVERY_RECORD');
 await writeFile(join(outputRoot,'README.md'),readme(manifest),{flag:'wx',mode:0o600});await writeFile(join(outputRoot,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
 const sums=[];for(const name of[NAME,'README.md','MANIFEST.json'])sums.push(`${await digest(join(outputRoot,name))}  ${name}`);await writeFile(join(outputRoot,'SHA256SUMS'),sums.join('\n')+'\n',{flag:'wx',mode:0o600});
 return{status:'pass',outputRoot,archive:target,sha256:d.value.sha256,bytes:d.value.bytes};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){try{need(process.argv.length===4&&process.platform==='win32','SEP_DELIVERY_ARGUMENT');console.log(JSON.stringify(await finalizeMacPreview({downloadPath:resolve(process.argv[2]),auditPath:resolve(process.argv[3])})));}catch(e){console.error(JSON.stringify({status:'fail',code:/^SEP_DELIVERY_[A-Z_]+$/.test(e.code??'')?e.code:'SEP_DELIVERY_IO'}));process.exitCode=1;}}
