import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
const source=resolve(process.env.SEP_NATIVE_SOURCE);
const {assertRequiredDesktopEntries}=await import(pathToFileURL(join(source,'apps/desktop/src/sep-update/desktop-composition.mjs')));
const names=['@deepseek-ai/dsh-api-remotes','@deepseek-ai/dsh-plugin-manager','@deepseek-ai/dsh-client-product-analytics','@deepseek-ai/dsh-host-product-telemetry-otel','@deepseek-ai/dsh-client-ui-settings-memory'];
const valid=()=>names.map(moduleName=>({moduleName,enabled:true,fiberPhase:'active'}));
test('all fixed-profile desktop services are active',()=>assert.doesNotThrow(()=>assertRequiredDesktopEntries({entries:valid()})));
for(const phase of ['pending','failed',null])test('a missing dependency cannot pass health: '+phase,()=>{const entries=valid();entries[0].fiberPhase=phase;assert.throws(()=>assertRequiredDesktopEntries({entries}),/SEP_HEALTH_COMPOSITION/)});
test('disabled, absent, duplicate and malformed inventory are rejected',()=>{
 const disabled=valid();disabled[0].enabled=false;
 for(const snapshot of [{entries:disabled},{entries:valid().slice(1)},{entries:[...valid(),valid()[0]]},{},null])assert.throws(()=>assertRequiredDesktopEntries(snapshot),/SEP_HEALTH_COMPOSITION/);
});
test('optional user plugins are not treated as required fixed-profile entries',()=>assert.doesNotThrow(()=>assertRequiredDesktopEntries({entries:[...valid(),{moduleName:'optional-plugin',enabled:false,fiberPhase:null}]})));
