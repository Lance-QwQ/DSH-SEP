import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrustedParser} from './trusted-parser.mjs';
import {validateInput,buildPolicy} from './parser-contract.mjs';
import {validateInput as genericInput} from '../task-sandbox/task-contract.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('parser rejects unrecognized configuration before dispatch',async()=>{await assert.rejects(createTrustedParser({shell:true}),{code:'SEP_MAC_PARSER_CONFIG'});});
test('parser does not accept arbitrary executable modes as parser kinds',async()=>{await assert.rejects(createTrustedParser({kind:'shell'}),{code:'SEP_MAC_PARSER_CONFIG'});});
test('parser rejects absent ownership IO before attempting a platform launch',async()=>{await assert.rejects(createTrustedParser({kind:'context-python'}),{code:'SEP_MAC_PARSER_CONFIG'});});
test('large trusted-parser transport does not widen general task limits or permit process families',()=>{assert.throws(()=>genericInput({stdin:'x'.repeat(65537)}),{code:'SEP_MAC_TASK_INPUT'});assert.equal(validateInput({stdin:'x'.repeat(200000)}).stdin.length,200000);assert.throws(()=>validateInput({mode:'family'}),{code:'SEP_MAC_PARSER_INPUT'});assert.throws(()=>validateInput({stdin:'x'.repeat(12582913)}),{code:'SEP_MAC_PARSER_INPUT'});assert.throws(()=>validateInput({timeoutMs:15001}),{code:'SEP_MAC_PARSER_INPUT'});});
test('Node path resolution receives ancestor metadata without ancestor content access',()=>{
 const policy=buildPolicy({runtimeRoot:'/Users/test/app/runtime',workRoot:'/Users/test/work/request',executable:'/Users/test/app/runtime/node'},'single');
 const metadata=policy.split('\n').filter(line=>line.startsWith('(allow file-read-metadata '));assert.equal(metadata.length,1);
 for(const path of ['/Users','/Users/test','/Users/test/app','/Users/test/work'])assert(metadata[0].includes(`(literal "${path}")`));
 assert(!metadata[0].includes('subpath'));assert(!policy.includes('(subpath "/Users")'));assert(!policy.includes('(subpath "/Users/test")'));
});
test('parser derivative is exactly replayable from unchanged generic task sources',async()=>{const hash=x=>createHash('sha256').update(x).digest('hex'),origin=JSON.parse(await readFile(new URL('./origin.json',import.meta.url)));for(const row of origin.derivations){let source=await readFile(new URL('../task-sandbox/'+row.source,import.meta.url),'utf8');assert.equal(hash(source),row.sha256);for(const [before,after]of row.changes){assert.equal(source.split(before).length,2);source=source.replace(before,after);}for(const t of row.replaceAll){assert.equal(source.split(t.before).length-1,t.count);source=source.replaceAll(t.before,t.after);}assert.equal(hash(source),row.resultSha256);assert.equal(source,await readFile(new URL('./'+row.target,import.meta.url),'utf8'));}});
