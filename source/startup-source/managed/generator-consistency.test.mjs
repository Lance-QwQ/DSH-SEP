import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {guardianLifecycleTransform} from './guardian-lifecycle-transform.mjs';
const work=resolve(import.meta.dirname,'..'),project=resolve(work,'../..');
const base=await readFile(join(project,'dsh-daily/releases/sep-alpha2-updatefix-20260924/store/p0500/src/guardian.mjs'),'utf8');
const final=await readFile(join(work,'core/overlay/p0500/src/guardian.mjs'),'utf8');
const generated=guardianLifecycleTransform(base);
function section(text,start,end){const a=text.indexOf(start);assert.ok(a>=0);const b=text.indexOf(end,a+start.length);assert.ok(b>a);return text.slice(a,b);}
test('generator emits byte-identical manual-start and spawn-observer blocks to sealed core',()=>{
 assert.equal(section(generated,'    async function start(', '    async function stop()'),section(final,'    async function start(', '    async function stop()'));
 assert.equal(section(generated,'      }, readinessTimeoutMs);','    async function start('),section(final,'      }, readinessTimeoutMs);','    async function start('));
 assert.equal(section(generated,'  for (const key of [','  // No prerequisite callback'),section(final,'  for (const key of [','  // No prerequisite callback'));
});
test('generator refuses drift or accidental second application',()=>{assert.throws(()=>guardianLifecycleTransform(generated),/GUARDIAN_LIFECYCLE_BUILD_ANCHOR_CHANGED/);});
