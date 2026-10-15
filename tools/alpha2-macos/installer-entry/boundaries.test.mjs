import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdmission,createLineDecoder} from './boundaries.mjs';

test('a queued operation cannot dispatch after earlier accepted work quarantines ownership',async()=>{
 const q=createAdmission();let release,dispatched=false;const held=new Promise(r=>{release=r;});
 const first=q.run(async()=>{await held;q.quarantine();throw Object.assign(Error('uncertain'),{code:'SEP_INSTALLER_CLEANUP_UNCONFIRMED'});});
 const second=q.run(async()=>{dispatched=true;return 'WRONG_DISPATCH';});const caught=first.catch(e=>e.code);release();assert.equal(await caught,'SEP_INSTALLER_CLEANUP_UNCONFIRMED');await assert.rejects(second,{code:'SEP_INSTALLER_CLEANUP_UNCONFIRMED'});assert.equal(dispatched,false);
});
test('ordinary close still drains accepted work and refuses only later admission',async()=>{
 const q=createAdmission();let release;const held=new Promise(r=>{release=r;});const a=q.run(()=>held),b=q.run(()=>42),closed=q.closeAdmission();await assert.rejects(q.run(()=>0),{code:'SEP_INSTALLER_CLOSED'});release('done');assert.equal(await a,'done');assert.equal(await b,42);await closed;
});
test('valid UTF8 account names survive every possible chunk split',()=>{
 const text=JSON.stringify({home:'/Users/测试用户/中文'})+'\n',bytes=Buffer.from(text);
 for(let at=1;at<bytes.length;at++){const decoder=createLineDecoder(1024);const rows=[...decoder.push(bytes.subarray(0,at)),...decoder.push(bytes.subarray(at))];assert.deepEqual(rows,[text.slice(0,-1)],'split '+at);}
});
test('malformed UTF8 is a protocol error instead of replacement-character path mutation',()=>{
 const decoder=createLineDecoder(1024);assert.throws(()=>decoder.push(Buffer.from([0x7b,0xc0,0xaf,0x7d,10])),{code:'SEP_INSTALLER_PROTOCOL'});
});
test('frame limits apply to bytes before decoding and include the incomplete tail',()=>{
 const decoder=createLineDecoder(4);assert.deepEqual(decoder.push(Buffer.from('ab')),[]);assert.throws(()=>decoder.push(Buffer.from('cde')),{code:'SEP_INSTALLER_PROTOCOL'});
});
