import assert from 'node:assert/strict';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
export function verifyFreshComposition(snapshot,releaseRoot){
 assert(Array.isArray(snapshot?.entries));
 assert(isAbsolute(releaseRoot));
 const settings=pathToFileURL(join(releaseRoot,'node_modules/dsh-sep-bundle/bundle/modules/ui-settings-memory/lib/index.js')).href;
 const rowsVerified=[];
 // New public fresh Profile disables product-analytics and desktop-product-
 // telemetry in installer/daily-profile.mjs. The old desktop empty-health
 // helper checks a different profile and remains unmodified in the product.
 // Source: preset web-app entries plus native-settings-ui.js tree.create.
 // Cross-checked against actual inventory-diagnostic-r1, including full IDs.
 for(const [entryId,moduleName,enabled] of [
  ['include:api-remotes','@deepseek-ai/dsh-api-remotes',true],
  ['include:plugin-manager','@deepseek-ai/dsh-plugin-manager',true],
  ['sep-daily-controlled-root:sep-native-settings',settings,true],
  ['include:product-analytics','@deepseek-ai/dsh-client-product-analytics',false],
  ['include:desktop-product-telemetry','@deepseek-ai/dsh-host-product-telemetry-otel',false],
 ]){
  const rows=snapshot.entries.filter(row=>row?.moduleName===moduleName);
  assert.equal(rows.length,1,moduleName);assert.equal(rows[0].enabled,enabled,moduleName);
  assert.equal(rows[0].entryId,entryId,moduleName);
  assert.equal(rows[0].fiberPhase,enabled?'active':null,moduleName);
  rowsVerified.push({entryId,moduleName,enabled,fiberPhase:rows[0].fiberPhase});
 }
 return rowsVerified;
}
