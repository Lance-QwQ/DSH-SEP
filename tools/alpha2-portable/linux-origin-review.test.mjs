import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {hash} from './project-tree.mjs';
const mod=await import('./context-origin.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const tracked=await readFile(new URL('./review-inputs/tracked-context.mjs',import.meta.url),'utf8');
test('tracked context source replays the exact Alpha.2 workingDirectory migration',()=>{assert.equal(typeof mod.alpha2ContextSource,'function');assert.equal(hash(tracked),'110c74099985b81caf70a285ecd9662a8f7ae0cf8902437ceb131fcbb4ceff29');const result=mod.alpha2ContextSource(tracked);assert.equal(hash(result),'32364edece8f70a972d784c051b6da256c2ab3cb074232be078fec551928a1de');assert.equal(result.includes('session.header.cwd'),false);assert.equal(result.split("ctx.get('workingDirectory').get(session)").length,4);});
test('already captured Alpha.2 context bytes are preserved and unrelated bytes are refused',()=>{assert.equal(typeof mod.alpha2ContextSource,'function');const derived=mod.alpha2ContextSource(tracked);assert.equal(mod.alpha2ContextSource(derived),derived);assert.throws(()=>mod.alpha2ContextSource(tracked+'\n'),/SEP_LINUX_CONTEXT_ORIGIN_CHANGED/);});
