import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {createProjectTree} from '../apfs-tree/project-tree.mjs';
import {openTrustedProject} from './transaction-store.mjs';
import {openMacManagedProject} from './mac-managed-project.mjs';
const [root,source,phase,mode]=process.argv.slice(2);const sha=x=>createHash('sha256').update(x).digest('hex');const helperPath=process.env.SEP_MAC_TREE_HELPER;
const io=createProjectTree({helperPath,helperSha256:sha(await readFile(helperPath)),lockPath:join(root,'.native.lock')});
const options={root,source,io,helperPath,helperSha256:sha(await readFile(helperPath)),onEvent:event=>{if(event===phase)process.kill(process.pid,'SIGKILL');}};
const p=await (process.platform==='darwin'?openMacManagedProject(options):openTrustedProject(options));
if(mode==='commit'){const plan=await p.planWrite({path:'a.txt',expectedSha256:sha('original'),text:'updated'});await p.commit({planHash:plan.planHash});}
else {let markers=[];await p.bindDocumentAuthority({identity:'synthetic-p2',read:async()=>markers});const plan=await p.planWrite({path:'a.txt',expectedSha256:sha('original'),text:'updated'});await p.commit({planHash:plan.planHash});const review=await p.reviewDocument('a.txt');markers=[{id:'delete-1',owner:'project:synthetic',status:'purged',documentPath:'a.txt',planHash:'1'.repeat(64),managedPlanHash:review.planHash}];await writeFile(join(dirname(root),'authority.json'),JSON.stringify(markers),{mode:0o600});await p.deleteDocument({marker:markers[0],expectedPlanHash:review.planHash});}
throw Error('planned crash was not reached');
