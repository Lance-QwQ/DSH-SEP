// Observer of the real desktop Loader and sandbox service; no model request.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {load} from './host-modules.mjs';
const {SessionId}=await load('@deepseek-ai/dsh-session'),{ToolCallId}=await load('@deepseek-ai/dsh-llm');
export async function verify(ctx,source){
 const ledger=join(process.env.SEP_BUNDLE_TEST_ROOT,'sep-budget/ledger.json'),before=JSON.parse(await readFile(ledger)),a=(await ctx.agents.create({sessionId:SessionId('desktop-context-'+process.env.SEP_DESKTOP_CONTINUATION),meta:{cwd:source,delegationDepth:0},agentOptions:{}})).agent;
 const result=await ctx.tools.execute({name:'suite_context_prepare',arguments:{snapshotId:'desktop-public',seeds:['child.py'],roots:[{path:'child.py',symbol:'Child'}]},agent:a,signal:new AbortController().signal,callId:ToolCallId('desktop-context-probe')});
 assert.equal(result.isError,false,JSON.stringify(result.error));assert.equal(result.value.status,'pass');assert.deepEqual(result.value.added,['base.py']);assert.equal(result.value.trust,'untrusted_public_source');assert.equal(ctx.sepLinuxRuntime.status().context,'sandboxed-static-public-snapshots');assert.deepEqual(JSON.parse(await readFile(ledger)),before);assert.deepEqual(await ctx.sepLinuxProfile.plans(),[]);
 return {status:'pass',path:'real desktop Loader → suite_context_prepare → readonly Bubblewrap → frozen AST parser',added:result.value.added,snapshotSha256:result.value.snapshotSha256,ledgerUnchanged:true,modelRequests:0};
}
