/** Finalize a NEW, unarchived startup-fix candidate. Does not install, launch,
 * create ZIPs, push Git, or infer passing test counts. Explicit CLI inputs only. */
import {readFile,writeFile,mkdir,readdir,lstat,realpath} from 'node:fs/promises';
import {resolve,join,dirname,isAbsolute,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=c=>{throw Object.assign(Error(c),{code:c});};
const requireValue=(v,c)=>{if(!v)fail(c);};
const BASE_GRAPH='8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52';
const forbiddenPath=/(^|\/)(?:\.git|\.codex|\.env(?:\.[^/]*)?|local-secrets)(\/|$)/i;
const secret=/(?<![A-Za-z0-9])(?:sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})/;
const privateUser=(process.env.USERPROFILE??'').split(/[\\/]/).filter(Boolean).at(-1);
const escapeRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const personal=privateUser?new RegExp('(?:[a-z]:[\\\\/]+Users[\\\\/]+|/mnt/[a-z]/Users/|Users%5[cC])'+escapeRe(privateUser)+'(?:[\\\\/]|%5[cC]|["\\s]|$)','i'):/(?:[a-z]:[\\/]+Users[\\/]+[^\\/\s]+)/i;
const userToken=privateUser?new RegExp('(?<![A-Za-z0-9])'+escapeRe(privateUser)+'(?![A-Za-z0-9])','g'):/$^/;
const safe=p=>{requireValue(typeof p==='string'&&p&&p.split('/').every(x=>x&&x!=='.'&&x!=='..'&&!/[\\<>:"|?*\x00-\x1f]/.test(x))&&!forbiddenPath.test(p),'PUBLIC_PATH');return p;};
async function bytes(p){const s=await lstat(p);requireValue(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,'SOURCE_IDENTITY');return readFile(p);}
const json=async p=>JSON.parse(await bytes(p));
async function write(p,b){await mkdir(dirname(p),{recursive:true});await writeFile(p,b);}
const writeJson=(p,j)=>write(p,JSON.stringify(j,null,2)+'\n');
async function inventory(root,prefix=''){const out=[];for(const e of await readdir(join(root,prefix),{withFileTypes:true})){const p=prefix?prefix+'/'+e.name:e.name;safe(p);requireValue(!e.isSymbolicLink(),'SOURCE_LINK');if(e.isDirectory())out.push(...await inventory(root,p));else {const b=await bytes(join(root,p));out.push({path:p,bytes:b.length,sha256:sha(b)});}}return out.sort((a,b)=>a.path.localeCompare(b.path));}
export function publicBytes(b,name){const text=b.toString('utf8').replaceAll('\0','');requireValue(!personal.test(text),'PERSONAL_PATH_IN_SOURCE: '+name);requireValue(!secret.test(text),'SECRET_IN_SOURCE: '+name);return b;}
function sanitize(value){
 if(Array.isArray(value))return value.map(sanitize);
 if(value&&typeof value==='object'){const out={};for(const [key,v]of Object.entries(value)){if(/^(?:apiKey|authorization|accessToken|refreshToken|password|secret|token|connectionUrl|credentials)$/i.test(key)){out[key]='[redacted]';continue;}out[key]=sanitize(v);}return out;}
 if(typeof value!=='string')return value;
 // Evidence paths are references, not data. Redact them instead of copying
 // private logs or embedded user-path source into a public package.
 if(secret.test(value))return '[redacted-secret-value]';
 if(/^[a-z]:[\\/]|^file:\/\/\/[a-z]:|^\/mnt\/[a-z]\//i.test(value))return '[local-path]/'+value.split(/[\\/]/).at(-1).replace(userToken,'user');
 return value.replace(/(?:[a-z]:[\\/]+Users[\\/]+[^\\/\s]+|\/mnt\/[a-z]\/Users\/[^/\s]+)(?:[^\r\n]*?)(?=[\r\n]|$)/gi,'[local-path]').replace(userToken,'[user]');
}
export function reconcileHostAdaptations(rows,graph,changes,revision='startup'){
 requireValue(/^[A-Za-z0-9._-]{1,80}$/.test(revision),'ADAPTATION_REVISION');
 const files=new Map(graph.files.map(f=>[f.path,f])),out=structuredClone(rows),mapped=new Map(out.map(r=>[r.path,r]));
 for(const row of out)if(files.has(row.path))row.afterSha256=files.get(row.path).sha256;
 for(const change of changes){const file=files.get(change.path),pkg=graph.packages.find(p=>p.id===change.path.split('/')[1]);requireValue(file&&pkg&&file.sha256===change.sha256,'ADAPTATION_GRAPH');if(mapped.has(change.path))continue;const row={path:change.path,package:pkg.name,afterSha256:file.sha256,scope:revision+' Windows host/recovery adaptation'};out.push(row);mapped.set(row.path,row);}
 return out;
}
async function preserve(path,history){const b=await bytes(path);try{const old=await bytes(history);requireValue(old.equals(b),'HISTORY_ALREADY_DIFFERENT');}catch(e){if(e.code!=='ENOENT')throw e;await write(history,b);}}
const LIMITS=[
 '本轮覆盖报告列明的 Windows 合成场景；真实 Windows 系统重启／断电尚未实测。',
 '本轮没有调用收费模型，不把启动和恢复验证当作模型服务可用性验证。',
 '损坏日志、无法验证的文件／进程身份、未完成业务写入与不受支持的治理记录仍会保守阻断；不会删锁后强行写库。',
 '修补只接受明确支持的旧图及入口哈希；用户改过的受管文件、未知插件变化或候选漂移将拒绝覆盖。',
 '后台保留与恢复不等于重放外部操作。未知操作结果仍需核对，不自动重复模型、工具或计费请求。',
 'Windows x64 Alpha 测试版；Windows 10 的独立实测状态沿原记录，不声明跨平台或稳定版认证。',
];
function shownCounts(report){const s=report.summary;if(!s||typeof s!=='object')return '验收数量未从报告自动汇总；请以随附机器报告逐项结果为准。';const entries=Object.entries(s).filter(([k,v])=>['tests','passed','failed','blocked','notRun','rounds'].includes(k)&&Number.isSafeInteger(v)&&v>=0);return entries.length?'机器报告原始 summary：'+entries.map(([k,v])=>'`'+k+'='+v+'`').join('，')+'。':'验收数量未从报告自动汇总；请以随附机器报告逐项结果为准。';}
function readme({name,revision,graphHash,status,counts}){return `# DSH SEP — Windows Alpha 启动修订\n\n分发修订 \`${revision}\`；DSH \`0.1.6-alpha.2\`，映射原创 SEP 内容为 MIT。第三方保留原许可。${name==='DSH-SEP-Full'?'Full 包包含完整 DSH 和 SEP。':'Only 包包含 SEP 及必要适配，要求提供清单匹配的 alpha.2 宿主来源。'}\n\n本轮从根本写者入口增加系统持有的所有权租约、受限旧残锁接管及受管启动收尾，并统一新装与既有安装的启动源码。具体实现与测试范围见 [启动修订](docs/STARTUP_FIX.md)。机器验收报告状态为 \`${status}\`。${counts}\n\n- 新用户：解压后运行 \`install.ps1\`，选择一个尚不存在的本地安装目录；Only 还需受支持宿主来源。原官方 DSH 不被原地覆盖。新安装配置文件为 \`deployment.json\`。\n- 已有用户：不要解压覆盖现有安装。请按 [启动修补说明](REPAIR_README.md)运行 \`repair.ps1\`，先预检再选择 \`-Apply\`。支持范围由 \`repair-policy.json\` 精确绑定。\n- 安装／修补后使用原实例的 \`start.vbs\`，诊断入口为 \`start.ps1\`。关闭窗口保留后台；维护前通过菜单或托盘完整退出。\n- [文档导航](docs/DOCS_INDEX.md) · [使用指南](docs/USER_GUIDE.md) · [源码与许可](SOURCE-PROVENANCE.json)\n\n## 范围限制\n\n${LIMITS.map(x=>'- '+x).join('\n')}\n\n程序图 SHA-256：\`${graphHash}\`。9 月 21 日数字与旧发行状态是历史证据，不是本轮新增验收。新旧代码、启动文件、测试和最终 ZIP 应分别由对应清单核验；本文件不表示已上传新 GitHub Release。\n`;}
export async function finalizeDocsSource({candidate,reportPath,sourceRoot=resolve(import.meta.dirname,'..')}){
 for(const p of [candidate,reportPath,sourceRoot])requireValue(isAbsolute(p),'ABSOLUTE_PATH_REQUIRED');
 requireValue((await realpath(candidate)).toLowerCase()===resolve(candidate).toLowerCase(),'CANDIDATE_ALIAS');
 requireValue(!(await readdir(candidate)).some(n=>/\.zip$/i.test(n)),'ALREADY_ARCHIVED');
 const build=await json(join(candidate,'BUILD-RESULT.json'));requireValue(build.status==='pass'&&build.baseGraphSha256===BASE_GRAPH,'CANDIDATE_BUILD');
 const graphHash=sha(await bytes(join(candidate,'DSH-SEP-Full/graph.json')));requireValue(build.graphHash===graphHash,'CANDIDATE_GRAPH');
 const raw=await bytes(reportPath),report=JSON.parse(raw);requireValue(report.schema===1&&report.graphHash===graphHash&&['pass','partial','fail','blocked','not_run'].includes(report.status),'REPORT_GRAPH_OR_STATUS');
 const publishedReport=sanitize(report),reportBytes=Buffer.from(JSON.stringify(publishedReport,null,2)+'\n');publicBytes(reportBytes,'startup-validation.json');
 const binding={schema:1,originalReportSha256:sha(raw),publicReportSha256:sha(reportBytes),graphHash,redaction:'Public report values only; absolute local paths and credential fields redacted. Original report retained locally; raw logs and synthetic process files not bundled.'};
 const source=join(candidate,'DSH-SEP-Source'),oldSource=await json(join(source,'SOURCE_FILES.json'));const rows=new Map(oldSource.files.map(r=>[r.path,r]));
 async function add(path,b,role,extra={}){safe(path);publicBytes(b,path);await write(join(source,path),b);rows.set(path,{path,bytes:b.length,sha256:sha(b),role,...extra});}
 // Curated authoring inputs only. Generated fixtures embed actual machine paths
 // and are deliberately excluded instead of being copied recursively.
 const selections={
  '':['core.test.mjs','bootstrap.test.mjs','integrate-core.mjs','build-bootstrap.mjs','fix-explicit-p2-token.mjs','assemble-config.mjs','real-installed.test.mjs','installed-worker.mjs','real-electron.test.mjs','real-coexist.test.mjs','verify-small-repair.mjs'],
  ownership:['owner-file.mjs','owner-child.mjs','owner-file.test.mjs','journal-gate.test.mjs','apply-journal-gate.mjs','README.md'],
  managed:['child.mjs','native-managed.test.mjs','manual-start.test.mjs','rpc-manual.test.mjs','sep-lock-native.mjs','build-overlay.mjs'],
  'host-lifecycle':['main.test.mjs','process.test.mjs','process-fixture.mjs','sep-host-lifecycle.mjs','sep-host-lifecycle.d.mts','build-overlay.mjs','README.md'],
  diagnostics:['build-overlay.mjs','diagnostics.test.mjs','README.md','startup-diagnostic.mjs','startup-diagnostic.d.mts'],
 };
 for(const [dir,names]of Object.entries(selections))for(const name of names){const rel=dir?dir+'/'+name:name;await add('startup-source/'+rel,await bytes(join(sourceRoot,rel)),'startup-authoring-or-test-source');}
 // The diagnostics layer extends the lifecycle TypeScript source. Preserve
 // both authored stages, then provide one complete latest preferred source.
 for(const dir of ['host-lifecycle','diagnostics'])for(const row of await inventory(join(sourceRoot,dir,'source'))){const b=await bytes(join(sourceRoot,dir,'source',row.path));await add('startup-source/'+dir+'/source/'+row.path,b,'authoring-stage-source');await add('startup-source/preferred-host/'+row.path,b,'preferred-authoring-source',{preferredFor:row.path.endsWith('/index.ts')?'store/p0498/lib/index.js':undefined});}
 for(const row of await inventory(join(sourceRoot,'bootstrap')))if(/\.(?:mjs|ps1|vbs)$/.test(row.path)){const b=await bytes(join(sourceRoot,'bootstrap',row.path));const installed=await bytes(join(candidate,'DSH-SEP-Full/bootstrap',row.path));requireValue(installed.equals(b),'BOOTSTRAP_SOURCE_DRIFT');await add('startup-source/bootstrap/'+row.path,b,'exact-bootstrap-source');}
 const distributionNames=['build.mjs','installer.mjs','repair.mjs','repair-cli.mjs','windows-adapters.mjs','finalize-docs-source.mjs','finalize-docs-source.test.mjs','derive-repair-bundle.mjs','derive-repair-bundle.test.mjs','build.test.mjs','installer.test.mjs','repair.test.mjs','windows-adapters.test.mjs','repair.ps1','REPAIR_README.md','IMPLEMENTATION.md','make-policy.mjs'];
 for(const name of distributionNames){const b=await bytes(join(sourceRoot,'distribution',name));await add('startup-source/distribution/'+name,b,'startup-distribution-source');if(rows.has('distribution/'+name))await add('distribution/'+name,b,'distribution-source');}
 // One current Source map; old metadata is explicitly preserved as history.
 await preserve(join(source,'SOURCE-PROVENANCE.json'),join(source,'history/20260921-mit/SOURCE-PROVENANCE.json'));
 await preserve(join(source,'README.md'),join(source,'history/20260921-mit/README.md'));
 await preserve(join(source,'BUILD.md'),join(source,'history/20260921-mit/BUILD.md'));
 const summary={graphSha256:graphHash,files:rows.size,exactReleaseFiles:[...rows.values()].filter(r=>r.role==='exact-release-file').length,supplementalFiles:[...rows.values()].filter(r=>r.role!=='exact-release-file').length,bytes:[...rows.values()].reduce((a,b)=>a+(b.bytes??0),0)};
 await writeJson(join(source,'SOURCE_FILES.json'),{schema:1,distribution:build.revision,graphSha256:graphHash,files:[...rows.values()].sort((a,b)=>a.path.localeCompare(b.path)),summary});const sourceManifestHash=sha(await bytes(join(source,'SOURCE_FILES.json')));
 await writeJson(join(source,'SOURCE-PROVENANCE.json'),{schema:1,distribution:build.revision,graphSha256:graphHash,sourceFilesManifestSha256:sourceManifestHash,baseGraphSha256:BASE_GRAPH,repository:'https://github.com/Lance-QwQ/DSH-SEP',preferredHostSource:'startup-source/preferred-host/apps/desktop-host/src/index.ts',preferredRecoveryServerSource:'program-source/store/p0500/src/server.mjs',manualRpcSource:{generator:'startup-source/diagnostics/build-overlay.mjs',test:'startup-source/managed/rpc-manual.test.mjs'},bootstrapSource:'startup-source/bootstrap',ownershipSource:'startup-source/ownership/owner-file.mjs',distributionSource:'startup-source/distribution',testSource:['startup-source/core.test.mjs','startup-source/bootstrap.test.mjs','startup-source/real-installed.test.mjs','startup-source/installed-worker.mjs','startup-source/real-electron.test.mjs','startup-source/real-coexist.test.mjs','startup-source/ownership','startup-source/managed','startup-source/host-lifecycle','startup-source/distribution'],upstreamDsh:{version:'0.1.6-alpha.2',commit:'ddefc45fbc7f8e46dd73185e68295696d1297887'},licenseScope:'MIT for mapped original SEP contributions; original DSH and third-party terms retained.',privateDataIncluded:false,privateGitHistoryIncluded:false,reproducibleBuildClaim:false,allTransitiveBinarySourcesIncluded:false,evidence:binding});
 await write(join(source,'README.md'),`# DSH SEP Windows Alpha 启动修订源码\n\n修订 \`${build.revision}\`；程序图 \`${graphHash}\`。逐文件来源和哈希见 SOURCE_FILES.json。\n\nprogram-source 对应实际发布程序文件；startup-source 收录新所有权实现、首选桌面宿主 TypeScript 源、统一 bootstrap、生成器及测试。首选宿主源为 startup-source/preferred-host/apps/desktop-host/src/index.ts。恢复服务的 .mjs 首选源为 program-source/store/p0500/src/server.mjs；manual 参数最终转发由 startup-source/diagnostics/build-overlay.mjs 生成，并由 startup-source/managed/rpc-manual.test.mjs 覆盖。实装、Electron 和双实例并存测试及其 worker 已收录，测试与生成的本机故障现场分开，未打包私人会话、Key、.env 或 Git 历史。\n\n机器验收报告及具体限制在 Full／Only 的 docs/STARTUP_FIX.md。9 月 21 日旧许可和功能指标保留在 history 中，不能代替本轮测试。构建条件与边界见 BUILD.md；本快照不声称可以独立重建全部上游二进制。\n`);
 await write(join(source,'BUILD.md'),`# 构建与局部验证范围\n\n当前生成器为 startup-source/distribution/build.mjs，使用显式 --config 文件。它从固定的公开 9 月 21 日 MIT Only／Full／Source 基线和本轮已验证 overlay、bootstrap 生成新候选；不是从空目录编译所有 DSH 和原生依赖。\n\n基线下载：https://github.com/Lance-QwQ/DSH-SEP/releases/tag/windows-alpha-20260921-mit 。基线程序图必须为 \`${BASE_GRAPH}\`，归档校验值必须与该公开发行 SHA256SUMS.txt 一致。不要用未知同名包替代。Node、Electron、Office 和其他原生依赖需要匹配的 Full／Only 载荷，不能凭本源码快照重新创造这些二进制。\n\n1. 保留基线原字节，在独立目录准备 overlay 与 bootstrap；采用逐文件 before/after SHA-256 绑定。build.mjs 只允许新建 outputRoot，禁止覆盖已封存归档或用户安装。\n2. 运行源码中生成器前，阅读 startup-source/distribution/IMPLEMENTATION.md 并提供真实绝对路径配置；不要把示例占位路径直接执行。新包 repair-policy 只支持明确的旧图及入口哈希。\n3. 当前测试为可审阅编写源，需要匹配的运行程序与隔离 fixtures。core / managed 测试涉及旧版和候选真实进程，部分依赖原工作区相对布局；SEP_OWNER_PATCH_ROOT、SEP_MANAGED_ENTRY、SEP_HOST_TEST_ENTRY 等参数只覆盖各测试实际实现的入口。没有验证从干净 Git 克隆开始的一条命令跑完所有测试。不要直接在现用程序目录加测试文件。\n4. startup-source/preferred-host 提供合并生命周期与诊断层后的首选 TypeScript 及配套 .mjs；两个原始编写阶段单独保留；program-source 保留与封图逐字节对应的编译输出。区别 authored 与 exact-release-file，不能把手工修改输出冒充上游完整可重复构建。\n5. 完成实装／修补／故障恢复测试后，运行 finalize-docs-source.mjs --candidate <新候选> --report <该图机器验收报告>；随后对最终 ZIP 完整读回、扫描隐私并生成新 SHA256SUMS。不得复用旧 pass 或仅凭本脚本运行成功宣称稳定版。\n\nMIT 仅适用于映射原创内容；第三方许可、源码访问及原始声明保留。Office / LibreOffice 源码义务见相应材料。history/release-tools 中旧许可转换脚本只是历史记录，不能当作当前独立构建入口。\n`);
 const counts=shownCounts(report),current=`本轮启动修订 \`${build.revision}\`，程序图 \`${graphHash}\`。此页原有 2026-09-21 版本号、验收数量与发布状态保留为历史；本轮结果请读 [启动修订](STARTUP_FIX.md)。更新状态没有降低固定验收标准。\n\n`;
 const details=`# Windows 启动修订与验证范围\n\n修订 \`${build.revision}\`。DSH 仍为 0.1.6-alpha.2；未在此修补中迁移 rc.1。\n\n本轮针对恢复中心或宿主意外终止后残留所有权记录造成后续启动阻塞、部分启动收尾及重复入口问题，更新实际写者租约与统一启动链。已有用户通过包根 [修补指南](../REPAIR_README.md) 使用 repair.ps1；新装和修补共享 bootstrap 源。\n\n机器验收报告状态：\`${report.status}\`。${counts}\n\n[脱敏机器报告](evidence/startup-validation.json) · [报告原始哈希与脱敏绑定](evidence/startup-validation-binding.json)。脚本没有把未提供的指标推测成通过；报告中的 blocked/fail 保留原状态。\n\n## 当前限制\n\n${LIMITS.map(x=>'- '+x).join('\n')}\n\n## 历史证据\n\n9 月 21 日的旧包验收、Office 功能测试、公开 Alpha 授权与已知问题记录仍按原字节保留在 history 或原始来源中。它们支持原来的具体范围，不计入本轮新增数量。后续受控恢复取得的最终零残留，与故障当时 blocked/unknown 分别归因；不能用最终状态改写先前样本。\n`;
 for(const name of ['DSH-SEP-Full','DSH-SEP-Only']){
  const dir=join(candidate,name);requireValue(sha(await bytes(join(dir,'graph.json')))===graphHash,'BUNDLE_GRAPH_MISMATCH');
  for(const p of ['README.md','RELEASE-STATUS.json','SOURCE-PROVENANCE.json'])await preserve(join(dir,p),join(dir,'docs/history/20260921-mit-before-startup',p));
  const oldStatus=await json(join(dir,'RELEASE-STATUS.json')),provenance=await json(join(dir,'SOURCE-PROVENANCE.json'));
  const graph=await json(join(dir,'graph.json')),adaptations=await json(join(dir,'host-adaptations.json'));await writeJson(join(dir,'host-adaptations.json'),reconcileHostAdaptations(adaptations,graph,build.graphChanges,build.revision));
  await write(join(dir,'README.md'),readme({name,revision:build.revision,graphHash,status:report.status,counts}));
  await writeJson(join(dir,'RELEASE-STATUS.json'),{schema:1,distribution:build.revision,releaseLevel:'Windows Alpha test',packageKind:name.endsWith('Full')?'full':'only',graphSha256:graphHash,baseGraphSha256:BASE_GRAPH,status:report.status,stage:'startup-fix-candidate-validation',publicReleaseReady:false,publication:{uploaded:false,scope:'Local candidate; final ZIP integrity/privacy verification and remote publication recorded separately.'},validation:{evidence:'docs/evidence/startup-validation.json',...binding},knownLimitations:LIMITS,historicalStatus:'docs/history/20260921-mit-before-startup/RELEASE-STATUS.json',historicalValidationStatus:oldStatus.status});
  await writeJson(join(dir,'SOURCE-PROVENANCE.json'),{schema:1,distribution:build.revision,packageKind:name.endsWith('Full')?'full':'only',distributionGraphSha256:graphHash,baseGraphSha256:BASE_GRAPH,upstreamDsh:provenance.upstreamDsh??{version:'0.1.6-alpha.2',commit:'ddefc45fbc7f8e46dd73185e68295696d1297887'},sourceDelivery:{directory:'DSH-SEP-Source',sourceFilesManifestSha256:sourceManifestHash,...summary},licenseScope:'Mapped SEP originals MIT; original DSH and third-party notices retained.',reproducibleBuildClaim:false,privateDataIncluded:false,privateGitHistoryIncluded:false,evidence:binding,publication:{uploaded:false},historicalSource:'docs/history/20260921-mit-before-startup/SOURCE-PROVENANCE.json'});
  const docs=join(dir,'docs');for(const f of await inventory(docs))if(f.path.endsWith('.md')&&!f.path.startsWith('history/')&&!f.path.startsWith('licenses/')&&!['STARTUP_FIX.md'].includes(f.path)){const p=join(docs,f.path),b=await bytes(p);await write(p,Buffer.concat([Buffer.from(current),b]));}
  await write(join(docs,'STARTUP_FIX.md'),details);await write(join(docs,'evidence/startup-validation.json'),reportBytes);await writeJson(join(docs,'evidence/startup-validation-binding.json'),binding);
  await writeJson(join(docs,'RELEASE_MANIFEST.json'),{schema:1,distribution:build.revision,graphSha256:graphHash,releaseLevel:'Windows Alpha test',status:report.status,sourceFilesManifestSha256:sourceManifestHash,evidence:'evidence/startup-validation.json',limitations:LIMITS,publication:{uploaded:false,finalArchivesVerified:false},history:'history/20260921-mit-before-startup/'});
  const docRows=await inventory(docs);await write(join(docs,'SHA256SUMS.txt'),docRows.filter(f=>f.path!=='SHA256SUMS.txt').map(f=>f.sha256+'  '+f.path+'\n').join(''));
  // Include current public repair entry and this generator in support/source.
  for(const p of ['repair.ps1','REPAIR_README.md'])await write(join(dir,p),publicBytes(await bytes(join(sourceRoot,'distribution',p)),p));
  const manifest=await json(join(dir,'manifest.json'));manifest.support=(await inventory(dir)).filter(f=>!f.path.startsWith('payload/')&&!['graph.json','manifest.json'].includes(f.path)).map(({path,bytes:size,sha256})=>({path,size,sha256}));await writeJson(join(dir,'manifest.json'),manifest);
 }
 // SOURCE_FILES describes source payloads; SHA256SUMS additionally covers the
 // resulting metadata/docs, avoiding a self-referential manifest hash.
 for(const f of await inventory(source))publicBytes(await bytes(join(source,f.path)),f.path);
 const sourceRows=await inventory(source);await write(join(source,'SHA256SUMS.txt'),sourceRows.filter(f=>f.path!=='SHA256SUMS.txt').map(f=>f.sha256+'  '+f.path+'\n').join(''));
 const receipt={schema:1,status:'pass',scope:'Documentation/source/support binding only; not final archive or runtime validation.',distribution:build.revision,graphHash,sourceFilesManifestSha256:sourceManifestHash,report:binding,sourceEntries:rows.size};await writeJson(join(candidate,'FINALIZED-DOCS-SOURCE.json'),receipt);return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),flags={};requireValue(args.length%2===0,'USAGE');for(let i=0;i<args.length;i+=2){requireValue(['--candidate','--report','--source-root'].includes(args[i])&&!flags[args[i]],'USAGE');flags[args[i]]=args[i+1];}requireValue(flags['--candidate']&&flags['--report'],'USAGE');console.log(JSON.stringify(await finalizeDocsSource({candidate:flags['--candidate'],reportPath:flags['--report'],...(flags['--source-root']?{sourceRoot:flags['--source-root']}:{})})));
}
