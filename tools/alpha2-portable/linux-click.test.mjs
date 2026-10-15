import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './sep-fixture.mjs';
const mod=await import('./linux-click.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
test('Linux click scope binds process birth, boot and current uid, not a reusable PID alone',async()=>{
 assert.equal(typeof mod.captureClickOwner,'function');const proof=await mod.captureClickOwner(process.pid);assert.equal(proof.pid,process.pid);assert.equal(proof.uid,process.getuid());assert.match(proof.birth,/^\d+$/);assert.match(proof.bootId,/^[a-f0-9-]{36}$/);await assert.rejects(()=>mod.validateClickOwner({...proof,birth:'0'}),{code:'SEP_LINUX_CLICK_OWNER_CHANGED'});
});
test('Linux native click refuses an unconfirmed process and never dispatches',async()=>{
 assert.equal(typeof mod.createAtspiProvider,'function');await assert.rejects(()=>mod.createAtspiProvider({pid:0}),{code:'SEP_LINUX_CLICK_OWNER_CHANGED'});
});
test('Linux click retains the actual receipt/quarantine consumer with a platform-specific description',async()=>{
 assert.equal(typeof mod.loadLinuxClick,'function');const loaded=await mod.loadLinuxClick();assert.equal(loaded.origin.sha256,'ac2a6a95741d5e99594dd01aa04be29c2218115c58deff1c6b7d23b0b260431c');assert.equal(loaded.origin.transformations.length,1);assert.equal(typeof loaded.plugin.apply,'function');
});
test('Linux default composition keeps click opt-in and raw accessibility dispatch unavailable',async()=>{
 const f=await setup();try{assert.equal(f.ctx.tools.get('suite_computer_click'),undefined);assert.equal(f.ctx.tools.get('mcp__sep_linux__ui_click'),undefined);assert.equal(f.api.status().computerClick,'disabled');}finally{await f.close();}
});
