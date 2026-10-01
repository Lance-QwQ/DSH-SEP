import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
const ledgerUrl=process.env.BUDGET_CONTINUITY_MODULE?pathToFileURL(process.env.BUDGET_CONTINUITY_MODULE).href:new URL('../src/budget-ledger.js',import.meta.url).href;
const {Budget}=await import(ledgerUrl),exec=promisify(execFile);
async function fixture(){const root=await mkdtemp(join(tmpdir(),'sep-ledger-publish-'));return{root,path:join(root,'budget.json')};}
// An unrelated writer's observed bytes must not be silently replaced by our stale state.
test('publication refuses externally replaced ledger bytes and retains the observed replacement',async()=>{const f=await fixture(),b=new Budget(f.path,{limit:100});await b.init();await b.reserve('original',.4);const original=JSON.parse(await readFile(f.path)),external=Buffer.from(JSON.stringify({...original,initialSpent:.3}));await assert.rejects(b.change(async s=>{s.initialSpent=.1;await writeFile(f.path,external);}),{code:'BUDGET_LEDGER_CHANGED'});assert.deepEqual(await readFile(f.path),external);});
// A durable temp file and prior guard are evidence of an attempted first initialization.
test('process exit after temp sync before first rename cannot silently create a fresh ledger on restart',async()=>{const f=await fixture();await assert.rejects(exec(process.execPath,['--input-type=module','-e',`import {Budget} from ${JSON.stringify(ledgerUrl)};const b=new Budget(process.argv[1],{limit:100});await b.change(s=>{s.initialSpent=.4;},{beforeCommit:()=>process.exit(17)});`,f.path],{env:process.env,timeout:20000,windowsHide:true}),e=>e.code===17);const retained=await readdir(f.root);assert.ok(retained.some(n=>n.endsWith('.tmp')));await assert.rejects(new Budget(f.path,{limit:100}).init(),{code:'BUDGET_LEDGER_MISSING'});await assert.rejects(access(f.path),{code:'ENOENT'});});