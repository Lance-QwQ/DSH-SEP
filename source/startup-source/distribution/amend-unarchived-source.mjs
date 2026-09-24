/** Amend public source/docs only after initial finalization, before ZIP creation. */
import {readFile,writeFile,mkdir,readdir,lstat,realpath} from 'node:fs/promises';
import {resolve,join,dirname,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {publicBytes} from './finalize-docs-source.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const demand=(v,c)=>{if(!v)throw Object.assign(Error(c),{code:c});};
async function bytes(p){const s=await lstat(p);demand(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,'AMEND_FILE_IDENTITY');return readFile(p);}
const json=async p=>JSON.parse(await bytes(p));
async function put(p,b){await mkdir(dirname(p),{recursive:true});await writeFile(p,b);}
const jput=(p,v)=>put(p,JSON.stringify(v,null,2)+'\n');
async function inventory(root,prefix='',skipPayload=false){const out=[];for(const entry of await readdir(join(root,prefix),{withFileTypes:true})){const path=prefix?prefix+'/'+entry.name:entry.name;if(skipPayload&&path==='payload')continue;demand(!entry.isSymbolicLink(),'AMEND_LINK');if(entry.isDirectory())out.push(...await inventory(root,path,skipPayload));else{const b=await bytes(join(root,path));out.push({path,bytes:b.length,sha256:sha(b)});}}return out.sort((a,b)=>a.path.localeCompare(b.path));}
export async function amendSource({candidate,sourceRoot=resolve(import.meta.dirname,'..')}){
 demand(isAbsolute(candidate??'')&&isAbsolute(sourceRoot),'AMEND_PATH');demand((await realpath(candidate)).toLowerCase()===resolve(candidate).toLowerCase(),'AMEND_ALIAS');demand(!(await readdir(candidate)).some(p=>/\.zip$/i.test(p)),'AMEND_ALREADY_ARCHIVED');
 const finalized=await json(join(candidate,'FINALIZED-DOCS-SOURCE.json')),source=join(candidate,'DSH-SEP-Source'),manifestPath=join(source,'SOURCE_FILES.json'),priorManifest=await bytes(manifestPath),map=JSON.parse(priorManifest),rows=new Map(map.files.map(r=>[r.path,r]));
 demand(finalized.status==='pass'&&finalized.graphHash===map.graphSha256,'AMEND_GRAPH');
 const inputs=['integrate-core.mjs','managed/guardian-lifecycle-transform.mjs','managed/generator-consistency.test.mjs','managed/core-regeneration.test.mjs','managed/rpc-manual.test.mjs','ownership/apply-journal-gate.mjs','real-installed.test.mjs','installed-worker.mjs','real-electron.test.mjs','real-coexist.test.mjs','verify-small-repair.mjs','distribution/amend-unarchived-source.mjs','distribution/amend-unarchived-source.test.mjs','distribution/REPAIR_README.md'];
 const prepared=[];for(const relative of inputs){const b=publicBytes(await bytes(join(sourceRoot,relative)),relative);prepared.push({path:'startup-source/'+relative,b,role:'startup-authoring-or-test-source'});}
 const repairReadme=publicBytes(await bytes(join(sourceRoot,'distribution/REPAIR_README.md')),'REPAIR_README.md');prepared.push({path:'distribution/REPAIR_README.md',b:repairReadme,role:'distribution-source'});
 const acceptance=publicBytes(await bytes(join(sourceRoot,'REAL-INSTALLED-ACCEPTANCE.md')),'REAL-INSTALLED-ACCEPTANCE.md');
 const acceptancePublic=Buffer.from('本文件为公开验收说明。文内开发机相对证据路径用于定位封存记录；原始日志、截图、进程现场和安装目录不随源码包交付。对应机器摘要在 Full/Only 的 docs/evidence/startup-validation.json；本轮小修补包追加结果见外层 DELIVERY-REPORT。\n\n'+acceptance.toString('utf8').replace(/\[result\.json\]\(([^)]+)\)/g,'开发留存证据 `$1`'));
 prepared.push({path:'startup-source/REAL-INSTALLED-ACCEPTANCE.md',b:acceptancePublic,role:'public-validation-narrative',originalSha256:sha(acceptance)});
 const priorProvenance=await json(join(source,'SOURCE-PROVENANCE.json')),sourceBuild=await bytes(join(source,'BUILD.md'));
 const bundles=[];for(const name of ['DSH-SEP-Full','DSH-SEP-Only','DSH-SEP-Startup-Repair']){const root=join(candidate,name),gb=await bytes(join(root,'graph.json')),m=await bytes(join(root,'manifest.json'));demand(sha(gb)===finalized.graphHash,'AMEND_GRAPH');bundles.push({name,root,beforeManifestSha256:sha(m)});}
 // Capture and validate every authoring input before changing the candidate.
 for(const {path,b,role,...extra}of prepared){await put(join(source,path),b);rows.set(path,{path,bytes:b.length,sha256:sha(b),role,...extra});}
 const buildAppend='\n## 启动修订生成器补记\n\nprogram-source 仍为最终封图的逐字节权威来源，非完整上游可重复二进制构建承诺。integrate-core.mjs 已纳入 managed/guardian-lifecycle-transform.mjs，生成 onSpawn、manual 与保守未知状态处理；ownership/apply-journal-gate.mjs 是后续独立日志治理阶段；诊断层 diagnostics/build-overlay.mjs 最后叠加安全诊断并保留 startHost 参数。执行顺序必须为 integrate-core → ownership/apply-journal-gate → 其余本轮明确阶段及 diagnostics；不得用早期中间产物覆盖已封定目录。managed/generator-consistency.test.mjs 和 managed/rpc-manual.test.mjs 提供生成一致性及真实 RPC 回归源码。生成器依赖匹配基线和原工作区布局，源码快照不提供“干净克隆一键跑完”的保证。\n\n实际安装说明见 startup-source/REAL-INSTALLED-ACCEPTANCE.md。新增小修补包实测是外层交付报告的追加证据，不倒写先前测试统计。\n';
 await put(join(source,'BUILD.md'),Buffer.concat([sourceBuild,Buffer.from(buildAppend)]));
 const summary={graphSha256:map.graphSha256,files:rows.size,exactReleaseFiles:[...rows.values()].filter(r=>r.role==='exact-release-file').length,supplementalFiles:[...rows.values()].filter(r=>r.role!=='exact-release-file').length,bytes:[...rows.values()].reduce((n,r)=>n+r.bytes,0)};
 await jput(manifestPath,{...map,summary,files:[...rows.values()].sort((a,b)=>a.path.localeCompare(b.path))});const manifestHash=sha(await bytes(manifestPath));
 await jput(join(source,'SOURCE-PROVENANCE.json'),{...priorProvenance,sourceFilesManifestSha256:manifestHash,sourceAmendment:{priorSourceManifestSha256:sha(priorManifest),scope:'Public generator completion and final synthetic installation evidence source; program graph unchanged.'}});
 const allSource=await inventory(source);for(const r of allSource)publicBytes(await bytes(join(source,r.path)),r.path);await put(join(source,'SHA256SUMS.txt'),allSource.filter(r=>r.path!=='SHA256SUMS.txt').map(r=>r.sha256+'  '+r.path+'\n').join(''));
 for(const b of bundles){await put(join(b.root,'REPAIR_README.md'),repairReadme);if(b.name!=='DSH-SEP-Startup-Repair'){const p=join(b.root,'SOURCE-PROVENANCE.json'),value=await json(p);await jput(p,{...value,sourceDelivery:{...value.sourceDelivery,...summary,sourceFilesManifestSha256:manifestHash}});const rmPath=join(b.root,'docs/RELEASE_MANIFEST.json'),rm=await json(rmPath);await jput(rmPath,{...rm,sourceFilesManifestSha256:manifestHash});const docs=await inventory(join(b.root,'docs'));await put(join(b.root,'docs/SHA256SUMS.txt'),docs.filter(r=>r.path!=='SHA256SUMS.txt').map(r=>r.sha256+'  '+r.path+'\n').join(''));}const m=await json(join(b.root,'manifest.json'));m.support=(await inventory(b.root,'',true)).filter(r=>!['manifest.json','graph.json'].includes(r.path)).map(({path,bytes:size,sha256})=>({path,size,sha256}));await jput(join(b.root,'manifest.json'),m);b.afterManifestSha256=sha(await bytes(join(b.root,'manifest.json')));delete b.root;}
 const receipt={schema:1,status:'pass',scope:'Unarchived source/documentation amendment only; no change to runtime graph, payload, or previous test outcomes.',graphHash:map.graphSha256,priorSourceManifestSha256:sha(priorManifest),sourceFilesManifestSha256:manifestHash,sourceEntries:rows.size,changes:prepared.map(({path,b})=>({path,sha256:sha(b)})),bundleManifests:bundles};
 await jput(join(candidate,'AMENDED-SOURCE.json'),receipt);return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const [flag,candidate]=process.argv.slice(2);demand(flag==='--candidate','Usage: node amend-unarchived-source.mjs --candidate <candidate>');console.log(JSON.stringify(await amendSource({candidate})));}
