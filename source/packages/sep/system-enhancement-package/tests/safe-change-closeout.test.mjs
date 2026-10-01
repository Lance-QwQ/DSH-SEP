import test from 'node:test';
import assert from 'node:assert/strict';
let createSafeChangeCloseout;
try { ({createSafeChangeCloseout}=await import('../src/sep-safe-change/closeout.js')); }
catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const sha='a'.repeat(64),changed='b'.repeat(64);
function fixture(){
 const events=[{type:'turn/start',data:{turn:1}}],session={header:{id:'session'},snapshotEvents:()=>structuredClone(events),append(type,data,options){events.push({type,data:structuredClone(data),options});}};
 const agent={session,inject(){assert.fail('closeout must not spend an extra model call');},steer(){assert.fail('closeout must not spend an extra model call');}};
 assert.equal(typeof createSafeChangeCloseout,'function','SEP must supply deterministic structured closeout');
 return {events,agent,closeout:createSafeChangeCloseout({clock:()=>1000})};
}
function plan(overrides={}){return {id:'plan',path:'app.js',revision:1,candidateSha256:sha,status:'verified',expiresAt:5000,validation:{revision:1,candidateSha256:sha,status:'not_run',publishEligible:true,results:[{kind:'syntax',category:'syntax',format:'javascript',status:'pass',pass:true},{kind:'contains',category:'text',status:'pass',pass:true},{kind:'runtime',category:'runtime',status:'not_run',pass:null,reason:'SC_RUNTIME_NOT_CONFIGURED'}]},...overrides};}
function record(f,result,args={action:'verify',id:'plan'}){return f.closeout.record({agent:f.agent,args,result});}

test('declared checks pass while runtime coverage remains absent, even after publication',()=>{
 const f=fixture();record(f,plan());const summary=record(f,{id:'plan',path:'app.js',status:'committed',candidateSha256:sha,mutationId:'native-1'},{action:'publish',id:'plan'});
 assert.deepEqual(summary.counts,{pass:2,fail:0,skipped:0,not_covered:1});
 assert.equal(summary.acceptance,'not_established');assert.equal(summary.candidates[0].publication,'committed');assert.equal(summary.candidates[0].publishEligible,true);
});
test('staging a new revision invalidates the old successful evidence',()=>{
 const f=fixture();record(f,plan());const summary=record(f,plan({revision:2,candidateSha256:changed,status:'staged',validation:null}),{action:'stage',id:'plan',content:'PRIVATE_BODY'});
 assert.deepEqual(summary.counts,{pass:0,fail:0,skipped:0,not_covered:3});assert.equal(summary.candidates[0].evidenceCurrent,false);assert.equal(summary.candidates[0].publishEligible,false);
});
test('candidate digest and revision must both match verification evidence',()=>{
 for(const mismatch of [{revision:2},{candidateSha256:changed}]){const f=fixture();const summary=record(f,plan(mismatch));assert.equal(summary.counts.pass,0);assert.equal(summary.candidates[0].evidenceCurrent,false);}
});
test('earlier failed and blocked checks survive in turn history after a fresh passing verification',()=>{
 const f=fixture();const failed=plan({validation:{revision:1,candidateSha256:sha,publishEligible:false,results:[{kind:'syntax',category:'syntax',status:'blocked',pass:null,reason:'SC_SYNTAX_UNAVAILABLE'},{kind:'contains',category:'text',status:'fail',pass:false},{kind:'runtime',category:'runtime',status:'not_run',pass:null,reason:'SC_RUNTIME_NOT_CONFIGURED'}]}});
 record(f,failed);const summary=record(f,plan());assert.equal(summary.counts.pass,2);assert.deepEqual(summary.history.map(e=>e.status),['blocked','fail']);
});
test('cancelled and expired plans cannot retain live passing evidence',()=>{
 const f=fixture();record(f,plan());assert.equal(record(f,{id:'plan',status:'cancelled'},{action:'cancel',id:'plan'}).candidates.length,0);
 const expired=record(f,plan({expiresAt:999}));assert.equal(expired.candidates.length,0);assert.equal(expired.counts.pass,0);assert.ok(expired.history.some(e=>e.code==='SC_PLAN_GONE'));
});
test('review file bodies, declared values, and error messages never enter closeout',()=>{
 const f=fixture();const result=plan({before:'PRIVATE_BEFORE',after:'PRIVATE_AFTER',checks:[{kind:'contains',value:'PRIVATE_CHECK'}]});record(f,result,{action:'review',id:'plan'});
 const summary=f.closeout.recordError({agent:f.agent,args:{action:'publish',id:'plan'},error:Object.assign(new Error('PRIVATE_ERROR'),{code:'SC_CONFIRMATION_REQUIRED'})});
 assert.doesNotMatch(JSON.stringify(summary),/PRIVATE_/);assert.equal(summary.history.at(-1).code,'SC_CONFIRMATION_REQUIRED');assert.equal(summary.acceptance,'not_established');
});
test('closeout returns independent metadata and emits one durable notice without waking the model',()=>{
 const f=fixture(),result=plan();const summary=record(f,result);summary.candidates[0].checks[0].status='fail';result.validation.results[0].status='fail';
 f.closeout.stop({agent:f.agent,turn:1,signal:new AbortController().signal});f.closeout.stop({agent:f.agent,turn:1,signal:new AbortController().signal});
 const notices=f.events.filter(e=>e.type==='user/message');assert.equal(notices.length,1);assert.equal(notices[0].data.source.kind,'plugin:sep-safe-change');assert.equal(notices[0].data.source.form,'notice');assert.match(notices[0].data.source.summary,/通过 2.*失败 0.*跳过 0.*未覆盖 1/);
 assert.deepEqual(JSON.parse(notices[0].data.content[0].text).safeChangeCloseout.counts,{pass:2,fail:0,skipped:0,not_covered:1});
});
test('ordinary turns and unrelated tool errors do not create a closeout notice',()=>{
 const f=fixture();f.events.push({type:'tool/result',data:{message:{isError:true,name:'Shell',content:[{type:'text',text:'failed'}]}}});f.closeout.stop({agent:f.agent,turn:1,signal:new AbortController().signal});assert.equal(f.events.length,2);
 record(f,plan());f.closeout.stop({agent:f.agent,turn:1,signal:new AbortController().signal});f.events.push({type:'turn/start',data:{turn:2}});f.closeout.stop({agent:f.agent,turn:2,signal:new AbortController().signal});assert.equal(f.events.filter(e=>e.type==='user/message').length,1);
});
test('a new turn resets historical failures and isolates other sessions',()=>{
 const f=fixture();f.closeout.recordError({agent:f.agent,args:{action:'prepare'},error:{code:'SC_RUNTIME_NOT_CONFIGURED'}});f.events.push({type:'turn/start',data:{turn:2}});const summary=record(f,plan());assert.equal(summary.turn,2);assert.deepEqual(summary.history,[]);
 const other={session:{header:{id:'another'},snapshotEvents:()=>[{type:'turn/start',data:{turn:1}}]}};const separate=f.closeout.record({agent:other,args:{action:'list'},result:{plans:[]}});assert.deepEqual(separate.candidates,[]);
});

