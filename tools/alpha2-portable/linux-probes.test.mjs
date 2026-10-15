import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,writeFile,symlink,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex');
const base=resolve(process.env.SEP_PORTABLE_ROOT),work=resolve(process.env.SEP_BUNDLE_TEST_ROOT);
const host=join(base,'host'),require=createRequire(join(host,'package.json'));
const root=join(host,'node_modules/dsh-sep-bundle');
const owned=p=>import(pathToFileURL(join(root,'bundle',p)));
const load=p=>import(pathToFileURL(require.resolve(p)));
const processOwner=await owned('modules/recovery/src/owner-posix.mjs');

test('Linux installed artifact and every program leaf match the current r6 input',async()=>{
 assert.equal(process.platform,'linux');
 const input=JSON.parse(await readFile(join(base,'PREPARED.json')));
 assert.equal(input.host,'0.2.1-alpha.2');assert.equal(input.candidate,'0.2.1-beta.3-alpha2-adapter.1');
 assert.equal(sha(await readFile(join(base,'candidate.tgz'))),input.artifactSha256);
 for(const row of input.files){
  const bytes=await readFile(join(root,row.path));
  assert.equal(sha(bytes),row.sha256,row.path);
 }
 assert.equal(JSON.parse(await readFile(join(host,'node_modules/@deepseek-ai/dsh/package.json'))).version,input.host);
});

test('actual Alpha.2 peer gate accepts the installed candidate and refuses future versions',async()=>{
 const manifest=JSON.parse(await readFile(join(root,'package.json')));
 const app=require.resolve('@deepseek-ai/dsh-app-boot');
 const {evaluatePluginCompatibility}=await import(pathToFileURL(app));
 const {satisfies}=createRequire(app)('semver');
 assert.equal(evaluatePluginCompatibility(manifest,{},'0.2.1-alpha.2'),undefined);
 for(const version of ['0.2.1-alpha.3','0.2.1','0.3.0'])assert(evaluatePluginCompatibility(manifest,{},version));
 for(const [name,range] of Object.entries(manifest.peerDependencies)){
  const v=JSON.parse(await readFile(join(host,'node_modules',name,'package.json'))).version;
  assert(satisfies(v,range,{includePrerelease:true}),name+':'+v);
 }
});

test('Linux live owner identity includes boot, namespace and process birth',async()=>{
 const observed=await processOwner.inspectPosixProcess(process.pid);
 assert.equal(observed.state,'alive');assert(processOwner.validPosixIdentity(observed,process.pid));
 const owner={pid:process.pid,sepOwner:observed};
 assert.equal(processOwner.classifyPosixOwner(owner,observed),'alive');
 assert.equal(processOwner.classifyPosixOwner(owner,{...observed,birth:String(BigInt(observed.birth)+1n)}),'stale');
 assert.equal(processOwner.classifyPosixOwner(owner,{...observed,namespace:'pid:[1]'}),'unknown');
});

test('ext4 directory admits ownership while a symbolic alias is refused',async()=>{
 const dir=await mkdtemp(join(work,'identity-'));
 await processOwner.assertPosixLocalDirectory(dir);
 const alias=dir+'-alias';await symlink(dir,alias,'dir');
 await assert.rejects(processOwner.assertPosixLocalDirectory(alias));
});

test('P2 ext4 coordinator reopens the same journal and refuses a second process writer',{timeout:20000},async()=>{
 const storageRoot=await mkdtemp(join(work,'memory-'));
 const {openControl}=await owned('modules/system-enhancement-package/src/p2/control.js');
 const control=await openControl({storageRoot,initialize:true});let first;
 try{
  first=await control.checkpoint();assert.equal(first.coverage,'governed-empty-origin');assert.equal(first.barrier.closed,false);
  const probe=join(storageRoot,'second-writer.mjs');
  await writeFile(probe,`import {openControl} from ${JSON.stringify(pathToFileURL(join(root,'bundle/modules/system-enhancement-package/src/p2/control.js')).href)};try{const c=await openControl({storageRoot:process.argv[2]});await c.close();console.log('WRITER_ADMITTED');process.exitCode=2;}catch(e){console.log(JSON.stringify({code:e.code,reason:e.reason}));}`);
  const result=await run(process.execPath,[probe,storageRoot],{timeout:10000,maxBuffer:65536});
  assert.equal(JSON.parse(result.stdout.trim()).code,'P2_LOCKED');
 }finally{await control.close();}
 const reopened=await openControl({storageRoot});
 try{const cp=await reopened.checkpoint();assert.equal(cp.identity,first.identity);assert.deepEqual(cp.head,first.head);}finally{await reopened.close();}
});

test('Worker repeated successful results settle only after their owned workers exit',{timeout:20000},async()=>{
 const dir=await mkdtemp(join(work,'worker-')),config=join(dir,'cordis.yml');await writeFile(config,'[]\n');
 const module=join(dir,'echo.mjs');await writeFile(module,'export function execute(args){return {value:args.value};}\n');
 const {boot}=await load('@deepseek-ai/dsh-app-boot'),ctx=await boot('dsh',config,[]);
 const {createModuleExecutor}=await owned('modules/tool-worker/index.js');
 const executor=createModuleExecutor(ctx,{name:'linux_echo',description:'Synthetic Linux worker',module:{url:pathToFileURL(module)},parameters:{type:'object',properties:{value:{type:'integer'}},required:['value'],additionalProperties:false},output:{schema:{type:'object',properties:{value:{type:'integer'}},required:['value'],additionalProperties:false}},timeoutMs:3000});
 try{for(let i=0;i<30;i++)assert.deepEqual(await executor.execute({value:i}),{value:i});
  assert.equal(executor.inspect().started,30);assert.equal(executor.inspect().exited,30);assert.equal(executor.inspect().settled,30);
  assert.equal(executor.inspect().activeWorkers,0);assert.equal(executor.inspect().activeTimers,0);
 }finally{await executor.dispose();await ctx.fiber.dispose();}
 assert.equal(executor.inspect().closed,true);
});

test('advisory flock is not a Windows deny-write handle: independent writer can still write',{timeout:10000},async()=>{
 const dir=await mkdtemp(join(work,'flock-')),target=join(dir,'target.txt');await writeFile(target,'original');
 const code='import fcntl,sys\nf=open(sys.argv[1],"r+")\nfcntl.flock(f,fcntl.LOCK_EX)\nprint("LOCKED",flush=True)\nsys.stdin.read()\n';
 const child=spawn('/usr/bin/python3',['-c',code,target],{stdio:['pipe','pipe','pipe']});
 const exited=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',(code,signal)=>resolve({code,signal}));});
 const ready=new Promise((resolve,reject)=>{let text='';child.stdout.on('data',chunk=>{text+=chunk;if(text.includes('LOCKED'))resolve();});child.once('error',reject);child.once('exit',()=>reject(Error('FLOCK_EARLY_EXIT')));});
 try{await ready;await run('/usr/bin/python3',['-c','import sys;open(sys.argv[1],"w").write("independent writer")',target],{timeout:2000});assert.equal(await readFile(target,'utf8'),'independent writer');}
 finally{child.stdin.end();const result=await exited;assert.equal(result.code,0);}
});
