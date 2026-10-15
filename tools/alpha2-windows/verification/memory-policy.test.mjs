import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyFreshMemoryPolicy} from './memory-policy.mjs';
const fixture=()=>({controls:{capture:true,recall:true},configured:{capture:false,recall:true},effective:{capture:false,recall:true}});
test('fresh saved controls, configured policy and effective policy are distinct and all verified',()=>assert.doesNotThrow(()=>verifyFreshMemoryPolicy(fixture())));
test('rejects configured capture enabled even when effective claims disabled',()=>{const f=fixture();f.configured.capture=true;assert.throws(()=>verifyFreshMemoryPolicy(f));});
test('rejects effective capture enabled',()=>{const f=fixture();f.effective.capture=true;assert.throws(()=>verifyFreshMemoryPolicy(f));});
test('rejects unexpected stored defaults and any disabled recall layer',()=>{for(const [layer,key]of [['controls','capture'],['controls','recall'],['configured','recall'],['effective','recall']]){const f=fixture();f[layer][key]=false;assert.throws(()=>verifyFreshMemoryPolicy(f));}});
