import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rename,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Budget} from '../src/budget-ledger.js';
async function lost(){const root=await mkdtemp(join(tmpdir(),'sep-ledger-case-')),path=join(root,'budget.json'),b=new Budget(path,{limit:100});await b.init();await b.reserve('existing',.5);await rename(path,join(root,'retained-original.json'));return{root,path};}
// Windows has one file identity even when a restarted caller changes path casing.
test('Windows differently cased ledger read still recognizes its existing permanent guard',{skip:process.platform!=='win32'},async()=>{const f=await lost();const alias=new Budget(join(f.root,'BUDGET.JSON'),{limit:100});await assert.rejects(alias.snapshot(),{code:'BUDGET_LEDGER_MISSING'});await assert.rejects(access(f.path),{code:'ENOENT'});});
test('Windows differently cased reserve cannot recreate the missing ledger',{skip:process.platform!=='win32'},async()=>{const f=await lost();const alias=new Budget(join(f.root,'BUDGET.JSON'),{limit:100});await assert.rejects(alias.reserve('new',.1),{code:'BUDGET_LEDGER_MISSING'});await assert.rejects(access(f.path),{code:'ENOENT'});assert.equal(JSON.parse(await readFile(join(f.root,'retained-original.json'))).entries[0].id,'existing');});