// Test-only core counterpart of the production document/media derivation.
import {originalCore,filename,derivePendingRuntime} from './runtime-source.mjs';
import {evaluate} from '../../../document-business/derive.mjs';
const derived=derivePendingRuntime(originalCore);
export const origin=derived.receipt;
export const {name,inject,apply}=await evaluate(derived.source,filename);
