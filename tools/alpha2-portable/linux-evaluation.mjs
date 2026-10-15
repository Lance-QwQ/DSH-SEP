import {readFile,lstat,realpath} from 'node:fs/promises';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {bundleRoot} from './bundle-modules.mjs';
import {hash,fail} from './project-tree.mjs';
export {validNativeBackendPath} from './linux-evaluation-paths.mjs';
import {assertBackendPaths} from './linux-evaluation-paths.mjs';
export const origin=Object.freeze({path:'bundle/host/evaluation-entry/entry.mjs',sha256:'2fed151e7d5a85af798b35c6fdfcd13b01333c2661764520577da86513c1f86a',transformations:[["import {assertBackendPaths} from './backend-paths.mjs';",`import {assertBackendPaths} from '${new URL('./linux-evaluation-paths.mjs',import.meta.url).href}';`]]});
let loaded;
export async function loadNativeEntry(){
 if(loaded)return loaded;
 const filename=join(bundleRoot,origin.path),require=createRequire(filename);let source=await readFile(filename,'utf8');if(hash(source)!==origin.sha256)fail('SEP_LINUX_EVAL_ORIGIN_CHANGED');
 for(const [before,after]of origin.transformations){if(source.split(before).length!==2)fail('SEP_LINUX_EVAL_TRANSFORM');source=source.replace(before,after);}
 source=source.replace(/from '([^']+)'/g,(all,name)=>name.startsWith('node:')||name.startsWith('file:')?all:"from '"+pathToFileURL(require.resolve(name)).href+"'");
 const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));loaded={Entry:module.Entry,origin,transformedSha256:hash(source)};return loaded;
}
const identity=s=>`${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
async function bound(path,code,privateFile=false){
 const s=await lstat(path,{bigint:true});if(!s.isFile()||s.isSymbolicLink()||s.size>16n*1024n*1024n||await realpath(path)!==path||privateFile&&(s.nlink!==1n||s.uid!==BigInt(process.getuid())||(s.mode&0o077n)!==0n))fail(code);
 const bytes=await readFile(path),again=await lstat(path,{bigint:true});if(identity(s)!==identity(again))fail(code);return {path,identity:identity(s),sha256:hash(bytes),bytes};
}
export async function prepareNativeEvaluation(config,runtime){
 if(process.platform!=='linux'||process.arch!=='x64')fail('SEP_LINUX_EVAL_PLATFORM');assertBackendPaths(config.backend);
 const root=join(bundleRoot,'bundle/modules/trusted-evaluation-entry/evaluation'),entry=join(root,'lifecycle.py');
 if(config.backend.entry!==entry)fail('SEP_LINUX_EVAL_ENTRY');
 if(!runtime||typeof runtime.python!=='string'||!/^\/[\w./+-]+$/.test(runtime.python)||!(/^[a-f0-9]{64}$/.test(runtime.pythonSha256??'')))fail('SEP_LINUX_EVAL_PYTHON');
 // A virtualenv executable may be a symlink to the system interpreter. Pin its
 // canonical target as well as the original executable path, preserving venv
 // discovery without silently using a different interpreter after preparation.
 const pythonPath=await realpath(runtime.python),python=await bound(pythonPath,'SEP_LINUX_EVAL_PYTHON');if(python.sha256!==runtime.pythonSha256)fail('SEP_LINUX_EVAL_PYTHON');
 const c=await bound(config.backend.configPath,'SEP_LINUX_EVAL_CONFIG_IDENTITY',true);if(c.sha256!==config.backend.configSha256)fail('SEP_LINUX_EVAL_CONFIG_HASH');
 let body;try{body=JSON.parse(c.bytes);}catch{fail('SEP_LINUX_EVAL_CONFIG');}
 const state=body.state,s=await lstat(state);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)!==0||await realpath(state)!==state||hash(`${state}:${s.dev}:${s.ino}`)!==config.backend.stateIdentity||body.projectId!==config.projectId||body.expectedCatalogSha256!==config.catalogSha256)fail('SEP_LINUX_EVAL_STATE');
 const manifestPath=join(root,'lifecycle-manifest.json'),manifest=await bound(manifestPath,'SEP_LINUX_EVAL_PACKAGE'),expected=JSON.parse(manifest.bytes),inputs=[python,c,manifest,await bound(entry,'SEP_LINUX_EVAL_PACKAGE')];
 for(const [name,sha]of Object.entries(expected)){if(!/^[a-z_]+\.py$/.test(name)||!/^[a-f0-9]{64}$/.test(sha))fail('SEP_LINUX_EVAL_PACKAGE');const f=await bound(join(root,name),'SEP_LINUX_EVAL_PACKAGE');if(f.sha256!==sha)fail('SEP_LINUX_EVAL_PACKAGE');inputs.push(f);}
 const proof={dev:s.dev,ino:s.ino};
 return Object.freeze({command:runtime.python,scope:'linux-native-evaluation-launch-only',usesWsl:false,inputHashes:{config:c.sha256,python:python.sha256,manifest:manifest.sha256,entry:inputs[3].sha256},spawnBackend(challenge){
  if(!/^[a-f0-9]{64}$/.test(challenge))fail('SEP_LINUX_EVAL_CHALLENGE');
  // Entry invokes this synchronously immediately before spawn. Changes while
  // awaiting activation invalidate the preparation instead of running new code.
  if(realpathSync(runtime.python)!==pythonPath)fail('SEP_LINUX_EVAL_INPUT_CHANGED');
  for(const f of inputs){const now=lstatSync(f.path,{bigint:true});if(identity(now)!==f.identity||realpathSync(f.path)!==f.path||hash(readFileSync(f.path))!==f.sha256)fail('SEP_LINUX_EVAL_INPUT_CHANGED');}
  const now=lstatSync(state);if(now.dev!==proof.dev||now.ino!==proof.ino||now.uid!==process.getuid()||(now.mode&0o077)!==0||realpathSync(state)!==state)fail('SEP_LINUX_EVAL_INPUT_CHANGED');
  return spawn(runtime.python,['-B',entry,c.path,c.sha256,challenge,...config.recover?['--recover']:[]],{cwd:root,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
 }});
}
export function linuxEvaluationPlugin(runtime){return {name:'sep-linux-native-evaluation-entry',inject:['tools','agents'],async apply(ctx,config,ownership){
 const {Entry}=await loadNativeEntry(),prepared=await prepareNativeEvaluation(config,runtime),entry=new Entry(ctx,config,{ownership,spawnBackend:prepared.spawnBackend});let receipt={status:'not_run',scope:'entry_not_started'},closing,activationFailure;
 const safe=e=>/^[A-Z_]{1,64}$/.test(e?.message??'')?e.message:'ENTRY_OPERATION_FAILED',status=()=>structuredClone({...receipt,phase:entry.state,...activationFailure?{activationFailure}:{}}),stop=()=>closing??=(async()=>{receipt=await entry.stop();return status();})().finally(()=>{closing=undefined;});
 ctx.provide('sepEvaluationEntry',Object.freeze({status,stop}));const abort=()=>{stop().catch(()=>{});};ownership.signal.addEventListener('abort',abort,{once:true});ctx.effect(()=>async()=>{ownership.signal.removeEventListener('abort',abort);await stop();});
 try{receipt=await entry.start();if(ownership.signal.aborted)await stop();}catch(e){activationFailure=safe(e);receipt={status:'blocked',scope:'entry_activation_only',reason:safe(e),recoveryRequired:true};}
 }};}
