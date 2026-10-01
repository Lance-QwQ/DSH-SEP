import {open,realpath,lstat} from 'node:fs/promises';
import {isAbsolute,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

export const name='dsh-sep-context-preparation';
export const inject=['tools','agents'];
const fail=code=>{throw Error(code);};
const inside=(root,cwd)=>{const p=relative(root,cwd);return p===''||p!=='..'&&!p.startsWith('..\\')&&!p.startsWith('../')&&!isAbsolute(p);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fields=(x,keys)=>object(x)&&Object.keys(x).every(k=>keys.includes(k));
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_.-]{1,128}$/.test(x);
const parameters={type:'object',properties:{snapshotId:{type:'string'},seeds:{type:'array',items:{type:'string'}},roots:{type:'array',items:{type:'object',properties:{path:{type:'string'},symbol:{type:'string'}},required:['path','symbol'],additionalProperties:false}}},required:['snapshotId','seeds','roots'],additionalProperties:false};

async function loadSnapshot(config){
 if(!fields(config,['id','projectId','root','path','sha256'])||!id(config.id)||!id(config.projectId)||!isAbsolute(config.root??'')||!isAbsolute(config.path??'')||!/^[a-f0-9]{64}$/.test(config.sha256??''))fail('CONTEXT_CONFIG');
 const root=await realpath(config.root),path=await realpath(config.path);
 if(resolve(root).toLowerCase()!==resolve(config.root).toLowerCase()||resolve(path).toLowerCase()!==resolve(config.path).toLowerCase())fail('CONTEXT_CANONICAL_PATH');
 const st=await lstat(path);if(!st.isFile()||st.nlink!==1||st.size>10*1024*1024)fail('CONTEXT_SNAPSHOT_FILE');
 const f=await open(path,'r');let raw;
 try{const before=await f.stat();if(!before.isFile()||before.nlink!==1||before.size>10*1024*1024)fail('CONTEXT_SNAPSHOT_FILE');
  raw=Buffer.alloc(before.size);let used=0;while(used<raw.length){const r=await f.read(raw,used,raw.length-used,null);if(!r.bytesRead)fail('CONTEXT_SNAPSHOT_CHANGED');used+=r.bytesRead;}
  const after=await f.stat();if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||hash(raw)!==config.sha256)fail('CONTEXT_SNAPSHOT_HASH');
 }finally{await f.close();}
 const input=JSON.parse(raw.toString('utf8'));
 if(!fields(input,['visibility','task','files'])||input.visibility!=='public'||!fields(input.task,['instance_id','repo','base_commit','problem_statement'])||Object.keys(input.task).length!==4||!Object.values(input.task).every(s=>typeof s==='string')||!/^[a-f0-9]{40}$/.test(input.task.base_commit)||!object(input.files))fail('CONTEXT_PUBLIC_SNAPSHOT_REQUIRED');
 if(Buffer.byteLength(JSON.stringify(input.task))>128*1024)fail('CONTEXT_TASK_LIMIT');
 return {...config,root,input};
}

function parse(python,payload,signal){
 signal.throwIfAborted();
 const data=Buffer.from(JSON.stringify(payload));if(data.length>10*1024*1024)fail('CONTEXT_INPUT_LIMIT');
 return new Promise((yes,no)=>{
  const child=spawn(python,['-I','-B',fileURLToPath(new URL('./context_resolver.py',import.meta.url))],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  let error=null,size=0,stderrSize=0;const chunks=[];let stderr='';
  const stop=code=>{error??=Error(code);child.kill();};
  const abort=()=>stop('CONTEXT_CANCELLED');signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
  const timer=setTimeout(()=>stop('CONTEXT_TIMEOUT'),10000);
  child.on('error',()=>{error??=Error('CONTEXT_PYTHON_START');});
  child.stdin.on('error',()=>{error??=Error('CONTEXT_PYTHON_INPUT');});
  child.stdout.on('data',b=>{size+=b.length;if(size>12*1024*1024)stop('CONTEXT_OUTPUT_LIMIT');else if(!error)chunks.push(b);});
  child.stderr.on('data',b=>{stderrSize+=b.length;if(stderrSize>4096)stop('CONTEXT_DIAGNOSTIC_LIMIT');else stderr+=b.toString('utf8');});
  child.on('close',code=>{
   clearTimeout(timer);signal.removeEventListener('abort',abort);
   if(signal.aborted)error??=Error('CONTEXT_CANCELLED');
   if(error)return no(error);
   if(code!==0)return no(Error(/^CONTEXT_[A-Z_]+$/.test(stderr)?stderr:'CONTEXT_PARSER_FAILED'));
   try{yes(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{no(Error('CONTEXT_PARSER_RESPONSE'));}
  });
  child.stdin.end(data);
 });
}

export async function apply(ctx,config={}){
 if(!fields(config,['enabled','python','snapshots'])||typeof config.enabled!=='boolean')fail('CONTEXT_CONFIG');
 if(!config.enabled)return;
 if(!isAbsolute(config.python??'')||!Array.isArray(config.snapshots)||!config.snapshots.length||config.snapshots.length>16)fail('CONTEXT_CONFIG');
 const python=await realpath(config.python),snapshots=[];
 for(const c of config.snapshots){const s=await loadSnapshot(c);if(snapshots.some(x=>x.id===s.id||(x.projectId!==s.projectId&&(inside(x.root,s.root)||inside(s.root,x.root)))))fail('CONTEXT_OVERLAPPING_SCOPE');snapshots.push(s);}
 const lifetime=new AbortController();let active=null;
 ctx.effect(()=>async()=>{lifetime.abort();await active?.catch(()=>{});});
 ctx.tools.register({name:'suite_context_prepare',description:'Prepare untrusted public Python source context from a configured immutable snapshot. Follows only static named inheritance and imports needed by those bases; reports unresolved dependencies. Does not execute code, call models, modify files or run evaluation.',parameters,
  output:{schema:{type:'object'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},timeoutMs:15000,
  async execute(args,exec){
   if(active)fail('CONTEXT_BUSY');
   const operation=async()=>{
    const signal=AbortSignal.any([lifetime.signal,...(exec.signal?[exec.signal]:[])]);signal.throwIfAborted();
    if(!fields(args,['snapshotId','seeds','roots'])||!id(args.snapshotId)||!Array.isArray(args.seeds)||!Array.isArray(args.roots))fail('CONTEXT_ARGS');
    const s=snapshots.find(x=>x.id===args.snapshotId),session=exec.agent?.session;
    if(!s||!session||ctx.agents.get(session.header.id)?.session!==session||session.header.origin==='subagent'||!isAbsolute(session.header.cwd??''))fail('CONTEXT_SCOPE');
    const cwd=await realpath(session.header.cwd);if(!inside(s.root,cwd)||await realpath(s.root)!==s.root)fail('CONTEXT_SCOPE');
    const result=await parse(python,{files:s.input.files,seeds:args.seeds,roots:args.roots},signal);
    signal.throwIfAborted();
    if(ctx.agents.get(session.header.id)?.session!==session||!inside(s.root,await realpath(session.header.cwd))||await realpath(s.root)!==s.root)fail('CONTEXT_SCOPE_CHANGED');
    return {...result,task:s.input.task,snapshotId:s.id,snapshotSha256:s.sha256,projectId:s.projectId,trust:'untrusted_public_source',evaluation:'not_run'};
   };
   active=Promise.resolve().then(operation);
   try{return await active;}finally{active=null;}
  }
 });
}
