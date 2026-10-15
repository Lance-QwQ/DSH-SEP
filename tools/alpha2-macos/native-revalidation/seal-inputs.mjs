// Operator-only new generation. CI only reads INPUTS; historical manifests stay unchanged.
import {readFile,writeFile,readdir,lstat} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join,relative,dirname,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),local=fileURLToPath(new URL('./',import.meta.url));
const runtime=JSON.parse(await readFile(join(root,'package/runtime-inputs.json'),'utf8'));
const pending=await import(pathToFileURL(join(root,'desktop/project-workflow-product/pending-startup/package-inputs.mjs')));
const tests=['apfs-tree/project-tree.test.mjs','profile/controlled-files.test.mjs','transactions/transactions.test.mjs','transactions/recovery-result.test.mjs','media/attachment-io.test.mjs','business/runtime-scope.test.mjs','business/document-plan-binding.test.mjs','transactions/document-plan.test.mjs','parser/parser-contract.test.mjs','transactions/origin.test.mjs','project-workflow/preview.test.mjs','project-workflow/derive-sources.test.mjs','project-workflow/control-boundaries.test.mjs','desktop/project-workflow-product/pending-startup/package-inputs.test.mjs','document-business/inspect-origins.test.mjs'];
const nativeOwn=['run-native.mjs','runner-contract.mjs','run-native.test.mjs','dependency-hook.mjs','workflow-origin.mjs','workflow-fixture.mjs','workflow.test.mjs','WORKFLOW-ORIGIN.json','seal-inputs.mjs'];
const names=new Set([...runtime.files,...pending.EXTRA_RUNTIME,...tests,...nativeOwn.map(x=>'native-revalidation/'+x),'package/runtime-inputs.json','apfs-tree/native-tree.c','media/native-attachments.c','media/origin.json','parser/origin.json','transactions/origin.json','project-workflow/native-fixture.mjs','project-workflow/native-workflow.test.mjs','project-workflow/READONLY-ORIGIN.json','desktop/project-workflow-product/package-inputs.mjs','desktop/project-workflow-product/pending-startup/package-inputs.mjs','desktop/project-workflow-product/pending-startup/package-inputs.json']);
for(const directory of ['transactions/origin-source','task-sandbox'])for(const name of await readdir(join(root,directory)))if(/\.(?:mjs|c|h|json)$/.test(name))names.add(directory+'/'+name);
// Traverse literal imports and source/file-URL reads. Computed reads are
// seeded explicitly above (runtime manifest, derivatives and frozen originals).
for(const name of names){const file=join(root,name),bytes=await readFile(file);if(!/\.(?:mjs|js|cjs)$/.test(name))continue;const source=bytes.toString('utf8');
 const specs=[...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|new URL\(\s*)['"](\.[^'"\r\n]+)['"]/g)].map(x=>x[1]);
 for(const spec of specs){const target=resolve(dirname(file),spec),rel=relative(root,target).split('\\').join('/');if(rel==='..'||rel.startsWith('../')||isAbsolute(rel)||rel==='native-revalidation/INPUTS.json')continue;try{const st=await lstat(target);if(st.isFile()&&!st.isSymbolicLink())names.add(rel);}catch(e){if(e.code!=='ENOENT')throw e;}}
}
const inputs=[];for(const name of [...names].sort()){if(name.startsWith('desktop/evidence/')||name.includes('/fixtures/'))throw Error('UNEXPECTED_HISTORICAL_ARTIFACT');const file=join(root,name),st=await lstat(file);if(!st.isFile()||st.isSymbolicLink())throw Error('NONFILE_INPUT');const bytes=await readFile(file);inputs.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile(join(local,'INPUTS.json'),JSON.stringify({schema:1,generation:'macos-low-review-native-r83',purpose:'current runtime/test and explicit frozen-origin closure; external official dependencies are independently pinned by restored PROGRAM and capture checks; no historical diagnostics or installer-stage scripts',inputs},null,2)+'\n');console.log(JSON.stringify({files:inputs.length,manifest:'tools/alpha2-macos/native-revalidation/INPUTS.json'}));
