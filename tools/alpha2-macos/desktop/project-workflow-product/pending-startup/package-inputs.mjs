// Build-only successor. The original r61 runtime and ASAR/UI inputs stay intact.
import {readFile} from 'node:fs/promises';
import {EXTRA_RUNTIME as PREVIOUS_RUNTIME} from '../package-inputs.mjs';
export {BRIDGE_INPUTS,RUNTIME_REPLACEMENT,prepareProjectEdits} from '../package-inputs.mjs';
const manifest=JSON.parse(await readFile(new URL('./package-inputs.json',import.meta.url),'utf8'));
if(manifest.schema!==1||manifest.baseRuntimeCount!==76||manifest.extraRuntimeCount!==8||manifest.totalRuntimeCount!==84||manifest.files.length!==8||PREVIOUS_RUNTIME.length!==18)throw Error('SEP_PENDING_PACKAGE_INPUTS');
export const PENDING_INPUTS=Object.freeze(manifest.files.map(Object.freeze));
export const EXTRA_RUNTIME=Object.freeze([...PREVIOUS_RUNTIME,...PENDING_INPUTS.map(row=>row.target)]);
export const BUSINESS_ENTRY=manifest.businessEntry;
