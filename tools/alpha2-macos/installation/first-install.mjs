import {lstat,realpath,open,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve,isAbsolute,dirname} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {release} from 'node:os';
import {verifyPackage} from '../package/package-inventory.mjs';
import {buildBootstrapManifest} from '../package/bootstrap-manifest-builder.mjs';
import {loadProgram} from '../desktop/managed-broker/program-manifest.mjs';
import {validateBootstrapManifest} from '../bootstrap/production-manifest.mjs';

const exec=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex');
const error=code=>Object.assign(Error(code),{code});
const fail=code=>{throw error(code);};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('\0')===[...keys].sort().join('\0');
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const id=s=>s.dev+':'+s.ino;
const version=s=>[s.dev,s.ino,s.size,s.mode,s.nlink,s.mtimeNs,s.ctimeNs].join(':');
const env=()=>({PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LANG:'en_US.UTF-8'});
const target=plan=>join(plan.parent,'DSH SEP.app');
const stage=plan=>join(plan.parent,'.dsh-sep-install-'+plan.transactionId,'staged.app');
async function platform(){
 if(process.platform!=='darwin'||process.arch!=='arm64'||release()!=='24.6.0')fail('SEP_INSTALL_PLATFORM');
 const r=await exec('/usr/bin/sw_vers',['-buildVersion'],{env:env(),timeout:5000,maxBuffer:1024});
 if(r.stdout.trim()!=='24G830')fail('SEP_INSTALL_PLATFORM');
}
async function directory(path){
 if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||path==='/'||/[\x00-\x1f\x7f\\]/.test(path))fail('SEP_INSTALL_PATH');
 let s;try{s=await lstat(path,{bigint:true});if(!s.isDirectory()||s.isSymbolicLink()||await realpath(path)!==path)fail('SEP_INSTALL_PATH');}
 catch(e){if(e.code==='SEP_INSTALL_PATH')throw e;fail('SEP_INSTALL_PATH');}
 return s;
}
async function absent(path,code){try{await lstat(path);fail(code);}catch(e){if(e.code!=='ENOENT')throw e;}}
async function dataAbsent(path){
 if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||path==='/'||/[\x00-\x1f\x7f\\]/.test(path))fail('SEP_INSTALL_PATH');
 await absent(path,'SEP_INSTALL_DATA_EXISTS');
 // Missing final components are allowed; every existing ancestor must be real.
 let p=dirname(path);for(;;){try{await directory(p);break;}catch(e){if(p==='/')throw e;try{await lstat(p);}catch(x){if(x.code==='ENOENT'){p=dirname(p);continue;}}throw e;}}
}
async function fileHash(path){
 const before=await lstat(path,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||await realpath(path)!==path)fail('SEP_INSTALL_FILE_CHANGED');
 const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW),d=createHash('sha256');
 try{if(version(before)!==version(await h.stat({bigint:true})))fail('SEP_INSTALL_FILE_CHANGED');for await(const b of h.createReadStream({autoClose:false}))d.update(b);if(version(before)!==version(await h.stat({bigint:true}))||version(before)!==version(await lstat(path,{bigint:true})))fail('SEP_INSTALL_FILE_CHANGED');return d.digest('hex');}
 finally{await h.close();}
}
async function verifyApp(path,receipt){
 if(!exact(receipt,['inventory','programSha256','bootstrapSha256'])||!digest(receipt.programSha256)||!digest(receipt.bootstrapSha256))fail('SEP_INSTALL_MANIFEST');
 try{await verifyPackage(path,receipt.inventory);}catch{fail('SEP_INSTALL_SOURCE_CHANGED');}
 try{
  const contents=join(path,'Contents'),programPath=join(contents,'Resources/PROGRAM.json'),bootstrapPath=join(contents,'Resources/BOOTSTRAP.json');
  if(await fileHash(programPath)!==receipt.programSha256||await fileHash(bootstrapPath)!==receipt.bootstrapSha256)fail('SEP_INSTALL_MANIFEST');
  const program=await loadProgram(programPath,receipt.programSha256);if(program.schema.schema!==4)fail('SEP_INSTALL_MANIFEST');
  const b=await readFile(bootstrapPath);if(b.length>1048576||sha(b)!==receipt.bootstrapSha256)fail('SEP_INSTALL_MANIFEST');
  const actual=validateBootstrapManifest(JSON.parse(b)),built=await buildBootstrapManifest(contents);
  if(JSON.stringify(actual)!==JSON.stringify(built)||actual.program.sha256!==receipt.programSha256)fail('SEP_INSTALL_MANIFEST');
 }catch{fail('SEP_INSTALL_MANIFEST');}
 try{await exec('/usr/bin/codesign',['--verify','--deep','--strict',path],{env:env(),timeout:30000,maxBuffer:65536});}catch{fail('SEP_INSTALL_SIGNATURE');}
 await verifyPackage(path,receipt.inventory).catch(()=>fail('SEP_INSTALL_SOURCE_CHANGED'));
}
function sealed(value){const p={...value};delete p.planHash;return sha(JSON.stringify(p));}
function validatePlan(plan){
 if(!exact(plan,['schema','kind','transactionId','sourceApp','sourceIdentity','parent','parentIdentity','dataRoot','receipt','helperSha256','planHash'])||plan.schema!==1||plan.kind!=='first-install'||!/^[a-f0-9]{32}$/.test(plan.transactionId??'')||!digest(plan.helperSha256)||!digest(plan.planHash)||plan.planHash!==sealed(plan)||!/^\d+:\d+$/.test(plan.sourceIdentity??'')||!/^\d+:\d+$/.test(plan.parentIdentity??''))fail('SEP_INSTALL_PLAN');
 return JSON.parse(JSON.stringify(plan));
}
async function checkParent(plan){if(id(await directory(plan.parent))!==plan.parentIdentity)fail('SEP_INSTALL_PATH_CHANGED');}
async function checkSource(plan){try{if(id(await directory(plan.sourceApp))!==plan.sourceIdentity)fail('SEP_INSTALL_SOURCE_CHANGED');await verifyApp(plan.sourceApp,plan.receipt);}catch(e){if(e.code==='SEP_INSTALL_SIGNATURE'||e.code==='SEP_INSTALL_MANIFEST')throw e;fail('SEP_INSTALL_SOURCE_CHANGED');}}
async function helperIdentity(path,expected){
 if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||!digest(expected))fail('SEP_INSTALL_HELPER');
 if(await fileHash(path)!==expected)fail('SEP_INSTALL_HELPER');
 const s=await lstat(path);if(!(s.mode&0o111)||(s.mode&0o022)||s.uid!==process.getuid())fail('SEP_INSTALL_HELPER');
}
function bounded(promise,ms,code){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(error(code)),ms);})]).finally(()=>clearTimeout(timer));}
async function coordinator(plan,helperPath,helperSha256){
 if(helperSha256!==plan.helperSha256)fail('SEP_INSTALL_HELPER');await helperIdentity(helperPath,helperSha256);await checkParent(plan);
 const child=spawn(helperPath,[plan.parent,plan.transactionId,plan.parentIdentity],{env:env(),stdio:['pipe','pipe','pipe']});
 let buffer='',ended=false,spawnFailure,waiter,exit,stderrBytes=0;
 const queue=[];
 const deliver=()=>{if(waiter&&queue.length){const w=waiter;waiter=undefined;w.resolve(queue.shift());}else if(waiter&&ended){const w=waiter;waiter=undefined;w.reject(spawnFailure??error('SEP_INSTALL_HELPER_EXIT'));}};
 child.stdin.on('error',()=>{});
 child.stdout.on('data',b=>{buffer+=b;if(buffer.length>2100000){spawnFailure=error('SEP_INSTALL_PROTOCOL');child.stdin.end();ended=true;deliver();return;}let n;while((n=buffer.indexOf('\n'))>=0){const row=buffer.slice(0,n);buffer=buffer.slice(n+1);queue.push(row);if(queue.length>2){spawnFailure=error('SEP_INSTALL_PROTOCOL');ended=true;child.stdin.end();break;}}deliver();});
 child.stderr.on('data',b=>{stderrBytes+=b.length;if(stderrBytes>65536){spawnFailure=error('SEP_INSTALL_PROTOCOL');child.stdin.end();}});
 child.on('error',e=>{spawnFailure=error(e.code==='ENOENT'?'SEP_INSTALL_HELPER':'SEP_INSTALL_HELPER_START');});
 const closed=new Promise(resolveClose=>child.once('close',(code,signal)=>{exit={code,signal};ended=true;deliver();resolveClose(exit);}));
 async function response(){
  const row=await bounded(new Promise((resolveRow,reject)=>{if(waiter)return reject(error('SEP_INSTALL_PROTOCOL'));waiter={resolve:resolveRow,reject};deliver();}),900000,'SEP_INSTALL_HELPER_DEADLINE');
  if(spawnFailure)throw spawnFailure;const fields=row.split('\t');if(fields[0]==='ERR'&&fields.length===2&&/^SEP_INSTALL_[A-Z_]+$/.test(fields[1]))fail(fields[1]);if(fields[0]!=='OK')fail('SEP_INSTALL_PROTOCOL');return fields.slice(1);
 }
 async function close(){
  child.stdin.end();const result=await bounded(closed,15000,'SEP_INSTALL_CLEANUP_UNCONFIRMED');
  if(result.signal||![0,70].includes(result.code)||spawnFailure)fail('SEP_INSTALL_CLEANUP_UNCONFIRMED');
  return {status:'pass',resourcesReleased:true};
 }
 try{const first=await response();if(first.length!==1||first[0]!=='ready')fail('SEP_INSTALL_PROTOCOL');await helperIdentity(helperPath,helperSha256);}
 catch(e){try{await close();}catch{fail('SEP_INSTALL_CLEANUP_UNCONFIRMED');}throw e;}
 return {async command(name,...fields){if(ended||exit)fail('SEP_INSTALL_HELPER_EXIT');const frame=[name,...fields].join('\t')+'\n';if(Buffer.byteLength(frame)>2097152||fields.some(v=>typeof v!=='string'||/[\r\n\t]/.test(v)))fail('SEP_INSTALL_PROTOCOL');child.stdin.write(frame);return response();},close};
}
const hex=s=>Buffer.from(s).toString('hex');
const phases=['copying','verified','publish-intent','published','committed'];
function stateEnvelope(state){const content=JSON.stringify(state);return JSON.stringify({schema:1,content,sha256:sha(content)});}
function stateRead(text,plan){
 try{const e=JSON.parse(text);if(!exact(e,['schema','content','sha256'])||e.schema!==1||typeof e.content!=='string'||sha(e.content)!==e.sha256)fail('SEP_INSTALL_JOURNAL');const s=JSON.parse(e.content);if(!exact(s,['schema','planHash','phase','stageIdentity'])||s.schema!==1||s.planHash!==plan.planHash||!phases.includes(s.phase)||!(s.stageIdentity===null||/^\d+:\d+$/.test(s.stageIdentity))||(s.phase!=='copying'&&s.stageIdentity===null))fail('SEP_INSTALL_JOURNAL');return s;}catch{fail('SEP_INSTALL_JOURNAL');}
}
async function inspected(native,plan){const r=await native.command('INSPECT');if(r.length!==3||!/^(-|other|\d+:\d+)$/.test(r[0])||!/^(-|other|\d+:\d+)$/.test(r[1])||r[2]==='-'||!/^[a-f0-9]+$/.test(r[2])||r[2].length%2)fail('SEP_INSTALL_JOURNAL');return {staged:r[0],target:r[1],state:stateRead(Buffer.from(r[2],'hex').toString(),plan)};}
async function record(native,plan,phase,stageIdentity){const value={schema:1,planHash:plan.planHash,phase,stageIdentity};await native.command('STATE',hex(stateEnvelope(value)));return value;}
async function progress(callback,phase){if(callback!==undefined){if(typeof callback!=='function')fail('SEP_INSTALL_CALLBACK');await callback(Object.freeze({phase}));}}
async function finish(native,plan,state,onProgress){
 let view=await inspected(native,plan);
 if(view.state.phase!==state.phase||view.state.stageIdentity!==state.stageIdentity)fail('SEP_INSTALL_JOURNAL');
 if(view.target!=='-'){
  if(view.target!==state.stageIdentity||view.staged!=='-'||!['publish-intent','published','committed'].includes(state.phase))fail('SEP_INSTALL_TARGET_EXISTS');
 }else{
  if(!['verified','publish-intent'].includes(state.phase)||view.staged!==state.stageIdentity)fail('SEP_INSTALL_JOURNAL');
  await dataAbsent(plan.dataRoot);await checkSource(plan);await verifyApp(stage(plan),plan.receipt);await checkParent(plan);
  state=await record(native,plan,'publish-intent',state.stageIdentity);await native.command('PUBLISH',state.stageIdentity);
  state=await record(native,plan,'published',state.stageIdentity);await progress(onProgress,'published');
 }
 await verifyApp(target(plan),plan.receipt);view=await inspected(native,plan);if(view.target!==state.stageIdentity||view.staged!=='-')fail('SEP_INSTALL_JOURNAL');
 await record(native,plan,'committed',state.stageIdentity);await progress(onProgress,'committed');
 return {status:'pass',phase:'committed',transactionId:plan.transactionId,planHash:plan.planHash,target:target(plan),applicationStarted:false};
}
async function usingNative(plan,options,work){const native=await coordinator(plan,options.helperPath,options.helperSha256);let result,primary;try{result=await work(native);}catch(e){primary=e;}try{await native.close();}catch(e){throw error('SEP_INSTALL_CLEANUP_UNCONFIRMED');}if(primary)throw primary;return result;}
export async function prepareFirstInstall(input){
 await platform();if(!exact(input,['sourceApp','parent','dataRoot','receipt','helperPath','helperSha256']))fail('SEP_INSTALL_ARGUMENT');
 const parent=await directory(input.parent);if(parent.uid!==BigInt(process.getuid())||(parent.mode&0o022n)!==0n)fail('SEP_INSTALL_PATH');
 await absent(join(input.parent,'DSH SEP.app'),'SEP_INSTALL_TARGET_EXISTS');await dataAbsent(input.dataRoot);
 const source=await directory(input.sourceApp);await helperIdentity(input.helperPath,input.helperSha256);await verifyApp(input.sourceApp,input.receipt);
 const plan={schema:1,kind:'first-install',transactionId:randomBytes(16).toString('hex'),sourceApp:input.sourceApp,sourceIdentity:id(source),parent:input.parent,parentIdentity:id(parent),dataRoot:input.dataRoot,receipt:JSON.parse(JSON.stringify(input.receipt)),helperSha256:input.helperSha256};
 plan.planHash=sealed(plan);return Object.freeze(plan);
}
export async function executeFirstInstall(options){
 await platform();if(!exact(options,['plan','helperPath','helperSha256',...options.onProgress!==undefined?['onProgress']:[]]))fail('SEP_INSTALL_ARGUMENT');
 const plan=validatePlan(options.plan);await checkParent(plan);await absent(target(plan),'SEP_INSTALL_TARGET_EXISTS');await dataAbsent(plan.dataRoot);await checkSource(plan);
 return usingNative(plan,options,async native=>{
  await absent(target(plan),'SEP_INSTALL_TARGET_EXISTS');await dataAbsent(plan.dataRoot);await checkSource(plan);
  await native.command('NEW');await record(native,plan,'copying',null);await progress(options.onProgress,'copying');
  const copy=await native.command('COPY',hex(plan.sourceApp),plan.sourceIdentity);if(copy.length!==1||!/^\d+:\d+$/.test(copy[0]))fail('SEP_INSTALL_PROTOCOL');
  await checkSource(plan);await verifyApp(stage(plan),plan.receipt);
  const state=await record(native,plan,'verified',copy[0]);await progress(options.onProgress,'verified');return finish(native,plan,state,options.onProgress);
 });
}
export async function recoverFirstInstall(options){
 await platform();if(!exact(options,['plan','helperPath','helperSha256',...options.onProgress!==undefined?['onProgress']:[]]))fail('SEP_INSTALL_ARGUMENT');
 const plan=validatePlan(options.plan);return usingNative(plan,options,async native=>{await native.command('OPEN');const view=await inspected(native,plan);if(view.state.phase==='copying')fail('SEP_INSTALL_RECOVERY_BLOCKED');return finish(native,plan,view.state,options.onProgress);});
}
