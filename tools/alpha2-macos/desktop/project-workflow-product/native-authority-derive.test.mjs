import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {deriveNativeAuthority} from './derive-native-authority.mjs';
test('authority successor exactly replays pinned old probe and refuses different old bytes',async()=>{
 const source={};for(const name of ['data','worker','operator'])source[name]=await readFile(new URL('./native-'+name+'.mjs',import.meta.url),'utf8');
 const r=deriveNativeAuthority(source);for(const [name,text]of Object.entries(r.outputs))assert.equal(await readFile(new URL('./native-'+name+'-r2.mjs',import.meta.url),'utf8'),text);
 assert.deepEqual(JSON.parse(await readFile(new URL('./NATIVE-AUTHORITY-ORIGIN.json',import.meta.url))).origin,r.origin);
 for(const name of ['data','worker','operator'])assert.throws(()=>deriveNativeAuthority({...source,[name]:source[name]+'\n'}),{code:'SEP_PROJECT_NATIVE_AUTHORITY_ORIGIN'});
});
