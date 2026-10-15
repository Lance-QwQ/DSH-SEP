import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile,readdir,readlink} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.argv[2];assert.equal(root,'/opt/dsh-sep-cross-platform/alpha2-portable-profile-audit-r18');
const base='/opt/dsh-sep-cross-platform',sha=x=>createHash('sha256').update(x).digest('hex');
const output=join(root,'evidence');await mkdir(output,{mode:0o700});
const inputs=['linux-isolation.mjs','linux-process-owner.mjs','managed-project.mjs','project-tree.mjs','snapshot-bootstrap.py','transaction-fixtures.mjs','transaction-worker.mjs','isolation.test.mjs','isolation-transactions.test.mjs','transactions.test.mjs','cleanup-recovery.test.mjs','cleanup-cli.mjs','host-modules.mjs','linux-profile-plugin.mjs','linux-filesystem.mjs','mcp-stdio-client.py','linux-profile.test.mjs','prepare-linux-desktop.mjs','run-linux-desktop.mjs','linux-desktop-host.mjs','desktop-probe.cjs'];
const leaves=[];for(const name of inputs){const bytes=await readFile(join(root,name));leaves.push({name,sha256:sha(bytes),bytes:bytes.length});await copyFile(join(root,name),join(output,name));}
const desktopRoot=join(base,'alpha2-portable-profile-final-r17'),testRoot=desktopRoot;
const desktopNames=new Set(['prepare-linux-desktop.mjs','run-linux-desktop.mjs','linux-desktop-host.mjs','desktop-probe.cjs']);
for(const name of inputs)assert.equal(sha(await readFile(join(root,name))),sha(await readFile(join(desktopNames.has(name)?desktopRoot:testRoot,name))),'tested input matches final: '+name);
const stages=[['cleanup-pid1-red-r1',8,6,2],['cleanup-pid1-green-r1',8,8,0],['restart-selection-red-r1',10,9,1],['profile-activation-r1',11,11,0],['profile-final-r9',60,60,0],['profile-final-r10',60,60,0],['legacy-running-red-r1',8,7,1],['profile-final-r15',60,59,1],['profile-final-r17',60,60,0]];
const logs=[];
for(const [tag,total,pass,fail] of stages){const bytes=await readFile(join(base,'alpha2-portable-'+tag,'result.tap')),text=bytes.toString(),count=k=>Number(text.match(new RegExp('^# '+k+' (\\d+)$','m'))?.[1]);assert.equal(count('tests'),total);assert.equal(count('pass'),pass);assert.equal(count('fail'),fail);assert.equal(count('skipped'),0);assert.equal(count('cancelled'),0);await writeFile(join(output,tag+'.tap'),bytes,{flag:'wx'});logs.push({tag,total,pass,fail,sha256:sha(bytes)});}
const desktops=[];
const upstreamRoot=join(base,'alpha2-portable-desktop-inputs-r2'),upstream=JSON.parse(await readFile(join(upstreamRoot,'DESKTOP-INPUTS.json'),'utf8'));
assert.equal(upstream.rows.length,118);
for(const row of upstream.rows)assert.equal(sha(await readFile(join(upstreamRoot,row.path))),row.sha256,'frozen upstream: '+row.path);
for(const name of inputs.filter(x=>!x.endsWith('.test.mjs')))assert.equal(sha(await readFile(join(root,name))),sha(await readFile(join(desktopRoot,name))),'desktop runtime matches final: '+name);
for(const name of ['desktop-final-r1','desktop-final-r2']){
 const folder=join(desktopRoot,name),bytes=await readFile(join(folder,'DESKTOP-RESULT.json')),result=JSON.parse(bytes);
 assert.equal(result.status,'pass');assert.equal(result.forcedCleanup,false);assert.equal(result.electronExit.code,0);assert.equal(result.hostExit.code,0);assert(result.events.some(x=>x.event==='main-visible'&&x.visible===true&&x.textLength>=100&&x.buttons>=3&&x.loading===false&&x.workspace===true&&x.paintWait===true));
 assert.equal(await readFile(join(folder,'synthetic-source/data.txt'),'utf8'),'synthetic desktop project');
 for(const row of upstream.rows){
  const actualPath=row.path.startsWith('dsh-desktop/')?join(folder,'app',row.path.slice(12)):row.path.startsWith('dsh-desktop-host/')?join(folder,'runtime/node_modules/@deepseek-ai/dsh-desktop-host',row.path.slice(17)):join(folder,'runtime/node_modules',row.path.slice(13));
  let actual=await readFile(actualPath);
  if(row.path==='dsh-desktop/lib/main.js'){const prefix=Buffer.from('import '+JSON.stringify(new URL('./desktop-probe.cjs','file://'+desktopRoot+'/').href)+';\n');assert(actual.subarray(0,prefix.length).equals(prefix));actual=actual.subarray(prefix.length);}
  assert.equal(sha(actual),row.sha256,'actual desktop input: '+name+'/'+row.path);
 }
 const dest=join(output,name);await mkdir(dest,{mode:0o700});const files=[];
 for(const file of ['DESKTOP-RESULT.json','DESKTOP-FIXTURE.json','desktop-probe.jsonl','desktop-probe.jsonl.png','host.stdout.log','host.stderr.log','electron.stdout.log','electron.stderr.log']){try{const value=await readFile(join(folder,file));await writeFile(join(dest,file),value,{flag:'wx'});files.push({name:file,sha256:sha(value),bytes:value.length});}catch(e){if(e.code!=='ENOENT'||!file.endsWith('.log'))throw e;}}
 desktops.push({name,status:'pass',runtimeMatchesFinal:true,testSourceGeneration:'profile-final-r17',electronExit:result.electronExit,hostExit:result.hostExit,forcedCleanup:false,sourceUnchanged:true,files});
}
const remaining=[],unknown=[];
for(const pid of await readdir('/proc')){if(!/^\d+$/.test(pid)||Number(pid)===process.pid)continue;try{
 const status=await readFile('/proc/'+pid+'/status','utf8');if(Number(status.match(/^Uid:\s+(\d+)/m)?.[1])!==process.getuid())continue;
 const cmd=(await readFile('/proc/'+pid+'/cmdline')).toString().split('\0'),exe=basename(await readlink('/proc/'+pid+'/exe'));
 const carrier=cmd.includes('--ro-bind-fd')&&cmd.includes('/source')&&cmd.includes('/work');
 const worker=exe==='node'&&cmd.some(x=>/alpha2-portable-(profile|cleanup|restart|desktop)/.test(x))&&cmd.some(x=>/--test|transaction-worker\.mjs|linux-desktop-host\.mjs|run-linux-desktop\.mjs/.test(x));
 const desktop=exe==='electron'&&cmd.some(x=>/desktop-final-r[12]|desktop-validation-r\d+/.test(x));
 if(carrier||worker||desktop)remaining.push({pid:Number(pid),kind:carrier?'carrier':worker?'worker':'desktop'});
 }catch(e){if(!['ENOENT','ESRCH'].includes(e.code))unknown.push(Number(pid));}}
