import {readFile,realpath,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';import{pathToFileURL}from'node:url';import{createHash}from'node:crypto';
import{auditInstalledGraph}from'./shared/sep-update/runtime/audit-graph.mjs';
const TARGET='96fbacddd11ac56871f1909e1a9f00ccd3669a5a365e8d7061cb8f5cd7ac7143';
const sha=b=>createHash('sha256').update(b).digest('hex');
const demand=(v,c)=>{if(!v)throw Object.assign(Error(c),{code:c});};
/** Load the reviewed, backward-compatible P2 coordinator, before any store open.
 * Its complete installed graph is read and verified for every prepare/apply/recover.
 * Native ownership and Recovery registry use the audited current program:
 * this only replaces journal/head reconciliation, not project/lease protocols. */
export async function loadCandidateCoordinator(op){
 demand(op.graphHashes?.candidate===TARGET,'COORDINATOR_GRAPH_REQUIRED');
 const root=op.candidateHostRoot,bytes=await readFile(join(root,'graph.json'));demand(sha(bytes)===TARGET,'COORDINATOR_GRAPH_CHANGED');
 await auditInstalledGraph(root,TARGET);
 const graph=JSON.parse(bytes),id=graph.roots?.['dsh-system-enhancement-package'];
 const pkg=graph.packages.find(p=>p.id===id);demand(pkg?.name==='dsh-system-enhancement-package'&&pkg.version==='0.2.1-beta.2','COORDINATOR_PACKAGE');
 const dir=join(root,'store',id),entry=join(dir,'src/p2/control.js');
 demand((await realpath(join(root,'node_modules/dsh-system-enhancement-package'))).toLowerCase()===resolve(dir).toLowerCase(),'COORDINATOR_ALIAS');
 const file=graph.files.find(f=>f.path===`store/${id}/src/p2/control.js`);demand(file&&file.sha256===sha(await readFile(entry))&&!(await lstat(entry)).isSymbolicLink(),'COORDINATOR_MODULE_CHANGED');
 return import(pathToFileURL(entry));
}