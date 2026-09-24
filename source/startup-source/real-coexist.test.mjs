import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,realpath,access} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {inspectWindowsProcess} from './ownership/owner-file.mjs';
const work=await realpath(fileURLToPath(new URL('.',import.meta.url))),roots=JSON.parse(process.env.SEP_TEST_INSTALL_ROOTS??'[]');assert.equal(roots.length,2);
const evidence=join(work,'real-coexist-evidence',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID());await mkdir(evidence,{recursive:true});
const items=[];
for(const input of roots){const root=await realpath(resolve(input)),r=relative(work,root);assert.ok(/^installed-[^\\/]+$/.test(r)&&!isAbsolute(r));let name='deployment.json';try{await access(join(root,name));}catch{name='deployment-rc2.json';}const config=JSON.parse(await readFile(join(root,name),'utf8'));for(const field of ['home','storageRoot','controlRoot','electronUserData','nodeExecutable','credentialsPath']){const rel=relative(root,config[field]);assert.ok(!rel.startsWith('..')&&!isAbsolute(rel));}const env=await readFile(config.credentialsPath,'utf8');assert.match(env,/^DEEPSEEK_API_KEY=\s*$/m);items.push({root,config,credentialHash:createHash('sha256').update(env).digest('hex')});}
for(const field of ['home','storageRoot','controlRoot','electronUserData'])assert.notEqual(items[0].config[field].toLowerCase(),items[1].config[field].toLowerCase());
const workers=[],events=[];
async function wait(fn,ms=75000){const until=Date.now()+ms;while(Date.now()<until){const r=fn();if(r)return r;await delay(25);}throw Error('COEXIST_TEST_TIMEOUT');}
async function launch(item,label){
 const child=spawn(item.config.nodeExecutable,[join(work,'installed-worker.mjs'),item.root],{cwd:item.root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});const w={child,item,label,messages:[],log:'',exit:null};workers.push(w);child.stdout.on('data',b=>w.log+=b);child.stderr.on('data',b=>w.log+=b);child.on('message',m=>w.messages.push(m));child.once('error',e=>w.error=e);child.once('exit',(code,signal)=>w.exit={code,signal});
 w.identity=await inspectWindowsProcess(child.pid);assert.equal(w.identity.state,'alive');
 w.ready=await wait(()=>{if(w.error)throw w.error;const m=w.messages.find(x=>['ready','failed'].includes(x.type));if(m?.type==='failed')throw Error(m.code);if(w.exit)throw Error('COEXIST_EARLY_EXIT');return m;});assert.equal(w.ready.reused,false);
 w.hostIdentity=await inspectWindowsProcess(w.ready.host);assert.equal(w.hostIdentity.state,'alive');events.push({event:'ready',label,center:child.pid,host:w.ready.host,centerPort:w.ready.centerPort,hostPort:w.ready.hostPort});return w;
}
async function request(w,type,result){const count=w.messages.length;w.child.send({type});return wait(()=>{const m=w.messages.slice(count).find(x=>x.type===result||x.type==='failed');if(m?.type==='failed')throw Error(m.code);if(m)return m;if(w.exit)throw Error('COEXIST_EARLY_EXIT');return null;});}
async function stop(w){await request(w,'stop','stopped');await wait(()=>w.exit);assert.equal(w.exit.code,0);events.push({event:'normal-stop',label:w.label,center:w.child.pid});}
test('new Full and SEP-only installs start independently and remain usable when the peer closes',{timeout:240000},async()=>{
 let status='fail',failure;
 try{
  const [a,b]=await Promise.all(items.map((item,i)=>launch(item,'instance-'+i)));assert.notEqual(a.ready.host,b.ready.host);assert.notEqual(a.child.pid,b.child.pid);assert.notEqual(a.ready.centerPort,b.ready.centerPort);assert.notEqual(a.ready.hostPort,b.ready.hostPort);assert.ok([a.ready.centerPort,b.ready.centerPort,a.ready.hostPort,b.ready.hostPort].every(p=>Number.isInteger(p)&&p>0));
  for(const w of [a,b]){const s=(await request(w,'status','status')).value;assert.equal(s.guardian.phase,'running');assert.equal(s.guardian.ownerPid,w.child.pid);assert.equal(s.guardian.pid,w.ready.host);}
  await stop(a);assert.equal((await request(b,'status','status')).value.guardian.pid,b.ready.host);
  const a2=await launch(items[0],'instance-0-reopened');await stop(b);assert.equal((await request(a2,'status','status')).value.guardian.pid,a2.ready.host);await stop(a2);
  for(const item of items)assert.equal(createHash('sha256').update(await readFile(item.config.credentialsPath)).digest('hex'),item.credentialHash);
  status='pass';
 }catch(error){failure=error.message;throw error;}
 finally{
  for(const w of workers){if(!w.exit){try{await stop(w);}catch(error){events.push({event:'normal-cleanup-failed',label:w.label,code:error.message});}}for(const [role,id] of [['host',w.hostIdentity],['worker',w.identity]])if(id){const current=await inspectWindowsProcess(id.pid);if(current.state==='alive'&&current.startTimeUtcTicks===id.startTimeUtcTicks){process.kill(id.pid);events.push({event:'forced-owned-cleanup',role,pid:id.pid,label:w.label});}}await writeFile(join(evidence,w.label+'.log'),w.log);}
  const residues=[];for(const w of workers)for(const [role,id] of [['host',w.hostIdentity],['worker',w.identity]])if(id){const current=await inspectWindowsProcess(id.pid);if(current.state==='alive'&&current.startTimeUtcTicks===id.startTimeUtcTicks)residues.push({role,pid:id.pid});}
  await writeFile(join(evidence,'result.json'),JSON.stringify({schema:1,status:residues.length?'fail':status,failure,scope:'Two actual installed SEP runtimes, real bootstrap/host, synthetic empty credentials; no GUI/model call or claim of arbitrary official-build coexistence coverage',instances:items.map(i=>({root:i.root,graphHash:i.config.graphHash,credentialHash:i.credentialHash})),events,residues},null,2)+'\n');console.log(JSON.stringify({status,evidence,residues}));assert.equal(residues.length,0);
 }
});
