// Exact-origin test operator derivation. Never writes product files.
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
export const BASE_SHA256='ecb9321b2c23ee9ef4e67117f31fbe6b86de9745c5f5a47994690c124e59d979';
const change=(before,after)=>({before,after});
const transforms=[
 change("import{verifyPackage}from'./package-inventory.mjs';","import{verifyPackage}from'./package-inventory.mjs';\nimport {admitVisibleSnapshot,observeHiddenEffect} from './observation.mjs';"),
 change("async function observe(action,pid,path,birth){","async function observe(action,pid,path,birth,raw=false){"),
 change(" if(failure)throw failure;\n return JSON.parse(stdout);"," if(raw){\n  assert(action==='hide'||action==='snapshot');\n  if(failure&&!(action==='hide'&&observation.exitCode===1&&observation.signal===null&&observation.errorCode===null&&!observation.killed&&parsed?.status==='pass'&&parsed?.action==='hide'&&parsed?.requestSent===false))throw failure;\n  return observation;\n }\n if(failure)throw failure;\n return JSON.parse(stdout);"),
 change("  const hidden=await observe('hide',generation.desktopPid,inner,desktop.launchTime);assert.equal(hidden.requestSent,true);await deadline(async()=>((await observe('snapshot',generation.desktopPid,inner)).hidden===true),10000);",
 "  const hideBefore=await observe('snapshot',generation.desktopPid,inner,desktop.launchTime,true);\n  const hideIdentity=admitVisibleSnapshot(hideBefore);\n  const hidden=await observe('hide',generation.desktopPid,inner,desktop.launchTime,true);\n  cycle.hide=await observeHiddenEffect({identity:hideIdentity,request:hidden,snapshot:()=>observe('snapshot',generation.desktopPid,inner,desktop.launchTime,true),timeoutMs:10000});")
];
export function deriveExercise(bytes){
 if(!Buffer.isBuffer(bytes)||hash(bytes)!==BASE_SHA256)throw Object.assign(Error('SEP_HIDE_ORIGIN_CHANGED'),{code:'SEP_HIDE_ORIGIN_CHANGED'});
 let source=bytes.toString('utf8').replaceAll('\r\n','\n');
 for(const t of transforms){if(source.split(t.before).length!==2)throw Object.assign(Error('SEP_HIDE_TRANSFORM'),{code:'SEP_HIDE_TRANSFORM'});source=source.replace(t.before,t.after);}
 return {source,origin:{schema:1,status:'pass',scope:'test-only operator derivation; native product result separate',input:'package/exercise-application.mjs',inputSha256:BASE_SHA256,outputSha256:hash(source),normalizesCrLf:true,plannedCycles:3,productModified:false,observerModified:false,transforms}};
}
