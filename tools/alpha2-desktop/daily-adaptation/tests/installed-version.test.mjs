import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readInstalledSepVersion} from '../lib/installed-sep-version.mjs';
test('updater compares the enclosing bundle, never the captured child version',async()=>{
 const reads=[];
 const version=await readInstalledSepVersion('D:/synthetic',async path=>{reads.push(path);return {name:'dsh-sep-bundle',version:'0.2.1-beta.3-alpha2-adapter.1'};});
 assert.equal(version,'0.2.1-beta.3-alpha2-adapter.1');assert.equal(reads.length,1);
});
test('legacy fallback is allowed only when bundle metadata is absent',async()=>{
 let count=0;
 assert.equal(await readInstalledSepVersion('D:/synthetic',async()=>{if(!count++)throw Object.assign(Error(),{code:'ENOENT'});return {name:'dsh-system-enhancement-package',version:'0.2.1-beta.2'};}),'0.2.1-beta.2');
 await assert.rejects(readInstalledSepVersion('D:/synthetic',async()=>{throw Object.assign(Error(),{code:'EACCES'});}),{code:'EACCES'});
 for(const manifest of [null,{}, {name:'foreign',version:'1.0.0'},{name:'dsh-sep-bundle',version:'invalid'}]){
  await assert.rejects(readInstalledSepVersion('D:/synthetic',async()=>manifest));
 }
});
