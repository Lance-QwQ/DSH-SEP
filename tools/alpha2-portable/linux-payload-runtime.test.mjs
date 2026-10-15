import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {fixture} from './transaction-fixtures.mjs';
const runtime=await import('./linux-payload-runtime.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
test('assembled payload really creates a protected work copy using its shipped helper, without source writes or test harnesses',async()=>{
 assert.equal(typeof runtime.copyPayloadRuntime,'function');const f=await fixture(),destination=join(f.base,'runtime'),scratch=join(f.base,'scratch');await runtime.copyPayloadRuntime(fileURLToPath(new URL('.',import.meta.url)),destination);await mkdir(scratch,{mode:0o700});
 const {runIsolated}=await import(pathToFileURL(join(destination,'linux-isolation.mjs'))),{tree}=await import(pathToFileURL(join(destination,'project-tree.mjs')));
 const result=await runIsolated({...f.isolation,source:f.source,scratch,copySourceHash:(await tree(f.source)).sha256,command:['/usr/bin/sh','-c','printf packaged > data.txt'],timeoutMs:3000});assert.equal(result.code,0,result.stderr);assert.equal(await readFile(join(scratch,'data.txt'),'utf8'),'packaged');assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');await assert.rejects(access(join(destination,'linux-document-worker.mjs')),{code:'ENOENT'});
});
