import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const work=await fs.realpath(import.meta.dirname),project=path.resolve(work,'../..');
const baseRoot=path.join(project,'deliverables/DSH-SEP-Windows-Alpha-20260921-MIT');
const graph=JSON.parse(await fs.readFile(path.join(baseRoot,'DSH-SEP-Full/graph.json'))),old=new Map(graph.files.map(f=>[f.path,f]));
const overlayRoot=path.join(work,'release-overlay'),bootstrapRoot=path.join(work,'bootstrap');
const sha=b=>createHash('sha256').update(b).digest('hex');
async function files(root,rel=''){const result=[];for(const e of await fs.readdir(path.join(root,rel),{withFileTypes:true})){if(e.isSymbolicLink())throw Error('overlay link');const p=rel?rel+'/'+e.name:e.name;if(e.isDirectory())result.push(...await files(root,p));else result.push(p);}return result;}
const merged=new Map();
for(const src of ['core/overlay','host-lifecycle/overlay','managed/overlay','diagnostics/overlay']){
 for(const file of await files(path.join(work,src))){const name='store/'+file;const bytes=await fs.readFile(path.join(work,src,file));merged.set(name,bytes);}
}
const update='store/p0485/lib/sep-update/update-inventory.mjs';merged.set(update,await fs.readFile(path.join(project,'dsh-daily/releases/sep-alpha2-updatefix-20260924',update)));
for(const [name,bytes]of merged){await fs.mkdir(path.dirname(path.join(overlayRoot,name)),{recursive:true});await fs.writeFile(path.join(overlayRoot,name),bytes);}
const overlay=[...merged].map(([p,b])=>({path:p,size:b.length,sha256:sha(b),beforeSha256:old.get(p)?.sha256??null}));
const bootstrapFiles=await Promise.all((await files(bootstrapRoot)).map(async p=>{const b=await fs.readFile(path.join(bootstrapRoot,p));return {path:p,size:b.length,sha256:sha(b)};}));
const policy=path.join(work,'distribution/repair-policy.json');
const config={schema:1,revision:'windows-alpha-20260924-startup-r2',baseRoot,expectedBaseGraph:sha(await fs.readFile(path.join(baseRoot,'DSH-SEP-Full/graph.json'))),outputRoot:path.join(project,'deliverables/DSH-SEP-Windows-Alpha-20260924-Startup-r2'),overlayRoot,overlay,bootstrapRoot,bootstrapFiles,repairPolicy:{path:policy,sha256:sha(await fs.readFile(policy))}};
await fs.writeFile(path.join(work,'build-config.json'),JSON.stringify(config,null,2)+'\n');console.log(JSON.stringify({files:overlay.map(f=>f.path),bootstrapFiles:bootstrapFiles.length,outputRoot:config.outputRoot}));
