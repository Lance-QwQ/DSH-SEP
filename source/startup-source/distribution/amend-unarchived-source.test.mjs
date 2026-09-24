import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {amendSource} from './amend-unarchived-source.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('unarchived source amendment refreshes all three support maps and preserves graph bytes',async()=>{
 const candidate=await mkdtemp(join(tmpdir(),'sep-source-amend-')),graph='{"files":[]}\n',graphHash=hash(graph),source=join(candidate,'DSH-SEP-Source');
 const put=async(p,b)=>{await mkdir(dirname(p),{recursive:true});await writeFile(p,b);},jput=(p,v)=>put(p,JSON.stringify(v,null,2)+'\n');
 await jput(join(candidate,'FINALIZED-DOCS-SOURCE.json'),{status:'pass',graphHash});await jput(join(source,'SOURCE_FILES.json'),{graphSha256:graphHash,files:[]});await jput(join(source,'SOURCE-PROVENANCE.json'),{graphSha256:graphHash});await put(join(source,'BUILD.md'),'# Existing build limits\n');
 for(const name of ['DSH-SEP-Full','DSH-SEP-Only','DSH-SEP-Startup-Repair']){const root=join(candidate,name);await put(join(root,'graph.json'),graph);await jput(join(root,'manifest.json'),{support:[]});if(!name.endsWith('Repair')){await jput(join(root,'SOURCE-PROVENANCE.json'),{sourceDelivery:{directory:'DSH-SEP-Source'}});await jput(join(root,'docs/RELEASE_MANIFEST.json'),{graphSha256:graphHash});}}
 const result=await amendSource({candidate,sourceRoot:resolve(import.meta.dirname,'..')});assert.equal(result.status,'pass');
 for(const name of ['DSH-SEP-Full','DSH-SEP-Only','DSH-SEP-Startup-Repair']){const root=join(candidate,name),m=JSON.parse(await readFile(join(root,'manifest.json')));assert.equal(await readFile(join(root,'graph.json'),'utf8'),graph);assert.match(await readFile(join(root,'REPAIR_README.md'),'utf8'),/repair-cli\.mjs' recover/);for(const row of m.support){const b=await readFile(join(root,row.path));assert.equal(hash(b),row.sha256);assert.equal(b.length,row.size);}}
 const map=JSON.parse(await readFile(join(source,'SOURCE_FILES.json')));assert(map.files.some(f=>f.path.endsWith('managed/core-regeneration.test.mjs')));assert(map.files.some(f=>f.path.endsWith('managed/guardian-lifecycle-transform.mjs')));for(const row of map.files)assert.equal(hash(await readFile(join(source,row.path))),row.sha256);
 const text=await readFile(join(source,'startup-source/REAL-INSTALLED-ACCEPTANCE.md'),'utf8');assert(!/\[result\.json\]\(/.test(text));assert.match(text,/原始日志/);
});
