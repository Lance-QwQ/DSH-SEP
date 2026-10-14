import test from 'node:test';import assert from 'node:assert/strict';import {Script} from 'node:vm';import {probeSettingsPage} from './desktop-probe.mjs';
test('the actual renderer envelope parses with visibility and onboarding prerequisites',async()=>{
 let observed=false;const sentinel=Error('STOP_AFTER_PARSE');
 const client={async eval(source){const match=source.match(/executeJavaScript\((.*?)\)\.then/s);assert(match);new Script(JSON.parse(match[1]));observed=true;throw sentinel;}};
 await assert.rejects(probeSettingsPage({client,windowId:1,round:1}),e=>e===sentinel);assert.equal(observed,true);
});
test('actual entry action with structural instrumentation is valid renderer JavaScript',async()=>{
 let nonce,parsed=0,entryParsed=false;const sentinel=Error('STOP_AFTER_ENTRY_PARSE');
 const client={async eval(source){if(source==='__sepFullProbe.settingsDom')return {nonce,status:'pass',value:parsed===1?{snapshot:{timeOrigin:1}}:{kind:'none',action:null}};const match=source.match(/executeJavaScript\((.*?)\)\.then/s);assert(match);nonce=JSON.parse(source.match(/nonce:("[^"]+")/)[1]);const renderer=JSON.parse(match[1]);new Script(renderer);parsed++;if(renderer.includes("trace('sample','direct-before')")){entryParsed=true;throw sentinel;}return true;}};
 await assert.rejects(probeSettingsPage({client,windowId:1,round:1}),e=>e===sentinel);assert(entryParsed);assert(parsed>=3);
});
