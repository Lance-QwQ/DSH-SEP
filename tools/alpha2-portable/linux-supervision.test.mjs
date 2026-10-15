// Each case exercises the shipped supervisor and real kernel processes/locks.
// Clock acceleration only shortens the 40-second shutdown deadline in case 1.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './transaction-fixtures.mjs';
import {inspectProcess} from './linux-process-owner.mjs';
import {bounded} from './linux-launch-lifecycle.mjs';
const lock=fileURLToPath(new URL('./linux-launch-lock.py',import.meta.url));
const sample=fileURLToPath(new URL('./orphan-launch-fixture.mjs',import.meta.url));
const inject="import time,sys,runpy,pathlib\nreal=time.monotonic\nscale=int(sys.argv.pop(1))\ntime.monotonic=lambda:real()*scale\nmarker=sys.argv.pop(1)\nmode=sys.argv.pop(1)\nstale=int(sys.argv.pop(1))\noriginal=pathlib.Path.iterdir\noriginal_read=pathlib.Path.read_text\nfaked=False\ndef observe(self):\n if str(self)=='/proc' and pathlib.Path(marker).exists():\n  if mode=='empty':return iter([])\n  raise PermissionError(13,'synthetic observer denial')\n return original(self)\ndef read(self,*args,**kwargs):\n global faked\n text=original_read(self,*args,**kwargs)\n caller=sys._getframe(1).f_globals\n if stale and not faked and sys._getframe(2).f_code.co_name=='members' and str(self)=='/proc/'+str(stale)+'/stat' and 'child' in caller:\n  faked=True\n  end=text.rfind(')')+2;fields=text[end:].split();fields[3]=str(caller['child'].pid);fields[19]='0';text=text[:end]+' '.join(fields);pathlib.Path(marker+'.stale-observed').write_text(text)\n return text\npathlib.Path.iterdir=observe\npathlib.Path.read_text=read\nsys.argv=sys.argv[1:]\nrunpy.run_path(sys.argv[0],run_name='__main__')";
async function setup(scale=1,notify=false,mode='deny',stale=0){
 const f=await fixture(),marker=join(f.base,'deny-observation');
 const child=spawn('/usr/bin/python3',['-I','-B','-c',inject,String(scale),marker,mode,String(stale),lock,f.base,process.execPath,sample,'stubborn','normal',notify?'notify':'normal'],{stdio:['ignore','pipe','pipe']});
 const out=[],err=[];child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));
 const ended=new Promise(r=>child.once('close',(code,signal)=>r({code,signal}))),text=()=>Buffer.concat(out).toString();
 let identities;for(let i=0;i<150;i++){try{identities=JSON.parse(text().split('\n')[0]);break;}catch{}await delay(20);}assert(identities,'owner readiness');
 return {...f,child,marker,ended,identities,out,err};
}
async function cleanup(f){
 await unlink(f.marker).catch(()=>{});
 for(const expected of [f.identities.descendant,f.identities.owner]){const p=await inspectProcess(expected.pid);if(['alive','zombie'].includes(p.state)&&p.birth===expected.birth){try{process.kill(p.pid,'SIGCONT');process.kill(p.pid,'SIGKILL');}catch{}}}
 f.child.kill('SIGTERM');await bounded(f.ended,6000,'TEST_CLEANUP').catch(()=>{});
}
async function duplicate(f){const p=spawn('/usr/bin/python3',['-I','-B',lock,f.base,'/usr/bin/true'],{stdio:['ignore','pipe','pipe']});const [code]=await bounded(once(p,'close'),3000,'PROBE_DEADLINE');return code;}
test('stopped Node cannot keep an accepted supervisor shutdown pending forever',async()=>{
 const f=await setup(25);try{process.kill(f.identities.owner.pid,'SIGSTOP');f.child.kill('SIGTERM');const r=await bounded(f.ended,6000,'STOP_DEADLINE');assert.notEqual(r.code,0);assert.notEqual((await inspectProcess(f.identities.owner.pid)).state,'alive');assert.notEqual((await inspectProcess(f.identities.descendant.pid)).state,'alive');assert.match(Buffer.concat(f.err).toString(),/SEP_LINUX_OWNER_STOP_DEADLINE/);assert.equal(await duplicate(f),0);}finally{await cleanup(f);}
});
test('private shutdown pipe enforces the deadline even without an external stop signal',async()=>{
 const f=await setup(25,true);try{const r=await bounded(f.ended,6000,'PIPE_STOP_DEADLINE');assert.notEqual(r.code,0);assert.match(Buffer.concat(f.err).toString(),/SEP_LINUX_OWNER_STOP_DEADLINE/);assert.notEqual((await inspectProcess(f.identities.descendant.pid)).state,'alive');assert.equal(await duplicate(f),0);}finally{await cleanup(f);}
});
test('simultaneous outer-wrapper and Node death retains a surviving cleanup lease',async()=>{
 const f=await setup();try{process.kill(f.identities.owner.pid,'SIGKILL');f.child.kill('SIGKILL');await delay(150);assert.equal(await duplicate(f),73,'third owner must retain lease during descendant cleanup');await bounded(f.ended,6000,'COMBINED_DEADLINE');assert.notEqual((await inspectProcess(f.identities.descendant.pid)).state,'alive');assert.equal(await duplicate(f),0);const rows=Buffer.concat(f.out).toString().trim().split('\n').map(JSON.parse);assert.equal(rows.at(-1).status,'blocked');assert.equal(rows.at(-1).resourcesConfirmedStopped,true);}finally{await cleanup(f);}
});
test('unreadable process inventory reports blocked and retains lease until verification succeeds',async()=>{
 const f=await setup(25);try{await writeFile(f.marker,'1');process.kill(f.identities.owner.pid,'SIGKILL');await delay(450);assert.equal(await duplicate(f),73,'unknown inventory must not release flock');assert.match(Buffer.concat(f.err).toString(),/SEP_LINUX_OWNER_CLEANUP_UNCONFIRMED/);assert.equal(f.child.exitCode,null);await unlink(f.marker);await bounded(f.ended,6000,'RECOVERY_DEADLINE');assert.notEqual((await inspectProcess(f.identities.descendant.pid)).state,'alive');assert.equal(await duplicate(f),0);}finally{await cleanup(f);}
});
test('closed diagnostic pipe cannot prevent a stopped Node from being forcefully reaped',async()=>{
 const f=await setup(25);try{f.child.stderr.destroy();process.kill(f.identities.owner.pid,'SIGSTOP');f.child.kill('SIGTERM');await bounded(f.ended,6000,'CLOSED_PIPE_DEADLINE');assert.notEqual((await inspectProcess(f.identities.owner.pid)).state,'alive');assert.notEqual((await inspectProcess(f.identities.descendant.pid)).state,'alive');assert.equal(await duplicate(f),0);}finally{await cleanup(f);}
});
test('closed diagnostic pipe cannot release an unconfirmed cleanup lease',async()=>{
 const f=await setup(25);try{f.child.stderr.destroy();await writeFile(f.marker,'1');process.kill(f.identities.owner.pid,'SIGKILL');await delay(450);assert.equal(await duplicate(f),73);await unlink(f.marker);await bounded(f.ended,6000,'CLOSED_PIPE_RECOVERY');assert.notEqual((await inspectProcess(f.identities.descendant.pid)).state,'alive');assert.equal(await duplicate(f),0);}finally{await cleanup(f);}
});
test('empty process snapshot cannot release a lease while directly adopted children still exist',async()=>{
 const f=await setup(25,false,'empty');try{await writeFile(f.marker,'1');process.kill(f.identities.owner.pid,'SIGKILL');await delay(450);assert.equal(await duplicate(f),73);await unlink(f.marker);await bounded(f.ended,6000,'EMPTY_SNAPSHOT_RECOVERY');assert.notEqual((await inspectProcess(f.identities.descendant.pid)).state,'alive');assert.equal(await duplicate(f),0);}finally{await cleanup(f);}
});
test('mixed-time numeric parent linkage never authorizes terminating an unrelated live child',async()=>{
 // Inject one stale /proc row to model a reused intermediate parent PID.
 // The victim is a real unrelated process. This is not a real PID-reuse stress test.
 const outsider=spawn(process.execPath,['-e',"console.log('ready');setInterval(()=>{},1000)"],{stdio:['ignore','pipe','pipe']});await once(outsider.stdout,'data');const ended=once(outsider,'close');const f=await setup(1,false,'deny',process.pid);
 try{process.kill(f.identities.owner.pid,'SIGKILL');await bounded(f.ended,7000,'SNAPSHOT_CLEANUP_DEADLINE');await readFile(f.marker+'.stale-observed');assert.equal((await inspectProcess(outsider.pid)).state,'alive','stale numeric ancestry killed an unrelated process');assert.notEqual((await inspectProcess(f.identities.descendant.pid)).state,'alive');}finally{await cleanup(f);if(outsider.exitCode===null&&outsider.signalCode===null)outsider.kill('SIGTERM');await ended;}
});
