// Operates only on the blank-key synthetic installed-small-repair fixture.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {inspectWindowsProcess} from './ownership/owner-file.mjs';
const work=await realpath(import.meta.dirname),project=resolve(work,'../..'),target=await realpath(join(work,'installed-small-repair'));
assert.equal(relative(work,target),'installed-small-repair');
const bundle=join(project,'deliverables/DSH-SEP-Windows-Alpha-20260924-Startup-r2/DSH-SEP-Startup-Repair');
const configPath=join(target,'deployment-rc2.json'),config=JSON.parse(await readFile(configPath,'utf8'));
for(const key of ['dailyRoot','releaseRoot','home','storageRoot','controlRoot','credentialsPath']){const r=relative(target,config[key]);assert.ok(!isAbsolute(r)&&r!=='..'&&!r.startsWith('..\\'));}
const keyBytes=await readFile(config.credentialsPath);assert.match(keyBytes.toString(),/^DEEPSEEK_API_KEY=\s*$/m,'Private model credentials are forbidden in this synthetic fixture');
const hash=b=>createHash('sha256').update(b).digest('hex'),record=join(work,'small-repair-preservation.json');
if(process.argv[2]==='prepare-fixture'){
 assert.equal(config.graphHash,'8660c8d5ba2611ca676b0e6169705abd6843cce4a43cdccdea0bd0478a834e52');
 for(const p of ['home/user-plugins/synthetic-plugin.txt','workspace/中文 保留资料.txt']){await mkdir(join(target,p,'..'),{recursive:true});await writeFile(join(target,p),'synthetic startup repair canary\n',{flag:'wx'});}
 const paths=['.env','home/user-plugins/synthetic-plugin.txt','workspace/中文 保留资料.txt'];
 const preserved=await Promise.all(paths.map(async path=>({path,sha256:hash(await readFile(join(target,path)))})));
 await writeFile(record,JSON.stringify({schema:1,baselineGraph:config.graphHash,preserved},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'prepared',graphHash:config.graphHash,canaries:preserved.length}));
}else if(process.argv[2]==='apply-and-smoke'){
 const preserved=JSON.parse(await readFile(record)).preserved,manifest=JSON.parse(await readFile(join(bundle,'manifest.json')));assert.equal(manifest.kind,'startup-repair');
 const {cli}=await import(pathToFileURL(join(bundle,'repair/repair-cli.mjs')));
 const plan=await cli(['prepare','--target',target,'--bundle',bundle]);await writeFile(join(work,'small-repair-plan.json'),JSON.stringify(plan,null,2)+'\n');
 const result=await cli(['apply','--plan',plan.planPath,'--bundle',bundle]);assert.equal(result.status,'pass');
 for(const row of preserved)assert.equal(hash(await readFile(join(target,row.path))),row.sha256);
 const launcher=await import(pathToFileURL(join(target,'managed/launcher.mjs'))),coordinator=await import(pathToFileURL(join(target,'managed/startup-coordinator.mjs')));
 let runtime,hostPid,startStatus,closed=false;
 try{runtime=await coordinator.startCoordinated(configPath,launcher);assert.ok(runtime.service,'Test must own its isolated recovery center');const status=await runtime.client.call('status');assert.equal(status.guardian.phase,'running');hostPid=status.guardian.pid;startStatus={phase:status.guardian.phase,generation:status.guardian.generation,hostIdentity:(await inspectWindowsProcess(hostPid)).state};assert.equal(startStatus.hostIdentity,'alive');}
 finally{if(runtime?.service){await runtime.close();closed=true;}}
 let finalHost;for(let n=0;n<100;n++){finalHost=await inspectWindowsProcess(hostPid);if(finalHost.state==='absent')break;await delay(50);}assert.equal(finalHost.state,'absent');
 for(const row of preserved)assert.equal(hash(await readFile(join(target,row.path))),row.sha256);
 const out={schema:1,status:'pass',graphHash:manifest.graph.sha256,kind:manifest.kind,updatedFiles:result.updatedFiles,actualPrepareApply:true,startStatus,controlledStop:closed,ownedHostAbsent:finalHost.state==='absent',preserved,modelCalls:0,scope:'One actual old public SEP-only install repaired using the small bundle, started, and stopped; blank credentials and synthetic user files retained. No paid model or real system reboot.'};
 await writeFile(join(work,'small-repair-result.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({...out,preserved:preserved.length}));
}else throw Error('Usage: verify-small-repair.mjs prepare-fixture | apply-and-smoke');
