#!/usr/bin/env node
import {open,readFile,lstat} from 'node:fs/promises';
import {resolve,join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';

const reject=code=>{throw Object.assign(new Error(code),{code});};
const key=path=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path);
const help={usage:'node src/document-cli.js --config ABSOLUTE_SUITE_JSON --project ABSOLUTE_PROJECT ACTION [OPTIONS]',
  actions:{preview:'--path RELATIVE_DOCUMENT [--delete-source]',confirm:'--plan-id ID --plan-hash SHA256 --accept-permanent-delete [--accept-source-delete]',status:'--plan-id ID',resume:'--plan-id ID --plan-hash SHA256 --accept-permanent-delete [--accept-source-delete]'},
  host:'--host-library ABSOLUTE_DEEPSEEK_LIBRARY_ROOT (optional; otherwise DSH_LIBRARY_ROOT or the installed Windows host)',
  scope:'DSH SEP（DSH系统增强套件） uses the existing governed store exclusively. Close the Profile using this store first. This CLI does not initialize, steal locks, start agents, or call a model.'};
function argumentsOf(argv){
  if(argv.length===1&&argv[0]==='--help')return {help:true};
  const values=new Set(['--config','--project','--path','--plan-id','--plan-hash','--host-library']),flags=new Set(['--delete-source','--accept-permanent-delete','--accept-source-delete']);
  const options={};let action;
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(values.has(arg)||flags.has(arg)){
      if(Object.hasOwn(options,arg))reject('DOCUMENT_CLI_ARGUMENTS');
      if(flags.has(arg))options[arg]=true;
      else{const value=argv[++i];if(typeof value!=='string'||!value||value.startsWith('--')||value.length>4096||/[\r\n\0]/.test(value))reject('DOCUMENT_CLI_ARGUMENTS');options[arg]=value;}
    }else if(['preview','confirm','status','resume'].includes(arg)&&!action)action=arg;
    else reject('DOCUMENT_CLI_ARGUMENTS');
  }
  if(!action||!isAbsolute(options['--config']??'')||!isAbsolute(options['--project']??'')||options['--host-library']&&!isAbsolute(options['--host-library']))reject('DOCUMENT_CLI_ARGUMENTS');
  const allowed=new Set(['--config','--project','--host-library',...(action==='preview'?['--path','--delete-source']:action==='status'?['--plan-id']:['--plan-id','--plan-hash','--accept-permanent-delete','--accept-source-delete'])]);
  if(Object.keys(options).some(name=>!allowed.has(name)))reject('DOCUMENT_CLI_ARGUMENTS');
  if(action==='preview'?!options['--path']:!options['--plan-id'])reject('DOCUMENT_CLI_ARGUMENTS');
  if(options['--plan-hash']&&!/^[a-f0-9]{64}$/.test(options['--plan-hash']))reject('DOCUMENT_CLI_ARGUMENTS');
  if(['confirm','resume'].includes(action)){
    if(!options['--plan-hash'])reject('DOCUMENT_CLI_ARGUMENTS');
    if(!options['--accept-permanent-delete'])reject('DOCUMENT_CONFIRMATION_REQUIRED');
  }
  return {action,options};
}
async function configuration(path){
  const maximum=256*1024;let handle;
  try{
    const identity=await lstat(path);if(!identity.isFile()||identity.isSymbolicLink()||identity.nlink!==1||identity.size>maximum)reject('DOCUMENT_CLI_CONFIG');
    handle=await open(path,'r');const before=await handle.stat({bigint:true});
    const buffer=Buffer.alloc(maximum+1);let offset=0;
    while(offset<buffer.length){const {bytesRead}=await handle.read(buffer,offset,buffer.length-offset,offset);if(!bytesRead)break;offset+=bytesRead;}
    const after=await handle.stat({bigint:true});if(offset>maximum||before.ino!==after.ino||before.mtimeNs!==after.mtimeNs||before.size!==after.size)reject('DOCUMENT_CLI_CONFIG');
    const bytes=buffer.subarray(0,offset),config=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));return {bytes,config};
  }catch{reject('DOCUMENT_CLI_CONFIG');}finally{await handle?.close();}
}
async function main(argv){
  const parsed=argumentsOf(argv);if(parsed.help)return help;
  const {options:o,action}=parsed,{bytes,config:raw}=await configuration(o['--config']);
  if(raw?.recovery?.enabled===true)reject('RECOVERY_MAINTENANCE_REQUIRED');
  if(raw?.enabled!==true||raw.p2?.enabled!==true||!isAbsolute(raw.p2.storageRoot??''))reject('DOCUMENT_P2_REQUIRED');
  if(!Array.isArray(raw.projects)||!raw.projects.some(p=>typeof p?.root==='string'&&isAbsolute(p.root)&&key(p.root)===key(o['--project'])))reject('DOCUMENT_PROJECT_UNAUTHORIZED');
  // Imports occur only after CLI authorization/configuration preflight. These
  // are the same suite managers and native storage backend as the chat tool.
  const [{validateSuiteConfig},{openControl},{bindStorage},{Scope},{createDocumentManager}]=await Promise.all([
    import('./index.js'),import('./p2/control.js'),import('./p2/storage.js'),import('./scope.js'),import('./documents.js')]);
  let config;try{config=validateSuiteConfig(raw);}catch{reject('DOCUMENT_CLI_CONFIG');}
  const library=o['--host-library']??process.env.DSH_LIBRARY_ROOT??join(process.env.USERPROFILE??'','Documents/DeepSeek Harness/resources/host/node_modules/@deepseek-ai');
  if(!isAbsolute(library))reject('DOCUMENT_CLI_HOST');
  const load=name=>import(pathToFileURL(join(library,name,'lib/index.js')).href);
  let control,ctx;
  try{
    control=await openControl({storageRoot:config.p2.storageRoot,recoverDocumentDeletion:true});
    if(!(await readFile(o['--config'])).equals(bytes))reject('DOCUMENT_CONFIG_CHANGED');
    await control.recoverDocumentDeletions();
    const {Context}=await load('cordis');ctx=new Context();
    for(const [name,settings]of [['dsh-fs-local',{}],['dsh-storage',{}],['dsh-storage-json',{root:config.p2.storageRoot}],['dsh-storage-domain',{backend:'json'}]]){
      const plugin=await load(name);await ctx.plugin(plugin.default??plugin,settings);
    }
    const scope=new Scope(ctx.fs,config.projects);await scope.init();
    const facility=await bindStorage({facility:ctx.storageDomain,storageRoot:config.p2.storageRoot,control});
    const messageId=randomUUID(),planHash=o['--plan-hash'];
    const message=['confirm','resume'].includes(action)?`确认永久删除计划 ${planHash}${o['--accept-source-delete']?'，同时删除原文件':''}`:'预览或查询文档删除计划';
    const exec={callId:randomUUID(),signal:new AbortController().signal,agent:{session:{header:{cwd:o['--project'],id:'document-cli-'+randomUUID()},events:[{type:'turn/start',data:{turn:1}},{type:'user/message',data:{id:messageId,role:'user',source:{kind:'user'},content:[{type:'text',text:message}]}}]}}};
    const project=await scope.caller(exec),manager=createDocumentManager({scope,control,facility});
    const args=action==='preview'?{action,path:o['--path'],deleteSource:o['--delete-source']===true}:{action,planId:o['--plan-id'],...planHash?{planHash}:{}};
    return await manager.execute(project,args,exec);
  }finally{
    // Drain each owner even when an earlier resource close reports a failure.
    const results=[];for(const close of [()=>ctx?.fiber.dispose(),()=>control?.close()])try{await close();}catch(error){results.push(error);}
    if(results.length)throw results[0];
  }
}
try{
  const result=await main(process.argv.slice(2));process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(result.status==='pending'||result.cleanup?.complete===false)process.exitCode=2;
}catch(error){
  // Filesystem, JSON and native errors can include a document body or a path.
  const code=typeof error.code==='string'&&/^(?:DOCUMENT_|P2_|RECOVERY_MAINTENANCE_REQUIRED|UNAUTHORIZED|NOT_FOUND|SOURCE_CHANGED)[A-Z0-9_]*$/.test(error.code)?error.code:'DOCUMENT_CLI_IO';
  process.stdout.write(JSON.stringify({status:'error',code})+'\n');process.exitCode=1;
}