assert.deepEqual(remaining,[]);assert.deepEqual(unknown,[]);
const bwrap=join(base,'alpha2-portable-20261012-r1/sandbox-runtime/usr/bin/bwrap');
const result={schema:1,status:'pass',scope:'Linux x64 WSL2 ext4 dedicated synthetic controlled Profile + actual Alpha.2 desktop lifecycle; not full SEP production certification',sourceBase:'e9d4c3e51df9f918f53bce1933a80daedec0492e',officialHost:'d743267388641bc76f17c45ce8b4c231aed1d32c',environment:{node:process.version,electron:(await readFile(join(base,'desktop-r7/payload/electron/version'),'utf8')).trim(),kernel:execFileSync('/usr/bin/uname',['-r'],{encoding:'utf8'}).trim(),uid:process.getuid(),bwrapSha256:sha(await readFile(bwrap)),wslConfSha256:sha(await readFile('/etc/wsl.conf'))},inputs:leaves,stages:logs,uniqueFinalDefinitions:60,finalExecutions:60,desktopRounds:desktops,desktopUpstream:upstream,resourceAudit:{status:'pass',scope:'current UID, this dedicated distro, matching carrier/test-worker/desktop command signatures; not a system-wide handle inventory',remaining,unknown,cleanupAttribution:'Injected EPERM/blocked specimens retain their original blocked receipts. Test finally blocks subsequently terminate exact sandbox groups; final empty audit does not prove those original closes released resources.'},historicalCorrection:{desktopValidationR6:'Original pass is insufficient for visible-ready UI; excluded from accepted final evidence. Original bytes retained.',desktopValidationR7:'Observer supplied hasVisibleWindows=true; activate did not reopen. Test finally requested graceful host stop and killed its owned Electron after deadline. Excluded from final pass.'},notVerified:{linuxCompleteSepBusinessProfile:'blocked',privateData:'not_run',paidModel:'not_run',nativeTrayMouseInput:'not_run',manualDrag:'not_run',macOS:'not_run',portableInstaller:'not_run',publicUpdaterPositive:'not_run',powerLossDiskFullOrResourceExhaustion:'not_run'}};
result.evidenceControllerSha256=sha(await readFile(new URL(import.meta.url)));
result.historicalCorrection.profileFinalR15='59/60: the pre-folder fixture omitted the new durable not-dispatched marker, making it a legacy unverifiable record. Fixture now matches actual newTransaction serialization; its original positive scenario remains tested and the separate legacy negative is retained.';
result.historicalCorrection.desktopFinalR9='Lifecycle exited normally, but captured image still displayed Loading settings; both rounds excluded from final UI-ready evidence. The prior linux-evidence export remains historical.';
result.historicalCorrection.desktopPaintedR11='Electron exited before observer receipt; original runner did not persist its exit status before reading the missing probe. Cause remains undetermined; not marked fixed by later pass.';
result.historicalCorrection.desktopPaintedR12='Painted screenshot exposed default-workspace creation warning. Dedicated test host now registers the already-existing controller-selected directory before UI first use; no unmanaged directory or broader host write was enabled.';
await writeFile(join(output,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:'pass',tests:60,desktopRounds:desktops.length,output}));
