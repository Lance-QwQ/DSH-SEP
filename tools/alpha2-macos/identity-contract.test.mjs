// Portable contract checks only; these do not pretend to execute Darwin APIs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyPosixOwner,validPosixIdentity} from './captured/owner-posix.mjs';
const proof={schema:2,platform:'darwin',pid:123,bootId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',namespace:'host',birth:'Wed Oct 14 10:00:00 2026'};
const owner={pid:123,sepOwner:proof};
test('Darwin same boot and recorded birth remains alive',()=>assert.equal(classifyPosixOwner(owner,{...proof,state:'alive'}),'alive'));
test('Darwin changed process birth is stale',()=>assert.equal(classifyPosixOwner(owner,{...proof,state:'alive',birth:'Wed Oct 14 10:00:01 2026'}),'stale'));
test('Darwin changed boot is stale',()=>assert.equal(classifyPosixOwner(owner,{...proof,state:'alive',bootId:'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'}),'stale'));
test('Darwin absent process with a valid current scope is stale',()=>assert.equal(classifyPosixOwner(owner,{platform:'darwin',bootId:proof.bootId,namespace:'host',state:'absent'}),'stale'));
test('Permission or incomplete observation remains unknown',()=>assert.equal(classifyPosixOwner(owner,{...proof,state:'unknown'}),'unknown'));
test('Missing prior process proof remains unknown',()=>assert.equal(classifyPosixOwner({pid:123},{...proof,state:'alive'}),'unknown'));
test('Different platform scope cannot retire a Darwin owner',()=>assert.equal(classifyPosixOwner(owner,{...proof,state:'alive',platform:'linux',namespace:'pid:[42]',birth:'12345'}),'unknown'));
test('Invalid or reused namespace does not become absence',()=>assert.equal(classifyPosixOwner(owner,{...proof,state:'absent',namespace:'other'}),'unknown'));
test('Malformed birth is rejected',()=>assert.equal(validPosixIdentity({...proof,birth:'yesterday'},123),false));
