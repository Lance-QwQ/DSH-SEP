import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,readdir,access} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {withPrivateDisplay} from './private-xorg.mjs';
import {inspectProcess,inspectSandbox} from './linux-process-owner.mjs';
import {bounded} from './linux-launch-lifecycle.mjs';
const [installation,root,mode]=process.argv.slice(2);assert(['stopped-node','host-hang','active-both'].includes(mode));
const program=join(installation,'program'),data=join(installation,'data');process.umask(0o077);await mkdir(root,{mode:0o700});
const {initializeProfile}=await import(pathToFileURL(join(program,'src/linux-standalone-profile.mjs')));await initializeProfile(program,data);
const patchPath=join(data,'home/profiles/desktop/cordis.patch.yml'),original=await readFile(patchPath),rows=[];
async function scan(){const rows=[];for(const name of await readdir('/proc'))if(/^\d+$/.test(name))try{const args=(await readFile('/proc/'+name+'/cmdline')).toString().split('\0');if(args[0]===join(program,'node/bin/node')||args[0]?.startsWith(join(program,'electron/'))){const p=await inspectProcess(Number(name));if(p.state==='alive'&&p.uid===process.getuid())rows.push({...p,role:args[1]===join(program,'src/linux-launch.mjs')?'launcher':args[0]===join(program,'electron/electron')&&args[1]===join(program,'desktop')?'electron':'descendant'});}}catch(e){if(!['ENOENT','ESRCH'].includes(e.code))throw e;}return rows;}
async function reconcile(){
 process.env.SEP_PORTABLE_ROOT=program;process.env.SEP_OFFICIAL_HARNESS=join(program,'host');
 const {openManagedProject}=await import(pathToFileURL(join(program,'src/managed-project.mjs'))),{owned}=await import(pathToFileURL(join(program,'src/bundle-modules.mjs'))),{openControl}=await owned('modules/system-enhancement-package/src/p2/control.js'),{linuxDocumentAuthority}=await import(pathToFileURL(join(program,'src/linux-documents.mjs')));
 const p=await openManagedProject({root:join(data,'managed'),source:join(data,'project'),isolation:{bwrap:join(program,'sandbox-runtime/usr/bin/bwrap'),binarySha256:'e318903862396f96de3df57264e0158682b952fd3fb53ac23d876413e7b30f71'}}),control=await openControl({storageRoot:join(data,'memory')});
 try{await p.bindDocumentAuthority(linuxDocumentAuthority(control,join(data,'project')));const r=await p.recover();return {...r,currentPath:(await p.current()).path};}finally{await p.close();await control.close();}
}
try{await withPrivateDisplay(root,async()=>{for(const round of [1,2]){
 const gate=join(root,'round-'+round);await mkdir(gate,{mode:0o700});
 if(mode==='active-both'){const patch=JSON.parse(original);patch.push({insert:[{id:'active-work-fixture',name:new URL('./active-work-fixture.mjs',import.meta.url).href,config:{root:gate,source:join(data,'project'),managed:join(data,'managed'),round:mode+'-'+round}}]});await writeFile(patchPath,JSON.stringify(patch));}
 const child=spawn(join(program,'start.sh'),[data],{env:process.env,stdio:['ignore','pipe','pipe']}),out=[],err=[],row={round};rows.push(row);child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));let exit,known=[];
 const ended=new Promise(r=>child.once('close',(code,signal)=>{exit={code,signal};r(exit);}));
 async function until(fn,ms){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;if(exit)throw Error('EARLY_LAUNCH_EXIT');await delay(100);}throw Error('SUPERVISION_TEST_DEADLINE');}
 try{
  await until(()=>Buffer.concat(out).toString().includes('"phase":"ready"'),90000);await delay(3000);known=await scan();const node=known.find(p=>p.role==='launcher'),electron=known.find(p=>p.role==='electron');assert(node&&electron);
  const ready=Buffer.concat(out).toString().split('\n').filter(Boolean).map(JSON.parse).find(m=>m.phase==='ready');let transaction,ledger;
  if(mode==='active-both'){await writeFile(join(gate,'begin'),'1');await until(async()=>{try{transaction=JSON.parse(await readFile(join(gate,'entered.json'))).transaction;return true;}catch(e){if(e.code!=='ENOENT')throw e;return false;}},20000);const c=JSON.parse(await readFile(join(data,'desktop-connection.json'))),r=await fetch(c.endpoint+'rpc',{method:'POST',headers:{authorization:'Bearer '+c.token,'content-type':'application/json'},body:JSON.stringify({method:'desktopQuitInspection'}),signal:AbortSignal.timeout(5000)});assert.equal((await r.json()).result.activeTasks,true);ledger=JSON.parse(await readFile(join(data,'budget/ledger.json')));assert.equal((await inspectSandbox(transaction.sandbox)).state,'alive');}
  const start=performance.now();
  if(mode==='stopped-node'){process.kill(node.pid,'SIGSTOP');child.kill('SIGTERM');}
  if(mode==='host-hang'){
   process.kill(ready.hostPid,'SIGSTOP');await promisify(execFile)('/usr/bin/python3',['-I','-B',fileURLToPath(new URL('./linux-installed-window.py',import.meta.url)),String(electron.pid),electron.birth,'close','unused'],{env:process.env,timeout:5000});
   // Unknown Host inspection deliberately requires native approval. A pending
   // user decision is not a shutdown request and must not start the 40s clock.
   await delay(4000);const args=['-I','-B',fileURLToPath(new URL('./linux-quit-dialog-driver.py',import.meta.url)),String(electron.pid),electron.birth];const box=JSON.parse((await promisify(execFile)('/usr/bin/python3',[...args,'capture',join(gate,'unknown-host-confirmation.png')],{env:process.env,timeout:10000})).stdout);assert(box.windows[0].height<400);await promisify(execFile)('/usr/bin/python3',[...args,'accept','unused'],{env:process.env,timeout:5000});row.unknownInspectionApproved=true;
  }
  if(mode==='active-both'){child.kill('SIGKILL');process.kill(node.pid,'SIGKILL');}
  await bounded(ended,55000,'WHOLE_APP_STOP_DEADLINE');row.settleAfterFaultMs=performance.now()-start;assert.notEqual(exit.code,0);assert.deepEqual(await scan(),[]);row.remaining=[];row.exit=exit;
  const messages=Buffer.concat(out).toString().split('\n').filter(Boolean).map(JSON.parse);row.ownerReceipt=messages.find(m=>m.phase==='owner-closed');assert.equal(row.ownerReceipt?.status,'blocked');assert.equal(row.ownerReceipt.resourcesConfirmedStopped,true);
  if(mode!=='active-both'){assert.match(Buffer.concat(err).toString(),/SEP_LINUX_OWNER_STOP_DEADLINE/);assert(row.settleAfterFaultMs>=39000&&row.settleAfterFaultMs<50000);}
  else{assert.equal((await inspectSandbox(transaction.sandbox)).state,'gone');row.sandboxGone=true;row.recovery=await reconcile();assert.equal(row.recovery.status,'pass');assert.deepEqual(JSON.parse(await readFile(join(data,'budget/ledger.json'))),ledger,'reconciliation must not clear accounting');row.ledgerPreserved=true;for(const path of [join(data,'project/interrupted.txt'),join(row.recovery.currentPath,'interrupted.txt'),join(row.recovery.currentPath,'late.txt')])await assert.rejects(access(path),{code:'ENOENT'});row.unpublishedWritesAbsent=true;}
  row.status='pass';
 }catch(e){row.status='fail';row.code=e.message;process.exitCode=1;}
 finally{row.testCleanup=[];for(const expected of [...known,...await scan()]){const p=await inspectProcess(expected.pid);if(p.state==='alive'&&p.birth===expected.birth&&p.uid===process.getuid()){process.kill(p.pid,'SIGCONT');process.kill(p.pid,'SIGKILL');row.testCleanup.push({pid:p.pid,birth:p.birth});}}if(!exit){child.kill('SIGTERM');await bounded(ended,55000,'TEST_CLEANUP').catch(()=>{});}await writeFile(join(gate,'stdout.log'),Buffer.concat(out));await writeFile(join(gate,'stderr.log'),Buffer.concat(err));await writeFile(patchPath,original);}
 if(row.status!=='pass')break;
}});}finally{await writeFile(patchPath,original);}
const result={status:rows.length===2&&rows.every(r=>r.status==='pass')?'pass':'fail',mode,scope:'actual shipped default Electron/Host and supervisor; private Xorg; active-both uses a synthetic LLM and real Agent/bash/COW namespace, trusted explicit reconciliation, no automatic replay',rows};await writeFile(join(root,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
