import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {join} from 'node:path';import {portableShim} from './portable-shims.mjs';
const root=process.env.SEP_SHIM_ROOT;assert(root);
for(const kind of ['cmd','sh'])test(kind+' removes only development NODE_PATH and source comment',async()=>{for(const name of ['pn','pnpm','pnpx','pnx']){const source=await readFile(join(root,name+(kind==='cmd'?'.CMD':'')),'utf8'),out=portableShim(source,kind);assert.doesNotMatch(out,/AIData|\/mnt\/d|NODE_PATH/);const tail=source.slice(source.indexOf(kind==='cmd'?'@IF EXIST':'if [ -n "$exe" ]'));assert.equal(out.slice(out.indexOf(kind==='cmd'?'@IF EXIST':'if [ -n "$exe" ]')),tail.replace(/^# cmd-shim-target=.*\r?\n?/mg,''));}});
test('unknown formats refuse',()=>{for(const kind of ['cmd','sh'])assert.throws(()=>portableShim('arbitrary local reference',kind),{code:'SHIM_TEMPLATE_CHANGED'});});
