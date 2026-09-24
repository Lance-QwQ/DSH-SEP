/** Select only the already validated Full bundle files needed by controlled repair. */
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {resolve,join,dirname,isAbsolute,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {safePath} from './build.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const demand=(v,c)=>{if(!v)throw Object.assign(Error(c),{code:c});};
const inside=(a,b)=>{const r=relative(a,b);return !r||(!r.startsWith('..'+sep)&&r!=='..'&&!isAbsolute(r));};
async function bytes(p){const s=await lstat(p);demand(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1,'REPAIR_BUNDLE_IDENTITY');return readFile(p);}
async function put(p,b){await mkdir(dirname(p),{recursive:true});await writeFile(p,b,{flag:'wx'});}
export async function deriveRepairBundle({full,output}){
 demand(isAbsolute(full??'')&&isAbsolute(output??''),'REPAIR_BUNDLE_ABSOLUTE_PATH');
 demand((await realpath(full)).toLowerCase()===resolve(full).toLowerCase(),'REPAIR_BUNDLE_ALIAS');
 demand(!inside(full,output)&&!inside(output,full),'REPAIR_BUNDLE_OVERLAP');
 try{await lstat(output);demand(false,'REPAIR_BUNDLE_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
 const manifestBytes=await bytes(join(full,'manifest.json')),m=JSON.parse(manifestBytes),gb=await bytes(join(full,'graph.json')),graph=JSON.parse(gb);
 demand(m.kind==='full'&&m.graph.sha256===sha(gb)&&m.graph.size===gb.length&&m.bootstrap?.schema===1,'REPAIR_BUNDLE_GRAPH');
 const support=new Map(m.support.map(r=>[safePath(r.path),r])),data=new Map();
 async function supported(path){const row=support.get(safePath(path));demand(row,'REPAIR_BUNDLE_UNBOUND');const b=await bytes(join(full,path));demand(b.length===row.size&&sha(b)===row.sha256,'REPAIR_BUNDLE_CHANGED');data.set(path,b);return b;}
 const policy=JSON.parse(await supported('repair-policy.json'));demand(policy.targetGraph===sha(gb)&&policy.schema===1,'REPAIR_BUNDLE_POLICY');
 const selected=[...new Set(policy.allowedProgramPaths)].sort();demand(selected.length===policy.allowedProgramPaths.length,'REPAIR_BUNDLE_DUPLICATE');
 const files=new Map(graph.files.map(r=>[r.path,r]));
 for(const p of selected){safePath(p);demand(/^store\/p\d+\//.test(p)&&files.has(p)&&m.payload.includes(p),'REPAIR_BUNDLE_PAYLOAD');const row=files.get(p),b=await bytes(join(full,'payload',p));demand(b.length===row.size&&sha(b)===row.sha256,'REPAIR_BUNDLE_CHANGED');data.set('payload/'+p,b);}
 for(const row of m.bootstrap.files){const b=await supported('bootstrap/'+safePath(row.path));demand(b.length===row.size&&sha(b)===row.sha256,'REPAIR_BUNDLE_BOOTSTRAP');}
 for(const p of ['repair.ps1','REPAIR_README.md','repair/build.mjs','repair/repair.mjs','repair/repair-cli.mjs','repair/windows-adapters.mjs','runtime/node/node.exe','runtime/node/LICENSE','LICENSE','LICENSING.md','THIRD_PARTY_NOTICES.md'])await supported(p);
 // Selected upstream modules retain their package-level notices without
 // expanding which files the repair transaction is authorized to publish.
 const packageIds=new Set(selected.map(p=>p.split('/')[1]));
 for(const row of graph.files)if(packageIds.has(row.path.split('/')[1])&&/^store\/p\d+\/(?:LICENSE|LICENCE|NOTICE|COPYING)(?:\.[^/]+)?$/i.test(row.path)){const b=await bytes(join(full,'payload',safePath(row.path)));demand(b.length===row.size&&sha(b)===row.sha256,'REPAIR_BUNDLE_CHANGED');data.set('notices/'+row.path.slice('store/'.length),b);}
 data.set('graph.json',gb);
 data.set('README.md',Buffer.from('# DSH SEP — Windows Alpha 启动修补包\n\n本包用于受支持的既有 SEP 安装，不能用于首次安装。它只携带受控修补所需的 Node、启动链、程序差异和清单；不包含完整 DSH、用户数据或模型 Key。\n\n请先核对发行 SHA-256，解压到新目录，再阅读 [修补指南](REPAIR_README.md)。预检：\n\n```powershell\n.\\repair.ps1 -Target \'D:\\DSH-SEP\'\n```\n\n确认预检计划后，按指南使用 -Apply。必须完整退出目标 SEP；另一独立官方 DSH 可继续运行。不要解压覆盖旧安装、删锁、恢复旧数据或修改权限绕过阻塞。离线修补成功后应启动原快捷方式核验；本包不宣称已验证模型服务或真实 Windows 断电／系统重启。\n'));
 const out={schema:1,kind:'startup-repair',distributionRevision:m.distributionRevision,graph:structuredClone(m.graph),bootstrap:structuredClone(m.bootstrap),payload:selected,support:[...data].filter(([p])=>!p.startsWith('payload/')&&p!=='graph.json').map(([path,b])=>({path,size:b.length,sha256:sha(b)})).sort((a,b)=>a.path.localeCompare(b.path)),derivedFrom:{kind:'full',manifestSha256:sha(manifestBytes),graphSha256:sha(gb)},scope:'Offline startup repair only; fresh installation and full application binaries not included.'};
 // All input bytes above are verified before output creation. Copy captured
 // bytes, never reread unchecked source after validation.
 await mkdir(output);for(const [p,b]of data)await put(join(output,p),b);await put(join(output,'manifest.json'),JSON.stringify(out,null,2)+'\n');
 return {schema:1,status:'pass',scope:'Repair bundle byte selection only; runtime validation reported separately.',graphHash:sha(gb),files:data.size+1,payloadFiles:selected.length,bytes:[...data.values()].reduce((n,b)=>n+b.length,0)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const [a,full,b,output]=process.argv.slice(2);demand(a==='--full'&&b==='--output','Usage: node derive-repair-bundle.mjs --full <Full directory> --output <new directory>');console.log(JSON.stringify(await deriveRepairBundle({full,output})));}
