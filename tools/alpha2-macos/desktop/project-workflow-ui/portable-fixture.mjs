// Portable test boundary: real workflow adapter; only underlying project I/O is synthetic.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {openHostBridge,createMainBridge} from './bridge.mjs';
export const binding={programSha256:'a'.repeat(64),ownerGeneration:'b'.repeat(32),nonce:'c'.repeat(64)};
export const planHash='d'.repeat(64);
export const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
export async function fixture({confirm,omissions=false,body='changed\n',holdCommit,holdClose,rpcFilter}={}){
 const base=process.env.SEP_UI_TEST_ROOT;assert(base&&isAbsolute(base));await mkdir(base,{recursive:true});const source=await mkdtemp(join(base,'ui-'));
 const stopped=defer(),entered=defer();let commits=0,generation=1,closed=false;
 const inspection={plan:{planHash,kind:'edit',baseGeneration:1,baseSequence:0,baseSha256:'1'.repeat(64),targetSha256:'2'.repeat(64)},changes:[{path:'a.txt',kind:'modified'}],diff:[{path:'a.txt',before:'old\n',after:body}],coverage:{omitted:omissions?[{path:'image.png',reason:'binary'}]:[],textComplete:!omissions}};
 const controller={status:()=>({needsSelection:false,hasPendingPlan:true}),current:async()=>({generation,sequence:generation-1}),plans:async()=>[{planHash,kind:'edit',createdAt:1,expired:false,changes:inspection.changes}],resume:async()=>({status:'pass'}),review:async()=>({planHash}),commit:async()=>{commits++;entered.resolve();if(holdCommit)await holdCommit.promise;generation++;return {status:'committed',generation,sequence:generation-1};},discard:async()=>({status:'pass'}),restore:async()=>({planHash}),recover:async()=>({status:'pass'}),close:async()=>{if(holdClose)return {status:'blocked',resourcesConfirmedReleased:false};closed=true;const r={status:'pass',resourcesConfirmedReleased:true};stopped.resolve(r);return r;},whenClosed:()=>stopped.promise};
 const project={inspectPlan:async()=>structuredClone(inspection),listGenerations:async()=>({items:[{generation}],nextAfter:null})};
 const host=await openHostBridge({binding,source,controller,project,closeDeadlineMs:25});
 const frame={url:'dsh-app://app/index.html'},webContents={mainFrame:frame},window={id:17,webContents,isDestroyed:()=>false,isVisible:()=>true};
 const event={sender:webContents,senderFrame:frame};let confirms=0;
 const main=createMainBridge({rpc:{request:(method,payload)=>rpcFilter?rpcFilter(method,payload,()=>host.request(method,payload)):host.request(method,payload)},getWindow:()=>window,binding,confirmNative:async input=>{confirms++;return confirm?confirm(input):{accepted:true,omissionsAcknowledged:omissions};}});
 return {host,main,window,event,source,entered,inspection,get commits(){return commits;},get confirms(){return confirms;},get generation(){return generation;},get closed(){return closed;},async review(){await main.begin(event);const r=await main.call(event,'review',{planHash});await main.presented(event,{reviewId:r.reviewId,reviewSha256:r.reviewSha256});return r;},async cleanup(){main.closeAdmission();const r=await host.close();if(!holdClose)assert.equal(r.resourcesConfirmedReleased,true);return r;}};
}
