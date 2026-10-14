import test from 'node:test';import assert from 'node:assert/strict';import {Script} from 'node:vm';import {probeSettingsPage} from './desktop-probe.mjs';
test('the actual renderer envelope parses with visibility and onboarding prerequisites',async()=>{
 let observed=false;const sentinel=Error('STOP_AFTER_PARSE');
 const client={async eval(source){const match=source.match(/executeJavaScript\((.*?)\)\.then/s);assert(match);new Script(JSON.parse(match[1]));observed=true;throw sentinel;}};
 await assert.rejects(probeSettingsPage({client,windowId:1,round:1}),e=>e===sentinel);assert.equal(observed,true);
});
