import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyMemoryProject} from './memory-identity.mjs';

const project={id:'90a9800b-17e3-4051-8998-b7c33c7d7f7d',root:'D:\\isolated-instance\\workspace'};
const key='660ceb5cea24394190053bcbd9022efad024fdb2526ccce1e395263a3e8bbcab';
const fixture=()=>({memory:{available:true,projects:[{id:key,root:project.root}]},authority:{id:project.id,root:project.root,memoryKey:key,state:'ready'}});

test('uses the authoritative memoryKey, which is distinct from the registered project UUID',()=>{const f=fixture();assert.equal(verifyMemoryProject(f.memory,f.authority,project),key);});
test('rejects a different valid-looking hash rather than accepting any 64 hex ID',()=>{const f=fixture();f.memory.projects[0].id='a'.repeat(64);assert.throws(()=>verifyMemoryProject(f.memory,f.authority,project));});
test('rejects an authority for a different project UUID',()=>{const f=fixture();f.authority.id='42200993-864f-4c2d-80ab-e441c2281558';assert.throws(()=>verifyMemoryProject(f.memory,f.authority,project));});
test('rejects a memory listing rooted outside the registered project',()=>{const f=fixture();f.memory.projects[0].root='D:\\other-instance\\workspace';assert.throws(()=>verifyMemoryProject(f.memory,f.authority,project));});
test('rejects an authority rooted outside the registered project',()=>{const f=fixture();f.authority.root='D:\\other-instance\\workspace';assert.throws(()=>verifyMemoryProject(f.memory,f.authority,project));});
test('rejects unavailable or ambiguous settings lists',()=>{for(const change of [f=>{f.memory.available=false;},f=>{f.memory.projects.push({...f.memory.projects[0]});}]){const f=fixture();change(f);assert.throws(()=>verifyMemoryProject(f.memory,f.authority,project));}});
