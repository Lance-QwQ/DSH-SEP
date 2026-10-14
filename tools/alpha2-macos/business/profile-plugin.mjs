import {createControlledFileProfile} from '../profile/controlled-files.mjs';
import {openGovernedMacManagedProject} from '../lifecycle/managed-project-lifecycle.mjs';
import {load} from './host-modules.mjs';
import {MacReadOnlyFiles} from './readonly-files.mjs';
const {defineTool}=await load('@deepseek-ai/dsh-tools'),{HarnessError}=await load('@deepseek-ai/dsh-llm'),{delegationDepthOf}=await load('@deepseek-ai/dsh-subagent');
const fail=code=>{throw new HarnessError(code,code);};
const params={read:{file_path:{type:'string',required:true}},write:{file_path:{type:'string',required:true},content:{type:'string',required:true}},edit:{file_path:{type:'string',required:true},old_string:{type:'string',required:true},new_string:{type:'string',required:true}},bash:{command:{type:'string',required:true}},mcp_call:{server:{type:'string',required:true},name:{type:'string',required:true},arguments:{type:'object',properties:{},additionalProperties:true,required:true}}};
export function createProfilePlugin(openProject){return {name:'sep-mac-controlled-profile',inject:['tools','agents'],async apply(ctx,config){
 for(const key of ['fs','subprocess','jobs','mcp','sepMacProfile'])if(ctx.get(key)!==undefined)fail('SEP_MAC_PROFILE_CONFLICT');
 for(const key of Object.keys(params))if(ctx.tools.get(key))fail('SEP_MAC_PROFILE_CONFLICT');
 const project=await openProject(config);let profile;
 try{profile=await createControlledFileProfile({project,source:config.source,authorize:async exec=>{const agent=exec?.agent;if(!agent||ctx.agents.get(agent.id)!==agent||agent.session.header.cwd!==config.source)fail('SEP_MAC_AGENT_SCOPE');return {sessionId:agent.session.id,cwd:ctx.get('workingDirectory')?.get(agent.session),depth:delegationDepthOf(agent)};}});
  const grants=new Map(),owned=new Map();
  for(const [kind,parameters]of Object.entries(params)){const definition=defineTool({name:kind,description:'SEP macOS controlled '+kind+'; file changes remain staged until direct controller approval. Shell and MCP are unavailable in this profile.',parameters,output:{schema:{type:'json'},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]},async execute(args,exec){try{return await profile.execute(kind,args,exec);}catch(e){if(/^(SEP|FS)_[A-Z0-9_]{1,90}$/.test(e.code??''))fail(e.code);throw e;}}});ctx.tools.register(definition);owned.set(kind,ctx.tools.get(kind));}
  ctx.on('tools/pre-execute',(exec,next)=>{const actual=ctx.tools.get(exec.name,exec.agent);if((owned.get(exec.name)??grants.get(exec.name))!==actual||!actual)fail('SEP_MAC_UNCONTROLLED_TOOL');return next();});
  const controller=profile.controller,service=Object.freeze({...controller,withView:controller.withDocumentView,authorizeTools(definitions){if(!controller.status().admissionOpen)fail('SEP_MAC_PROFILE_CLOSED');for(const tool of definitions)if(!tool?.name?.startsWith('suite_')||grants.has(tool.name)||ctx.tools.get(tool.name)!==tool)fail('SEP_MAC_TOOL_OWNER');for(const tool of definitions)grants.set(tool.name,tool);return()=>{for(const tool of definitions)if(grants.get(tool.name)===tool)grants.delete(tool.name);};}});
  ctx.provide('sepMacProfile',service);ctx.effect(()=>()=>controller.close());new MacReadOnlyFiles(ctx,{source:config.source,withView:controller.withView});
 }catch(e){await (profile?.controller.close()??project.close());throw e;}
}};}
const plugin=createProfilePlugin(input=>openGovernedMacManagedProject(input));
export const {name,inject,apply}=plugin;
