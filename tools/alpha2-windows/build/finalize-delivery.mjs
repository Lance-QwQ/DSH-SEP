// Local closeout only. It never changes an installation, ZIP, daily entry or Git.
import {readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {isPowerShellPolicyBlock} from '../verification/desktop-outcomes.mjs';

const P='D:\\AIData\\ProjectWork\\DSH\\alpha2-windows-packages-20261015-r1';
assert.equal((await realpath(P)).toLowerCase(),P.toLowerCase());
for(const path of ['DELIVERY-RESULT.json','repaired-r2/artifacts/VERIFICATION.json','repaired-r2/artifacts/SHA256SUMS.txt','repaired-r2/artifacts/README.md','repaired-r2/artifacts/EXTRACTION.md'])await assert.rejects(lstat(join(P,path)),{code:'ENOENT'});
const records=[];
async function record(path){
  const full=join(P,path),stat=await lstat(full);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1);
  const bytes=await readFile(full),sha256=createHash('sha256').update(bytes).digest('hex');
  const value=JSON.parse(bytes);records.push({path,size:bytes.length,sha256,status:value.status??'record'});return value;
}
const archives=await record('repaired-r2/ARCHIVES.json');assert.equal(archives.status,'pass');assert.equal(archives.revision,'windows-package.2');assert.equal(archives.archives.length,2);
const install=await record('fresh-install-verification-r3/RESULT.json');assert.equal(install.status,'pass');assert.equal(install.installations.length,2);
assert.equal(install.expected.revision,'windows-package.2');assert.deepEqual(install.installations.map(x=>x.kind).sort(),['full','sep']);
const installSha=records.find(x=>x.path==='fresh-install-verification-r3/RESULT.json').sha256;
assert.equal(install.configurationsFrozen,true);assert(install.checks.length>0&&install.checks.every(x=>x.status==='pass'));
assert.deepEqual(install.archives.map(x=>x.kind).sort(),['full','sep']);
for(const expected of archives.archives){const actual=install.archives.find(x=>x.kind===expected.kind);assert.equal(actual.sha256,expected.sha256);assert.equal(actual.size,expected.size);}
for(const r of install.installations){assert.equal(r.runtimeSmoke.status,'pass');assert.equal(r.blankCredential,true);assert.equal(r.emptySessions,true);assert.equal(r.emptyKnowledge,true);assert.equal(r.emptyBudget,true);assert.equal(r.ownerRootsDisjoint,true);}
const headless=await record('headless-install-verification-r5/RESULT.json');assert.equal(headless.status,'pass');assert.equal(headless.resourceAudit.status,'pass');
assert.equal(headless.inputSha256,installSha);assert.equal(headless.modelCalls,0);assert(headless.checks.length>0&&headless.checks.every(x=>x.status==='pass'));
assert.equal(headless.hosts.length,4);assert(headless.hosts.every(x=>x.closed&&x.closedBy==='acceptance'&&x.lastExit.code===0&&x.lastExit.forced===false));
assert.deepEqual(headless.hosts.map(x=>`${x.kind}:${x.round}`).sort(),['full:1','full:2','sep:1','sep:2']);assert(headless.hosts.every(x=>x.startOutcome==='pass'&&x.runtimeCloseCompleted===true));
const desktop=[];
const workspaceSourceBytes=await readFile(new URL('../verification/workspace-sources.json',import.meta.url));
const workspaceSources=JSON.parse(workspaceSourceBytes),workspaceSourceSha=createHash('sha256').update(workspaceSourceBytes).digest('hex');
for(const kind of ['full','sep']){
  const directory=`default-desktop-${kind}-r3`;
  const r=await record(`${directory}/RESULT.json`);assert(['pass','blocked'].includes(r.status));assert.equal(r.coreStatus,'pass');assert.equal(r.kind,kind);assert.equal(r.inputSha256,installSha);assert.equal(r.modelCalls,0);
  assert.deepEqual(r.rounds.map(x=>x.round),[1,2]);assert(r.rounds.every(x=>x.status==='pass'&&x.resources.status==='pass'&&x.exit.code===0&&x.stages.some(s=>s.step==='actual-second-launch-reopens-same-window-and-host')));
  assert.equal(r.workspaceSourceBinding.sha256,workspaceSourceSha);assert.deepEqual(r.workspaceSourceBinding.files,workspaceSources.files);
  for(const round of r.rounds){
    const ready=round.workspaceReadiness;assert.equal(ready.schema,1);assert.equal(ready.readyState,'complete');
    for(const field of ['bootCount','spinnerCount','slotErrorCount','factoryErrorCount'])assert.equal(ready[field],0);
    for(const field of ['rootCount','sidebarCount','mainCount'])assert.equal(ready[field],1);
    assert(Number.isInteger(ready.visibleNewSessionButtons)&&ready.visibleNewSessionButtons>=1);assert.equal(ready.sep,'function');assert.equal(ready.host,'function');
  }
  assert.equal(r.programDescriptorReverified,true);assert.equal(r.dailyPublicEntryGuardsUnchanged,true);assert.equal(r.cleanup.length,0);
  assert.deepEqual(r.wrapperChecks.map(x=>x.entry).sort(),['start.ps1','start.vbs']);
  for(const wrapper of r.wrapperChecks){
    const row=r.rounds.find(x=>x.round===wrapper.round);assert(row);assert.equal(row.hostPid,wrapper.hostPid);assert.equal(row.electronPid,wrapper.electronPid);
    if(wrapper.status==='blocked'){
      assert.equal(wrapper.entry,'start.ps1');assert.equal(wrapper.reason,'POWERSHELL_EXECUTION_POLICY');assert.equal(wrapper.windowReopen,'not_run');assert.equal(wrapper.originalHostUnchanged,true);
      assert(isPowerShellPolicyBlock(wrapper.entry,wrapper.exit,await readFile(join(P,directory,`round-${wrapper.round}-wrapper.stderr.log`))));
      assert(row.stages.some(x=>x.step==='packaged-ps1-policy-blocked'&&x.status==='blocked'&&x.windowReopen==='not_run'));
    }else{
      assert.equal(wrapper.status,'pass');assert.deepEqual(wrapper.exit,{code:0,signal:null});
      assert(row.stages.some(x=>x.step==='actual-packaged-wrapper-reopens-same-window-and-host'&&x.status==='pass'));
    }
  }
  assert.equal(r.status,r.wrapperChecks.some(x=>x.status==='blocked')?'blocked':'pass');desktop.push(r);
}
const guardian=await record('DESKTOP-GUARDIAN-AUDIT-r3.json');assert.equal(guardian.status,'pass');assert.equal(guardian.rounds.length,4);
assert.deepEqual(guardian.rounds.map(x=>`${x.kind}:${x.round}`).sort(),['full:1','full:2','sep:1','sep:2']);
for(const gui of desktop){
  const binding=guardian.guiResults.find(x=>x.kind===gui.kind);assert(binding);
  const source=records.find(x=>x.path===`default-desktop-${gui.kind}-r3/RESULT.json`);
  assert.equal(binding.sha256,source.sha256);assert.equal(binding.size,source.size);assert.equal(binding.originalStatus,gui.status);assert.equal(binding.coreStatus,gui.coreStatus);
  const journal=guardian.journals.find(x=>x.kind===gui.kind);assert(journal);assert.equal(journal.chainVerified,true);
  for(const round of gui.rounds){const exit=guardian.rounds.find(x=>x.kind===gui.kind&&x.round===round.round);assert.equal(exit.status,'pass');assert.equal(exit.hostPid,round.hostPid);assert(Number.isInteger(exit.generation));assert.deepEqual(exit.exit,{code:0,signal:null,forced:false,ready:true});}
}
const scans=[];
for(const [kind,name] of [['full','FULL'],['sep','SEP']]){
  const r=await record(`repaired-r2/privacy/FINAL-${name}-SCAN.json`);assert.equal(r.status,'pass');assert.equal(r.gaps.length,0);assert.equal(r.unresolvedFindings,0);
  assert.equal(r.identity.archiveSha256,archives.archives.find(x=>x.kind===kind).sha256);assert.equal(r.fullPrivacyAudit,'not_run');scans.push(r);
}
const packageReview=await record('repaired-r2/FINAL-PACKAGE-REVIEW.json');assert.equal(packageReview.status,'pass');assert.equal(packageReview.archiveBinding.status,'pass');
for(const expected of archives.archives){const observed=packageReview.archives.find(x=>x.kind===expected.kind);assert(observed);assert.equal(observed.sha256,expected.sha256);assert.equal(observed.bytes,expected.size);}
const privacyReview=await record('repaired-r2/privacy/AUDIT.json');assert.equal(privacyReview.status,'pass');
const finalReview=await record('FINAL-ACCEPTANCE-REVIEW.json');assert.equal(finalReview.status,'pass');
for(const expected of archives.archives){const observed=finalReview.archives.find(x=>x.kind===expected.kind);assert(observed);assert.equal(observed.sha256,expected.sha256);assert.equal(observed.size,expected.size);}
const extraction=await record('repaired-r2/POWERSHELL-EXTRACTION.json');assert.equal(extraction.status,'pass');
assert.equal(extraction.auditModule.expected.revision,'windows-package.2');assert.equal(extraction.results.length,2);
assert.equal(extraction.archiveReceipt.sha256,records.find(x=>x.path==='repaired-r2/ARCHIVES.json').sha256);assert.deepEqual(extraction.results.map(x=>x.kind).sort(),['Full','Only']);
for(const r of extraction.results){assert.equal(r.status,'pass');assert.equal(r.extractionExitCode,0);assert.equal(r.auditExitCode,0);assert.equal(r.archiveUnchanged,true);const expected=archives.archives.find(x=>x.kind===(r.kind==='Full'?'full':'sep'));assert.equal(r.archiveSha256,expected.sha256);assert.equal(r.archiveBytes,expected.size);}
const longPaths=await record('verification-longpath-green/AUDIT.json');assert.equal(longPaths.regression.pass,30);assert.equal(longPaths.regression.blocked,1);
await record('fresh-install-verification-r1/RESULT.json');
await record('headless-install-verification-r1/RESULT.json');
await record('headless-install-verification-r2/RESULT.json');
await record('headless-install-verification-r3/RESULT.json');
await record('headless-install-verification-r4/RESULT.json');
await record('headless-start-diagnostic-r1/RESULT.json');
await record('headless-start-diagnostic-r1/AUDIT.json');
const oldDesktop=await record('default-desktop-full-r1/RESULT.json');assert.equal(oldDesktop.status,'fail');
await record('desktop-guardian-r1/AUDIT.json');
await record('default-desktop-full-r2/RESULT.json');await record('default-desktop-sep-r2/RESULT.json');
await record('DESKTOP-GUARDIAN-AUDIT.json');
const contractSnapshot=await record('inventory-diagnostic-r1/RESULT.json');assert.equal(contractSnapshot.status,'pass');assert.equal(contractSnapshot.inputSha256,installSha);assert.equal(contractSnapshot.resourceAudit.status,'pass');
await record('PROGRAM-SEALED.json');await record('PACKAGE-DOCS-REVIEW.json');await record('SUPPORT-PYC-OMISSION.json');await record('SUPPORT-PYTHON-IMPORT.json');
await record('ONLY-REQUIRED.json');await record('official-source-audit-r3/RESULT.json');
await record('installer-freeze-r2/FREEZE.json');
await record('verification-freeze-r6/FREEZE.json');
await record('verification-freeze-r7/FREEZE.json');
await record('verification-freeze-r8/FREEZE.json');
await record('verification-freeze-r9/FREEZE.json');
await record('verification-freeze-r10/FREEZE.json');
await record('verification-freeze-r10-r2/FREEZE.json');
await record('verification-freeze-r11/FREEZE.json');
await record('verification-documentation-r1/FREEZE.json');
const result={
  schema:1,status:'pass',scope:'Fixed Windows x64 Full/Only archive construction, bounded privacy inspection, fresh installation and isolated service/core-desktop plus VBS smoke verification. Direct start.ps1 policy blocks are recorded separately and excluded from pass. Not a new public release or universal plugin certification.',
  hostVersion:'0.2.1-alpha.2',sepVersion:'0.2.1-beta.3-alpha2-adapter.1',revision:'windows-package.2',
  archives:archives.archives.map(({path,...r})=>({...r,file:basename(path)})),
  acceptance:{freshInstallations:install.installations.length,installedRuntimeSmoke:install.installations.filter(x=>x.runtimeSmoke.status==='pass').length,headlessChecks:headless.checks.length,headlessHostLifetimes:headless.hosts.length,desktopColdRounds:desktop.reduce((n,r)=>n+r.rounds.length,0),actualNodeSecondaryLaunches:desktop.reduce((n,r)=>n+r.rounds.filter(x=>x.stages.some(s=>s.step==='actual-second-launch-reopens-same-window-and-host')).length,0),actualPs1Reopens:desktop.reduce((n,r)=>n+r.wrapperChecks.filter(x=>x.entry==='start.ps1'&&x.status==='pass').length,0),blockedPs1Reopens:desktop.reduce((n,r)=>n+r.wrapperChecks.filter(x=>x.entry==='start.ps1'&&x.status==='blocked').length,0),actualVbsReopens:desktop.reduce((n,r)=>n+r.wrapperChecks.filter(x=>x.entry==='start.vbs'&&x.status==='pass').length,0),desktopGuardianExits:guardian.rounds.length,modelCalls:0,
    shortRootPowerShellExtraction:'pass; current Windows PowerShell version only, see bound separate report',
    privacy:{status:'pass',scope:scans[0].scope,unresolvedFindings:0,coverageGapsInSelectedDecoders:0,fullPrivacyAudit:'not_run'},
    dailyPublicEntryGuardsUnchanged:desktop.every(x=>x.dailyPublicEntryGuardsUnchanged),
    resourceAudit:headless.resourceAudit.path,
    guiResourceAudit:'Normal Electron app.quit, then each tracked launcher/Electron/Host PID and P2 owner lock absence; independent journal-chain audit binds each Host/generation to ready and exit 0, signal null, forced false. No forced test cleanup on accepted core runs. Asynchronous VBS descendants were not independently tracked.'},
  retainedFailures:[
    'First deep-path ZIP extraction failed before installation. Windows extended-path I/O was added to the independent extractor; original output retained.',
    'Extractor follow-up: 31 definitions, 30 pass, 1 blocked because the unchanged junction fixture command was rejected by Windows (WinError 225). Historical 30/30 evidence is not substituted for that blocked current test.',
    'The windows-package.1 fresh-install Host exited 1 before readiness. The original and separate diagnostic runs are retained; later exact PID/P2 lock absence does not turn that startup into pass. Revision 2 moves only the fresh ledger into its own state/budget directory, with real binding regressions and new ZIP/install/service/desktop evidence.',
    'The first revision-2 service probe started both Hosts but incorrectly compared the memory service project key with a configuration UUID. That run remains fail and its normal cleanup is separately attributed. A corrected probe binds the actual recovery authority, and the later service run uses its own receipt.',
    'A subsequent probe incorrectly treated stored project controls as the configured/effective capture switch. Its failed run and normal cleanup are retained. The final probe checks stored, configured and effective memory controls separately against the fixed service contract; no product change was made for these probe corrections.',
    'The next probe incorrectly expected the old memory UI package name; this combination mounts that UI using its exact installed file URL. The failed run and normal cleanup are retained. Final composition verification binds the installed module identity and explicit enabled/disabled state of this fresh Profile.',
    'The first Full desktop probe failed at direct start.ps1 because of the current PowerShell execution policy. Its failure cleanup kept the inspector connected until after its deadline and reported blocked. That original fail/blocked receipt is retained; a later independently bound journal confirms only the original Host exited normally. The probe was corrected to disconnect before waiting; new core/VBS results do not reclassify the original receipt or the policy block.',
    'GUI r2 lifecycle and wrapper facts remain retained, but its workspace readiness predicate also accepted the official Loading plugins boot screen (textLength 24). The final independent review rejected that readiness proof. GUI r3 must instead bind the disappearance of the boot screen and actual workspace controls; r2 is not counted toward the final workspace-ready acceptance.',
    'Earlier source-proof, bootstrap, redaction and test-fixture failures are retained in the stage directory; only final successful reports support the relevant claims.'
  ],
  limitations:[
    'Fixed Windows x64 Alpha.2 combination only; Only needs the exact authenticated npm component subset and supported expanded layout.',
    'Default desktop uses the existing --inspect-desktop observation option. Real secondary launches use no observation flag; physical pointer/tray/first-close-notice and a first launch without observation were not certified here.',
    'No paid model, external Computer use/MCP/WSL/Docker feature certification, or exhaustive plugin-function certification in this packaging run.',
    'Bounded pattern/container scans and provenance review do not prove absence of arbitrary encoded private content; fullPrivacyAudit remains not_run.',
    'Short-root Expand-Archive was tested only on the current recorded Windows PowerShell version. Explorer and arbitrary extraction tools/versions are not certified. Use a short extraction root as described in EXTRACTION.md.',
    'The unchanged production VBS uses child-process -ExecutionPolicy Bypass. No persistent execution policy was changed; its asynchronous descendants were not independently tracked.',
    'Direct start.ps1 was attempted under the current PowerShell policy and may be blocked; each blocked attempt remains blocked with window reopen not_run. Node/VBS success does not prove the PS1 policy issue resolved.',
    'No public HTTPS full-install loop, GitHub upload, daily switch or private-data migration.'
  ],githubUploaded:false,dailySwitched:false,privateDataImported:false,evidence:records
};
assert.equal(result.acceptance.dailyPublicEntryGuardsUnchanged,true);
await writeFile(join(P,'DELIVERY-RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
await writeFile(join(P,'repaired-r2/artifacts/VERIFICATION.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
await writeFile(join(P,'repaired-r2/artifacts/SHA256SUMS.txt'),result.archives.map(x=>`${x.sha256}  ${x.file}`).join('\n')+'\n',{flag:'wx'});
const guide=[
  '# Windows Alpha.2 Full / Only 本地交付',
  '',
  `DSH ${result.hostVersion} + SEP ${result.sepVersion}，分发修订 ${result.revision}，Windows x64。尚未上传 GitHub，未切换日常版。`,
  '',
  '## 两份安装包',
  '',
  ...result.archives.map(r=>`- [${r.kind==='full'?'Full 完整包':'Only 增强包'}](${r.file})：${r.size} 字节；SHA-256：\`${r.sha256}\`。`),
  '',
  'Full 提供固定 DSH、SEP 及运行支持。Only 提供 SEP、必要适配和运行支持，还需要与包内清单逐字节一致的官方 npm 组件展开目录；它不支持任意官方桌面安装目录。两个安装器都创建新的独立实例，不覆盖已有官方 DSH 或 SEP。',
  '',
  '先核对 SHA256SUMS.txt，阅读 EXTRACTION.md，解压至短的真实目录。再按包内 README.md 运行 installer.mjs；Only 的来源准备见包内 docs/ONLY-SOURCE.md。目标必须是不存在的新目录。首次凭据为空，需自行配置模型 Key。',
  '',
  '## 本次验证',
  '',
  `两份最终 ZIP 均完成全新安装与随包运行时检查；${result.acceptance.headlessHostLifetimes} 次真实 Host 生命周期验证通过，包含双实例同时运行、金额设置隔离及退出后重开。`,
  `Full / Only 各两轮实际 Electron 冷启动、界面就绪、Node 二次启动恢复和正常退出通过；start.vbs 恢复 ${result.acceptance.actualVbsReopens} 次。直接 start.ps1 恢复：通过 ${result.acceptance.actualPs1Reopens} 次、因当前 PowerShell 策略阻断 ${result.acceptance.blockedPs1Reopens} 次，未改变系统策略。空凭据保持原字节，无付费模型调用。`,
  '最终页面就绪判据包括启动占位符消失、真实侧栏和主内容区加载、新建会话按钮可见可用。旧 r2 探针曾把加载页误判为就绪，其原回执保留但不计入该项通过；最终依据是新 r3 回执。',
  '修订 1 的新装账本与锁目录包含冲突已在修订 2 修正；旧失败包及日志保留。最终通过路径使用正常退出，未以强制测试清理冒充应用收尾。VBS 异步派生进程没有独立逐个跟踪。',
  '实际压缩包已重新进行有界脱敏扫描和来源复核：所选解码范围内无未解释命中、无覆盖缺口。未导入日常私人 Profile、Key、会话或账本。任意编码内容和全部二进制语义不属于该扫描证明范围。',
  '',
  '## 保留的限制',
  '',
  '本轮桌面初次启动使用现有观察选项，不包含物理鼠标、托盘菜单、首次关闭提示或所有插件逐项认证。外部 MCP、Computer use、WSL/Docker 与付费模型能力另有环境要求。',
  '解包器回归有一项 junction 夹具被 Windows 安全软件阻断，记录为 30 通过、1 阻断；不能表述为 31/31。普通短路径 Expand-Archive 的两包检查另有独立通过证据，不外推到任意解压软件和路径长度。',
  '直接执行 start.ps1 的策略阻断与 VBS 入口分别记账。VBS 原实现含子进程级 -ExecutionPolicy Bypass；本轮未新增绕过参数或永久修改系统策略。启动方式与诊断命令见 EXTRACTION.md。首次桌面失败收尾曾因测试器的调试连接超时，原 fail/blocked 回执与后续宿主正常退出证据分开保留。',
  '完整公网自动安装闭环、本轮 GitHub 发布及日常版切换均未执行。校验摘要不是代码签名。',
  '',
  '详见 [VERIFICATION.json](VERIFICATION.json) 的具体证据路径、SHA-256、失败记录及认证边界。',
  ''
].join('\n');
await writeFile(join(P,'repaired-r2/artifacts/README.md'),guide,{flag:'wx'});
await writeFile(join(P,'repaired-r2/artifacts/EXTRACTION.md'),await readFile(new URL('../EXTRACTION.md',import.meta.url)),{flag:'wx'});
console.log(JSON.stringify({status:result.status,artifacts:result.archives.map(x=>x.file),acceptance:result.acceptance}));
