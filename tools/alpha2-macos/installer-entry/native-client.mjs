import {spawn} from 'node:child_process';
import {error,fail,env,helperIdentity} from './candidate.mjs';
import {createLineDecoder} from './boundaries.mjs';

const MAX=33554432,FRAME=MAX*2+256;
export function bounded(p,ms,code){let t;return Promise.race([p,new Promise((_,reject)=>{t=setTimeout(()=>reject(error(code)),ms);})]).finally(()=>clearTimeout(t));}
const prefix=home=>home===undefined?[]:['--test-home',home];
async function started(helper,args){
 await helperIdentity(helper);
 const child=spawn(helper.path,args,{env:env(),stdio:['pipe','pipe','pipe']});let failure,exit,waiter,ended=false,stderrBytes=0;const queue=[],decoder=createLineDecoder(FRAME);
 function deliver(){if(waiter&&queue.length){const w=waiter;waiter=undefined;w.resolve(queue.shift());}else if(waiter&&ended){const w=waiter;waiter=undefined;w.reject(failure??error('SEP_INSTALLER_HELPER_EXIT'));}}
 child.stdin.on('error',()=>{});
 child.stdout.on('data',b=>{try{queue.push(...decoder.push(b));if(queue.length>2)throw error('SEP_INSTALLER_PROTOCOL');}catch{failure=error('SEP_INSTALLER_PROTOCOL');child.stdin.end();ended=true;}deliver();});
 child.stderr.on('data',b=>{stderrBytes+=b.length;if(stderrBytes>65536){failure=error('SEP_INSTALLER_PROTOCOL');child.stdin.end();}});
 child.on('error',()=>{failure=error('SEP_INSTALLER_HELPER_START');});
 const closed=new Promise(resolve=>child.once('close',(code,signal)=>{exit={code,signal};ended=true;deliver();resolve(exit);}));
 const response=()=>bounded(new Promise((resolve,reject)=>{if(waiter)return reject(error('SEP_INSTALLER_PROTOCOL'));waiter={resolve,reject};deliver();}),120000,'SEP_INSTALLER_HELPER_DEADLINE');
 async function close(){child.stdin.end();const r=await bounded(closed,15000,'SEP_INSTALLER_CLEANUP_UNCONFIRMED');if(r.signal||![0,70].includes(r.code)||failure)fail('SEP_INSTALLER_CLEANUP_UNCONFIRMED');return {status:'pass',resourcesReleased:true};}
 return {child,response,close,async command(name,...fields){if(ended||exit)fail('SEP_INSTALLER_HELPER_EXIT');if(fields.some(s=>typeof s!=='string'||/[\r\n\t]/.test(s)))fail('SEP_INSTALLER_PROTOCOL');const frame=[name,...fields].join('\t')+'\n';if(Buffer.byteLength(frame)>FRAME)fail('SEP_INSTALLER_PROTOCOL');child.stdin.write(frame);return parse(await response());}};
}
function parse(row){const a=row.split('\t');if(a.length===2&&a[0]==='ERR'&&/^SEP_INSTALLER_[A-Z_]+$/.test(a[1]))fail(a[1]);if(a[0]!=='OK')fail('SEP_INSTALLER_PROTOCOL');return a.slice(1);}
export async function inspectAccount(helper,home){
 const p=await started(helper,[...prefix(home),'inspect']);let primary,result;
 try{const row=await p.response();if(row.startsWith('ERR\t'))parse(row);result=JSON.parse(row);await helperIdentity(helper);}catch(e){primary=e;}
 await p.close();if(primary)throw primary;return result;
}
export async function openJournal(helper,home,transactionId,createSnapshot){
 const p=await started(helper,[...prefix(home),'session',transactionId]);
 try{
  const first=parse(await p.response());if(first.length!==1||first[0]!=='ready')fail('SEP_INSTALLER_PROTOCOL');await helperIdentity(helper);
  if(createSnapshot!==undefined)await p.command('BEGIN',Buffer.from(JSON.stringify(createSnapshot)).toString('hex'));else await p.command('OPEN');
 }catch(e){await p.close();throw e;}
 return {close:p.close,async read(key){const r=await p.command('READ',key);if(r.length!==1)fail('SEP_INSTALLER_PROTOCOL');if(r[0]==='-')return null;if(r[0].length%2||r[0].length>MAX*2||!/^[a-f0-9]+$/.test(r[0]))fail('SEP_INSTALLER_PROTOCOL');return Buffer.from(r[0],'hex').toString('utf8');},async write(key,text){if(typeof text!=='string'||Buffer.byteLength(text)>MAX)fail('SEP_INSTALLER_LIMIT');const r=await p.command('WRITE',key,Buffer.from(text).toString('hex'));if(r.length)fail('SEP_INSTALLER_PROTOCOL');}};
}
