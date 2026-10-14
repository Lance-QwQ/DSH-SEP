import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,realpath,lstat} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {join,resolve} from 'node:path';
import {createProbeChannel} from './channel.mjs';

assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
const [preparedArg,outArg]=process.argv.slice(2),temp=await realpath(process.env.RUNNER_TEMP),prepared=await realpath(preparedArg),out=resolve(outArg);
assert(prepared.startsWith(temp+'/'));assert(out.startsWith(temp+'/'));await mkdir(out,{mode:0o700});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const build=JSON.parse(await readFile(join(prepared,'PREPARED.json'),'utf8'));assert.equal(build.status,'pass');
const app=await realpath(build.app);assert.equal(app,join(prepared,'FD3 Fixture.app'));
const executable=join(app,'Contents/MacOS/DSH SEP'),archive=join(app,'Contents/Resources/app.asar');
assert.equal(hash(await readFile(archive)),build.resultAsarSha256);assert.equal(hash(await readFile(executable)),build.executableSha256);
assert((await lstat(executable)).isFile());
const sourceHash=hash(await readFile(new URL('./channel.mjs',import.meta.url)));assert.equal(sourceHash,build.inputs.find(x=>x.file==='channel.mjs').sha256);
const results=[];
for(const mode of ['duplex','wrong-nonce','replay','eof']){
  const caseRoot=join(out,mode);await mkdir(caseRoot,{mode:0o700});await mkdir(join(caseRoot,'home'));await mkdir(join(caseRoot,'tmp'));
  const binding={nonce:randomBytes(32).toString('hex'),programSha256:build.resultAsarSha256,generation:randomBytes(16).toString('hex')};
  const child=spawn(executable,[],{cwd:caseRoot,detached:true,env:{HOME:join(caseRoot,'home'),TMPDIR:join(caseRoot,'tmp'),PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'en_US.UTF-8',SEP_CONTROL_CASE:mode},stdio:['ignore','pipe','pipe','pipe']});
  let stdout='',stderr='',overflow=false,channel,exited=false,spawnError=false,timer;
  for(const [stream,key]of [[child.stdout,'stdout'],[child.stderr,'stderr']])stream.on('data',chunk=>{if(key==='stdout'){if(stdout.length+chunk.length<=65536)stdout+=chunk;else overflow=true;}else{if(stderr.length+chunk.length<=65536)stderr+=chunk;else overflow=true;}});
  const actualExit=new Promise(resolveExit=>{child.once('error',()=>{spawnError=true;});child.once('exit',()=>{exited=true;});child.once('close',(code,signal)=>resolveExit({code,signal,...(spawnError?{spawnError:true}:{})}));});
  const boundedExit=()=>Promise.race([actualExit,new Promise(resolveExit=>{timer=setTimeout(()=>resolveExit(null),10000);})]).finally(()=>clearTimeout(timer));
  const row={case:mode,status:'fail',acknowledgments:0,expectedRejection:null,testCleanup:false};
  try{
    assert(child.stdio[3]?.readable&&child.stdio[3]?.writable,'SEP_CONTROL_PARENT_FD3');
    channel=createProbeChannel({stream:child.stdio[3],binding,role:'controller',timeoutMs:10000});
    if(mode==='duplex'){
      await channel.hello();await Promise.all(Array.from({length:8},()=>channel.ping()));row.acknowledgments=channel.status().acceptedAcks;assert.equal(row.acknowledgments,9);
      // Half-close only. Keep reading until actual peer EOF; a helper retaining
      // the endpoint must not be hidden by destroying our read side locally.
      child.stdio[3].end();
    }else if(mode==='replay'){
      await channel.hello();await assert.rejects(channel.ping(),{code:'SEP_CONTROL_SEQUENCE'});row.acknowledgments=channel.status().acceptedAcks;assert.equal(row.acknowledgments,1);row.expectedRejection='SEP_CONTROL_SEQUENCE';
    }else{
      const expected=mode==='wrong-nonce'?'SEP_CONTROL_BINDING':'SEP_CONTROL_EOF';await assert.rejects(channel.hello(),{code:expected});row.expectedRejection=expected;assert.equal(channel.status().acceptedAcks,0);
    }
    row.exit=await boundedExit();assert(row.exit,'SEP_CONTROL_EXIT_TIMEOUT');assert.deepEqual(row.exit,{code:0,signal:null});row.channel=channel.status();
    if(mode==='duplex'){assert.equal(row.channel.state,'blocked');assert.equal(row.channel.code,'SEP_CONTROL_EOF');row.peerEofObserved=true;}
    // stdout is evidence of the fixture environment only, never an acknowledgment.
    const lines=stdout.trim().split('\n').filter(x=>x.startsWith('SEP_CONTROL_FIXTURE '));assert.equal(lines.length,1);row.fixture=JSON.parse(lines[0].slice('SEP_CONTROL_FIXTURE '.length));
    assert.equal(row.fixture.status,'pass');assert.equal(row.fixture.pid,child.pid);assert.equal(row.fixture.packaged,true);assert.equal(row.fixture.platform,'darwin');assert.equal(row.fixture.arch,'arm64');assert.match(row.fixture.electron,/^\d+\.\d+\.\d+/);assert.equal(row.fixture.rendererLoaded,true);assert.equal(row.fixture.rendererNodeAccess,false);assert.equal(row.fixture.rendererControlApi,false);assert.equal(row.fixture.rendererTextSha256,hash('SEP fd3 fixture'));assert(!overflow);row.status='pass';
  }catch(error){row.code=row.exit===null?'SEP_CONTROL_EXIT_DRAIN_UNKNOWN':typeof error.code==='string'&&/^SEP_CONTROL_[A-Z_]+$/.test(error.code)?error.code:'SEP_CONTROL_PROBE_FAILED';if(row.exit===null)row.status='blocked';row.errorType=error.name;row.mainExitObserved=exited;row.channel=channel?.status()??null;
  }finally{
    channel?.close();
    if(!exited&&Number.isSafeInteger(child.pid)){row.testCleanup=true;row.status='blocked';try{process.kill(-child.pid,'SIGKILL');}catch{}row.cleanupExit=await boundedExit();row.descendantRelease='not_run';}
    await writeFile(join(caseRoot,'stdout.log'),stdout,{flag:'wx'});await writeFile(join(caseRoot,'stderr.log'),stderr,{flag:'wx'});results.push(row);await writeFile(join(caseRoot,'RESULT.json'),JSON.stringify(row,null,2)+'\n',{flag:'wx'});
  }
  if(row.status==='blocked')break;
}
const result={schema:1,status:results.length===4&&results.every(x=>x.status==='pass')?'pass':results.some(x=>x.status==='blocked')?'blocked':'fail',scope:'Real packaged Electron fd3 transport prototype only',sourceSha256:sourceHash,preparedSha256:hash(await readFile(join(prepared,'PREPARED.json'))),checks:results,notRun:['duplex','wrong-nonce','replay','eof'].filter(name=>!results.some(x=>x.case===name)),paidProviderCalls:0,productIntegration:'not_run',uiReadiness:'not_run',leaseOwnership:'not_run',notVerified:['Product renderer boot','Product quit or lease release','Finder launch','Arbitrary descendants','Hostile replacement between verification and exec']};
await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:result.status,cases:results.length,passed:results.filter(x=>x.status==='pass').length}));if(result.status!=='pass')process.exitCode=1;
