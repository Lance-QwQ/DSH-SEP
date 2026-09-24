import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,access} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {deriveRepairBundle} from './derive-repair-bundle.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'sep-small-repair-')),full=join(root,'full'),output=join(root,'small');await mkdir(full);
 const file={path:'store/p0500/src/controller.mjs',size:3,sha256:sha('new')};const gb=Buffer.from(JSON.stringify({packages:[{id:'p0500',name:'recovery'}],files:[file]}));
 const data=new Map([['graph.json',gb],['payload/'+file.path,Buffer.from('new')],['repair-policy.json',Buffer.from(JSON.stringify({schema:1,targetGraph:sha(gb),allowedProgramPaths:[file.path]}))]]);
 for(const p of ['repair.ps1','REPAIR_README.md','repair/build.mjs','repair/repair.mjs','repair/repair-cli.mjs','repair/windows-adapters.mjs','runtime/node/node.exe','runtime/node/LICENSE','LICENSE','LICENSING.md','THIRD_PARTY_NOTICES.md','bootstrap/launcher.mjs','installer.mjs','data/do-not-ship.json'])data.set(p,Buffer.from(p));
 for(const [p,b]of data){await mkdir(dirname(join(full,p)),{recursive:true});await writeFile(join(full,p),b);}
 const boot=data.get('bootstrap/launcher.mjs');const m={schema:1,kind:'full',graph:{size:gb.length,sha256:sha(gb)},bootstrap:{schema:1,files:[{path:'launcher.mjs',size:boot.length,sha256:sha(boot)}]},payload:[file.path],support:[...data].filter(([p])=>!p.startsWith('payload/')&&p!=='graph.json').map(([path,b])=>({path,size:b.length,sha256:sha(b)}))};await writeFile(join(full,'manifest.json'),JSON.stringify(m));
 return {full,output};
}
test('small repair selection contains only bound closure and changed program files',async()=>{const f=await fixture(),r=await deriveRepairBundle(f);assert.equal(r.status,'pass');const m=JSON.parse(await readFile(join(f.output,'manifest.json')));assert.equal(m.kind,'startup-repair');assert.equal(m.payload.length,1);assert(m.support.some(x=>x.path==='runtime/node/node.exe'));await assert.rejects(access(join(f.output,'installer.mjs')));await assert.rejects(access(join(f.output,'data')));for(const row of m.support){const b=await readFile(join(f.output,row.path));assert.equal(sha(b),row.sha256);assert.equal(b.length,row.size);}});
test('drifted Full input rejects before output creation',async()=>{const f=await fixture();await writeFile(join(f.full,'repair/repair.mjs'),'wrong');await assert.rejects(deriveRepairBundle(f),/REPAIR_BUNDLE_CHANGED/);await assert.rejects(access(f.output));});
test('small repair output is create-only',async()=>{const f=await fixture();await mkdir(f.output);await writeFile(join(f.output,'keep.txt'),'keep');await assert.rejects(deriveRepairBundle(f),/REPAIR_BUNDLE_EXISTS/);assert.equal(await readFile(join(f.output,'keep.txt'),'utf8'),'keep');});
