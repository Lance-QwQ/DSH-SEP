import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.argv[2];assert.equal(root,'/opt/dsh-sep-cross-platform/alpha2-portable-transactions-final-r6');
const sha=x=>createHash('sha256').update(x).digest('hex');
const output=join(root,'evidence');await mkdir(output,{mode:0o700});
const inputs=['linux-isolation.mjs','isolation.test.mjs','isolation-transactions.test.mjs','project-tree.mjs','snapshot-bootstrap.py','managed-project.mjs','transaction-fixtures.mjs','transaction-worker.mjs','transactions.test.mjs'];
const leaves=[];for(const name of inputs){const body=await readFile(join(root,name));leaves.push({name,sha256:sha(body),bytes:body.length});await copyFile(join(root,name),join(output,name));}
const stages=[
 ['transactions-red','alpha2-portable-transactions-red-r1/red.tap',19,0,19],
 ['carrier-red','alpha2-portable-transactions-carrier-red-r1/red.tap',3,0,3],
 ['initial-green','alpha2-portable-transactions-green-r1/green.tap',29,29,0],
 ['adversarial-red','alpha2-portable-transactions-adversarial-r2/adversarial.tap',39,37,2],
 ['stop-red','alpha2-portable-transactions-stop-red-r3/stop-red.tap',1,0,1],
 ['adversarial-green','alpha2-portable-transactions-green-r4/green.tap',40,40,0],
 ['close-red','alpha2-portable-transactions-close-red-r5/close-red.tap',2,0,2],
 ...[1,2,3].map(n=>['final-r'+n,'alpha2-portable-transactions-final-r6/final-r'+n+'.tap',41,41,0])
];
const results=[];for(const [name,path,total,passed,failed] of stages){
 const file=join('/opt/dsh-sep-cross-platform',path),bytes=await readFile(file),text=bytes.toString();
 const count=key=>Number(text.match(new RegExp('^# '+key+' (\\d+)$','m'))?.[1]);
 assert.equal(count('tests'),total);assert.equal(count('pass'),passed);assert.equal(count('fail'),failed);assert.equal(count('cancelled'),0);assert.equal(count('skipped'),0);
 await copyFile(file,join(output,name+'.tap'));results.push({name,total,passed,failed,sha256:sha(bytes)});
}
const relevant=[];let unreadableOwn=0;
for(const pid of await readdir('/proc')){
 if(!/^\d+$/.test(pid)||Number(pid)===process.pid)continue;
 try{
  const status=await readFile('/proc/'+pid+'/status','utf8');if(Number(status.match(/^Uid:\s+(\d+)/m)?.[1])!==process.getuid())continue;
  const cmd=(await readFile('/proc/'+pid+'/cmdline')).toString().replaceAll('\0',' ');
  const carrier=cmd.includes('--ro-bind-fd 3 /source')&&cmd.includes('--bind-fd 4 /work');
  const worker=cmd.includes('alpha2-portable-transactions-')&&/transaction-worker\.mjs|--test /.test(cmd);
  const tool=cmd.includes('/usr/bin/python3 -c ')&&cmd.includes('/work/');
  if(carrier||worker||tool)relevant.push({pid:Number(pid),kind:carrier?'carrier':worker?'worker':'tool'});
 }catch(e){if(e.code!=='ENOENT'&&e.code!=='ESRCH')unreadableOwn++;}
}
assert.deepEqual(relevant,[]);assert.equal(unreadableOwn,0);
const result={schema:1,status:'pass',scope:'Linux x64 ext4 controlled synthetic generation transactions; experimental carrier only',sourceBase:'3518fe3fa3c922323a7ce44bbce4224ebd8d2534',officialHost:'d743267388641bc76f17c45ce8b4c231aed1d32c',node:process.version,kernel:execFileSync('/usr/bin/uname',['-r'],{encoding:'utf8'}).trim(),uid:process.getuid(),inputs:leaves,stages:results,uniqueFinalDefinitions:41,finalRounds:3,finalExecutions:123,resourceAudit:{scope:'current UID, this distro, transaction worker and carrier/tool command signatures only',relevantProcesses:relevant,unreadableOwn,cleanupAttribution:'The injected EPERM specimen returned blocked; its exact sandbox process group was later killed by the test finally block. This final audit does not retroactively change that receipt to pass.'},notVerified:{linuxProtectedProfile:'blocked',linuxElectron:'not_run',macOS:'not_run',publicUpdaterPositive:'not_run',productionToolRouting:'not_run',bootstrapPowerLoss:'not_run',diskFull:'not_run',kernelOrHostileSameUidCode:'not_run'}};
await writeFile(join(output,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:result.status,uniqueFinalDefinitions:41,finalExecutions:123,output}));
