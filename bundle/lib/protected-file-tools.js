import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import z from '@deepseek-ai/schemastery';
import {FsError} from '@deepseek-ai/dsh-fs';
import * as NativeObservationPolicy from '@deepseek-ai/dsh-fs-observation-policy';
import * as NativeFileTools from '@deepseek-ai/dsh-tool-fs';
import SepProtectedFileSystem from './file-protection.js';

const require=createRequire(import.meta.url);
const fail=code=>{throw new FsError(code,code);};
export const name='dsh-sep-protected-file-tools';
export const inject=['tools','systemPrompt','recoveryHost'];
export const Config=z.object({files:SepProtectedFileSystem.Config.required(),tools:NativeFileTools.Config.default({})});

// This stricter provider belongs only to the explicit model-tool composition.
// The standalone file API retains its native explicit unconditional contract.
class GuardRequiredFiles extends SepProtectedFileSystem{
 async governed(policy,work){
  if(!this.ctx.get('sandboxPolicy'))fail('SEP_FS_SANDBOX_REQUIRED');
  return super.governed(policy,work);
 }
 async writeText(target,content,expected,signal,policy){
  if(expected?.kind!=='createIfAbsent'&&(expected?.kind!=='replaceIfVersion'||typeof expected?.version!=='string'||!expected.version))fail('FS_NOT_OBSERVED');
  return super.writeText(target,content,expected,signal,policy);
 }
 async editText(target,edit,expected,signal,policy){
  if(expected?.version===undefined)fail('FS_NOT_OBSERVED');
  return super.editText(target,edit,expected,signal,policy);
 }
}

/** An explicit file-tools Profile fragment, not full SEP activation. Existing
 * providers/tools are never replaced. Configuration names one registered root;
 * the host owns sandbox policy and approval. No paid model or Shell is started. */
export async function apply(ctx,config){
 if(!ctx.get('sandboxPolicy'))fail('SEP_FS_SANDBOX_REQUIRED');
 if(ctx.get('fs'))fail('SEP_FS_PROVIDER_CONFLICT');
 for(const tool of ['read','write','edit','read_image'])if(ctx.tools.get(tool))fail('SEP_FS_TOOL_CONFLICT');
 for(const peer of ['@deepseek-ai/dsh-fs-observation-policy','@deepseek-ai/dsh-tool-fs','@deepseek-ai/dsh-sandbox-policy']){
  let version;try{version=JSON.parse(readFileSync(require.resolve(peer+'/package.json'),'utf8')).version;}catch{fail('SEP_FS_HOST_UNSUPPORTED');}
  if(version!=='0.2.1-alpha.1')fail('SEP_FS_HOST_UNSUPPORTED');
 }
 const children=[];
 try{
  for(const [plugin,options] of [[GuardRequiredFiles,config.files],[NativeObservationPolicy,{}],[NativeFileTools,config.tools]]){
   const fiber=ctx.plugin(plugin,options);children.push(fiber);await fiber;
  }
 }catch(error){
  for(const fiber of children.reverse())await fiber.dispose();
  throw error;
 }
}
