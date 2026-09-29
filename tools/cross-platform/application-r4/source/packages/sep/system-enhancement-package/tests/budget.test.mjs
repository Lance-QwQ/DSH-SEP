import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Budget,callDeepSeek} from '../src/deepseek.js';
import * as DeepSeek from '../src/deepseek.js';

test('ledger replacement tolerates transient Windows file locks without repeating the model request',async()=>{
  assert.equal(typeof DeepSeek.replaceLedgerFile,'function');
  const b=await budget();const temp=`${b.path}.synthetic-tmp`;
  await writeFile(b.path,'old');await writeFile(temp,'new settled ledger');let attempts=0;
  await DeepSeek.replaceLedgerFile(temp,b.path,async(from,to)=>{if(++attempts<3)throw Object.assign(Error('Synthetic scanner lock'),{code:'EPERM'});return rename(from,to);});
  assert.equal(await readFile(b.path,'utf8'),'new settled ledger');assert.equal(attempts,3);
  let denied=0;
  await assert.rejects(DeepSeek.replaceLedgerFile(temp,b.path,async()=>{denied++;throw Object.assign(Error('Denied'),{code:'EACCES'});}),/Denied/);
  assert.equal(denied,1);
});

async function budget(limit=1){await mkdir('.test-home',{recursive:true});const root=await mkdtemp(resolve('.test-home/budget-'));return new Budget(join(root,'usage.json'),{limit,initialSpent:0.000594});}
const request={model:'deepseek-v4-flash',messages:[{role:'user',content:'synthetic'}],max_tokens:128};
const key=async()=>({value:'synthetic-test-key'});
test('parallel callers share durable reservations and cannot overspend',async()=>{
  const b=await budget(0.1);await b.init();
  const results=await Promise.allSettled([b.reserve('a',0.06),b.reserve('b',0.06)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await b.snapshot()).entries.length,1);
  const reload=new Budget(b.path,{limit:100,initialSpent:0});await reload.init();
  assert.equal((await reload.snapshot()).limit,0.1); // reopening cannot silently reset/increase cap
});
test('unconfigured keys, unapproved models and oversized inputs never dispatch',async()=>{
  const b=await budget();let sends=0;const transport=async()=>{sends++;throw Error('unexpected');};
  await assert.rejects(callDeepSeek({...request,model:'other-vendor'}, {budget:b,resolveKey:key,transport}),/MODEL_NOT_ALLOWED/);
  await assert.rejects(callDeepSeek(request,{budget:b,resolveKey:async()=>undefined,transport}),/CREDENTIAL_UNCONFIGURED/);
  await assert.rejects(callDeepSeek({...request,messages:[{role:'user',content:'x'.repeat(100001)}]},{budget:b,resolveKey:key,transport}),/INPUT_TOO_LARGE/);
  assert.equal(sends,0);
});
test('successful calls settle from bounded usage without storing secrets or messages',async()=>{
  const b=await budget();
  const transport=async(url,options)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(options.redirect,'error');return new Response(JSON.stringify({model:request.model,choices:[{finish_reason:'stop',message:{content:'answer'}}],usage:{prompt_tokens:20,completion_tokens:3}}));};
  const result=await callDeepSeek(request,{budget:b,resolveKey:key,transport});
  assert.equal(result.text,'answer');
  const snapshot=await b.snapshot();assert.equal(snapshot.entries[0].status,'settled');
  assert.equal(snapshot.entries[0].chargeCeilingCny,0.000064);
  const raw=await readFile(b.path,'utf8');assert.doesNotMatch(raw,/synthetic-test-key|synthetic|answer/);
});
test('unknown network outcomes retain reservation and no automatic retry occurs',async()=>{
  const b=await budget();let sends=0;
  await assert.rejects(callDeepSeek(request,{budget:b,resolveKey:key,transport:async()=>{sends++;throw Error('socket lost');}}),/PROVIDER_FAILED/);
  assert.equal(sends,1);assert.equal((await b.snapshot()).entries[0].status,'reserved');
});
test('invalid usage or empty responses cannot be success',async()=>{
  const b=await budget();
  await assert.rejects(callDeepSeek(request,{budget:b,resolveKey:key,transport:async()=>new Response(JSON.stringify({choices:[{message:{content:''}}]}))}),/INVALID_PROVIDER_RESPONSE/);
  assert.equal((await b.snapshot()).entries[0].status,'reserved');
});
