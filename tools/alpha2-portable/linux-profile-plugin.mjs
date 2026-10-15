// Dedicated Linux cold-start composition. The controller is a local trusted
// capability; no model tool can publish, restore, clean up, or spawn on the host.
import {openManagedProject} from './managed-project.mjs';
import {load} from './host-modules.mjs';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {LinuxReadOnlyFiles} from './linux-filesystem.mjs';
const {defineTool}=await load('@deepseek-ai/dsh-tools'),{HarnessError}=await load('@deepseek-ai/dsh-llm');
const {delegationDepthOf}=await load('@deepseek-ai/dsh-subagent');
const fail=code=>{throw new HarnessError(code,code);};
const names=['read','write','edit','bash','mcp_call'];
const mcpClient=await readFile(new URL('./mcp-stdio-client.py',import.meta.url),'utf8');
export const name='sep-linux-controlled-profile';
export const inject=['tools','agents'];
function path(value){if(typeof value!=='string'||value.length>2048||value.startsWith('/')||value.includes('\\')||value.includes('\0')||value.split('/').some(x=>!x||x==='.'||x==='..'))fail('FS_PATH_OUTSIDE');return value;}
const python="import sys,json,pathlib,hashlib\nv=json.loads(sys.argv[1]);p=pathlib.Path('/work')/v['path']\nif v['op']=='read':\n try:b=p.read_bytes()\n except FileNotFoundError:\n  assert p.parent.is_dir();print(json.dumps({'exists':False,'version':'absent'}))\n else:\n  assert len(b)<=32768;print(json.dumps({'text':b.decode('utf-8'),'version':hashlib.sha256(b).hexdigest()}))\nelse:\n b=p.read_bytes() if p.exists() else None\n assert v['version']==(hashlib.sha256(b).hexdigest() if b is not None else 'absent')\n if v['op']=='edit':\n  s=b.decode('utf-8');assert s.count(v['old'])==1;s=s.replace(v['old'],v['content'])\n else:s=v['content']\n p.write_text(s);print(json.dumps({'updated':True}))";
export async function apply(ctx,config){
 for(const key of ['fs','subprocess','jobs','mcp','sepLinuxProfile'])if(ctx.get(key)!==undefined)fail('SEP_LINUX_PROFILE_CONFLICT');
 for(const key of names)if(ctx.tools.get(key))fail('SEP_LINUX_PROFILE_CONFLICT');
 const project=await openManagedProject({root:config.root,source:config.source,isolation:config.isolation,onEvent:config.onEvent});
 let closed=false,tail=Promise.resolve(),pendingPlan,closing,needsSelection=(await project.plans()).length>0;const abort=new AbortController(),observations=new Map(),governedTools=new Map();
 const guard=()=>{if(closed)fail('SEP_LINUX_PROFILE_CLOSED');};
 const serial=work=>{guard();const next=tail.then(()=>{guard();return work();});tail=next.catch(()=>{});return next;};
 const execute=(kind,args,exec)=>serial(async()=>{
  if(needsSelection)fail('SEP_LINUX_RESTART_REVIEW_REQUIRED');
  const agent=exec.agent,depth=delegationDepthOf(agent);if(resolve(agent.session.header.cwd)!==resolve(config.source))fail('SEP_LINUX_AGENT_SCOPE');
  const readonly=depth>0||kind==='read'||kind==='mcp_call';if(depth>1)fail('SEP_LINUX_CHILD_DEPTH');if(depth>0&&['write','edit'].includes(kind))fail('SEP_LINUX_CHILD_READONLY');
  const key=agent.session.id+':'+(args.file_path??'');let command,input='';
  if(['read','write','edit'].includes(kind)){
   const filename=path(args.file_path);let version=observations.get(key);
   if(kind!=='read'&&!version)fail('FS_NOT_OBSERVED');if(kind==='edit'&&version==='absent')fail('FS_NOT_FOUND');
   command=['/usr/bin/python3','-c',python,JSON.stringify({op:kind,path:filename,version,content:args.content??args.new_string,old:args.old_string})];
  }else if(kind==='bash'){
   if(typeof args.command!=='string'||args.command.length>8192)fail('SEP_LINUX_INPUT');command=['/usr/bin/sh','-c',args.command];
  }else{
   const server=config.servers?.[args.server];if(!server||!Object.hasOwn(config.servers,args.server))fail('SEP_LINUX_MCP_UNKNOWN');
   if(!Array.isArray(server.command)||server.command.length<1||server.command.length>32||!server.command.every(x=>typeof x==='string'&&x.length<8192&&!x.includes('\0'))||!server.command[0].startsWith('/usr/bin/'))fail('SEP_LINUX_MCP_CONFIG');
   command=['/usr/bin/python3','-c',mcpClient,JSON.stringify(server.command),JSON.stringify({name:args.name,arguments:args.arguments})];
  }
  const result=await project.run({command,input,signal:AbortSignal.any([exec.signal,abort.signal]),basePlanHash:pendingPlan,readOnly:readonly,reportOutput:true});
  if(!['ready','read'].includes(result.status))fail(result.status==='blocked'?'SEP_PROJECT_CLEANUP_BLOCKED':result.reason==='cancelled'?'SEP_LINUX_CANCELLED':'SEP_LINUX_TOOL_FAILED');
  let value;
  try{if(kind==='mcp_call'){const rows=result.output.trim().split('\n').map(x=>JSON.parse(x)),init=rows.find(x=>x.id===0);value=rows.find(x=>x.id===1);if(rows.length!==2||init?.result?.protocolVersion!=='2024-11-05'||value?.jsonrpc!=='2.0'||!Object.hasOwn(value,'result')||value.error)fail('SEP_LINUX_MCP_PROTOCOL');}else value=kind==='bash'?{text:result.output}:JSON.parse(result.output);}
  catch(error){if(result.planHash)await project.discard(result.planHash);fail('SEP_LINUX_TOOL_OUTPUT_INVALID');}
  if(result.planHash){const old=pendingPlan;pendingPlan=result.planHash;observations.clear();if(old)await project.discard(old);}
  if(kind==='read')observations.set(key,value.version);
  return value;
 });
 const params={read:{file_path:{type:'string',required:true}},write:{file_path:{type:'string',required:true},content:{type:'string',required:true}},edit:{file_path:{type:'string',required:true},old_string:{type:'string',required:true},new_string:{type:'string',required:true}},bash:{command:{type:'string',required:true}},mcp_call:{server:{type:'string',required:true},name:{type:'string',required:true},arguments:{type:'object',required:true}}};
 params.mcp_call.arguments.additionalProperties=true;params.mcp_call.arguments.properties={};
 try{
  for(const kind of names)ctx.tools.register(defineTool({name:kind,description:'SEP Linux controlled '+kind+'; unpublished changes stay in an isolated work copy.',parameters:params[kind],output:{schema:{type:'json'},render:(_a,value)=>[{type:'text',text:JSON.stringify(value)}]},execute:(args,exec)=>execute(kind,args,exec)}));
  // Dedicated host: reject every unowned tool, including providers mounted later.
  ctx.on('tools/pre-execute',(exec,next)=>{if(!names.includes(exec.name)&&governedTools.get(exec.name)!==ctx.tools.get(exec.name,exec.agent))fail('SEP_LINUX_UNCONTROLLED_TOOL');return next();});
  const service={
   async current(){guard();return project.current();},
   // Trusted composition capability only. Large parser I/O never changes the
   // native Bash/MCP limits, and the source/work mounts remain read-only.
   parseContext({code,input,signal}){return serial(async()=>{
    if(needsSelection)fail('SEP_LINUX_RESTART_REVIEW_REQUIRED');
    const result=await project.run({command:['/usr/bin/python3','-I','-B','-c',code],input,signal:AbortSignal.any([abort.signal,...signal?[signal]:[]]),basePlanHash:pendingPlan,readOnly:true,reportOutput:true,timeoutMs:10000,maxInputBytes:10*1024*1024,maxOutputBytes:12*1024*1024});
    if(result.status==='read')return result.output;
    if(result.status==='blocked')fail('SEP_PROJECT_CLEANUP_BLOCKED');
    if(result.reason==='cancelled')fail('CONTEXT_CANCELLED');if(result.reason==='timeout')fail('CONTEXT_TIMEOUT');if(result.reason==='output-limit')fail('CONTEXT_OUTPUT_LIMIT');
    fail(/^CONTEXT_[A-Z_]{1,72}$/.test(result.diagnostic??'')?result.diagnostic:'CONTEXT_PARSER_FAILED');
   });},
   // Same-process composition capability. No tool or RPC exposes this grant.
   authorizeTools(definitions){guard();for(const tool of definitions){if(!tool?.name?.startsWith('suite_')||governedTools.has(tool.name)||ctx.tools.get(tool.name)!==tool)fail('SEP_LINUX_TOOL_OWNER');}for(const tool of definitions)governedTools.set(tool.name,tool);return()=>{for(const tool of definitions)if(governedTools.get(tool.name)===tool)governedTools.delete(tool.name);};},
   bindDocumentAuthority(input){return serial(async()=>{const result=await project.bindDocumentAuthority(input);const plans=await project.plans();if(pendingPlan&&!plans.some(p=>p.planHash===pendingPlan))pendingPlan=undefined;needsSelection=!pendingPlan&&plans.length>0;observations.clear();return result;});},
   withView(work){return serial(async()=>{if(needsSelection)fail('SEP_LINUX_RESTART_REVIEW_REQUIRED');return work(await project.view(pendingPlan),{
    review:path=>project.reviewDocument(path),
    async delete(input){config.onEvent?.('document-authority-accepted');const result=await project.deleteDocument(input);pendingPlan=undefined;needsSelection=false;observations.clear();return result;},
   });});},
   plans(){return serial(()=>project.plans());},
   resume({planHash}={}){return serial(async()=>{if(pendingPlan)fail('SEP_PROJECT_BUSY');await project.view(planHash);if(!planHash)fail('SEP_PROJECT_PLAN_INVALID');pendingPlan=planHash;needsSelection=false;observations.clear();return {status:'pass',planHash};});},
   review(){return serial(()=>{if(!pendingPlan)fail('SEP_PROJECT_PLAN_INVALID');return project.review(pendingPlan);});},
   commit({planHash}={}){return serial(async()=>{if(planHash!==pendingPlan)fail('SEP_PROJECT_STALE_PLAN');const result=await project.commit({planHash});pendingPlan=undefined;observations.clear();return result;});},
   discard(planHash){return serial(async()=>{await project.discard(planHash);if(planHash===pendingPlan)pendingPlan=undefined;needsSelection=!pendingPlan&&(await project.plans()).length>0;observations.clear();});},
   restore(generation){return serial(async()=>{if(pendingPlan)fail('SEP_PROJECT_BUSY');const result=await project.planRestore(generation);pendingPlan=result.planHash;return result;});},
   reviewCleanup(){return serial(()=>project.reviewCleanup());},resolveCleanup(input){return serial(()=>project.resolveCleanup(input));},
   recover(){return serial(()=>project.recover());},
   close(){return closing??=(async()=>{closed=true;abort.abort();await tail;return project.close();})();}
  };
  ctx.provide('sepLinuxProfile',service);ctx.effect(()=>()=>service.close());
  new LinuxReadOnlyFiles(ctx,{source:config.source,view:()=>serial(()=>project.view(pendingPlan))});
 }catch(error){await project.close();throw error;}
}
