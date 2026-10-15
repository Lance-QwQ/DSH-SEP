import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import vm from 'node:vm';import {setTimeout as delay} from 'node:timers/promises';
const adapter=await import('./linux-desktop-adaptation.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const input=await readFile('/opt/dsh-sep-cross-platform/alpha2-portable-desktop-inputs-r2/dsh-desktop/lib/main.js');
test('Linux native-quit adapter refuses drift and its one transformation precisely replays the official program',()=>{
 assert.equal(typeof adapter.adaptLinuxDesktopMain,'function');const {adaptLinuxDesktopMain,approvalAnchor,officialMainSha256}=adapter;
 assert.equal(createHash('sha256').update(input).digest('hex'),officialMainSha256);assert.throws(()=>adaptLinuxDesktopMain(Buffer.concat([input,Buffer.from('\n')])) ,/SEP_LINUX_DESKTOP_ORIGIN_CHANGED/);
 const result=adaptLinuxDesktopMain(input);assert.equal(result.origin.changes.length,1);assert.equal(result.origin.changes[0].from,approvalAnchor);assert.deepEqual(result.bytes,Buffer.from(input.toString().replace(approvalAnchor,result.origin.changes[0].to)));assert.equal(createHash('sha256').update(result.bytes).digest('hex'),result.origin.resultSha256);
});
test('actual derived approval branch defers destruction past Promise microtasks and rechecks superseding quit ownership',async()=>{
 assert.equal(typeof adapter.adaptLinuxDesktopMain,'function');const change=adapter.adaptLinuxDesktopMain(input).origin.changes[0];
 for(const state of [{approved:false},{approved:true},{approved:true,quitting:true},{approved:true,shellInstallerOwnsQuit:true}]){
  let finishes=0;const ctx={approved:state.approved,quitting:false,shellInstallerOwnsQuit:false,setTimeout,finishQuit:()=>finishes++};vm.runInNewContext('(function(){'+change.to+'})()',ctx);await Promise.resolve();assert.equal(finishes,0);if(state.quitting)ctx.quitting=true;if(state.shellInstallerOwnsQuit)ctx.shellInstallerOwnsQuit=true;await delay(20);assert.equal(finishes,state.approved&&!state.quitting&&!state.shellInstallerOwnsQuit?1:0);
 }
});
