import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {runIsolated} from './linux-isolation.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
async function fixture(){const root=await mkdtemp(join(process.env.SEP_BUNDLE_TEST_ROOT,'copy-'));const source=join(root,'source'),scratch=join(root,'scratch');await mkdir(source,{mode:0o700});await mkdir(scratch,{mode:0o700});await writeFile(join(source,'data.txt'),'original');return {source,scratch};}
const config={bwrap:join(process.env.SEP_PORTABLE_ROOT,'sandbox-runtime/usr/bin/bwrap'),binarySha256:process.env.SEP_BWRAP_SHA256};
const expected=hash(JSON.stringify([{path:'data.txt',kind:'file',size:8,sha256:hash('original'),executable:false}]));
test('trusted bootstrap copies the exact snapshot before task dispatch',async()=>{
 const f=await fixture();const result=await runIsolated({...config,...f,copySourceHash:expected,command:['/usr/bin/python3','-c',"assert open('/work/data.txt').read()=='original';open('/work/data.txt','w').write('copy')"]});
 assert.equal(result.code,0,result.stderr);assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');assert.equal(await readFile(join(f.scratch,'data.txt'),'utf8'),'copy');
});
test('wrong snapshot digest stops before task dispatch',async()=>{
 const f=await fixture();const result=await runIsolated({...config,...f,copySourceHash:'0'.repeat(64),command:['/usr/bin/python3','-c',"open('/work/dispatched','w').write('bad')"]});
 assert.notEqual(result.code,0);await assert.rejects(readFile(join(f.scratch,'dispatched')),{code:'ENOENT'});
});
test('explicit cancellation waits for the owned sandbox exit',async()=>{
 const f=await fixture(),abort=new AbortController();const pending=runIsolated({...config,...f,signal:abort.signal,timeoutMs:1000,command:['/usr/bin/python3','-c','import time;time.sleep(5)']});setTimeout(()=>abort.abort(),150);
 const result=await pending;assert.equal(result.reason,'cancelled');assert.equal(result.exited,true);
});
test('inherited mount descriptors cannot provide a writable alias to the source',async()=>{
 const f=await fixture();const result=await runIsolated({...config,...f,command:['/usr/bin/python3','-c',"import os\nfor name in os.listdir('/proc/self/fd'):\n try:\n  p='/proc/self/fd/'+name+'/data.txt'\n  if os.path.exists(p):open(p,'w').write('bad')\n except OSError:pass"]});
 assert.equal(result.code,0,result.stderr);assert.equal(await readFile(join(f.source,'data.txt'),'utf8'),'original');
});
