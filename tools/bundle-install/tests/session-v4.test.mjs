import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {realpath} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const require=createRequire(join(resolve(process.env.SEP_OFFICIAL_HARNESS),'package.json'));
const root=await realpath(dirname(require.resolve('dsh-sep-bundle/package.json')));
async function adapter(){try{return await import(pathToFileURL(join(root,'bundle/lib/session-v4.js')));}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')assert.fail('SEP_BUNDLE_V4_REVIEW_MISSING');throw error;}}
const header={type:'session',version:4,id:'synthetic-session',createdAt:1,isSeeded:false,delegationDepth:0};
const change={schema:1,taskId:'00000000-0000-4000-8000-000000000001',revision:1,sessionId:'synthetic-session',agentId:'synthetic-session',project:'synthetic-project',action:'create',objective:'Durable synthetic task',steps:[{id:'write',description:'Write output',acceptance:'Hash matches',artifacts:[{path:'out.txt',sha256:'a'.repeat(64)}]}]};
const event={type:'task/checkpoint-change',seq:0,time:1,data:change};

test('V4 reader retains required SEP task events without replaying effects or modifying input',async()=>{
  const {reviewSepV4Session}=await adapter(),before=JSON.stringify({header,event});
  const review=reviewSepV4Session(header,[event]);
  assert.equal(review.execution,'none');assert.equal(review.sourceModified,false);assert.equal(review.persisted,false);
  assert.equal(review.extensionEvents,1);assert.deepEqual(review.artifact.events,[event]);
  assert.equal(review.artifact.header.version,4);assert.equal(review.artifact.header.id,'synthetic-session');
  assert.ok(Object.isFrozen(review.artifact.events[0].data));assert.notEqual(review.artifact.events[0].data,change);
  assert.equal(JSON.stringify({header,event}),before);
});

test('V4 reader retains native dense event coordinates around SEP task events',async()=>{
  const {reviewSepV4Session}=await adapter();const {Session,SessionId}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-session')));
  const {createUserMessage}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-llm')));
  const session=Session.create(SessionId('synthetic-session'));
  session.append('user/message',createUserMessage({content:[{type:'text',text:'first'}],source:{kind:'user'}}),{surfaceOp:'append'});
  session.append('task/checkpoint-change',change);
  session.append('user/message',createUserMessage({content:[{type:'text',text:'second'}],source:{kind:'user'}}),{surfaceOp:'append'});
  const review=reviewSepV4Session(header,session.snapshotEvents());
  assert.deepEqual(review.artifact.events.map(row=>row.seq),[0,1,2]);
  assert.deepEqual(review.artifact.events.map(row=>row.type),['user/message','task/checkpoint-change','user/message']);
  assert.equal(review.extensionEvents,1);
});

test('V4 reader rejects invalid SEP schema, revision transitions and requiredness',async()=>{
  const {reviewSepV4Session}=await adapter();
  for(const row of [{...event,ignorable:true},{...event,data:{...change,revision:2}},{...event,data:{...change,extra:true}}])assert.throws(()=>reviewSepV4Session(header,[row]),{code:'SEP_BUNDLE_SESSION_INVALID'});
  const cancel={type:'task/checkpoint-change',seq:1,time:2,data:{schema:1,taskId:change.taskId,revision:3,sessionId:change.sessionId,agentId:change.agentId,project:change.project,action:'cancel'}};
  assert.throws(()=>reviewSepV4Session(header,[event,cancel]),{code:'SEP_BUNDLE_SESSION_INVALID'});
});

test('V4 reader does not treat foreign-session task records as this session authority',async()=>{
  const {reviewSepV4Session}=await adapter();const foreign={...event,data:{...change,sessionId:'another-session',agentId:'another-session'}};
  assert.throws(()=>reviewSepV4Session(header,[foreign]),{code:'SEP_BUNDLE_SESSION_INVALID'});
});

test('V4 reader preserves classified recovery linkage and refuses changing its ignorable marker',async()=>{
  const {reviewSepV4Session}=await adapter();const row={type:'recovery/continuation',seq:0,time:1,ignorable:true,data:{recoveryFromTaskId:'prior',recoveryPlanHash:'b'.repeat(64),recoveryRequestId:'request',recoveryProjectId:'00000000-0000-4000-8000-000000000002',recoveryProjectGeneration:1}};
  const review=reviewSepV4Session(header,[row]);assert.deepEqual(review.artifact.events,[row]);
  assert.throws(()=>reviewSepV4Session(header,[{...row,ignorable:false}]),{code:'SEP_BUNDLE_SESSION_INVALID'});
});

test('V4 reader keeps native unknown-event and header guards and does not silently migrate older versions',async()=>{
  const {reviewSepV4Session}=await adapter();
  assert.throws(()=>reviewSepV4Session(header,[{type:'foreign/required',seq:0,time:1,data:null}]),{code:'SEP_BUNDLE_SESSION_INVALID'});
  assert.throws(()=>reviewSepV4Session({...header,extra:true},[]),{code:'SEP_BUNDLE_SESSION_INVALID'});
  assert.throws(()=>reviewSepV4Session(header,[{...event,seq:2}]),{code:'SEP_BUNDLE_SESSION_INVALID'});
  assert.throws(()=>reviewSepV4Session({...header,version:3},[]),{code:'SEP_BUNDLE_SESSION_VERSION_UNSUPPORTED'});
});

test('V4 reader bounds malformed inputs and returns errors without private content',async()=>{
  const {reviewSepV4Session}=await adapter();const secret='synthetic-private-message';
  const bad={...event,data:{...change,objective:secret,extra:secret}};
  assert.throws(()=>reviewSepV4Session(header,[bad]),error=>error.code==='SEP_BUNDLE_SESSION_INVALID'&&!JSON.stringify(error).includes(secret)&&!String(error).includes(secret));
  assert.throws(()=>reviewSepV4Session(header,null),{code:'SEP_BUNDLE_SESSION_INVALID'});
  assert.throws(()=>reviewSepV4Session(header,[{...event,data:'x'.repeat(16*1024*1024)}]),{code:'SEP_BUNDLE_SESSION_INPUT_LIMIT'});
  assert.throws(()=>reviewSepV4Session(header,[{...event,data:{...change,objective:()=> 'lost'}}]),{code:'SEP_BUNDLE_SESSION_INVALID'});
});

test('V4 reader refuses seeded SEP extensions without guessing parent ownership but accepts a native-only fork',async()=>{
  const {reviewSepV4Session}=await adapter();
  const {releasedV4SessionFormatCodec}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-session-format-v3-to-v4')));
  const logical={version:4,id:'synthetic-session',createdAt:1,isSeeded:true,delegationDepth:0,parentSession:'prior'};
  const physical=releasedV4SessionFormatCodec.encodeHeader(logical,1);
  const first={type:'user/message',seq:0,time:1,surfaceOp:'append',data:{id:'first',role:'user',content:[{type:'text',text:'inherited'}],source:{kind:'user'}}};
  const marker={type:'session/end-seed',seq:1,time:2,data:{inherited:true}};
  assert.equal(reviewSepV4Session(physical,[first,marker]).artifact.inheritedEventCount,1);
  assert.throws(()=>reviewSepV4Session(physical,[first,marker,{...event,seq:2,time:3}]),{code:'SEP_BUNDLE_SESSION_INHERITED_EXTENSION_UNSUPPORTED'});
});

test('V4 reader retains native image projection validation instead of accepting an invalid offload event',async()=>{
  const {reviewSepV4Session}=await adapter();
  const first={type:'user/message',seq:0,time:1,surfaceOp:'append',data:{id:'first',role:'user',content:[{type:'text',text:'no image'}],source:{kind:'user'}}};
  const offload={type:'image/offload',seq:1,time:2,data:{targets:[{seq:0,imageIndexes:[0]}]}};
  assert.throws(()=>reviewSepV4Session(header,[first,offload]),{code:'SEP_BUNDLE_SESSION_INVALID'});
});
