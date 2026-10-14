// Test only: one native project, one Profile and one host-private workflow.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {openWorkflowProject} from '../../project-workflow/project-factory.mjs';
import {wrapManagedProject} from '../../project-workflow/derived-lifecycle.mjs';
import {createControlledFileProfile} from '../../profile/controlled-files.mjs';
import {openHostBridge} from './host.mjs';
import {binding} from './portable-fixture.mjs';
import {sha,fail} from './rules.mjs';
export async function nativeFixture(){
 if(process.platform!=='darwin'||process.arch!=='arm64')fail('SEP_MAC_NATIVE_REQUIRED');
 const base=process.env.SEP_UI_TEST_ROOT,helperPath=process.env.SEP_MAC_TREE_HELPER,helperSha256=process.env.SEP_MAC_TREE_HELPER_SHA256;
 assert(base&&isAbsolute(base)&&helperPath&&isAbsolute(helperPath));assert.equal(sha(await readFile(helperPath)),helperSha256);
 await mkdir(base,{recursive:true,mode:0o700});const parent=await mkdtemp(join(base,'native-ui-')),root=join(parent,'managed'),source=join(parent,'source');
 await mkdir(root,{mode:0o700});await mkdir(source,{mode:0o700});await writeFile(join(source,'a.txt'),'original\n',{mode:0o600});
 let project,profile,host;
 try{
  project=wrapManagedProject(await openWorkflowProject({root,source,helperPath,helperSha256}),{closeDeadlineMs:5000});
  const exec={signal:new AbortController().signal},callers=new WeakSet([exec]);
  profile=await createControlledFileProfile({project,source,closeDeadlineMs:5000,authorize:async value=>{if(!callers.has(value))fail('SEP_MAC_AGENT_SCOPE');return {sessionId:'ui-native-test',depth:0,cwd:source};}});
  host=await openHostBridge({binding,source,controller:profile.controller,project});
  return {host,async stage(text='changed\n'){await profile.execute('read',{file_path:'a.txt'},exec);await profile.execute('write',{file_path:'a.txt',content:text},exec);const plans=await profile.controller.plans();assert.equal(plans.length,1);return plans[0].planHash;},async observe(){const current=await project.current();return {generation:current.generation,text:await readFile(join(current.path,'a.txt'),'utf8'),original:await readFile(join(source,'a.txt'),'utf8')};}};
 }catch(e){const receipt=host?await host.close():profile?await profile.controller.close():project?await project.close():{status:'pass',resourcesConfirmedReleased:true};if(receipt.resourcesConfirmedReleased!==true)fail('SEP_PROJECT_UI_FIXTURE_CLEANUP_BLOCKED');throw e;}
}
