import {readFile,writeFile,mkdir,readdir,lstat,copyFile,constants} from 'node:fs/promises';
import {join,resolve,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {stableBytes} from './program-files.mjs';
const [outArg,repoArg]=process.argv.slice(2),output=resolve(outArg),repository=resolve(repoArg),source=resolve(import.meta.dirname,'..'),program=join(output,'program'),support=join(output,'support');
if(!/^D:\\AIData\\ProjectWork\\DSH\\alpha2-windows-packages-20261015-r1$/i.test(output))throw Error('SCOPE');
const sha=b=>createHash('sha256').update(b).digest('hex'),json=o=>JSON.stringify(o,null,2)+'\n';
const graph=JSON.parse(await readFile(join(program,'graph.json'))),sealed=JSON.parse(await readFile(join(output,'PROGRAM-SEALED.json'))),only=JSON.parse(await readFile(join(output,'ONLY-REQUIRED.json'))),required=new Set(only.required.map(x=>x.path));
const desktop=JSON.parse(await readFile(join(output,'DESKTOP-PAYLOAD.json'))),baseline=JSON.parse(await readFile(join(output,'BASELINE.json')));
await mkdir(join(support,'installer'));await mkdir(join(support,'docs'));
for(const name of ['install.mjs','fresh-profile.mjs','daily-profile.mjs','DAILY-PROFILE-ORIGIN.json'])await copyFile(join(source,'installer',name),join(support,'installer',name),constants.COPYFILE_EXCL);
await copyFile(join(source,'installer.mjs'),join(support,'installer.mjs'),constants.COPYFILE_EXCL);
await copyFile(join(source,'README-PACKAGE.md'),join(support,'README.md'),constants.COPYFILE_EXCL);
await copyFile(join(source,'ONLY-SOURCE.md'),join(support,'docs/ONLY-SOURCE.md'),constants.COPYFILE_EXCL);
await copyFile(join(output,'ONLY-REQUIRED.json'),join(support,'docs/ONLY-REQUIRED.json'),constants.COPYFILE_EXCL);
await copyFile(join(output,'ONLY-HOST-package.json'),join(support,'docs/ONLY-HOST-package.json'),constants.COPYFILE_EXCL);
await copyFile(join(repository,'LICENSE'),join(support,'LICENSE'),constants.COPYFILE_EXCL);
const components=[];for(const p of graph.packages){const m=JSON.parse(await readFile(join(program,graph.packagePaths[p.id],'package.json')));components.push({name:p.name,version:p.version,path:graph.packagePaths[p.id],declaredLicense:m.license??null});}
const primary=JSON.parse(await readFile(join(support,'runtime/primary-runtime/runtime.json')));
await writeFile(join(support,'docs/COMPONENTS.json'),json({schema:1,hostVersion:'0.2.1-alpha.2',sepVersion:'0.2.1-beta.3-alpha2-adapter.1',runtime:{node:'24.21.0',pnpm:'11.7.0',electron:'44.7.0',python:primary.python,pythonPackages:primary.pythonPackages,primaryRuntimeOriginalDesktopVersion:primary.desktopVersion,primaryRuntimeNote:'Retained upstream support-runtime build metadata is not the running DSH version or a digest of this derived distribution; manifest.json.support binds the actual delivered bytes.'},packages:components}),{flag:'wx'});
const redactions=JSON.parse(await readFile(join(output,'PROGRAM-REDACTION.json')));
const supportRedaction=JSON.parse(await readFile(join(output,'SUPPORT-REDACTION.json'))),pyc=JSON.parse(await readFile(join(output,'SUPPORT-PYC-OMISSION.json')));
await writeFile(join(support,'docs/BUILD-PROVENANCE.json'),json({schema:1,revision:'windows-package.1',sourceCommit:baseline.sourceCommit,baseGraphSha256:sha(await readFile(join(output,'BASE-PROGRAM-GRAPH.json'))),resultGraph:sealed.graph,resultDescriptor:sealed.descriptor,changes:redactions.records,supportChanges:supportRedaction.records,pythonCacheOmission:{count:pyc.count,sourceCodeUnchanged:pyc.sourceCodeUnchanged,reason:'omit compiled caches exposing upstream build paths; corresponding Python sources retained'},privateInputImported:false,officialHostSource:'each required member matched an SRI-verified exact-version official npm tarball; see ONLY-REQUIRED.json',runtimeProgramRetainsLocalAdaptations:true}),{flag:'wx'});
await writeFile(join(support,'LICENSING.md'),'# 许可\n\nSEP 自有代码按本包根 LICENSE 的 MIT 许可提供。DSH 与第三方组件继续适用其各自许可，MIT 不替代第三方义务。实际包名、版本与 package.json 的许可声明见 docs/COMPONENTS.json；组件原许可文件保留在 program 对应位置，Electron 的 LICENSE 和 LICENSES.chromium.html、Node 的 LICENSE 保留在 runtime 目录。declaredLicense:null 表示未在该字段声明，不能据此认定没有许可限制。Only 的外部官方来源仍受其原许可约束。\n',{flag:'wx'});
await writeFile(join(support,'THIRD_PARTY_NOTICES.md'),'# 第三方组件\n\n本包包含 DeepSeek Harness、Cordis、Electron/Chromium、Node.js、pnpm、Python 与 Python/Office 支持依赖，以及 SEP 所集成的开源项目。程序 npm 组件、核心运行时及 Python 包版本清单见 docs/COMPONENTS.json；它不是所有 Office 技能与二进制内部组件的完整清单，请保留各组件随附的版权和许可文件。运行支持按文件摘要封存于 manifest.json.support；程序按 graph.json.files 封存。本包没有复制用户安装的插件、会话、凭据或其他项目的 Git 目录。\n',{flag:'wx'});
const supportRows=[];
async function walk(dir){for(const name of (await readdir(dir)).sort()){const path=join(dir,name),s=await lstat(path);if(s.isSymbolicLink()||s.isFile()&&s.nlink!==1)throw Error('SUPPORT_IDENTITY');if(s.isDirectory())await walk(path);else if(s.isFile()){const b=await readFile(path),p=relative(support,path).replaceAll('\\','/'),d=p.startsWith('runtime/desktop/')?desktop.files.find(x=>x.path===p.slice('runtime/desktop/'.length)):null;supportRows.push({path:p,size:b.length,sha256:sha(b),mode:d?.mode??420});}else throw Error('SUPPORT_TYPE');}}
await walk(support);
async function copyRow(from,row,to){const b=await stableBytes(join(from,row.path),{...row,mode:420});await mkdir(dirname(to),{recursive:true});await writeFile(to,b,{flag:'wx'});}
const bundles=[];
for(const kind of ['full','sep']){
 const root=join(output,'bundle-'+kind);await mkdir(root);const payload=kind==='full'?graph.files:graph.files.filter(x=>!required.has(x.path));
 for(const row of payload)await copyRow(program,row,join(root,'payload',row.path));
 for(const row of supportRows)await copyRow(support,row,join(root,row.path));
 for(const row of [sealed.graph,sealed.descriptor])await copyRow(program,row,join(root,row.path));
 const manifest={schema:3,kind,platform:'win32-x64',hostVersion:'0.2.1-alpha.2',sepVersion:'0.2.1-beta.3-alpha2-adapter.1',revision:'windows-package.1',graph:sealed.graph,descriptor:sealed.descriptor,payload,required:kind==='full'?[]:only.required,support:supportRows,desktop};
 const bytes=json(manifest);await writeFile(join(root,'manifest.json'),bytes,{flag:'wx'});bundles.push({kind,root,manifestSha256:sha(bytes),payloadFiles:payload.length,requiredFiles:manifest.required.length,supportFiles:supportRows.length});console.log(JSON.stringify(bundles.at(-1)));
}
await writeFile(join(output,'ASSEMBLED.json'),json({schema:1,status:'pass',bundles}),{flag:'wx'});
