import {readFile,lstat,realpath} from 'node:fs/promises';
import {join,resolve,isAbsolute} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {prepareRepair,applyRepair,recoverRepair} from './repair.mjs';
import {createWindowsRepairAdapters} from './windows-adapters.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=c=>{throw Object.assign(Error(c),{code:c});};
const known=new Set(['8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52','7a1719d5bf7ce51a6973ab0f10d7532c1b0f2af086553adb7a438d08b1eb47a2']);
async function read(p){const s=await lstat(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||resolve(await realpath(p)).toLowerCase()!==resolve(p).toLowerCase())fail('REPAIR_FILE_IDENTITY');return readFile(p);}
export async function cli(args){
 const [mode,...rest]=args;if(!['prepare','apply','recover'].includes(mode)||rest.length%2)fail('REPAIR_USAGE');const flags={};for(let i=0;i<rest.length;i+=2){if(!['--target','--bundle','--plan'].includes(rest[i])||flags[rest[i]])fail('REPAIR_USAGE');if(!isAbsolute(rest[i+1]??''))fail('REPAIR_ABSOLUTE_PATH_REQUIRED');flags[rest[i]]=rest[i+1];}
 const bundle=flags['--bundle'];if(!bundle)fail('REPAIR_BUNDLE_REQUIRED');const manifest=JSON.parse(await read(join(bundle,'manifest.json')));
 async function bound(path){const b=await read(join(bundle,path)),r=manifest.support.find(f=>f.path===path);if(!r||r.size!==b.length||r.sha256!==sha(b))fail('REPAIR_INPUT_CHANGED');return b;}
 const policy=JSON.parse(await bound('repair-policy.json'));if(policy.baselines.some(b=>!known.has(b.graphHash)))fail('REPAIR_UNSUPPORTED_BASELINE');if(policy.targetGraph!==manifest.graph.sha256)fail('REPAIR_POLICY_GRAPH');for(const f of manifest.bootstrap.files)await bound('bootstrap/'+f.path);
 const {acquireStartupLease}=await import(pathToFileURL(join(bundle,'bootstrap/startup-lease.mjs')));const {inspectColdCheckpoint}=await import(pathToFileURL(join(bundle,'bootstrap/checkpoint-inspection.mjs')));const adapters=createWindowsRepairAdapters({acquireStartupLease,inspectColdCheckpoint});
 if(mode==='prepare'){if(!flags['--target'])fail('REPAIR_TARGET_REQUIRED');const p=await prepareRepair({target:flags['--target'],bundle,policy},{adapters});return {status:'prepared',planHash:p.hash,planPath:join(p.transactionDirectory,'plan.json'),graphHash:p.targetGraphHash,files:p.entries.length};}
 if(!flags['--plan'])fail('REPAIR_PLAN_REQUIRED');const plan=JSON.parse(await read(flags['--plan']));if(flags['--target']&&resolve(flags['--target']).toLowerCase()!==resolve(plan.target).toLowerCase())fail('REPAIR_PLAN_SCOPE');if(resolve(plan.bundle).toLowerCase()!==resolve(bundle).toLowerCase()||plan.targetGraphHash!==policy.targetGraph||!known.has(plan.baselineGraphHash)||resolve(flags['--plan']).toLowerCase()!==resolve(join(plan.transactionDirectory,'plan.json')).toLowerCase())fail('REPAIR_PLAN_SCOPE');return (mode==='apply'?applyRepair:recoverRepair)(plan,{adapters});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))cli(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(JSON.stringify({status:'blocked',code:e.code??'REPAIR_FAILED'}));process.exitCode=1;});
