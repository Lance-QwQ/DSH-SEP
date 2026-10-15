// Test-only exact-source fixture. Uses the official Loader and real P2/project.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=new URL('../../../business/fixture.mjs',import.meta.url);
const bytes=await readFile(base),sha=b=>createHash('sha256').update(b).digest('hex');
if(sha(bytes)!=='1d5ab2a4a96b37655daf64bd5f275ae84a7706466718dd179e0fd438013977e2')throw Error('SEP_PENDING_FIXTURE_ORIGIN');
let source=bytes.toString('utf8');const changes=[];
function replace(before,after){if(source.split(before).length!==2)throw Error('SEP_PENDING_FIXTURE_TRANSFORM');source=source.replace(before,after);changes.push({before,after});}
replace("from '../transactions/transaction-store.mjs'","from '../project-workflow/derived-transaction-store.mjs'");
replace("from '../lifecycle/managed-project-lifecycle.mjs'","from '../project-workflow/derived-lifecycle.mjs'");
replace("from './profile-plugin.mjs'","from '../desktop/project-workflow-product/profile-plugin.mjs'");
replace("import {openMacManagedProject} from '../transactions/mac-managed-project.mjs';","import {openWorkflowProject as openMacManagedProject} from '../project-workflow/project-factory.mjs';");
replace('const api=ctx.sepMacRuntime;assert(api);',`const api=ctx.sepMacRuntime;if(!api){const log=JSON.stringify(ctx.logger.buffer);const codes=[...new Set(log.match(/(?:SEP|P2|FS)_[A-Z0-9_]{1,90}/g)??[])].slice(0,32);throw Object.assign(Error('SEP_TEST_RUNTIME_SERVICE_MISSING'),{code:'SEP_TEST_RUNTIME_SERVICE_MISSING',diagnostic:{profilePresent:!!ctx.get('sepMacProfile'),runtimePresent:!!api,codes}});}`);
const candidate=process.env.SEP_PENDING_CANDIDATE==='1';
const native=process.env.SEP_PENDING_NATIVE==='1';
if(native){
 if(process.platform!=='darwin'||process.arch!=='arm64'||!process.env.SEP_PARSER_ASSEMBLY_FIXTURE||!process.env.SEP_MAC_ATTACHMENT_HELPER)throw Error('SEP_PENDING_NATIVE_REQUIRED');
 replace('const helperPath=process.env.SEP_MAC_TREE_HELPER,helperSha256=sha(await readFile(helperPath));let ctx;',`const parserFixture=JSON.parse(await readFile(process.env.SEP_PARSER_ASSEMBLY_FIXTURE,'utf8')),attachmentHelperPath=process.env.SEP_MAC_ATTACHMENT_HELPER;
 runtimeOptions={...runtimeOptions,parser:{runtimeRoot:parserFixture.runtimeRoot,manifestSha256:parserFixture.manifestSha256,stateRoot:join(base,'parser')}};business={...business,media:true,vision:{enabled:true,allowUpload:true}};
 const attachments=await import('../media-business/cold-attachments.mjs');
 const coldPrerequisites=async child=>{await child.plugin(attachments,{source,storageRoot:memory,initialize:!prior,helperPath:attachmentHelperPath,helperSha256:sha(await readFile(attachmentHelperPath))});await prerequisites(child);};
 const helperPath=process.env.SEP_MAC_TREE_HELPER,helperSha256=sha(await readFile(helperPath));let ctx;`);
 replace("ctx=await boot('dsh',file,[],prerequisites);","ctx=await boot('dsh',file,[],coldPrerequisites);");
 replace('ctx=new Context();await prerequisites(ctx);','ctx=new Context();await coldPrerequisites(ctx);');
}
if(candidate)replace("from '../desktop/project-workflow-product/profile-plugin.mjs'","from '../desktop/project-workflow-product/pending-startup/profile-plugin.mjs'");
// data: imports must keep the original fixed filesystem module identities.
source=source.replace(/from '([^']+)'/g,(all,path)=>path.startsWith('.')?"from '"+new URL(path,base).href+"'":all);
source=source.replace(/import\('([^']+)'\)/g,(all,path)=>path.startsWith('.')?"import('"+new URL(path,base).href+"')":all);
replace("new URL('./runtime.mjs',import.meta.url).href",JSON.stringify(new URL(candidate?'../desktop/project-workflow-product/pending-startup/'+(native?'runtime.mjs':'runtime-core.mjs'):'./runtime.mjs',base).href));
export const origin=Object.freeze({sourceSha256:sha(bytes),transformations:changes,resultSha256:sha(source)});
export const {setup,ok}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
