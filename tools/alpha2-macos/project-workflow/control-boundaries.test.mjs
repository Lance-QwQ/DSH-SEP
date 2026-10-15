import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {openProjectWorkflow} from './workflow-adapter.mjs';
const fixed='a'.repeat(64),other='b'.repeat(64);
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function fixture({plans=[],consume,commit,closeDeadlineMs=20}={}){
 const root=process.env.SEP_MAC_WORKFLOW_UNIT_ROOT;assert.ok(root&&isAbsolute(root));await mkdir(root,{recursive:true});const source=await mkdtemp(join(root,'control-'));
 const stopped=deferred(),entered=deferred();let count=0;
 const context=Object.freeze({}),approval=Object.freeze({});
 const inspection={plan:{planHash:fixed,kind:'edit',baseGeneration:1,baseSequence:0,baseSha256:other,targetSha256:fixed},changes:[],diff:[],coverage:{omitted:[],textComplete:true}};
 const controller={status:()=>({needsSelection:false,hasPendingPlan:true}),current:async()=>({generation:1,sequence:0}),plans:async()=>plans,resume:async()=>{},review:async()=>({planHash:fixed}),commit:async()=>{count++;entered.resolve();return commit?commit():{status:'committed'};},discard:async()=>{},restore:async()=>{},recover:async()=>{},close:async()=>{const r={status:'pass',resourcesConfirmedReleased:true};stopped.resolve(r);return r;},whenClosed:()=>stopped.promise};
 const project={inspectPlan:async()=>structuredClone(inspection),listGenerations:async()=>({items:[],nextAfter:null})};
 const authority={assertDocument:async ctx=>{assert.equal(ctx,context);return {windowId:'window',documentGeneration:'document',ownerGeneration:'owner'};},consumeConfirmation:async token=>{assert.equal(token,approval);return consume?consume():{accepted:true};}};
 const workflow=await openProjectWorkflow({projectId:'current',ownerGeneration:'owner',source,controller,project,authority,closeDeadlineMs});
 return {workflow,context,entered,get count(){return count;},async input(){const r=await workflow.review({planHash:fixed},context);return {reviewId:r.reviewId,planHash:fixed,approval};}};
}
test('plan listing rejects an over-limit change array before returning any list',async()=>{
 const f=await fixture({plans:[{planHash:fixed,kind:'edit',changes:Array.from({length:257},(_,i)=>({path:`file-${i}`,kind:'modified'}))}]});
 try{await assert.rejects(f.workflow.plans({},f.context),{code:'SEP_MAC_WORKFLOW_REVIEW_LIMIT'});}finally{await f.workflow.close();}
});
test('plan listing bounds the aggregate UTF-8 JSON response even for many valid plans',async()=>{
 const changes=Array.from({length:64},(_,i)=>({path:`${'中'.repeat(500)}-${i}`,kind:'modified'}));
 const f=await fixture({plans:Array.from({length:4},()=>({planHash:fixed,kind:'edit',createdAt:1,expired:false,changes}))});
 try{await assert.rejects(f.workflow.plans({},f.context),{code:'SEP_MAC_WORKFLOW_REVIEW_LIMIT'});}finally{await f.workflow.close();}
});
test('cancel during asynchronous approval consumption prevents dispatch and requires fresh review',async()=>{
 const consuming=deferred(),release=deferred();const f=await fixture({consume:async()=>{consuming.resolve();await release.promise;return {accepted:true};}}),input=await f.input();
 const action=f.workflow.commit(input,f.context);const rejection=assert.rejects(action,{code:'SEP_MAC_WORKFLOW_APPROVAL_STALE'});
 await consuming.promise;assert.equal((await f.workflow.cancel({reviewId:input.reviewId},f.context)).status,'pass');release.resolve();await rejection;assert.equal(f.count,0);await f.workflow.close();
});
test('close during consumed approval blocks until its callback settles and never dispatches',async()=>{
 const consuming=deferred(),release=deferred();const f=await fixture({consume:async()=>{consuming.resolve();await release.promise;return {accepted:true};}}),input=await f.input();
 const action=f.workflow.commit(input,f.context);const rejection=assert.rejects(action,{code:'SEP_MAC_WORKFLOW_CLOSED'});
 await consuming.promise;const receipt=await f.workflow.close();assert.equal(receipt.status,'blocked');assert.equal(receipt.resourcesConfirmedReleased,false);release.resolve();await rejection;
 assert.equal(f.count,0);assert.equal((await f.workflow.whenClosed()).status,'pass');
});
test('cancellation after commit dispatch reports in-flight instead of claiming rollback',async()=>{
 const release=deferred();const f=await fixture({commit:()=>release.promise}),input=await f.input(),action=f.workflow.commit(input,f.context);
 await f.entered.promise;await assert.rejects(f.workflow.cancel({reviewId:input.reviewId},f.context),{code:'SEP_MAC_WORKFLOW_COMMIT_IN_FLIGHT'});
 release.resolve({status:'committed'});assert.equal((await action).status,'committed');assert.equal(f.count,1);await f.workflow.close();
});