test('the collapsed notice keeps earlier operation failures visible beside current check counts',()=>{
 const f=fixture();f.closeout.recordError({agent:f.agent,args:{action:'publish',id:'plan'},error:{code:'SC_CONFIRMATION_REQUIRED'}});record(f,plan());f.closeout.stop({agent:f.agent,turn:1,signal:new AbortController().signal});
 assert.match(f.events.at(-1).data.source.summary,/本轮历史：失败 1 \/ 跳过 0/);
});
test('append failure does not mark a closeout as durably delivered',()=>{
 const f=fixture();record(f,plan());const append=f.agent.session.append;f.agent.session.append=()=>{throw Error('storage unavailable');};assert.throws(()=>f.closeout.stop({agent:f.agent,turn:1}),/storage unavailable/);f.agent.session.append=append;f.closeout.stop({agent:f.agent,turn:1});assert.equal(f.events.filter(e=>e.type==='user/message').length,1);
});

test('presentation categories preserve blocked and not_run evidence statuses with their reasons',()=>{
 const f=fixture(),value=plan();value.validation.results[0]={kind:'syntax',category:'syntax',status:'blocked',pass:null,reason:'SC_SYNTAX_UNAVAILABLE'};const summary=record(f,value);
 assert.equal(summary.candidates[0].checks[0].status,'blocked');assert.equal(summary.candidates[0].checks[0].disposition,'skipped');assert.equal(summary.candidates[0].checks[0].reason,'SC_SYNTAX_UNAVAILABLE');assert.equal(summary.candidates[0].checks[2].status,'not_run');assert.equal(summary.candidates[0].checks[2].disposition,'not_covered');
});

test('a failed re-verification invalidates earlier evidence even when revision and digest did not change',()=>{
 const f=fixture();record(f,plan());const summary=f.closeout.recordError({agent:f.agent,args:{action:'verify',id:'plan'},error:{code:'SC_ABORTED'}});assert.equal(summary.counts.pass,0);assert.equal(summary.candidates[0].evidenceCurrent,false);assert.equal(summary.candidates[0].publishEligible,false);
});
test('a publication error cannot claim the native write did not happen',()=>{
 const f=fixture();record(f,plan());const summary=f.closeout.recordError({agent:f.agent,args:{action:'publish',id:'plan'},error:{code:'NATIVE_WRITE_FAILED'}});assert.equal(summary.candidates[0].publication,'unknown');assert.equal(summary.acceptance,'not_established');
});
