// Private trusted composition. No platform override or model-facing constructor.
import {readFile} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {deriveReadonlySources} from './derive-sources.mjs';
import {createProjectTree} from '../apfs-tree/project-tree.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export async function verifyWorkflowDerivation(){
 const derived=deriveReadonlySources({core:await readFile(new URL('../transactions/transaction-store.mjs',import.meta.url),'utf8'),lifecycle:await readFile(new URL('../lifecycle/managed-project-lifecycle.mjs',import.meta.url),'utf8')});
 const origin=JSON.parse(await readFile(new URL('./READONLY-ORIGIN.json',import.meta.url),'utf8'));
 if(origin.schema!==1||JSON.stringify(origin.core)!==JSON.stringify(derived.origin.core)||JSON.stringify(origin.lifecycle)!==JSON.stringify(derived.origin.lifecycle)||await readFile(new URL('./derived-transaction-store.mjs',import.meta.url),'utf8')!==derived.outputs.core||await readFile(new URL('./derived-lifecycle.mjs',import.meta.url),'utf8')!==derived.outputs.lifecycle)fail('SEP_MAC_WORKFLOW_ORIGIN_CHANGED');
 return {coreSha256:origin.core.resultSha256,lifecycleSha256:origin.lifecycle.resultSha256};
}
export async function openWorkflowProject({root,source,helperPath,helperSha256,onEvent}={}){
 if(process.platform!=='darwin'||process.arch!=='arm64')fail('SEP_MAC_PLATFORM_UNAVAILABLE');
 if(typeof root!=='string'||!isAbsolute(root)||typeof source!=='string'||!isAbsolute(source)||typeof helperPath!=='string'||!isAbsolute(helperPath)||!/^[a-f0-9]{64}$/.test(helperSha256??''))fail('SEP_PROJECT_CONFIG');
 await verifyWorkflowDerivation();
 const {openTrustedProject}=await import('./derived-transaction-store.mjs');
 return openTrustedProject({root,source,io:createProjectTree({helperPath,helperSha256,lockPath:join(root,'.native.lock')}),onEvent});
}
