import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {deriveCarrier} from './carrier-origin.mjs';
const root=process.env.SEP_MAC_OFFICIAL_SOURCE;
assert(root,'SEP_MAC_OFFICIAL_SOURCE is required');
const source=async p=>readFile(join(root,p));
test('unsigned carrier gets a separate BundleID',async()=>{
 const p='apps/desktop/scripts/desktop-package-environment.mjs';
 const r=deriveCarrier(p,await source(p));assert.match(r.bytes.toString(),/DSH_DESKTOP_APP_ID: 'ai\.dshsep\.alpha2\.preview'/);
});
test('carrier package and protocol names are independent',async()=>{
 const p='apps/desktop/scripts/electron-builder-config.mjs';
 const r=deriveCarrier(p,await source(p));assert.match(r.bytes.toString(),/productName: 'DSH SEP'/);assert.match(r.bytes.toString(),/schemes: \['dsh-sep'\]/);
});
test('runtime identity separates home, settings, logs and deep links',async()=>{
 const p='apps/desktop/src/main.ts';const r=deriveCarrier(p,await source(p));
 assert.match(r.bytes.toString(),/app\.setName\('DSH SEP'\)/);assert.match(r.bytes.toString(),/process\.env\.DSH_HOME = join\(sepDataRoot, 'home'\)/);
 assert.match(r.bytes.toString(),/setAsDefaultProtocolClient\('dsh-sep'\)/);assert.doesNotMatch(r.bytes.toString(),/'dsh:\/\/open/);
});
test('runtime smoke follows renamed Mac app and executable',async()=>{
 const p='apps/desktop/scripts/smoke-packaged-runtime.ts';const r=deriveCarrier(p,await source(p));
 assert.match(r.bytes.toString(),/'DSH SEP\.app'/);assert.match(r.bytes.toString(),/'MacOS', 'DSH SEP'/);
});
test('source tampering is refused before transformations',async()=>{
 const p='apps/desktop/src/main.ts';assert.throws(()=>deriveCarrier(p,Buffer.concat([Buffer.from('// tamper\n'),Buffer.from('data')])),/SEP_MAC_CARRIER_ORIGIN_CHANGED/);
});
test('undeclared source path is refused',()=>assert.throws(()=>deriveCarrier('../main.ts',Buffer.from('data')),/SEP_MAC_CARRIER_SOURCE_UNKNOWN/));
